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
 * vocabulary registers cleanly.
 *
 * Usage: node run.js <target-dir>... [--runs 3] [--precision f64]
 *                    [--case <id>]... [--copy-extension] [--skip-build]
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const capture = require("./capture");
const corpus = require("./corpus");
const gen = require("./gen-cases");

const TRACE_START_PREFIX = "SIMCAP START ";
const TRACE_END = "SIMCAP TRACE-END";
const DIAG_PREFIX = "DIAG ";

/** Diagnostic prefix a replay reports a registration problem under. */
const REGISTRATION_DIAG_PREFIX = "registration ";

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

/** Builds one generated project with the target checkout's own pxt CLI, JS only. */
function build(targetDir, projectDir) {
  const pxt = path.join(targetDir, "node_modules", "pxt-core", "built", "pxt.js");
  const run = spawnSync(process.execPath, [pxt, "build", "--debug"], {
    cwd: projectDir,
    encoding: "utf8",
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
      const record = { target: targetName, case: entry.id, runs: [], verdict: "", diagnostics: [], unsupported: [] };
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
        const captured = capture.capture(binary, logPath, { expect: entry.id, timeoutSec: 120 });
        const log = fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf8") : "";
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
      record.verdict = allMatch && !registrationDiagnosed ? "PASS" : "STOPPED";
      if (!allMatch && firstBody !== null) {
        record.divergence = firstDivergence(firstBody, golden);
      }
      if (record.verdict !== "PASS") {
        failures++;
      }
      reportCase(record);
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
