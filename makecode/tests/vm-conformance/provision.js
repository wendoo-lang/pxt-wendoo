/*
 * Provisions the pinned MakeCode target checkouts the conformance harness runs
 * against, into `targets/` beside this file.
 *
 * Each target is a sparse clone at a pinned tag plus that checkout's own npm
 * install, which is what supplies the pxt CLI `run.js` builds with. A checkout
 * already at its pin and complete is left alone; anything else is re-created.
 *
 * Usage: node provision.js
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const TARGETS_DIR = path.join(__dirname, "targets");

/**
 * The target checkouts the harness needs, by directory name under `targets/`.
 *
 * `repo` is cloned at `tag`; `sparse` is the working-tree subset checked out,
 * and `requires` are the paths `gen-cases.js` and `run.js` read out of it.
 */
const TARGETS = [
  {
    name: "pxt-arcade",
    repo: "https://github.com/microsoft/pxt-arcade.git",
    tag: "v4.1.25",
    sparse: ["libs", "pxtarget.json", "package.json", "targetconfig.json"],
    requires: ["libs", "pxtarget.json", "package.json"],
  },
  {
    name: "pxt-microbit",
    repo: "https://github.com/microsoft/pxt-microbit.git",
    tag: "v9.1.1",
    sparse: ["libs", "pxtarget.json", "package.json", "targetconfig.json"],
    requires: ["libs", "pxtarget.json", "package.json"],
  },
];

/** Relative path, inside a target checkout, of the pxt CLI `run.js` builds with. */
const PXT_CLI = path.join("node_modules", "pxt-core", "built", "pxt.js");

function log(message) {
  process.stdout.write(`provision: ${message}\n`);
}

/** Runs `command` and returns its status and combined output, without throwing. */
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  return { ok: result.status === 0, output: (result.stdout || "") + (result.stderr || "") };
}

/** Runs `command`, throwing with its output when it fails. */
function mustRun(command, args, cwd) {
  const result = run(command, args, cwd);
  if (!result.ok) {
    throw new Error(`${command} ${args.join(" ")} failed:\n${result.output}`);
  }
  return result.output;
}

/** The commit `rev` names in the checkout at `dir`, or null when it names nothing. */
function resolveCommit(dir, rev) {
  const result = run("git", ["rev-parse", "--verify", "--quiet", `${rev}^{commit}`], dir);
  const sha = result.output.trim();
  return result.ok && sha ? sha : null;
}

/**
 * Whether the checkout at `dir` is the one `target` describes: present, with
 * HEAD at the pinned tag, and carrying every path the harness reads.
 *
 * @returns `{ state, sha }` where `state` is "absent" when nothing is there,
 *   "at-pin" when the checkout is sound, and otherwise a short reason the
 *   checkout has to be re-created.
 */
function inspect(target, dir) {
  if (!fs.existsSync(dir)) return { state: "absent", sha: null };

  const head = resolveCommit(dir, "HEAD");
  if (!head) return { state: "not a git checkout", sha: null };

  const pinned = resolveCommit(dir, target.tag);
  if (!pinned) return { state: `tag ${target.tag} not present`, sha: head };
  if (pinned !== head) return { state: `HEAD is not ${target.tag}`, sha: head };

  const missing = target.requires.filter((entry) => !fs.existsSync(path.join(dir, entry)));
  if (missing.length) return { state: `incomplete, missing ${missing.join(", ")}`, sha: head };

  return { state: "at-pin", sha: head };
}

/**
 * Sparse-clones `target` into `dir`, replacing whatever is there.
 *
 * @param target The target to clone.
 * @param dir The checkout directory, `targets/<target.name>`; it is removed
 *   and re-created.
 */
function clone(target, dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(TARGETS_DIR, { recursive: true });
  mustRun(
    "git",
    ["clone", "--depth", "1", "--filter=blob:none", "--sparse", "--branch", target.tag, target.repo, target.name, "-q"],
    TARGETS_DIR
  );
  mustRun("git", ["sparse-checkout", "set", ...target.sparse], dir);
}

/** Installs the checkout's own npm dependencies, which is where its pxt CLI comes from. */
function install(dir) {
  mustRun("npm", ["install", "--no-audit", "--no-fund"], dir);
}

/**
 * Brings every declared target checkout to its pin and reports what it did.
 *
 * @returns The absolute directory of each target, in declaration order.
 */
function provision() {
  const dirs = [];
  for (const target of TARGETS) {
    const dir = path.join(TARGETS_DIR, target.name);
    const found = inspect(target, dir);

    if (found.state === "at-pin") {
      log(`${target.name}: present at ${target.tag} (${found.sha})`);
    } else {
      const why = found.state === "absent" ? "absent" : `${found.state}; re-creating`;
      log(`${target.name}: ${why}`);
      clone(target, dir);
      const cloned = inspect(target, dir);
      if (cloned.state !== "at-pin") {
        throw new Error(`${target.name}: clone did not land at ${target.tag} (${cloned.state})`);
      }
      log(`${target.name}: cloned at ${target.tag} (${cloned.sha})`);
    }

    if (fs.existsSync(path.join(dir, PXT_CLI))) {
      log(`${target.name}: pxt CLI present, skipping npm install`);
    } else {
      log(`${target.name}: installing npm dependencies`);
      install(dir);
      if (!fs.existsSync(path.join(dir, PXT_CLI))) {
        throw new Error(`${target.name}: npm install left no pxt CLI at ${PXT_CLI}`);
      }
      log(`${target.name}: npm dependencies installed`);
    }

    dirs.push(dir);
  }
  return dirs;
}

module.exports = { provision, TARGETS, TARGETS_DIR };

if (require.main === module) {
  try {
    provision();
  } catch (error) {
    process.stderr.write(`provision: ${error.message}\n`);
    process.exit(1);
  }
}
