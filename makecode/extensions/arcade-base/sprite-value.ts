/**
 * Sprites as Wendoo values: the `Sprite` type an Arcade sprite crosses into
 * a program as, the sprite a value stands for, and whether it is destroyed.
 * A `Sprite` value is opaque -- the type declares no fields -- and is backed
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
   * The sprite `value` stands for, or `undefined` when `value` is not a
   * `Sprite` value, nil included.
   *
   * @param value - Any value a program produced.
   */
  //% hidden
  export function spriteOf(value: Value): Sprite {
    if (!value || value.t !== ValueTag.Struct || value.typeId !== structTypeId(TYPE_SPRITE)) {
      return undefined;
    }
    return value.native as Sprite;
  }

  /**
   * Whether `sprite` has been destroyed.
   *
   * @param sprite - Any sprite.
   */
  //% hidden
  export function isDestroyed(sprite: Sprite): boolean {
    return (sprite.flags & sprites.Flag.Destroyed) !== 0;
  }
}
