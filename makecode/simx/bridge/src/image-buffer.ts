/**
 * MakeCode's own image buffer: the bytes `image.ofBuffer` reads, in which
 * the arcade icon encoder writes each tile icon and a project's asset file
 * stores each image (base64 of MIME type `image/x-mkcd-f4`).
 *
 * The buffer is an 8-byte header -- the magic byte 0x87, the bits per pixel,
 * the width and the height each a little-endian 16-bit integer, two padding
 * bytes -- followed by the image's columns from the left, each column's
 * pixels from the top. A byte holds `8 / bpp` pixels, the topmost in its
 * lowest bits, so at 4 bits per pixel an even row sits in the low nibble and
 * at 1 bit per pixel row `y` in bit `y & 7`. Each column is padded with zero
 * bytes: at 1 bit per pixel to a whole byte, otherwise to a multiple of 4
 * bytes. A pixel's value is an index into the project's palette.
 */

/** The byte opening every image buffer. */
const IMAGE_BUFFER_MAGIC = 0x87;

/** Length of the header preceding the pixels, in bytes. */
const HEADER_BYTES = 8;

/** The bits per pixel MakeCode's image reader accepts. */
const SUPPORTED_BPP: ReadonlySet<number> = new Set([1, 4]);

/** Stable codes of the image buffers {@link decodeImageBuffer} refuses. */
export const ImageBufferErrorCode = {
  /** The text holding the buffer does not spell whole bytes in its encoding (hexadecimal or base64). */
  TEXT_MALFORMED: "IMAGE_BUFFER_TEXT_MALFORMED",
  /** The buffer does not open with the image buffer's magic byte. */
  MAGIC_UNKNOWN: "IMAGE_BUFFER_MAGIC_UNKNOWN",
  /** The header declares a number of bits per pixel MakeCode's image reader does not accept. */
  BPP_UNSUPPORTED: "IMAGE_BUFFER_BPP_UNSUPPORTED",
  /** The buffer's length is not the one its header's width, height and bits per pixel call for. */
  SIZE_MISMATCH: "IMAGE_BUFFER_SIZE_MISMATCH",
  /** The header declares no pixels: a width or height of 0, which MakeCode's image reader reads as no image. */
  EMPTY: "IMAGE_BUFFER_EMPTY",
} as const;

/** Union of all {@link ImageBufferErrorCode} values. */
export type ImageBufferErrorCode = (typeof ImageBufferErrorCode)[keyof typeof ImageBufferErrorCode];

/** An image read from an image buffer. */
export interface PixelImage {
  /** Width, in pixels. */
  readonly width: number;
  /** Height, in pixels. */
  readonly height: number;
  /** Bits per pixel the buffer declared. */
  readonly bpp: number;
  /** The palette index of every pixel, row by row from the top, each row from the left: `pixels[y * width + x]`. */
  readonly pixels: Uint8Array;
}

/** What {@link decodeImageBuffer} read: the image, or the code of the refusal. */
export type ImageBufferReading =
  | { image: PixelImage; code?: undefined }
  | { image?: undefined; code: ImageBufferErrorCode };

/**
 * How many bytes one column `height` pixels tall takes at `bpp` bits per
 * pixel: at 1 bit per pixel padded to a whole byte, otherwise to a multiple
 * of 4 bytes.
 */
function columnBytes(height: number, bpp: number): number {
  return bpp === 1 ? (height * bpp + 7) >> 3 : ((height * bpp + 31) >> 5) << 2;
}

/**
 * Reads `bytes` as an image buffer, as MakeCode's image reader does. Never
 * throws: a buffer that is not one is refused by its {@link ImageBufferErrorCode}.
 *
 * @param bytes - The buffer.
 */
export function decodeImageBuffer(bytes: Uint8Array): ImageBufferReading {
  if (bytes.length === 0 || bytes[0] !== IMAGE_BUFFER_MAGIC) return { code: ImageBufferErrorCode.MAGIC_UNKNOWN };
  if (bytes.length < HEADER_BYTES) return { code: ImageBufferErrorCode.SIZE_MISMATCH };
  const bpp = bytes[1];
  if (!SUPPORTED_BPP.has(bpp)) return { code: ImageBufferErrorCode.BPP_UNSUPPORTED };
  const width = bytes[2] | (bytes[3] << 8);
  const height = bytes[4] | (bytes[5] << 8);
  const column = columnBytes(height, bpp);
  if (bytes.length !== HEADER_BYTES + width * column) return { code: ImageBufferErrorCode.SIZE_MISMATCH };
  if (width === 0 || height === 0) return { code: ImageBufferErrorCode.EMPTY };
  const perByte = 8 / bpp;
  const mask = (1 << bpp) - 1;
  const pixels = new Uint8Array(width * height);
  for (let x = 0; x < width; x++) {
    const start = HEADER_BYTES + x * column;
    for (let y = 0; y < height; y++) {
      const byte = bytes[start + Math.floor(y / perByte)];
      pixels[y * width + x] = (byte >> ((y % perByte) * bpp)) & mask;
    }
  }
  return { image: { width, height, bpp, pixels } };
}

/** Hexadecimal of whole bytes, two digits per byte, in either case. */
const HEX_BYTES = /^(?:[0-9a-fA-F]{2})*$/;

/**
 * Reads `text`, hexadecimal of an image buffer two digits per byte, as
 * {@link decodeImageBuffer} reads the buffer it spells; text that spells no
 * whole bytes is refused with {@link ImageBufferErrorCode.TEXT_MALFORMED}.
 *
 * @param text - The buffer's hexadecimal, in either case.
 */
export function decodeImageHex(text: string): ImageBufferReading {
  if (!HEX_BYTES.test(text)) return { code: ImageBufferErrorCode.TEXT_MALFORMED };
  const bytes = new Uint8Array(text.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(text.slice(i * 2, i * 2 + 2), 16);
  return decodeImageBuffer(bytes);
}

/**
 * Reads `text`, base64 of an image buffer, as {@link decodeImageBuffer}
 * reads the buffer it spells; text that is not base64 is refused with
 * {@link ImageBufferErrorCode.TEXT_MALFORMED}.
 *
 * @param text - The buffer's base64.
 */
export function decodeImageBase64(text: string): ImageBufferReading {
  let binary: string;
  try {
    binary = atob(text);
  } catch {
    return { code: ImageBufferErrorCode.TEXT_MALFORMED };
  }
  return decodeImageBuffer(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}
