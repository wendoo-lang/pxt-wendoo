/**
 * The fiber scheduler and the brain runtime that drives it.
 *
 * The runtime is the single entry point into the VM: nothing outside
 * {@link BrainRuntime.think} calls the scheduler or the dispatch loop. An
 * external event source enqueues work; the think drains it.
 */
namespace wendoo {
  /**
   * Cooperative fiber scheduler. Runnable fibers are dispatched in enqueue
   * order, and a tick is a round: every fiber in the queue at entry receives
   * exactly one budget slice, and anything enqueued while the round runs
   * joins the next one. Child-rule fibers are the exception: they drain within
   * the round that spawned them.
   */
  export class FiberScheduler extends ChildRuleSpawner {
    private vm: VM;
    private caps: VmCaps;
    private fiberIds: number[] = [];
    private fibers: Fiber[] = [];
    private runQueue: number[] = [];
    private pendingSpawns: number[] = [];
    private nextFiberId: number = 1;

    constructor(vm: VM, caps: VmCaps) {
      super();
      this.vm = vm;
      this.caps = caps;
    }

    /**
     * Spawn a fiber at `funcId` and enqueue it as runnable. Returns the
     * scheduler-assigned fiber id.
     *
     * @param funcId - Entry function id.
     * @param ctx - Context the fiber executes against.
     */
    spawn(funcId: number, ctx: ExecutionContext): number {
      const fiberId = this.nextFiberId;
      this.nextFiberId++;
      const fiber = this.vm.spawnFiber(fiberId, funcId, ctx);
      this.fiberIds.push(fiberId);
      this.fibers.push(fiber);
      this.enqueue(fiberId);
      return fiberId;
    }

    spawnChildRule(funcId: number, subtreeRootFuncId: number, ctx: ExecutionContext): void {
      const fiberId = this.nextFiberId;
      this.nextFiberId++;
      const fiber = this.vm.spawnFiber(fiberId, funcId, ctx);
      fiber.rootRuleFuncId = subtreeRootFuncId;
      this.fiberIds.push(fiberId);
      this.fibers.push(fiber);
      this.pendingSpawns.push(fiberId);
    }

    /**
     * The tracked fiber with `fiberId`, or `undefined` once it has been
     * collected.
     *
     * @param fiberId - Scheduler-assigned fiber id.
     */
    getFiber(fiberId: number): Fiber {
      for (let i = 0; i < this.fiberIds.length; i++) {
        if (this.fiberIds[i] === fiberId) {
          return this.fibers[i];
        }
      }
      return undefined;
    }

    /**
     * Resume the waiters of every handle settled since the last drain, then
     * free each drained handle. A resumed fiber joins the run queue.
     */
    drainCompletedHandles(): void {
      const handles = this.vm.handles;
      let handle = handles.popCompleted();
      while (handle) {
        for (let i = 0; i < handle.waiters.length; i++) {
          const fiber = this.getFiber(handle.waiters[i]);
          if (fiber && this.vm.resumeFiberFromHandle(fiber, handle)) {
            this.enqueue(fiber.id);
          }
        }
        handles.deleteHandle(handle.id);
        handle = handles.popCompleted();
      }
    }

    /**
     * Cancel the tracked fiber with `fiberId`. A fiber the scheduler no
     * longer tracks, and one already in a terminal state, are both no-ops.
     *
     * @param fiberId - Scheduler-assigned fiber id.
     */
    cancel(fiberId: number): void {
      const fiber = this.getFiber(fiberId);
      if (fiber) {
        this.vm.cancelFiber(fiber);
      }
    }

    /**
     * Cancel every live child-rule fiber, leaving root-rule fibers untouched.
     * Safe to call mid-round: a fiber cancelled while it is queued or held in
     * the round's spawn drain is skipped when its turn comes.
     */
    cancelChildRuleFibers(): void {
      for (let i = 0; i < this.fibers.length; i++) {
        const fiber = this.fibers[i];
        if (fiber.rootRuleFuncId === NO_RULE) {
          continue;
        }
        if (fiber.state === FiberState.Runnable || fiber.state === FiberState.Waiting) {
          this.vm.cancelFiber(fiber);
        }
      }
    }

    /**
     * Whether any runnable or waiting fiber belongs to the subtree of the root
     * rule `rootRuleFuncId`.
     *
     * @param rootRuleFuncId - Funcid of a root rule.
     */
    hasLiveDescendantOfRoot(rootRuleFuncId: number): boolean {
      for (let i = 0; i < this.fibers.length; i++) {
        const fiber = this.fibers[i];
        if (fiber.rootRuleFuncId !== rootRuleFuncId) {
          continue;
        }
        if (fiber.state === FiberState.Runnable || fiber.state === FiberState.Waiting) {
          return true;
        }
      }
      return false;
    }

    /**
     * Whether any live (runnable or waiting) fiber belongs to `ruleFuncId`'s
     * cluster: its own fiber, or a fiber whose rule reaches `ruleFuncId` by
     * walking the program's rule-ancestor chain. Child-rule fibers held in the
     * current round's spawn drain are runnable and count.
     *
     * @param ruleFuncId - Rule funcId whose cluster is queried.
     */
    hasLiveRuleSubtree(ruleFuncId: number): boolean {
      for (let i = 0; i < this.fibers.length; i++) {
        const fiber = this.fibers[i];
        if (fiber.state !== FiberState.Runnable && fiber.state !== FiberState.Waiting) {
          continue;
        }
        let cur = fiber.ruleFuncId;
        while (cur !== NO_RULE) {
          if (cur === ruleFuncId) {
            return true;
          }
          cur = this.vm.ruleParentFuncId(cur);
        }
      }
      return false;
    }

    /**
     * Execute one round: one budget slice for every fiber queued at entry,
     * each followed by the depth-first drain of the child rules that slice
     * spawned.
     */
    tick(): void {
      const roundSize = this.runQueue.length;
      for (let i = 0; i < roundSize; i++) {
        this.runSlice(this.runQueue.shift());
        this.drainSpawnedSubtrees();
      }
    }

    /** Drop every fiber that has reached a terminal state. */
    gc(): void {
      const liveIds: number[] = [];
      const live: Fiber[] = [];
      for (let i = 0; i < this.fibers.length; i++) {
        const state = this.fibers[i].state;
        if (state === FiberState.Runnable || state === FiberState.Waiting) {
          liveIds.push(this.fiberIds[i]);
          live.push(this.fibers[i]);
        }
      }
      this.fiberIds = liveIds;
      this.fibers = live;
    }

    /**
     * Runs the child rules the just-finished slice spawned, depth-first: each
     * child receives a budget slice and the grandchildren it spawns drain
     * before that child's next sibling.
     */
    private drainSpawnedSubtrees(): void {
      if (this.pendingSpawns.length === 0) {
        return;
      }
      const children = this.pendingSpawns;
      this.pendingSpawns = [];
      for (let i = 0; i < children.length; i++) {
        this.runSlice(children[i]);
        this.drainSpawnedSubtrees();
      }
    }

    /** Grants one budget slice to `fiberId`, re-enqueueing it if it yielded. */
    private runSlice(fiberId: number): void {
      const fiber = this.getFiber(fiberId);
      if (!fiber || fiber.state !== FiberState.Runnable) {
        return;
      }
      fiber.instrBudget = this.caps.defaultBudget;
      if (this.vm.runFiber(fiber, this) === VmStatus.Yielded) {
        this.enqueue(fiberId);
      }
    }

    private enqueue(fiberId: number): void {
      for (let i = 0; i < this.runQueue.length; i++) {
        if (this.runQueue[i] === fiberId) {
          return;
        }
      }
      this.runQueue.push(fiberId);
    }
  }

  /** Answers cluster liveness from a {@link FiberScheduler}'s fiber table. */
  class SchedulerRuleLiveness extends RuleSubtreeLiveness {
    private scheduler: FiberScheduler;

    constructor(scheduler: FiberScheduler) {
      super();
      this.scheduler = scheduler;
    }

    hasLiveSubtree(ruleFuncId: number): boolean {
      return this.scheduler.hasLiveRuleSubtree(ruleFuncId);
    }
  }

  /** Page-index sentinel meaning no page. */
  const NO_PAGE = -1;

  /** Serves the page service from a {@link BrainRuntime}'s page-lifecycle state. */
  class RuntimeBrainPages extends BrainPageServices {
    private runtime: BrainRuntime;

    constructor(runtime: BrainRuntime) {
      super();
      this.runtime = runtime;
    }

    getCurrentPageId(): string {
      return this.runtime.getCurrentPageId();
    }

    getPreviousPageId(): string {
      return this.runtime.getPreviousPageId();
    }

    requestPageChange(pageIndex: number): void {
      this.runtime.requestPageChange(pageIndex);
    }

    requestPageChangeByPageId(pageId: string): void {
      this.runtime.requestPageChangeByPageId(pageId);
    }

    requestPageRestart(): void {
      this.runtime.requestPageRestart();
    }
  }

  /** One active root rule and the fiber currently running it. */
  class ActiveRule {
    /** Entry function id of the rule. */
    funcId: number;
    /** Fiber running the rule's current firing, or -1 before the first spawn. */
    fiberId: number;

    constructor(funcId: number) {
      this.funcId = funcId;
      this.fiberId = -1;
    }
  }

  /**
   * Runtime entry point for one loaded brain program. Owns the VM, the fiber
   * scheduler, the page's active rules, and brain-global variable storage.
   *
   * Call {@link BrainRuntime.startup} once after construction, then
   * {@link BrainRuntime.think} once per scheduled tick.
   */
  export class BrainRuntime {
    private program: Program;
    private hostActions: HostActionRegistry;
    private observer: VmObserver;
    private vm: VM;
    private scheduler: FiberScheduler;
    private ctx: ExecutionContext;
    private lastThinkTime: number = 0;
    private activeRules: ActiveRule[] = [];
    /** Index of the page whose rules are running. */
    private currentPageIndex: number = 0;
    /** Index of the page a page-change request asked for. */
    private desiredPageIndex: number = 0;
    /** Index of the most recently deactivated page, or {@link NO_PAGE}. */
    private previousPageIndex: number = NO_PAGE;

    /**
     * @param program - The decoded, linked program to run.
     * @param hostFunctions - Host functions the program's `HOST_CALL` operands resolve against.
     * @param hostActions - Host actions the program's `HOST_ACTION_CALL` operands resolve against.
     * @param types - Struct types the program's field hooks and deep copies dispatch against.
     * @param observer - Passive observer of the run's visible effects.
     * @param caps - Per-fiber and per-round capacity caps.
     * @param attachment - Opaque per-run payload the host profile attaches to the context.
     * @param previousVariables - Optional snapshot of the variable storage of
     *   the runtime this one replaces, taken by {@link BrainRuntime.snapshotVariables},
     *   used to carry variable values by name across a re-initialization
     *   (hot reload); `undefined` for a fresh start.
     */
    constructor(
      program: Program,
      hostFunctions: HostFunctionRegistry,
      hostActions: HostActionRegistry,
      types: StructTypeRegistry,
      observer: VmObserver,
      caps: VmCaps,
      attachment: HostAttachment,
      previousVariables?: VariableSnapshot
    ) {
      this.program = program;
      this.hostActions = hostActions;
      this.observer = observer;
      const variables = new VariableStore();
      variables.install(program, previousVariables);
      this.vm = new VM(program, hostFunctions, hostActions, types, observer, caps);
      this.scheduler = new FiberScheduler(this.vm, caps);
      const services = new BrainServices(
        program,
        new SchedulerRuleLiveness(this.scheduler),
        new RuntimeBrainPages(this)
      );
      this.ctx = new ExecutionContext(services, variables, attachment);
    }

    /** How many thinks have run a page since construction: the tick count the program's context carries. */
    tickCount(): number {
      return this.ctx.currentTick;
    }

    /**
     * The value of the brain-global variable named `name`, matched exactly
     * and case-sensitively; nil when no slot carries that name.
     *
     * @param name - Variable name.
     */
    getVariable(name: string): Value {
      return this.ctx.variables.getByName(name);
    }

    /**
     * Write the brain-global variable named `name`, matched exactly and
     * case-sensitively. A name the program declares no variable by gets a
     * slot of its own, which no bytecode addresses and only a by-name read
     * reaches.
     *
     * @param name - Variable name.
     * @param value - Value to store.
     */
    setVariable(name: string, value: Value): void {
      this.ctx.variables.setByName(name, value);
    }

    /**
     * Returns a snapshot of the current variable storage for carry-forward
     * across a re-initialization. The snapshot holds live references to the
     * current slots and their names; the caller consumes it immediately to
     * construct the next runtime and then drops this one.
     */
    snapshotVariables(): VariableSnapshot {
      return this.ctx.variables.snapshot();
    }

    /** Activate the first page and spawn a fiber for each of its root rules. */
    startup(): void {
      this.lastThinkTime = 0;
      this.currentPageIndex = 0;
      this.desiredPageIndex = 0;
      this.previousPageIndex = NO_PAGE;
      if (this.program.pages.length === 0) {
        return;
      }
      this.activatePage(0);
    }

    /**
     * Advance the brain by one tick: resume the fibers whose handles settled
     * since the last think, serve any page change requested since it, respawn
     * every root rule whose firing has ended and whose subtree has emptied,
     * then run one scheduler round.
     *
     * A page change requested during a think therefore takes effect at the
     * start of the next one: the requesting think finishes on the page it
     * began on.
     *
     * @param currentTime - Cumulative scheduled time of this think.
     */
    think(currentTime: number): void {
      if (this.program.pages.length === 0) {
        return;
      }
      this.scheduler.drainCompletedHandles();

      if (this.currentPageIndex !== this.desiredPageIndex) {
        this.deactivateCurrentPage();
        this.previousPageIndex = this.currentPageIndex;
        this.currentPageIndex = this.desiredPageIndex;
        if (this.isValidPageIndex(this.currentPageIndex)) {
          this.activatePage(this.currentPageIndex);
        }
      }

      if (this.isValidPageIndex(this.currentPageIndex)) {
        this.thinkPage(currentTime);
      }
      this.lastThinkTime = currentTime;
    }

    /** Stable page id of the active page, or `""` when no page is active. */
    getCurrentPageId(): string {
      if (!this.isValidPageIndex(this.currentPageIndex)) {
        return "";
      }
      return this.program.pages[this.currentPageIndex].pageId;
    }

    /**
     * Stable page id of the most recently deactivated page, falling back to
     * the active page's while no page has been deactivated yet.
     */
    getPreviousPageId(): string {
      if (!this.isValidPageIndex(this.previousPageIndex)) {
        return this.getCurrentPageId();
      }
      return this.program.pages[this.previousPageIndex].pageId;
    }

    /**
     * Ask that `pageIndex` be the active page from the next think, cancelling
     * the active page's fibers now. The index of the active page restarts it
     * instead. An index outside the program's pages is a no-op: the active
     * page stays active and loses no fiber.
     *
     * @param pageIndex - Zero-based index of the page to switch to.
     */
    requestPageChange(pageIndex: number): void {
      if (pageIndex < 0 || pageIndex >= this.program.pages.length) {
        return;
      }
      if (pageIndex === this.currentPageIndex) {
        this.requestPageRestart();
        return;
      }
      this.desiredPageIndex = pageIndex;
      this.cancelActiveFibers();
    }

    /**
     * Ask that the page carrying `pageId` be the active page from the next
     * think. A no-op when no page carries the id.
     *
     * @param pageId - Stable page id of the page to switch to.
     */
    requestPageChangeByPageId(pageId: string): void {
      for (let i = 0; i < this.program.pages.length; i++) {
        if (this.program.pages[i].pageId === pageId) {
          this.requestPageChange(i);
          return;
        }
      }
    }

    /**
     * Restart the active page: cancel its fibers now, so its root rules
     * respawn at the next think. The page is not deactivated and not
     * reactivated, so no activation hook runs and every call site keeps the
     * state it holds.
     */
    requestPageRestart(): void {
      this.cancelActiveFibers();
    }

    /**
     * Run one think of the active page: stamp the per-tick scalars, respawn
     * every root rule whose firing has ended and whose subtree has emptied,
     * run one scheduler round, and collect the fibers it finished.
     */
    private thinkPage(currentTime: number): void {
      this.ctx.time = currentTime;
      this.ctx.dt = this.lastThinkTime === 0 ? 0 : currentTime - this.lastThinkTime;
      this.ctx.currentTick++;

      for (let i = 0; i < this.activeRules.length; i++) {
        const entry = this.activeRules[i];
        if (!this.isRuleFiringOver(entry.fiberId)) {
          continue;
        }
        if (this.scheduler.hasLiveDescendantOfRoot(entry.funcId)) {
          continue;
        }
        entry.fiberId = this.scheduler.spawn(entry.funcId, this.ctx);
      }

      this.scheduler.tick();
      this.scheduler.gc();
    }

    /**
     * Activate `pageIndex`: run the page-activation hook of every host-bound
     * call site on it, in the page's call-site order, then spawn a fiber for
     * each of its root rules. A hook that throws faults the program
     * `ScriptError` on no fiber, and the activation goes on: every later
     * hook runs and every root rule spawns.
     */
    private activatePage(pageIndex: number): void {
      const page = this.program.pages[pageIndex];
      this.activeRules = [];
      for (let i = 0; i < page.actionCallSites.length; i++) {
        const site = page.actionCallSites[i];
        if (!site.isHostBinding) {
          continue;
        }
        const action = this.hostActions.getById(site.id);
        if (!action) {
          continue;
        }
        this.runActivationHook(site.callSiteId, action);
      }
      this.ctx.currentCallSiteId = NO_CALL_SITE;
      this.ctx.currentRuleFuncId = NO_RULE;
      for (let i = 0; i < page.rootRuleFuncIds.length; i++) {
        const entry = new ActiveRule(page.rootRuleFuncIds[i]);
        entry.fiberId = this.scheduler.spawn(entry.funcId, this.ctx);
        this.activeRules.push(entry);
      }
    }

    /**
     * Run `action`'s page-activation hook bound to `callSiteId`, restoring the
     * context's call-site and rule binding afterwards. A throw out of the
     * hook discards any fault the hook raised before it and is reported to
     * the observer as a `ScriptError` fault naming the thrown value, raised
     * on no fiber and at no instruction.
     */
    private runActivationHook(callSiteId: number, action: HostActionBinding): void {
      const previousCallSiteId = this.ctx.currentCallSiteId;
      const previousRuleFuncId = this.ctx.currentRuleFuncId;
      this.ctx.currentCallSiteId = callSiteId;
      this.ctx.currentRuleFuncId = NO_RULE;
      try {
        action.onPageEntered(this.ctx);
      } catch (e) {
        this.ctx.clearFault();
        this.observer.onFiberFault(NO_FIBER, thrownFault(e, -1, -1));
      }
      this.ctx.currentCallSiteId = previousCallSiteId;
      this.ctx.currentRuleFuncId = previousRuleFuncId;
    }

    /** Deactivate the active page: cancel its fibers and drop its root rules. */
    private deactivateCurrentPage(): void {
      this.cancelActiveFibers();
      this.activeRules = [];
      this.ctx.currentCallSiteId = NO_CALL_SITE;
      this.ctx.currentRuleFuncId = NO_RULE;
    }

    /**
     * Cancel every fiber of the active page: each root rule's own fiber, then
     * the cascade over every live child-rule fiber spawned beneath them.
     */
    private cancelActiveFibers(): void {
      for (let i = 0; i < this.activeRules.length; i++) {
        const fiberId = this.activeRules[i].fiberId;
        if (fiberId >= 0) {
          this.scheduler.cancel(fiberId);
        }
      }
      this.scheduler.cancelChildRuleFibers();
    }

    private isValidPageIndex(pageIndex: number): boolean {
      return pageIndex >= 0 && pageIndex < this.program.pages.length;
    }

    private isRuleFiringOver(fiberId: number): boolean {
      if (fiberId < 0) {
        return true;
      }
      const fiber = this.scheduler.getFiber(fiberId);
      if (!fiber) {
        return true;
      }
      return (
        fiber.state === FiberState.Done || fiber.state === FiberState.Fault || fiber.state === FiberState.Cancelled
      );
    }
  }
}
