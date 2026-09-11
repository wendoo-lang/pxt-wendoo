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

    constructor(id: number, ctx: ExecutionContext, ruleFuncId: number) {
      this.id = id;
      this.state = FiberState.Runnable;
      this.vstack = [];
      this.frames = [];
      this.instrBudget = 0;
      this.ctx = ctx;
      this.ruleFuncId = ruleFuncId;
    }
  }

  /** Per-fiber and per-round capacity caps. A device profile pins these values. */
  export class VmCaps {
    /** Instructions granted to each fiber slice of a round. */
    defaultBudget: number;
    /** Values a single fiber's operand stack may hold. */
    maxStackSize: number;

    constructor(defaultBudget: number, maxStackSize: number) {
      this.defaultBudget = defaultBudget;
      this.maxStackSize = maxStackSize;
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
      const fiber = new Fiber(fiberId, ctx, ruleFuncId);
      fiber.frames.push(new Frame(funcId, ruleFuncId));
      return fiber;
    }

    /**
     * Run one budgeted slice of `fiber`, up to its remaining
     * `instrBudget`. Returns how the slice ended; a fault has already
     * transitioned the fiber and notified the observer.
     *
     * @param fiber - A runnable fiber with a positive budget.
     */
    runFiber(fiber: Fiber): VmStatus {
      this.syncContextFromTopFrame(fiber);

      while (fiber.instrBudget > 0) {
        if (fiber.state !== FiberState.Runnable) {
          return VmStatus.Done;
        }
        fiber.instrBudget--;

        const frame = fiber.frames[fiber.frames.length - 1];
        const fn = this.program.functions[frame.funcId];
        this.faultCode = NO_FAULT;
        this.faultMessage = "";
        if (frame.pc < 0 || frame.pc >= fn.code.length) {
          this.raise(ErrorCode.ScriptError, "pc out of bounds");
          return this.consumeFault(fiber, frame);
        }

        const outcome = this.executeInstruction(fiber, fn.code[frame.pc], frame);
        if (this.faultCode !== NO_FAULT) {
          return this.consumeFault(fiber, frame);
        }
        if (outcome === StepOutcome.Done) {
          fiber.state = FiberState.Done;
          return VmStatus.Done;
        }
      }

      return VmStatus.Yielded;
    }

    private consumeFault(fiber: Fiber, frame: Frame): VmStatus {
      const code = this.faultCode;
      this.faults.push(new VmFault(code, this.faultMessage, frame.funcId, frame.pc));
      this.faultCode = NO_FAULT;
      this.faultMessage = "";
      fiber.state = FiberState.Fault;
      this.observer.onFiberFault(fiber.id, code);
      return VmStatus.Fault;
    }

    private raise(code: ErrorCode, message: string): void {
      if (this.faultCode === NO_FAULT) {
        this.faultCode = code;
        this.faultMessage = message;
      }
    }

    private executeInstruction(fiber: Fiber, ins: Instr, frame: Frame): StepOutcome {
      switch (ins.op) {
        case Op.PUSH_CONST_VAL:
          return this.execPushConstVal(fiber, ins, frame);
        case Op.PUSH_CONST_NUM:
          return this.execPushConstNum(fiber, ins, frame);
        case Op.DUP:
          return this.execDup(fiber, frame);
        case Op.STACK_SET_REL:
          return this.execStackSetRel(fiber, ins, frame);
        case Op.LOAD_VAR_SLOT:
          return this.execLoadVarSlot(fiber, ins, frame);
        case Op.STORE_VAR_SLOT:
          return this.execStoreVarSlot(fiber, ins, frame);
        case Op.RET:
          return this.execRet(fiber);
        case Op.HOST_CALL:
          return this.execHostCall(fiber, ins, frame);
        case Op.HOST_ACTION_CALL:
          return this.execHostActionCall(fiber, ins, frame);
        case Op.WHEN_START:
          return this.execWhenStart(fiber, frame);
        case Op.WHEN_END:
          return this.execWhenGate(fiber, ins, frame, false);
        case Op.WHEN_END_CHAIN:
          return this.execWhenGate(fiber, ins, frame, true);
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
     * @param chained - Write the chain-aware firing record of an
     *   `otherwise` rule. Otherwise the record is the rule's own outcome.
     */
    private execWhenGate(fiber: Fiber, ins: Instr, frame: Frame, chained: boolean): StepOutcome {
      const whenResult = this.pop(fiber);
      const services = fiber.ctx.services;
      const ruleFuncId = this.frameRuleFuncId(frame);
      services.ruleVars.setByName(ruleFuncId, WHEN_RESULT_VAR, whenResult);

      const fired = isTruthy(whenResult);
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
