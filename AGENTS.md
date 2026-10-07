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

Git is a read-only tool for every agent, subagents included. Inspection and
history queries are free, and `git rm` / `git mv` are allowed as ordinary file
operations while editing. Everything that changes repository state -- the
working tree, the index, the stash, any commit, branch, tag, or ref -- is the
user's to run, and only when they ask for that specific write in that turn.
`git checkout -- <file>` and `git restore <file>` read as harmless but discard
uncommitted work: treat them as writes. To undo or fix a file, edit or
regenerate it directly, and leave changes you did not make as they stand. The
submodule at `external/wendoo-lang` is a second repository under the same
rule: a pointer bump is a write to this repo, a commit inside it a write to
that one.

## Never Kill Processes You Do Not Own

Never kill, signal, or otherwise terminate a process you did not start in the
current session -- no `kill`, `pkill`, `killall`, or equivalent. This is an
absolute rule, and a port being in use is not evidence its listener is stale
or yours: same app, same cwd, same port may well be the user's own server. If
a port you want is occupied, pick another or ask the user; never free it
yourself. This covers dev servers, watchers, language servers, databases, and
every other long-running process.

## Command Approvals

- When requesting escalated command approval, include a narrow `prefix_rule`
  when safe and allowed so repeated commands can be approved persistently.
- Do not include a `prefix_rule` for destructive commands, heredocs, or overly
  broad command prefixes.

## Package Manager

- This repo uses npm exclusively; the only root lockfile is `package-lock.json`.
  Keep pnpm and yarn out entirely -- no alternate lockfiles, no `packageManager`
  field, no `pnpm`/`yarn` invocations.
- This is intentionally NOT an npm workspaces monorepo, and must not become
  one: the platform submodule is consumed by several independent repository
  roots, and a workspace root cannot span them. No root `workspaces` field.
  Each app and simx component runs its own `npm install`; cross-package links
  use `file:` dependencies and symlinks. MakeCode extensions under
  `makecode/extensions/` sit outside npm entirely (dependencies in `pxt.json`,
  resolved into `pxt_modules/`); an extension may carry a scripts-only,
  private, dependency-free `package.json` for dev tooling, never listed in
  `pxt.json` files.
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

The MakeCode bridge address is the worked example: both apps store the
service as a bare host and let `bridge-client` pick `ws://` or `wss://`, and
neither uses a `VITE_` env var. A baked-in scheme would have been silently
stripped; an env var would have been this repo's only one.

## Build System

Builds are driven by `wendooBuild` metadata plus wireit freshness tracking,
the same setup wendoo-lang and wendoo-mcu use; `docs/build-system.md` holds
the declaration shapes and mechanics. The binding rules:

- `build:deps` is the single entry point: it walks the `file:` dependency
  graph and builds everything it finds, dependencies first, across repository
  boundaries. Every package producing build output declares `wendooBuild` and
  its wireit step per the shapes in that doc, with `wireit` in its own
  `devDependencies`.
- An input missing from a step's `files` list does not fail loudly -- it goes
  stale silently. Declare every input.
- Do not hand-roll build ordering or freshness checking; declaring inputs and
  outputs is the whole interface.
- MakeCode extensions under `makecode/extensions/` sit outside this entirely:
  pxt builds them, and they declare no `wendooBuild`.

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
- Never write retry or recovery logic that abandons its goal after a fixed
  number of attempts. An attempt cap is a made-up number: nothing about the
  failure changes at attempt N+1. Backoff ramps are fine -- bound the rate,
  never the resolve: after the last rung, keep retrying at the capped
  interval while the precondition for success can still arrive. Stopping is
  legitimate only when the goal is superseded by newer state, when
  responsibility is explicitly handed to another mechanism that will finish
  the job, or when the failure is known-permanent -- and a known-permanent
  failure must surface visibly, never idle silently.

## No Invented UI

Agents do not invent UI. Every visible shape on a product surface --
a new surface, a notice or banner, a panel, layout behavior, visual
weight, iconography, an affordance's presentation -- goes through a
design process: grounded options with a recommendation and a
judgeable visual description, then the user's ruling, then
implementation as a separate step. A defect fix that restores
already-reviewed behavior proceeds without a new review; a fix that
involves any new visible choice flags the choice instead of making
it. Pure mechanism with no visible change is exempt.

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
- On a surface whose charter is parity with a reference model, the
  no-over-build test inverts: parity itself is the customer, so "no
  immediate consumer" carries no weight there. A known divergence
  from the reference converges in the nearest coherent slice;
  deferring it is the exception and takes an explicit user ruling,
  never a planner or agent default. Partial parity -- building only
  the reference features the current slice consumes -- is a defect
  pattern, not thrift.
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
  - `makecode/extensions/*` own the MakeCode extensions, one per subfolder.
    They are nested pxt extensions: each is addressed by its GitHub
    coordinate at full depth (the VM is
    `github:wendoo-lang/pxt-wendoo/makecode/extensions/vm`), pxt's monorepo
    support requires a top-level `pxt.json` at the repo root, and a shipped
    extension's coordinate is public identity, so its directory is not free
    to rename. Four unit kinds:
    - `makecode/extensions/vm` is the STS VM and nothing else: the bytecode
      VM in MakeCode static TypeScript (a conforming Wendoo VM per
      `.github/instructions/vm.instructions.md`), the trace emitter, debug
      logging (`wendoo.debug`, off until a program sets it, the way Arcade's
      own `game.debug` works: every machine-readable console line the
      extensions write goes through `debugLog`, because console output has
      visible side effects in the MakeCode editor), the
      tile bind API (struct fields may carry accessor tiles: `withAccessor`
      gives a field one, the catalog carrying its label and icon on the
      field, the accessor read-only exactly when the field is; a sensor may
      be declared inline -- reading as a value inside an expression -- and
      writable-result -- a live reference a brain may write a field
      through -- and a tile's declared output writable-result the same way,
      the catalog carrying the flag on the output; asset types included: `defineAssetType` declares a
      struct type whose values name a project asset of a pack-given kind
      by its id, in one read-only `asset` field, the catalog carrying the
      kind -- the mechanism only, every asset kind declared by a target's
      pack; and brain types: `defineBrainType` declares a struct type whose
      values name one of the project's compiled brains by its document id,
      in one read-only `id` field, the catalog marking the type `brain`,
      the binding minting a value naming a brain and logging a document id
      no compiled brain holds, once per id --
      again the mechanism only, declared by a target's base pack; and
      variable types: a struct type's `TypeMeta` may set
      `variableFactory`, the catalog marking the type `variableFactory` so
      the editor offers variables of it -- the mechanism only, every
      variable type flagged by a target's pack; and core
      tile icons: `defineCoreTileIcon` gives a core tile -- one of the
      editor's own core vocabulary, addressed by its stable tile id -- an
      icon the catalog carries under the giving pack, every icon given
      carried in order, again the mechanism only, the ids and icons
      supplied by a target's pack; and core type icons:
      `defineCoreTypeIcon` gives a core type -- one of the language's own
      types, addressed by its catalog name, such as `number` -- an icon the
      catalog carries the same way, the mechanism only, the names and icons
      supplied by a target's pack; and core operator overloads:
      `overloadOperator` adds an overload to a core operator -- addressed by
      its id, such as `eq` -- over the operand types a pack declares, the
      operator's own tile standing for it and no tile minted, the catalog
      carrying it under the giving pack, its host-function id mapped under
      the name the operator id and operand types derive, as
      `eq(Image,Image)` -- again the mechanism only, the overloads supplied
      by a target's pack), the
      language-level tiles, the compiled-brain
      registry, the project id manifest's reader (the calls the generated
      `ids.g.ts` makes), the program loader, the target-blind program host
      (the single-entry host loop a target's frame loop drains; every host
      of a program run shares the one drain of every pack's registrations
      through the project's id manifest, `hostRegistries`; each actor's
      world names the host that started its program, which lists the
      actors running a given brain; each program's faults reach the host's
      observer as they are raised, retained nowhere, and are logged once
      per fault code through `debugLog`; a throw out of a program's start
      or think faults that program, which stays on its actor, and the
      drain goes on; a throw out of a page-activation hook faults the
      program and the page's activation goes on, every later hook running
      and every rule spawning), and the
      empty program `wendooBrains.none` (`empty.g.ts`, generated from
      `empty.src.json` by `npm run gen:vm-programs` in `apps/editor`).
      NO block definitions -- the compiled-brain type's
      `//% fixedInstances` attribute is toolbox metadata on a type, which
      a target extension's block parameter turns into its dropdown --
      ZERO target-specific pxt dependencies (`core: "*"` only):
      MakeCode-target-agnostic by construction, portable to other targets
      and extractable later as a file move -- proven by compiling against a
      second target, not by convention. Extraction changes the public
      coordinate, so that decision's deadline is before external projects
      pin it.
    - Each target has exactly one BASE PACK, created when the first type
      declaration needs it. It depends on the VM extension and owns the
      target's type declarations: asset types (arcade: image, song,
      tilemap, tile, animation) and built-in types (arcade: sprite). It
      reserves a base set of common tile vocabulary shared by its target's
      packs; tiles land there only by explicit ruling, never by drift.
      Arcade's is `makecode/extensions/arcade-base`
      (`github:wendoo-lang/pxt-wendoo/makecode/extensions/arcade-base`),
      registered as the pack `arcade`; it depends on the VM extension and
      Arcade's `device` library. It owns the sprite's program world (the
      `SpriteWorld` every arcade pack's host-bound tile reaches its sprite
      through), the `Vector2` type (a direction, or a point in a slot naming
      a place to head for; its `x` and `y` read-only accessors, `y` growing
      downward as the move's direction modifiers do; one holding an
      infinity or a not-a-number reads to the pack's tiles as no `Vector2`
      at all), the `Sprite` type (a
      host value backed by the sprite it stands for, its fields read from
      and written to that sprite through field hooks, each with an accessor:
      `image` reads the image the sprite wears and a write dresses it,
      keeping its image given none; `position` reads a fresh `Vector2`
      snapshot of its center and a write sets the center at once, velocity
      left to move arbitration; `brain` reads the brain it runs through the
      actor world's program host, nil while none runs, and a write only
      records an attach request the drain applies -- idempotent for the
      brain already running, nil running the empty program, a document id
      no compiled brain holds a logged no-op; `moveSmoothing` reads, in
      seconds, the smoothing time constant the sprite's moves ease with --
      its own, else the global -- 0 while off, and a write of a number of
      seconds gives the sprite smoothing of its own, a negative number
      giving it 0 and a write holding no usable number a no-op logged once
      per run; a destroyed sprite reads nil
      and ignores writes, and no write is ever refused), the `Image` asset
      type (a plain struct holding the pxt asset id of one of the project's
      images, resolved through pxt's image factories when a tile uses it,
      never baked into a program; an id no factory holds resolves to
      nothing, logged once per id, and the game runs on; a value read from
      a sprite's image instead wraps that image object itself, its asset id
      reading empty), the `Brain` type (the vm's brain type, naming one of
      the project's brains by document id), the core equality and
      inequality operators' overloads over two images (equal when they have
      the same pixels, whichever image objects they are; an image no
      factory holds, or a value naming no image, equals nothing), two
      sprites (equal when they are the same sprite, not destroyed), two
      brains (equal when they name the same document id, whether or not the
      project holds that brain) and two `Vector2`s (equal when both
      components are, a value holding no point equalling nothing),
      inequality holding exactly when equality does not, the core addition
      and subtraction operators' overloads over two `Vector2`s and the core
      multiplication operator's over a `Vector2` and a number on its right
      (component by component, each result a fresh `Vector2`, nil over a
      value holding no point or no number, an overflowing result holding
      its infinity for the pack to read as no point; no multiplication takes
      a number on its left and no division takes a `Vector2`), the arcade
      icon encoder (each tile icon, an img literal,
      carried in the catalog as hex of MakeCode's own image buffer, the
      bytes `image.ofBuffer` reads, at the image's own bits per pixel) with
      the pack's tile and accessor icons, the icons of its `Vector2`,
      `Sprite` and `Brain` types, the variable factory flag and editor
      label (`position`, `sprite`) of its `Vector2` and `Sprite` types (a
      `Vector2` variable holds the point written to it -- the store's
      deep copy is the snapshot; a `Sprite` variable holds the sprite
      itself, its native backing copied by reference with no snapshot
      hook, so once that sprite is destroyed its fields read nil and
      writes through it change nothing), the icons it gives the core tiles (the page tiles,
      every page's own tile through the page family id, the timer, AND, OR,
      NOT, the six comparisons, the arithmetic
      operators, gets, the parentheses, random number, true, false, nil, and
      the variable and tile factories), and the icons it gives the core
      number, text and switch types (`number`, `string` and `boolean`), the controller read (one module owning every
      raw read and its dead-banded transform), the proximity read (one
      module owning the
      nearest-sprite scan and its center-distance metric, made
      synchronously at sense time), the overlap read (one module owning
      every sprite-touch read, picking among touched sprites through the
      proximity read's scan), the wander module (one module owning each
      wandering move's random on-screen destination, kept per call site in
      the sprite's world, its re-picks on arrival or deadline, and the random
      source picking it), the `dpad`, `bump`, `in range`, `out of range`
      and `myself` sensors and the `move` actuator (`myself` reads the
      program's own sprite, inline and writable-result, so accessors follow
      it and `[myself][image] = ...` writes a field;
      the three proximity sensors share one optional anonymous filter,
      an image, a sprite or a brain, applied through the proximity scan's
      admits predicate: an image admits the sprites whose image has the
      same pixels, a sprite admits that sprite alone, a brain admits the
      sprites running it in the reading program's host, an image no
      factory holds, a value standing for no sprite or a brain no sprite
      runs admits none, and the program's own sprite is never read; the
      shared `modifier.position.*` fragments -- above or below, left or
      right, at most one per axis by grammar -- add to the same predicate
      that the other sprite's center lies strictly on each given side of
      the program's sprite's center; each
      also writes the sprite it reads, or nil, to a declared `Sprite`
      output of its own on every run -- `bumped`, `inRange`,
      `outOfRange` -- which the output's tile reads in the sensor's rule
      and the rules below it, while the rule's WHEN result keeps carrying
      the same sprite; each output is declared writable-result, so a rule
      may write a field of the sprite it holds through its tile, as in
      setting the bumped sprite's brain; each of the range pair reads the nearest
      admitted sprite against its range -- an optional anonymous number of
      pixels, else the shared default -- so at equal ranges and filters
      exactly one of the pair fires whenever an admitted sprite exists, and
      neither fires while none does;
      the shared `modifier.direction.*` fragments filter dpad's reading and
      specify move's direction; move's `modifier.movement.toward` and
      `modifier.movement.away` add the direction toward or away from their
      one shared target -- an optional anonymous sprite (live) or `Vector2`
      point (fixed), which the grammar offers only once either is placed --
      else from the sprite its WHEN produced, and `modifier.movement.wander`
      the direction toward its destination, all summed with the
      cardinals; a move heading for one goal alone -- toward its target or
      wander toward its destination, nothing else adding a direction --
      goes no farther than the goal in one frame, its speed held to the
      remaining distance over the frame's duration, and a toward or wander
      at its goal holds the sprite still rather than falling back; move's
      anonymous speed argument reads a not-a-number or a number below 0 as
      0 and a positive infinity as the physics engine's top speed), and
      move arbitration with its motion applicator (the direct applicator
      sets sprite velocity, held in its own direction to the physics
      engine's top speed, and -- while the sprite's smoothing, a time
      constant in milliseconds, is set -- eases from the velocity the
      sprite actually has toward a velocity at least as fast,
      exponentially in the frame's duration, and sets a slower one at
      once, so a brain change, a velocity game code set, and a wall's stop
      all ease on from where the sprite is, the applicator reading back
      the velocity it last set at full precision while the sprite still
      holds it; a verdict carries only the sprite and the velocity its
      programs ask for, each applicator keeping its own state; a
      sprite's smoothing is its own, kept on the sprite itself across the
      brains it runs and given by `wendoo.setMoveSmoothing` (milliseconds,
      a negative or non-finite number taking it away) or its `moveSmoothing`
      field, else the global `wendoo.moveSmoothing`, 0 and off by default; a
      verdict coming to an infinite or not-a-number velocity stops the
      sprite as a release does; a motion model such as physics replaces
      the applicator, consumes the same verdicts, and owns its own
      motion feel -- smoothing is the direct applicator's kinematic
      concern, and a sprite a physics model controls never also takes
      the global or per-sprite smoothing).
    - The game-facing arcade extension, `makecode/extensions/arcade`
      (`github:wendoo-lang/pxt-wendoo/makecode/extensions/arcade`),
      depends on the VM extension, Arcade's `device` library, and the
      arcade base pack, and declares no vocabulary of its own. It owns the
      arcade-bound pieces: the spawn block (`wendoo.runBrain`, its
      program picked by name from the project's compiled brains), sprite
      pairing and hosting (one program host per game scene, drained from
      the scene's own update loop), and the catalog publication on the
      game's first frame, icons rendered by the base pack's arcade icon
      encoder; the WendooBrain asset blocks and the simx
      binding join it. Naming: the bare target name belongs to this
      front-door extension -- the one coordinate a user adds, which
      pulls the rest in; the base pack is `<target>-base`, and genre
      extensions are `<target>-<genre>` siblings of the front door
      atop the base. Block text and every API identifier a kid meets
      in the JavaScript view say "brain"; block IDs are never shown
      and are permanent, because saved blocks match on them (the
      spawn block's is `wendoo_run_program`).
    - FEATURE PACKS supply host-bound tiles for one genre of game. A
      feature pack depends on its target's base pack (and through it the
      VM extension), never on another feature pack; packs compose by
      keeping tile names disjoint. The majority of vocabulary comes from
      packs and user code, not from core. Where the line falls between a
      core tile, a base-pack tile, and a feature-pack tile is not settled:
      when a tile could plausibly go either way, raise it rather than
      deciding it in passing.
  - `makecode/simx/*` own the MakeCode simx components, each a webapp in
    its own subfolder; `makecode/simx/bridge` connects to the bridge
    service, joining the editor webapp to the MakeCode project. A simx is a
    channel, not a store: its frame persists across sim restarts and runs
    but is reallocated on a page reload or project teardown, so no state
    may live only there. It is not product UI, but its frame is a visible panel
    and renders a minimal session-status surface -- the join code while the
    editor seat is vacant, and basic connection state; no authoring, no
    catalog display. One shared artifact serves every target, bound by an
    `approvedRepoLib` entry in each target's own `targetconfig.json`
    (`owner/repo` key, hosting URL); it knows its hosting target from the
    `target` frame URL param and may carry target-keyed behavior (asset
    previews, target-specific state). Per-target simx builds are not
    taken; raise a need as a decision.
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
    management, compiler integration, the project's id allocation, and
    diagnostics. The editor is
    TARGET-BLIND: the tile vocabulary is injected from the MakeCode side
    over the bridge, so the catalog is session data, never build
    configuration -- the editor binds the catalog's packs into its
    authoring environment through the language model's own builders, under
    the ids it allocates and keeps in the project's id manifest -- each
    declared accessor as an accessor tile, each type once the types its
    fields name are bound, each type the catalog marks `variableFactory`
    with its variable factory, wearing the type's label (its name when it
    carries none) and icon, each overload a pack adds to a core operator
    onto that operator, minting no tile -- and puts
    the icons packs give core tiles on its own core tiles, the first icon
    given a tile standing and an icon given a tile it does not hold
    ignored -- except one given the page family id `tile.page`, which every
    page's own tile wears, the first given standing -- and binds each
    catalog type's icon to the bound type, which
    each literal of a brain type wears, and each icon packs give a core
    type to that core type, the first icon given standing and an icon
    given a name that is no core type reported; every type icon bound is
    the brain editor's data-type icon for that type, which every variable
    tile of the type carrying no icon of its own wears; a type's variable
    factory label is the brain editor's name for that type; the one
    target-aware residue is the per-target theme
    record (the target's display name and theme token overrides), keyed
    by the target id carried in the session hello. Tripwire: this holds because
    user-authored tiles live on the MakeCode side -- a Wendoo-TS user-tile
    flow in this editor would reintroduce target-specific ambient typings
    and must be raised as a boundary change, not slipped in. (The directory
    name predates the target-blind ruling; renaming rides F48.)
  - `apps/bridge` owns the bridge service that `makecode/simx/bridge` connects
    to. Also target-blind: one deployment serves every target.
  - The complete per-target surface of this repo is: the target base pack,
    the game-facing extension, feature packs, the `approvedRepoLib`
    registration, the upstream `trg-*` platform-stack layer, a theme record
    in the editor, and target-keyed code paths inside the shared simx.
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
