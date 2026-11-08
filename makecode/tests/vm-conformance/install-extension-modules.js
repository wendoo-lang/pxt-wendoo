/*
 * Fills each Wendoo MakeCode extension's `pxt_modules/` by running `mkc install`
 * in its directory, which resolves the extension's `pxt.json` dependencies and
 * points each `mkc.json` link at the sibling extension it names.
 *
 * The extensions are installed in dependency order, and the first failure
 * stops the run with mkc's output. mkc comes from this package's own
 * `makecode` dependency.
 *
 * Usage: node install-extension-modules.js
 */
const path = require("path");
const { spawnSync } = require("child_process");

const EXTENSIONS_DIR = path.resolve(__dirname, "..", "..", "extensions");

/** The extension directories under `makecode/extensions/`, each after every extension it links to. */
const EXTENSIONS = ["vm", "arcade-base", "arcade-host", "arcade"];

/** The mkc CLI script of this package's `makecode` dependency. */
const MKC_CLI = path.join(path.dirname(require.resolve("makecode/package.json")), "makecode");

function log(message) {
  process.stdout.write(`install-extension-modules: ${message}\n`);
}

/** Runs `mkc install` in `dir`, throwing with its output when it fails. */
function mkcInstall(dir) {
  const result = spawnSync(process.execPath, [MKC_CLI, "install"], { cwd: dir, encoding: "utf8" });
  if (result.status !== 0) {
    const output = (result.stdout || "") + (result.stderr || "") + (result.error ? result.error.message : "");
    throw new Error(`mkc install failed in ${dir}:\n${output}`);
  }
}

function main() {
  for (const name of EXTENSIONS) {
    log(`${name}: installing`);
    mkcInstall(path.join(EXTENSIONS_DIR, name));
    log(`${name}: installed`);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`install-extension-modules: ${error.message}\n`);
    process.exit(1);
  }
}
