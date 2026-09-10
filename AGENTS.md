# Agent Instructions

These instructions apply to this repository.

Before working in any area of the codebase, list `.github/instructions/` and
read `global.instructions.md` plus any instruction files whose name matches the
area you are working in. `global.instructions.md` is the canonical home of the
comment guidelines, the plan-only-names ban, the ASCII-only rule, the zero-noise
check policy, and the broad-view rule; those rules are not repeated here.

For the working temperament and decision style to apply on ambiguous work
(small-step workflow, ownership boundaries, handoff posture), read
`.github/instructions/agent-posture.instructions.md`.

## Findings Ledger

`global.instructions.md` requires every problem you notice and do not fix to be
reported with a proposed time to address it. In this repo those findings also
go in a ledger, so they outlive the session that found them: the newest
`generated-docs/findings-ledger-*.md`.

- Read the ledger before reporting a finding. It may already be there, already
  scheduled, or already settled as wont-fix.
- Append a `## F<n>.` entry with Source, Detail, Proposed slot, and Status
  (open, scheduled, resolved, wont-fix).
- Entries are append-only. When a finding is addressed, or dissolves because
  the code moved under it, update its Status field in place; do not delete or
  renumber entries.
- Reporting a finding in your response does not discharge the rule. The
  response scrolls away; the ledger is what survives.

Note that `generated-docs/` is gitignored, so the ledger is local to the
working copy.

## Git Is Read-Only

Git is a read-only tool for Codex, Copilot, Claude, and any other agent,
including subagents spawned for a task. Use it freely to inspect and to query
history: `status`, `log`, `diff`, `show`, `blame`, `reflog`, `rev-parse`,
`for-each-ref`, `branch --list`, and the like. `git rm` and `git mv` are also
allowed, as ordinary file operations while editing the repo.

Everything that changes repository state -- the working tree, the index, the
stash, or any commit, branch, tag, or ref -- is the user's to run. Do it only
when the user asks for that specific write in that turn.

Two commands read as harmless but are writes: `git checkout -- <file>` and
`git restore <file>` discard uncommitted work. Treat them as writes.

To undo or fix a file, edit or regenerate it directly, and leave changes you did
not make as they stand.

The submodule at `external/wendoo-lang` is a second repository with its own
history. The rule applies there identically: a submodule pointer bump is a write
to this repo, and a commit inside the submodule is a write to that one.

## Never Kill Processes You Do Not Own

Never kill, signal, or otherwise terminate a process you did not start in the
current session. This is an absolute rule.

- A port being in use is NOT evidence the listener is stale, orphaned, or yours.
  A dev server matching this repo's app and working directory may well be the
  user's own running server. Same app, same cwd, same port does NOT mean "safe
  to kill."
- Do not run `kill`, `pkill`, `killall`, `kill -9`, or any equivalent against a
  process you cannot prove you launched this session.
- If a port you want is occupied, pick a different port, or stop and ask the
  user whether to free it -- do not free it yourself.
- This applies to dev servers, watchers, language servers, databases, and any
  other long-running process.

## Command Approvals

- When requesting escalated command approval, include a narrow `prefix_rule`
  when safe and allowed so repeated commands can be approved persistently.
- Do not include a `prefix_rule` for destructive commands, heredocs, or overly
  broad command prefixes.

## Package Manager

- This repo uses npm exclusively; the only root lockfile is `package-lock.json`.
  Keep pnpm and yarn out entirely -- no alternate lockfiles, no `packageManager`
  field, no `pnpm`/`yarn` invocations.
- This is intentionally NOT an npm workspaces monorepo, and must not become one.
  The platform submodule is consumed by several independent repository roots,
  and a workspace root cannot span them: two roots would each claim the same
  packages while edits are mirrored into both working trees, which is a failure
  class the current layout does not have. There is no root `workspaces` field.
  Each app and simx component runs its own `npm install` into its own
  `node_modules`; cross-package links use `file:` dependencies and symlinks.
  MakeCode extensions under `makecode/extensions/` sit outside npm entirely:
  their dependencies are declared in `pxt.json` and resolved by the MakeCode
  toolchain into `pxt_modules/`.
- Because there is no hoisting, every package must declare the dev tooling its
  own scripts invoke (for example `tsx`) in its own `devDependencies`, so the
  script resolves the binary from that package's `node_modules/.bin`. Do not
  rely on a root-level binary being on PATH, and do not work around a missing
  binary by editing PATH -- add the dependency to the package instead.
- Run scripts with npm from the relevant package directory, for example
  `npm test`, `npm run build`, `npm run typecheck`, `npm run check`.

## Build System

Builds are driven by `wendooBuild` metadata plus wireit freshness tracking --
the same setup wendoo-lang and wendoo-mcu use. `build:deps` is the single entry
point: it runs `external/wendoo-lang/scripts/build-packages.js`, which walks the
`file:` dependency graph from the package it is pointed at and builds everything
it finds, dependencies first, across repository boundaries.

Every app or npm package here that produces build output follows that shape:

- Declare `wendooBuild` in its `package.json`: `{"script": "build:prod",
  "outputs": ["dist"], "postProcessed": <bool>}`, adding `variants` and `needs`
  when the package builds more than one output group.
- Point that script at wireit (`"build:prod": "wireit"`) and declare the step
  in a `wireit` block with `command`, `files`, `output`, `clean: true`, and
  `packageLocks: []`. Cross-package steps are named by path, for example
  `"../../external/wendoo-lang/packages/core:build:prod"`.
- List `wireit` in the package's own `devDependencies`. There is no hoisting,
  so it resolves from that package's `node_modules/.bin`.
- Give the package a `build:deps` script delegating to the driver, and hang the
  hooks that need current dists off it: `predev`, `prebuild`,
  `prebuild:headless`, `prepackage`, `pretest`, `pretypecheck`, as that package
  needs. The relative path depends on depth -- `../../external/...` from
  `apps/<name>`, `../../../external/...` from `makecode/simx/<name>`.

How work gets skipped, and what that demands of a declaration:

- wireit hashes the declared input files and skips a step whose recorded hashes
  still match. Hashing is by content, not timestamp, so touching a file or
  rewriting it with the same bytes rebuilds nothing. An input you fail to
  declare is an input that will not trigger a rebuild -- an under-declared
  `files` list does not fail loudly, it goes stale silently.
- A step with `clean: true` has its declared output deleted before it runs, so
  a step that does run never mixes fresh output with leftovers.
- The driver runs every step with `WIREIT_CACHE=none`, so wireit judges each
  step where it stands and never restores output from a cache directory.
- `.wireit/` holds run state, is private to a single checkout, and is
  gitignored.

Do not hand-roll build ordering or freshness checking. Declaring inputs and
outputs is the whole interface: the revamp that introduced wireit deleted a
bespoke freshness oracle rather than carry two mechanisms.

MakeCode extensions under `makecode/extensions/` sit outside this entirely.
They are built by the pxt toolchain and declare no `wendooBuild`.

## Code Quality

- Never emit placeholder code. Do not use `TODO`, `FIXME`, `...`,
  `/* implementation */`, `throw new Error("Not implemented")`, or any other
  stub pattern unless the user has explicitly written a stub and is asking to
  fill it in.
- Never produce non-production statements such as `console.log("test")`,
  `console.log("here")`, hardcoded magic strings used only for debugging, or
  temporary workarounds presented as real code.
- Complete functions fully. If a complete implementation cannot be inferred
  from context, suggest the minimal correct skeleton rather than a placeholder
  body.
- Write type-only imports as a top-level `import type` statement in `.ts` and
  `.tsx` files; do not use inline `import()` type expressions.

## Minimalism (No Over-Build)

Build the minimum that satisfies the task's acceptance criteria; speculative
robustness is out of scope by default. Over-building -- adding machinery for
problems that cannot occur in the system as it exists today -- is a recurring
failure to actively guard against. The unifying tell: it defends against a state
that cannot occur today, or duplicates a guarantee an existing layer already
provides.

- Burden of proof is on inclusion, not omission. For every field, check, version,
  error code, abstraction, parameter, or guard, name the one concrete failure
  mode -- possible today -- that it prevents and that no existing layer already
  catches. If the only justification is a future scenario, a general good
  ("robustness", "safety", "completeness", "flexibility"), symmetry, or something
  already guaranteed elsewhere, leave it out.
- Scope = the test. Build only what an acceptance check exercises. If no test
  touches a field, branch, check, or abstraction, do not build it.
- Banned by default (each needs an explicit, today-failure-mode justification):
  redundant integrity (checksums or length fields duplicating an existing
  guarantee); compatibility/identity machinery (version numbers, content digests,
  build ids, handshakes) in a single-build, single-version world; future-proofing
  (reserved fields, "vN room", envelopes, abstraction for a consumer that does
  not exist yet); defensive validation of inputs that cannot be malformed; fixed-
  or cap-sized buffers and pools; error-code, state, or config inflation beyond
  what a path can reach.
- Subtraction before done. Before declaring a change complete, try to delete each
  piece you added; if no test breaks, remove it.
- When unsure, leave it out and let a real, failing test pull it in -- adding it
  later is cheap; carrying speculative machinery is not.

This repo is early. The pull toward premature structure is strongest in an empty
tree, where nothing yet constrains a design: prefer one concrete implementation
over a framework for implementations that do not exist.

## Repo-Specific Scope

- This repository brings Wendoo to MakeCode Arcade. It owns the arcade target
  platform -- the `wendoo-lang/trg-arcade` layer -- together with the MakeCode
  extensions that run brains inside an Arcade game and the product surface that
  authors them. The Wendoo language, compiler, and reference VM are upstream:
  consume them; do not reimplement them here.
- `external/wendoo-lang` is the imported reference checkout. Read it for
  contracts, compiler behavior, and TypeScript VM semantics, but do not make
  product changes there unless the task explicitly targets the reference.
- The top level splits by side of the integration: `apps/` is the Wendoo side,
  `makecode/` the MakeCode side. That grouping is not a toolchain boundary,
  and conflating the two is the standing hazard here. `apps/` and
  `makecode/simx/` are ordinary npm/TypeScript web projects.
  `makecode/extensions/` are MakeCode (pxt) projects, built by the MakeCode
  toolchain in the static TypeScript subset pxt compiles: a different language
  surface, a different dependency system, and not npm packages. A pattern that
  is idiomatic on one side is frequently illegal on the other; check before
  carrying one across.
- Planned first-cut ownership, one subfolder per unit:
  - `makecode/extensions/*` own the MakeCode extensions.
    `makecode/extensions/core` implements the Wendoo bytecode VM in MakeCode
    static TypeScript, so a brain executes inside the Arcade game itself. It is
    a conforming Wendoo VM, held to the observable semantics of the reference
    VM under the contract in `.github/instructions/vm.instructions.md`.
  - `makecode/simx/*` own the MakeCode simx components, each a webapp in its
    own subfolder. `makecode/simx/bridge` connects to the bridge service,
    joining the editor webapp to the MakeCode project.
  - `apps/arcade` owns the Wendoo editor webapp: brain authoring, project
    management, compiler integration, and diagnostics.
  - `apps/bridge` owns the bridge service that `makecode/simx/bridge` connects
    to.
- The editor webapp, the bridge service, the simx component, and the MakeCode
  project form one path. A change to any hop is not done until you have named
  the other three and said what it does to them.
- The shared Wendoo packages (`packages/core`, `packages/ts-compiler`,
  `packages/app-host`, `packages/bridge-app`, `packages/ui`) have several
  first-class, co-equal product consumers. Two are visible from this checkout:
  `apps/arcade` (this repo) and `external/wendoo-lang/apps/ecosim`. A change to
  a shared package or shared model is not done until both are swept and gated
  (typecheck + biome + test each); this is the one standing reason to run suites
  in the reference checkout. A third consumer, `apps/microbit-sim` in the
  companion `wendoo-mcu` repository, is not present here -- a shared-package
  change must not assume arcade's platform is the only one, and a default,
  assumption, or example tied to the arcade platform must state how it also
  serves a distinct platform.
- Every Wendoo VM in this repo must respect the host calling convention and the
  single-entry VM rule: external callbacks enqueue only; the host loop drains,
  resolves handles, schedules, and executes.
