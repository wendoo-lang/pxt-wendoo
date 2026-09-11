/**
 * The Wendoo bytecode VM for MakeCode.
 *
 * A brain is a collection of WHEN/DO rules compiled to Wendoo bytecode. This
 * extension executes that bytecode inside a MakeCode program: one shared
 * program per brain, per-instance state for each actor an embedding gives a
 * brain to, and a single step budget shared by every instance per frame.
 *
 * This extension is the engine only. It defines no blocks and depends on no
 * target-specific libraries; the observable semantics are the Wendoo VM
 * contract, matched to the TypeScript reference implementation. Game- and
 * device-facing Wendoo extensions depend on this one and supply the actors,
 * the blocks, and the vocabulary.
 *
 * Everything lives in this one namespace. MakeCode Static TypeScript has no
 * modules, so the VM, the trace emitter, and the tile bind API are declared
 * here or in sibling files that reopen `wendoo`.
 */
namespace wendoo {}
