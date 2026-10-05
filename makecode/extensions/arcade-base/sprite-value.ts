/**
 * Sprites as Wendoo values: the `Sprite` type an Arcade sprite crosses into
 * a program as, the sprite a value stands for, and whether it is destroyed.
 * A `Sprite` value is backed by the sprite it stands for: its fields --
 * `image`, `position` and `brain` -- hold nothing of their own, and are read
 * from and written to that sprite when a program uses them.
 */
namespace wendoo {
  /** Wendoo type name of a sprite value: a value standing for one Arcade sprite. */
  //% hidden
  export const TYPE_SPRITE = "Sprite";

  /** Position of the `image` field among the `Sprite` type's declared fields, which indexes its binding's field ids. */
  const SPRITE_FIELD_IMAGE = 0;

  /** Position of the `position` field among the `Sprite` type's declared fields, which indexes its binding's field ids. */
  const SPRITE_FIELD_POSITION = 1;

  /** Position of the `brain` field among the `Sprite` type's declared fields, which indexes its binding's field ids. */
  const SPRITE_FIELD_BRAIN = 2;

  /**
   * The `Sprite` type's declared fields, at their `SPRITE_FIELD_*`
   * positions, each writable and each with an accessor tile: `image`, an
   * `Image`; `position`, a `Vector2`; and `brain`, a `Brain`.
   */
  //% hidden
  export function spriteFields(): StructFieldSpec[] {
    return [
      withAccessor(field("image", TYPE_IMAGE), "image", IMAGE_ACCESSOR_ICON),
      withAccessor(field("position", TYPE_VECTOR2), "position", POSITION_ACCESSOR_ICON),
      withAccessor(field("brain", TYPE_BRAIN), "brain", BRAIN_TYPE_ICON),
    ];
  }

  /**
   * The `Sprite` type's binding: each value carries the sprite it stands for
   * as its host object, and every field is read from and written to that
   * sprite through the field hooks. `image` reads the image the sprite
   * wears, as {@link imageValueOf} wraps it, and a write dresses the sprite
   * in the image {@link imageOf} finds for the value written -- an image an
   * asset names, or another sprite's image itself, never a copy -- keeping
   * the sprite's image when it finds none. `position` reads a fresh `Vector2` of
   * the sprite's center at every read, and a write puts the center at the
   * point written, leaving the sprite's velocity alone; a value naming no
   * point moves nothing. `brain` reads the brain the sprite runs, as
   * {@link brainRunningOn} finds it, and a write asks for a brain as
   * {@link requestBrain} does. A destroyed sprite reads nil from every field
   * and ignores every write. No write is ever refused.
   */
  //% hidden
  export class SpriteBinding extends StructTypeBinding {
    constructor() {
      super();
      this.hasFieldGetter = true;
      this.hasFieldSetter = true;
    }

    fieldGetter(source: Value, fieldId: number, ctx: ExecutionContext): Value {
      const sprite = spriteOf(source);
      if (!sprite || isDestroyed(sprite)) {
        return undefined;
      }
      if (fieldId === this.fieldIds[SPRITE_FIELD_IMAGE]) {
        return imageValueOf(sprite.image);
      }
      if (fieldId === this.fieldIds[SPRITE_FIELD_POSITION]) {
        return vector2Value(new DirectionVector(sprite.x, sprite.y));
      }
      if (fieldId === this.fieldIds[SPRITE_FIELD_BRAIN]) {
        return brainRunningOn(ctx, sprite);
      }
      return undefined;
    }

    fieldSetter(source: Value, fieldId: number, value: Value, ctx: ExecutionContext): boolean {
      const sprite = spriteOf(source);
      if (!sprite || isDestroyed(sprite)) {
        return true;
      }
      if (fieldId === this.fieldIds[SPRITE_FIELD_IMAGE]) {
        const picture = imageOf(value);
        if (picture) {
          sprite.setImage(picture);
        }
      } else if (fieldId === this.fieldIds[SPRITE_FIELD_POSITION]) {
        const point = vector2Of(value);
        if (point) {
          sprite.setPosition(point.x, point.y);
        }
      } else if (fieldId === this.fieldIds[SPRITE_FIELD_BRAIN]) {
        requestBrain(ctx, sprite, value);
      }
      return true;
    }
  }

  /**
   * The `Sprite` type's binding. Its atom id and field ids are the project's
   * mapping's once the program host has drained registrations.
   */
  //% hidden
  export const spriteBinding = new SpriteBinding();

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
