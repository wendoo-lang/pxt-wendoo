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
 * schedule observe the same world. Every random read of a replay draws from
 * the profile's declared list of numbers, in order.
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
 * - `lhs point plus rhs` -- synchronous infix operator over two `Point`
 *   operands, evaluating to a fresh `Point` carrying the fieldwise sums. An
 *   operand carrying no `Point` reading evaluates nil.
 * - `lhs == rhs` over two `Point` operands -- a synchronous overload the
 *   profile adds to the core `eq` operator. True exactly when both operands
 *   carry `Point` readings whose `x` fields are equal numbers and whose `y`
 *   fields are equal numbers; an operand carrying no `Point` reading, nil
 *   included, compares false.
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
 * - `destroy anchor()` -- synchronous actuator returning void, destroying the
 *   world's one anchor host object. Every `Anchor` value handed out before the
 *   call keeps fronting that object, and from then on the type's field hooks
 *   designate nothing: reads return absent, which the VM renders nil, and
 *   writes are rejected. Every `Marker` value over the object is falsy from
 *   then on.
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
 * - `not a number()` -- synchronous sensor returning the number
 *   not-a-number.
 * - `point outputs()` -- synchronous sensor returning `true`, which on every
 *   run first writes two fresh `Point` structs to its two declared `Point`
 *   outputs: `{x: 5.5, y: -1.5}` to `open`, whose value a brain may write a
 *   field through, and `{x: 6.25, y: 0.75}` to `sealed`, whose value is
 *   read-only. Each output's tile reads the struct in the sensor's rule and
 *   the rules below it.
 * - `marker()` -- synchronous sensor returning a fresh `Marker` value over the
 *   world's one anchor host object. `Marker` (field `x`, read-only) is a
 *   second native-backed view of that object, and the profile's one type
 *   declaring an existence hook: the hook reports whether the world has
 *   destroyed the object, so after `destroy anchor` every `Marker` value is
 *   falsy. Its field getter reads `x` off the object whether or not it was
 *   destroyed.
 *
 * The profile also registers its four struct types -- `Point` (closed),
 * `Anchor`, `Target`, and `Marker` -- so every corpus program's TYPS atom entries
 * resolve at load. The profile's `Mode` enum type is program-local: its
 * symbols travel in each program's own type table, so the replay registers
 * nothing for it.
 *
 * Every registration above is made by name from this file's top-level code,
 * through the pack surface, and the ids the corpus pins are recorded in the
 * profile's own name-to-id mapping; replaying a case drains that mapping into
 * the registries before it decodes the program, then publishes the profile's
 * catalog. Each registration also carries its declared shape -- kind,
 * argument slots, returns, label -- and `runConformanceCatalog` serializes
 * the profile's catalog from it for the harness to assert.
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
    DestroyAnchor = 1039,
    NotANumber = 1040,
    PointOutputs = 1041,
    Marker = 1042,
  }

  /**
   * Stable funcIds of the conformance host profile's operator overloads,
   * continuing the target partition offsets {@link ConformanceActionId}
   * allocates from. Serialized programs record these verbatim.
   */
  export enum ConformanceFuncId {
    DeferAdd = 1033,
    PointAdd = 1041,
    PointEqual = 1044,
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

  /**
   * The numbers a replay's random stream yields, in order, starting over from
   * the first once the last has been drawn. Every draw lies in [0, 1) and is
   * exactly representable at f32.
   */
  const CONFORMANCE_RANDOM_DRAWS = [0.25, 0.875, 0, 0.5, 0.0625];

  /**
   * The random stream every random read of a replay draws from: the
   * {@link CONFORMANCE_RANDOM_DRAWS} in order, cycling. A fresh instance
   * starts at the first draw.
   */
  class ConformanceRandomStream extends RngServices {
    private nextIndex: number;

    constructor() {
      super();
      this.nextIndex = 0;
    }

    /** The next declared draw; advances the stream, wrapping after the last. */
    next(): number {
      const draw = CONFORMANCE_RANDOM_DRAWS[this.nextIndex];
      this.nextIndex = (this.nextIndex + 1) % CONFORMANCE_RANDOM_DRAWS.length;
      return draw;
    }
  }

  /** The mutable host object behind every `Anchor` value of one world. */
  export class ConformanceAnchor {
    /** Current `x` field value. */
    x: number;
    /** Current `y` field value. */
    y: number;
    /** True once the world has destroyed the object; a destroyed anchor designates nothing. */
    destroyed: boolean;

    constructor(x: number, y: number) {
      this.x = x;
      this.y = y;
      this.destroyed = false;
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
     * Destroy the world's one anchor host object. Every `Anchor` value already
     * handed out keeps fronting it, and every field hook of the type then
     * designates nothing; every `Marker` value over it reads as gone to its
     * type's existence hook. Destroying an already destroyed anchor changes
     * nothing.
     */
    destroyAnchor(): void {
      this.anchorObject.destroyed = true;
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
      super(false);
    }

    execSync(ctx: ExecutionContext, args: Value[]): Value {
      return args.length > 0 ? args[0] : NIL_VALUE;
    }
  }

  /** `emit(value)`: the corpus's observable output channel; returns void. */
  class EmitActuator extends HostActionBinding {
    constructor() {
      super(false);
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
      super(true);
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
      super(true);
    }

    execAsync(ctx: ExecutionContext, args: Value[], handle: AsyncHandle): void {
      const world = ctx.data as ConformanceWorld;
      world.defer(ctx.currentTick, wholeTicksArg(args, 0), new RejectSettlement(handle, DEFER_FAIL_CODE));
    }
  }

  /** `fault()`: faults the calling fiber with `ScriptError`. */
  class FaultActuator extends HostActionBinding {
    constructor() {
      super(false);
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
      super(false);
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
      super(false);
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
      super(true);
    }

    execAsync(ctx: ExecutionContext, args: Value[], handle: AsyncHandle): void {
      const world = ctx.data as ConformanceWorld;
      world.defer(ctx.currentTick, wholeTicksArg(args, 0), new CancelSettlement(handle));
    }
  }

  /** `defer read(value, ticks)`: resolves its handle to `value` after `ticks` ticks. */
  class DeferReadSensor extends HostActionBinding {
    constructor() {
      super(true);
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
      super(false);
    }

    execSync(ctx: ExecutionContext, args: Value[]): Value {
      return args.length > 0 ? args[0] : NIL_VALUE;
    }
  }

  /** `emit flag(value)`: returns its Boolean-typed argument slot unchanged. */
  class EmitFlagActuator extends HostActionBinding {
    constructor() {
      super(false);
    }

    execSync(ctx: ExecutionContext, args: Value[]): Value {
      return args.length > 0 ? args[0] : NIL_VALUE;
    }
  }

  /** Wendoo type name of the conformance profile's closed struct type. */
  const POINT_TYPE_NAME = "Point";

  /** TypeId of the conformance profile's `Point` struct type. */
  const CONFORMANCE_POINT_TYPE_ID = structTypeId(POINT_TYPE_NAME);

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
      super(true);
    }

    execAsync(ctx: ExecutionContext, args: Value[], handle: AsyncHandle): void {
      const world = ctx.data as ConformanceWorld;
      world.defer(ctx.currentTick, DEFAULT_WHOLE_TICKS, new PointReadingSettlement(handle));
    }
  }

  /** Wendoo type name of the conformance profile's anchor-backed struct type. */
  const ANCHOR_TYPE_NAME = "Anchor";

  /** Wendoo type name of the conformance profile's resolver-backed struct type. */
  const TARGET_TYPE_NAME = "Target";

  /** TypeId of the conformance profile's `Anchor` native struct type. */
  const CONFORMANCE_ANCHOR_TYPE_ID = structTypeId(ANCHOR_TYPE_NAME);

  /** TypeId of the conformance profile's `Target` native struct type. */
  const CONFORMANCE_TARGET_TYPE_ID = structTypeId(TARGET_TYPE_NAME);

  /** Wendoo type name of the conformance profile's existence-hooked struct type. */
  const MARKER_TYPE_NAME = "Marker";

  /** TypeId of the conformance profile's `Marker` native struct type. */
  const CONFORMANCE_MARKER_TYPE_ID = structTypeId(MARKER_TYPE_NAME);

  /** Stable type-atom id of the `Point` struct type; corpus TYPS entries record it verbatim. */
  const CONFORMANCE_POINT_ATOM_ID = 1024;

  /** Stable type-atom id of the `Anchor` struct type; corpus TYPS entries record it verbatim. */
  const CONFORMANCE_ANCHOR_ATOM_ID = 1025;

  /** Stable type-atom id of the `Target` struct type; corpus TYPS entries record it verbatim. */
  const CONFORMANCE_TARGET_ATOM_ID = 1026;

  /** Stable type-atom id of the `Marker` struct type; corpus TYPS entries record it verbatim. */
  const CONFORMANCE_MARKER_ATOM_ID = 1027;

  /** Field specs of the `Point` type, in declaration order. */
  const POINT_FIELDS = [field("x", TYPE_NUMBER), field("y", TYPE_NUMBER)];

  /** Field specs of the `Anchor` type, in declaration order. */
  const ANCHOR_FIELDS = [field("x", TYPE_NUMBER), field("y", TYPE_NUMBER)];

  /** Field specs of the `Target` type, in declaration order. */
  const TARGET_FIELDS = [readOnlyField("value", TYPE_NUMBER)];

  /** Field specs of the `Marker` type, in declaration order. */
  const MARKER_FIELDS = [readOnlyField("x", TYPE_NUMBER)];

  /** Hand-assigned field ids of the `Point` type, parallel to {@link POINT_FIELDS}; corpus programs record them verbatim. */
  const POINT_FIELD_IDS = [0, 1];

  /** Hand-assigned field ids of the `Anchor` type, parallel to {@link ANCHOR_FIELDS}; corpus programs record them verbatim. */
  const ANCHOR_FIELD_IDS = [0, 1];

  /** Hand-assigned field ids of the `Target` type, parallel to {@link TARGET_FIELDS}; corpus programs record them verbatim. */
  const TARGET_FIELD_IDS = [0];

  /** Hand-assigned field ids of the `Marker` type, parallel to {@link MARKER_FIELDS}; corpus programs record them verbatim. */
  const MARKER_FIELD_IDS = [0];

  /** Position of the `Anchor` type's `x` field in its declaration, which indexes the binding's field ids. */
  const CONFORMANCE_ANCHOR_FIELD_X = 0;

  /** Position of the `Anchor` type's `y` field in its declaration, which indexes the binding's field ids. */
  const CONFORMANCE_ANCHOR_FIELD_Y = 1;

  /** Position of the `Target` type's `value` field in its declaration, which indexes the binding's field ids. */
  const CONFORMANCE_TARGET_FIELD_VALUE = 0;

  /** Position of the `Marker` type's `x` field in its declaration, which indexes the binding's field ids. */
  const CONFORMANCE_MARKER_FIELD_X = 0;

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

  /**
   * The anchor host object an `Anchor` value designates: nothing when the
   * value carries no native and nothing once the world destroyed the object.
   */
  // biome-ignore lint/suspicious/noExplicitAny: pxt's static subset has no unknown type.
  function resolveConformanceAnchor(native: any): ConformanceAnchor {
    if (!native) {
      return undefined;
    }
    const anchor = native as ConformanceAnchor;
    return anchor.destroyed ? undefined : anchor;
  }

  /** The `Anchor` type: field hooks into the world's anchor host object, native shared by reference. */
  class AnchorTypeBinding extends StructTypeBinding {
    constructor() {
      super();
      this.hasFieldGetter = true;
      this.hasFieldSetter = true;
    }

    fieldGetter(source: Value, fieldId: number, ctx: ExecutionContext): Value {
      const anchor = resolveConformanceAnchor(source.native);
      if (!anchor) {
        return undefined;
      }
      if (fieldId === this.fieldIds[CONFORMANCE_ANCHOR_FIELD_X]) {
        return mkNumber(anchor.x);
      }
      if (fieldId === this.fieldIds[CONFORMANCE_ANCHOR_FIELD_Y]) {
        return mkNumber(anchor.y);
      }
      return undefined;
    }

    fieldSetter(source: Value, fieldId: number, value: Value, ctx: ExecutionContext): boolean {
      const anchor = resolveConformanceAnchor(source.native);
      if (!anchor || value.t !== ValueTag.Number) {
        return false;
      }
      if (fieldId === this.fieldIds[CONFORMANCE_ANCHOR_FIELD_X]) {
        anchor.x = value.num;
        return true;
      }
      if (fieldId === this.fieldIds[CONFORMANCE_ANCHOR_FIELD_Y]) {
        anchor.y = value.num;
        return true;
      }
      return false;
    }
  }

  /** The `Target` type: a resolver-reading field getter and the snapshot that pins a resolution. */
  class TargetTypeBinding extends StructTypeBinding {
    constructor() {
      super();
      this.hasFieldGetter = true;
      this.hasSnapshotNative = true;
      this.fieldsAreReadOnly = true;
    }

    fieldGetter(source: Value, fieldId: number, ctx: ExecutionContext): Value {
      const target = resolveConformanceTarget(source.native);
      if (!target) {
        return undefined;
      }
      if (fieldId === this.fieldIds[CONFORMANCE_TARGET_FIELD_VALUE]) {
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

  /**
   * The `Marker` type: a field getter reading the world's anchor host object
   * whether or not it was destroyed, and the existence hook reporting whether
   * it was.
   */
  class MarkerTypeBinding extends StructTypeBinding {
    constructor() {
      super();
      this.hasFieldGetter = true;
      this.hasExists = true;
      this.fieldsAreReadOnly = true;
    }

    fieldGetter(source: Value, fieldId: number, ctx: ExecutionContext): Value {
      const anchor = source.native as ConformanceAnchor;
      if (!anchor || fieldId !== this.fieldIds[CONFORMANCE_MARKER_FIELD_X]) {
        return undefined;
      }
      return mkNumber(anchor.x);
    }

    exists(source: Value, ctx: ExecutionContext): boolean {
      return resolveConformanceAnchor(source.native) !== undefined;
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
      super(true);
    }

    execAsync(ctx: ExecutionContext, args: Value[], handle: AsyncHandle): void {
      const world = ctx.data as ConformanceWorld;
      world.defer(ctx.currentTick, DEFAULT_WHOLE_TICKS, new AnchorReadingSettlement(handle, world));
    }
  }

  /** `destroy anchor()`: destroys the world's one anchor host object; returns void. */
  class DestroyAnchorActuator extends HostActionBinding {
    constructor() {
      super(false);
    }

    execSync(ctx: ExecutionContext, args: Value[]): Value {
      const world = ctx.data as ConformanceWorld;
      world.destroyAnchor();
      return VOID_VALUE;
    }
  }

  /** `marker()`: returns a fresh `Marker` value over the world's anchor host object. */
  class MarkerSensor extends HostActionBinding {
    constructor() {
      super(false);
    }

    execSync(ctx: ExecutionContext, args: Value[]): Value {
      const world = ctx.data as ConformanceWorld;
      return mkNativeStruct(CONFORMANCE_MARKER_TYPE_ID, world.anchor());
    }
  }

  /** `not a number()`: returns the number not-a-number. */
  class NotANumberSensor extends HostActionBinding {
    constructor() {
      super(false);
    }

    execSync(ctx: ExecutionContext, args: Value[]): Value {
      return mkNumber(0 / 0);
    }
  }

  /** Name of the `point outputs` sensor's `Point` output whose value a brain may write a field through. */
  const POINT_OPEN_OUTPUT = "open";

  /** Name of the `point outputs` sensor's read-only `Point` output. */
  const POINT_SEALED_OUTPUT = "sealed";

  /** `x` of the `Point` `point outputs` writes to `open`; exactly representable at f32. */
  const CONFORMANCE_POINT_OPEN_X = 5.5;

  /** `y` of the `Point` `point outputs` writes to `open`; exactly representable at f32. */
  const CONFORMANCE_POINT_OPEN_Y = -1.5;

  /** `x` of the `Point` `point outputs` writes to `sealed`; exactly representable at f32. */
  const CONFORMANCE_POINT_SEALED_X = 6.25;

  /** `y` of the `Point` `point outputs` writes to `sealed`; exactly representable at f32. */
  const CONFORMANCE_POINT_SEALED_Y = 0.75;

  /** `point outputs()`: writes a fresh `Point` to each of its two outputs, then returns true. */
  class PointOutputsSensor extends HostActionBinding {
    constructor() {
      super(false);
    }

    execSync(ctx: ExecutionContext, args: Value[]): Value {
      setActionOutput(
        ctx,
        CONFORMANCE_POINT_TYPE_ID,
        POINT_OPEN_OUTPUT,
        mkStruct(CONFORMANCE_POINT_TYPE_ID, [mkNumber(CONFORMANCE_POINT_OPEN_X), mkNumber(CONFORMANCE_POINT_OPEN_Y)])
      );
      setActionOutput(
        ctx,
        CONFORMANCE_POINT_TYPE_ID,
        POINT_SEALED_OUTPUT,
        mkStruct(CONFORMANCE_POINT_TYPE_ID, [
          mkNumber(CONFORMANCE_POINT_SEALED_X),
          mkNumber(CONFORMANCE_POINT_SEALED_Y),
        ])
      );
      return TRUE_VALUE;
    }
  }

  /** `defer target()`: resolves its handle to a fresh resolver-backed `Target` value one tick after its dispatch. */
  class DeferTargetSensor extends HostActionBinding {
    constructor() {
      super(true);
    }

    execAsync(ctx: ExecutionContext, args: Value[], handle: AsyncHandle): void {
      const world = ctx.data as ConformanceWorld;
      world.defer(ctx.currentTick, DEFAULT_WHOLE_TICKS, new TargetReadingSettlement(handle, world));
    }
  }

  /** `emit all(value...)`: receives its repeated value slot's arguments as one gathered list; returns void. */
  class EmitAllActuator extends HostActionBinding {
    constructor() {
      super(false);
    }

    execSync(ctx: ExecutionContext, args: Value[]): Value {
      return VOID_VALUE;
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
      super();
      this.isAsync = true;
    }

    execAsync(ctx: ExecutionContext, args: Value[], handle: AsyncHandle): void {
      const world = ctx.data as ConformanceWorld;
      world.defer(ctx.currentTick, DEFAULT_WHOLE_TICKS, new ResolveSettlement(handle, operandSum(args)));
    }
  }

  /** Position of the `Point` type's `x` field in its declaration, which indexes {@link POINT_FIELD_IDS}. */
  const CONFORMANCE_POINT_FIELD_X = 0;

  /** Position of the `Point` type's `y` field in its declaration, which indexes {@link POINT_FIELD_IDS}. */
  const CONFORMANCE_POINT_FIELD_Y = 1;

  /**
   * The number value in the `Point` field at `position` of `operand`, or
   * `undefined` when the operand is no struct or carries no number there.
   */
  function pointFieldNumber(operand: Value, position: number): Value {
    if (operand.t !== ValueTag.Struct || !operand.fields) {
      return undefined;
    }
    const fieldId = POINT_FIELD_IDS[position];
    if (fieldId >= operand.fields.length) {
      return undefined;
    }
    const field = operand.fields[fieldId];
    return field.t === ValueTag.Number ? field : undefined;
  }

  /** `lhs point plus rhs`: the fieldwise sum of two `Point` operands; nil when an operand carries no reading. */
  class PointAddOperator extends HostFunction {
    constructor() {
      super();
    }

    exec(ctx: ExecutionContext, args: Value[]): Value {
      const lhs = args.length > 0 ? args[0] : NIL_VALUE;
      const rhs = args.length > 1 ? args[1] : NIL_VALUE;
      const lhsX = pointFieldNumber(lhs, CONFORMANCE_POINT_FIELD_X);
      const lhsY = pointFieldNumber(lhs, CONFORMANCE_POINT_FIELD_Y);
      const rhsX = pointFieldNumber(rhs, CONFORMANCE_POINT_FIELD_X);
      const rhsY = pointFieldNumber(rhs, CONFORMANCE_POINT_FIELD_Y);
      if (!lhsX || !lhsY || !rhsX || !rhsY) {
        return NIL_VALUE;
      }
      const fields = [mkNumber(lhsX.num + rhsX.num), mkNumber(lhsY.num + rhsY.num)];
      return mkStruct(CONFORMANCE_POINT_TYPE_ID, fields);
    }
  }

  /**
   * `lhs == rhs` over two `Point` operands: true exactly when both carry
   * `Point` readings with equal fields; false when an operand carries none.
   */
  class PointEqualOperator extends HostFunction {
    constructor() {
      super();
    }

    exec(ctx: ExecutionContext, args: Value[]): Value {
      const lhs = args.length > 0 ? args[0] : NIL_VALUE;
      const rhs = args.length > 1 ? args[1] : NIL_VALUE;
      const lhsX = pointFieldNumber(lhs, CONFORMANCE_POINT_FIELD_X);
      const lhsY = pointFieldNumber(lhs, CONFORMANCE_POINT_FIELD_Y);
      const rhsX = pointFieldNumber(rhs, CONFORMANCE_POINT_FIELD_X);
      const rhsY = pointFieldNumber(rhs, CONFORMANCE_POINT_FIELD_Y);
      if (!lhsX || !lhsY || !rhsX || !rhsY) {
        return FALSE_VALUE;
      }
      return mkBoolean(lhsX.num === rhsX.num && lhsY.num === rhsY.num);
    }
  }

  /**
   * The pack handle the conformance profile registers its vocabulary through,
   * and the name every registration diagnostic about the profile reports.
   */
  const conformancePack = pack("conformance");

  /**
   * The profile's name-to-id mapping: one hand-assigned id per registered
   * name and per struct field. The corpus goldens pin these profile ids,
   * type-atom ids and field ids verbatim.
   */
  const conformanceIds = new RegistrationIdMap();

  /**
   * The field names of a struct type in field-id order: the name at each
   * position is the name of the field whose id is that position.
   *
   * @param fields - Field specs in declaration order.
   * @param fieldIds - Hand-assigned field ids, parallel to `fields`; dense from 0.
   */
  function fieldNamesById(fields: StructFieldSpec[], fieldIds: number[]): string[] {
    const names: string[] = [];
    for (let id = 0; id < fieldIds.length; id++) {
      names.push(fields[fieldIds.indexOf(id)].name);
    }
    return names;
  }

  /**
   * Register one profile struct type and record the ids the corpus pins for
   * it.
   *
   * @param name - Wendoo type name.
   * @param atomId - Hand-assigned type-atom id; corpus TYPS entries record it verbatim.
   * @param fields - Field specs in declaration order.
   * @param fieldIds - Hand-assigned field ids, parallel to `fields`.
   * @param binding - Type binding carrying the type's hooks.
   */
  function defineConformanceStruct(
    name: string,
    atomId: number,
    fields: StructFieldSpec[],
    fieldIds: number[],
    binding: StructTypeBinding
  ): void {
    conformancePack.defineStruct(name, fields, binding);
    conformanceIds.addType(name, atomId, fieldNamesById(fields, fieldIds));
  }

  /**
   * The profile's anonymous `value` slot: filled by a bare value expression
   * of `type`, the anonymous parameter tile `tileId` standing for it.
   *
   * @param tileId - Identity of the slot's parameter tile.
   * @param type - Type name of the slot's value.
   */
  function anonymousValue(tileId: string, type: string): ArgSlotSpec {
    const slot = arg(tileId, type);
    slot.name = "value";
    slot.anonymous = true;
    return slot;
  }

  /**
   * One of the profile's whole-tick number slots, which the action reads as
   * {@link DEFAULT_WHOLE_TICKS} when it is left empty.
   *
   * @param tileId - Identity of the slot's parameter tile.
   * @param name - Slot name.
   */
  function wholeTicks(tileId: string, name: string): ArgSlotSpec {
    const slot = arg(tileId, TYPE_NUMBER);
    slot.name = name;
    slot.defaultValue = mkNumber(DEFAULT_WHOLE_TICKS);
    return slot;
  }

  /**
   * The spec of one profile sensor.
   *
   * @param args - Declared argument slots, in call order.
   * @param returns - Type name of the sensor's reading.
   * @param label - Display label.
   */
  function sensorSpec(args: TileArgSpec[], returns: string, label: string): TileSpec {
    const spec = new TileSpec(TILE_KIND_SENSOR, args, returns);
    spec.label = label;
    return spec;
  }

  /**
   * The spec of one profile actuator.
   *
   * @param args - Declared argument slots, in call order.
   * @param label - Display label.
   */
  function actuatorSpec(args: TileArgSpec[], label: string): TileSpec {
    const spec = new TileSpec(TILE_KIND_ACTUATOR, args, "");
    spec.label = label;
    return spec;
  }

  /**
   * Register one profile sensor or actuator and record the action id the
   * corpus pins for it.
   *
   * @param name - Tile name.
   * @param actionId - Hand-assigned action id; corpus programs record it verbatim.
   * @param binding - Action binding carrying the tile's body.
   * @param spec - Declared shape of the tile.
   */
  function bindConformanceAction(name: string, actionId: number, binding: HostActionBinding, spec: TileSpec): void {
    conformancePack.bind(name, binding, spec);
    conformanceIds.addAction(name, actionId);
  }

  /**
   * Register one profile operator overload and record the funcId the corpus
   * pins for it.
   *
   * @param name - Operator name.
   * @param fnId - Hand-assigned funcId; corpus programs record it verbatim.
   * @param fn - Host function computing the operator.
   * @param spec - Declared shape of the operator.
   */
  function bindConformanceOperator(name: string, fnId: number, fn: HostFunction, spec: OperatorSpec): void {
    conformancePack.bindOperator(name, fn, spec);
    conformanceIds.addOperator(name, fnId);
  }

  defineConformanceStruct(
    POINT_TYPE_NAME,
    CONFORMANCE_POINT_ATOM_ID,
    POINT_FIELDS,
    POINT_FIELD_IDS,
    new StructTypeBinding()
  );
  defineConformanceStruct(
    ANCHOR_TYPE_NAME,
    CONFORMANCE_ANCHOR_ATOM_ID,
    ANCHOR_FIELDS,
    ANCHOR_FIELD_IDS,
    new AnchorTypeBinding()
  );
  defineConformanceStruct(
    TARGET_TYPE_NAME,
    CONFORMANCE_TARGET_ATOM_ID,
    TARGET_FIELDS,
    TARGET_FIELD_IDS,
    new TargetTypeBinding()
  );
  defineConformanceStruct(
    MARKER_TYPE_NAME,
    CONFORMANCE_MARKER_ATOM_ID,
    MARKER_FIELDS,
    MARKER_FIELD_IDS,
    new MarkerTypeBinding()
  );

  bindConformanceAction(
    "sensor.conformance.echo",
    ConformanceActionId.Echo,
    new EchoSensor(),
    sensorSpec([anonymousValue("anon.number", TYPE_NUMBER)], TYPE_NUMBER, "echo")
  );
  bindConformanceAction(
    "actuator.conformance.emit",
    ConformanceActionId.Emit,
    new EmitActuator(),
    actuatorSpec([anonymousValue("anon.number", TYPE_NUMBER)], "emit")
  );
  bindConformanceAction(
    "actuator.conformance.defer-echo",
    ConformanceActionId.DeferEcho,
    new DeferEchoActuator(),
    actuatorSpec([anonymousValue("anon.number", TYPE_NUMBER), wholeTicks("conformance.ticks", "ticks")], "defer echo")
  );
  bindConformanceAction(
    "actuator.conformance.defer-fail",
    ConformanceActionId.DeferFail,
    new DeferFailActuator(),
    actuatorSpec([wholeTicks("conformance.ticks", "ticks")], "defer fail")
  );
  bindConformanceAction(
    "actuator.conformance.fault",
    ConformanceActionId.Fault,
    new FaultActuator(),
    actuatorSpec([], "fault")
  );
  bindConformanceAction(
    "sensor.conformance.signal",
    ConformanceActionId.Signal,
    new SignalSensor(),
    sensorSpec([wholeTicks("conformance.period", "period")], TYPE_NUMBER, "signal")
  );
  bindConformanceAction(
    "sensor.conformance.counter",
    ConformanceActionId.Counter,
    new CounterSensor(),
    sensorSpec([], TYPE_NUMBER, "counter")
  );
  bindConformanceAction(
    "actuator.conformance.defer-cancel",
    ConformanceActionId.DeferCancel,
    new DeferCancelActuator(),
    actuatorSpec([wholeTicks("conformance.ticks", "ticks")], "defer cancel")
  );
  bindConformanceAction(
    "sensor.conformance.defer-read",
    ConformanceActionId.DeferRead,
    new DeferReadSensor(),
    sensorSpec(
      [anonymousValue("anon.number", TYPE_NUMBER), wholeTicks("conformance.ticks", "ticks")],
      TYPE_NUMBER,
      "defer read"
    )
  );
  bindConformanceAction(
    "actuator.conformance.emit-text",
    ConformanceActionId.EmitText,
    new EmitTextActuator(),
    actuatorSpec([anonymousValue("anon.string", TYPE_STRING)], "emit text")
  );
  bindConformanceAction(
    "actuator.conformance.emit-flag",
    ConformanceActionId.EmitFlag,
    new EmitFlagActuator(),
    actuatorSpec([anonymousValue("anon.boolean", TYPE_BOOLEAN)], "emit flag")
  );
  bindConformanceAction(
    "sensor.conformance.defer-point",
    ConformanceActionId.DeferPoint,
    new DeferPointSensor(),
    sensorSpec([], POINT_TYPE_NAME, "defer point")
  );
  bindConformanceAction(
    "sensor.conformance.defer-anchor",
    ConformanceActionId.DeferAnchor,
    new DeferAnchorSensor(),
    sensorSpec([], ANCHOR_TYPE_NAME, "defer anchor")
  );
  bindConformanceAction(
    "sensor.conformance.defer-target",
    ConformanceActionId.DeferTarget,
    new DeferTargetSensor(),
    sensorSpec([], TARGET_TYPE_NAME, "defer target")
  );
  bindConformanceAction(
    "actuator.conformance.emit-all",
    ConformanceActionId.EmitAll,
    new EmitAllActuator(),
    actuatorSpec([repeated(anonymousValue("conformance.value", TYPE_ANY), 0)], "emit all")
  );
  bindConformanceAction(
    "actuator.conformance.destroy-anchor",
    ConformanceActionId.DestroyAnchor,
    new DestroyAnchorActuator(),
    actuatorSpec([], "destroy anchor")
  );
  bindConformanceAction(
    "sensor.conformance.not-a-number",
    ConformanceActionId.NotANumber,
    new NotANumberSensor(),
    sensorSpec([], TYPE_NUMBER, "not a number")
  );
  const pointOutputsSpec = sensorSpec([], TYPE_BOOLEAN, "point outputs");
  const pointOpenOutput = output(POINT_OPEN_OUTPUT, POINT_TYPE_NAME);
  pointOpenOutput.writableResult = true;
  pointOutputsSpec.outputs = [pointOpenOutput, output(POINT_SEALED_OUTPUT, POINT_TYPE_NAME)];
  bindConformanceAction(
    "sensor.conformance.point-outputs",
    ConformanceActionId.PointOutputs,
    new PointOutputsSensor(),
    pointOutputsSpec
  );
  bindConformanceAction(
    "sensor.conformance.marker",
    ConformanceActionId.Marker,
    new MarkerSensor(),
    sensorSpec([], MARKER_TYPE_NAME, "marker")
  );

  bindConformanceOperator(
    "conformance.defer-add",
    ConformanceFuncId.DeferAdd,
    new DeferAddOperator(),
    new OperatorSpec([TYPE_NUMBER, TYPE_NUMBER], TYPE_NUMBER)
  );
  bindConformanceOperator(
    "conformance.point-add",
    ConformanceFuncId.PointAdd,
    new PointAddOperator(),
    new OperatorSpec([POINT_TYPE_NAME, POINT_TYPE_NAME], POINT_TYPE_NAME)
  );

  const pointEqualSpec = new OperatorSpec([POINT_TYPE_NAME, POINT_TYPE_NAME], TYPE_BOOLEAN);
  conformancePack.overloadOperator(OPERATOR_EQUAL_TO, new PointEqualOperator(), pointEqualSpec);
  conformanceIds.addOperator(
    operatorOverloadName(OPERATOR_EQUAL_TO, pointEqualSpec.operands),
    ConformanceFuncId.PointEqual
  );

  /** Line that closes the trace body of a replayed case. */
  export const CONFORMANCE_TRACE_END = "SIMCAP TRACE-END";

  /** A trace tap that also keeps every fault one replay raises, for the diagnostics following its trace body. */
  class FaultKeepingTraceTap extends TraceTap {
    /** Every fault the replay has raised so far, in the order raised. */
    faults: VmFault[] = [];

    constructor(writer: ObservableTraceWriter) {
      super(writer);
    }

    onFiberFault(fiberId: number, fault: VmFault): void {
      super.onFiberFault(fiberId, fault);
      this.faults.push(fault);
    }
  }

  /** The registries of one replay: host functions, host actions, and struct types. */
  class ConformanceRegistries {
    /** Host functions, carrying the core set and the profile's operator overloads. */
    functions: HostFunctionRegistry;
    /** Host actions, carrying the core set and the profile's tiles. */
    actions: HostActionRegistry;
    /** The profile's struct types. */
    types: StructTypeRegistry;

    constructor(functions: HostFunctionRegistry, actions: HostActionRegistry, types: StructTypeRegistry) {
      this.functions = functions;
      this.actions = actions;
      this.types = types;
    }
  }

  /**
   * Construct one replay's registries, seed them with the core sets, drain
   * the profile's registrations into them under its pinned ids, and publish
   * the profile's catalog.
   */
  function drainConformanceRegistrations(): ConformanceRegistries {
    const numerics = new F64Numerics();
    const functions = new HostFunctionRegistry();
    registerCoreHostFunctions(functions, numerics);
    const actions = new HostActionRegistry();
    registerCoreHostActions(actions, numerics, new ConformanceRandomStream());
    const types = new StructTypeRegistry();
    applyPendingRegistrations(conformanceIds, functions, actions, types);
    publishCatalog(new CatalogIconEncoder());
    return new ConformanceRegistries(functions, actions, types);
  }

  /**
   * Serialize the conformance profile's catalog, from the drained
   * registration state, and write it to the console as one
   * `CATALOG <payload>` line, bracketed by the capture harness's case
   * markers. The payload carries no icons.
   *
   * @param caseId - Case id the capture harness brackets the run's output with.
   */
  export function runConformanceCatalog(caseId: string): void {
    console.log(`SIMCAP START ${caseId}`);
    drainConformanceRegistrations();
    console.log(`CATALOG ${serializeCatalog(new CatalogIconEncoder())}`);
    console.log(`SIMCAP PASS ${caseId}`);
  }

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
    const registries = drainConformanceRegistrations();
    const hostFunctions = registries.functions;
    const hostActions = registries.actions;
    const types = registries.types;

    const decoded = decodeProgramHex(programHex, types);
    if (decoded.errorCode.length > 0) {
      console.log(CONFORMANCE_TRACE_END);
      console.log(`DIAG decode-failed ${decoded.errorCode}`);
      console.log(`SIMCAP PASS ${caseId}`);
      return;
    }

    const sink = new ConsoleTraceSink();
    const writer = new ObservableTraceWriter(sink, decoded.profileId);

    const world = new ConformanceWorld();
    const tap = new FaultKeepingTraceTap(writer);
    const runtime = new BrainRuntime(
      decoded.program,
      hostFunctions,
      hostActions,
      types,
      tap,
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
    const faults = tap.faults;
    for (let i = 0; i < faults.length; i++) {
      const fault = faults[i];
      console.log(`DIAG fault code=${fault.code} func=${fault.funcId} pc=${fault.pc} ${fault.message}`);
    }
    const registrationProblems = registrationDiagnostics();
    for (let i = 0; i < registrationProblems.length; i++) {
      const problem = registrationProblems[i];
      const packs = problem.otherPack.length > 0 ? `${problem.pack} ${problem.otherPack}` : problem.pack;
      console.log(`DIAG registration ${problem.code} ${problem.name} ${packs}`);
    }
    console.log(`SIMCAP PASS ${caseId}`);
  }
}
