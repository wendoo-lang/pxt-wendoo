---
applyTo: "{docs/specs/contracts/vm-contract.md,makecode/extensions/**,makecode/simx/**,apps/arcade/**}"
---

<!-- Adapted from external/wendoo-lang/.github/instructions/vm.instructions.md -->

# Wendoo VM Contract

The Wendoo VM is a stack-based bytecode virtual machine with fiber-based
concurrency and async handles. The TypeScript reference implementation lives in
`external/wendoo-lang/packages/core/src/runtime/`.

This repository adds a third implementation. `makecode/extensions/core`
implements the Wendoo VM as a MakeCode extension in the static TypeScript
subset pxt compiles, so a brain executes inside the Arcade game itself. The
reference VM is the executable spec; `makecode/extensions/core` must not
diverge from its observable semantics.

## Contract Source

The bytecode compatibility contract lives at
`external/wendoo-lang/docs/specs/contracts/vm-contract.md` until this repo
owns a local copy. When this repo adds `docs/specs/contracts/vm-contract.md`,
that local file becomes the active contract anchor for arcade work.

The TS expression of opcode numeric assignments is
`external/wendoo-lang/packages/core/src/runtime/bytecode.ts`.

A change to an opcode, operand semantic, value semantic, host calling
convention, handle behavior, or error code is an upstream change: it belongs in
`external/wendoo-lang` with the contract updated in the same unit, not in a
local workaround here.

## Execution Model

- Stack-based bytecode VM with fibers.
- Budget-limited execution: each fiber has an instruction budget decremented per
  instruction.
- Single-threaded runtime entry: one fiber runs at a time.
- External callbacks enqueue only. The host loop drains queues, resolves
  handles, schedules fibers, and executes VM entry points.
- Async operations return handles; `AWAIT` suspends the current fiber only while
  the handle is pending.

## Key Reference Files

All files below are under `external/wendoo-lang/packages/core/src/runtime/`
unless noted otherwise.

- `vm.ts` - `VM` class and `FiberScheduler`
- `vm-types.ts` - `Fiber`, `Frame`, `FiberState`, `HandleTable`, scheduler
  interfaces, and related types
- `bytecode.ts` - `Op` enum, `FunctionBytecode`, `ConstantPools`, instruction
  encoding
- `program.ts` - `Program` and `ProgramArtifact` interfaces
- `host-bindings.ts` - linked program and page metadata shapes
- `context.ts` - `ExecutionContext`, host and bytecode action bindings
- `services.ts` - nested `PlatformServices` aggregate and sub-service
  interfaces
- `value.ts` - `Value` tagged union and singleton constants
- `brain-runtime.ts` - brain runtime orchestration and `think()` loop

## Compatibility Rules

- Every conforming Wendoo VM decodes the same bytecode to the same semantics.
  The file format may differ; decoded semantics may not. There are three
  implementations: the TypeScript reference VM upstream, the C++ VM in the
  companion `wendoo-mcu` repository, and `makecode/extensions/core` here.
- The compiler is target-unaware. It emits the same bytecode regardless of the
  eventual runtime target, arcade included.
- Runtime feature flags must not create opcode subsets. Every conforming VM
  implements every opcode in the contract. A pxt language limitation is a
  reason to implement an opcode differently in `makecode/extensions/core`,
  never a reason to omit it or to narrow its semantics; if an opcode genuinely
  cannot be expressed, that is a contract-level problem to escalate, not a
  local exception to take.
- Host/platform differences are expressed through registered host functions,
  actions, ABI manifests, resource caps, and platform adapters -- never through
  opcode subsets or a target-specific decode path.
- Platform callbacks must not re-enter `brain.think()`, `scheduler.tick()`,
  `runFiber()`, or async handle resolution directly.

## Host Calling Convention

- Host calls use positional arg buffers.
- `argc` is the arg buffer width.
- `callSiteId` keys per-callsite state.
- Missing optional slots are represented as `NIL_VALUE`; there is no separate
  presence map.
- Sync host calls receive an ephemeral stack view.
- Async host calls receive an owned snapshot plus a `HandleId`.
- Every async host call must eventually resolve, reject, or cancel its handle.

## Where the VM Runs

- `makecode/extensions/core` is where brains execute, inside the Arcade game.
  It owns fiber scheduling, the handle table, and the host loop on that side,
  and it must preserve the single-entry rule under pxt's own event model: a
  MakeCode event handler enqueues, and the host loop drains.
- `apps/arcade` is an authoring surface. It may compile, inspect, and
  visualize, but the Arcade platform's execution semantics are the extension's.
- `makecode/simx/*` components are messaging endpoints between the editor and
  the MakeCode project. They carry programs and state across the gap; they do
  not execute bytecode.
- Anything that changes what a brain observes -- opcode behavior, host call
  results, handle resolution order -- is a VM-contract change, wherever in the
  path it is made.
