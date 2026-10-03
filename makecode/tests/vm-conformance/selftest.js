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
 * - one `CATALOG <payload>` line whose payload is `EXPECTED_CATALOG`'s
 *   bytes, and, across the runs of one target, byte-identical payloads;
 * - `CHECKS failed 0`, and the run's `SIMCAP PASS` verdict, which the program
 *   only reaches by surviving every diagnostic.
 *
 * On an Arcade target it also builds and captures the arcade selftest
 * project, whose capture must carry one `CHECK <name> ok` line per name in
 * `EXPECTED_ARCADE_CHECKS` and no other check line, the program refusals in
 * `EXPECTED_ARCADE_REJECTIONS` in that order, the program-update lines in
 * `EXPECTED_ARCADE_UPDATE_LINES` in that order and no other, `CHECKS failed 0`, its
 * `SIMCAP PASS` verdict, and exactly two messages on the simulator
 * extension's channel: the startup ping, then one catalog whose payload is
 * `EXPECTED_ARCADE_CATALOG`'s bytes.
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
  "action-output-readable-by-name",
  "action-output-core-typed-readable-by-name",
  "catalog-serialize-repeatable",
  "slot-builders-carry-labels",
  "language-builders-carry-words",
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
];

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
 * check's host, then the host the pack-tile program is traced on.
 */
const EXPECTED_REJECTIONS = [...HOST_REJECTIONS, ...HOST_REJECTIONS];

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
];

/** Every check the arcade selftest is expected to report, and to report as holding. */
const EXPECTED_ARCADE_CHECKS = [
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
  "a-shared-center-adds-nothing-to-pursuit",
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
];

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
 * frame -- the game's first scene, the scene the selftest pushes to check
 * paused programs, the scene it pushes to check paused program updates, the
 * scene it pushes to check the bump sensor, the scene it pushes to check the
 * move's toward and away modifiers, and the scene it pushes to check the
 * in-range and out-of-range sensors.
 */
const EXPECTED_ARCADE_REJECTIONS = [
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

/** Builds the generated project with the target checkout's own pxt CLI, JS only. */
function build(targetDir, projectDir) {
  const pxt = path.join(targetDir, "node_modules", "pxt-core", "built", "pxt.js");
  const run = spawnSync(process.execPath, [pxt, "build", "--debug"], { cwd: projectDir, encoding: "utf8" });
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
