---
applyTo: "**"
---

# Agent Posture for Wendoo Arcade

This file captures the working temperament and decision style expected of agents
in this repository, especially for ambiguous work touching the MakeCode
extensions (`makecode/extensions/`), the simx components (`makecode/simx/`),
the editor webapp (`makecode/simx/wendoo/src/editor`), or Wendoo bytecode
compatibility.

It complements the enforceable rules; it does not restate them. The active
instruction sources remain `AGENTS.md`, `global.instructions.md`, and
`vm.instructions.md`. This document captures the judgment to apply where those
leave a decision open.

## General Posture

Work as a careful engineering collaborator, not a code generator trying to
maximize diff size. Move the system forward in small, reviewable steps while
preserving the architectural boundaries that make the project viable.

Default to these habits:

- Read before proposing.
- Propose before editing when the next step is architectural or ambiguous.
- Keep each implementation slice narrow.
- Prefer one coherent seam over several speculative scaffolds.
- Name uncertainties explicitly.
- Stop at a design note when the right code boundary is not clear.
- Verify with focused checks after changes.

Avoid these failure modes:

- Large opportunistic rewrites.
- Scaffolding future features not needed for the current slice.
- Turning exploratory architecture discussion into committed implementation.
- Hiding missing contracts behind placeholder code.
- Treating a simx component as a place for product logic.
- Treating the editor (`makecode/simx/wendoo/src/editor`) as the owner of
  Arcade execution semantics.
- Letting `makecode/extensions/vm` diverge from the reference VM's observable
  semantics because pxt made the faithful shape inconvenient.
- Carrying a web-TypeScript idiom into a pxt project, or vice versa, without
  checking that it compiles there.

## The Empty-Tree Hazard

This repository is early: most of its tree is still empty directories. That
changes which mistakes are likely, and two in particular are worth naming.

- A decision made now to fill a blank is still a decision. Directory names,
  module seams, manifest shapes, and error conventions established in the first
  slice are what every later slice matches. Do not settle one incidentally in
  passing; say that you are setting a precedent and let the user weigh in.
- With no sibling to imitate, the temptation is to invent a house style. Look
  first at `external/wendoo-lang` and at the companion `wendoo-mcu` repository
  for the established Wendoo convention, and follow it. A new convention needs
  a reason beyond "nothing here yet."

## Small-Step Workflow

For non-trivial work, use this sequence:

1. Read the relevant instructions and files.
2. Summarize the current shape in concrete terms.
3. Identify the smallest coherent next slice.
4. State the ownership boundaries and invariants involved.
5. Wait for confirmation when the slice is not already explicitly requested.
6. Implement only that slice.
7. Run the narrowest meaningful checks.
8. Report what changed, what was verified, and what remains.

Small does not mean superficial. A small step should still be complete at its
level: a tile slice includes its host binding, docs, and tests; a runtime slice
preserves execution boundaries and state ownership.

## Viability Before Done: Correct at Real Multiplicity

A change is done when it works for the real callers the system already has -- not
when its checks pass. Green proves the code does what its tests exercise; it does
not prove the feature is usable. Before declaring any mechanism complete:

- Count the real multiplicity. State how many independent instances the mechanism
  must serve in the codebase as it exists TODAY -- callers, registration passes,
  pages, actors, concurrent fibers. This is a present fact, not a future
  scenario. A mechanism that is correct only at one (one caller, one pass, one
  instance) when the system already has more is not limited; it is broken.
- Trace the second instance. Explicitly follow the mechanism through a second
  real caller, not just the first. "Works in the demo, dies in practice" failures
  are invisible at N=1 and structural at N=2. Name the second caller and walk it.
- Test at least two. If the behavior is about interaction between instances
  (uniqueness, dedup, ordering, sharing, isolation), a single-instance test that
  passes hides the collision. Exercise two.
- Global identity comes from a global source. A value that must be unique or
  comparable across the whole program -- an id, a key, a dedup handle -- must be
  derived from an actually-global source, never minted by a local, stateful, or
  order-dependent allocator (a per-pass counter, a per-file offset). If a
  globally-unique value already exists, use it; do not build a weaker parallel one.

## A Viability-Breaking "Limitation" Is a Defect

Do not let the word "limitation" launder a defect. This binds the implementer who
writes it and the reviewer who accepts it equally.

- An acceptable limitation is an edge case the primary user can avoid, with a
  stated workaround.
- A viability break is a flaw ordinary expected use will hit -- the next real
  consumer, the normal composition, the first integration.

If a "known limitation" would be triggered by the next real caller or forces the
user to avoid a normal pattern, it is dead on arrival. Do not ship it, and do not
accept it in review as "moot for now" -- "moot for the first consumer" is exactly
how a structural defect reaches production. Escalate it as a blocking design flaw
and fix the mechanism.

## Boundary Discipline

Be critical about where code belongs.

`makecode/extensions/*` own:

- The MakeCode extensions, one per subfolder, each with its own `pxt.json`.
- Execution: `makecode/extensions/vm` runs Wendoo bytecode inside the Arcade
  game, owning fiber scheduling, the handle table, and the host loop on that
  side.
- The Arcade capabilities exposed to brains as host functions.

`makecode/simx/*` own:

- The MakeCode simx components, each a webapp in its own subfolder.
- Transport between the editor and the MakeCode project. The simx entry of
  `makecode/simx/wendoo` (`src/simx`) serves the editor tab over the port
  MakeCode brokers and joins those two ends.
- Nothing that decides product behavior, and nothing that executes bytecode.

The editor entry of `makecode/simx/wendoo` (`src/editor`) owns:

- The Wendoo editor webapp: brain authoring, project UI, and user workflows.
- Compiler integration and artifact production.
- Diagnostics and inspection surfaces.

Shared Wendoo packages own:

- Product-level document contracts.
- Shared service APIs.
- Compiler/runtime contracts that apply across Wendoo targets.

Shared Wendoo packages have co-equal consumers in more than one repository. The
binding rule (sweep and gate the consumers visible here, design for platforms
that are not) is stated once, in "Repo-Specific Scope" in `AGENTS.md`.

When a module could plausibly fit in more than one place, prefer the owner with
the narrowest durable responsibility. If a shape is a product-level contract, do
not bury it in a simx component just because that component is the first thing
to carry it across the wire.

## The Three-Hop Path

The editor webapp, the simx component, and the MakeCode project form one
path, MakeCode brokering the port between the editor tab and the simx frame,
and most real work touches more than one hop. Before changing any of them,
name all three and say what the change does to each. A fix
applied at the convenient hop rather than the responsible one is how this
architecture rots: state that belongs to the extension ends up cached in the
editor, and transport concerns leak into product code.

Mutable runtime state must be scoped to explicit runtime/device/environment
instances. Do not introduce process-global mutable state or singletons.

## The pxt Boundary

`makecode/extensions/*` are not ordinary TypeScript. They are compiled by the
MakeCode toolchain in the static subset pxt supports, with their own dependency
system and their own event model. Treat the boundary as a real one:

- Verify against pxt before assuming a language or library feature exists.
  Browser and Node semantics are not a guide.
- A pxt constraint may change how something is implemented in the extension. It
  may not change what a brain observes -- that is the VM contract, and it binds
  the extension exactly as it binds the reference VM.
- Do not reach for a shared abstraction spanning both sides just because two
  pieces of code look alike. They compile under different rules.

## Project Contract Posture

Treat shared project documents and artifact formats as Wendoo product
contracts, not one-package implementation details. When project or artifact data
can be consumed by more than one package, put the common contract in a shared
package or design doc before binding it to one implementation. The arcade
runtime can own arcade-specific target metadata and artifact validation, but it
should not silently become the owner of the whole product file format.

## Error and Diagnostic Posture

Errors and diagnostics should be machine-readable first. Use stable constants
such as `INVALID_BYTECODE_VERSION`. Human-readable messages are convenience
text; tests and app logic should match stable codes, not prose.

When adding a new error family, follow the existing repo convention:

- Export a `...Code` constant object.
- Export the corresponding union type.
- Include prose `message` fields only as secondary human context.
- Add direct tests for the new branch.

Displaying diagnostics on a user-facing surface is a separate decision
from having them; the audience rules live in
`.github/instructions/diagnostics-display.instructions.md`, scoped to
the surfaces they govern.

Where this repo has no convention yet, take it from the equivalent family in
`external/wendoo-lang` rather than inventing one.

## API Surface Posture

Be conservative when adding public API. Arcade runtime APIs, Wendoo builtins,
tiles, ambient declarations, and target document fields are external contracts.
Add them only when the confirmed implementation slice needs them or when the
design has been explicitly reviewed.

Test-only APIs and fixtures may prove runtime behavior, but scope them clearly
to tests and do not register them as permanent platform surface.

When modeling a capability that mirrors an existing system, ground the shape in
that system's actual source or official docs. Do not invent parity from memory
or from unofficial docs without checking the source shape.

## Communication Posture

Be direct and concrete. Good responses identify the actual current state, say
whether a direction is complete, partial, or missing, name the next small step,
explain ownership boundaries when they matter, and call out risks without
dramatizing them. Do not argue a plan is good merely because it avoids an
obviously bad alternative; let the technical reasoning carry the recommendation.

When handing work to a fresh session, include:

- The larger product goal.
- Explicit boundaries.
- Known state to verify.
- An instruction to read and summarize before editing.

## Fresh-Session Starter

For a fresh session, the desired posture is:

```text
First verify the current repo state. Do not implement immediately.

Read the relevant instructions and files, summarize the current shape, identify
one narrow next slice, and wait for confirmation before editing. Keep the slice
small enough to review, but complete enough to be useful. Preserve the
boundaries between the MakeCode extensions (makecode/extensions/), the simx
components (makecode/simx/), the editor webapp
(makecode/simx/wendoo/src/editor), and the upstream Wendoo packages in
external/wendoo-lang. makecode/extensions/vm is a conforming Wendoo VM; it is
held to the reference VM's observable semantics.
```
