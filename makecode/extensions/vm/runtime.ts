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
    private vm: VM;
    private scheduler: FiberScheduler;
    private ctx: ExecutionContext;
    private lastThinkTime: number = 0;
    private activeRules: ActiveRule[] = [];

    /**
     * @param program - The decoded, linked program to run.
     * @param hostFunctions - Host functions the program's `HOST_CALL` operands resolve against.
     * @param hostActions - Host actions the program's `HOST_ACTION_CALL` operands resolve against.
     * @param observer - Passive observer of the run's visible effects.
     * @param caps - Per-fiber and per-round capacity caps.
     * @param world - Opaque per-run payload the host profile attaches to the context.
     */
    constructor(
      program: Program,
      hostFunctions: HostFunctionRegistry,
      hostActions: HostActionRegistry,
      observer: VmObserver,
      caps: VmCaps,
      world: HostWorld
    ) {
      this.program = program;
      const variables = new VariableStore();
      variables.install(program);
      this.vm = new VM(program, hostFunctions, hostActions, observer, caps);
      this.scheduler = new FiberScheduler(this.vm, caps);
      const services = new BrainServices(program, new SchedulerRuleLiveness(this.scheduler));
      this.ctx = new ExecutionContext(services, variables, world);
    }

    /** Every fault the VM raised during this run, in the order it raised them. */
    faults(): VmFault[] {
      return this.vm.faults;
    }

    /** Activate the first page and spawn a fiber for each of its root rules. */
    startup(): void {
      this.lastThinkTime = 0;
      if (this.program.pages.length === 0) {
        return;
      }
      this.activatePage(0);
    }

    /**
     * Advance the brain by one tick: resume the fibers whose handles settled
     * since the last think, respawn every root rule whose firing has ended and
     * whose subtree has emptied, then run one scheduler round.
     *
     * @param currentTime - Cumulative scheduled time of this think.
     */
    think(currentTime: number): void {
      if (this.program.pages.length === 0) {
        return;
      }
      this.scheduler.drainCompletedHandles();

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
      this.lastThinkTime = currentTime;
    }

    private activatePage(pageIndex: number): void {
      const page = this.program.pages[pageIndex];
      this.activeRules = [];
      this.ctx.currentCallSiteId = NO_CALL_SITE;
      this.ctx.currentRuleFuncId = NO_RULE;
      for (let i = 0; i < page.rootRuleFuncIds.length; i++) {
        const entry = new ActiveRule(page.rootRuleFuncIds[i]);
        entry.fiberId = this.scheduler.spawn(entry.funcId, this.ctx);
        this.activeRules.push(entry);
      }
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
