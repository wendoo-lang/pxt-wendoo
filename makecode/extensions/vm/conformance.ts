/**
 * The conformance host profile and the corpus replay driver.
 *
 * The profile is the host surface every Wendoo VM implements in its test
 * harness to replay the shared conformance corpus: five target-partition host
 * actions over a world that owns no clock and no random stream, so two runs of
 * one program over one schedule observe the same world.
 *
 * - `echo(value)` -- synchronous sensor returning its argument unchanged.
 * - `emit(value)` -- synchronous actuator returning void, the corpus's
 *   observable output channel.
 * - `defer echo(value, ticks)` -- asynchronous actuator whose handle resolves
 *   to `value` exactly `ticks` ticks after its dispatch.
 * - `defer fail(ticks)` -- asynchronous actuator whose handle rejects with
 *   `HostError` exactly `ticks` ticks after its dispatch.
 * - `fault()` -- synchronous actuator that faults the calling fiber with
 *   `ScriptError`.
 */
namespace wendoo {
  /** Numeric device-profile id every corpus binary envelope and trace header carries. */
  export const CONFORMANCE_PROFILE_ID = 1000;

  /** Per-slice instruction budget the corpus is minted under. */
  const CONFORMANCE_DEFAULT_BUDGET = 1000;

  /** Operand-stack cap the corpus is minted under. */
  const CONFORMANCE_MAX_STACK_SIZE = 256;

  /** Concurrent pending-handle cap the corpus is minted under. */
  const CONFORMANCE_MAX_HANDLES = 8;

  /** Ticks a deferred call waits when its `ticks` slot carries no number. */
  const DEFAULT_DEFER_TICKS = 1;

  /** Classifier `defer fail` rejects its handle with. */
  const DEFER_FAIL_CODE = ErrorCode.HostError;

  /**
   * Stable action ids of the conformance host profile, allocated from the
   * target partition core reserves at id 1024. Serialized programs record
   * these verbatim.
   */
  export enum ConformanceActionId {
    Echo = 1024,
    Emit = 1025,
    DeferEcho = 1026,
    DeferFail = 1027,
    Fault = 1028,
  }

  /**
   * One deferred settlement the world owes. Subclass and override
   * {@link DeferredSettlement.settle} to settle the handle its deferred call
   * was dispatched on.
   */
  export class DeferredSettlement {
    /** Tick ordinal at which the settlement is due. */
    dueTick: number;

    constructor(dueTick: number) {
      this.dueTick = dueTick;
    }

    /** Settle the handle the deferred call was dispatched on. */
    settle(): void {}
  }

  /**
   * The deterministic world the conformance host actions run against: the
   * pending deferred settlements and nothing else.
   *
   * Attach an instance as the brain runtime's context data, and call
   * {@link ConformanceWorld.settleDue} with the ordinal of the think that is
   * about to run, before running it.
   */
  export class ConformanceWorld extends HostWorld {
    private pending: DeferredSettlement[] = [];

    constructor() {
      super();
    }

    /**
     * Settle every deferred call due at or before `tick`, oldest dispatch
     * first. Call it immediately before the think of ordinal `tick`, so a
     * fiber parked on a settled handle resumes within that think.
     *
     * @param tick - 1-based ordinal of the think about to run.
     */
    settleDue(tick: number): void {
      const due: DeferredSettlement[] = [];
      const held: DeferredSettlement[] = [];
      for (let i = 0; i < this.pending.length; i++) {
        if (this.pending[i].dueTick <= tick) {
          due.push(this.pending[i]);
        } else {
          held.push(this.pending[i]);
        }
      }
      this.pending = held;
      for (let i = 0; i < due.length; i++) {
        due[i].settle();
      }
    }

    /**
     * Record a settlement due `ticks` thinks after the think of ordinal
     * `dispatchTick`.
     *
     * @param dispatchTick - Ordinal of the think the deferred call was dispatched on.
     * @param ticks - Whole ticks between the dispatch and the settlement.
     * @param settlement - The settlement to run when it comes due.
     */
    defer(dispatchTick: number, ticks: number, settlement: DeferredSettlement): void {
      settlement.dueTick = dispatchTick + ticks;
      this.pending.push(settlement);
    }
  }

  /** `echo(value)`: returns its single argument slot unchanged. */
  class EchoSensor extends HostActionBinding {
    constructor() {
      super(ConformanceActionId.Echo, "sensor.conformance.echo", false);
    }

    execSync(ctx: ExecutionContext, args: Value[]): Value {
      return args.length > 0 ? args[0] : NIL_VALUE;
    }
  }

  /** `emit(value)`: the corpus's observable output channel; returns void. */
  class EmitActuator extends HostActionBinding {
    constructor() {
      super(ConformanceActionId.Emit, "actuator.conformance.emit", false);
    }

    execSync(ctx: ExecutionContext, args: Value[]): Value {
      return VOID_VALUE;
    }
  }

  /** Settles its handle as resolved, carrying the value its dispatch supplied. */
  class ResolveSettlement extends DeferredSettlement {
    private handle: AsyncHandle;
    private value: Value;

    constructor(handle: AsyncHandle, value: Value) {
      super(0);
      this.handle = handle;
      this.value = value;
    }

    settle(): void {
      this.handle.resolve(this.value);
    }
  }

  /** Settles its handle as rejected, carrying the classifier its dispatch supplied. */
  class RejectSettlement extends DeferredSettlement {
    private handle: AsyncHandle;
    private errorCode: ErrorCode;

    constructor(handle: AsyncHandle, errorCode: ErrorCode) {
      super(0);
      this.handle = handle;
      this.errorCode = errorCode;
    }

    settle(): void {
      this.handle.reject(this.errorCode);
    }
  }

  /**
   * Whole-tick count carried by the argument in `slot`, or
   * {@link DEFAULT_DEFER_TICKS} when the slot carries no number.
   */
  function ticksArg(args: Value[], slot: number): number {
    if (slot >= args.length || args[slot].t !== ValueTag.Number) {
      return DEFAULT_DEFER_TICKS;
    }
    return args[slot].num;
  }

  /** `defer echo(value, ticks)`: resolves its handle to `value` after `ticks` ticks. */
  class DeferEchoActuator extends HostActionBinding {
    constructor() {
      super(ConformanceActionId.DeferEcho, "actuator.conformance.defer-echo", true);
    }

    execAsync(ctx: ExecutionContext, args: Value[], handle: AsyncHandle): void {
      const value = args.length > 0 ? args[0] : NIL_VALUE;
      const world = ctx.data as ConformanceWorld;
      world.defer(ctx.currentTick, ticksArg(args, 1), new ResolveSettlement(handle, value));
    }
  }

  /** `defer fail(ticks)`: rejects its handle with `HostError` after `ticks` ticks. */
  class DeferFailActuator extends HostActionBinding {
    constructor() {
      super(ConformanceActionId.DeferFail, "actuator.conformance.defer-fail", true);
    }

    execAsync(ctx: ExecutionContext, args: Value[], handle: AsyncHandle): void {
      const world = ctx.data as ConformanceWorld;
      world.defer(ctx.currentTick, ticksArg(args, 0), new RejectSettlement(handle, DEFER_FAIL_CODE));
    }
  }

  /** `fault()`: faults the calling fiber with `ScriptError`. */
  class FaultActuator extends HostActionBinding {
    constructor() {
      super(ConformanceActionId.Fault, "actuator.conformance.fault", false);
    }

    execSync(ctx: ExecutionContext, args: Value[]): Value {
      ctx.raise(ErrorCode.ScriptError, "conformance fault");
      return NIL_VALUE;
    }
  }

  /**
   * Register the conformance host profile's five actions into `registry`.
   *
   * @param registry - Host-action registry the corpus program dispatches against.
   */
  export function registerConformanceHostActions(registry: HostActionRegistry): void {
    registry.register(new EchoSensor());
    registry.register(new EmitActuator());
    registry.register(new DeferEchoActuator());
    registry.register(new DeferFailActuator());
    registry.register(new FaultActuator());
  }

  /** Line that closes the trace body of a replayed case. */
  export const CONFORMANCE_TRACE_END = "SIMCAP TRACE-END";

  /**
   * Replay one corpus case and write its observable trace to the console,
   * bracketed by the capture harness's case markers. Diagnostics about where
   * the run stopped follow the trace body, after
   * {@link CONFORMANCE_TRACE_END}.
   *
   * @param caseId - Manifest id of the case, as the capture harness expects it.
   * @param programHex - The case's binary program artifact, as hexadecimal digit pairs.
   * @param schedule - Tick advances in milliseconds, one think per entry.
   */
  export function runConformanceCase(caseId: string, programHex: string, schedule: number[]): void {
    console.log(`SIMCAP START ${caseId}`);
    const decoded = decodeProgramHex(programHex);
    if (decoded.errorCode.length > 0) {
      console.log(CONFORMANCE_TRACE_END);
      console.log(`DIAG decode-failed ${decoded.errorCode}`);
      console.log(`SIMCAP PASS ${caseId}`);
      return;
    }

    const sink = new ConsoleTraceSink();
    const writer = new ObservableTraceWriter(sink, decoded.profileId);

    const hostFunctions = new HostFunctionRegistry();
    registerCoreHostFunctions(hostFunctions);
    const hostActions = new HostActionRegistry();
    registerCoreHostActions(hostActions);
    registerConformanceHostActions(hostActions);

    const world = new ConformanceWorld();
    const runtime = new BrainRuntime(
      decoded.program,
      hostFunctions,
      hostActions,
      new TraceTap(writer),
      new VmCaps(CONFORMANCE_DEFAULT_BUDGET, CONFORMANCE_MAX_STACK_SIZE, CONFORMANCE_MAX_HANDLES),
      world
    );
    runtime.startup();

    let lastThinkTimeMs = 0;
    for (let i = 0; i < schedule.length; i++) {
      const ordinal = i + 1;
      const timeMs = lastThinkTimeMs + schedule[i];
      writer.tick(ordinal, timeMs, lastThinkTimeMs === 0 ? 0 : timeMs - lastThinkTimeMs);
      world.settleDue(ordinal);
      runtime.think(timeMs);
      lastThinkTimeMs = timeMs;
    }

    console.log(CONFORMANCE_TRACE_END);
    if (decoded.profileId !== CONFORMANCE_PROFILE_ID) {
      console.log(`DIAG profile-mismatch ${hexU32(decoded.profileId)}`);
    }
    const faults = runtime.faults();
    for (let i = 0; i < faults.length; i++) {
      const fault = faults[i];
      console.log(`DIAG fault code=${fault.code} func=${fault.funcId} pc=${fault.pc} ${fault.message}`);
    }
    console.log(`SIMCAP PASS ${caseId}`);
  }
}
