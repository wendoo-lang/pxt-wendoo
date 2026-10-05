/**
 * Directions as Wendoo values: the `Vector2` struct type a direction crosses
 * into a program as, and the arithmetic the arcade vocabulary does on
 * directions -- reading a `Vector2` as a direction or a point, masking
 * components, summing chosen direction modifiers, and clamping to the unit
 * circle. A `Vector2` stands for
 * a direction in most slots and for a point on the screen in a slot that
 * names a place to head for, such as the target a move's `toward` carries.
 */
namespace wendoo {
  /** Wendoo type name of a direction or point value: a struct of two numbers, `x` and `y`, in Arcade's screen convention. */
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
   * The `x` and `y` `value` carries when it is a `Vector2` whose fields both
   * hold numbers, the zero vector included -- a direction, or a point on the
   * screen in the coordinates sprite positions use; `undefined` for any
   * other value, nil included.
   *
   * @param value - Any value a program produced.
   */
  //% hidden
  export function vector2Of(value: Value): DirectionVector {
    if (!value || value.t !== ValueTag.Struct || value.typeId !== structTypeId(TYPE_VECTOR2)) {
      return undefined;
    }
    const x = value.fields[vector2Binding.fieldIds[VECTOR2_FIELD_X]];
    const y = value.fields[vector2Binding.fieldIds[VECTOR2_FIELD_Y]];
    if (!x || !y || x.t !== ValueTag.Number || y.t !== ValueTag.Number) {
      return undefined;
    }
    return new DirectionVector(x.num, y.num);
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
    const direction = vector2Of(value);
    return direction && !direction.isZero() ? direction : undefined;
  }

  /**
   * The vector `x`, `y` scaled to length 1, or `undefined` when it is the
   * zero vector.
   *
   * @param x - Horizontal component; positive is rightward.
   * @param y - Vertical component; positive is downward.
   */
  //% hidden
  export function unitVector(x: number, y: number): DirectionVector {
    if (x === 0 && y === 0) {
      return undefined;
    }
    const length = Math.sqrt(x * x + y * y);
    return new DirectionVector(x / length, y / length);
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
   * The direction the chosen direction modifiers specify: the sum of a unit
   * vector for each flag set -- `up` (0, -1), `down` (0, 1), `left` (-1, 0),
   * `right` (1, 0), `toward` the direction `bearing` holds, and `away` its
   * opposite -- and of `wander` when it is given, scaled to length 1. So two
   * perpendicular cardinals give the exact diagonal, a cardinal bends
   * `toward`, `away` or a wander, and opposite pairs, `toward` with `away`
   * among them, cancel. `toward` and `away` add nothing while `bearing` is
   * `undefined`. `undefined` when nothing adds anything or what is added
   * cancels to the zero vector.
   *
   * @param up - Whether up is chosen.
   * @param down - Whether down is chosen.
   * @param left - Whether left is chosen.
   * @param right - Whether right is chosen.
   * @param toward - Whether toward is chosen.
   * @param away - Whether away is chosen.
   * @param bearing - The direction `toward` adds, 1 long; `undefined` when there is none.
   * @param wander - The direction a wander adds, 1 long; `undefined` when wander is not chosen or adds none.
   */
  //% hidden
  export function specifiedDirection(
    up: boolean,
    down: boolean,
    left: boolean,
    right: boolean,
    toward: boolean,
    away: boolean,
    bearing: DirectionVector,
    wander: DirectionVector
  ): DirectionVector {
    let x = (right ? 1 : 0) - (left ? 1 : 0);
    let y = (down ? 1 : 0) - (up ? 1 : 0);
    if (bearing) {
      if (toward) {
        x += bearing.x;
        y += bearing.y;
      }
      if (away) {
        x -= bearing.x;
        y -= bearing.y;
      }
    }
    if (wander) {
      x += wander.x;
      y += wander.y;
    }
    return unitVector(x, y);
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
