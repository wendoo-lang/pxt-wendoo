/*
 * Runs the registration selftest through the MakeCode VM extension on every
 * pinned target checkout.
 *
 * For each target: provision it, generate the selftest project and the three
 * pack extensions it depends on, build the project JS-only, capture its run,
 * and hold the capture to the contract below.
 *
 * The capture must carry, in any order:
 * - one `CHECK <name> ok` line per name in `EXPECTED_CHECKS`, and no other
 *   check line;
 * - one `DIAG registration <code> <name> ...` line per entry in
 *   `EXPECTED_DIAGNOSTICS`, and no other;
 * - one `wendoo program-rejected <code> <id>` line per entry in
 *   `EXPECTED_REJECTIONS`, in that order, and no other;
 * - `TRACE <line>` lines whose lines, in order, are the reference VM's trace
 *   of the same program over the same schedule, `selftest/ringer.trace`,
 *   byte for byte;
 * - one `wendoo WENDOO_ASSET_UNRESOLVED <kind> <id>` line per entry in
 *   `EXPECTED_ASSET_LINES`, in that order, and no other;
 * - one `wendoo program-faulted <code> <id>` line per entry in
 *   `EXPECTED_FAULT_LINES`, in that order, and no other;
 * - one `CATALOG <payload>` line whose payload is printable-ASCII JSON whose
 *   structural listing is `EXPECTED_CATALOG_STRUCTURE`, and which is, as
 *   JSON, the registration catalog fixture; and, across the runs of one
 *   target, byte-identical payloads;
 * - `CHECKS failed 0`, and the run's `SIMCAP PASS` verdict, which the program
 *   only reaches by surviving every diagnostic.
 *
 * On an Arcade target it also builds and captures the arcade selftest
 * project, whose capture must carry one `CHECK <name> ok` line per name in
 * `EXPECTED_ARCADE_CHECKS` and no other check line, the program refusals in
 * `EXPECTED_ARCADE_REJECTIONS` in that order, the program-update lines in
 * `EXPECTED_ARCADE_UPDATE_LINES` in that order and no other, the
 * unresolved-asset lines in `EXPECTED_ARCADE_ASSET_LINES` in that order and
 * no other, the unresolved-brain lines in `EXPECTED_ARCADE_BRAIN_LINES` in
 * that order and no other, the unusable move-smoothing lines in
 * `EXPECTED_ARCADE_SMOOTHING_LINES` in that order and no other, the
 * unusable score lines in `EXPECTED_ARCADE_SCORE_LINES` in that order and no
 * other, the brain variable lines in `EXPECTED_ARCADE_VARIABLE_LINES` in that
 * order and no other, no unusable effect or sound line, no
 * program-fault line, a `DEBUG ON` line no line the Wendoo extensions log precedes,
 * `CHECKS failed 0`, its `SIMCAP PASS` verdict, and exactly two
 * messages on the simulator extension's channel: the startup ping, then one
 * catalog whose payload is printable-ASCII JSON whose structural listing is
 * `EXPECTED_ARCADE_CATALOG_STRUCTURE`, which is, as JSON, the arcade catalog
 * fixture, its types, accessors, tiles, modifier
 * slots, core tile icon entries and core type icon entries carrying icons,
 * and every icon it carries a 16 by 16 image with at least one pixel drawn.
 *
 * It then builds and captures each arcade ending project, whose capture must
 * carry one `CHECK <name> ok` line per name its ending lists in
 * `EXPECTED_ARCADE_ENDING_CHECKS` and no other check line, the program
 * refusals in `ARCADE_HOST_REJECTIONS` in that order, the unusable effect and
 * sound lines its ending lists in `EXPECTED_ARCADE_ENDING_CHOICE_LINES` in
 * that order and no other, no program-fault line, a `DEBUG ON` line no line
 * the Wendoo extensions log precedes, `CHECKS failed 0`, and its `SIMCAP
 * PASS` verdict.
 *
 * Before any target runs, each catalog fixture -- the full catalog the
 * editor's golden-program tooling reads as a session catalog -- must have its
 * catalog's structural listing.
 *
 * Usage: node selftest.js [--runs 2] [--skip-build]
 */
const fs = require("fs");
const path = require("path");
const util = require("util");
const { spawnSync } = require("child_process");

const capture = require("./capture");
const catalog = require("./catalog");
const gen = require("./gen-selftest");
const { provision } = require("./provision");

/** Every check the selftest is expected to report, and to report as holding. */
const EXPECTED_CHECKS = [
  "debug-logging-defaults-off",
  "beacon-pack-registered-before-drain",
  "chime-pack-registered-before-drain",
  "duplicate-name-diagnosed-once",
  "duplicate-name-diagnostic-names-both-packs",
  "duplicate-name-earlier-registration-stands",
  "unmapped-name-diagnosed",
  "unmapped-name-left-unbound",
  "field-writes-unbound-warned",
  "warned-type-still-registered",
  "type-field-read-through-mapped-id",
  "type-field-read-through-unmapped-id",
  "operator-registered",
  "operator-computes",
  "late-registration-diagnosed",
  "late-registration-not-bound",
  "late-core-tile-icon-diagnosed",
  "late-core-type-icon-diagnosed",
  "action-output-readable-by-name",
  "action-output-core-typed-readable-by-name",
  "rule-context-get-variable-reads-up-the-rule-chain",
  "rule-context-set-variable-writes-the-running-rule-alone",
  "brain-context-variables-read-and-write-by-name",
  "catalog-serialize-repeatable",
  "slot-builders-carry-labels",
  "language-builders-carry-words",
  "accessor-builder-carries-metadata-and-sensor-flags-default-off",
  "literal-builders-carry-key-label-and-field-values-and-type-meta-declares-none",
  "compiled-brains-registered-in-order",
  "compiled-brain-ids-and-names-intact",
  "compiled-brain-declarations-bound-by-id",
  "loader-accepts-sts-f64-program",
  "loader-accepts-empty-program",
  "loader-refuses-foreign-profile",
  "loader-refuses-superseded-format",
  "loader-loads-every-registration",
  "host-starts-nothing-before-drain",
  "host-pairs-each-actor-with-its-program",
  "host-reports-refused-programs-by-code",
  "host-thinks-each-running-program-once-per-drain",
  "host-replaces-an-actors-program",
  "host-ends-an-ended-actors-program",
  "a-faulting-program-reports-every-fault-to-its-hosts-observer-with-its-code-message-and-site",
  "a-throwing-tile-faults-its-fiber-and-every-drain-runs-on",
  "a-throwing-page-hook-faults-its-program-and-every-drain-runs-on",
  "a-page-hook-throwing-on-a-page-switch-faults-its-program-and-every-drain-runs-on",
  "a-page-whose-first-hook-throws-runs-its-later-hooks-and-its-rules",
  "a-throwing-async-tile-faults-its-fiber-and-every-drain-runs-on",
  "a-throwing-async-tile-frees-its-handle",
  "timer-switches-each-page-in-turn",
  "timer-restarts-when-its-page-is-entered-again",
  "timer-defaults-to-one-second-and-refuses-what-is-no-number",
  "random-reads-numbers-from-zero-up-to-one",
  "random-reads-the-stream-it-is-registered-with",
  "call-spec-well-formed-tiles-registered",
  "call-spec-rejects-default-and-derived",
  "call-spec-rejects-required-with-default",
  "call-spec-rejects-required-with-derived",
  "call-spec-rejects-range-without-bounds",
  "call-spec-rejects-inverted-range",
  "call-spec-rejects-range-on-non-numeric-default",
  "call-spec-rejects-duplicate-name",
  "call-spec-checks-names-before-slots",
  "call-spec-tile-fills-two-named-slots",
  "type-layout-from-manifest",
  "golden-program-runs",
  "asset-type-takes-its-atom-and-field-from-the-manifest",
  "asset-type-reads-the-asset-id-of-its-own-values",
];

/**
 * Every unresolved-asset line the selftest is expected to log, in order,
 * each without its `wendoo ` prefix: one per asset id it reports unresolved,
 * however many times it reports it.
 */
const EXPECTED_ASSET_LINES = ["WENDOO_ASSET_UNRESOLVED tune gone", "WENDOO_ASSET_UNRESOLVED tune lost"];

/**
 * Every refusal one program host is expected to log, as `<code> <id>`, in
 * order, at its first drain: the programs the brains module declares for a
 * superseded format and for a foreign device profile.
 */
const HOST_REJECTIONS = [
  "WENDOO_BINARY_CODEC_UNSUPPORTED_FORMAT_VERSION staleFormat00001",
  "WENDOO_BINARY_CODEC_UNSUPPORTED_DEVICE_PROFILE wrongProfile0001",
];

/**
 * Every refusal the selftest is expected to log, in order: its program host
 * check's host, the hosts of its six hosted fault checks, the host of its
 * timer check, then the host the pack-tile program is traced on.
 */
const EXPECTED_REJECTIONS = [
  ...HOST_REJECTIONS,
  ...HOST_REJECTIONS,
  ...HOST_REJECTIONS,
  ...HOST_REJECTIONS,
  ...HOST_REJECTIONS,
  ...HOST_REJECTIONS,
  ...HOST_REJECTIONS,
  ...HOST_REJECTIONS,
  ...HOST_REJECTIONS,
];

/**
 * Every program-fault line the selftest is expected to log, in order, each
 * without its `wendoo ` prefix: one per fault code per running program,
 * however many times the program raises it -- the pack-tile program whose
 * tile faults `HostError` (3) at every think, then the one whose tile
 * throws at every think, the one whose page-activation hook throws as it
 * starts, the two-page program whose second page's hook throws as it
 * switches to that page, the ring-and-toll program whose first
 * page-activation hook throws as it starts, and the same program whose
 * asynchronous tile throws at every think, each faulting `ScriptError` (4).
 */
const EXPECTED_FAULT_LINES = [
  "program-faulted 3 ringerRingerRing",
  "program-faulted 4 ringerRingerRing",
  "program-faulted 4 ringerRingerRing",
  "program-faulted 4 pealerPealerPeal",
  "program-faulted 4 tollerTollerToll",
  "program-faulted 4 tollerTollerToll",
];

/** The prefix of the line the VM extension logs for a fault code a running program raises. */
const FAULT_LINE_PREFIX = "wendoo program-faulted ";

/** The reference VM's trace of the pack-tile program over the selftest's schedule, rendered by the editor's tooling. */
const EXPECTED_TRACE = fs.readFileSync(path.join(__dirname, "selftest", "ringer.trace"), "utf8");

/** Every registration diagnostic the run is expected to record, as `<code> <name>`. */
const EXPECTED_DIAGNOSTICS = [
  "registration-arg-default-and-derived actuator.grammar.default-and-derived",
  "registration-arg-required-with-empty-meaning actuator.grammar.required-with-default",
  "registration-arg-required-with-empty-meaning actuator.grammar.required-with-derived",
  "registration-arg-range-unbounded actuator.grammar.range-unbounded",
  "registration-arg-range-inverted actuator.grammar.range-inverted",
  "registration-arg-range-non-numeric actuator.grammar.range-non-numeric",
  "registration-call-spec-duplicate-name actuator.grammar.duplicate-name",
  "registration-call-spec-duplicate-name actuator.grammar.names-checked-first",
  "registration-duplicate-name sensor.beacon.reading",
  "registration-unmapped-name sensor.chime.unmapped",
  "registration-field-writes-unbound Beacon",
  "registration-after-snapshot actuator.chime.late",
  "registration-after-snapshot tile.op->not",
  "registration-after-snapshot string",
];

/** Every check the arcade selftest is expected to report, and to report as holding. */
const EXPECTED_ARCADE_CHECKS = [
  "debug-logging-defaults-off",
  "move-smoothing-defaults-off",
  "program-waits-for-the-next-frame",
  "program-runs-on-its-sprite-by-id",
  "programs-think-each-frame",
  "destroyed-sprite-program-ends",
  "pushed-scene-runs-its-own-programs",
  "pushed-scene-pauses-programs-below-it",
  "popped-scene-resumes-its-programs",
  "dead-band-reads-zero-inside-the-band",
  "live-band-rises-from-zero-at-the-band-edge",
  "live-band-rescales-to-full-deflection",
  "modifier-mask-keeps-only-admitted-components",
  "explicit-direction-beats-when-result",
  "when-result-direction-beats-the-default",
  "default-direction-without-a-given-or-sensed-one",
  "move-speed-counts-steps-and-clamps-the-argument",
  "move-reach-holds-speed-in-pixels-per-second-over-milliseconds",
  "cardinals-sum-and-normalize",
  "cancelling-cardinals-specify-no-direction",
  "direction-modifiers-beat-the-direction-argument",
  "cancelled-modifiers-leave-the-direction-argument",
  "arcade-pack-registers-without-diagnostics",
  "bare-move-moves-in-the-default-direction",
  "non-direction-when-result-moves-in-the-default-direction",
  "quiet-frames-leave-a-game-set-velocity-alone",
  "dpad-move-follows-the-dpad",
  "slowly-quickly-and-speed-set-the-speed",
  "diagonal-moves-at-cardinal-speed",
  "direction-modifiers-mask-the-dpad",
  "two-moving-rules-blend-by-average",
  "modifier-order-does-not-matter",
  "release-stops-the-sprite",
  "release-writes-one-zero",
  "each-direction-modifier-moves-its-way",
  "perpendicular-modifiers-move-on-the-diagonal",
  "direction-modifier-order-does-not-matter",
  "cancelling-modifiers-fall-through-to-the-default",
  "speed-words-compose-with-direction-modifiers",
  "dpad-modifiers-still-mask-beside-move-modifiers",
  "cancelling-modifiers-fall-through-to-the-when-result",
  "update-waits-for-the-next-frame",
  "update-restarts-the-program-on-its-sprite",
  "update-restarts-every-instance-of-the-program",
  "update-ends-the-old-instances-cleanly",
  "update-leaves-other-programs-running",
  "later-spawns-run-the-update",
  "identical-update-restarts-nothing",
  "refused-updates-keep-the-old-program-running",
  "unread-frames-and-unknown-programs-change-nothing",
  "paused-scene-keeps-its-program-until-it-resumes",
  "paused-scene-takes-the-update-on-resume",
  "removal-leaves-the-programs-sprites-running-nothing",
  "sprite-type-takes-its-atom-from-the-manifest",
  "sprite-value-carries-its-sprite",
  "bump-reads-the-touched-sprite-or-nothing",
  "bump-picks-the-nearest-sprite-first-created-on-ties",
  "bump-rule-moves-its-sprite-while-touching",
  "bump-rule-stops-its-sprite-once-parted",
  "bump-rule-flees-on-the-diagonal",
  "program-update-swaps-a-bump-rule-live",
  "pursuit-closes-on-a-still-sprite",
  "flight-runs-from-a-still-sprite",
  "flight-turns-as-its-subject-moves",
  "toward-and-away-cancel-to-the-fallback",
  "toward-with-a-direction-modifier-bends-pursuit",
  "away-with-a-direction-modifier-bends-flight",
  "relational-modifiers-compose-with-speed",
  "a-shared-center-holds-pursuit-still",
  "toward-without-a-sprite-moves-in-the-default-direction",
  "away-under-a-dpad-follows-the-dpad",
  "program-update-turns-pursuit-to-flight-live",
  "neither-range-sensor-fires-in-an-empty-scene",
  "in-range-fires-within-the-default-range-and-not-beyond",
  "out-of-range-fires-beyond-the-default-range-and-not-within",
  "a-given-range-narrows-both-sensors",
  "a-negative-range-reads-as-zero",
  "exactly-one-range-sensor-fires-while-another-sprite-exists",
  "leash-closes-on-the-nearest-sprite-from-across-the-screen",
  "leash-rests-once-in-range",
  "keep-away-opens-distance-from-the-nearest-sprite",
  "keep-away-rests-once-out-of-range",
  "range-sensors-pick-the-nearest-sprite-first-created-on-ties",
  "standoff-holds-its-distance-from-a-moving-sprite",
  "speed-words-compose-with-range-rules",
  "program-update-swaps-in-range-to-out-of-range-live",
  "image-type-takes-its-atom-and-field-from-the-manifest",
  "image-resolves-when-it-is-used",
  "toward-reads-only-a-sprite-value",
  "image-reads-the-image-the-sprite-wears-its-asset-reading-empty",
  "image-write-wears-the-image-its-asset-resolves-to",
  "image-write-of-an-image-no-factory-holds-or-a-value-naming-no-image-keeps-the-image",
  "image-write-of-another-sprites-image-wears-that-same-image-and-keeps-it-when-that-sprite-changes",
  "proximity-filters-read-a-worn-image-by-its-pixels",
  "image-on-a-destroyed-sprite-reads-nil-and-ignores-writes",
  "bump-given-an-image-reads-the-nearest-sprite-that-looks-like-it",
  "bump-given-an-image-no-sprite-looks-like-reads-nothing",
  "bump-given-an-image-gone-from-the-project-reads-nothing",
  "bump-given-a-sprite-reads-that-sprite-alone",
  "bump-given-a-value-standing-for-no-sprite-in-the-scene-reads-nothing",
  "bump-given-its-own-sprite-reads-nothing",
  "in-range-given-an-image-reads-the-nearest-sprite-that-looks-like-it",
  "in-range-given-an-image-no-sprite-looks-like-reads-nothing",
  "in-range-given-an-image-gone-from-the-project-reads-nothing",
  "in-range-given-a-sprite-reads-that-sprite-alone",
  "in-range-given-a-value-standing-for-no-sprite-in-the-scene-reads-nothing",
  "in-range-given-its-own-sprite-reads-nothing",
  "out-of-range-given-an-image-reads-the-nearest-sprite-that-looks-like-it",
  "out-of-range-given-an-image-no-sprite-looks-like-reads-nothing",
  "out-of-range-given-an-image-gone-from-the-project-reads-nothing",
  "out-of-range-given-a-sprite-reads-that-sprite-alone",
  "out-of-range-given-a-value-standing-for-no-sprite-in-the-scene-reads-nothing",
  "out-of-range-given-its-own-sprite-reads-nothing",
  "bump-given-a-sprite-it-does-not-touch-reads-nothing",
  "proximity-sensors-given-no-filter-read-as-unfiltered",
  "range-pair-is-complementary-within-the-admitted-set",
  "filtered-range-rules-read-the-nearest-sprite-wearing-the-image",
  "brain-type-takes-its-atom-and-field-from-the-manifest",
  "brain-type-reads-the-document-id-of-its-own-values",
  "host-lists-the-attachments-running-a-brain",
  "bump-given-a-brain-reads-the-nearest-sprite-running-it",
  "bump-given-a-brain-no-sprite-runs-reads-nothing",
  "in-range-given-a-brain-reads-the-nearest-sprite-running-it",
  "in-range-given-a-brain-no-sprite-runs-reads-nothing",
  "out-of-range-given-a-brain-reads-the-nearest-sprite-running-it",
  "out-of-range-given-a-brain-no-sprite-runs-reads-nothing",
  "proximity-sensors-given-their-own-brain-read-another-runner-never-their-own-sprite",
  "own-brain-range-rules-read-other-runners-and-never-their-own-sprite",
  "sprite-type-takes-its-fields-from-the-manifest-and-reads-and-writes-them-through-its-hooks",
  "position-reads-a-snapshot-of-the-sprites-center",
  "position-write-sets-the-center-at-once-and-keeps-the-velocity",
  "position-write-of-a-value-naming-no-point-moves-nothing",
  "brain-reads-the-brain-its-sprite-runs-or-nil",
  "brain-write-waits-for-the-drain-which-starts-the-brain",
  "brain-write-of-the-brain-already-running-restarts-nothing",
  "brain-write-of-another-brain-replaces-the-program-at-the-drain",
  "brain-write-of-nil-ends-the-program-and-starts-nothing-on-a-sprite-running-none",
  "brain-write-of-a-brain-no-registration-holds-changes-nothing",
  "a-destroyed-sprite-reads-nil-and-ignores-writes",
  "myself-reads-the-sprite-its-program-runs-on",
  "in-range-given-its-own-sprites-brain-closes-on-another-runner-past-a-plain-sprite",
  "move-toward-the-bumped-sprites-position-lands-on-the-center-it-read",
  "a-position-assignment-puts-its-sprite-on-the-bumped-sprites-center",
  "a-brain-assignment-to-its-own-sprite-swaps-the-program-after-its-think",
  "comparing-y-accessors-moves-up-toward-a-sprite-above-and-not-below",
  "bump-writes-its-output-when-it-fires-and-clears-it-when-it-does-not",
  "in-range-writes-its-output-when-it-fires-and-clears-it-when-it-does-not",
  "out-of-range-writes-its-output-when-it-fires-and-clears-it-when-it-does-not",
  "two-sensors-outputs-coexist-in-one-rule-chain",
  "a-child-reads-a-destroyed-sprites-output-without-fault-and-a-filter-on-it-admits-nothing",
  "bump-rule-dresses-in-the-bumped-sprite",
  "bump-rule-wears-the-image-asset-it-is-given",
  "child-rule-reads-its-parents-range-output",
  "a-brain-assignment-through-the-bumped-sprite-output-starts-the-brain-on-the-sprite-it-touches",
  "an-image-assignment-through-the-in-range-output-dresses-the-sprite-in-range",
  "two-programs-writing-one-output-read-sprites-image-in-a-frame-leave-the-later-thinkers-value",
  "bump-given-above-reads-the-nearest-sprite-above",
  "bump-given-below-reads-the-nearest-sprite-below",
  "bump-given-left-reads-the-nearest-sprite-to-the-left",
  "bump-given-right-reads-the-nearest-sprite-to-the-right",
  "bump-given-above-and-right-reads-only-a-sprite-strictly-on-both-sides",
  "in-range-given-above-reads-the-nearest-sprite-above",
  "in-range-given-below-reads-the-nearest-sprite-below",
  "in-range-given-left-reads-the-nearest-sprite-to-the-left",
  "in-range-given-right-reads-the-nearest-sprite-to-the-right",
  "in-range-given-above-and-right-reads-only-a-sprite-strictly-on-both-sides",
  "out-of-range-given-above-reads-the-nearest-sprite-above",
  "out-of-range-given-below-reads-the-nearest-sprite-below",
  "out-of-range-given-left-reads-the-nearest-sprite-to-the-left",
  "out-of-range-given-right-reads-the-nearest-sprite-to-the-right",
  "out-of-range-given-above-and-right-reads-only-a-sprite-strictly-on-both-sides",
  "positional-modifiers-compose-with-the-filter",
  "range-rule-given-above-pursues-only-a-sprite-above",
  "toward-given-no-target-steers-by-the-when-result",
  "toward-given-a-sprite-pursues-it-over-the-when-result-as-it-moves",
  "away-given-a-sprite-flees-it-over-the-when-result",
  "toward-given-a-point-heads-for-that-fixed-point",
  "away-given-a-point-flees-that-fixed-point",
  "a-point-at-the-sprites-own-center-adds-nothing",
  "a-destroyed-sprite-target-adds-nothing-without-a-fault",
  "toward-and-away-share-one-target",
  "toward-a-point-within-one-step-lands-on-it-and-keeps-its-speed-beyond",
  "toward-a-sprite-within-one-step-lands-on-it",
  "toward-arrived-holds-still-at-its-goal",
  "a-move-not-heading-for-one-goal-alone-keeps-its-speed",
  "toward-a-sprite-at-speed-never-passes-it-and-holds-there",
  "move-toward-quickly-given-the-sprite-in-range-pursues-it",
  "a-child-moves-toward-or-away-from-its-parents-sprite-in-range-over-its-dpad",
  "wander-picks-its-destination-on-screen-inside-the-margin",
  "wander-heads-straight-for-its-destination",
  "wander-keeps-its-destination-until-it-arrives",
  "wander-picks-anew-on-arrival",
  "wander-picks-anew-once-its-deadline-passes",
  "two-wander-call-sites-keep-their-own-destinations",
  "move-wander-heads-for-the-destination-its-call-site-holds",
  "wander-within-one-step-lands-on-its-destination",
  "wander-arrived-holds-still",
  "wander-at-speed-arrives-alike-at-every-frame-rate",
  "a-bare-wander-heads-for-an-on-screen-destination",
  "wander-composes-with-slowly-and-quickly",
  "toward-with-wander-bends-pursuit-toward-the-destination",
  "two-wander-rules-on-one-sprite-keep-two-destinations",
  "move-past-the-engines-top-speed-goes-at-it-in-the-direction-asked",
  "the-direct-applicator-holds-a-velocity-to-the-top-speed-in-its-direction",
  "smoothing-eases-a-speed-up-by-the-exponential-of-the-frame-time",
  "smoothing-sets-a-slow-down-and-a-stop-at-once-and-eases-a-turn",
  "smoothing-reads-its-setting-live-and-sets-at-once-when-off",
  "smoothing-eases-a-start-within-its-envelope-and-stops-at-once",
  "smoothing-travels-alike-at-60-and-30-frames-a-second",
  "smoothing-keeps-goal-landings-and-the-arrival-hold-exact",
  "a-vector2-holding-an-infinity-or-a-nan-reads-as-no-point",
  "a-move-toward-or-away-from-a-non-finite-point-moves-as-a-move-given-no-target",
  "position-write-of-a-non-finite-point-moves-nothing",
  "the-direct-applicator-sets-a-non-finite-verdict-still-and-forgets-the-last-velocity",
  "an-infinite-speed-moves-at-the-top-speed-as-a-speed-past-it-does",
  "a-not-a-number-or-negative-speed-reads-as-zero-and-stops-the-sprite",
  "a-sprites-own-smoothing-eases-its-moves-in-place-of-the-projects",
  "a-sprites-own-smoothing-of-0-sets-its-moves-at-once-while-the-projects-is-on",
  "a-sprite-without-smoothing-of-its-own-follows-the-projects-as-it-changes-and-one-with-its-own-keeps-it",
  "set-move-smoothing-given-a-negative-or-non-finite-number-follows-the-projects-again-and-given-no-sprite-does-nothing",
  "move-smoothing-reads-in-seconds-the-smoothing-its-sprite-eases-with",
  "move-smoothing-write-round-trips-its-seconds-and-a-negative-number-turns-smoothing-off",
  "move-smoothing-write-of-an-infinity-holds-its-sprite-at-the-speed-it-has-and-sets-a-slow-down-at-once",
  "move-smoothing-write-of-not-a-number-or-of-no-number-changes-nothing",
  "move-smoothing-on-a-destroyed-sprite-reads-nil-and-ignores-writes",
  "a-brain-setting-its-own-sprites-move-smoothing-eases-that-sprite-while-others-follow-the-projects",
  "two-brains-setting-different-move-smoothing-ease-their-sprites-differently-in-one-scene",
  "a-move-smoothing-assignment-through-the-bumped-sprite-output-gives-the-sprite-it-touches-that-smoothing",
  "a-sprites-own-move-smoothing-holds-from-before-its-brain-starts-and-through-a-brain-change",
  "a-smoothed-sprite-eases-on-from-the-velocity-it-has-through-a-brain-change",
  "a-smoothed-sprite-given-no-brain-stops-and-eases-its-next-brain-from-rest",
  "a-smoothed-sprite-given-no-brain-and-a-new-one-on-one-frame-eases-on-from-the-velocity-it-has",
  "a-smoothed-sprite-given-its-first-brain-eases-on-from-the-velocity-game-code-set",
  "a-smoothed-sprite-a-wall-stops-eases-back-up-from-the-stop",
  "a-slow-move-smoothed-finer-than-a-velocity-step-still-closes-on-its-speed",
  "equality-overloads-take-their-ids-from-the-manifest",
  "image-equality-reads-pixels-whether-a-sprite-wears-the-image-or-an-asset-names-it",
  "an-image-standing-for-no-image-equals-nothing-not-even-another",
  "sprite-equality-is-identity-and-a-destroyed-or-missing-sprite-equals-nothing",
  "brain-equality-compares-document-ids-whether-or-not-a-brain-holds-them",
  "an-image-comparison-rule-fires-while-its-sprite-wears-a-look-alike-of-the-asset",
  "an-image-inequality-rule-fires-while-its-sprite-wears-another-image",
  "a-sprite-comparison-rule-fires-while-the-sprite-in-range-is-the-bumped-sprite",
  "a-brain-comparison-rule-fires-while-the-bumped-sprite-runs-its-own-sprites-brain",
  "vector2-operator-overloads-take-their-ids-from-the-manifest",
  "multiplication-takes-no-number-before-a-point-nor-two-points-and-division-no-point",
  "vector2-equality-holds-exactly-when-both-components-are-equal",
  "a-value-holding-no-point-equals-nothing-not-even-itself",
  "vector2-sum-and-difference-work-component-by-component-into-fresh-values",
  "vector2-product-scales-both-components-by-the-number-on-its-right-into-a-fresh-value",
  "vector2-arithmetic-over-no-point-or-no-number-is-nil",
  "overflowing-vector2-arithmetic-holds-an-infinity-that-reads-as-no-point",
  "a-shove-rule-pushes-the-bumped-sprite-away-by-the-distance-between-their-centers",
  "a-position-comparison-rule-fires-while-its-sprite-shares-the-bumped-sprites-center",
  "a-position-variable-remembers-the-point-written-to-it-after-its-sprite-moves",
  "position-variables-swapped-through-a-third-each-hold-the-others-point",
  "a-sprite-variable-never-written-reads-nil-gating-its-rule-off-and-skipping-writes-through-it",
  "a-write-through-a-sprite-variable-reaches-the-sprite-written-to-it",
  "a-sprite-variable-reads-its-sprite-where-it-is-now",
  "a-sprite-variable-whose-sprite-is-destroyed-reads-nil-and-gates-its-rule-off",
  "a-move-toward-a-sprite-variable-never-written-holds-still",
  "a-move-toward-a-sprite-variable-written-a-live-sprite-pursues-it",
  "a-move-toward-a-sprite-variable-whose-sprite-is-destroyed-holds-still",
  "a-range-pair-filtered-on-a-sprite-variable-never-written-fires-neither-rule",
  "a-rule-whose-when-is-a-sprite-variable-fires-while-its-sprite-lives",
  "a-rule-whose-when-is-a-sprite-variable-stops-for-good-once-its-sprite-is-destroyed",
  "a-position-variables-x-written-holds-the-changed-point-for-every-later-rule",
  "writes-of-its-own-sprites-position-x-then-y-move-the-sprite-along-each-axis",
  "a-write-of-the-bumped-sprites-position-y-moves-that-sprite-alone-along-that-axis",
  "a-rule-whose-when-is-a-position-variable-nothing-wrote-fires-from-the-start",
  "a-move-toward-origin-heads-for-the-top-left-corner-and-lands-there",
  "a-position-variable-given-origin-then-an-x-and-a-y-holds-that-point",
  "a-position-variable-nothing-wrote-given-an-x-alone-holds-that-x-at-the-top",
  "two-sprites-running-one-program-each-start-its-position-variable-at-origin",
  "player-type-takes-its-atom-and-fields-from-the-manifest",
  "a-player-value-names-its-player-and-an-empty-player-slot-names-player-one",
  "a-read-of-player-ones-score-shows-nothing-until-a-write-sets-it-through-arcade",
  "a-score-write-takes-arcades-whole-number-truncation",
  "a-score-write-of-no-finite-number-changes-nothing",
  "a-score-read-follows-the-score-game-code-sets",
  "add-score-adds-one-to-player-one-given-nothing-and-a-negative-number-takes-away",
  "add-score-given-no-finite-number-changes-nothing",
  "add-score-given-a-player-changes-that-players-score-alone",
  "a-program-adding-score-adds-one-or-the-number-it-is-given-to-player-one",
  "a-program-adding-an-amount-that-reads-nothing-adds-nothing",
  "a-program-reads-player-ones-score-as-game-code-sets-it",
  "a-program-adding-score-given-a-number-and-a-player-in-either-order-changes-that-players-score",
  "a-program-writing-player-ones-score-sets-it-through-arcade",
  "a-program-reading-player-twos-score-switches-the-game-to-arcades-multiplayer-display",
  "a-dpad-given-player-two-follows-player-twos-controller-and-a-bare-dpad-player-ones",
  "a-dpad-given-the-argument-buffer-of-a-program-compiled-before-its-player-slot-reads-player-one",
  "an-a-button-rule-moves-rightward-while-a-is-held-and-stops-on-release",
  "a-b-button-rule-moves-rightward-while-b-is-held-and-stops-on-release",
  "a-held-leaves-the-b-rule-off-and-b-held-leaves-the-a-rule-off",
  "a-and-b-held-together-fire-both-rules",
  "an-a-button-given-player-two-fires-on-player-twos-a-and-not-on-player-ones",
  "a-bare-a-button-ignores-player-twos-a",
  "a-button-sensor-reads-true-while-its-players-button-is-held-and-nil-otherwise",
  "a-brain-variable-written-before-its-brain-starts-is-held-and-read-by-the-first-think",
  "a-held-brain-variable-write-dies-with-the-run-request-it-rode",
  "a-sprite-running-no-brain-reads-empty-and-takes-no-write",
  "a-game-write-on-a-brain-variables-name-reaches-the-variable-the-brain-shows-by-that-name",
  "a-brain-variable-written-between-thinks-is-read-at-the-next-think-and-not-before",
  "a-brain-variable-name-matches-exactly-and-an-unknown-name-gets-a-slot-of-its-own",
  "one-brain-follows-the-dpad-of-the-player-game-code-gives-each-sprite-and-none-on-a-sprite-given-none",
  "a-brain-variable-holding-nothing-or-another-type-reads-the-empty-value",
  "text-and-boolean-brain-variables-read-back-what-game-code-wrote",
  "player-equality-overloads-take-their-ids-from-the-manifest",
  "player-equality-compares-player-numbers-the-block-written-player-equals-its-literal-and-nil-equals-nothing",
  "a-rule-comparing-a-player-variable-with-player-one-is-equal-only-while-it-holds-player-one",
  "an-update-restart-keeps-the-player-game-code-gave-each-sprite",
  "an-update-restart-keeps-the-values-a-brain-gave-its-own-variables",
  "a-variable-new-to-an-update-starts-at-its-starting-value",
  "a-slot-a-game-write-gave-carries-into-an-update-declaring-its-name",
  "a-slot-a-game-write-gave-is-dropped-by-an-update-declaring-no-variable-by-its-name",
  "a-variable-an-update-drops-is-gone-and-a-later-update-declaring-it-starts-it-fresh",
  "running-another-brain-on-a-sprite-starts-its-variables-fresh",
  "a-brains-first-start-and-a-start-after-the-empty-program-carry-nothing",
  "effect-and-sound-types-take-their-atoms-and-fields-from-the-manifest",
  "each-effect-literal-names-the-arcade-effect-of-its-key-and-an-empty-effect-slot-names-none",
  "each-sound-literal-names-the-arcade-melody-of-its-key-and-an-empty-sound-slot-names-none",
  "a-game-over-given-a-player-effect-or-sound-that-reads-nothing-does-not-run",
  "icon-encoder-writes-makecodes-image-buffer",
  "icon-encoder-buffer-reads-back-as-the-same-image",
  "icon-encoder-renders-nothing-for-what-is-no-image",
];

/**
 * Every unresolved-asset line the arcade selftest is expected to log, in
 * order, each without its `wendoo ` prefix: the late image, used once before
 * its factory is registered, then the deleted image, which writes to a
 * sprite's image and the proximity sensors' filters each use more than once.
 */
const EXPECTED_ARCADE_ASSET_LINES = ["WENDOO_ASSET_UNRESOLVED image image9", "WENDOO_ASSET_UNRESOLVED image image404"];

/** The prefix of the line the VM extension logs for an asset id no factory holds. */
const ASSET_LINE_PREFIX = "wendoo WENDOO_ASSET_UNRESOLVED ";

/**
 * Every unresolved-brain line the arcade selftest is expected to log, in
 * order, each without its `wendoo ` prefix: one per document id that a write
 * to a sprite's brain names and no registration holds, however many times it
 * is written.
 */
const EXPECTED_ARCADE_BRAIN_LINES = ["WENDOO_BRAIN_UNRESOLVED nobodyRunsThis01"];

/** The prefix of the line the VM extension logs for a brain document id no registration holds. */
const BRAIN_LINE_PREFIX = "wendoo WENDOO_BRAIN_UNRESOLVED ";

/**
 * Every unusable move-smoothing line the arcade selftest is expected to
 * log, in order, each without its `wendoo ` prefix: one for the whole run,
 * however many writes of a sprite's move smoothing hold no usable number.
 */
const EXPECTED_ARCADE_SMOOTHING_LINES = ["WENDOO_MOVE_SMOOTHING_UNUSABLE"];

/** The line the arcade base pack logs for a write of a sprite's move smoothing holding no usable number. */
const SMOOTHING_LINE = "wendoo WENDOO_MOVE_SMOOTHING_UNUSABLE";

/**
 * Every unusable score line the arcade selftest is expected to log, in
 * order, each without its `wendoo ` prefix: one for the whole run, however
 * many score writes and additions hold no finite number.
 */
const EXPECTED_ARCADE_SCORE_LINES = ["WENDOO_SCORE_UNUSABLE"];

/** The line the arcade base pack logs for a score write or addition holding no finite number. */
const SCORE_LINE = "wendoo WENDOO_SCORE_UNUSABLE";

/**
 * Every brain variable line the arcade selftest is expected to log, in
 * order, each without its `wendoo ` prefix: one for the whole run the first
 * time game code reads a sprite whose brain has not started, then one per
 * name the keeper program declares no variable by, as game code first writes
 * it -- ` lives ` and `Lives` -- one for the whole run the first time game
 * code reads a variable holding a value of another type, then the two names
 * the text and boolean round trips write, then the two names game code
 * writes on the counted paddle program before updates carry or drop them.
 */
const EXPECTED_ARCADE_VARIABLE_LINES = [
  "WENDOO_VARIABLE_NO_PROGRAM",
  'WENDOO_VARIABLE_UNKNOWN " lives "',
  'WENDOO_VARIABLE_UNKNOWN "Lives"',
  "WENDOO_VARIABLE_TYPE_MISMATCH",
  'WENDOO_VARIABLE_UNKNOWN "motto"',
  'WENDOO_VARIABLE_UNKNOWN "ready"',
  'WENDOO_VARIABLE_UNKNOWN "bonus"',
  'WENDOO_VARIABLE_UNKNOWN "extra"',
];

/** The prefix of the lines the VM extension logs for brain variables game code reads and writes. */
const VARIABLE_LINE_PREFIX = "wendoo WENDOO_VARIABLE_";

/** The lines the arcade base pack logs for an effect and for a sound naming nothing Arcade holds. */
const CHOICE_LINES = ["wendoo WENDOO_EFFECT_UNUSABLE", "wendoo WENDOO_SOUND_UNUSABLE"];

/**
 * Every check each arcade ending project is expected to report, by the
 * ending its `main.ts` names.
 */
const EXPECTED_ARCADE_ENDING_CHECKS = {
  lose: [
    "a-bare-game-over-ends-the-game-once-as-a-loss-and-its-program-runs-on",
    "a-game-over-given-no-effect-or-sound-leaves-the-loss-with-arcades-own",
  ],
  win: [
    "a-game-over-given-win-ends-the-game-once-as-a-win-and-its-program-runs-on",
    "a-game-over-given-an-effect-and-a-sound-naming-nothing-leaves-the-win-with-arcades-own",
  ],
  player: [
    "a-game-over-given-a-player-ends-the-game-once-as-a-win-even-given-lose-and-its-program-runs-on",
    "a-game-over-given-an-effect-and-a-sound-sets-them-for-the-win-it-ends-the-game-with",
  ],
};

/**
 * Every unusable effect and sound line each arcade ending project is
 * expected to log, in order, each without its `wendoo ` prefix, by ending:
 * one each for the whole win run, however many frames its game over is given
 * an effect and a sound naming nothing, and none for the other endings.
 */
const EXPECTED_ARCADE_ENDING_CHOICE_LINES = {
  lose: [],
  win: ["WENDOO_EFFECT_UNUSABLE", "WENDOO_SOUND_UNUSABLE"],
  player: [],
};

/** The arcade base pack's tiles whose catalog entries must carry an icon. */
const ARCADE_ICONED_TILES = [
  "sensor.arcade.dpad",
  "sensor.arcade.button-a",
  "sensor.arcade.button-b",
  "actuator.arcade.move",
  "sensor.arcade.bump",
  "sensor.arcade.in-range",
  "sensor.arcade.out-of-range",
  "sensor.arcade.myself",
  "actuator.arcade.add-score",
  "actuator.arcade.game-over",
];

/** The modifier tiles whose every slot in the arcade base pack's catalog must carry an icon. */
const ARCADE_ICONED_MODIFIERS = [
  "modifier.direction.up",
  "modifier.direction.down",
  "modifier.direction.left",
  "modifier.direction.right",
  "modifier.movement.toward",
  "modifier.movement.away",
  "modifier.movement.wander",
  "modifier.slowly",
  "modifier.quickly",
  "modifier.position.above",
  "modifier.position.below",
  "modifier.position.left",
  "modifier.position.right",
  "modifier.outcome.win",
  "modifier.outcome.lose",
];

/** The core tiles the arcade base pack's catalog must give a 16 by 16 icon, each by its tile id, and every page's own tile by the page family id `tile.page`. */
const ARCADE_ICONED_CORE_TILES = [
  "tile.sensor->on-page-entered",
  "tile.actuator->switch-page",
  "tile.actuator->restart-page",
  "tile.sensor->current-page",
  "tile.sensor->previous-page",
  "tile.page",
  "tile.sensor->sensor.timeout",
  "tile.op->and",
  "tile.op->or",
  "tile.op->not",
  "tile.op->eq",
  "tile.op->ne",
  "tile.op->lt",
  "tile.op->le",
  "tile.op->gt",
  "tile.op->ge",
  "tile.op->add",
  "tile.op->sub",
  "tile.op->mul",
  "tile.op->div",
  "tile.op->neg",
  "tile.op->assign",
  "tile.cf->open-paren",
  "tile.cf->close-paren",
  "tile.var.factory->boolean",
  "tile.var.factory->number",
  "tile.var.factory->string",
  "tile.lit.factory->number",
  "tile.lit.factory->string",
  "tile.sensor->random",
  "tile.literal->boolean:<boolean>->true",
  "tile.literal->boolean:<boolean>->false",
  "tile.literal->nil:<nil>->nil",
];

/** The core types the arcade base pack's catalog must give a 16 by 16 icon, each by its type name. */
const ARCADE_ICONED_CORE_TYPES = ["number", "string", "boolean"];

/** The types whose catalog entries in the arcade base pack must carry a 16 by 16 icon. */
const ARCADE_ICONED_TYPES = ["Vector2", "Sprite", "Image", "Brain", "Player", "Effect", "Sound"];

/** The fields whose accessor tiles the arcade base pack's catalog must give a 16 by 16 icon, each as `Type.field`. */
const ARCADE_ICONED_ACCESSORS = [
  "Vector2.x",
  "Vector2.y",
  "Sprite.image",
  "Sprite.position",
  "Sprite.brain",
  "Sprite.moveSmoothing",
  "Player.score",
];

/** Width and height, in pixels, of every arcade base pack icon. */
const ARCADE_ICON_SIZE = 16;

/**
 * Every refusal one arcade selftest program host is expected to log, as
 * `<code> <id>`, in order, at its first drain: the programs the brains
 * module declares for a superseded format, for a Vector2 atom the project's
 * ids module does not hold, and for a foreign device profile.
 */
const ARCADE_HOST_REJECTIONS = [
  "WENDOO_BINARY_CODEC_UNSUPPORTED_FORMAT_VERSION staleFormat00001",
  "WENDOO_BINARY_CODEC_UNKNOWN_TYPE_ATOM unmappedType0001",
  "WENDOO_BINARY_CODEC_UNSUPPORTED_DEVICE_PROFILE wrongProfile0001",
];

/**
 * Every refusal the arcade selftest is expected to log, as `<code> <id>`, in
 * order: each scene's program host logs the refused programs at its first
 * frame while debug logging is on. The scenes are the ones the selftest
 * pushes to check paused programs, paused program updates, the bump sensor,
 * the move's toward and away modifiers, the in-range and out-of-range
 * sensors, the proximity sensors' filters, their brain filter, the
 * `Sprite` type's fields, the myself sensor, their outputs, the field
 * writes made through their outputs, their positional modifiers, the
 * targets the move's toward and away carry, the move's wander, the
 * `Sprite` type's move smoothing, move smoothing through brain changes,
 * move smoothing from the velocity a sprite has, the equality operators'
 * overloads, the overloads over `Vector2`s, the programs holding
 * variables, the programs writing one number of a position, the programs
 * adding to and reading player one's score, the program reading player
 * two's score, the dpad's player, the A and B buttons, the brain variables
 * game code reads and writes, the variables an update restart carries, and
 * the game over's gate on a placed value reading nothing.
 */
const EXPECTED_ARCADE_REJECTIONS = [
  ...ARCADE_HOST_REJECTIONS,
  ...ARCADE_HOST_REJECTIONS,
  ...ARCADE_HOST_REJECTIONS,
  ...ARCADE_HOST_REJECTIONS,
  ...ARCADE_HOST_REJECTIONS,
  ...ARCADE_HOST_REJECTIONS,
  ...ARCADE_HOST_REJECTIONS,
  ...ARCADE_HOST_REJECTIONS,
  ...ARCADE_HOST_REJECTIONS,
  ...ARCADE_HOST_REJECTIONS,
  ...ARCADE_HOST_REJECTIONS,
  ...ARCADE_HOST_REJECTIONS,
  ...ARCADE_HOST_REJECTIONS,
  ...ARCADE_HOST_REJECTIONS,
  ...ARCADE_HOST_REJECTIONS,
  ...ARCADE_HOST_REJECTIONS,
  ...ARCADE_HOST_REJECTIONS,
  ...ARCADE_HOST_REJECTIONS,
  ...ARCADE_HOST_REJECTIONS,
  ...ARCADE_HOST_REJECTIONS,
  ...ARCADE_HOST_REJECTIONS,
  ...ARCADE_HOST_REJECTIONS,
  ...ARCADE_HOST_REJECTIONS,
  ...ARCADE_HOST_REJECTIONS,
  ...ARCADE_HOST_REJECTIONS,
  ...ARCADE_HOST_REJECTIONS,
  ...ARCADE_HOST_REJECTIONS,
  ...ARCADE_HOST_REJECTIONS,
];

/**
 * Every line the arcade selftest's program updates are expected to log, in
 * order, each without its `wendoo ` prefix: the update taken, the three
 * updates refused -- a foreign device profile, then an action id and a type
 * atom the project's ids module does not hold -- the three messages refused,
 * the paused scene's program update taken, the removal taken, the bump
 * rule's update taken, the pursuit rule's update to flight taken, the
 * in-range rule's update to out of range taken, and the paddle program's
 * four updates taken -- to the counted paddle, to the bonus paddle, back to
 * the counted paddle, and to the bonus paddle again.
 */
const EXPECTED_ARCADE_UPDATE_LINES = [
  "program-updated driftBareMove001 0000000a",
  "program-update-rejected WENDOO_BINARY_CODEC_UNSUPPORTED_DEVICE_PROFILE driftBareMove001",
  "program-update-rejected WENDOO_PROGRAM_UPDATE_UNMAPPED_ID driftBareMove001",
  "program-update-rejected WENDOO_PROGRAM_UPDATE_UNMAPPED_ID driftBareMove001",
  "sim-channel-rejected SIM_CHANNEL_VERSION_NEWER",
  "sim-channel-rejected SIM_CHANNEL_FRAME_MALFORMED",
  "sim-channel-rejected SIM_CHANNEL_FRAME_MALFORMED",
  "program-updated Hq7EB8SthdeOudyP 00000010",
  "program-removed driftBareMove001",
  "program-updated fleeBumpLeftUp01 00000011",
  "program-updated chaseBumpToward1 00000012",
  "program-updated nearInRangeMove1 00000013",
  "program-updated brainVarPaddle01 00000014",
  "program-updated brainVarPaddle01 00000015",
  "program-updated brainVarPaddle01 00000016",
  "program-updated brainVarPaddle01 00000017",
];

/** The prefixes of the lines the VM extension logs for program updates and the messages carrying them. */
const UPDATE_LINE_PREFIXES = [
  "wendoo program-updated ",
  "wendoo program-removed ",
  "wendoo program-update-rejected ",
  "wendoo sim-channel-rejected ",
];

/** The line the arcade selftest prints as it turns the Wendoo extensions' debug logging on. */
const DEBUG_ON_LINE = "DEBUG ON";

/** The prefix of every line the Wendoo extensions log while debug logging is on. */
const WENDOO_LINE_PREFIX = "wendoo ";

/**
 * The ways the capture `log` misses the debug-logging contract: exactly one
 * {@link DEBUG_ON_LINE}, and no line the Wendoo extensions log before it.
 */
function debugLoggingFailures(log) {
  const lines = linesOf(log);
  const on = lines.indexOf(DEBUG_ON_LINE);
  if (on < 0 || lines.lastIndexOf(DEBUG_ON_LINE) !== on) return [`no single "${DEBUG_ON_LINE}" line`];
  const early = lines.slice(0, on).filter((line) => line.startsWith(WENDOO_LINE_PREFIX));
  return early.length > 0 ? [`logged before debug logging was on: ${early.join(" | ")}`] : [];
}

/** The kinds of the frames the arcade selftest must post on the simulator extension's channel, in order. */
const EXPECTED_ARCADE_FRAME_KINDS = ["ping", "catalog"];

/** The arcade selftest's catalog fixture: the editor's golden-program tooling reads it as the session catalog its allocation and programs are made from. */
const ARCADE_CATALOG_FIXTURE = path.join(__dirname, "selftest", "arcade", "catalog.json");

/**
 * The structural listing of the catalog the arcade selftest game is expected
 * to post -- the arcade base pack's vocabulary -- as `catalog.structuralListing`
 * renders it.
 */
const EXPECTED_ARCADE_CATALOG_STRUCTURE = fs.readFileSync(
  path.join(__dirname, "selftest", "arcade", "catalog.structure.txt"),
  "utf8"
);

/** The simulator extension's channel, which every message the Wendoo extensions post rides. */
const SIMX_CHANNEL = "wendoo-lang/pxt-wendoo";

/** The registration selftest's catalog fixture: the editor's golden-program tooling reads it as the session catalog its allocation and programs are made from. */
const CATALOG_FIXTURE = path.join(__dirname, "selftest", "catalog.json");

/**
 * The structural listing of the catalog the selftest run is expected to
 * print -- the three packs' registered vocabulary under first-wins
 * resolution, the argument grammars and type literals the packs declare, and
 * every diagnostic the run provokes -- as `catalog.structuralListing` renders
 * it.
 */
const EXPECTED_CATALOG_STRUCTURE = fs.readFileSync(path.join(__dirname, "selftest", "catalog.structure.txt"), "utf8");

/** Matches a string whose every code unit is printable ASCII, 0x20 through 0x7e. */
const PRINTABLE_ASCII = /^[\x20-\x7e]*$/;

const CHECK_PREFIX = "CHECK ";
const TRACE_PREFIX = "TRACE ";
const DIAG_PREFIX = "DIAG registration ";
const REJECTION_PREFIX = "wendoo program-rejected ";
const FAILED_CHECKS_LINE = "CHECKS failed 0";

function usage(message) {
  process.stderr.write(`selftest: ${message}\n`);
  process.stderr.write("Usage: node selftest.js [--runs 2] [--skip-build]\n");
  process.exit(2);
}

function parseArgs(argv) {
  const options = { runs: 2, skipBuild: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--runs") options.runs = Number.parseInt(argv[++i], 10);
    else if (argv[i] === "--skip-build") options.skipBuild = true;
    else usage(`unknown argument: ${argv[i]}`);
  }
  if (!Number.isInteger(options.runs) || options.runs < 1) usage("--runs must be a positive integer");
  return options;
}

/** Builds the generated project with the target checkout's own pxt CLI, JS only, collecting its whole output however long. */
function build(targetDir, projectDir) {
  const pxt = path.join(targetDir, "node_modules", "pxt-core", "built", "pxt.js");
  const run = spawnSync(process.execPath, [pxt, "build", "--debug"], {
    cwd: projectDir,
    encoding: "utf8",
    maxBuffer: Number.POSITIVE_INFINITY,
  });
  return { ok: run.status === 0, output: (run.stdout || "") + (run.stderr || "") };
}

function linesOf(log) {
  return log.split("\n").filter((line) => line.length > 0);
}

/** The names of the checks the capture reported, by verdict. */
function reportedChecks(log) {
  const ok = [];
  const failed = [];
  for (const line of linesOf(log)) {
    if (!line.startsWith(CHECK_PREFIX)) continue;
    const [name, verdict] = line.slice(CHECK_PREFIX.length).split(" ");
    if (verdict === "ok") ok.push(name);
    else failed.push(name);
  }
  return { ok, failed };
}

/** The `<code> <name>` of every registration diagnostic the capture reported. */
function reportedDiagnostics(log) {
  return linesOf(log)
    .filter((line) => line.startsWith(DIAG_PREFIX))
    .map((line) => line.slice(DIAG_PREFIX.length).split(" ").slice(0, 2).join(" "));
}

/** The `<code> <id>` of every program refusal the capture logged, in order. */
function reportedRejections(log) {
  return linesOf(log)
    .filter((line) => line.startsWith(REJECTION_PREFIX))
    .map((line) => line.slice(REJECTION_PREFIX.length));
}

/** Every program-update line the capture logged, in order, each without its `wendoo ` prefix. */
function reportedUpdateLines(log) {
  return linesOf(log)
    .filter((line) => UPDATE_LINE_PREFIXES.some((prefix) => line.startsWith(prefix)))
    .map((line) => line.slice("wendoo ".length));
}

/** Every unresolved-asset line the capture logged, in order, each without its `wendoo ` prefix. */
function reportedAssetLines(log) {
  return linesOf(log)
    .filter((line) => line.startsWith(ASSET_LINE_PREFIX))
    .map((line) => line.slice("wendoo ".length));
}

/** Every program-fault line the capture logged, in order, each without its `wendoo ` prefix. */
function reportedFaultLines(log) {
  return linesOf(log)
    .filter((line) => line.startsWith(FAULT_LINE_PREFIX))
    .map((line) => line.slice("wendoo ".length));
}

/** Every unresolved-brain line the capture logged, in order, each without its `wendoo ` prefix. */
function reportedBrainLines(log) {
  return linesOf(log)
    .filter((line) => line.startsWith(BRAIN_LINE_PREFIX))
    .map((line) => line.slice("wendoo ".length));
}

/** Every unusable move-smoothing line the capture logged, in order, each without its `wendoo ` prefix. */
function reportedSmoothingLines(log) {
  return linesOf(log)
    .filter((line) => line.startsWith(SMOOTHING_LINE))
    .map((line) => line.slice("wendoo ".length));
}

/** Every unusable score line the capture logged, in order, each without its `wendoo ` prefix. */
function reportedScoreLines(log) {
  return linesOf(log)
    .filter((line) => line.startsWith(SCORE_LINE))
    .map((line) => line.slice("wendoo ".length));
}

/** Every brain variable line the capture logged, in order, each without its `wendoo ` prefix. */
function reportedVariableLines(log) {
  return linesOf(log)
    .filter((line) => line.startsWith(VARIABLE_LINE_PREFIX))
    .map((line) => line.slice("wendoo ".length));
}

/** Every unusable effect and sound line the capture logged, in order, each without its `wendoo ` prefix. */
function reportedChoiceLines(log) {
  return linesOf(log)
    .filter((line) => CHOICE_LINES.includes(line))
    .map((line) => line.slice("wendoo ".length));
}

/**
 * The image an icon's catalog text spells: its bits per pixel, width and
 * height, whether its byte count is the one they imply, and -- when it is --
 * how many of its pixels are drawn, a pixel at palette index 0 being
 * transparent. The text is lowercase hex of a MakeCode image buffer -- 0x87,
 * the bits per pixel (1 or 4), the width and the height each a little-endian
 * 16-bit integer, two zero bytes, then each column from the left, its pixels
 * from the top, the topmost in a byte's lowest bits, 1 bit per pixel padded
 * to whole bytes or 4 bits per pixel padded to a multiple of 4 bytes. `null`
 * when the text is not hex or not such a buffer.
 */
function decodedIcon(text) {
  if (typeof text !== "string" || !/^([0-9a-f]{2})+$/.test(text)) return null;
  const bytes = [];
  for (let i = 0; i < text.length; i += 2) bytes.push(Number.parseInt(text.slice(i, i + 2), 16));
  if (bytes.length < 8 || bytes[0] !== 0x87 || (bytes[1] !== 1 && bytes[1] !== 4)) return null;
  const bpp = bytes[1];
  const width = bytes[2] | (bytes[3] << 8);
  const height = bytes[4] | (bytes[5] << 8);
  const column = bpp === 1 ? (height + 7) >> 3 : ((height * 4 + 31) >> 5) << 2;
  const sized = bytes.length === 8 + width * column;
  let drawn = 0;
  if (sized) {
    const perByte = 8 / bpp;
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        const byte = bytes[8 + x * column + Math.floor(y / perByte)];
        if (((byte >> ((y % perByte) * bpp)) & ((1 << bpp) - 1)) !== 0) drawn++;
      }
    }
  }
  return { bpp, width, height, sized, drawn };
}

/**
 * Every icon the parsed catalog payload `value` carries, at any depth, each
 * as `{ where, text }`: `where` names the entries holding it, by `/`, an
 * entry named by its `name`, else its `tileId`, else its `type`.
 */
function carriedIcons(value, where = "") {
  if (Array.isArray(value)) return value.flatMap((item) => carriedIcons(item, where));
  if (typeof value !== "object" || value === null) return [];
  const name = [value.name, value.tileId, value.type].find((candidate) => typeof candidate === "string");
  const here = name === undefined ? where : where === "" ? name : `${where}/${name}`;
  return Object.entries(value).flatMap(([key, field]) =>
    key === "icon" ? [{ where: here, text: field }] : carriedIcons(field, here)
  );
}

/**
 * The ways the icons the parsed arcade catalog payload `payload` carries
 * miss a usable icon: each must decode as an image buffer of 16 by 16
 * pixels with at least one pixel drawn.
 */
function arcadeIconValidityFailures(payload) {
  return carriedIcons(payload).flatMap(({ where, text }) => {
    const icon = decodedIcon(text);
    if (icon === null || !icon.sized) return [`icon of ${where} is not an image buffer`];
    if (icon.width !== ARCADE_ICON_SIZE || icon.height !== ARCADE_ICON_SIZE) {
      return [`icon of ${where} is ${icon.width} by ${icon.height}`];
    }
    return icon.drawn === 0 ? [`icon of ${where} draws no pixel`] : [];
  });
}

/** `["<what> carries no icon"]` when `text` is absent, else nothing. */
function iconPresence(what, text) {
  return text === undefined ? [`${what} carries no icon`] : [];
}

/** Every slot entry in the grammar nodes `nodes`, flat `args` entries included, in declaration order. */
function grammarSlots(nodes) {
  return (nodes || []).flatMap((node) => {
    if (node.kind === undefined || node.kind === "arg") return [node];
    return grammarSlots(
      [...(node.items || []), ...(node.options || []), node.item, node.then, node.else].filter(Boolean)
    );
  });
}

/**
 * The ways the parsed arcade catalog payload `payload` misses its icons:
 * each type in `ARCADE_ICONED_TYPES`, each accessor in
 * `ARCADE_ICONED_ACCESSORS`, each tile in `ARCADE_ICONED_TILES`, each slot of
 * any tile a modifier in `ARCADE_ICONED_MODIFIERS` fills, exactly one core
 * tile icon entry for each core tile in `ARCADE_ICONED_CORE_TILES`, and exactly
 * one core type icon entry for each core type in `ARCADE_ICONED_CORE_TYPES`,
 * carries an icon.
 */
function arcadeIconFailures(payload) {
  const pack = (payload.packs || []).find((entry) => entry.name === "arcade");
  const tiles = pack ? pack.tiles : [];
  const types = pack ? pack.types : [];
  const failures = [];
  for (const name of ARCADE_ICONED_TYPES) {
    const type = types.find((entry) => entry.name === name);
    failures.push(...(type ? iconPresence(`type ${name}`, type.icon) : [`no type ${name}`]));
  }
  for (const name of ARCADE_ICONED_ACCESSORS) {
    const [typeName, fieldName] = name.split(".");
    const type = types.find((entry) => entry.name === typeName);
    const declared = type ? (type.fields || []).find((entry) => entry.name === fieldName) : undefined;
    failures.push(
      ...(declared?.accessor ? iconPresence(`accessor ${name}`, declared.accessor.icon) : [`no accessor ${name}`])
    );
  }
  for (const name of ARCADE_ICONED_TILES) {
    const tile = tiles.find((entry) => entry.name === name);
    failures.push(...(tile ? iconPresence(`tile ${name}`, tile.icon) : [`no tile ${name}`]));
  }
  for (const tileId of ARCADE_ICONED_MODIFIERS) {
    const slots = tiles.flatMap((tile) =>
      grammarSlots(tile.args || tile.call).map((slot) => ({ tile: tile.name, slot }))
    );
    const filling = slots.filter((entry) => entry.slot.tileId === tileId);
    if (filling.length === 0) failures.push(`no slot ${tileId}`);
    for (const entry of filling) failures.push(...iconPresence(`slot ${tileId} of ${entry.tile}`, entry.slot.icon));
  }
  const coreIcons = pack ? pack.coreTileIcons || [] : [];
  for (const tileId of ARCADE_ICONED_CORE_TILES) {
    const entries = coreIcons.filter((entry) => entry.tileId === tileId);
    if (entries.length !== 1) failures.push(`${entries.length} core tile icons for ${tileId}`);
    for (const entry of entries) failures.push(...iconPresence(`core tile ${tileId}`, entry.icon));
  }
  const coreTypeIcons = pack ? pack.coreTypeIcons || [] : [];
  for (const typeName of ARCADE_ICONED_CORE_TYPES) {
    const entries = coreTypeIcons.filter((entry) => entry.type === typeName);
    if (entries.length !== 1) failures.push(`${entries.length} core type icons for ${typeName}`);
    for (const entry of entries) failures.push(...iconPresence(`core type ${typeName}`, entry.icon));
  }
  return failures;
}

/** The trace the capture's `TRACE` lines carry, one line each, in order. */
function reportedTrace(log) {
  return linesOf(log)
    .filter((line) => line.startsWith(TRACE_PREFIX))
    .map((line) => `${line.slice(TRACE_PREFIX.length)}\n`)
    .join("");
}

/** Whether `actual` and `expected` hold the same entries, in any order. */
function sameEntries(actual, expected) {
  return [...actual].sort().join("\n") === [...expected].sort().join("\n");
}

/**
 * The ways the structural listing `actual` of the catalog `what` names
 * misses the listing `expected`: the first line where the two part, then
 * `actual` in full. Empty when they match.
 */
function listingFailures(what, actual, expected) {
  if (actual === expected) return [];
  const actualLines = actual.split("\n");
  const expectedLines = expected.split("\n");
  let line = 0;
  while (line < actualLines.length && actualLines[line] === expectedLines[line]) line++;
  const listed = actual
    .trimEnd()
    .split("\n")
    .map((entry) => `      ${entry}`)
    .join("\n");
  return [
    `${what} structure parts from the expected at line ${line + 1}: ` +
      `${JSON.stringify(actualLines[line] ?? "")}, expected ${JSON.stringify(expectedLines[line] ?? "")}`,
    `${what} structure is:\n${listed}`,
  ];
}

/**
 * Reads the catalog payload text `payload`, which `what` names, and holds
 * it to the structural listing `expected`: the payload must be printable
 * ASCII and JSON, and its structural listing must be `expected`.
 *
 * @returns `parsed`, the parsed payload or `null` when it does not parse, and
 *   `failures`, the ways the payload missed; empty when it held.
 */
function payloadStructure(what, payload, expected) {
  if (!PRINTABLE_ASCII.test(payload)) return { parsed: null, failures: [`${what} holds text outside printable ASCII`] };
  let parsed;
  try {
    parsed = JSON.parse(payload);
  } catch (error) {
    return { parsed: null, failures: [`${what} is not JSON: ${error.message}`] };
  }
  return { parsed, failures: listingFailures(what, catalog.structuralListing(parsed), expected) };
}

/**
 * The ways the catalog fixture at `file` misses the parsed catalog payload
 * `parsed`: `<fixture> is not JSON: ...` when it cannot be read as JSON, and
 * `<fixture> is not the catalog the run posted` when it differs; empty when
 * it matches. Refresh a stale fixture from the posted payload.
 */
function fixtureStaleness(file, parsed) {
  const what = path.relative(__dirname, file);
  let fixture;
  try {
    fixture = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    return [`${what} is not JSON: ${error.message}`];
  }
  return util.isDeepStrictEqual(fixture, parsed) ? [] : [`${what} is not the catalog the run posted`];
}

/**
 * The ways the capture's catalog payload misses `EXPECTED_CATALOG_STRUCTURE`
 * or the registration catalog fixture; empty when it holds.
 */
function catalogFailures(log) {
  const payload = catalog.payloadOf(log);
  if (payload === null) return ["no single CATALOG line"];
  const read = payloadStructure("catalog payload", payload, EXPECTED_CATALOG_STRUCTURE);
  return read.parsed ? [...read.failures, ...fixtureStaleness(CATALOG_FIXTURE, read.parsed)] : read.failures;
}

/**
 * The ways the catalog fixtures miss the structural listings the selftest
 * captures are held to: each fixture must parse as JSON and have its
 * catalog's listing.
 */
function fixtureFailures() {
  return [
    ["registration catalog fixture", CATALOG_FIXTURE, EXPECTED_CATALOG_STRUCTURE],
    ["arcade catalog fixture", ARCADE_CATALOG_FIXTURE, EXPECTED_ARCADE_CATALOG_STRUCTURE],
  ].flatMap(([what, file, expected]) => {
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (error) {
      return [`${what} is not JSON: ${error.message}`];
    }
    return listingFailures(what, catalog.structuralListing(parsed), expected);
  });
}

/**
 * Holds one capture to the contract and reports what failed.
 *
 * @returns The reasons the capture failed the contract; empty when it passed.
 */
function contractFailures(exitCode, log) {
  const failures = [];
  if (exitCode !== 0) failures.push(`capture exited ${exitCode}`);
  const checks = reportedChecks(log);
  if (checks.failed.length) failures.push(`checks failed: ${checks.failed.join(", ")}`);
  if (!sameEntries(checks.ok, EXPECTED_CHECKS)) {
    failures.push(`checks reported ok: ${[...checks.ok].sort().join(", ")}`);
  }
  const diagnostics = reportedDiagnostics(log);
  if (!sameEntries(diagnostics, EXPECTED_DIAGNOSTICS)) {
    failures.push(`diagnostics recorded: ${[...diagnostics].sort().join(" | ")}`);
  }
  const rejections = reportedRejections(log);
  if (rejections.join("\n") !== EXPECTED_REJECTIONS.join("\n")) {
    failures.push(`program refusals logged: ${rejections.join(" | ")}`);
  }
  const assetLines = reportedAssetLines(log);
  if (assetLines.join("\n") !== EXPECTED_ASSET_LINES.join("\n")) {
    failures.push(`unresolved assets logged: ${assetLines.join(" | ")}`);
  }
  const faultLines = reportedFaultLines(log);
  if (faultLines.join("\n") !== EXPECTED_FAULT_LINES.join("\n")) {
    failures.push(`program faults logged: ${faultLines.join(" | ")}`);
  }
  failures.push(...catalogFailures(log));
  const trace = reportedTrace(log);
  if (trace !== EXPECTED_TRACE) {
    failures.push(`traced ${JSON.stringify(trace)}`, `reference trace ${JSON.stringify(EXPECTED_TRACE)}`);
  }
  if (!linesOf(log).includes(FAILED_CHECKS_LINE)) failures.push(`no "${FAILED_CHECKS_LINE}" line`);
  return failures;
}

/**
 * Holds one capture of the arcade selftest to its contract and reports what
 * failed.
 *
 * @param exitCode Exit code of the capture.
 * @param log The captured bytes.
 * @param simxLog The capture's simulator message log.
 * @returns The reasons the capture failed the contract; empty when it passed.
 */
function arcadeContractFailures(exitCode, log, simxLog) {
  const failures = [];
  if (exitCode !== 0) failures.push(`capture exited ${exitCode}`);
  const checks = reportedChecks(log);
  if (checks.failed.length) failures.push(`checks failed: ${checks.failed.join(", ")}`);
  if (!sameEntries(checks.ok, EXPECTED_ARCADE_CHECKS)) {
    failures.push(`checks reported ok: ${[...checks.ok].sort().join(", ")}`);
  }
  const rejections = reportedRejections(log);
  if (rejections.join("\n") !== EXPECTED_ARCADE_REJECTIONS.join("\n")) {
    failures.push(`program refusals logged: ${rejections.join(" | ")}`);
  }
  const updates = reportedUpdateLines(log);
  if (updates.join("\n") !== EXPECTED_ARCADE_UPDATE_LINES.join("\n")) {
    failures.push(`program updates logged: ${updates.join(" | ")}`);
  }
  const assetLines = reportedAssetLines(log);
  if (assetLines.join("\n") !== EXPECTED_ARCADE_ASSET_LINES.join("\n")) {
    failures.push(`unresolved assets logged: ${assetLines.join(" | ")}`);
  }
  const brainLines = reportedBrainLines(log);
  if (brainLines.join("\n") !== EXPECTED_ARCADE_BRAIN_LINES.join("\n")) {
    failures.push(`unresolved brains logged: ${brainLines.join(" | ")}`);
  }
  const smoothingLines = reportedSmoothingLines(log);
  if (smoothingLines.join("\n") !== EXPECTED_ARCADE_SMOOTHING_LINES.join("\n")) {
    failures.push(`unusable move smoothing logged: ${smoothingLines.join(" | ")}`);
  }
  const scoreLines = reportedScoreLines(log);
  if (scoreLines.join("\n") !== EXPECTED_ARCADE_SCORE_LINES.join("\n")) {
    failures.push(`unusable scores logged: ${scoreLines.join(" | ")}`);
  }
  const variableLines = reportedVariableLines(log);
  if (variableLines.join("\n") !== EXPECTED_ARCADE_VARIABLE_LINES.join("\n")) {
    failures.push(`brain variable lines logged: ${variableLines.join(" | ")}`);
  }
  const choiceLines = reportedChoiceLines(log);
  if (choiceLines.length > 0) {
    failures.push(`unusable effects or sounds logged: ${choiceLines.join(" | ")}`);
  }
  const faultLines = reportedFaultLines(log);
  if (faultLines.length > 0) {
    failures.push(`program faults logged: ${faultLines.join(" | ")}`);
  }
  const frames = catalog
    .channelMessages(simxLog)
    .filter((message) => message.channel === SIMX_CHANNEL)
    .map((message) => catalog.frameOf(message.text));
  const kinds = frames.map((frame) => frame?.kind ?? "malformed");
  if (kinds.join(" ") !== EXPECTED_ARCADE_FRAME_KINDS.join(" ")) {
    failures.push(`posted [${kinds.join(", ")}] on the simulator extension's channel`);
  }
  const posted = frames.find((frame) => frame?.kind === "catalog");
  if (posted) {
    const read = payloadStructure("posted catalog", posted.payload, EXPECTED_ARCADE_CATALOG_STRUCTURE);
    failures.push(...read.failures);
    if (read.parsed) {
      failures.push(
        ...arcadeIconFailures(read.parsed),
        ...arcadeIconValidityFailures(read.parsed),
        ...fixtureStaleness(ARCADE_CATALOG_FIXTURE, read.parsed)
      );
    }
  }
  failures.push(...debugLoggingFailures(log));
  if (!linesOf(log).includes(FAILED_CHECKS_LINE)) failures.push(`no "${FAILED_CHECKS_LINE}" line`);
  return failures;
}

/**
 * Holds one capture of the arcade ending project of the ending `ending` to
 * its contract and reports what failed.
 *
 * @param ending The ending the project's `main.ts` names.
 * @param exitCode Exit code of the capture.
 * @param log The captured bytes.
 * @returns The reasons the capture failed the contract; empty when it passed.
 */
function arcadeEndingContractFailures(ending, exitCode, log) {
  const failures = [];
  if (exitCode !== 0) failures.push(`capture exited ${exitCode}`);
  const checks = reportedChecks(log);
  if (checks.failed.length) failures.push(`checks failed: ${checks.failed.join(", ")}`);
  if (!sameEntries(checks.ok, EXPECTED_ARCADE_ENDING_CHECKS[ending])) {
    failures.push(`checks reported ok: ${[...checks.ok].sort().join(", ")}`);
  }
  const rejections = reportedRejections(log);
  if (rejections.join("\n") !== ARCADE_HOST_REJECTIONS.join("\n")) {
    failures.push(`program refusals logged: ${rejections.join(" | ")}`);
  }
  const choiceLines = reportedChoiceLines(log);
  if (choiceLines.join("\n") !== EXPECTED_ARCADE_ENDING_CHOICE_LINES[ending].join("\n")) {
    failures.push(`unusable effects or sounds logged: ${choiceLines.join(" | ")}`);
  }
  const faultLines = reportedFaultLines(log);
  if (faultLines.length > 0) {
    failures.push(`program faults logged: ${faultLines.join(" | ")}`);
  }
  failures.push(...debugLoggingFailures(log));
  if (!linesOf(log).includes(FAILED_CHECKS_LINE)) failures.push(`no "${FAILED_CHECKS_LINE}" line`);
  return failures;
}

/**
 * Builds and captures each arcade ending project in `endings` --
 * `{ ending, id, dir }` each -- `options.runs` times.
 *
 * @returns How many captures failed, a failed build counting as one.
 */
function runArcadeEndings(targetDir, targetName, endings, options) {
  let failures = 0;
  for (const project of endings) {
    if (!options.skipBuild) {
      const built = build(targetDir, project.dir);
      if (!built.ok) {
        process.stdout.write(`${targetName}/${project.id}: BUILD FAILED\n${built.output}\n`);
        failures++;
        continue;
      }
    }
    const binary = path.join(project.dir, "built", "debug", "binary.js");
    for (let r = 1; r <= options.runs; r++) {
      const logPath = path.join(project.dir, "built", `capture-run${r}.log`);
      const captured = capture.capture(binary, logPath, { expect: project.id, timeoutSec: 120 });
      const log = fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf8") : "";
      const reasons = arcadeEndingContractFailures(project.ending, captured.code, log);
      process.stdout.write(`${targetName}/${project.id} run ${r}: ${reasons.length ? "FAILED" : "PASS"}\n`);
      for (const line of linesOf(log)) {
        process.stdout.write(`    ${line}\n`);
      }
      for (const reason of reasons) {
        process.stdout.write(`    reason: ${reason}\n`);
      }
      if (reasons.length) failures++;
    }
  }
  return failures;
}

/**
 * Builds and captures the arcade selftest project `options.runs` times.
 *
 * @returns How many captures failed, a failed build counting as one.
 */
function runArcadeSelftest(targetDir, targetName, project, options) {
  if (!options.skipBuild) {
    const built = build(targetDir, project.dir);
    if (!built.ok) {
      process.stdout.write(`${targetName}/${project.id}: BUILD FAILED\n${built.output}\n`);
      return 1;
    }
  }
  const binary = path.join(project.dir, "built", "debug", "binary.js");
  let failures = 0;
  for (let r = 1; r <= options.runs; r++) {
    const logPath = path.join(project.dir, "built", `capture-run${r}.log`);
    const simxLogPath = path.join(project.dir, "built", `capture-run${r}.simx.log`);
    const captured = capture.capture(binary, logPath, { expect: project.id, timeoutSec: 120, simxLogPath });
    const log = fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf8") : "";
    const simxLog = fs.existsSync(simxLogPath) ? fs.readFileSync(simxLogPath, "utf8") : "";
    const reasons = arcadeContractFailures(captured.code, log, simxLog);
    process.stdout.write(`${targetName}/${project.id} run ${r}: ${reasons.length ? "FAILED" : "PASS"}\n`);
    for (const line of linesOf(log)) {
      process.stdout.write(`    ${line}\n`);
    }
    for (const reason of reasons) {
      process.stdout.write(`    reason: ${reason}\n`);
    }
    if (reasons.length) failures++;
  }
  return failures;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  let targets;
  try {
    targets = provision();
  } catch (error) {
    process.stderr.write(`selftest: ${error.message}\n`);
    process.exit(3);
  }

  const fixtureReasons = fixtureFailures();
  process.stdout.write(`catalog fixtures: ${fixtureReasons.length ? "FAILED" : "PASS"}\n`);
  for (const reason of fixtureReasons) {
    process.stdout.write(`    reason: ${reason}\n`);
  }
  let failures = fixtureReasons.length ? 1 : 0;
  for (const targetDir of targets) {
    const targetName = path.basename(targetDir);
    const project = gen.generate(targetDir);

    if (!options.skipBuild) {
      const built = build(targetDir, project.dir);
      if (!built.ok) {
        failures++;
        process.stdout.write(`${targetName}/${project.id}: BUILD FAILED\n${built.output}\n`);
        continue;
      }
    }

    const binary = path.join(project.dir, "built", "debug", "binary.js");
    let firstPayload = null;
    for (let r = 1; r <= options.runs; r++) {
      const logPath = path.join(project.dir, "built", `capture-run${r}.log`);
      const captured = capture.capture(binary, logPath, { expect: project.id, timeoutSec: 120 });
      const log = fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf8") : "";
      const reasons = contractFailures(captured.code, log);
      const payload = catalog.payloadOf(log);
      if (r === 1) firstPayload = payload;
      else if (payload !== firstPayload) reasons.push("catalog payload differs between runs");
      process.stdout.write(`${targetName}/${project.id} run ${r}: ${reasons.length ? "FAILED" : "PASS"}\n`);
      for (const line of linesOf(log)) {
        process.stdout.write(`    ${line}\n`);
      }
      for (const reason of reasons) {
        process.stdout.write(`    reason: ${reason}\n`);
      }
      if (reasons.length) failures++;
    }

    const arcade = gen.generateArcade(targetDir);
    if (arcade) {
      failures += runArcadeSelftest(targetDir, targetName, arcade, options);
      failures += runArcadeEndings(targetDir, targetName, arcade.endings, options);
    }
  }

  process.exit(failures === 0 ? 0 : 1);
}

if (require.main === module) {
  main();
}
