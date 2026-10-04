/**
 * The arcade icon encoder: renders a registration's icon -- an Arcade
 * `Image`, such as an img literal -- into the text form the catalog carries:
 * lowercase hexadecimal, two digits per byte, of the image as MakeCode's own
 * image buffer, the bytes `image.ofBuffer` reads and a project's image assets
 * are stored as.
 *
 * The buffer is an 8-byte header -- 0x87, the image's bits per pixel (1 or
 * 4), its width and its height each a little-endian 16-bit integer, then two
 * zero bytes -- followed by the image's columns from the left, each column's
 * pixels from the top. A byte holds `8 / bpp` pixels, the topmost in its
 * lowest bits: at 4 bits per pixel, an even row in the low nibble and the
 * odd row below it in the high nibble, each palette index as it is, 0 for a
 * transparent pixel; at 1 bit per pixel, one row per bit. Each column is
 * padded with zero bytes: at 4 bits per pixel to a multiple of 4 bytes, at 1
 * bit per pixel to a whole byte; the encoder reads padding pixels through
 * `getPixel`, which answers 0 below an image's last row.
 */
namespace wendoo {
  /** Byte opening every MakeCode image buffer. */
  const IMAGE_BUFFER_MAGIC = 0x87;

  /** Lowercase two-digit hexadecimal of the byte `byte`. */
  function byteHex(byte: number): string {
    return byte < 0x10 ? `0${hexU32(byte)}` : hexU32(byte);
  }

  /** Lowercase hexadecimal of `value` as a little-endian 16-bit integer. */
  function u16Hex(value: number): string {
    return byteHex(value & 0xff) + byteHex((value >> 8) & 0xff);
  }

  /** How many bytes one column `height` pixels tall takes in an image buffer of `bpp` bits per pixel. */
  function columnBytes(height: number, bpp: number): number {
    return bpp === 1 ? (height + 7) >> 3 : ((height * bpp + 31) >> 5) << 2;
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
      const bpp = picture.isMono ? 1 : 4;
      const width = picture.width;
      const height = picture.height;
      let out = `${byteHex(IMAGE_BUFFER_MAGIC)}${byteHex(bpp)}${u16Hex(width)}${u16Hex(height)}0000`;
      const perByte = 8 / bpp;
      const column = columnBytes(height, bpp);
      for (let x = 0; x < width; x++) {
        for (let b = 0; b < column; b++) {
          let byte = 0;
          for (let k = 0; k < perByte; k++) {
            byte |= picture.getPixel(x, b * perByte + k) << (k * bpp);
          }
          out += byteHex(byte);
        }
      }
      return out;
    }
  }
}
