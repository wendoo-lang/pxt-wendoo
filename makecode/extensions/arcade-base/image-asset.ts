/**
 * Images as Wendoo values: the `Image` asset type a program names one of the
 * project's images by, and the image such a value names. A value a program
 * carries holds the image's asset id only; the image itself is found when
 * the value is used, as the project holds it then. A value read from a
 * sprite's image instead wraps that image object itself; its asset id reads
 * as the empty string.
 */
namespace wendoo {
  /** Wendoo type name of an image value: a plain struct naming one of the project's images by its asset id. */
  //% hidden
  export const TYPE_IMAGE = "Image";

  /** Asset kind of the project assets an `Image` value names. */
  //% hidden
  export const IMAGE_ASSET_KIND = "image";

  /**
   * The `Image` type's binding. Its atom id and its asset field's id are the
   * project's mapping's once the program host has drained registrations.
   */
  //% hidden
  export const imageBinding = new AssetTypeBinding(IMAGE_ASSET_KIND);

  /**
   * The `Image` value wrapping `picture` itself, as a sprite's `image` field
   * reads it: the value stands for that image object, and its asset field
   * holds the empty string. Call it only once the program host has drained
   * registrations, so the type's field id is assigned.
   *
   * @param picture - The image the value wraps.
   */
  //% hidden
  export function imageValueOf(picture: Image): Value {
    const fieldId = imageBinding.fieldIds[0];
    const value = mkNativeStruct(structTypeId(TYPE_IMAGE), picture);
    for (let i = 0; i < fieldId; i++) {
      value.fields.push(NIL_VALUE);
    }
    value.fields.push(mkString(""));
    return value;
  }

  /**
   * The image `value` stands for: the image object itself when `value`
   * wraps one, as {@link imageValueOf} makes it; otherwise the image its
   * asset id names, found through the project's image factories -- which
   * the project's images module registers, each answering to an image's
   * asset id and to its display name -- at the moment this is called.
   * `undefined` when `value` is not an `Image` value, nil included, or when
   * no factory holds its asset id; the asset id is then reported unresolved,
   * once per id.
   *
   * @param value - Any value a program produced.
   */
  //% hidden
  export function imageOf(value: Value): Image {
    if (value && value.t === ValueTag.Struct && value.typeId === imageBinding.typeId && value.native) {
      return value.native as Image;
    }
    const assetId = imageBinding.assetIdOf(value);
    if (assetId.length === 0) {
      return undefined;
    }
    const found: Image = helpers.getImageByName(assetId);
    if (!found) {
      imageBinding.reportUnresolved(assetId);
      return undefined;
    }
    return found;
  }

  /**
   * Whether `a` and `b` stand for images with the same pixels, each image
   * found as {@link imageOf} finds it -- the image object a value wraps, or
   * the image its asset id names -- whichever image objects they are.
   * `false` when either stands for no image, so a value standing for no
   * image equals nothing, another such value included.
   *
   * @param a - Any value a program produced.
   * @param b - Any value a program produced.
   */
  //% hidden
  export function sameImage(a: Value, b: Value): boolean {
    const first = imageOf(a);
    const second = imageOf(b);
    if (!first || !second) {
      return false;
    }
    return first.equals(second);
  }
}
