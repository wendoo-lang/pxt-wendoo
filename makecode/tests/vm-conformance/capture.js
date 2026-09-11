/*
 * Runs a pxt-compiled program headlessly and captures the lines it prints.
 *
 * The capture backend is the proven headless-sim runner, invoked as a child
 * process with its own argument shape and exit codes. Callers reach it only
 * through this module, so the backend can be swapped for pxt's own tests/ab
 * framework without touching them.
 *
 * exit 0  SIMCAP PASS seen
 * exit 1  ASSERT seen, or the program faulted
 * exit 2  timeout with neither
 * exit 3  host problem
 */
const { spawnSync } = require("child_process");
const path = require("path");

const RUNNER = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "generated-docs",
  "simcap-prototype-2026-09-11",
  "run-capture-sim.js"
);

/**
 * Executes the built binary at `binaryPath` and writes its captured output to
 * `logPath`.
 *
 * @param binaryPath Built `binary.js` of a pxt project.
 * @param logPath File the captured bytes are written to.
 * @param options `expect` names the case the runner's verdict looks for;
 *   `timeoutSec` bounds the run.
 * @returns `{ code, stdout, stderr }` of the capture process.
 */
function capture(binaryPath, logPath, options) {
  const args = [RUNNER, binaryPath, logPath];
  if (options?.expect) args.push("--expect", options.expect);
  if (options?.timeoutSec) args.push("--timeout", String(options.timeoutSec));
  const run = spawnSync(process.execPath, args, { encoding: "utf8" });
  return { code: run.status, stdout: run.stdout || "", stderr: run.stderr || "" };
}

module.exports = { capture, RUNNER };
