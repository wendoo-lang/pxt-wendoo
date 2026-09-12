/*
 * One-command entry to the conformance corpus: provisions the pinned target
 * checkouts, then replays the corpus through them with `run.js`.
 *
 * Every argument is forwarded to `run.js` after the provisioned target
 * directories, so its options (`--runs`, `--precision`, `--case`, ...) work
 * here unchanged, and this process exits with `run.js`'s exit code.
 *
 * Usage: node cli.js [--runs 3] [run.js option]...
 */
const path = require("path");
const { spawnSync } = require("child_process");

const { provision } = require("./provision");

const RUN = path.join(__dirname, "run.js");

function main() {
  let targets;
  try {
    targets = provision();
  } catch (error) {
    process.stderr.write(`conformance: ${error.message}\n`);
    process.exit(3);
  }

  const args = [RUN, ...targets, ...process.argv.slice(2)];
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (result.error) {
    process.stderr.write(`conformance: ${result.error.message}\n`);
    process.exit(3);
  }
  process.exit(result.status === null ? 3 : result.status);
}

if (require.main === module) {
  main();
}
