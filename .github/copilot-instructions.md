# Copilot Instructions

Before working in any area of the codebase, list `.github/instructions/` and
read `global.instructions.md` plus any files whose name matches the area you are
working in.

These instructions apply to all Copilot features, including inline tab
completions.

## Code Quality

- This code will be used for teaching; document exported APIs well enough that
  readers can understand them without external context.
- This is a production codebase; only suggest code that is correct, complete,
  and ready for production use.
- Never emit placeholder code. Do not use `TODO`, `FIXME`, `...`,
  `/* implementation */`, `throw new Error("Not implemented")`, or any other
  stub pattern unless the user has explicitly written a stub and is asking to
  fill it in.
- Never produce non-production statements such as `console.log("test")`,
  `console.log("here")`, hardcoded magic strings used only for debugging, or
  temporary workarounds presented as real code.
- Do not add comments that just restate what the code does. Only include
  comments that explain non-obvious intent, invariants, or constraints.
- In user-facing copy (READMEs, docs, UI strings), describe Wendoo on its own
  terms. Honest contrast about fit is fine, in both directions ("for an
  algorithm like a sort, write it in code"). Contrast as a sales device is
  not: never frame another approach as lesser so Wendoo shines ("instead of
  long scripts"). The test is whether the sentence informs the reader about
  fit or diminishes something else.

## Import Style

- Never use inline `import()` type expressions in `.ts` or `.tsx` files. Always
  use a top-level `import type` statement instead.
  - Exception: `.d.ts` ambient declaration files, if this repo later adds them.

## Naming and Layout Conventions

- Match the naming and placement conventions already established in the area
  you are editing when creating new files, directories, test files, generated
  artifacts, or other repo entries.
- Before creating a new file, inspect nearby siblings and follow the dominant
  local pattern for separators, casing, prefixes, suffixes, and test file
  naming.
- Do not introduce a new naming pattern to an area of the repo unless the user
  explicitly asks for it or an existing tool/framework requires it.
- Much of this repo is still empty. Where an area has no sibling to match,
  follow the corresponding area of the reference apps rather than inventing a
  local convention: `external/wendoo-lang/apps/ecosim`, and `apps/microbit-sim`
  in the companion `wendoo-mcu` repository when that checkout is available.
  Check the shared packages too -- a convention is often implemented once in
  `packages/*` and merely consumed by both apps. Departing from a pattern you
  found requires a stated reason, not just a preference.

## Project-Specific Rules

This repository (pxt-wendoo) brings Wendoo to MakeCode; the VM is
target-agnostic and Arcade is the first target. Two toolchains meet here, and
the top-level layout does not follow their line: `makecode/simx/` and
`packages/` are ordinary npm/TypeScript projects, while `makecode/extensions/`
are MakeCode (pxt) projects written in the static TypeScript subset pxt
compiles. Do not carry an idiom across that boundary without checking that it
is legal on the other side.

### MakeCode Extensions (`makecode/extensions/*`)

- One MakeCode extension per subfolder, each with its own `pxt.json`.
  Dependencies are declared there and resolved into `pxt_modules/` by the
  MakeCode toolchain, never by npm.
- Write the static TypeScript subset pxt supports. Closures over mutable
  captures, dynamic property access, and most of the standard library are not
  available; when unsure, check what pxt actually compiles rather than assuming
  browser or Node semantics.
- `makecode/extensions/vm` implements the Wendoo bytecode VM: no blocks, no
  target-specific dependencies, target-agnostic by construction. It is a
  conforming VM, not an approximation -- see the VM Contract section below.

### MakeCode simx Components (`makecode/simx/*`)

- One simx component per subfolder, each a webapp. `makecode/simx/wendoo`
  holds two entries: its simx entry (`src/simx`) joins the editor webapp to
  the MakeCode project over the port MakeCode brokers to the editor tab, and
  its root entry (`src/editor`) is the editor webapp, running as that tab.
- A simx component is a messaging endpoint, not a place for product logic.
  Brain authoring belongs in the editor (`makecode/simx/wendoo/src/editor`);
  execution belongs in the extension.

### Editor Webapp (`makecode/simx/wendoo/src/editor`)

- The editor entry (`makecode/simx/wendoo/src/editor`) owns the Wendoo editor
  webapp: brain authoring, project management, compiler integration, artifact
  loading, and diagnostics.
- It reaches the MakeCode project only over its session with the simx entry
  of `makecode/simx/wendoo`, on the port MakeCode brokers; the simx frame is
  the one writer of the project's files. Do not add a second, direct path
  between the editor and MakeCode.

### Session Kind (`packages/protocol`)

- `packages/protocol` (`@wendoo/makecode-session`) is the MakeCode session
  kind: the `makecode:*` messages and the session objects both entries speak.
- It binds the upstream peer-session mechanism (`packages/bridge-app`).
  Consume it; do not fork message shapes or session rules locally.

### VM Contract

- `makecode/extensions/vm` is a third Wendoo VM implementation, alongside the
  TypeScript reference VM upstream and the C++ VM in `wendoo-mcu`. Every
  conforming VM decodes the same bytecode to the same semantics; the reference
  VM in `external/wendoo-lang/packages/core/src/runtime/` is the executable
  spec.
- Decoded bytecode semantics follow
  `external/wendoo-lang/docs/specs/contracts/vm-contract.md` until this repo
  owns a local `docs/specs/contracts/vm-contract.md`.
- Runtime feature flags must not create opcode subsets. Platform differences
  are expressed through registered host functions and adapters. A pxt
  limitation is a reason to implement an opcode differently, never a reason to
  omit it.
- All compilation and linking happen on the compiler side. Runtime code must
  not introduce target-aware bytecode lowering.
- Preserve the Wendoo host calling convention: positional arg buffers,
  callsite ids, async handles, and single-entry host-loop execution.
