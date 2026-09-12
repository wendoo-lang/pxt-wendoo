/**
 * The execution context a fiber carries, the brain-instance state it reaches
 * through, and the registries host calls resolve against.
 */
namespace wendoo {
  /**
   * Base class of the opaque per-run payload a host profile attaches to the
   * execution context. The VM never reads it; a host body downcasts it to its
   * own subclass.
   */
  export class HostWorld {
    constructor() {}
  }

  /** Outcome of a rule's most recent WHEN evaluation. */
  export enum RuleFiringState {
    /** The rule began its WHEN check and has not yet reached a gate. */
    Evaluating = 0,
    /** The rule's most recent completed WHEN evaluation passed its gate. */
    DidFire = 1,
    /** The rule's most recent completed WHEN evaluation failed its gate. */
    DidNotFire = 2,
  }

  /**
   * Per-rule firing records, keyed by rule funcId. A rule with no record
   * reads {@link RuleFiringState.DidFire}, which is what a rule with no WHEN
   * condition observes. Records are runtime-internal: never serialized, never
   * traced.
   */
  export class RuleFiringStore {
    private ruleFuncIds: number[] = [];
    private states: RuleFiringState[] = [];

    constructor() {}

    /**
     * The rule's recorded outcome, or {@link RuleFiringState.DidFire} when
     * it has never written one.
     *
     * @param ruleFuncId - Rule funcId to read.
     */
    get(ruleFuncId: number): RuleFiringState {
      for (let i = 0; i < this.ruleFuncIds.length; i++) {
        if (this.ruleFuncIds[i] === ruleFuncId) {
          return this.states[i];
        }
      }
      return RuleFiringState.DidFire;
    }

    /**
     * Overwrite the rule's record. A `ruleFuncId` of {@link NO_RULE} is a
     * no-op.
     *
     * @param ruleFuncId - Rule funcId to write.
     * @param state - Outcome to record.
     */
    set(ruleFuncId: number, state: RuleFiringState): void {
      if (ruleFuncId === NO_RULE) {
        return;
      }
      for (let i = 0; i < this.ruleFuncIds.length; i++) {
        if (this.ruleFuncIds[i] === ruleFuncId) {
          this.states[i] = state;
          return;
        }
      }
      this.ruleFuncIds.push(ruleFuncId);
      this.states.push(state);
    }
  }

  /**
   * Answers whether a rule's cluster still holds a live fiber. Subclass and
   * override {@link RuleSubtreeLiveness.hasLiveSubtree}.
   */
  export class RuleSubtreeLiveness {
    constructor() {}

    /**
     * Whether any live fiber belongs to `ruleFuncId`'s cluster. The base
     * implementation always answers false.
     *
     * @param ruleFuncId - Rule funcId whose cluster is queried.
     */
    hasLiveSubtree(ruleFuncId: number): boolean {
      return false;
    }
  }

  /**
   * Rule-cluster liveness, the per-rule watcher slot behind the THEN trigger,
   * and the per-rule abandonment mark that records a fault or a cancellation
   * in a rule's cluster.
   *
   * A rule's cluster is its own fiber plus every fiber spawned beneath it;
   * membership is the static rule ancestry. Slots and marks are
   * runtime-internal: never brain values, never serialized, never traced.
   */
  export class RuleCompletionStore {
    private liveness: RuleSubtreeLiveness;
    private watcherRuleFuncIds: number[] = [];
    private watcherHandleIds: number[] = [];
    private abandonedRuleFuncIds: number[] = [];

    /**
     * @param liveness - Cluster-liveness query, supplied by the fiber scheduler.
     */
    constructor(liveness: RuleSubtreeLiveness) {
      this.liveness = liveness;
    }

    /**
     * Whether any fiber in `ruleFuncId`'s cluster is live, its own fiber
     * included.
     *
     * @param ruleFuncId - Rule funcId whose cluster is queried.
     */
    hasLiveSubtree(ruleFuncId: number): boolean {
      return this.liveness.hasLiveSubtree(ruleFuncId);
    }

    /**
     * The handle parked on `ruleFuncId`'s completion, or {@link NO_HANDLE}
     * when no rule watches it.
     *
     * @param ruleFuncId - Rule funcId whose watcher slot is read.
     */
    getWatcher(ruleFuncId: number): number {
      for (let i = 0; i < this.watcherRuleFuncIds.length; i++) {
        if (this.watcherRuleFuncIds[i] === ruleFuncId) {
          return this.watcherHandleIds[i];
        }
      }
      return NO_HANDLE;
    }

    /**
     * Park `handleId` on `ruleFuncId`'s completion, replacing any handle the
     * slot already holds. A `ruleFuncId` of {@link NO_RULE} is a no-op.
     *
     * @param ruleFuncId - Rule funcId whose watcher slot is filled.
     * @param handleId - Handle the settle walk resolves when the cluster empties.
     */
    setWatcher(ruleFuncId: number, handleId: number): void {
      if (ruleFuncId === NO_RULE) {
        return;
      }
      for (let i = 0; i < this.watcherRuleFuncIds.length; i++) {
        if (this.watcherRuleFuncIds[i] === ruleFuncId) {
          this.watcherHandleIds[i] = handleId;
          return;
        }
      }
      this.watcherRuleFuncIds.push(ruleFuncId);
      this.watcherHandleIds.push(handleId);
    }

    /**
     * Empty `ruleFuncId`'s watcher slot.
     *
     * @param ruleFuncId - Rule funcId whose watcher slot is emptied.
     */
    clearWatcher(ruleFuncId: number): void {
      for (let i = 0; i < this.watcherRuleFuncIds.length; i++) {
        if (this.watcherRuleFuncIds[i] === ruleFuncId) {
          this.watcherRuleFuncIds.splice(i, 1);
          this.watcherHandleIds.splice(i, 1);
          return;
        }
      }
    }

    /**
     * Whether `ruleFuncId`'s current firing has lost a fiber to a fault or a
     * cancellation anywhere in its cluster.
     *
     * @param ruleFuncId - Rule funcId whose mark is read.
     */
    isAbandoned(ruleFuncId: number): boolean {
      return this.abandonedRuleFuncIds.indexOf(ruleFuncId) >= 0;
    }

    /**
     * Mark `ruleFuncId`'s current firing abandoned. A `ruleFuncId` of
     * {@link NO_RULE} is a no-op.
     *
     * @param ruleFuncId - Rule funcId to mark.
     */
    markAbandoned(ruleFuncId: number): void {
      if (ruleFuncId === NO_RULE || this.isAbandoned(ruleFuncId)) {
        return;
      }
      this.abandonedRuleFuncIds.push(ruleFuncId);
    }

    /**
     * Drop `ruleFuncId`'s abandonment mark, so it describes the firing
     * starting now.
     *
     * @param ruleFuncId - Rule funcId to clear.
     */
    clearAbandoned(ruleFuncId: number): void {
      const idx = this.abandonedRuleFuncIds.indexOf(ruleFuncId);
      if (idx >= 0) {
        this.abandonedRuleFuncIds.splice(idx, 1);
      }
    }
  }

  /**
   * Per-rule variable storage keyed by rule funcId and variable name. Reads
   * walk the rule-ancestor chain; writes land on the rule's own store.
   */
  export class RuleVariableStore {
    private program: Program;
    private ruleFuncIds: number[] = [];
    private names: string[] = [];
    private values: Value[] = [];

    constructor(program: Program) {
      this.program = program;
    }

    /**
     * The value stored on `ruleFuncId` under `name`, or the nearest
     * ancestor's, or nil when the chain ends.
     *
     * @param ruleFuncId - Rule funcId to read from.
     * @param name - Variable name.
     */
    getByName(ruleFuncId: number, name: string): Value {
      let cur = ruleFuncId;
      while (cur !== NO_RULE) {
        const idx = this.indexOf(cur, name);
        if (idx >= 0) {
          return this.values[idx];
        }
        cur = this.program.ruleParentFuncId(cur);
      }
      return NIL_VALUE;
    }

    /**
     * Write `value` to `ruleFuncId`'s own store. A `ruleFuncId` of
     * {@link NO_RULE} is a no-op.
     *
     * @param ruleFuncId - Rule funcId to write to.
     * @param name - Variable name.
     * @param value - Value to store.
     */
    setByName(ruleFuncId: number, name: string, value: Value): void {
      if (ruleFuncId === NO_RULE) {
        return;
      }
      const idx = this.indexOf(ruleFuncId, name);
      if (idx >= 0) {
        this.values[idx] = value;
        return;
      }
      this.ruleFuncIds.push(ruleFuncId);
      this.names.push(name);
      this.values.push(value);
    }

    private indexOf(ruleFuncId: number, name: string): number {
      for (let i = 0; i < this.ruleFuncIds.length; i++) {
        if (this.ruleFuncIds[i] === ruleFuncId && this.names[i] === name) {
          return i;
        }
      }
      return -1;
    }
  }

  /**
   * Brain-global variable storage, indexed by the compiler-assigned slot id
   * that `LOAD_VAR_SLOT` and `STORE_VAR_SLOT` carry. Each slot is seeded at
   * program load with the starting value the program declares for it.
   */
  export class VariableStore {
    private values: Value[] = [];

    constructor() {}

    /**
     * Allocate one slot per entry in `program.variableNames` and seed it
     * from the program's declared starting values.
     *
     * @param program - The loaded program.
     */
    install(program: Program): void {
      this.values = [];
      for (let i = 0; i < program.variableNames.length; i++) {
        const initIdx = i < program.variableInitValues.length ? program.variableInitValues[i] : NO_VARIABLE_INIT;
        const seed =
          initIdx === NO_VARIABLE_INIT || initIdx >= program.constValues.length
            ? NIL_VALUE
            : program.constValues[initIdx];
        this.values.push(seed);
      }
    }

    /**
     * The slot's current value, or nil when the slot is out of range.
     *
     * @param slotId - Compiler-assigned slot id.
     */
    getBySlot(slotId: number): Value {
      if (slotId < 0 || slotId >= this.values.length) {
        return NIL_VALUE;
      }
      return this.values[slotId];
    }

    /**
     * Write the slot, growing the store lazily past its installed size.
     *
     * @param slotId - Compiler-assigned slot id.
     * @param value - Value to store.
     */
    setBySlot(slotId: number, value: Value): void {
      if (slotId < 0) {
        return;
      }
      while (this.values.length <= slotId) {
        this.values.push(NIL_VALUE);
      }
      this.values[slotId] = value;
    }
  }

  /**
   * Per-callsite host state: one opaque cell per call-site id, written and
   * read by the host body dispatched at that site.
   *
   * Cells live as long as the brain instance, so state survives a page
   * restart. A page activation hook is the only writer outside a dispatch.
   */
  export class CallsiteStore {
    private callSiteIds: number[] = [];
    private hostStates: Value[] = [];

    constructor() {}

    /**
     * The cell at `callSiteId`, or `undefined` when nothing has written one.
     *
     * @param callSiteId - Call-site id to read.
     */
    getHostState(callSiteId: number): Value {
      for (let i = 0; i < this.callSiteIds.length; i++) {
        if (this.callSiteIds[i] === callSiteId) {
          return this.hostStates[i];
        }
      }
      return undefined;
    }

    /**
     * Overwrite the cell at `callSiteId`, allocating it on first write. A
     * `callSiteId` of {@link NO_CALL_SITE} is a no-op.
     *
     * @param callSiteId - Call-site id to write.
     * @param state - Value to store.
     */
    setHostState(callSiteId: number, state: Value): void {
      if (callSiteId === NO_CALL_SITE) {
        return;
      }
      for (let i = 0; i < this.callSiteIds.length; i++) {
        if (this.callSiteIds[i] === callSiteId) {
          this.hostStates[i] = state;
          return;
        }
      }
      this.callSiteIds.push(callSiteId);
      this.hostStates.push(state);
    }
  }

  /**
   * The page-lifecycle surface a host body reads and requests through. Every
   * request records what the host loop is to do at its next think. Subclass
   * and override; the base implementation answers the empty id and ignores
   * every request.
   */
  export class BrainPageServices {
    constructor() {}

    /** Stable page id of the active page, or `""` when no page is active. */
    getCurrentPageId(): string {
      return "";
    }

    /**
     * Stable page id of the most recently deactivated page, falling back to
     * the active page's while no page has been deactivated yet.
     */
    getPreviousPageId(): string {
      return "";
    }

    /**
     * Ask that `pageIndex` be the active page from the next think. The index
     * of the active page restarts it instead; an index outside the program's
     * pages leaves no page active.
     *
     * @param pageIndex - Zero-based index of the page to switch to.
     */
    requestPageChange(pageIndex: number): void {}

    /**
     * Ask that the page carrying `pageId` be the active page from the next
     * think. A `pageId` no page carries leaves no page active.
     *
     * @param pageId - Stable page id of the page to switch to.
     */
    requestPageChangeByPageId(pageId: string): void {}

    /**
     * Ask that the active page restart: its fibers are cancelled now and its
     * root rules respawn at the next think, with no deactivation and no
     * reactivation.
     */
    requestPageRestart(): void {}
  }

  /**
   * The brain-instance state surface host bodies and the WHEN gates read
   * through: the loaded program's rule tables, the firing records, the
   * per-rule variable store, the rule-completion machinery behind the THEN
   * trigger, the page-lifecycle requests, and per-callsite host state.
   */
  export class BrainServices {
    /** The loaded program. */
    program: Program;
    /** Per-rule firing records. */
    ruleFiring: RuleFiringStore;
    /** Per-rule variable storage. */
    ruleVars: RuleVariableStore;
    /** Cluster liveness, watcher slots, and abandonment marks. */
    ruleCompletion: RuleCompletionStore;
    /** Page identity reads and page-change requests. */
    pages: BrainPageServices;
    /** Per-callsite host state. */
    callsite: CallsiteStore;

    /**
     * @param program - The loaded program.
     * @param liveness - Cluster-liveness query, supplied by the fiber scheduler.
     * @param pages - Page-lifecycle surface, supplied by the brain runtime.
     */
    constructor(program: Program, liveness: RuleSubtreeLiveness, pages: BrainPageServices) {
      this.program = program;
      this.ruleFiring = new RuleFiringStore();
      this.ruleVars = new RuleVariableStore(program);
      this.ruleCompletion = new RuleCompletionStore(liveness);
      this.pages = pages;
      this.callsite = new CallsiteStore();
    }
  }

  /** Fault code meaning no fault is in flight. */
  export const NO_FAULT = 0;

  /**
   * The context every fiber carries. Host bodies read the per-tick scalars
   * and the brain-instance state through it, and report failure through
   * {@link ExecutionContext.raise}.
   */
  export class ExecutionContext {
    /** Brain-instance state surface. */
    services: BrainServices;
    /** Brain-global variable storage. */
    variables: VariableStore;
    /** Call-site id bound before the active host call, or {@link NO_CALL_SITE}. */
    currentCallSiteId: number = NO_CALL_SITE;
    /** Rule funcId of the active frame, or {@link NO_RULE}. */
    currentRuleFuncId: number = NO_RULE;
    /** Cumulative scheduled time stamped before the current think. */
    time: number = 0;
    /** Time delta stamped before the current think. */
    dt: number = 0;
    /** 1-based ordinal of the current think. */
    currentTick: number = 0;
    /** Opaque per-run payload attached by the host profile. */
    data: HostWorld;
    /** Code of the fault a host body raised, or {@link NO_FAULT}. */
    faultCode: number = NO_FAULT;
    /** Diagnostic text of the fault a host body raised. */
    faultMessage: string = "";

    constructor(services: BrainServices, variables: VariableStore, data: HostWorld) {
      this.services = services;
      this.variables = variables;
      this.data = data;
    }

    /**
     * Report that the active host body produced a failure and no result.
     * The dispatcher faults the calling fiber with `code` before the call
     * is observed.
     *
     * @param code - Fault classifier the calling fiber takes.
     * @param message - Diagnostic text; never rendered into a trace.
     */
    raise(code: ErrorCode, message: string): void {
      this.faultCode = code;
      this.faultMessage = message;
    }

    /** Whether a host body has reported a failure that is not yet consumed. */
    hasFault(): boolean {
      return this.faultCode !== NO_FAULT;
    }

    /** Discard the recorded host failure. */
    clearFault(): void {
      this.faultCode = NO_FAULT;
      this.faultMessage = "";
    }
  }

  /**
   * One host function, dispatched by `HOST_CALL` (or its async form) against
   * its stable funcId. Subclass and override {@link HostFunction.exec} for a
   * synchronous function; an asynchronous one sets {@link HostFunction.isAsync}
   * and overrides {@link HostFunction.execAsync}.
   */
  export class HostFunction {
    /** Stable funcId the bytecode dispatches this function by. */
    fnId: number;
    /** Whether the function returns a pending handle and no value. */
    isAsync: boolean;

    constructor(fnId: number) {
      this.fnId = fnId;
      this.isAsync = false;
    }

    /**
     * Run the function body over its positional argument buffer. The base
     * implementation raises `ScriptError`: the function carries no synchronous
     * body.
     *
     * @param ctx - Execution context of the calling fiber.
     * @param args - Positional argument buffer, one entry per declared slot.
     */
    exec(ctx: ExecutionContext, args: Value[]): Value {
      ctx.raise(ErrorCode.ScriptError, `host function ${this.fnId} has no body`);
      return NIL_VALUE;
    }

    /**
     * Start the asynchronous function body over an owned copy of its positional
     * argument buffer, and settle `handle` when the work completes. The base
     * implementation raises `ScriptError`: the function carries no asynchronous
     * body.
     *
     * @param ctx - Execution context of the dispatching fiber.
     * @param args - Owned positional argument buffer, one entry per declared slot.
     * @param handle - Settle handle of the pending operation the dispatch allocated.
     */
    execAsync(ctx: ExecutionContext, args: Value[], handle: AsyncHandle): void {
      ctx.raise(ErrorCode.ScriptError, `host function ${this.fnId} is missing execAsync`);
    }
  }

  /** The host functions a program's `HOST_CALL` operands resolve against. */
  export class HostFunctionRegistry {
    private functions: HostFunction[] = [];

    constructor() {}

    /**
     * Register `fn` under its declared funcId.
     *
     * @param fn - Host function to register.
     */
    register(fn: HostFunction): void {
      this.functions.push(fn);
    }

    /**
     * The function registered under `fnId`, or `undefined` when none is.
     *
     * @param fnId - Stable funcId from a `HOST_CALL` operand.
     */
    getById(fnId: number): HostFunction {
      for (let i = 0; i < this.functions.length; i++) {
        if (this.functions[i].fnId === fnId) {
          return this.functions[i];
        }
      }
      return undefined;
    }
  }

  /**
   * One host-bound action, dispatched by `HOST_ACTION_CALL` (or its async
   * form) against its stable action id. Subclass and override
   * {@link HostActionBinding.execSync} for a synchronous action.
   */
  export class HostActionBinding {
    /** Stable action id the bytecode dispatches this action by. */
    actionId: number;
    /** Authoring key of the action; the registry key and host-function name. */
    key: string;
    /** Whether the action returns a pending handle and no value. */
    isAsync: boolean;
    /**
     * Whether an asynchronous dispatch of this action allocates its handle
     * outside the live-handle cap, skipping the capacity check. Correct only
     * on an action whose live pending handles the runtime already bounds by
     * construction.
     */
    uncappedHandles: boolean;

    constructor(actionId: number, key: string, isAsync: boolean) {
      this.actionId = actionId;
      this.key = key;
      this.isAsync = isAsync;
      this.uncappedHandles = false;
    }

    /**
     * Run the synchronous action body over its positional argument buffer.
     * The base implementation raises `ScriptError`: the action carries no
     * synchronous body.
     *
     * @param ctx - Execution context of the calling fiber.
     * @param args - Positional argument buffer, one entry per declared slot.
     */
    execSync(ctx: ExecutionContext, args: Value[]): Value {
      ctx.raise(ErrorCode.ScriptError, `host action ${this.key} is missing execSync`);
      return NIL_VALUE;
    }

    /**
     * Start the asynchronous action body over an owned copy of its positional
     * argument buffer, and settle `handle` when the work completes. The base
     * implementation raises `ScriptError`: the action carries no asynchronous
     * body.
     *
     * @param ctx - Execution context of the dispatching fiber.
     * @param args - Owned positional argument buffer, one entry per declared slot.
     * @param handle - Settle handle of the pending operation the dispatch allocated.
     */
    execAsync(ctx: ExecutionContext, args: Value[], handle: AsyncHandle): void {
      ctx.raise(ErrorCode.ScriptError, `host action ${this.key} is missing execAsync`);
    }

    /**
     * Prepare one call site of this action for the page that is being
     * activated. The brain runtime runs it once per call site of the page, in
     * the page's call-site order, before the page's root rules spawn, with
     * `ctx.currentCallSiteId` bound to that site. The base implementation does
     * nothing.
     *
     * @param ctx - Execution context, bound to the call site being activated.
     */
    onPageEntered(ctx: ExecutionContext): void {}
  }

  /** The host actions a program's `HOST_ACTION_CALL` operands resolve against. */
  export class HostActionRegistry {
    private actions: HostActionBinding[] = [];

    constructor() {}

    /**
     * Register `action` under its declared action id.
     *
     * @param action - Host action binding to register.
     */
    register(action: HostActionBinding): void {
      this.actions.push(action);
    }

    /**
     * The action registered under `actionId`, or `undefined` when none is.
     *
     * @param actionId - Stable action id from a `HOST_ACTION_CALL` operand.
     */
    getById(actionId: number): HostActionBinding {
      for (let i = 0; i < this.actions.length; i++) {
        if (this.actions[i].actionId === actionId) {
          return this.actions[i];
        }
      }
      return undefined;
    }
  }

  /**
   * Passive observer of the VM's externally visible effects. Every method is
   * a no-op by default; a subclass overrides the ones it records. The VM
   * never reads a return value and never branches on an observer, so a run
   * with an observer and a run without execute identically.
   */
  export class VmObserver {
    constructor() {}

    /**
     * One completed synchronous host-bound action dispatch.
     *
     * @param actionId - Stable registry id of the dispatched action.
     * @param callSiteId - Call-site id the dispatch was bound to.
     * @param args - Positional argument buffer as the binding received it.
     * @param result - Value the call returned.
     */
    onHostActionCall(actionId: number, callSiteId: number, args: Value[], result: Value): void {}

    /**
     * One asynchronous host-bound action dispatch, reported once its body has
     * been started.
     *
     * @param actionId - Stable registry id of the dispatched action.
     * @param callSiteId - Call-site id the dispatch was bound to.
     * @param args - Positional argument buffer as the binding received it.
     */
    onHostActionCallAsync(actionId: number, callSiteId: number, args: Value[]): void {}

    /**
     * One fiber fault.
     *
     * @param fiberId - Id of the faulted fiber.
     * @param code - Numeric wire-stable fault classifier.
     */
    onFiberFault(fiberId: number, code: number): void {}
  }
}
