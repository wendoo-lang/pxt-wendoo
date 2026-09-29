# Build System

Builds across this repo, `external/wendoo-lang`, and `wendoo-mcu` are driven
by `wendooBuild` metadata plus wireit freshness tracking. AGENTS.md holds the
binding rules; this page holds the declaration shapes and mechanics.

## The driver

`build:deps` is the single entry point in every package that needs current
dependency dists. It runs `external/wendoo-lang/scripts/build-packages.js`,
which walks the `file:` dependency graph from the package it is pointed at and
builds everything it finds, dependencies first, across repository boundaries.

## Declaring a package

Every app or npm package that produces build output follows this shape:

- Declare `wendooBuild` in its `package.json`: `{"script": "build:prod",
  "outputs": ["dist"], "postProcessed": <bool>}`, adding `variants` and
  `needs` when the package builds more than one output group.
- Point that script at wireit (`"build:prod": "wireit"`) and declare the step
  in a `wireit` block with `command`, `files`, `output`, `clean: true`, and
  `packageLocks: []`. Cross-package steps are named by path, for example
  `"../../external/wendoo-lang/packages/core:build:prod"`.
- List `wireit` in the package's own `devDependencies`. There is no hoisting,
  so it resolves from that package's `node_modules/.bin`.
- Give the package a `build:deps` script delegating to the driver, and hang
  the hooks that need current dists off it: `predev`, `prebuild`,
  `prebuild:headless`, `prepackage`, `pretest`, `pretypecheck`, as that
  package needs. The relative path depends on depth -- `../../external/...`
  from `apps/<name>`, `../../../external/...` from `makecode/simx/<name>`.

## How work gets skipped, and what that demands of a declaration

- wireit hashes the declared input files and skips a step whose recorded
  hashes still match. Hashing is by content, not timestamp, so touching a
  file or rewriting it with the same bytes rebuilds nothing. An input you
  fail to declare is an input that will not trigger a rebuild -- an
  under-declared `files` list does not fail loudly, it goes stale silently.
- A step with `clean: true` has its declared output deleted before it runs,
  so a step that does run never mixes fresh output with leftovers.
- The driver runs every step with `WIREIT_CACHE=none`, so wireit judges each
  step where it stands and never restores output from a cache directory.
- `.wireit/` holds run state, is private to a single checkout, and is
  gitignored.

MakeCode extensions under `makecode/extensions/` sit outside this entirely:
the pxt toolchain builds them, and they declare no `wendooBuild`.
