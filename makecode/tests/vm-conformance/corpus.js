/*
 * Reads the shared conformance corpus: the manifest index of cases, and the
 * committed binary program artifact and observable trace of each one.
 *
 * The corpus lives in the upstream language submodule and is read-only here.
 */
const fs = require("fs");
const path = require("path");

const CORPUS_DIR = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "external",
  "wendoo-lang",
  "packages",
  "conformance",
  "corpus"
);

/** The corpus manifest: the profile id, the trace format version, and the case index. */
function readManifest() {
  return JSON.parse(fs.readFileSync(path.join(CORPUS_DIR, "manifest.json"), "utf8"));
}

/** The manifest entry for `caseId`. Throws when the corpus declares no such case. */
function caseEntry(caseId) {
  const entry = readManifest().cases.find((c) => c.id === caseId);
  if (!entry) throw new Error(`corpus declares no case '${caseId}'`);
  return entry;
}

/** The case's binary program artifact at `precision`, as lowercase hex digit pairs. */
function programHex(caseId, precision) {
  const file = path.join(CORPUS_DIR, `${caseId}.${precision}.program.bin`);
  return fs.readFileSync(file).toString("hex");
}

/** The case's committed compiled-program JSON, parsed. */
function programJson(caseId) {
  return JSON.parse(fs.readFileSync(path.join(CORPUS_DIR, `${caseId}.program.json`), "utf8"));
}

/** The case's committed observable trace at `precision`, verbatim. */
function goldenTrace(caseId, precision) {
  return fs.readFileSync(path.join(CORPUS_DIR, `${caseId}.${precision}.trace`), "utf8");
}

module.exports = { CORPUS_DIR, readManifest, caseEntry, programHex, programJson, goldenTrace };
