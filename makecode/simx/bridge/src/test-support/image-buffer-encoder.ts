import type { PixelImage } from "../image-buffer.js";

/**
 * Lowercase hexadecimal of `image` as MakeCode's own image buffer, written
 * the way the arcade icon encoder writes it: 0x87, the bits per pixel, the
 * width and height as little-endian 16-bit integers, two zero bytes, then
 * each column from the left, its pixels from the top packed `8 / bpp` to a
 * byte with the topmost in the lowest bits, each column padded with zero
 * bytes -- at 1 bit per pixel to a whole byte, otherwise to a multiple of 4
 * bytes.
 *
 * @param image - The image to encode; its `pixels` are row-major.
 */
export function encodeImageHex(image: PixelImage): string {
  const { width, height, bpp, pixels } = image;
  const column = bpp === 1 ? (height + 7) >> 3 : ((height * bpp + 31) >> 5) << 2;
  const perByte = 8 / bpp;
  const bytes = [0x87, bpp, width & 0xff, width >> 8, height & 0xff, height >> 8, 0, 0];
  for (let x = 0; x < width; x++) {
    for (let b = 0; b < column; b++) {
      let byte = 0;
      for (let k = 0; k < perByte; k++) {
        const y = b * perByte + k;
        if (y < height) byte |= pixels[y * width + x] << (k * bpp);
      }
      bytes.push(byte);
    }
  }
  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * An image of `bpp` bits per pixel whose rows are `rows`, each the palette
 * index of every pixel from the left.
 */
export function pixelImage(bpp: number, rows: readonly (readonly number[])[]): PixelImage {
  const height = rows.length;
  const width = height === 0 ? 0 : rows[0].length;
  return { width, height, bpp, pixels: Uint8Array.from(rows.flat()) };
}

/** Base64 of the bytes `hex` spells, two hexadecimal digits per byte. */
export function hexToBase64(hex: string): string {
  return Buffer.from(hex, "hex").toString("base64");
}
