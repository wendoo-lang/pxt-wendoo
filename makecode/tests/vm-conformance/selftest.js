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
 * - one `CATALOG <payload>` line whose payload is `EXPECTED_CATALOG`'s
 *   bytes, and, across the runs of one target, byte-identical payloads;
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
 * that order and no other, no program-fault line, a `DEBUG ON` line no line the Wendoo extensions log precedes,
 * `CHECKS failed 0`, its `SIMCAP PASS` verdict, and exactly two
 * messages on the simulator extension's channel: the startup ping, then one
 * catalog whose payload is `EXPECTED_ARCADE_CATALOG`'s bytes, its types,
 * accessors, tiles, modifier slots, core tile icon entries and core type
 * icon entries carrying 16 by 16 icons.
 *
 * Usage: node selftest.js [--runs 2] [--skip-build]
 */
const fs = require("fs");
const path = require("path");
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
  "host-lists-the-worlds-running-a-brain",
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
  "equality-overloads-take-their-ids-from-the-manifest",
  "image-equality-reads-pixels-whether-a-sprite-wears-the-image-or-an-asset-names-it",
  "an-image-standing-for-no-image-equals-nothing-not-even-another",
  "sprite-equality-is-identity-and-a-destroyed-or-missing-sprite-equals-nothing",
  "brain-equality-compares-document-ids-whether-or-not-a-brain-holds-them",
  "an-image-comparison-rule-fires-while-its-sprite-wears-a-look-alike-of-the-asset",
  "an-image-inequality-rule-fires-while-its-sprite-wears-another-image",
  "a-sprite-comparison-rule-fires-while-the-sprite-in-range-is-the-bumped-sprite",
  "a-brain-comparison-rule-fires-while-the-bumped-sprite-runs-its-own-sprites-brain",
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

/** The arcade base pack's tiles whose catalog entries must carry an icon. */
const ARCADE_ICONED_TILES = [
  "sensor.arcade.dpad",
  "actuator.arcade.move",
  "sensor.arcade.bump",
  "sensor.arcade.in-range",
  "sensor.arcade.out-of-range",
  "sensor.arcade.myself",
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
const ARCADE_ICONED_TYPES = ["Vector2", "Sprite", "Brain"];

/** The fields whose accessor tiles the arcade base pack's catalog must give a 16 by 16 icon, each as `Type.field`. */
const ARCADE_ICONED_ACCESSORS = ["Vector2.x", "Vector2.y", "Sprite.image", "Sprite.position", "Sprite.brain"];

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
 * targets the move's toward and away carry, the move's wander, and the
 * equality operators' overloads.
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
];

/**
 * Every line the arcade selftest's program updates are expected to log, in
 * order, each without its `wendoo ` prefix: the update taken, the three
 * updates refused -- a foreign device profile, then an action id and a type
 * atom the project's ids module does not hold -- the three messages refused,
 * the paused scene's program update taken, the removal taken, the bump
 * rule's update taken, the pursuit rule's update to flight taken, and the
 * in-range rule's update to out of range taken.
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

/**
 * The catalog payload the arcade selftest game is expected to post, byte for
 * byte: the arcade base pack's vocabulary. The editor's golden-program
 * tooling reads the same file as the session catalog the arcade selftest's
 * allocation and programs are made from.
 */
const EXPECTED_ARCADE_CATALOG = JSON.parse(
  fs.readFileSync(path.join(__dirname, "selftest", "arcade", "catalog.json"), "utf8")
);

/** The simulator extension's channel, which every message the Wendoo extensions post rides. */
const SIMX_CHANNEL = "wendoo-lang/pxt-wendoo";

/**
 * The catalog payload the selftest run is expected to print, byte for byte:
 * the three packs' registered vocabulary under first-wins resolution, the
 * sample metadata and argument grammars the packs declare, and every
 * diagnostic the run provokes. Key order in every object is the payload's
 * own key order; {@link asciiJson} renders it to the expected bytes. The
 * editor's golden-program tooling reads the same file as the session catalog
 * its allocation and programs are made from.
 */
const EXPECTED_CATALOG = JSON.parse(fs.readFileSync(path.join(__dirname, "selftest", "catalog.json"), "utf8"));

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

/**
 * The bits per pixel, width and height an icon's catalog text declares, and
 * whether its byte count is the one they imply: the text is lowercase hex of
 * a MakeCode image buffer -- 0x87, the bits per pixel (1 or 4), the width and
 * the height each a little-endian 16-bit integer, two zero bytes, then each
 * column, 1 bit per pixel padded to whole bytes or 4 bits per pixel padded to
 * a multiple of 4 bytes. `null` when the text is not hex or not such a buffer.
 */
function iconShape(text) {
  if (typeof text !== "string" || !/^([0-9a-f]{2})+$/.test(text)) return null;
  const bytes = [];
  for (let i = 0; i < text.length; i += 2) bytes.push(Number.parseInt(text.slice(i, i + 2), 16));
  if (bytes.length < 8 || bytes[0] !== 0x87 || (bytes[1] !== 1 && bytes[1] !== 4)) return null;
  const bpp = bytes[1];
  const width = bytes[2] | (bytes[3] << 8);
  const height = bytes[4] | (bytes[5] << 8);
  const column = bpp === 1 ? (height + 7) >> 3 : ((height * 4 + 31) >> 5) << 2;
  return { bpp, width, height, sized: bytes.length === 8 + width * column };
}

/** The ways the icon text `text` misses a 16 by 16 icon's shape, each naming `what`. */
function iconProblems(what, text) {
  if (text === undefined) return [`${what} carries no icon`];
  const shape = iconShape(text);
  if (shape === null || shape.width !== ARCADE_ICON_SIZE || shape.height !== ARCADE_ICON_SIZE || !shape.sized) {
    return [`${what} carries an icon of shape ${JSON.stringify(shape)}`];
  }
  return [];
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
 * The ways the arcade catalog payload `payload` misses its icons: each type
 * in `ARCADE_ICONED_TYPES`, each accessor in `ARCADE_ICONED_ACCESSORS`, each
 * tile in `ARCADE_ICONED_TILES`, each slot of
 * any tile a modifier in `ARCADE_ICONED_MODIFIERS` fills, exactly one core
 * tile icon entry for each core tile in `ARCADE_ICONED_CORE_TILES`, and exactly
 * one core type icon entry for each core type in `ARCADE_ICONED_CORE_TYPES`,
 * carries an icon of 16 by 16 pixels.
 */
function arcadeIconFailures(payload) {
  const pack = JSON.parse(payload).packs.find((entry) => entry.name === "arcade");
  const tiles = pack ? pack.tiles : [];
  const types = pack ? pack.types : [];
  const failures = [];
  for (const name of ARCADE_ICONED_TYPES) {
    const type = types.find((entry) => entry.name === name);
    failures.push(...(type ? iconProblems(`type ${name}`, type.icon) : [`no type ${name}`]));
  }
  for (const name of ARCADE_ICONED_ACCESSORS) {
    const [typeName, fieldName] = name.split(".");
    const type = types.find((entry) => entry.name === typeName);
    const declared = type ? (type.fields || []).find((entry) => entry.name === fieldName) : undefined;
    failures.push(
      ...(declared?.accessor ? iconProblems(`accessor ${name}`, declared.accessor.icon) : [`no accessor ${name}`])
    );
  }
  for (const name of ARCADE_ICONED_TILES) {
    const tile = tiles.find((entry) => entry.name === name);
    failures.push(...(tile ? iconProblems(`tile ${name}`, tile.icon) : [`no tile ${name}`]));
  }
  for (const tileId of ARCADE_ICONED_MODIFIERS) {
    const slots = tiles.flatMap((tile) =>
      grammarSlots(tile.args || tile.call).map((slot) => ({ tile: tile.name, slot }))
    );
    const filling = slots.filter((entry) => entry.slot.tileId === tileId);
    if (filling.length === 0) failures.push(`no slot ${tileId}`);
    for (const entry of filling) failures.push(...iconProblems(`slot ${tileId} of ${entry.tile}`, entry.slot.icon));
  }
  const coreIcons = pack ? pack.coreTileIcons || [] : [];
  for (const tileId of ARCADE_ICONED_CORE_TILES) {
    const entries = coreIcons.filter((entry) => entry.tileId === tileId);
    if (entries.length !== 1) failures.push(`${entries.length} core tile icons for ${tileId}`);
    for (const entry of entries) failures.push(...iconProblems(`core tile ${tileId}`, entry.icon));
  }
  const coreTypeIcons = pack ? pack.coreTypeIcons || [] : [];
  for (const typeName of ARCADE_ICONED_CORE_TYPES) {
    const entries = coreTypeIcons.filter((entry) => entry.type === typeName);
    if (entries.length !== 1) failures.push(`${entries.length} core type icons for ${typeName}`);
    for (const entry of entries) failures.push(...iconProblems(`core type ${typeName}`, entry.icon));
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
 * JSON text of `value` as the catalog serializer writes it: keys in
 * insertion order, no whitespace, and every code unit outside printable
 * ASCII escaped to a lowercase `\uXXXX`.
 */
function asciiJson(value) {
  return JSON.stringify(value).replace(
    /[\u007f-\uffff]/g,
    (unit) => `\\u${unit.charCodeAt(0).toString(16).padStart(4, "0")}`
  );
}

/** The ways the capture's catalog payload misses `EXPECTED_CATALOG`; empty when it matches byte for byte. */
function catalogFailures(log) {
  const payload = catalog.payloadOf(log);
  if (payload === null) return ["no single CATALOG line"];
  const expected = asciiJson(EXPECTED_CATALOG);
  if (payload !== expected) {
    return [`catalog payload is ${payload}`, `expected payload is ${expected}`];
  }
  return [];
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
  const expected = asciiJson(EXPECTED_ARCADE_CATALOG);
  if (posted && posted.payload !== expected) {
    failures.push(`posted catalog ${posted.payload}`, `expected catalog ${expected}`);
  }
  if (posted) failures.push(...arcadeIconFailures(posted.payload));
  failures.push(...debugLoggingFailures(log));
  if (!linesOf(log).includes(FAILED_CHECKS_LINE)) failures.push(`no "${FAILED_CHECKS_LINE}" line`);
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

  let failures = 0;
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
    if (arcade) failures += runArcadeSelftest(targetDir, targetName, arcade, options);
  }

  process.exit(failures === 0 ? 0 : 1);
}

if (require.main === module) {
  main();
}
