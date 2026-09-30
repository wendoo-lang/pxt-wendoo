/**
 * The Wendoo value model.
 *
 * A brain value is one tagged cell: a {@link wendoo.ValueTag} tag plus the
 * payload field that tag selects -- `num` for a number, `str` for a string and
 * an enum symbol, `b` for a boolean, `typeId` and `fields` for a struct and
 * for a list, whose elements live in the same `fields` array. Numbers are
 * plain runtime numbers, which are IEEE-754 binary64 in the MakeCode
 * simulator.
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
   * through {@link mkNumber}, {@link mkString}, {@link mkBoolean},
   * {@link mkStruct}, {@link mkList} or the singletons; the payload fields of
   * a kind that does not use them read as `0`, `""` and `false`, and the
   * `typeId`/`fields` payload is live only on a `Struct` or `List` value.
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
    /** TypeId of a `Struct`, `List` or `Enum` value's type, e.g. `"struct:<Point>"`. */
    typeId: string;
    /**
     * Field values of a `Struct` value, indexed by field id (a missing entry
     * reads as nil), or the elements of a `List` value, in order.
     */
    fields: Value[];
    /**
     * Host object behind a native-backed `Struct` value, set only by
     * {@link mkNativeStruct} and carried through deep copies. The VM never
     * interprets it: the value's registered field hooks do. Undefined on
     * every other value.
     */
    // biome-ignore lint/suspicious/noExplicitAny: pxt's static subset has no unknown type.
    native: any;

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
   * @param v - Numeric payload, a binary64 double.
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
   * An enum value of type `typeId` carrying the symbol key `symbol`.
   *
   * @param typeId - TypeId of the enum's type.
   * @param symbol - Symbol key, carried in the `str` payload.
   */
  export function mkEnum(typeId: string, symbol: string): Value {
    const v = new Value(ValueTag.Enum, 0, symbol, false);
    v.typeId = typeId;
    return v;
  }

  /**
   * A struct value of type `typeId` carrying `fields`. The cell holds the
   * array itself, not a copy.
   *
   * @param typeId - TypeId of the struct's type.
   * @param fields - Field values, indexed by field id.
   */
  export function mkStruct(typeId: string, fields: Value[]): Value {
    const v = new Value(ValueTag.Struct, 0, "", false);
    v.typeId = typeId;
    v.fields = fields;
    return v;
  }

  /**
   * A list value of type `typeId` carrying `items`. The cell holds the array
   * itself, not a copy.
   *
   * @param typeId - TypeId of the list's type.
   * @param items - Element values, in order.
   */
  export function mkList(typeId: string, items: Value[]): Value {
    const v = new Value(ValueTag.List, 0, "", false);
    v.typeId = typeId;
    v.fields = items;
    return v;
  }

  /**
   * A native-backed struct value of type `typeId`: an empty field list plus
   * the host object `native` the type's registered field hooks dispatch to.
   *
   * @param typeId - TypeId of the struct's type.
   * @param native - Host object behind the value.
   */
  // biome-ignore lint/suspicious/noExplicitAny: pxt's static subset has no unknown type.
  export function mkNativeStruct(typeId: string, native: any): Value {
    const v = new Value(ValueTag.Struct, 0, "", false);
    v.typeId = typeId;
    v.fields = [];
    v.native = native;
    return v;
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
   * numeric zero, the empty string and the empty list are falsy; every other
   * value is truthy.
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
    if (v.t === ValueTag.List) {
      return v.fields.length > 0;
    }
    return true;
  }
}
