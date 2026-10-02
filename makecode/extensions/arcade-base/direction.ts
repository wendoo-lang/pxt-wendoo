/**
 * Directions as Wendoo values: the `Vector2` struct type a direction crosses
 * into a program as, and the arithmetic the arcade vocabulary does on
 * directions -- masking components, clamping to the unit circle, and picking
 * the direction an action acts in.
 */
namespace wendoo {
  /** Wendoo type name of a direction value: a struct of two numbers, `x` and `y`, in Arcade's screen convention. */
  //% hidden
  export const TYPE_VECTOR2 = "Vector2";

  /** Position of the `x` field among the `Vector2` type's declared fields, which indexes its binding's field ids. */
  const VECTOR2_FIELD_X = 0;

  /** Position of the `y` field among the `Vector2` type's declared fields, which indexes its binding's field ids. */
  const VECTOR2_FIELD_Y = 1;

  /**
   * The `Vector2` type's binding: a closed struct, its fields read from and
   * written to the value's own field slots. Its field ids are the project's
   * mapping's once the program host has drained registrations.
   */
  //% hidden
  export const vector2Binding = new StructTypeBinding();

  /** The `Vector2` type's declared fields: `x` then `y`, both numbers, at their `VECTOR2_FIELD_*` positions. */
  //% hidden
  export function vector2Fields(): StructFieldSpec[] {
    return [field("x", TYPE_NUMBER), field("y", TYPE_NUMBER)];
  }

  /**
   * The `Vector2` value carrying `direction`. Call it only once the program
   * host has drained registrations, so the type's field ids are assigned.
   *
   * @param direction - The direction the value carries.
   */
  //% hidden
  export function vector2Value(direction: DirectionVector): Value {
    const xId = vector2Binding.fieldIds[VECTOR2_FIELD_X];
    const yId = vector2Binding.fieldIds[VECTOR2_FIELD_Y];
    const slots: Value[] = [];
    const width = (xId > yId ? xId : yId) + 1;
    for (let i = 0; i < width; i++) {
      slots.push(NIL_VALUE);
    }
    slots[xId] = mkNumber(direction.x);
    slots[yId] = mkNumber(direction.y);
    return mkStruct(structTypeId(TYPE_VECTOR2), slots);
  }

  /**
   * The direction `value` carries: its `x` and `y` when it is a `Vector2`
   * whose fields both hold numbers and whose direction is not the zero
   * vector; `undefined` for any other value, nil included.
   *
   * @param value - Any value a program produced.
   */
  //% hidden
  export function directionOf(value: Value): DirectionVector {
    if (!value || value.t !== ValueTag.Struct || value.typeId !== structTypeId(TYPE_VECTOR2)) {
      return undefined;
    }
    const x = value.fields[vector2Binding.fieldIds[VECTOR2_FIELD_X]];
    const y = value.fields[vector2Binding.fieldIds[VECTOR2_FIELD_Y]];
    if (!x || !y || x.t !== ValueTag.Number || y.t !== ValueTag.Number) {
      return undefined;
    }
    const direction = new DirectionVector(x.num, y.num);
    return direction.isZero() ? undefined : direction;
  }

  /**
   * `direction` with every component its mask does not admit set to 0. Each
   * flag admits one direction's component: `up` a negative `y`, `down` a
   * positive `y`, `left` a negative `x`, `right` a positive `x`.
   *
   * @param direction - The direction to mask.
   * @param up - Whether an upward component is admitted.
   * @param down - Whether a downward component is admitted.
   * @param left - Whether a leftward component is admitted.
   * @param right - Whether a rightward component is admitted.
   */
  //% hidden
  export function maskDirection(
    direction: DirectionVector,
    up: boolean,
    down: boolean,
    left: boolean,
    right: boolean
  ): DirectionVector {
    const x = (direction.x < 0 && left) || (direction.x > 0 && right) ? direction.x : 0;
    const y = (direction.y < 0 && up) || (direction.y > 0 && down) ? direction.y : 0;
    return new DirectionVector(x, y);
  }

  /**
   * `direction` held to the unit circle: a vector longer than 1 scaled to
   * length 1, any other returned unchanged.
   *
   * @param direction - The direction to clamp.
   */
  //% hidden
  export function clampToUnitCircle(direction: DirectionVector): DirectionVector {
    const length = Math.sqrt(direction.x * direction.x + direction.y * direction.y);
    if (length <= 1) {
      return direction;
    }
    return new DirectionVector(direction.x / length, direction.y / length);
  }
}
