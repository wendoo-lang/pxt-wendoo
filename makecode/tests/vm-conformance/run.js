/*
 * Replays the shared conformance corpus through the MakeCode VM extension and
 * compares each capture to the committed observable trace, byte for byte.
 *
 * For every target checkout given: generate one pxt project per corpus case,
 * build each project JS-only, capture its run N times, and report the verdict
 * and the sha256 of every capture.
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

  const results = [];
  let failures = 0;

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
      const record = { target: targetName, case: entry.id, runs: [], verdict: "", diagnostics: [] };
      results.push(record);

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

      record.verdict = allMatch ? "PASS" : "STOPPED";
      if (!allMatch) {
        failures++;
        if (firstBody !== null) {
          record.divergence = firstDivergence(firstBody, golden);
        }
      }
      reportCase(record);
    }
  }

  process.stdout.write(`\n${JSON.stringify({ precision: options.precision, results }, null, 2)}\n`);
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
