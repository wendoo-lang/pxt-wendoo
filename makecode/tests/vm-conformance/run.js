/*
 * Replays the shared conformance corpus through the MakeCode VM extension and
 * compares each capture to the committed observable trace, byte for byte.
 *
 * For every target checkout given: generate one pxt project per corpus case,
 * build each project JS-only, capture its run N times, and report the verdict
 * and the sha256 of every capture.
 *
 * A case whose compiled program carries an opcode listed in
 * `unsupported-opcodes.json` is classified SKIP, naming the opcodes, and does
 * not fail the run. A case that is not skipped is held to the golden in full:
 * hitting the extension's unimplemented-opcode fault still fails it, and so
 * does a replay that reports a registration diagnostic -- the corpus
 * vocabulary registers cleanly -- or that does not post exactly two messages
 * on the simulator extension's channel (`SIMX_CHANNEL` in
 * `makecode/simx/bridge/src/sim-channel.ts`): the extension's startup ping,
 * then its catalog.
 *
 * Each target also builds and captures the catalog project twice. Each
 * capture delivers one request on the simulator extension's channel once the
 * program's top-level code has finished, and must post exactly three messages
 * on it: the startup ping, the catalog published after the drain, and the
 * catalog answering the request. Each message must be a channel frame
 * declaring the channel version the simulator extension reads
 * (`SIM_CHANNEL_VERSION` in the same file); the ping's payload is empty, and
 * each catalog's payload is the bytes of the `CATALOG` line the run prints.
 * That payload is held to its expected entries and must be byte-identical
 * across the captures. A `--case` filter skips the catalog capture.
 *
 * Usage: node run.js <target-dir>... [--runs 3] [--precision f64]
 *                    [--case <id>]... [--copy-extension] [--skip-build]
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const capture = require("./capture");
const catalog = require("./catalog");
const corpus = require("./corpus");
const gen = require("./gen-cases");

const TRACE_START_PREFIX = "SIMCAP START ";
const TRACE_END = "SIMCAP TRACE-END";
const DIAG_PREFIX = "DIAG ";

/** Diagnostic prefix a replay reports a registration problem under. */
const REGISTRATION_DIAG_PREFIX = "registration ";

/**
 * Source file declaring the simulator extension's channel, as `SIMX_CHANNEL`,
 * and the channel version it reads, as `SIM_CHANNEL_VERSION`.
 */
const SIMX_CHANNEL_SOURCE_PATH = path.join(__dirname, "..", "..", "simx", "bridge", "src", "sim-channel.ts");

/** Committed list of the opcodes the MakeCode VM extension does not dispatch. */
const UNSUPPORTED_OPCODES_PATH = path.join(__dirname, "unsupported-opcodes.json");

function usage(message) {
  process.stderr.write(`run: ${message}\n`);
  process.stderr.write(
    "Usage: node run.js <target-dir>... [--runs 3] [--precision f64] [--case <id>]... " +
      "[--copy-extension] [--skip-build]\n"
  );
  process.exit(2);
}

function parseArgs(argv) {
  const options = { targets: [], runs: 3, precision: "f64", cases: [], copyExtension: false, skipBuild: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--runs") options.runs = Number.parseInt(argv[++i], 10);
    else if (a === "--precision") options.precision = argv[++i];
    else if (a === "--case") options.cases.push(argv[++i]);
    else if (a === "--copy-extension") options.copyExtension = true;
    else if (a === "--skip-build") options.skipBuild = true;
    else if (a.startsWith("--")) usage(`unknown argument: ${a}`);
    else options.targets.push(path.resolve(a));
  }
  if (!options.targets.length) usage("at least one target checkout is required");
  if (!Number.isInteger(options.runs) || options.runs < 1) usage("--runs must be a positive integer");
  return options;
}

/** Builds one generated project with the target checkout's own pxt CLI, JS only, collecting its whole output however long. */
function build(targetDir, projectDir) {
  const pxt = path.join(targetDir, "node_modules", "pxt-core", "built", "pxt.js");
  const run = spawnSync(process.execPath, [pxt, "build", "--debug"], {
    cwd: projectDir,
    encoding: "utf8",
    maxBuffer: Number.POSITIVE_INFINITY,
  });
  return { ok: run.status === 0, output: (run.stdout || "") + (run.stderr || "") };
}

/**
 * The trace body of a capture: the lines strictly between the case's
 * `SIMCAP START` marker and `SIMCAP TRACE-END`, with the trailing newline the
 * trace format requires.
 */
function traceBody(log, caseId) {
  const lines = log.split("\n");
  const start = lines.indexOf(TRACE_START_PREFIX + caseId);
  if (start < 0) return null;
  const end = lines.indexOf(TRACE_END, start);
  if (end < 0) return null;
  return `${lines.slice(start + 1, end).join("\n")}\n`;
}

/** The diagnostic lines a capture emitted after its trace body. */
function diagnostics(log) {
  return log
    .split("\n")
    .filter((line) => line.startsWith(DIAG_PREFIX))
    .map((line) => line.slice(DIAG_PREFIX.length));
}

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

/** The unsupported-opcode list, as a map from opcode number to opcode name. */
function readUnsupportedOpcodes() {
  const declared = JSON.parse(fs.readFileSync(UNSUPPORTED_OPCODES_PATH, "utf8")).opcodes;
  return new Map(declared.map((entry) => [entry.op, entry.name]));
}

/**
 * The names of the unsupported opcodes a case's compiled program carries, in
 * opcode order and without repeats. An empty array means the extension
 * dispatches every opcode the case can reach.
 *
 * @param caseId Manifest id of the case to scan.
 * @param unsupported Opcode number to opcode name, from `readUnsupportedOpcodes`.
 */
function unsupportedOpcodesOfCase(caseId, unsupported) {
  const hit = new Set();
  for (const fn of corpus.programJson(caseId).program.functions) {
    for (const instruction of fn.code) {
      if (unsupported.has(instruction.op)) hit.add(instruction.op);
    }
  }
  return [...hit].sort((a, b) => a - b).map((op) => unsupported.get(op));
}

/** The channel version the simulator extension reads, as its source declares it. */
function simxChannelVersion() {
  const declared = /export const SIM_CHANNEL_VERSION = (\d+);/.exec(fs.readFileSync(SIMX_CHANNEL_SOURCE_PATH, "utf8"));
  if (!declared) throw new Error(`no SIM_CHANNEL_VERSION declaration in ${SIMX_CHANNEL_SOURCE_PATH}`);
  return Number(declared[1]);
}

/** The simulator extension's channel, as its source declares it. */
function simxChannel() {
  const declared = /export const SIMX_CHANNEL = "([^"]+)";/.exec(fs.readFileSync(SIMX_CHANNEL_SOURCE_PATH, "utf8"));
  if (!declared) throw new Error(`no SIMX_CHANNEL declaration in ${SIMX_CHANNEL_SOURCE_PATH}`);
  return declared[1];
}

/** The kinds of the frames a replay of a corpus case must post on the simulator extension's channel, in order. */
const CASE_FRAME_KINDS = ["ping", "catalog"];

/** The kinds of the frames a catalog capture must post on the simulator extension's channel, in order. */
const CATALOG_FRAME_KINDS = ["ping", "catalog", "catalog"];

/**
 * The kind of each message in `posted`, in order: the kind of its channel
 * frame, or `"malformed"` for a message that declares no channel version.
 */
function frameKinds(posted) {
  return posted.map((text) => catalog.frameOf(text)?.kind ?? "malformed");
}

/** Whether `kinds`, the frame kinds one capture of a corpus case posted, are exactly `CASE_FRAME_KINDS`. */
function postedCaseFrames(kinds) {
  return kinds.join(" ") === CASE_FRAME_KINDS.join(" ");
}

/** How many captures of the catalog project one harness run compares. */
const CATALOG_RUNS = 2;

/** Entries the conformance catalog must carry verbatim, keyed by section then entry name. */
const EXPECTED_CATALOG_ENTRIES = {
  types: {
    Point: {
      name: "Point",
      fields: [
        { name: "x", type: "number" },
        { name: "y", type: "number" },
      ],
    },
    Anchor: {
      name: "Anchor",
      native: true,
      fields: [
        { name: "x", type: "number" },
        { name: "y", type: "number" },
      ],
    },
    Target: { name: "Target", native: true, fields: [{ name: "value", type: "number", readOnly: true }] },
  },
  tiles: {
    "sensor.conformance.defer-anchor": {
      name: "sensor.conformance.defer-anchor",
      kind: "sensor",
      async: true,
      returns: "Anchor",
      label: "defer anchor",
    },
    "actuator.conformance.defer-echo": {
      name: "actuator.conformance.defer-echo",
      kind: "actuator",
      async: true,
      args: [
        { name: "value", tileId: "anon.number", type: "number", anonymous: true },
        { name: "ticks", tileId: "conformance.ticks", type: "number", default: { t: 3, v: 1 } },
      ],
      label: "defer echo",
    },
    "actuator.conformance.emit-all": {
      name: "actuator.conformance.emit-all",
      kind: "actuator",
      args: [{ name: "value", tileId: "conformance.value", type: "any", repeated: true, anonymous: true }],
      label: "emit all",
    },
  },
  operators: {
    "conformance.point-add": { name: "conformance.point-add", operands: ["Point", "Point"], returns: "Point" },
  },
  overloads: {
    "eq(Point,Point)": { name: "eq(Point,Point)", operator: "eq", operands: ["Point", "Point"], returns: "boolean" },
  },
};

/** The ways `payload` misses the expected conformance catalog; empty when it carries every entry. */
function catalogProblems(payload) {
  let parsed;
  try {
    parsed = JSON.parse(payload);
  } catch (error) {
    return [`payload is not JSON: ${error.message}`];
  }
  const pack = (parsed.packs || []).find((entry) => entry.name === "conformance");
  if (!pack) return ["no conformance pack in payload"];
  const problems = [];
  for (const [section, expectedEntries] of Object.entries(EXPECTED_CATALOG_ENTRIES)) {
    for (const [name, expected] of Object.entries(expectedEntries)) {
      const actual = (pack[section] || []).find((entry) => entry.name === name);
      if (!actual) {
        problems.push(`no ${section} entry ${name}`);
      } else if (!catalog.sameJson(actual, expected)) {
        problems.push(
          `${section} entry ${name} is ${JSON.stringify(catalog.canonical(actual))}, ` +
            `expected ${JSON.stringify(catalog.canonical(expected))}`
        );
      }
    }
  }
  if (parsed.diagnostics) problems.push("payload carries registration diagnostics");
  return problems;
}

/**
 * Builds and captures the catalog project `CATALOG_RUNS` times, and holds
 * the payload to the expected entries, byte-identical across the captures.
 *
 * @returns The catalog record: target, case id, per-capture payload hashes,
 *   verdict, and the problems found.
 */
function runCatalogCheck(targetDir, targetName, options) {
  const project = gen.generateCatalogProject(targetDir, { copyExtension: options.copyExtension });
  const record = { target: targetName, case: project.id, runs: [], verdict: "", problems: [] };

  if (!options.skipBuild) {
    const built = build(targetDir, project.dir);
    if (!built.ok) {
      record.verdict = "BUILD FAILED";
      record.buildOutput = built.output;
      process.stdout.write(`${targetName}/${project.id}: BUILD FAILED\n${built.output}\n`);
      return record;
    }
  }

  const binary = path.join(project.dir, "built", "debug", "binary.js");
  const channelVersion = simxChannelVersion();
  const payloads = [];
  for (let r = 1; r <= CATALOG_RUNS; r++) {
    const logPath = path.join(project.dir, "built", `capture-run${r}.log`);
    const simxLogPath = path.join(project.dir, "built", `capture-run${r}.simx.log`);
    const captured = capture.capture(binary, logPath, {
      expect: project.id,
      timeoutSec: 120,
      simxLogPath,
      simxRequest: simxChannel(),
    });
    const log = fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf8") : "";
    const payload = catalog.payloadOf(log);
    payloads.push(payload);
    const posted = simxChannelMessages(simxLogPath);
    record.runs.push({
      run: r,
      exit: captured.code,
      sha256: payload === null ? null : sha256(payload),
      channelSha256: posted.map(sha256),
    });
    const kinds = frameKinds(posted);
    if (kinds.join(" ") !== CATALOG_FRAME_KINDS.join(" ")) {
      record.problems.push(
        `capture ${r} posted [${kinds.join(", ")}] on the simulator extension's channel, ` +
          `expected [${CATALOG_FRAME_KINDS.join(", ")}]`
      );
    } else {
      const frames = posted.map(catalog.frameOf);
      for (const frame of frames) {
        if (frame.version !== channelVersion) {
          record.problems.push(
            `capture ${r} posted a channel message declaring channel version ${frame.version}, ` +
              `the simulator extension reads ${channelVersion}`
          );
        }
      }
      if (frames.slice(1).some((frame) => frame.payload !== payload)) {
        record.problems.push(`capture ${r} posted a catalog other than its CATALOG payload`);
      }
    }
  }

  if (payloads.some((payload) => payload === null)) {
    record.problems.push("a capture printed no single CATALOG line");
  } else if (new Set(payloads).size !== 1) {
    record.problems.push("payload differs between captures");
  } else {
    record.problems.push(...catalogProblems(payloads[0]));
  }
  record.verdict = record.problems.length ? "STOPPED" : "PASS";

  const shas = record.runs.map((run) => (run.sha256 || "<no payload>").slice(0, 16)).join(" ");
  const channelShas = record.runs.map((run) => run.channelSha256.map((sha) => sha.slice(0, 16)).join("+")).join(" ");
  process.stdout.write(
    `${targetName}/${record.case}: ${record.verdict}  sha256[0:16]=${shas}  channel sha256[0:16]=${channelShas}\n`
  );
  for (const problem of record.problems) {
    process.stdout.write(`    problem: ${problem}\n`);
  }
  return record;
}

/**
 * The texts of the messages a capture posted on the simulator extension's
 * channel, in posting order, read from its simulator message log; empty when
 * the log is absent.
 */
function simxChannelMessages(simxLogPath) {
  const simxLog = fs.existsSync(simxLogPath) ? fs.readFileSync(simxLogPath, "utf8") : "";
  const channel = simxChannel();
  return catalog
    .channelMessages(simxLog)
    .filter((message) => message.channel === channel)
    .map((message) => message.text);
}

/** The first line where `actual` and `expected` differ, or null when they match. */
function firstDivergence(actual, expected) {
  const a = actual.split("\n");
  const b = expected.split("\n");
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      return { line: i + 1, actual: a[i], expected: b[i] };
    }
  }
  return null;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const manifest = corpus.readManifest();
  const wanted = options.cases.length ? manifest.cases.filter((c) => options.cases.includes(c.id)) : manifest.cases;
  if (!wanted.length) usage("no corpus case matched --case");

  const unsupported = readUnsupportedOpcodes();
  const results = [];
  let failures = 0;
  let skipped = 0;

  for (const targetDir of options.targets) {
    const targetName = path.basename(targetDir);
    const projects = gen.generate(targetDir, {
      precision: options.precision,
      copyExtension: options.copyExtension,
    });
    const byId = new Map(projects.map((p) => [p.id, p.dir]));

    for (const entry of wanted) {
      const projectDir = byId.get(entry.id);
      if (!projectDir) continue;
      const record = {
        target: targetName,
        case: entry.id,
        runs: [],
        verdict: "",
        diagnostics: [],
        unsupported: [],
        channelFrames: [],
      };
      results.push(record);

      record.unsupported = unsupportedOpcodesOfCase(entry.id, unsupported);
      if (record.unsupported.length) {
        record.verdict = `SKIP (unsupported: ${record.unsupported.join(", ")})`;
        skipped++;
        process.stdout.write(`${targetName}/${entry.id}: ${record.verdict}\n`);
        continue;
      }

      if (!options.skipBuild) {
        const built = build(targetDir, projectDir);
        if (!built.ok) {
          record.verdict = "BUILD FAILED";
          record.buildOutput = built.output;
          failures++;
          process.stdout.write(`${targetName}/${entry.id}: BUILD FAILED\n${built.output}\n`);
          continue;
        }
      }

      const binary = path.join(projectDir, "built", "debug", "binary.js");
      const golden = corpus.goldenTrace(entry.id, options.precision);
      let allMatch = true;
      let firstBody = null;

      for (let r = 1; r <= options.runs; r++) {
        const logPath = path.join(projectDir, "built", `capture-run${r}.log`);
        const simxLogPath = path.join(projectDir, "built", `capture-run${r}.simx.log`);
        const captured = capture.capture(binary, logPath, { expect: entry.id, timeoutSec: 120, simxLogPath });
        const log = fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf8") : "";
        record.channelFrames.push(frameKinds(simxChannelMessages(simxLogPath)));
        const body = traceBody(log, entry.id);
        const run = {
          run: r,
          exit: captured.code,
          sha256: body === null ? null : sha256(body),
          matches: body !== null && body === golden,
        };
        record.runs.push(run);
        if (!run.matches) allMatch = false;
        if (r === 1) {
          firstBody = body;
          record.diagnostics = diagnostics(log);
        }
      }

      const registrationDiagnosed = record.diagnostics.some((diag) => diag.startsWith(REGISTRATION_DIAG_PREFIX));
      const framesPosted = record.channelFrames.every(postedCaseFrames);
      record.verdict = allMatch && !registrationDiagnosed && framesPosted ? "PASS" : "STOPPED";
      if (!allMatch && firstBody !== null) {
        record.divergence = firstDivergence(firstBody, golden);
      }
      if (record.verdict !== "PASS") {
        failures++;
      }
      reportCase(record);
    }

    if (!options.cases.length) {
      const catalogRecord = runCatalogCheck(targetDir, targetName, options);
      results.push(catalogRecord);
      if (catalogRecord.verdict !== "PASS") {
        failures++;
      }
    }
  }

  process.stdout.write(`\n${JSON.stringify({ precision: options.precision, skipped, results }, null, 2)}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

function reportCase(record) {
  const shas = record.runs.map((r) => (r.sha256 || "<no trace>").slice(0, 16)).join(" ");
  process.stdout.write(`${record.target}/${record.case}: ${record.verdict}  sha256[0:16]=${shas}\n`);
  for (const diag of record.diagnostics) {
    process.stdout.write(`    diag: ${diag}\n`);
  }
  if (!record.channelFrames.every(postedCaseFrames)) {
    const perCapture = record.channelFrames.map((kinds) => `[${kinds.join(", ")}]`).join(" ");
    process.stdout.write(
      `    simulator extension channel frames per capture: ${perCapture}, ` +
        `expected [${CASE_FRAME_KINDS.join(", ")}] each\n`
    );
  }
  if (record.divergence) {
    process.stdout.write(
      "    first divergence at line " +
        record.divergence.line +
        "\n      actual:   " +
        String(record.divergence.actual) +
        "\n      expected: " +
        String(record.divergence.expected) +
        "\n"
    );
  }
}

if (require.main === module) {
  main();
}
