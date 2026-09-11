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
   * joins the next one.
   */
  export class FiberScheduler {
    private vm: VM;
    private caps: VmCaps;
    private fiberIds: number[] = [];
    private fibers: Fiber[] = [];
    private runQueue: number[] = [];
    private nextFiberId: number = 1;

    constructor(vm: VM, caps: VmCaps) {
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

    /** Execute one round: one budget slice for every fiber queued at entry. */
    tick(): void {
      const roundSize = this.runQueue.length;
      for (let i = 0; i < roundSize; i++) {
        const fiberId = this.runQueue.shift();
        const fiber = this.getFiber(fiberId);
        if (!fiber || fiber.state !== FiberState.Runnable) {
          continue;
        }
        fiber.instrBudget = this.caps.defaultBudget;
        if (this.vm.runFiber(fiber) === VmStatus.Yielded) {
          this.enqueue(fiberId);
        }
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

    private enqueue(fiberId: number): void {
      for (let i = 0; i < this.runQueue.length; i++) {
        if (this.runQueue[i] === fiberId) {
          return;
        }
      }
      this.runQueue.push(fiberId);
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
      this.ctx = new ExecutionContext(new BrainServices(program), variables, world);
      this.vm = new VM(program, hostFunctions, hostActions, observer, caps);
      this.scheduler = new FiberScheduler(this.vm, caps);
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
     * Advance the brain by one tick: respawn every root rule whose firing
     * has ended, then run one scheduler round.
     *
     * @param currentTime - Cumulative scheduled time of this think.
     */
    think(currentTime: number): void {
      if (this.program.pages.length === 0) {
        return;
      }
      this.ctx.time = currentTime;
      this.ctx.dt = this.lastThinkTime === 0 ? 0 : currentTime - this.lastThinkTime;
      this.ctx.currentTick++;

      for (let i = 0; i < this.activeRules.length; i++) {
        const entry = this.activeRules[i];
        if (this.isRuleFiringOver(entry.fiberId)) {
          entry.fiberId = this.scheduler.spawn(entry.funcId, this.ctx);
        }
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
