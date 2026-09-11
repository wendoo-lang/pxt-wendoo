/**
 * The Wendoo value model.
 *
 * A brain value is one tagged cell: a {@link wendoo.ValueTag} tag plus the
 * payload field that tag selects -- `num` for a number, `str` for a string and
 * an enum symbol, `b` for a boolean. Numbers are plain runtime numbers, which
 * are IEEE-754 binary64 in the MakeCode simulator.
 */
namespace wendoo {
  /**
   * Tag of a brain value. Members below 100 mirror the reference VM's
   * `NativeType` enum one-to-one: wire-stable native type ids the binary
   * program artifact and the observable trace both address values by.
   * `Handle` is a VM-internal value; its tag sits outside that range, so
   * `TYPE_CHECK` never matches it.
   */
  export enum ValueTag {
    Unknown = -1,
    Void = 0,
    Nil = 1,
    Boolean = 2,
    Number = 3,
    String = 4,
    Enum = 5,
    List = 6,
    Map = 7,
    Struct = 8,
    Any = 9,
    Union = 10,
    Function = 11,
    Buffer = 12,
    /** A VM-internal reference to a pending async operation. */
    Handle = 100,
  }

  /**
   * Numeric fault classifier carried by every fault. Wire-stable: the
   * observable trace renders these numbers, and the runtime never compares
   * against a name.
   */
  export enum ErrorCode {
    Timeout = 1,
    Cancelled = 2,
    HostError = 3,
    ScriptError = 4,
    StackOverflow = 5,
    StackUnderflow = 6,
  }

  /**
   * One brain value: a tag plus the payload fields its tag selects. Construct
   * through {@link mkNumber}, {@link mkString}, {@link mkBoolean} or the
   * singletons; the payload fields of a kind that does not use them read as
   * `0`, `""` and `false`.
   */
  export class Value {
    /** Which kind of value this cell holds, and therefore which payload field is live. */
    t: ValueTag;
    /** Numeric payload of a `Number` value. */
    num: number;
    /** Text payload of a `String` value, or the symbol key of an `Enum` value. */
    str: string;
    /** Truth payload of a `Boolean` value. */
    b: boolean;

    constructor(t: ValueTag, num: number, str: string, b: boolean) {
      this.t = t;
      this.num = num;
      this.str = str;
      this.b = b;
    }
  }

  /** The unknown singleton. */
  export const UNKNOWN_VALUE = new Value(ValueTag.Unknown, 0, "", false);
  /** The void singleton, returned by an actuator that produces no value. */
  export const VOID_VALUE = new Value(ValueTag.Void, 0, "", false);
  /** The nil singleton, also the value of an unsupplied optional argument slot. */
  export const NIL_VALUE = new Value(ValueTag.Nil, 0, "", false);
  /** The boolean true singleton. */
  export const TRUE_VALUE = new Value(ValueTag.Boolean, 0, "", true);
  /** The boolean false singleton. */
  export const FALSE_VALUE = new Value(ValueTag.Boolean, 0, "", false);

  /**
   * A number value carrying `v`.
   *
   * @param v - Numeric payload, at the simulator's binary64 precision.
   */
  export function mkNumber(v: number): Value {
    return new Value(ValueTag.Number, v, "", false);
  }

  /**
   * A string value carrying `v`.
   *
   * @param v - Text payload.
   */
  export function mkString(v: string): Value {
    return new Value(ValueTag.String, 0, v, false);
  }

  /**
   * The boolean singleton for `v`.
   *
   * @param v - Truth payload.
   */
  export function mkBoolean(v: boolean): Value {
    return v ? TRUE_VALUE : FALSE_VALUE;
  }

  /**
   * A handle value referencing the pending async operation `id`.
   *
   * @param id - Handle id allocated by the handle table.
   */
  export function mkHandle(id: number): Value {
    return new Value(ValueTag.Handle, id, "", false);
  }

  /**
   * Whether `v` is the IEEE-754 not-a-number value.
   *
   * @param v - Number to test.
   */
  export function isNotANumber(v: number): boolean {
    return !(v <= 0) && !(v >= 0);
  }

  /**
   * Whether `v` passes a truthiness gate. Unknown, void, nil, `false`,
   * numeric zero and the empty string are falsy; every other value is truthy.
   *
   * @param v - Value to test.
   */
  export function isTruthy(v: Value): boolean {
    if (v.t === ValueTag.Unknown || v.t === ValueTag.Void || v.t === ValueTag.Nil) {
      return false;
    }
    if (v.t === ValueTag.Boolean) {
      return v.b;
    }
    if (v.t === ValueTag.Number) {
      return v.num !== 0;
    }
    if (v.t === ValueTag.String) {
      return v.str.length > 0;
    }
    return true;
  }
}
