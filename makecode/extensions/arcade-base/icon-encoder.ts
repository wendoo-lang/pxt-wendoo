/**
 * The arcade icon encoder: renders a registration's icon -- an Arcade
 * `Image`, such as an img literal -- into the text form the catalog carries.
 *
 * The text is lowercase hexadecimal: the image's width, then its height,
 * each a ULEB128 unsigned integer, two digits per byte; then one digit per
 * pixel, its palette index, 0 for a transparent pixel, row by row from the
 * top and each row from the left; then one `0` digit when the pixel count is
 * odd, completing the last byte. A 16 by 16 icon is `1010` followed by its
 * 256 pixel digits.
 */
namespace wendoo {
  /** Lowercase two-digit hexadecimal of the byte `byte`. */
  function byteHex(byte: number): string {
    return byte < 0x10 ? `0${hexU32(byte)}` : hexU32(byte);
  }

  /** Lowercase hexadecimal of `value` as a ULEB128 unsigned integer, two digits per byte. */
  function varUintHex(value: number): string {
    let out = "";
    let rest = value;
    while (rest >= 0x80) {
      out += byteHex((rest % 0x80) | 0x80);
      rest = Math.floor(rest / 0x80);
    }
    return out + byteHex(rest);
  }

  /**
   * The arcade icon encoder: the {@link CatalogIconEncoder} the arcade
   * extension publishes its catalog through.
   */
  //% hidden
  export class ImageIconEncoder extends CatalogIconEncoder {
    constructor() {
      super();
    }

    /**
     * The catalog text form of the image `icon`, as this file describes it;
     * `""` when `icon` is not an object, and therefore no image.
     *
     * @param icon - The icon a registration declared.
     */
    // biome-ignore lint/suspicious/noExplicitAny: pxt's static subset has no unknown type.
    encode(icon: any): string {
      if (typeof icon !== "object" || !icon) {
        return "";
      }
      const picture = icon as Image;
      let out = varUintHex(picture.width) + varUintHex(picture.height);
      for (let y = 0; y < picture.height; y++) {
        for (let x = 0; x < picture.width; x++) {
          out += hexU32(picture.getPixel(x, y));
        }
      }
      return (picture.width * picture.height) % 2 === 1 ? `${out}0` : out;
    }
  }
}
