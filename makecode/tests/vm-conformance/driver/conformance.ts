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
 * harness to replay the shared conformance corpus: the target-partition
 * host actions and operator overloads listed below, over a world that
 * owns no clock and no random stream, so two runs of one program over one
 * schedule observe the same world.
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
 * - `emit text(value)` -- synchronous actuator whose argument slot is
 *   String-typed, returning its argument, so a string value lands in the
 *   trace's argument and result positions.
 * - `emit flag(value)` -- synchronous actuator whose argument slot is
 *   Boolean-typed, returning its argument, so a boolean value lands in the
 *   trace's argument and result positions.
 * - `lhs defer plus rhs` -- asynchronous infix operator whose handle resolves
 *   to the sum one tick after its dispatch, so the expression containing it
 *   suspends until then. An operand carrying no number, and a sum that is not
 *   a number, both resolve nil.
 * - `defer point()` -- asynchronous sensor whose handle resolves to a fresh
 *   `Point` struct reading `{x: 1.5, y: 2.25}` exactly one tick after its
 *   dispatch. The struct is constructed at settle time, immediately before
 *   the handle resolves. `Point` is the profile's closed struct type, with
 *   fields `x` and `y` at field ids 0 and 1.
 * - `defer anchor()` -- asynchronous sensor whose handle resolves to a fresh
 *   `Anchor` value one tick after its dispatch, constructed at settle time
 *   over the world's one anchor host object. `Anchor` is native-backed: its
 *   field getter and setter read and write that host object, and a deep copy
 *   shares it by reference, so every copy aliases one anchor.
 * - `defer target()` -- asynchronous sensor whose handle resolves to a fresh
 *   `Target` value one tick after its dispatch, backed by a lazy resolver
 *   over the world's call-counting target resolution. `Target` registers
 *   `snapshotNative`: an assignment materializes the resolver to the concrete
 *   host object it resolves to, while the field getter resolves on every read
 *   of an unassigned value.
 * - `emit all(value...)` -- synchronous actuator returning void, whose one
 *   argument slot is a repeated value slot: compiled brain code gathers the
 *   tiles filling it, in source order, into one list value and passes the
 *   list in the dispatch's argument position.
 *
 * The profile also registers its three struct types -- `Point` (closed),
 * `Anchor`, and `Target` -- so every corpus program's TYPS atom entries
 * resolve at load. The profile's `Mode` enum type is program-local: its
 * symbols travel in each program's own type table, so the replay registers
 * nothing for it.
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
    EmitText = 1033,
    EmitFlag = 1034,
    DeferPoint = 1035,
    DeferAnchor = 1036,
    DeferTarget = 1037,
    EmitAll = 1038,
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

  /** `x` field value the world's anchor host object starts with; exactly representable at f32. */
  const CONFORMANCE_ANCHOR_X = 1.5;

  /** `y` field value the world's anchor host object starts with; exactly representable at f32. */
  const CONFORMANCE_ANCHOR_Y = 2.25;

  /** `value` of the target host object the first resolution returns; exactly representable at f32. */
  const CONFORMANCE_TARGET_FIRST_VALUE = 1.5;

  /** `value` of the target host object every later resolution returns; exactly representable at f32. */
  const CONFORMANCE_TARGET_LATER_VALUE = 8.5;

  /** The mutable host object behind every `Anchor` value of one world. */
  export class ConformanceAnchor {
    /** Current `x` field value. */
    x: number;
    /** Current `y` field value. */
    y: number;

    constructor(x: number, y: number) {
      this.x = x;
      this.y = y;
    }
  }

  /** One host object a `Target` resolution returns. */
  export class ConformanceTarget {
    /** The object's `value` field. */
    value: number;

    constructor(value: number) {
      this.value = value;
    }
  }

  /**
   * The deterministic world the conformance host actions run against: the
   * pending deferred settlements, the anchor host object, and the
   * call-counting target resolution.
   *
   * Attach an instance as the brain runtime's context data, and call
   * {@link ConformanceWorld.settleDue} with the ordinal of the think that is
   * about to run, before running it.
   */
  export class ConformanceWorld extends HostWorld {
    private pending: DeferredSettlement[] = [];
    private anchorObject: ConformanceAnchor;
    private firstTarget: ConformanceTarget;
    private laterTarget: ConformanceTarget;
    private targetResolutions: number;

    constructor() {
      super();
      this.anchorObject = new ConformanceAnchor(CONFORMANCE_ANCHOR_X, CONFORMANCE_ANCHOR_Y);
      this.firstTarget = new ConformanceTarget(CONFORMANCE_TARGET_FIRST_VALUE);
      this.laterTarget = new ConformanceTarget(CONFORMANCE_TARGET_LATER_VALUE);
      this.targetResolutions = 0;
    }

    /** The world's one `Anchor` host object; every `defer anchor` reading is backed by it. */
    anchor(): ConformanceAnchor {
      return this.anchorObject;
    }

    /**
     * Resolve the current `Target` host object, counting the call: the first
     * resolution of the run returns the first object, every later one the
     * later object.
     */
    resolveTarget(): ConformanceTarget {
      this.targetResolutions++;
      return this.targetResolutions === 1 ? this.firstTarget : this.laterTarget;
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

  /** `emit text(value)`: returns its String-typed argument slot unchanged. */
  class EmitTextActuator extends HostActionBinding {
    constructor() {
      super(ConformanceActionId.EmitText, "actuator.conformance.emit-text", false);
    }

    execSync(ctx: ExecutionContext, args: Value[]): Value {
      return args.length > 0 ? args[0] : NIL_VALUE;
    }
  }

  /** `emit flag(value)`: returns its Boolean-typed argument slot unchanged. */
  class EmitFlagActuator extends HostActionBinding {
    constructor() {
      super(ConformanceActionId.EmitFlag, "actuator.conformance.emit-flag", false);
    }

    execSync(ctx: ExecutionContext, args: Value[]): Value {
      return args.length > 0 ? args[0] : NIL_VALUE;
    }
  }

  /** TypeId of the conformance profile's `Point` struct type. */
  const CONFORMANCE_POINT_TYPE_ID = "struct:<Point>";

  /** `x` field value of every settled `defer point` reading; exactly representable at f32. */
  const CONFORMANCE_POINT_READING_X = 1.5;

  /** `y` field value of every settled `defer point` reading; exactly representable at f32. */
  const CONFORMANCE_POINT_READING_Y = 2.25;

  /** Settles its handle as resolved, carrying a fresh `Point` reading built at settle time. */
  class PointReadingSettlement extends DeferredSettlement {
    private handle: AsyncHandle;

    constructor(handle: AsyncHandle) {
      super(0);
      this.handle = handle;
    }

    settle(): void {
      const fields = [mkNumber(CONFORMANCE_POINT_READING_X), mkNumber(CONFORMANCE_POINT_READING_Y)];
      this.handle.resolve(mkStruct(CONFORMANCE_POINT_TYPE_ID, fields));
    }
  }

  /** `defer point()`: resolves its handle to a fresh `Point` reading one tick after its dispatch. */
  class DeferPointSensor extends HostActionBinding {
    constructor() {
      super(ConformanceActionId.DeferPoint, "sensor.conformance.defer-point", true);
    }

    execAsync(ctx: ExecutionContext, args: Value[], handle: AsyncHandle): void {
      const world = ctx.data as ConformanceWorld;
      world.defer(ctx.currentTick, DEFAULT_WHOLE_TICKS, new PointReadingSettlement(handle));
    }
  }

  /** TypeId of the conformance profile's `Anchor` native struct type. */
  const CONFORMANCE_ANCHOR_TYPE_ID = "struct:<Anchor>";

  /** TypeId of the conformance profile's `Target` native struct type. */
  const CONFORMANCE_TARGET_TYPE_ID = "struct:<Target>";

  /** Stable type-atom id of the `Point` struct type; corpus TYPS entries record it verbatim. */
  const CONFORMANCE_POINT_ATOM_ID = 1024;

  /** Stable type-atom id of the `Anchor` struct type; corpus TYPS entries record it verbatim. */
  const CONFORMANCE_ANCHOR_ATOM_ID = 1025;

  /** Stable type-atom id of the `Target` struct type; corpus TYPS entries record it verbatim. */
  const CONFORMANCE_TARGET_ATOM_ID = 1026;

  /** Field id of the `Anchor` type's `x` field. */
  const CONFORMANCE_ANCHOR_FIELD_X = 0;

  /** Field id of the `Anchor` type's `y` field. */
  const CONFORMANCE_ANCHOR_FIELD_Y = 1;

  /** Field id of the `Target` type's `value` field. */
  const CONFORMANCE_TARGET_FIELD_VALUE = 0;

  /**
   * Lazy native handle of an unassigned `Target` value: resolves to the host
   * object the value currently designates, through the world's call-counting
   * resolution. `snapshotNative` materializes it to the concrete
   * {@link ConformanceTarget} at assignment.
   */
  export class TargetResolver {
    private world: ConformanceWorld;

    constructor(world: ConformanceWorld) {
      this.world = world;
    }

    /** The host object the world's target resolution currently designates. */
    resolve(): ConformanceTarget {
      return this.world.resolveTarget();
    }
  }

  /**
   * The host object a `Target` value designates: a resolver native is
   * resolved, a direct object reference passes through, and a value carrying
   * no native designates nothing.
   */
  // biome-ignore lint/suspicious/noExplicitAny: pxt's static subset has no unknown type.
  function resolveConformanceTarget(native: any): ConformanceTarget {
    if (!native) {
      return undefined;
    }
    if (native instanceof TargetResolver) {
      return (native as TargetResolver).resolve();
    }
    return native as ConformanceTarget;
  }

  /** The `Anchor` type: field hooks into the world's anchor host object, native shared by reference. */
  class AnchorTypeBinding extends StructTypeBinding {
    constructor() {
      super(CONFORMANCE_ANCHOR_TYPE_ID, CONFORMANCE_ANCHOR_ATOM_ID);
      this.hasFieldGetter = true;
      this.hasFieldSetter = true;
    }

    fieldGetter(source: Value, fieldId: number, ctx: ExecutionContext): Value {
      const anchor = source.native as ConformanceAnchor;
      if (!anchor) {
        return undefined;
      }
      if (fieldId === CONFORMANCE_ANCHOR_FIELD_X) {
        return mkNumber(anchor.x);
      }
      if (fieldId === CONFORMANCE_ANCHOR_FIELD_Y) {
        return mkNumber(anchor.y);
      }
      return undefined;
    }

    fieldSetter(source: Value, fieldId: number, value: Value, ctx: ExecutionContext): boolean {
      const anchor = source.native as ConformanceAnchor;
      if (!anchor || value.t !== ValueTag.Number) {
        return false;
      }
      if (fieldId === CONFORMANCE_ANCHOR_FIELD_X) {
        anchor.x = value.num;
        return true;
      }
      if (fieldId === CONFORMANCE_ANCHOR_FIELD_Y) {
        anchor.y = value.num;
        return true;
      }
      return false;
    }
  }

  /** The `Target` type: a resolver-reading field getter and the snapshot that pins a resolution. */
  class TargetTypeBinding extends StructTypeBinding {
    constructor() {
      super(CONFORMANCE_TARGET_TYPE_ID, CONFORMANCE_TARGET_ATOM_ID);
      this.hasFieldGetter = true;
      this.hasSnapshotNative = true;
    }

    fieldGetter(source: Value, fieldId: number, ctx: ExecutionContext): Value {
      const target = resolveConformanceTarget(source.native);
      if (!target) {
        return undefined;
      }
      if (fieldId === CONFORMANCE_TARGET_FIELD_VALUE) {
        return mkNumber(target.value);
      }
      return undefined;
    }

    // biome-ignore lint/suspicious/noExplicitAny: pxt's static subset has no unknown type.
    snapshotNative(source: Value, ctx: ExecutionContext): any {
      const native = source.native;
      if (!native) {
        return native;
      }
      if (native instanceof TargetResolver) {
        return (native as TargetResolver).resolve();
      }
      return native;
    }
  }

  /** Settles its handle as resolved, carrying an `Anchor` value built at settle time over the world's anchor. */
  class AnchorReadingSettlement extends DeferredSettlement {
    private handle: AsyncHandle;
    private world: ConformanceWorld;

    constructor(handle: AsyncHandle, world: ConformanceWorld) {
      super(0);
      this.handle = handle;
      this.world = world;
    }

    settle(): void {
      this.handle.resolve(mkNativeStruct(CONFORMANCE_ANCHOR_TYPE_ID, this.world.anchor()));
    }
  }

  /** Settles its handle as resolved, carrying a `Target` value backed by a fresh resolver built at settle time. */
  class TargetReadingSettlement extends DeferredSettlement {
    private handle: AsyncHandle;
    private world: ConformanceWorld;

    constructor(handle: AsyncHandle, world: ConformanceWorld) {
      super(0);
      this.handle = handle;
      this.world = world;
    }

    settle(): void {
      this.handle.resolve(mkNativeStruct(CONFORMANCE_TARGET_TYPE_ID, new TargetResolver(this.world)));
    }
  }

  /** `defer anchor()`: resolves its handle to a fresh `Anchor` value one tick after its dispatch. */
  class DeferAnchorSensor extends HostActionBinding {
    constructor() {
      super(ConformanceActionId.DeferAnchor, "sensor.conformance.defer-anchor", true);
    }

    execAsync(ctx: ExecutionContext, args: Value[], handle: AsyncHandle): void {
      const world = ctx.data as ConformanceWorld;
      world.defer(ctx.currentTick, DEFAULT_WHOLE_TICKS, new AnchorReadingSettlement(handle, world));
    }
  }

  /** `defer target()`: resolves its handle to a fresh resolver-backed `Target` value one tick after its dispatch. */
  class DeferTargetSensor extends HostActionBinding {
    constructor() {
      super(ConformanceActionId.DeferTarget, "sensor.conformance.defer-target", true);
    }

    execAsync(ctx: ExecutionContext, args: Value[], handle: AsyncHandle): void {
      const world = ctx.data as ConformanceWorld;
      world.defer(ctx.currentTick, DEFAULT_WHOLE_TICKS, new TargetReadingSettlement(handle, world));
    }
  }

  /** `emit all(value...)`: receives its repeated value slot's arguments as one gathered list; returns void. */
  class EmitAllActuator extends HostActionBinding {
    constructor() {
      super(ConformanceActionId.EmitAll, "actuator.conformance.emit-all", false);
    }

    execSync(ctx: ExecutionContext, args: Value[]): Value {
      return VOID_VALUE;
    }
  }

  /**
   * Register the conformance host profile's struct types into `registry`:
   * the closed `Point` type and the native-backed `Anchor` and `Target`
   * types. Every corpus program's TYPS atom entries resolve against these
   * three registrations.
   *
   * @param registry - Struct type registry the corpus program loads and dispatches against.
   */
  export function registerConformanceStructTypes(registry: StructTypeRegistry): void {
    registry.register(new StructTypeBinding(CONFORMANCE_POINT_TYPE_ID, CONFORMANCE_POINT_ATOM_ID));
    registry.register(new AnchorTypeBinding());
    registry.register(new TargetTypeBinding());
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
   * Register the conformance host profile's actions into `registry`.
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
    registry.register(new EmitTextActuator());
    registry.register(new EmitFlagActuator());
    registry.register(new DeferPointSensor());
    registry.register(new DeferAnchorSensor());
    registry.register(new DeferTargetSensor());
    registry.register(new EmitAllActuator());
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
    const types = new StructTypeRegistry();
    registerConformanceStructTypes(types);
    const decoded = decodeProgramHex(programHex, types);
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
      types,
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
