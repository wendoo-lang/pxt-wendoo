/*
 * Writes the registration selftest project, and the three pack extensions it
 * depends on, into a target checkout.
 *
 * Target-specific knowledge lives here, not in the capture stage: the
 * dependency that supplies the core APIs and the supportedTargets stamp differ
 * per target, and a project has to sit inside its target checkout for the pxt
 * CLI to find the target at all.
 *
 * The packs are real pxt extensions the project depends on, so their
 * registration code runs where a vocabulary pack's would: in a dependency,
 * before the project's own entry point. The project carries the selftest,
 * and the ids module and brains module the Wendoo simulator extension writes
 * into a project, at the paths it writes them to.
 *
 * On an Arcade target it also writes the arcade selftest project: a project
 * depending on the Wendoo arcade extension, carrying the ids module and
 * brains module rendered for the arcade base pack's vocabulary, whose
 * selftest gives the running game's sprites programs. The arcade extension
 * and the arcade base pack are copied beside the project, their dependencies
 * pointed at the target checkout's own libraries, the VM extension here, and
 * each other's copies.
 *
 * Usage: node gen-selftest.js <target-dir>
 */
const fs = require("fs");
const path = require("path");

const EXTENSION_DIR = path.resolve(__dirname, "..", "..", "extensions", "vm");
const EXTENSION_NAME = "wendoo-vm";
const SELFTEST_DIR = path.join(__dirname, "selftest");
const PROJECTS_SUBDIR = path.join("projects", "wendoo-vm-registration-selftest");

/** The selftest, injected into the generated project. */
const SELFTEST_NAME = "registration-selftest.ts";

/**
 * The brains module the selftest's compiled-brain checks read, injected at
 * the path the Wendoo simulator extension writes it to in a project.
 */
const BRAINS_MODULE_NAME = "wendoo-lang/pxt-wendoo/brains.g.ts";

/**
 * The ids module the selftest's drain reads the project's id manifest from,
 * injected at the path the Wendoo simulator extension writes it to in a
 * project: the editor's allocation for the packs' catalog, rendered by the
 * editor's golden-program tooling.
 */
const IDS_MODULE_NAME = "wendoo-lang/pxt-wendoo/ids.g.ts";

/** Manifest id the capture harness brackets the run's output with. */
const SELFTEST_CASE_ID = "registration-selftest";

/** The Wendoo arcade extension, which the arcade selftest project depends on. */
const ARCADE_EXTENSION_DIR = path.resolve(__dirname, "..", "..", "extensions", "arcade");
const ARCADE_EXTENSION_NAME = "wendoo-arcade";

/** The Wendoo arcade base pack, which the arcade extension depends on. */
const ARCADE_BASE_EXTENSION_DIR = path.resolve(__dirname, "..", "..", "extensions", "arcade-base");
const ARCADE_BASE_EXTENSION_NAME = "wendoo-arcade-base";

/**
 * Directory of the ids module and brains module the arcade selftest project
 * carries: the editor's allocation for the arcade base pack's catalog and
 * the arcade selftest's programs compiled under it, rendered by the editor's
 * golden-program tooling.
 */
const ARCADE_SELFTEST_DIR = path.join(SELFTEST_DIR, "arcade");

/** Target id of the MakeCode target the arcade selftest runs on. */
const ARCADE_TARGET_ID = "arcade";

/** Output directory of the arcade selftest project and its extension copy, inside a target checkout. */
const ARCADE_PROJECTS_SUBDIR = path.join("projects", "wendoo-arcade-selftest");

/** The arcade selftest, injected into the generated arcade project. */
const ARCADE_SELFTEST_NAME = "arcade-selftest.ts";

/** Manifest id the capture harness brackets the arcade selftest's output with. */
const ARCADE_SELFTEST_CASE_ID = "arcade-selftest";

/**
 * The packs the project depends on: one generated extension each, carrying
 * the source file of the same name.
 */
const PACKS = [
  { name: "wendoo-beacon", file: "beacon.ts" },
  { name: "wendoo-chime", file: "chime.ts" },
  { name: "wendoo-grammar", file: "grammar.ts" },
];

function usage(message) {
  process.stderr.write(`gen-selftest: ${message}\n`);
  process.stderr.write("Usage: node gen-selftest.js <target-dir>\n");
  process.exit(2);
}

function toPosix(p) {
  return p.split(path.sep).join("/");
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 4)}\n`);
}

/** Writes one pack extension into `dir` and returns its declared name. */
function writePack(pack, dir, coreDependency) {
  fs.mkdirSync(dir, { recursive: true });
  const dependencies = {};
  dependencies[coreDependency.name] = coreDependency.path;
  dependencies[EXTENSION_NAME] = `file:${toPosix(path.relative(dir, EXTENSION_DIR))}`;
  writeJson(path.join(dir, "pxt.json"), {
    name: pack.name,
    description: `Wendoo registration selftest pack (generated) -- ${pack.name}`,
    dependencies,
    files: [pack.file],
  });
  fs.copyFileSync(path.join(SELFTEST_DIR, "packs", pack.file), path.join(dir, pack.file));
  return pack.name;
}

/** The generated entry point: the selftest run. */
function entrySource() {
  return [
    "// Generated by makecode/tests/vm-conformance/gen-selftest.js -- do not edit.",
    "",
    "registrationSelftest.run()",
    "",
  ].join("\n");
}

/**
 * Writes the selftest project and its packs into `targetDir`.
 *
 * @param targetDir Absolute path of a pxt target checkout.
 * @returns `{ id, dir }` of the generated project.
 */
function generate(targetDir) {
  const targetConfigPath = path.join(targetDir, "pxtarget.json");
  if (!fs.existsSync(targetConfigPath)) {
    throw new Error(`no pxtarget.json in ${targetDir}`);
  }
  const target = JSON.parse(fs.readFileSync(targetConfigPath, "utf8"));
  const version = JSON.parse(fs.readFileSync(path.join(targetDir, "package.json"), "utf8")).version;
  const corepkg = target.corepkg || "core";

  const outRoot = path.join(targetDir, PROJECTS_SUBDIR);
  const projectDir = path.join(outRoot, "project");
  fs.mkdirSync(projectDir, { recursive: true });

  const dependencies = {};
  dependencies[corepkg] = `file:${toPosix(path.relative(projectDir, path.join(targetDir, "libs", corepkg)))}`;
  dependencies[EXTENSION_NAME] = `file:${toPosix(path.relative(projectDir, EXTENSION_DIR))}`;
  for (const pack of PACKS) {
    const packDir = path.join(outRoot, "packs", pack.name);
    const coreDependency = {
      name: corepkg,
      path: `file:${toPosix(path.relative(packDir, path.join(targetDir, "libs", corepkg)))}`,
    };
    dependencies[writePack(pack, packDir, coreDependency)] = `file:${toPosix(path.relative(projectDir, packDir))}`;
  }

  writeJson(path.join(projectDir, "pxt.json"), {
    name: "wendoo-vm-registration-selftest",
    description: "Wendoo VM registration selftest (generated)",
    dependencies,
    // The brains and ids modules follow main.ts, as a simulator extension's write appends them to a project's files.
    files: [SELFTEST_NAME, "main.ts", BRAINS_MODULE_NAME, IDS_MODULE_NAME],
    targetVersions: { target: version },
    supportedTargets: [target.id],
  });
  fs.copyFileSync(path.join(SELFTEST_DIR, SELFTEST_NAME), path.join(projectDir, SELFTEST_NAME));
  fs.mkdirSync(path.dirname(path.join(projectDir, BRAINS_MODULE_NAME)), { recursive: true });
  fs.copyFileSync(path.join(SELFTEST_DIR, BRAINS_MODULE_NAME), path.join(projectDir, BRAINS_MODULE_NAME));
  fs.copyFileSync(path.join(SELFTEST_DIR, IDS_MODULE_NAME), path.join(projectDir, IDS_MODULE_NAME));
  fs.writeFileSync(path.join(projectDir, "main.ts"), entrySource());

  return { id: SELFTEST_CASE_ID, dir: projectDir };
}

/**
 * Copies the declared files of the extension at `sourceDir` into `destDir`,
 * its manifest's dependencies replaced by `dependencies`.
 */
function copyExtension(sourceDir, destDir, dependencies) {
  const config = JSON.parse(fs.readFileSync(path.join(sourceDir, "pxt.json"), "utf8"));
  fs.mkdirSync(destDir, { recursive: true });
  writeJson(path.join(destDir, "pxt.json"), { ...config, dependencies });
  for (const file of config.files) {
    fs.copyFileSync(path.join(sourceDir, file), path.join(destDir, file));
  }
}

/**
 * The dependencies of an arcade extension copied into `destDir`: the
 * target's core library at `corepkgDir` and the VM extension here, plus
 * `extra`, each `{ name, dir }` of another copied extension.
 */
function arcadeDependencies(destDir, corepkg, corepkgDir, extra) {
  const dependencies = {};
  dependencies[corepkg] = `file:${toPosix(path.relative(destDir, corepkgDir))}`;
  dependencies[EXTENSION_NAME] = `file:${toPosix(path.relative(destDir, EXTENSION_DIR))}`;
  for (const extension of extra) {
    dependencies[extension.name] = `file:${toPosix(path.relative(destDir, extension.dir))}`;
  }
  return dependencies;
}

/**
 * Writes the arcade selftest project, and the copies of the arcade extension
 * and the arcade base pack it depends on, into `targetDir` when it is an
 * Arcade target checkout.
 *
 * @param targetDir Absolute path of a pxt target checkout.
 * @returns `{ id, dir }` of the generated project, or null for a target
 *   other than Arcade.
 */
function generateArcade(targetDir) {
  const target = JSON.parse(fs.readFileSync(path.join(targetDir, "pxtarget.json"), "utf8"));
  if (target.id !== ARCADE_TARGET_ID) return null;
  const version = JSON.parse(fs.readFileSync(path.join(targetDir, "package.json"), "utf8")).version;
  const corepkg = target.corepkg || "core";
  const corepkgDir = path.join(targetDir, "libs", corepkg);

  const outRoot = path.join(targetDir, ARCADE_PROJECTS_SUBDIR);
  const projectDir = path.join(outRoot, "project");
  const base = { name: ARCADE_BASE_EXTENSION_NAME, dir: path.join(outRoot, ARCADE_BASE_EXTENSION_NAME) };
  const arcade = { name: ARCADE_EXTENSION_NAME, dir: path.join(outRoot, ARCADE_EXTENSION_NAME) };
  copyExtension(ARCADE_BASE_EXTENSION_DIR, base.dir, arcadeDependencies(base.dir, corepkg, corepkgDir, []));
  copyExtension(ARCADE_EXTENSION_DIR, arcade.dir, arcadeDependencies(arcade.dir, corepkg, corepkgDir, [base]));
  fs.mkdirSync(projectDir, { recursive: true });

  writeJson(path.join(projectDir, "pxt.json"), {
    name: "wendoo-arcade-selftest",
    description: "Wendoo arcade extension selftest (generated)",
    dependencies: arcadeDependencies(projectDir, corepkg, corepkgDir, [base, arcade]),
    // The brains and ids modules follow main.ts, as a simulator extension's write appends them to a project's files.
    files: [ARCADE_SELFTEST_NAME, "main.ts", BRAINS_MODULE_NAME, IDS_MODULE_NAME],
    targetVersions: { target: version },
    supportedTargets: [target.id],
  });
  fs.copyFileSync(path.join(ARCADE_SELFTEST_DIR, ARCADE_SELFTEST_NAME), path.join(projectDir, ARCADE_SELFTEST_NAME));
  fs.mkdirSync(path.dirname(path.join(projectDir, BRAINS_MODULE_NAME)), { recursive: true });
  fs.copyFileSync(path.join(ARCADE_SELFTEST_DIR, BRAINS_MODULE_NAME), path.join(projectDir, BRAINS_MODULE_NAME));
  fs.copyFileSync(path.join(ARCADE_SELFTEST_DIR, IDS_MODULE_NAME), path.join(projectDir, IDS_MODULE_NAME));
  fs.writeFileSync(
    path.join(projectDir, "main.ts"),
    [
      "// Generated by makecode/tests/vm-conformance/gen-selftest.js -- do not edit.",
      "",
      "arcadeSelftest.run()",
      "",
    ].join("\n")
  );

  return { id: ARCADE_SELFTEST_CASE_ID, dir: projectDir };
}

module.exports = { generate, generateArcade, EXTENSION_DIR, PROJECTS_SUBDIR, SELFTEST_CASE_ID };

if (require.main === module) {
  const argv = process.argv.slice(2);
  if (argv.length !== 1) usage("a target checkout is required");
  const project = generate(path.resolve(argv[0]));
  process.stdout.write(`gen-selftest: ${project.dir}\n`);
  const arcade = generateArcade(path.resolve(argv[0]));
  if (arcade) process.stdout.write(`gen-selftest: ${arcade.dir}\n`);
}
