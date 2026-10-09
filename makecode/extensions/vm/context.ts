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
  export class HostAttachment {
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
   * A fresh copy of the pooled starting value `constant` for storing in a
   * variable slot: a struct copies into a new struct cell, field by field
   * and recursively; any other value is immutable and returned as is.
   *
   * @param constant - A value from the program's constant pool.
   */
  function freshSeed(constant: Value): Value {
    if (constant.t !== ValueTag.Struct) {
      return constant;
    }
    const fields: Value[] = [];
    for (let i = 0; i < constant.fields.length; i++) {
      fields.push(freshSeed(constant.fields[i]));
    }
    return mkStruct(constant.typeId, fields);
  }

  /**
   * Brain-global variable storage, indexed by the compiler-assigned slot id
   * that `LOAD_VAR_SLOT` and `STORE_VAR_SLOT` carry. Each slot is seeded at
   * program load with a fresh copy of the starting value the program
   * declares for it, so no slot holds the program's pooled constant or shares
   * a struct cell with another slot or another store over the same program. A
   * variable is also reachable by name: the program's own variables by the
   * names it declares for their slots, and a name it declares none for by a
   * slot of its own, allocated on first write, that no bytecode addresses.
   */
  export class VariableStore {
    private values: Value[] = [];
    /** Variable name of each slot, by slot id; the program's names, then each name a by-name write added. */
    private names: string[] = [];

    constructor() {}

    /**
     * Allocate one slot per entry in `program.variableNames` and seed it
     * with a fresh copy of the program's declared starting value for it.
     *
     * @param program - The loaded program.
     */
    install(program: Program): void {
      this.values = [];
      this.names = program.variableNames.slice(0);
      for (let i = 0; i < program.variableNames.length; i++) {
        const initIdx = i < program.variableInitValues.length ? program.variableInitValues[i] : NO_VARIABLE_INIT;
        const seed =
          initIdx === NO_VARIABLE_INIT || initIdx >= program.constValues.length
            ? NIL_VALUE
            : freshSeed(program.constValues[initIdx]);
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

    /**
     * The value of the variable named `name`, or nil when no slot carries
     * that name.
     *
     * @param name - Variable name.
     */
    getByName(name: string): Value {
      const slotId = this.names.indexOf(name);
      return slotId < 0 ? NIL_VALUE : this.getBySlot(slotId);
    }

    /**
     * Write the variable named `name`, allocating a slot for it after every
     * other slot when no slot carries that name.
     *
     * @param name - Variable name.
     * @param value - Value to store.
     */
    setByName(name: string, value: Value): void {
      let slotId = this.names.indexOf(name);
      if (slotId < 0) {
        slotId = Math.max(this.names.length, this.values.length);
        while (this.names.length < slotId) {
          this.names.push("");
        }
        this.names.push(name);
      }
      this.setBySlot(slotId, value);
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

  /** Identity a binding carries until a registry assigns it one. */
  export const UNASSIGNED_ID = -1;

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
    data: HostAttachment;
    /** Code of the fault a host body raised, or {@link NO_FAULT}. */
    faultCode: number = NO_FAULT;
    /** Diagnostic text of the fault a host body raised. */
    faultMessage: string = "";

    constructor(services: BrainServices, variables: VariableStore, data: HostAttachment) {
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
   * The rule-variable name an action's named output is carried in. The output
   * tile that reads the output resolves to this same name.
   *
   * @param typeId - TypeId of the output's value.
   * @param name - Output name as the action declares it.
   */
  export function actionOutputVariableName(typeId: string, name: string): string {
    return `__out.${typeId}.${name}`;
  }

  /**
   * Write one of the running action's named outputs, from the action's own
   * body. The value is stored on the rule the body is executing under, so the
   * reading tile sees it in that rule and in every rule below it. A body
   * running under no rule writes nothing.
   *
   * @param ctx - Execution context of the running action.
   * @param typeId - TypeId of the output's value.
   * @param name - Output name as the action declares it.
   * @param value - Value to store.
   */
  export function setActionOutput(ctx: ExecutionContext, typeId: string, name: string, value: Value): void {
    ctx.services.ruleVars.setByName(ctx.currentRuleFuncId, actionOutputVariableName(typeId, name), value);
  }

  /**
   * The value the WHEN side of the running rule last evaluated to, as its
   * WHEN gate captured it into {@link WHEN_RESULT_VAR}; when the running rule
   * has captured none, the nearest enclosing rule's. Nil when the body runs
   * under no rule or no such rule has captured one.
   *
   * @param ctx - Execution context of the running action.
   */
  export function getWhenResult(ctx: ExecutionContext): Value {
    return ctx.services.ruleVars.getByName(ctx.currentRuleFuncId, WHEN_RESULT_VAR);
  }

  /**
   * One host function, dispatched by `HOST_CALL` (or its async form) against
   * its stable funcId. Subclass and override {@link HostFunction.exec} for a
   * synchronous function; an asynchronous one sets {@link HostFunction.isAsync}
   * and overrides {@link HostFunction.execAsync}.
   */
  export class HostFunction {
    /** Stable funcId the bytecode dispatches this function by, assigned when it is registered. */
    fnId: number;
    /** Whether the function returns a pending handle and no value. */
    isAsync: boolean;

    constructor() {
      this.fnId = UNASSIGNED_ID;
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
     * Register `fn` under `fnId`, which becomes the function's
     * {@link HostFunction.fnId}.
     *
     * @param fnId - Stable funcId the bytecode dispatches the function by.
     * @param fn - Host function to register.
     */
    register(fnId: number, fn: HostFunction): void {
      fn.fnId = fnId;
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
    /** Stable action id the bytecode dispatches this action by, assigned when it is registered. */
    actionId: number;
    /** Authoring name of the action, assigned when it is registered. */
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

    constructor(isAsync: boolean) {
      this.actionId = UNASSIGNED_ID;
      this.key = "";
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
     * `ctx.currentCallSiteId` bound to that site. A throw out of it faults
     * the program `ScriptError` on no fiber, and the page's activation goes
     * on. The base implementation does nothing.
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
     * Register `action` under `actionId` and `key`, which become its
     * {@link HostActionBinding.actionId} and {@link HostActionBinding.key}.
     *
     * @param actionId - Stable action id the bytecode dispatches the action by.
     * @param key - Authoring name of the action.
     * @param action - Host action binding to register.
     */
    register(actionId: number, key: string, action: HostActionBinding): void {
      action.actionId = actionId;
      action.key = key;
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
   * One registered struct type, keyed by the typeId its values carry and by
   * the stable type-atom id its wire (TYPS) entries record. A closed struct
   * type registers with every hook flag false; a native-backed type
   * subclasses, sets the flag of each hook it implements, and overrides that
   * hook to dispatch into the host object behind the value, or to report
   * whether that object still exists.
   */
  export class StructTypeBinding {
    /** TypeId a struct value of this type carries, e.g. `"struct:<Point>"`, assigned when it is registered. */
    typeId: string;
    /** Stable type-atom id the type's wire (TYPS) entries record, assigned when it is registered. */
    atomId: number;
    /**
     * Field ids of the type's declared fields, in declaration order, assigned
     * when it is registered. A hook that dispatches on a field id reads the
     * id it is to compare against from here.
     */
    fieldIds: number[];
    /** Whether {@link StructTypeBinding.fieldGetter} is registered; false reads indexed field slots. */
    hasFieldGetter: boolean;
    /** Whether {@link StructTypeBinding.fieldSetter} is registered; false writes indexed field slots. */
    hasFieldSetter: boolean;
    /** Whether {@link StructTypeBinding.snapshotNative} is registered; false copies the native handle by reference. */
    hasSnapshotNative: boolean;
    /** Whether {@link StructTypeBinding.exists} is registered; false keeps every value of the type truthy. */
    hasExists: boolean;
    /** Whether the type declares every field read-only, so no brain can write one. */
    fieldsAreReadOnly: boolean;

    constructor() {
      this.typeId = "";
      this.atomId = UNASSIGNED_ID;
      this.fieldIds = [];
      this.hasFieldGetter = false;
      this.hasFieldSetter = false;
      this.hasSnapshotNative = false;
      this.hasExists = false;
      this.fieldsAreReadOnly = false;
    }

    /**
     * Read the field `fieldId` of `source` from the host object behind it.
     * A result of `undefined` reads as nil at the dispatch site. The base
     * implementation reads every field as absent.
     *
     * @param source - Struct value the field is read from.
     * @param fieldId - Numeric field id (the field's storage slot).
     * @param ctx - Execution context of the reading fiber.
     */
    fieldGetter(source: Value, fieldId: number, ctx: ExecutionContext): Value {
      return undefined;
    }

    /**
     * Write `value` into the field `fieldId` of the host object behind
     * `source`. Returning false rejects the write, which faults the writing
     * fiber with `ScriptError`. The base implementation rejects every write.
     *
     * @param source - Struct value the field is written through.
     * @param fieldId - Numeric field id (the field's storage slot).
     * @param value - Value to write.
     * @param ctx - Execution context of the writing fiber.
     */
    fieldSetter(source: Value, fieldId: number, value: Value, ctx: ExecutionContext): boolean {
      return false;
    }

    /**
     * Materialize `source`'s native handle for the deep copy an assignment
     * makes: resolve a lazy handle to the concrete host object the copy
     * stores. The base implementation passes the handle through unchanged.
     *
     * @param source - Struct value being copied.
     * @param ctx - Execution context of the copying fiber.
     */
    // biome-ignore lint/suspicious/noExplicitAny: pxt's static subset has no unknown type.
    snapshotNative(source: Value, ctx: ExecutionContext): any {
      return source.native;
    }

    /**
     * Whether the host object behind `source` still exists. Every truthiness
     * test of a value of the type calls it, and a value it answers false for
     * is falsy. It must not change host state, and its answer may differ
     * between calls. The base implementation answers true.
     *
     * @param source - Struct value being tested.
     * @param ctx - Execution context of the testing fiber.
     */
    exists(source: Value, ctx: ExecutionContext): boolean {
      return true;
    }
  }

  /** Diagnostic code: a program addressed a field id its struct type declares no field under. */
  export const FIELD_UNDECLARED = "field-undeclared";

  /**
   * One field a program addressed that its registered struct type does not
   * declare -- a field the type's pack has since removed, whose id the
   * project's mapping keeps for it.
   */
  export class UndeclaredFieldAccess {
    /** TypeId of the struct type. */
    typeId: string;
    /** The field id the program addressed. */
    fieldId: number;

    constructor(typeId: string, fieldId: number) {
      this.typeId = typeId;
      this.fieldId = fieldId;
    }
  }

  /**
   * The struct types a program's values and TYPS atom entries resolve
   * against: field-hook dispatch looks types up by typeId, and program
   * loading validates every TYPS atom entry by atom id.
   */
  export class StructTypeRegistry {
    private types: StructTypeBinding[] = [];
    private undeclared: UndeclaredFieldAccess[] = [];

    constructor() {}

    /**
     * Record that a program addressed the field `fieldId` of `binding`'s
     * type, which declares no field under that id. Each type and field id is
     * recorded once, however often it is addressed. Recording changes nothing
     * the program observes.
     *
     * @param binding - The registered type the program addressed.
     * @param fieldId - The field id the program addressed.
     */
    noteUndeclaredField(binding: StructTypeBinding, fieldId: number): void {
      for (let i = 0; i < this.undeclared.length; i++) {
        if (this.undeclared[i].typeId === binding.typeId && this.undeclared[i].fieldId === fieldId) {
          return;
        }
      }
      this.undeclared.push(new UndeclaredFieldAccess(binding.typeId, fieldId));
    }

    /** Every undeclared field programs addressed, each once, in the order first addressed. */
    undeclaredFieldAccesses(): UndeclaredFieldAccess[] {
      return this.undeclared;
    }

    /**
     * Register `binding` under `typeId`, `atomId` and `fieldIds`, which become
     * its {@link StructTypeBinding.typeId}, {@link StructTypeBinding.atomId}
     * and {@link StructTypeBinding.fieldIds}.
     *
     * @param typeId - TypeId a struct value of the type carries.
     * @param atomId - Stable type-atom id the type's wire (TYPS) entries record.
     * @param fieldIds - Field ids of the type's declared fields, in declaration order.
     * @param binding - Struct type binding to register.
     */
    register(typeId: string, atomId: number, fieldIds: number[], binding: StructTypeBinding): void {
      binding.typeId = typeId;
      binding.atomId = atomId;
      binding.fieldIds = fieldIds;
      this.types.push(binding);
    }

    /**
     * The type registered under `typeId`, or `undefined` when none is.
     *
     * @param typeId - TypeId a struct value carries.
     */
    getByTypeId(typeId: string): StructTypeBinding {
      for (let i = 0; i < this.types.length; i++) {
        if (this.types[i].typeId === typeId) {
          return this.types[i];
        }
      }
      return undefined;
    }

    /**
     * The type registered under the stable atom id `atomId`, or `undefined`
     * when none is.
     *
     * @param atomId - Stable type-atom id from a TYPS entry.
     */
    getByAtomId(atomId: number): StructTypeBinding {
      for (let i = 0; i < this.types.length; i++) {
        if (this.types[i].atomId === atomId) {
          return this.types[i];
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
     * One fault, reported once as it is raised; nothing retains it.
     *
     * @param fiberId - Id of the faulted fiber, or {@link NO_FIBER} for a fault raised outside every fiber.
     * @param fault - The fault: its wire-stable code, its diagnostic message, and the instruction that raised it.
     */
    onFiberFault(fiberId: number, fault: VmFault): void {}
  }
}
