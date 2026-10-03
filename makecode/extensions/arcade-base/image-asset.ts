/**
 * Images as Wendoo values: the `Image` asset type a program names one of the
 * project's images by, and the image such a value names. A value holds the
 * image's asset id only; the image itself is found when the value is used,
 * as the project holds it then.
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
   * The image `value` names, found by its asset id through the project's
   * image factories -- which the project's images module registers, each
   * answering to an image's asset id and to its display name -- at the
   * moment this is called. `undefined` when `value` is not an `Image` value,
   * nil included, or when no factory holds its asset id; the asset id is
   * then reported unresolved, once per id.
   *
   * @param value - Any value a program produced.
   */
  //% hidden
  export function imageOf(value: Value): Image {
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
}
