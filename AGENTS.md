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
  toolchain into `pxt_modules/`. An extension may carry a scripts-only
  `package.json` (no dependencies, private, never listed in `pxt.json` files)
  as a convenience for invoking dev tooling; it participates in no npm
  dependency graph.
- Because there is no hoisting, every package must declare the dev tooling its
  own scripts invoke (for example `tsx`) in its own `devDependencies`, so the
  script resolves the binary from that package's `node_modules/.bin`. Do not
  rely on a root-level binary being on PATH, and do not work around a missing
  binary by editing PATH -- add the dependency to the package instead.
- Run scripts with npm from the relevant package directory, for example
  `npm test`, `npm run build`, `npm run typecheck`, `npm run check`.

## Follow the Established Pattern

Before building any new subsystem -- a service, a store, a settings surface, a
connection lifecycle, a build script, a test harness -- find how the reference
apps already do it and follow what you find. Check both:

- `external/wendoo-lang/apps/ecosim`, always present through the submodule.
- `apps/microbit-sim` in the companion `wendoo-mcu` repository. It is the
  closest analogue to this repo's editor app, but it is NOT in this checkout;
  read it when a wendoo-mcu checkout is available, and say plainly when it is
  not rather than guessing at what it does.

Check the shared packages too. A convention is often implemented once in
`packages/*` and merely consumed by both apps, so an app that looks like it
hand-rolls something may just be calling the shared implementation.

Following the pattern is the default, not a preference. Departing from one is
allowed and sometimes correct, but it costs an argument: name the pattern, say
why it does not fit here, and record the decision where the next reader will
meet it. An unexamined divergence is worse than a deliberate wrong choice --
the deliberate one leaves a reason behind.

Two hazards worth knowing:

- The behavior you are looking for may live downstream of the app. Before
  concluding an app implements something itself, check the package that owns
  it.
- A standalone wendoo-lang clone can lag the submodule checkouts. Prefer
  `external/wendoo-lang` as the current reference.

The MakeCode bridge address is the worked example: both apps store the service
as a bare host with an optional port and let `bridge-client` choose `ws://`
for a loopback host and `wss://` otherwise, and neither app uses a `VITE_` env
var for configuration. A scheme baked into the value would have been silently
stripped, and an env var would have been this repo's only one.

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

## User-Facing Copy

In user-facing text -- READMEs, docs pages, UI strings -- describe Wendoo on
its own terms, and hold contrast to an honesty test. Contrast with another
approach is valid when it gives the reader true information about fit, and
that runs in both directions: "Wendoo is built for reactive behavior; for an
algorithm like a sort, write it in code" is honest contrast and welcome.

What is never acceptable is contrast as a sales device: framing that makes
another approach look lesser so Wendoo shines, however subtly. "Program with
rules instead of long scripts" fails the test -- it casts scripts as the
thing the reader is rescued from. "Give your sprites brains" passes -- it
says what the product does and stops.

The test is direction, not vocabulary. Do not pattern-match on "instead of"
and call it done; ask whether the sentence diminishes something else or
informs the reader. Wendoo is great for some things and not for others, and
the copy may say both plainly.

## Minimalism and the Arc (No Over-Build, No Erosion)

Two forces govern scope, and both bind. Minimalism prunes what no
planned work needs; the arc protects what planned work will need.
Applying either without the other fails: unchecked building buries
the system in speculative machinery, and minimizing at every turn
erases architectural structure. The ledger and the slice plan are
the arbiter between them.

### Minimalism (No Over-Build)

Build the minimum that satisfies the slice's acceptance criteria;
speculative robustness is out of scope by default. Over-building --
adding machinery for problems that cannot occur in the system as it
exists today or in any planned slice -- is a recurring failure to
actively guard against. The unifying tell: it defends against a
state that cannot occur, or duplicates a guarantee an existing
layer already provides.

- Burden of proof is on inclusion, not omission -- and it applies
  to machinery being BUILT, never to functionality being CARRIED.
  Existing working capability that a refactor touches is preserved
  by default; dropping it is not minimalism, it is a decision, and
  the decision is the user's. A characterization pass that maps
  what a refactor keeps and what it removes, with the authority for
  each removal, is part of the refactor.
- For every NEW field, check, error code, abstraction, parameter,
  or guard, name the concrete failure mode it prevents that no
  existing layer catches -- possible today, or scheduled to become
  possible in a planned slice. If the only justification is an
  unplanned future, a general good ("robustness", "flexibility"),
  symmetry, or something already guaranteed elsewhere, leave it
  out.
- Scope = the acceptance check or the real customer. A piece
  nothing exercises and no one uses does not get built. But two
  cautions: untested-but-real surfaces (dev tooling, operational
  consoles, docs affordances) have customers without tests --
  count them; and a test is only an oracle while it is faithful --
  a green suite over an unfaithful model licenses nothing.
- Banned by default, WHERE THE QUALIFYING PREMISE HOLDS -- check
  the premise before applying the ban, and check when it expires:
  redundant integrity duplicating an existing guarantee;
  compatibility/identity machinery in a genuinely single-build,
  single-version world; future-proofing for consumers no plan
  names; defensive validation of inputs that cannot be malformed;
  fixed- or cap-sized buffers and pools; error-code, state, or
  config inflation beyond what a path can reach.
- Deadlines beat deferral. Some machinery must exist BEFORE its
  failure mode becomes possible, because retrofitting it afterward
  is a migration: wire contracts, credential semantics, version
  carriers, public coordinates. For these, "add it when a failing
  test pulls it in" is wrong; the question is the deadline (the
  first pinned consumer, the first published artifact), and the
  deadline is tracked like any other slot.
- "Adding it later is cheap" holds only for reversible machinery.
  State the reversibility before leaning on it.
- A divergence from a reference app justified solely by minimalism
  is a flagged decision, never a silent default -- the
  follow-the-pattern rule does not lose to this section without a
  recorded argument.
- Subtraction before done. Before declaring a change complete, try
  to delete each piece you added; if no check breaks and no tracked
  slot claims it, remove it.

### The Arc (No Erosion)

This repository is built as a planned arc of slices toward one
architecture. Judge each piece against the whole planned arc, not
the current slice alone.

- A partially finished bridge is legitimate. A seam, surface, or
  mechanism may land incomplete and stay incomplete across several
  slices -- PROVIDED the incompleteness is tracked, with a named
  slot for its completion. Tracked incompleteness is construction;
  untracked incompleteness is debt; and completing it "minimally"
  by deleting the unfinished half is erosion, not cleanup.
- Structure that exists to carry the arc is not speculative
  machinery. "Speculative" means serving no planned slice, not
  serving a later one. Before pruning a piece as over-build, check
  the ledger and the plan: if a slotted slice claims it, it stands
  (sized honestly for what that slice needs, and marked).
- The empty-tree caution still applies in reverse: prefer one
  concrete implementation over a framework for implementations
  that do not exist -- but where the plan names the second
  implementation, the seam for it is arc, not framework.

## Repo-Specific Scope

- This repository (pxt-wendoo) brings Wendoo to MakeCode. The VM and most of
  the machinery are MakeCode-target-agnostic; targets stratify at the leaf
  (per-target extensions and packs), and Arcade is the first. It owns the
  arcade target platform layer -- `wendoo-lang/trg-arcade` -- together with
  the MakeCode extensions that run brains inside a MakeCode program and the
  product surface that authors them. The Wendoo language, compiler, and
  reference VM are upstream: consume them; do not reimplement them here.
- `external/wendoo-lang` is the imported reference checkout. Read it for
  contracts, compiler behavior, and TypeScript VM semantics, but do not make
  product changes there unless the task explicitly targets the reference.
- The top level splits by side of the integration: `apps/` is the Wendoo side,
  `makecode/` the MakeCode side. That grouping is not a toolchain boundary,
  and conflating the two is the standing hazard here. A third top-level home,
  `packages/`, holds this repo's own shared npm packages: contracts spoken by
  units on both sides of the integration, which therefore belong to neither
  side. `apps/`, `makecode/simx/`, and `packages/` are ordinary npm/TypeScript
  projects.
  `makecode/extensions/` are MakeCode (pxt) projects, built by the MakeCode
  toolchain in the static TypeScript subset pxt compiles: a different language
  surface, a different dependency system, and not npm packages. A pattern that
  is idiomatic on one side is frequently illegal on the other; check before
  carrying one across.
- Planned first-cut ownership, one subfolder per unit:
  - `makecode/extensions/*` own the MakeCode extensions, and there are two
    kinds. They are nested pxt extensions: each is addressed by its GitHub
    coordinate at full depth, so the VM is
    `github:wendoo-lang/pxt-wendoo/makecode/extensions/vm`, and pxt's
    monorepo support requires a top-level `pxt.json` at the repo root for any
    of them to resolve. That coordinate is public identity -- it lands in every
    consuming project and in every pack that depends on core -- so the
    directory a shipped extension lives in is not free to rename.
    `makecode/extensions/vm` is the STS VM and nothing else: the bytecode
    VM in MakeCode static TypeScript (a conforming Wendoo VM, held to the
    observable semantics of the reference VM under the contract in
    `.github/instructions/vm.instructions.md`), the trace emitter, the tile
    bind API, and the language-level tiles. It carries NO block definitions
    and ZERO target-specific pxt dependencies (`core: "*"` only) -- it is
    MakeCode-target-agnostic by construction, incubating here, portable to
    other MakeCode targets (micro:bit, Minecraft EDU) and extractable later
    as a file move. The boundary is proven by compiling against a second
    target, not by convention. Extraction, if it happens, changes the
    extension's public coordinate, so the decision deadline is before
    external projects pin it.
    Arcade-bound pieces -- the spawn block, sprite pairing, the WendooBrain
    asset blocks, the simx binding -- belong to a game-facing arcade
    extension that does not exist yet; it is created when the spawn-block
    slice needs it, not before, and it depends on the VM extension and on
    arcade's base pack.
    Every target also has exactly one BASE PACK: its own extension unit,
    distinct from the game-facing extension and from feature packs, created
    when the first type declaration needs it. It depends on the VM core
    extension and owns the target's type declarations -- the target's asset
    types (for arcade: image, song, tilemap, tile, animation) and its
    built-in types (for arcade: sprite). A base pack reserves the right to
    carry a base set of common tile vocabulary shared by its target's
    packs; what belongs there is not yet identified, so tiles land in a
    base pack only by explicit ruling, never by drift.
  - The other kind is a FEATURE PACK: an extension supplying host-bound
    tiles for one genre of game. A feature pack takes a direct dependency on
    its target's base pack (and through it the VM core extension) and never
    depends on another feature pack; packs compose by keeping tile names
    disjoint. The majority of vocabulary comes from packs and from user code,
    not from core. Exactly where the line falls between a core tile, a
    base-pack tile, and a feature-pack tile is not settled -- when a new tile
    could plausibly go either way, raise it rather than deciding it in
    passing.
  - `makecode/simx/*` own the MakeCode simx components, each a webapp in its
    own subfolder. `makecode/simx/bridge` connects to the bridge service,
    joining the editor webapp to the MakeCode project. A simx is a channel: not
    a store, not a UI, and TARGET-BLIND -- one built simx serves every
    MakeCode target. It reloads on every sim restart, so no state may live
    only there. A simx is bound by an `approvedRepoLib` entry in EACH MakeCode
    target's own `targetconfig.json`, keyed `owner/repo` and carrying a
    hosting URL -- per-target registration of one shared artifact.
  - `packages/*` own this repo's cross-side shared npm packages: contracts
    consumed by units on both sides of the integration via `file:`
    dependencies. The first is `packages/protocol` (`@wendoo/makecode-session`),
    the MakeCode session kind binding the upstream peer-session mechanism.
    Placement rule: platform-specific protocol kinds and other MakeCode-aware
    shared contracts live here, never in the upstream core packages. The
    upstream packages carry platform-clean mechanisms only and must stay
    greppably free of platform names; platform content inside a core package
    becomes citable precedent for more of it.
  - `apps/editor` owns the Wendoo editor webapp: brain authoring, project
    management, compiler integration, and diagnostics. The editor is
    TARGET-BLIND: the entire tile vocabulary is injected from the MakeCode
    side over the bridge (pack tiles surfaced via `apis.read`), so the tile
    catalog is session data, never build configuration. The one target-aware
    residue is theming, keyed by the target name carried in the session hello.
    Tripwire: this holds because user-authored tiles live on the MakeCode
    side; a Wendoo-TS user-tile flow in this editor would reintroduce
    target-specific ambient typings (as in wendoo-mcu's editor) and must be
    raised as a boundary change, not slipped in. (The directory name predates
    the target-blind ruling; renaming it rides its own slice per F48.)
  - `apps/bridge` owns the bridge service that `makecode/simx/bridge` connects
    to. Also target-blind: one deployment serves every target.
  - The complete per-target surface of this repo is: the game-facing
    extension, vocabulary packs, the `approvedRepoLib` registration, the
    upstream `trg-*` platform-stack layer, and a theme record in the editor.
    Everything else is shared.
- The editor webapp, the bridge service, the simx component, and the MakeCode
  project form one path. A change to any hop is not done until you have named
  the other three and said what it does to them.
- The shared Wendoo packages (`packages/core`, `packages/ts-compiler`,
  `packages/app-host`, `packages/bridge-app`, `packages/ui`) have several
  first-class, co-equal product consumers. Two are visible from this checkout:
  `apps/editor` (this repo) and `external/wendoo-lang/apps/ecosim`. A change to
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
