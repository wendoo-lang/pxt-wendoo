/*
 * Writes one pxt project per conformance corpus case into a target checkout.
 *
 * Target-specific knowledge lives here, not in the capture stage: the
 * dependency that supplies the core APIs and the supportedTargets stamp differ
 * per target, and a project has to sit inside its target checkout for the pxt
 * CLI to find the target at all.
 *
 * Each project carries the case's binary program artifact as a generated hex
 * string, a dependency on the VM extension, and the conformance driver copied
 * in from `driver/`, which decodes the program and replays the manifest's
 * committed schedule.
 *
 * Usage: node gen-cases.js <target-dir> [--precision f64] [--copy-extension]
 */
const fs = require("fs");
const path = require("path");

const corpus = require("./corpus");

const EXTENSION_DIR = path.resolve(__dirname, "..", "..", "extensions", "vm");
const EXTENSION_NAME = "wendoo-vm";
const PROJECTS_SUBDIR = path.join("projects", "wendoo-vm-conformance");

/** The conformance profile and replay driver, injected into each generated project. */
const DRIVER_NAME = "conformance.ts";
const DRIVER_PATH = path.join(__dirname, "driver", DRIVER_NAME);

/** Case id of the catalog capture: the run that serializes the conformance profile's catalog. */
const CATALOG_CASE_ID = "conformance-catalog";

function usage(message) {
  process.stderr.write(`gen-cases: ${message}\n`);
  process.stderr.write("Usage: node gen-cases.js <target-dir> [--precision f64] [--copy-extension]\n");
  process.exit(2);
}

/** Copies the extension's declared files into `destDir`, replacing what is there. */
function copyExtension(destDir) {
  const config = JSON.parse(fs.readFileSync(path.join(EXTENSION_DIR, "pxt.json"), "utf8"));
  fs.mkdirSync(destDir, { recursive: true });
  fs.writeFileSync(path.join(destDir, "pxt.json"), `${JSON.stringify(config, null, 4)}\n`);
  for (const file of config.files) {
    fs.copyFileSync(path.join(EXTENSION_DIR, file), path.join(destDir, file));
  }
  return destDir;
}

/**
 * Reads the target checkout's identity, prepares the output root, and
 * resolves the extension dependency the generated projects declare.
 *
 * @param targetDir Absolute path of a pxt target checkout.
 * @param options `copyExtension` places a disposable copy of the VM extension
 *   beside the projects and depends on the copy, for a pxt that refuses a
 *   path escaping the checkout.
 */
function prepare(targetDir, options) {
  const targetConfigPath = path.join(targetDir, "pxtarget.json");
  if (!fs.existsSync(targetConfigPath)) {
    throw new Error(`no pxtarget.json in ${targetDir}`);
  }
  const target = JSON.parse(fs.readFileSync(targetConfigPath, "utf8"));
  const version = JSON.parse(fs.readFileSync(path.join(targetDir, "package.json"), "utf8")).version;
  const corepkg = target.corepkg || "core";

  const outRoot = path.join(targetDir, PROJECTS_SUBDIR);
  fs.mkdirSync(outRoot, { recursive: true });

  let extensionDir = EXTENSION_DIR;
  if (options?.copyExtension) {
    extensionDir = copyExtension(path.join(outRoot, EXTENSION_NAME));
  }

  return { target, version, corepkg, outRoot, extensionDir };
}

/**
 * Writes one generated project carrying the driver and `mainSource`.
 *
 * @param ctx A prepared target context, from `prepare`.
 * @param id Project id; names the project's directory under the output root.
 * @param description Description the project's pxt.json declares.
 * @param mainSource Text of the project's `main.ts`.
 * @returns The project's id and directory.
 */
function writeProject(ctx, id, description, mainSource) {
  const dir = path.join(ctx.outRoot, id);
  fs.mkdirSync(dir, { recursive: true });

  const dependencies = {};
  dependencies[ctx.corepkg] = `file:${path.posix.join("../../..", "libs", ctx.corepkg)}`;
  dependencies[EXTENSION_NAME] = `file:${toPosix(path.relative(dir, ctx.extensionDir))}`;

  fs.writeFileSync(
    path.join(dir, "pxt.json"),
    `${JSON.stringify(
      {
        name: `wendoo-vm-conformance-${id}`,
        description,
        dependencies,
        files: [DRIVER_NAME, "main.ts"],
        targetVersions: { target: ctx.version },
        supportedTargets: [ctx.target.id],
      },
      null,
      4
    )}\n`
  );
  fs.copyFileSync(DRIVER_PATH, path.join(dir, DRIVER_NAME));
  fs.writeFileSync(path.join(dir, "main.ts"), mainSource);
  return { id, dir };
}

/**
 * Writes the projects for every corpus case into `targetDir`.
 *
 * @param targetDir Absolute path of a pxt target checkout.
 * @param options `precision` selects the artifact variant; `copyExtension`
 *   places a disposable copy of the VM extension beside the projects and
 *   depends on the copy, for a pxt that refuses a path escaping the checkout.
 * @returns One record per generated project: its id and its directory.
 */
function generate(targetDir, options) {
  const precision = options?.precision || "f64";
  const ctx = prepare(targetDir, options);

  const generated = [];
  for (const entry of corpus.readManifest().cases) {
    if (!entry.precisions.includes(precision)) continue;
    generated.push(
      writeProject(
        ctx,
        entry.id,
        `Wendoo VM conformance case (generated) -- ${entry.id}`,
        caseEntrySource(entry, precision)
      )
    );
  }

  fs.writeFileSync(path.join(ctx.outRoot, "cases.txt"), `${generated.map((g) => g.id).join("\n")}\n`);
  return generated;
}

/**
 * Writes the catalog capture project into `targetDir`: a project whose run
 * serializes the conformance profile's catalog as one `CATALOG` line.
 *
 * @param targetDir Absolute path of a pxt target checkout.
 * @param options `copyExtension` as for `generate`.
 * @returns The project's id and directory.
 */
function generateCatalogProject(targetDir, options) {
  const ctx = prepare(targetDir, options);
  return writeProject(ctx, CATALOG_CASE_ID, "Wendoo VM conformance catalog capture (generated)", catalogEntrySource());
}

function toPosix(p) {
  return p.split(path.sep).join("/");
}

function caseEntrySource(entry, precision) {
  const hex = corpus.programHex(entry.id, precision);
  return [
    "// Generated by makecode/tests/vm-conformance/gen-cases.js -- do not edit.",
    `// Corpus case ${entry.id} at ${precision}, replayed over its committed schedule.`,
    "",
    `const PROGRAM_HEX = "${hex}"`,
    `const SCHEDULE = [${entry.schedule.join(", ")}]`,
    "",
    `wendoo.runConformanceCase("${entry.id}", PROGRAM_HEX, SCHEDULE)`,
    "",
  ].join("\n");
}

function catalogEntrySource() {
  return [
    "// Generated by makecode/tests/vm-conformance/gen-cases.js -- do not edit.",
    "// Serializes the conformance profile's catalog for the harness to assert.",
    "",
    `wendoo.runConformanceCatalog("${CATALOG_CASE_ID}")`,
    "",
  ].join("\n");
}

module.exports = { generate, generateCatalogProject, CATALOG_CASE_ID, EXTENSION_DIR, PROJECTS_SUBDIR };

if (require.main === module) {
  const argv = process.argv.slice(2);
  if (argv.length < 1) usage("a target checkout is required");
  const targetDir = path.resolve(argv[0]);
  const options = { precision: "f64", copyExtension: false };
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === "--precision") options.precision = argv[++i];
    else if (argv[i] === "--copy-extension") options.copyExtension = true;
    else usage(`unknown argument: ${argv[i]}`);
  }
  for (const project of generate(targetDir, options)) {
    process.stdout.write(`gen-cases: ${project.dir}\n`);
  }
}
