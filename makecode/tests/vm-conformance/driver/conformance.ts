/*
 * Test-only surface: `gen-cases.js` copies this file into every generated case
 * project and lists it in that project's `pxt.json`, because pxt's `testFiles`
 * compile only when their package is the top-level project and a generated case
 * project consumes the extension as a dependency.
 */

/**
 * The conformance host profile and the corpus replay driver.
 *
 * The profile is the host surface every Wendoo VM implements in its test
 * harness to replay the shared conformance corpus: nine target-partition host
 * actions and one target-partition operator overload over a world that owns no
 * clock and no random stream, so two runs of one program over one schedule
 * observe the same world.
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
 * - `signal(period)` -- synchronous presence-gated sensor delivering the
 *   number `0` on every think whose ordinal is a multiple of `period`, and nil
 *   on every other think.
 * - `counter()` -- synchronous sensor returning how many times it has been
 *   read at its own call site since that call site's page was last activated.
 *   Call sites count independently, and a page restart leaves the count
 *   standing.
 * - `defer cancel(ticks)` -- asynchronous actuator whose handle is cancelled
 *   exactly `ticks` ticks after its dispatch.
 * - `defer read(value, ticks)` -- asynchronous sensor whose handle resolves to
 *   `value` exactly `ticks` ticks after its dispatch, so a section reading it
 *   suspends until then.
 * - `lhs defer plus rhs` -- asynchronous infix operator whose handle resolves
 *   to the sum one tick after its dispatch, so the expression containing it
 *   suspends until then. An operand carrying no number, and a sum that is not
 *   a number, both resolve nil.
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

  /** Whole-tick count a deferred call waits, or a signal's period, when the argument carries none. */
  const DEFAULT_WHOLE_TICKS = 1;

  /** Classifier `defer fail` rejects its handle with. */
  const DEFER_FAIL_CODE = ErrorCode.HostError;

  /** Falsy value `signal` delivers on a tick it is present. */
  const SIGNAL_VALUE = mkNumber(0);

  /** Count `counter` holds at a call site its activation hook has just reset; its first read returns one more. */
  const COUNTER_START = 0;

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
    Signal = 1029,
    Counter = 1030,
    DeferCancel = 1031,
    DeferRead = 1032,
  }

  /**
   * Stable funcIds of the conformance host profile's operator overloads,
   * continuing the target partition offsets {@link ConformanceActionId}
   * allocates from. Serialized programs record these verbatim.
   */
  export enum ConformanceFuncId {
    DeferAdd = 1033,
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
   * {@link DEFAULT_WHOLE_TICKS} when the slot carries no number.
   */
  function wholeTicksArg(args: Value[], slot: number): number {
    if (slot >= args.length || args[slot].t !== ValueTag.Number) {
      return DEFAULT_WHOLE_TICKS;
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
      world.defer(ctx.currentTick, wholeTicksArg(args, 1), new ResolveSettlement(handle, value));
    }
  }

  /** `defer fail(ticks)`: rejects its handle with `HostError` after `ticks` ticks. */
  class DeferFailActuator extends HostActionBinding {
    constructor() {
      super(ConformanceActionId.DeferFail, "actuator.conformance.defer-fail", true);
    }

    execAsync(ctx: ExecutionContext, args: Value[], handle: AsyncHandle): void {
      const world = ctx.data as ConformanceWorld;
      world.defer(ctx.currentTick, wholeTicksArg(args, 0), new RejectSettlement(handle, DEFER_FAIL_CODE));
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
   * `signal(period)`: delivers {@link SIGNAL_VALUE} on every think whose
   * ordinal is a multiple of `period`, and nil on every other think.
   */
  class SignalSensor extends HostActionBinding {
    constructor() {
      super(ConformanceActionId.Signal, "sensor.conformance.signal", false);
    }

    execSync(ctx: ExecutionContext, args: Value[]): Value {
      const period = wholeTicksArg(args, 0);
      return ctx.currentTick % period === 0 ? SIGNAL_VALUE : NIL_VALUE;
    }
  }

  /**
   * `counter()`: how many times this call site has been read since its page
   * was last activated. Call sites count independently; only page activation
   * resets the count.
   */
  class CounterSensor extends HostActionBinding {
    constructor() {
      super(ConformanceActionId.Counter, "sensor.conformance.counter", false);
    }

    onPageEntered(ctx: ExecutionContext): void {
      ctx.services.callsite.setHostState(ctx.currentCallSiteId, mkNumber(COUNTER_START));
    }

    execSync(ctx: ExecutionContext, args: Value[]): Value {
      const stored = ctx.services.callsite.getHostState(ctx.currentCallSiteId);
      const count = stored && stored.t === ValueTag.Number ? stored.num : COUNTER_START;
      const next = mkNumber(count + 1);
      ctx.services.callsite.setHostState(ctx.currentCallSiteId, next);
      return next;
    }
  }

  /** Settles its handle as cancelled. */
  class CancelSettlement extends DeferredSettlement {
    private handle: AsyncHandle;

    constructor(handle: AsyncHandle) {
      super(0);
      this.handle = handle;
    }

    settle(): void {
      this.handle.cancel();
    }
  }

  /** `defer cancel(ticks)`: cancels its handle after `ticks` ticks. */
  class DeferCancelActuator extends HostActionBinding {
    constructor() {
      super(ConformanceActionId.DeferCancel, "actuator.conformance.defer-cancel", true);
    }

    execAsync(ctx: ExecutionContext, args: Value[], handle: AsyncHandle): void {
      const world = ctx.data as ConformanceWorld;
      world.defer(ctx.currentTick, wholeTicksArg(args, 0), new CancelSettlement(handle));
    }
  }

  /** `defer read(value, ticks)`: resolves its handle to `value` after `ticks` ticks. */
  class DeferReadSensor extends HostActionBinding {
    constructor() {
      super(ConformanceActionId.DeferRead, "sensor.conformance.defer-read", true);
    }

    execAsync(ctx: ExecutionContext, args: Value[], handle: AsyncHandle): void {
      const value = args.length > 0 ? args[0] : NIL_VALUE;
      const world = ctx.data as ConformanceWorld;
      world.defer(ctx.currentTick, wholeTicksArg(args, 1), new ResolveSettlement(handle, value));
    }
  }

  /**
   * Whether `args[slot]` carries a number that is not a NaN. A slot past the
   * end of the buffer, a slot of another kind, and a NaN all read false.
   */
  function isValidNumberArg(args: Value[], slot: number): boolean {
    return slot < args.length && args[slot].t === ValueTag.Number && !isNotANumber(args[slot].num);
  }

  /** The sum of a binary operator's two operand slots; nil when an operand or the sum is not a number. */
  function operandSum(args: Value[]): Value {
    if (!isValidNumberArg(args, 0) || !isValidNumberArg(args, 1)) {
      return NIL_VALUE;
    }
    const sum = args[0].num + args[1].num;
    return isNotANumber(sum) ? NIL_VALUE : mkNumber(sum);
  }

  /** `lhs defer plus rhs`: resolves its handle to the sum one tick after its dispatch. */
  class DeferAddOperator extends HostFunction {
    constructor() {
      super(ConformanceFuncId.DeferAdd);
      this.isAsync = true;
    }

    execAsync(ctx: ExecutionContext, args: Value[], handle: AsyncHandle): void {
      const world = ctx.data as ConformanceWorld;
      world.defer(ctx.currentTick, DEFAULT_WHOLE_TICKS, new ResolveSettlement(handle, operandSum(args)));
    }
  }

  /**
   * Register the conformance host profile's one operator overload into
   * `registry`.
   *
   * @param registry - Host-function registry the corpus program dispatches against.
   */
  export function registerConformanceHostFunctions(registry: HostFunctionRegistry): void {
    registry.register(new DeferAddOperator());
  }

  /**
   * Register the conformance host profile's nine actions into `registry`.
   *
   * @param registry - Host-action registry the corpus program dispatches against.
   */
  export function registerConformanceHostActions(registry: HostActionRegistry): void {
    registry.register(new EchoSensor());
    registry.register(new EmitActuator());
    registry.register(new DeferEchoActuator());
    registry.register(new DeferFailActuator());
    registry.register(new FaultActuator());
    registry.register(new SignalSensor());
    registry.register(new CounterSensor());
    registry.register(new DeferCancelActuator());
    registry.register(new DeferReadSensor());
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
    registerConformanceHostFunctions(hostFunctions);
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
