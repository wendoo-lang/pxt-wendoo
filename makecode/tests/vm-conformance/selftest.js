/*
 * Runs the registration selftest through the MakeCode VM extension on every
 * pinned target checkout.
 *
 * For each target: provision it, generate the selftest project and the two
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
 * - one `CATALOG <payload>` line whose payload holds the same fields as
 *   `EXPECTED_CATALOG`, and, across the runs of one target, byte-identical
 *   payloads;
 * - `CHECKS failed 0`, and the run's `SIMCAP PASS` verdict, which the program
 *   only reaches by surviving every diagnostic.
 *
 * On an Arcade target it also builds and captures the arcade selftest
 * project, whose capture must carry one `CHECK <name> ok` line per name in
 * `EXPECTED_ARCADE_CHECKS` and no other check line, the program refusals in
 * `EXPECTED_ARCADE_REJECTIONS` in that order, `CHECKS failed 0`, its
 * `SIMCAP PASS` verdict, and exactly two messages on the simulator
 * extension's channel: the startup ping, then one catalog.
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
  "catalog-serialize-repeatable",
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
];

/**
 * Every refusal a program host is expected to log, as `<code> <id>`, in
 * order: the programs the brains module declares for a superseded format
 * and for a foreign device profile.
 */
const EXPECTED_REJECTIONS = [
  "WENDOO_BINARY_CODEC_UNSUPPORTED_FORMAT_VERSION staleFormat00001",
  "WENDOO_BINARY_CODEC_UNSUPPORTED_DEVICE_PROFILE wrongProfile0001",
];

/** Every registration diagnostic the run is expected to record, as `<code> <name>`. */
const EXPECTED_DIAGNOSTICS = [
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
];

/**
 * Every refusal the arcade selftest is expected to log, as `<code> <id>`, in
 * order: each scene's program host logs the refused programs at its first
 * frame, the game's first scene and then the scene the selftest pushes.
 */
const EXPECTED_ARCADE_REJECTIONS = [...EXPECTED_REJECTIONS, ...EXPECTED_REJECTIONS];

/** The kinds of the frames the arcade selftest must post on the simulator extension's channel, in order. */
const EXPECTED_ARCADE_FRAME_KINDS = ["ping", "catalog"];

/** The simulator extension's channel, which every message the Wendoo extensions post rides. */
const SIMX_CHANNEL = "wendoo-lang/pxt-wendoo";

/**
 * The catalog payload the selftest run is expected to print: the two packs'
 * registered vocabulary under first-wins resolution, the sample metadata the
 * packs declare, and every diagnostic the run provokes.
 */
const EXPECTED_CATALOG = {
  packs: [
    {
      name: "beacon",
      types: [
        {
          name: "Beacon",
          native: true,
          fields: [
            { name: "x", type: "number" },
            { name: "y", type: "number" },
          ],
          label: "Beacon",
          docs: "# Beacon\n\nA beacon at a fixed position, read through its field hooks.",
          icon: "img<beacon>",
        },
      ],
      tiles: [
        {
          name: "sensor.beacon.reading",
          kind: "sensor",
          returns: "string",
          outputs: [{ name: "position", type: "Beacon" }],
          label: "beacon reading",
          group: "Beacons",
          docs: '# Beacon reading\n\nReads the name of the pack whose "reading" tile stands.',
          icon: "img<beacon-reading>",
        },
      ],
      operators: [{ name: "beacon.combine", operands: ["number", "number"], returns: "number" }],
    },
    {
      name: "chime",
      tiles: [
        {
          name: "actuator.chime.ring",
          kind: "actuator",
          args: [
            { name: "times", type: "number", optional: true },
            { name: "loudly", modifier: true },
          ],
          label: "ring the chime",
          group: "Chimes",
          docs: "# Ring the chime\n\nRings the chime once, or `times` times, louder with `loudly`.",
          icon: "img<chime>",
        },
        { name: "sensor.chime.unmapped", kind: "sensor", returns: "number", label: "chime loudness" },
      ],
    },
  ],
  diagnostics: [
    { code: "registration-field-writes-unbound", name: "Beacon", pack: "beacon" },
    { code: "registration-duplicate-name", name: "sensor.beacon.reading", pack: "chime", otherPack: "beacon" },
    { code: "registration-unmapped-name", name: "sensor.chime.unmapped", pack: "chime" },
    { code: "registration-after-snapshot", name: "actuator.chime.late", pack: "selftest" },
    { code: "catalog-icon-unencodable", name: "sensor.chime.unmapped", pack: "chime" },
  ],
};

const CHECK_PREFIX = "CHECK ";
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

/** Whether `actual` and `expected` hold the same entries, in any order. */
function sameEntries(actual, expected) {
  return [...actual].sort().join("\n") === [...expected].sort().join("\n");
}

/** The ways the capture's catalog payload misses `EXPECTED_CATALOG`; empty when it matches. */
function catalogFailures(log) {
  const payload = catalog.payloadOf(log);
  if (payload === null) return ["no single CATALOG line"];
  let parsed;
  try {
    parsed = JSON.parse(payload);
  } catch (error) {
    return [`catalog payload is not JSON: ${error.message}`];
  }
  if (!catalog.sameJson(parsed, EXPECTED_CATALOG)) {
    return [`catalog payload is ${JSON.stringify(catalog.canonical(parsed))}`];
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
  const kinds = catalog
    .channelMessages(simxLog)
    .filter((message) => message.channel === SIMX_CHANNEL)
    .map((message) => catalog.frameOf(message.text)?.kind ?? "malformed");
  if (kinds.join(" ") !== EXPECTED_ARCADE_FRAME_KINDS.join(" ")) {
    failures.push(`posted [${kinds.join(", ")}] on the simulator extension's channel`);
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
