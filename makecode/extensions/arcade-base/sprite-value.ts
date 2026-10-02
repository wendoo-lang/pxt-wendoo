/**
 * Sprites as Wendoo values: the `Sprite` type an Arcade sprite crosses into
 * a program as, and the direction toward the sprite a value stands for. A
 * `Sprite` value is opaque -- the type declares no fields -- and is backed
 * by the sprite it stands for.
 */
namespace wendoo {
  /** Wendoo type name of a sprite value: an opaque value standing for one Arcade sprite. */
  //% hidden
  export const TYPE_SPRITE = "Sprite";

  /**
   * The `Sprite` type's binding: no fields and no hooks, each value carrying
   * the sprite it stands for as its host object. Its atom id is the
   * project's mapping's once the program host has drained registrations.
   */
  //% hidden
  export const spriteBinding = new StructTypeBinding();

  /**
   * The `Sprite` value standing for `sprite`.
   *
   * @param sprite - The sprite the value stands for.
   */
  //% hidden
  export function spriteValue(sprite: Sprite): Value {
    return mkNativeStruct(structTypeId(TYPE_SPRITE), sprite);
  }

  /**
   * The direction from the center of `sprite` to the center of the sprite
   * `subject` stands for, scaled to length 1, read from where both sprites
   * are now. `undefined` when `subject` is not a `Sprite` value -- nil
   * included -- or the two centers coincide.
   *
   * @param sprite - The sprite the direction starts at.
   * @param subject - Any value a program produced.
   */
  //% hidden
  export function directionToward(sprite: Sprite, subject: Value): DirectionVector {
    if (!subject || subject.t !== ValueTag.Struct || subject.typeId !== structTypeId(TYPE_SPRITE)) {
      return undefined;
    }
    const other = subject.native as Sprite;
    const x = other.x - sprite.x;
    const y = other.y - sprite.y;
    if (x === 0 && y === 0) {
      return undefined;
    }
    const length = Math.sqrt(x * x + y * y);
    return new DirectionVector(x / length, y / length);
  }
}
