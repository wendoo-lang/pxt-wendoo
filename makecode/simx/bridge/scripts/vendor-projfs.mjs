// Re-vendors the projfs client: copies pxt's pxtservices/projfs.ts
// byte-for-byte into src/vendor/projfs.ts and rewrites the PROVENANCE
// line with the source commit, or with the source blob when the file is
// uncommitted in the pxt checkout. Run via `npm run vendor:projfs`.
// The pxt checkout is read from the PXT_DIR environment variable,
// defaulting to ~/code/microsoft/pxt.

import { execFileSync } from "node:child_process";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pxtDir = process.env.PXT_DIR ?? join(homedir(), "code", "microsoft", "pxt");
const srcRel = "pxtservices/projfs.ts";
const src = join(pxtDir, srcRel);
const vendorDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "vendor");
const dest = join(vendorDir, "projfs.ts");
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
  // cite the per-PR branch holding the commit when one exists, so the
  // line stays meaningful whichever branch the checkout happens to be on
  const prBranch = git(
    "branch", "--contains", commit,
    "--list", "humanapp/feat/*", "humanapp/bugfix/*",
    "--format=%(refname:short)"
  ).split("\n")[0];
  const branch = prBranch || git("branch", "--show-current");
  cite = `at commit ${commit} (branch ${branch})`;
} else {
  const blob = git("hash-object", src);
  const branch = git("branch", "--show-current");
  cite = `blob ${blob} (branch ${branch}, uncommitted; cite the commit once it lands, found with git log --find-object)`;
}

const line = `projfs.ts: byte-for-byte copy of pxt ${srcRel} ${cite}. Re-vendor with \`npm run vendor:projfs\` (PXT_DIR selects the pxt checkout), or by plain copy plus updating this line.`;
writeFileSync(provenance, line + "\n");

console.log(`vendored: ${dest}`);
console.log(`provenance: ${line}`);
