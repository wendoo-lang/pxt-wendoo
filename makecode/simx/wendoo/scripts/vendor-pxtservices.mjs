// Re-vendors the pxtservices modules this simulator extension uses: copies
// each of pxt's pxtservices/projfs.ts, pxtservices/projassets.ts and
// pxtservices/simxeditor.ts byte-for-byte into src/vendor/ and rewrites its
// PROVENANCE line with the source commit, or with the source blob when the
// file is uncommitted in the pxt checkout. Run via `npm run vendor:pxtservices`.
// The pxt checkout is read from the PXT_DIR environment variable,
// defaulting to ~/code/microsoft/pxt.

import { execFileSync } from "node:child_process";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pxtDir = process.env.PXT_DIR ?? join(homedir(), "code", "microsoft", "pxt");
const vendored = ["projfs.ts", "projassets.ts", "simxeditor.ts"];
const vendorDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "vendor");
const provenance = join(vendorDir, "PROVENANCE");

function git(...args) {
  return execFileSync("git", ["-C", pxtDir, ...args], { encoding: "utf8" }).trim();
}

function gitSucceeds(...args) {
  try {
    execFileSync("git", ["-C", pxtDir, ...args], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Copies pxtservices/`file` into src/vendor and returns its PROVENANCE line. */
function vendor(file) {
  const srcRel = `pxtservices/${file}`;
  const src = join(pxtDir, srcRel);
  const dest = join(vendorDir, file);
  copyFileSync(src, dest);
  if (!readFileSync(src).equals(readFileSync(dest))) {
    console.error(`error: ${dest} does not match ${src} after copying`);
    process.exit(1);
  }

  const clean =
    gitSucceeds("diff", "--quiet", "--", srcRel) &&
    gitSucceeds("diff", "--cached", "--quiet", "--", srcRel);

  let cite;
  if (clean) {
    const commit = git("log", "-1", "--format=%h", "--", srcRel);
    // cite the per-PR branch (humanapp/feat/* or humanapp/bugfix/*) holding
    // the commit when one exists -- of several, the one the fewest commits
    // past it, which is the commit's own when PR branches stack -- else the
    // current branch
    const prBranches = git(
      "branch", "--contains", commit,
      "--list", "humanapp/feat/*", "humanapp/bugfix/*",
      "--format=%(refname:short)"
    ).split("\n").filter(Boolean);
    const past = (candidate) => Number(git("rev-list", "--count", `${commit}..${candidate}`));
    const prBranch = prBranches.reduce(
      (best, candidate) => (best === undefined || past(candidate) < past(best) ? candidate : best),
      undefined
    );
    const branch = prBranch || git("branch", "--show-current");
    cite = `at commit ${commit} (branch ${branch})`;
  } else {
    const blob = git("hash-object", src);
    const branch = git("branch", "--show-current");
    cite = `blob ${blob} (branch ${branch}, uncommitted; cite the commit once it lands, found with git log --find-object)`;
  }

  console.log(`vendored: ${dest}`);
  return `${file}: byte-for-byte copy of pxt ${srcRel} ${cite}. Re-vendor with \`npm run vendor:pxtservices\` (PXT_DIR selects the pxt checkout), or by plain copy plus updating this line.`;
}

const lines = vendored.map(vendor);
writeFileSync(provenance, `${lines.join("\n")}\n`);
for (const line of lines) console.log(`provenance: ${line}`);
