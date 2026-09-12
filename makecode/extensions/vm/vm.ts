/**
 * The stack-based bytecode dispatch loop and the fiber state it runs over.
 *
 * The VM trusts the bytecode it receives: the compiler is the sole guarantor of
 * validity. A malformed or not-yet-implemented instruction surfaces as a fault
 * on the offending fiber, never as a throw escaping {@link VM.runFiber}.
 */
namespace wendoo {
  /** Lifecycle state of one fiber. */
  export enum FiberState {
    Runnable = 0,
    Waiting = 1,
    Done = 2,
    Fault = 3,
    Cancelled = 4,
  }

  /** How one budgeted slice of a fiber ended. */
  export enum VmStatus {
    /** The fiber ran its root `RET` and is complete. */
    Done = 0,
    /** The slice ended with the fiber still runnable. */
    Yielded = 1,
    /** The fiber faulted. */
    Fault = 2,
    /** The fiber parked on a pending handle. */
    Waiting = 3,
  }

  /**
   * Where a fiber parked at an `AWAIT` resumes, and the handle it waits on.
   * The stack height is the height after the `AWAIT` popped its handle.
   */
  export class AwaitSite {
    /** Program counter the resumed fiber continues at. */
    resumePc: number;
    /** Operand-stack height the resumed fiber is truncated to. */
    stackHeight: number;
    /** Frame-stack depth the resumed fiber is truncated to. */
    frameDepth: number;
    /** Handle the fiber waits on. */
    handleId: number;

    constructor(resumePc: number, stackHeight: number, frameDepth: number, handleId: number) {
      this.resumePc = resumePc;
      this.stackHeight = stackHeight;
      this.frameDepth = frameDepth;
      this.handleId = handleId;
    }
  }

  /**
   * Consecutive rounds one dispatch may find the handle table full before its
   * fiber faults `StackOverflow`.
   */
  export const HANDLE_BACKPRESSURE_FAULT_ROUNDS = 8192;

  /**
   * The seam the dispatch loop reaches the fiber scheduler through for
   * `SPAWN_RULE`. Subclass and override
   * {@link ChildRuleSpawner.spawnChildRule}.
   */
  export class ChildRuleSpawner {
    constructor() {}

    /**
     * Spawn a fire-and-forget child-rule fiber running `funcId` and hold it in
     * the current round's spawn drain.
     *
     * @param funcId - Rule entry function id of the child.
     * @param subtreeRootFuncId - Funcid of the root rule the child descends from.
     * @param ctx - Context the child executes against.
     */
    spawnChildRule(funcId: number, subtreeRootFuncId: number, ctx: ExecutionContext): void {}
  }

  /** One call frame. */
  export class Frame {
    /** Function id this frame runs. */
    funcId: number;
    /** Program counter into the function's instruction list. */
    pc: number;
    /** Rule funcId owning this frame, or {@link NO_RULE}. */
    ruleFuncId: number;

    constructor(funcId: number, ruleFuncId: number) {
      this.funcId = funcId;
      this.pc = 0;
      this.ruleFuncId = ruleFuncId;
    }
  }

  /** One fiber: an isolated operand stack, frame stack, and slice budget. */
  export class Fiber {
    /** Scheduler-assigned id; rendered by a `fault` trace line. */
    id: number;
    /** Lifecycle state. */
    state: FiberState;
    /** Operand stack, bottom first. */
    vstack: Value[];
    /** Call frames, outermost first. */
    frames: Frame[];
    /** Instructions remaining in the current slice. */
    instrBudget: number;
    /** The context this fiber executes against. */
    ctx: ExecutionContext;
    /** Rule funcId of the fiber's entry function, or {@link NO_RULE}. */
    ruleFuncId: number;
    /**
     * Funcid of the root rule whose subtree this fiber belongs to, or
     * {@link NO_RULE} on a fiber the scheduler spawned for a root rule itself.
     */
    rootRuleFuncId: number;
    /** Where the fiber resumes while it is parked at an `AWAIT`, else `undefined`. */
    awaitSite: AwaitSite;
    /** Whether a handle that settled without a value is queued to throw at the resume point. */
    pendingInjectedThrow: boolean;
    /** Classifier that queued throw carries. */
    injectedErrorCode: ErrorCode;
    /** Program counter of the dispatch that last found the handle table full, or -1. */
    handleBackpressurePc: number;
    /** Consecutive rounds the dispatch at {@link Fiber.handleBackpressurePc} has found it full. */
    handleBackpressureRounds: number;

    constructor(id: number, ctx: ExecutionContext, ruleFuncId: number) {
      this.id = id;
      this.state = FiberState.Runnable;
      this.vstack = [];
      this.frames = [];
      this.instrBudget = 0;
      this.ctx = ctx;
      this.ruleFuncId = ruleFuncId;
      this.rootRuleFuncId = NO_RULE;
      this.awaitSite = undefined;
      this.pendingInjectedThrow = false;
      this.injectedErrorCode = ErrorCode.HostError;
      this.handleBackpressurePc = -1;
      this.handleBackpressureRounds = 0;
    }
  }

  /** Per-fiber and per-round capacity caps. A device profile pins these values. */
  export class VmCaps {
    /** Instructions granted to each fiber slice of a round. */
    defaultBudget: number;
    /** Values a single fiber's operand stack may hold. */
    maxStackSize: number;
    /** Pending async handles one brain instance holds at once. */
    maxHandles: number;

    constructor(defaultBudget: number, maxStackSize: number, maxHandles: number) {
      this.defaultBudget = defaultBudget;
      this.maxStackSize = maxStackSize;
      this.maxHandles = maxHandles;
    }
  }

  /**
   * One fault the VM raised, with the instruction site that raised it. The
   * `code` is the contractual, wire-stable classifier a `fault` trace line
   * renders; `message` is diagnostic text that never reaches a trace.
   */
  export class VmFault {
    /** Wire-stable fault classifier. */
    code: number;
    /** Diagnostic text. */
    message: string;
    /** Function id the raising instruction sits in. */
    funcId: number;
    /** Program counter of the raising instruction. */
    pc: number;

    constructor(code: number, message: string, funcId: number, pc: number) {
      this.code = code;
      this.message = message;
      this.funcId = funcId;
      this.pc = pc;
    }
  }

  /**
   * Diagnostic message prefix of the fault the dispatch loop raises on an
   * opcode it does not dispatch. The rest of the message is the opcode number.
   */
  export const UNIMPLEMENTED_OPCODE_MARKER = "unimplemented-opcode";

  /** How one instruction ended, before any fault the VM recorded is consumed. */
  enum StepOutcome {
    /** Dispatch continues with the next instruction. */
    Continue = 0,
    /** The fiber reached its root `RET`. */
    Done = 1,
    /** The fiber parked on a pending handle. */
    Waiting = 2,
    /** The slice ended with the fiber still runnable at the same instruction. */
    Yielded = 3,
  }

  /**
   * The bytecode dispatch loop. One instance runs every fiber of one brain
   * instance against one loaded program.
   */
  export class VM {
    private program: Program;
    private hostFunctions: HostFunctionRegistry;
    private hostActions: HostActionRegistry;
    private observer: VmObserver;
    private caps: VmCaps;
    private faultCode: number = NO_FAULT;
    private faultMessage: string = "";
    /** Every fault this VM raised, in the order it raised them. */
    faults: VmFault[] = [];
    /** Pending async operations this VM's fibers dispatched. */
    handles: HandleTable;

    constructor(
      program: Program,
      hostFunctions: HostFunctionRegistry,
      hostActions: HostActionRegistry,
      observer: VmObserver,
      caps: VmCaps
    ) {
      this.program = program;
      this.hostFunctions = hostFunctions;
      this.hostActions = hostActions;
      this.observer = observer;
      this.caps = caps;
      this.handles = new HandleTable(caps.maxHandles);
    }

    /**
     * Build a fiber whose entry frame runs `funcId`. Entering a rule at its
     * own entry point begins that rule's next firing.
     *
     * @param fiberId - Scheduler-assigned id for the new fiber.
     * @param funcId - Entry function id.
     * @param ctx - Context the fiber executes against.
     */
    spawnFiber(fiberId: number, funcId: number, ctx: ExecutionContext): Fiber {
      const ruleFuncId = this.program.isRuleFunc(funcId) ? funcId : NO_RULE;
      if (ruleFuncId !== NO_RULE) {
        // A fiber spawned at a rule's own entry point is that rule's next
        // firing; its abandonment mark starts empty.
        ctx.services.ruleCompletion.clearAbandoned(ruleFuncId);
      }
      const fiber = new Fiber(fiberId, ctx, ruleFuncId);
      fiber.frames.push(new Frame(funcId, ruleFuncId));
      return fiber;
    }

    /**
     * The parent rule of `ruleFuncId` in the loaded program's rule-ancestor
     * table, or {@link NO_RULE} for a root rule and for a funcId the table
     * does not declare.
     *
     * @param ruleFuncId - Rule funcId to resolve.
     */
    ruleParentFuncId(ruleFuncId: number): number {
      return this.program.ruleParentFuncId(ruleFuncId);
    }

    /**
     * Run one budgeted slice of `fiber`, up to its remaining
     * `instrBudget`. Returns how the slice ended; a fault has already
     * transitioned the fiber and notified the observer.
     *
     * @param fiber - A runnable fiber with a positive budget.
     * @param spawner - Scheduler seam a `SPAWN_RULE` in this slice spawns through.
     */
    runFiber(fiber: Fiber, spawner: ChildRuleSpawner): VmStatus {
      this.syncContextFromTopFrame(fiber);

      while (fiber.instrBudget > 0) {
        if (fiber.state !== FiberState.Runnable) {
          return VmStatus.Done;
        }
        fiber.instrBudget--;
        this.faultCode = NO_FAULT;
        this.faultMessage = "";

        const frame = fiber.frames[fiber.frames.length - 1];
        if (fiber.pendingInjectedThrow) {
          fiber.pendingInjectedThrow = false;
          this.raise(fiber.injectedErrorCode, "awaited handle did not resolve");
          return this.consumeFault(fiber, frame);
        }

        const fn = this.program.functions[frame.funcId];
        if (frame.pc < 0 || frame.pc >= fn.code.length) {
          this.raise(ErrorCode.ScriptError, "pc out of bounds");
          return this.consumeFault(fiber, frame);
        }

        const outcome = this.executeInstruction(fiber, fn.code[frame.pc], frame, spawner);
        if (this.faultCode !== NO_FAULT) {
          return this.consumeFault(fiber, frame);
        }
        if (outcome === StepOutcome.Done) {
          this.transitionState(fiber, FiberState.Done);
          return VmStatus.Done;
        }
        if (outcome === StepOutcome.Waiting) {
          return VmStatus.Waiting;
        }
        if (outcome === StepOutcome.Yielded) {
          return VmStatus.Yielded;
        }
      }

      return VmStatus.Yielded;
    }

    /**
     * Resume `fiber` from the handle it parked on: truncate its operand and
     * frame stacks to the await site, continue at the instruction past the
     * `AWAIT`, and either push the settled value or, on a handle that settled
     * without one, queue its classifier to throw there. Returns whether the
     * fiber was parked on `handle` and is now runnable.
     *
     * @param fiber - The fiber to resume.
     * @param handle - The settled handle it parked on.
     */
    resumeFiberFromHandle(fiber: Fiber, handle: Handle): boolean {
      if (fiber.state !== FiberState.Waiting || !fiber.awaitSite || fiber.awaitSite.handleId !== handle.id) {
        return false;
      }
      const site = fiber.awaitSite;
      while (fiber.frames.length > site.frameDepth) {
        fiber.frames.pop();
      }
      while (fiber.vstack.length > site.stackHeight) {
        fiber.vstack.pop();
      }
      if (fiber.frames.length > 0) {
        fiber.frames[fiber.frames.length - 1].pc = site.resumePc;
      }
      fiber.awaitSite = undefined;
      fiber.state = FiberState.Runnable;

      if (handle.state === HandleState.Resolved) {
        fiber.vstack.push(handle.result);
      } else {
        fiber.pendingInjectedThrow = true;
        fiber.injectedErrorCode = handle.errorCode;
      }
      return true;
    }

    /**
     * End `fiber` without running it again: unpark it from any handle it
     * waits on, so a later settle of that handle reaches it no more, and move
     * it to {@link FiberState.Cancelled}, which marks every rule in its
     * ancestry as an abandoned firing. A fiber already in a terminal state is
     * left alone.
     *
     * A cancelled fiber raises no fault and reports nothing to the observer.
     *
     * @param fiber - The fiber to cancel.
     */
    cancelFiber(fiber: Fiber): void {
      if (fiber.state === FiberState.Done || fiber.state === FiberState.Fault || fiber.state === FiberState.Cancelled) {
        return;
      }
      if (fiber.state === FiberState.Waiting && fiber.awaitSite) {
        this.handles.removeWaiter(fiber.awaitSite.handleId, fiber.id);
        fiber.awaitSite = undefined;
      }
      this.transitionState(fiber, FiberState.Cancelled);
    }

    private consumeFault(fiber: Fiber, frame: Frame): VmStatus {
      const code = this.faultCode;
      this.faults.push(new VmFault(code, this.faultMessage, frame.funcId, frame.pc));
      this.faultCode = NO_FAULT;
      this.faultMessage = "";
      this.transitionState(fiber, FiberState.Fault);
      this.observer.onFiberFault(fiber.id, code);
      return VmStatus.Fault;
    }

    /**
     * Move `fiber` to `newState`, running the settle walk on every terminal
     * transition.
     */
    private transitionState(fiber: Fiber, newState: FiberState): void {
      fiber.state = newState;
      if (newState === FiberState.Done || newState === FiberState.Fault || newState === FiberState.Cancelled) {
        this.settleRuleWatchers(fiber, newState);
      }
    }

    /**
     * The settle walk, run at every fiber terminal transition. Marks every
     * rule in the finishing fiber's ancestry as an abandoned firing when the
     * fiber faulted or was cancelled, then settles the watcher slot of each
     * of those rules whose cluster has emptied: `true` on a `DidFire` record
     * with no abandonment mark, `false` otherwise.
     *
     * Call only once `fiber.state` is terminal.
     */
    private settleRuleWatchers(fiber: Fiber, cause: FiberState): void {
      const completion = fiber.ctx.services.ruleCompletion;
      const abandoning = cause !== FiberState.Done;

      let ruleFuncId = fiber.ruleFuncId;
      while (ruleFuncId !== NO_RULE) {
        if (abandoning) {
          completion.markAbandoned(ruleFuncId);
        }
        const handleId = completion.getWatcher(ruleFuncId);
        if (handleId !== NO_HANDLE && !completion.hasLiveSubtree(ruleFuncId)) {
          const fired =
            !completion.isAbandoned(ruleFuncId) &&
            fiber.ctx.services.ruleFiring.get(ruleFuncId) === RuleFiringState.DidFire;
          completion.clearWatcher(ruleFuncId);
          this.handles.resolve(handleId, fired ? TRUE_VALUE : FALSE_VALUE);
        }
        ruleFuncId = this.ruleParentFuncId(ruleFuncId);
      }
    }

    private raise(code: ErrorCode, message: string): void {
      if (this.faultCode === NO_FAULT) {
        this.faultCode = code;
        this.faultMessage = message;
      }
    }

    private executeInstruction(fiber: Fiber, ins: Instr, frame: Frame, spawner: ChildRuleSpawner): StepOutcome {
      switch (ins.op) {
        case Op.PUSH_CONST_VAL:
          return this.execPushConstVal(fiber, ins, frame);
        case Op.PUSH_CONST_NUM:
          return this.execPushConstNum(fiber, ins, frame);
        case Op.PUSH_CONST_STR:
          return this.execPushConstStr(fiber, ins, frame);
        case Op.POP:
          return this.execPop(fiber, frame);
        case Op.DUP:
          return this.execDup(fiber, frame);
        case Op.STACK_SET_REL:
          return this.execStackSetRel(fiber, ins, frame);
        case Op.LOAD_VAR_SLOT:
          return this.execLoadVarSlot(fiber, ins, frame);
        case Op.STORE_VAR_SLOT:
          return this.execStoreVarSlot(fiber, ins, frame);
        case Op.JMP:
          return this.execJmp(ins, frame);
        case Op.JMP_IF_FALSE:
          return this.execJmpIfFalse(fiber, ins, frame);
        case Op.JMP_IF_TRUE:
          return this.execJmpIfTrue(fiber, ins, frame);
        case Op.RET:
          return this.execRet(fiber);
        case Op.SPAWN_RULE:
          return this.execSpawnRule(fiber, ins, frame, spawner);
        case Op.HOST_CALL:
          return this.execHostCall(fiber, ins, frame);
        case Op.HOST_CALL_ASYNC:
          return this.execHostCallAsync(fiber, ins, frame);
        case Op.HOST_ACTION_CALL:
          return this.execHostActionCall(fiber, ins, frame);
        case Op.HOST_ACTION_CALL_ASYNC:
          return this.execHostActionCallAsync(fiber, ins, frame);
        case Op.AWAIT:
          return this.execAwait(fiber, frame);
        case Op.WHEN_START:
          return this.execWhenStart(fiber, frame);
        case Op.WHEN_END:
          return this.execWhenGate(fiber, ins, frame, false, false);
        case Op.WHEN_END_PRESENT:
          return this.execWhenGate(fiber, ins, frame, true, false);
        case Op.WHEN_END_CHAIN:
          return this.execWhenGate(fiber, ins, frame, false, true);
        case Op.WHEN_END_PRESENT_CHAIN:
          return this.execWhenGate(fiber, ins, frame, true, true);
        case Op.DO_START:
        case Op.DO_END:
          frame.pc++;
          return StepOutcome.Continue;
        default:
          this.raise(ErrorCode.ScriptError, `${UNIMPLEMENTED_OPCODE_MARKER} ${ins.op}`);
          return StepOutcome.Continue;
      }
    }

    private push(fiber: Fiber, v: Value): void {
      if (fiber.vstack.length >= this.caps.maxStackSize) {
        this.raise(ErrorCode.StackOverflow, "operand stack limit exceeded");
        return;
      }
      fiber.vstack.push(v);
    }

    private pop(fiber: Fiber): Value {
      if (fiber.vstack.length === 0) {
        this.raise(ErrorCode.StackUnderflow, "operand stack is empty");
        return NIL_VALUE;
      }
      return fiber.vstack.pop();
    }

    private execPushConstVal(fiber: Fiber, ins: Instr, frame: Frame): StepOutcome {
      if (ins.a < 0 || ins.a >= this.program.constValues.length) {
        this.raise(ErrorCode.ScriptError, "PUSH_CONST_VAL constant index out of bounds");
        return StepOutcome.Continue;
      }
      this.push(fiber, this.program.constValues[ins.a]);
      frame.pc++;
      return StepOutcome.Continue;
    }

    private execPushConstNum(fiber: Fiber, ins: Instr, frame: Frame): StepOutcome {
      if (ins.a < 0 || ins.a >= this.program.constNumbers.length) {
        this.raise(ErrorCode.ScriptError, "PUSH_CONST_NUM constant index out of bounds");
        return StepOutcome.Continue;
      }
      this.push(fiber, mkNumber(this.program.constNumbers[ins.a]));
      frame.pc++;
      return StepOutcome.Continue;
    }

    private execPushConstStr(fiber: Fiber, ins: Instr, frame: Frame): StepOutcome {
      if (ins.a < 0 || ins.a >= this.program.constStrings.length) {
        this.raise(ErrorCode.ScriptError, "PUSH_CONST_STR constant index out of bounds");
        return StepOutcome.Continue;
      }
      this.push(fiber, mkString(this.program.constStrings[ins.a]));
      frame.pc++;
      return StepOutcome.Continue;
    }

    /** Discards the top of the operand stack. */
    private execPop(fiber: Fiber, frame: Frame): StepOutcome {
      this.pop(fiber);
      frame.pc++;
      return StepOutcome.Continue;
    }

    private execDup(fiber: Fiber, frame: Frame): StepOutcome {
      if (fiber.vstack.length === 0) {
        this.raise(ErrorCode.StackUnderflow, "operand stack is empty");
        return StepOutcome.Continue;
      }
      this.push(fiber, fiber.vstack[fiber.vstack.length - 1]);
      frame.pc++;
      return StepOutcome.Continue;
    }

    private execStackSetRel(fiber: Fiber, ins: Instr, frame: Frame): StepOutcome {
      const v = this.pop(fiber);
      const newTop = fiber.vstack.length - 1;
      if (ins.a < 0 || ins.a > newTop) {
        this.raise(ErrorCode.ScriptError, "STACK_SET_REL offset out of bounds");
        return StepOutcome.Continue;
      }
      fiber.vstack[newTop - ins.a] = v;
      frame.pc++;
      return StepOutcome.Continue;
    }

    private execLoadVarSlot(fiber: Fiber, ins: Instr, frame: Frame): StepOutcome {
      if (ins.a < 0 || ins.a >= this.program.variableNames.length) {
        this.raise(ErrorCode.ScriptError, "LOAD_VAR_SLOT slot index out of bounds");
        return StepOutcome.Continue;
      }
      this.push(fiber, fiber.ctx.variables.getBySlot(ins.a));
      frame.pc++;
      return StepOutcome.Continue;
    }

    private execStoreVarSlot(fiber: Fiber, ins: Instr, frame: Frame): StepOutcome {
      if (ins.a < 0 || ins.a >= this.program.variableNames.length) {
        this.raise(ErrorCode.ScriptError, "STORE_VAR_SLOT slot index out of bounds");
        return StepOutcome.Continue;
      }
      fiber.ctx.variables.setBySlot(ins.a, this.pop(fiber));
      frame.pc++;
      return StepOutcome.Continue;
    }

    /** Advances the PC by the instruction's signed offset. */
    private execJmp(ins: Instr, frame: Frame): StepOutcome {
      frame.pc += ins.a;
      return StepOutcome.Continue;
    }

    /**
     * Pops the branch condition and advances the PC by one when it is truthy,
     * or by the instruction's signed offset when it is not.
     */
    private execJmpIfFalse(fiber: Fiber, ins: Instr, frame: Frame): StepOutcome {
      const condition = this.pop(fiber);
      frame.pc += isTruthy(condition) ? 1 : ins.a;
      return StepOutcome.Continue;
    }

    /**
     * Pops the branch condition and advances the PC by the instruction's
     * signed offset when it is truthy, or by one when it is not.
     */
    private execJmpIfTrue(fiber: Fiber, ins: Instr, frame: Frame): StepOutcome {
      const condition = this.pop(fiber);
      frame.pc += isTruthy(condition) ? ins.a : 1;
      return StepOutcome.Continue;
    }

    private execRet(fiber: Fiber): StepOutcome {
      this.pop(fiber);
      fiber.frames.pop();
      if (fiber.frames.length === 0) {
        return StepOutcome.Done;
      }
      return StepOutcome.Continue;
    }

    /** The positional argument buffer of a call with `argc` slots, top of stack last. */
    private readArgs(fiber: Fiber, argc: number): Value[] {
      const args: Value[] = [];
      const stackSize = fiber.vstack.length;
      for (let i = 0; i < argc; i++) {
        args.push(fiber.vstack[stackSize - argc + i]);
      }
      return args;
    }

    private execHostCall(fiber: Fiber, ins: Instr, frame: Frame): StepOutcome {
      const fn = this.hostFunctions.getById(ins.a);
      if (!fn) {
        this.raise(ErrorCode.ScriptError, `no sync host function registered under id ${ins.a}`);
        return StepOutcome.Continue;
      }
      const argc = ins.b;
      if (argc < 0 || argc > fiber.vstack.length) {
        this.raise(ErrorCode.StackUnderflow, "HOST_CALL argc exceeds stack size");
        return StepOutcome.Continue;
      }

      this.bindContext(fiber, frame, ins.c);
      const args = this.readArgs(fiber, argc);
      const result = fn.exec(fiber.ctx, args);
      if (fiber.ctx.hasFault()) {
        this.raise(fiber.ctx.faultCode, fiber.ctx.faultMessage);
        fiber.ctx.clearFault();
        return StepOutcome.Continue;
      }

      for (let i = 0; i < argc; i++) {
        fiber.vstack.pop();
      }
      this.push(fiber, result);
      frame.pc++;
      this.syncContextFromTopFrame(fiber);
      return StepOutcome.Continue;
    }

    /**
     * Dispatches an asynchronous host function: allocates a pending handle,
     * hands the function an owned argument snapshot and that handle, and leaves
     * the handle on the operand stack in place of the arguments. With the handle
     * table full the fiber yields at this same instruction, having consumed
     * nothing, and retries next round.
     */
    private execHostCallAsync(fiber: Fiber, ins: Instr, frame: Frame): StepOutcome {
      const fn = this.hostFunctions.getById(ins.a);
      if (!fn) {
        this.raise(ErrorCode.ScriptError, `no async host function registered under id ${ins.a}`);
        return StepOutcome.Continue;
      }
      if (!fn.isAsync) {
        this.raise(ErrorCode.ScriptError, `host function ${ins.a} requires HOST_CALL`);
        return StepOutcome.Continue;
      }
      const argc = ins.b;
      if (argc < 0 || argc > fiber.vstack.length) {
        this.raise(ErrorCode.StackUnderflow, "HOST_CALL_ASYNC argc exceeds stack size");
        return StepOutcome.Continue;
      }
      if (!this.handles.hasCapacity()) {
        return this.backpressureOnHandles(fiber, frame);
      }
      this.clearHandleBackpressure(fiber);

      this.bindContext(fiber, frame, ins.c);
      const args = this.readArgs(fiber, argc);
      const handleId = this.handles.createPending(true);
      fn.execAsync(fiber.ctx, args, new AsyncHandle(this.handles, handleId));
      if (fiber.ctx.hasFault()) {
        this.handles.deleteHandle(handleId);
        this.raise(fiber.ctx.faultCode, fiber.ctx.faultMessage);
        fiber.ctx.clearFault();
        return StepOutcome.Continue;
      }

      for (let i = 0; i < argc; i++) {
        fiber.vstack.pop();
      }
      this.push(fiber, mkHandle(handleId));
      frame.pc++;
      this.syncContextFromTopFrame(fiber);
      return StepOutcome.Continue;
    }

    private execHostActionCall(fiber: Fiber, ins: Instr, frame: Frame): StepOutcome {
      const action = this.hostActions.getById(ins.a);
      if (!action) {
        this.raise(ErrorCode.ScriptError, `no action registered with id ${ins.a}`);
        return StepOutcome.Continue;
      }
      if (action.isAsync) {
        this.raise(ErrorCode.ScriptError, `host action ${action.key} requires HOST_ACTION_CALL_ASYNC`);
        return StepOutcome.Continue;
      }
      const argc = ins.b;
      if (argc < 0 || argc > fiber.vstack.length) {
        this.raise(ErrorCode.StackUnderflow, "HOST_ACTION_CALL argc exceeds stack size");
        return StepOutcome.Continue;
      }

      const callSiteId = ins.c;
      this.bindContext(fiber, frame, callSiteId);
      const args = this.readArgs(fiber, argc);
      const result = action.execSync(fiber.ctx, args);
      if (fiber.ctx.hasFault()) {
        this.raise(fiber.ctx.faultCode, fiber.ctx.faultMessage);
        fiber.ctx.clearFault();
        return StepOutcome.Continue;
      }
      this.observer.onHostActionCall(ins.a, callSiteId, args, result);

      for (let i = 0; i < argc; i++) {
        fiber.vstack.pop();
      }
      this.push(fiber, result);
      frame.pc++;
      this.syncContextFromTopFrame(fiber);
      return StepOutcome.Continue;
    }

    /**
     * Dispatches an asynchronous host-bound action: allocates a pending
     * handle, hands the action an owned argument snapshot and that handle, and
     * leaves the handle on the operand stack in place of the arguments. With
     * the handle table full the fiber yields at this same instruction, having
     * consumed nothing, and retries next round; an action declaring
     * `uncappedHandles` skips the capacity check and allocates outside the cap.
     */
    private execHostActionCallAsync(fiber: Fiber, ins: Instr, frame: Frame): StepOutcome {
      const action = this.hostActions.getById(ins.a);
      if (!action) {
        this.raise(ErrorCode.ScriptError, `no action registered with id ${ins.a}`);
        return StepOutcome.Continue;
      }
      if (!action.isAsync) {
        this.raise(ErrorCode.ScriptError, `host action ${action.key} requires HOST_ACTION_CALL`);
        return StepOutcome.Continue;
      }
      const argc = ins.b;
      if (argc < 0 || argc > fiber.vstack.length) {
        this.raise(ErrorCode.StackUnderflow, "HOST_ACTION_CALL_ASYNC argc exceeds stack size");
        return StepOutcome.Continue;
      }
      const capped = !action.uncappedHandles;
      if (capped && !this.handles.hasCapacity()) {
        return this.backpressureOnHandles(fiber, frame);
      }
      this.clearHandleBackpressure(fiber);

      const callSiteId = ins.c;
      this.bindContext(fiber, frame, callSiteId);
      const args = this.readArgs(fiber, argc);
      const handleId = this.handles.createPending(capped);
      action.execAsync(fiber.ctx, args, new AsyncHandle(this.handles, handleId));
      if (fiber.ctx.hasFault()) {
        this.handles.deleteHandle(handleId);
        this.raise(fiber.ctx.faultCode, fiber.ctx.faultMessage);
        fiber.ctx.clearFault();
        return StepOutcome.Continue;
      }
      this.observer.onHostActionCallAsync(ins.a, callSiteId, args);

      for (let i = 0; i < argc; i++) {
        fiber.vstack.pop();
      }
      this.push(fiber, mkHandle(handleId));
      frame.pc++;
      this.syncContextFromTopFrame(fiber);
      return StepOutcome.Continue;
    }

    /**
     * Records that the dispatch at `frame.pc` found the handle table full and
     * ends the slice with the program counter unchanged. Faults
     * `StackOverflow` once that dispatch has found it full for
     * {@link HANDLE_BACKPRESSURE_FAULT_ROUNDS} consecutive rounds.
     */
    private backpressureOnHandles(fiber: Fiber, frame: Frame): StepOutcome {
      const rounds = fiber.handleBackpressurePc === frame.pc ? fiber.handleBackpressureRounds + 1 : 1;
      fiber.handleBackpressurePc = frame.pc;
      fiber.handleBackpressureRounds = rounds;
      if (rounds >= HANDLE_BACKPRESSURE_FAULT_ROUNDS) {
        this.raise(ErrorCode.StackOverflow, "no free async handle");
        return StepOutcome.Continue;
      }
      return StepOutcome.Yielded;
    }

    /** Clears the run of starved rounds {@link VM.backpressureOnHandles} recorded. */
    private clearHandleBackpressure(fiber: Fiber): void {
      fiber.handleBackpressurePc = -1;
      fiber.handleBackpressureRounds = 0;
    }

    /**
     * Pops a handle. A resolved handle pushes its value and dispatch
     * continues; a rejected or cancelled one faults the fiber with the
     * classifier it carries; a pending one parks the fiber until the handle
     * settles.
     */
    private execAwait(fiber: Fiber, frame: Frame): StepOutcome {
      const handleValue = this.pop(fiber);
      if (handleValue.t !== ValueTag.Handle) {
        this.raise(ErrorCode.ScriptError, "AWAIT expects a handle value");
        return StepOutcome.Continue;
      }
      const handle = this.handles.get(handleValue.num);
      if (!handle) {
        this.raise(ErrorCode.ScriptError, `AWAIT on unknown handle ${handleValue.num}`);
        return StepOutcome.Continue;
      }
      if (handle.state === HandleState.Resolved) {
        this.push(fiber, handle.result);
        frame.pc++;
        return StepOutcome.Continue;
      }
      if (handle.state !== HandleState.Pending) {
        this.raise(handle.errorCode, "awaited handle did not resolve");
        return StepOutcome.Continue;
      }

      fiber.state = FiberState.Waiting;
      fiber.awaitSite = new AwaitSite(frame.pc + 1, fiber.vstack.length, fiber.frames.length, handle.id);
      this.handles.addWaiter(handle.id, fiber.id);
      return StepOutcome.Waiting;
    }

    /**
     * Spawns a fire-and-forget child-rule fiber tagged with this fiber's
     * subtree root, and continues at the next instruction without pushing
     * anything.
     */
    private execSpawnRule(fiber: Fiber, ins: Instr, frame: Frame, spawner: ChildRuleSpawner): StepOutcome {
      const subtreeRootFuncId = fiber.rootRuleFuncId !== NO_RULE ? fiber.rootRuleFuncId : fiber.frames[0].funcId;
      spawner.spawnChildRule(ins.a, subtreeRootFuncId, fiber.ctx);
      frame.pc++;
      return StepOutcome.Continue;
    }

    private execWhenStart(fiber: Fiber, frame: Frame): StepOutcome {
      fiber.ctx.services.ruleFiring.set(this.frameRuleFuncId(frame), RuleFiringState.Evaluating);
      frame.pc++;
      return StepOutcome.Continue;
    }

    /**
     * Pops the WHEN result, captures it into the rule's reserved
     * `__whenResult` variable, writes the rule's firing record, and
     * advances the PC by one on a fire or by the gate's signed offset on a
     * skip.
     *
     * @param presenceGated - Gate on the WHEN result being present (non-nil),
     *   so a present falsy value fires. Otherwise the gate is on truthiness.
     * @param chained - Write the chain-aware firing record of an
     *   `otherwise` rule. Otherwise the record is the rule's own outcome.
     */
    private execWhenGate(
      fiber: Fiber,
      ins: Instr,
      frame: Frame,
      presenceGated: boolean,
      chained: boolean
    ): StepOutcome {
      const whenResult = this.pop(fiber);
      const services = fiber.ctx.services;
      const ruleFuncId = this.frameRuleFuncId(frame);
      services.ruleVars.setByName(ruleFuncId, WHEN_RESULT_VAR, whenResult);

      const fired = presenceGated ? whenResult.t !== ValueTag.Nil : isTruthy(whenResult);
      services.ruleFiring.set(
        ruleFuncId,
        chained
          ? this.chainedFiringState(services, ruleFuncId, fired)
          : fired
            ? RuleFiringState.DidFire
            : RuleFiringState.DidNotFire
      );

      frame.pc += fired ? 1 : ins.a;
      return StepOutcome.Continue;
    }

    /**
     * The firing record a chain gate writes: `DidFire` when the rule fired,
     * and on a rule that did not fire the record of the rule directly above
     * it at its own nesting level. A rule with no subject records its own
     * outcome.
     */
    private chainedFiringState(services: BrainServices, ruleFuncId: number, fired: boolean): RuleFiringState {
      if (fired) {
        return RuleFiringState.DidFire;
      }
      const subjectFuncId = ruleFuncId === NO_RULE ? NO_RULE : services.program.precedingSiblingRuleFuncId(ruleFuncId);
      if (subjectFuncId === NO_RULE) {
        return RuleFiringState.DidNotFire;
      }
      return services.ruleFiring.get(subjectFuncId);
    }

    private frameRuleFuncId(frame: Frame): number {
      if (frame.ruleFuncId !== NO_RULE) {
        return frame.ruleFuncId;
      }
      return this.program.isRuleFunc(frame.funcId) ? frame.funcId : NO_RULE;
    }

    private bindContext(fiber: Fiber, frame: Frame, callSiteId: number): void {
      fiber.ctx.currentCallSiteId = callSiteId;
      fiber.ctx.currentRuleFuncId = this.frameRuleFuncId(frame);
    }

    private syncContextFromTopFrame(fiber: Fiber): void {
      if (fiber.frames.length === 0) {
        fiber.ctx.currentCallSiteId = NO_CALL_SITE;
        fiber.ctx.currentRuleFuncId = NO_RULE;
        return;
      }
      fiber.ctx.currentCallSiteId = NO_CALL_SITE;
      fiber.ctx.currentRuleFuncId = this.frameRuleFuncId(fiber.frames[fiber.frames.length - 1]);
    }
  }

  /** Name of the reserved rule variable every WHEN gate captures its result into. */
  export const WHEN_RESULT_VAR = "__whenResult";
}
