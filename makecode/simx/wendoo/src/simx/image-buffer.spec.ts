import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decodeImageBase64,
  decodeImageBuffer,
  decodeImageHex,
  ImageBufferErrorCode,
  type ImageBufferReading,
  type PixelImage,
} from "./image-buffer.js";
import { encodeImageHex, hexToBase64, pixelImage } from "./test-support/image-buffer-encoder.js";

/** The image `reading` holds; fails when it holds a refusal. */
function imageOf(reading: ImageBufferReading): PixelImage {
  assert.equal(reading.code, undefined);
  assert.ok(reading.image);
  return reading.image;
}

/** The rows of `image`, each the palette index of every pixel from the left. */
function rowsOf(image: PixelImage): number[][] {
  const rows: number[][] = [];
  for (let y = 0; y < image.height; y++) {
    rows.push(Array.from(image.pixels.subarray(y * image.width, (y + 1) * image.width)));
  }
  return rows;
}

/**
 * Image buffers the arcade icon encoder is pinned to produce by the arcade
 * selftest, with the images they hold.
 */
const SELFTEST_PINS: { hex: string; bpp: number; rows: number[][] }[] = [
  // img`. 1 f / a . 2`: 4 bits per pixel, wider than tall
  {
    hex: "8704030002000000a0000000010000002f000000",
    bpp: 4,
    rows: [
      [0, 1, 15],
      [10, 0, 2],
    ],
  },
  // img`1 / 2 / 3`: 4 bits per pixel, an odd height
  { hex: "870401000300000021030000", bpp: 4, rows: [[1], [2], [3]] },
  // image.create(300, 1): a width needing the high byte of its 16-bit field
  { hex: `87042c0101000000${"00000000".repeat(300)}`, bpp: 4, rows: [new Array<number>(300).fill(0)] },
  // 1 bit per pixel, 2 wide and 9 tall: rows 0, 7 and 8 lit in column 0, rows 1 and 8 in column 1
  {
    hex: "870102000900000081010201",
    bpp: 1,
    rows: [
      [1, 0],
      [0, 1],
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
      [1, 0],
      [1, 1],
    ],
  },
];

describe("image buffer decoding", () => {
  it("reads a 4-bit image wider than tall, an even row in each byte's low nibble", () => {
    const image = imageOf(decodeImageHex("8704030002000000a0000000010000002f000000"));
    assert.deepEqual([image.width, image.height, image.bpp], [3, 2, 4]);
    assert.deepEqual(rowsOf(image), [
      [0, 1, 15],
      [10, 0, 2],
    ]);
  });

  it("reads a 4-bit image of odd height, the last row alone in its byte's low nibble", () => {
    const image = imageOf(decodeImageHex("87040200050000002143050076980a00"));
    assert.deepEqual([image.width, image.height], [2, 5]);
    assert.deepEqual(rowsOf(image), [
      [1, 6],
      [2, 7],
      [3, 8],
      [4, 9],
      [5, 10],
    ]);
  });

  it("reads a 4-bit image whose width needs the high byte of its little-endian field", () => {
    const image = imageOf(decodeImageHex(`87042c0101000000${"00000000".repeat(299)}07000000`));
    assert.deepEqual([image.width, image.height], [300, 1]);
    assert.equal(image.pixels[299], 7);
    assert.equal(
      image.pixels.subarray(0, 299).every((pixel) => pixel === 0),
      true
    );
  });

  it("reads a 1-bit image, row y in bit y & 7 and each column padded to whole bytes", () => {
    const image = imageOf(decodeImageHex("870102000900000081010201"));
    assert.deepEqual([image.width, image.height, image.bpp], [2, 9, 1]);
    assert.deepEqual(rowsOf(image), SELFTEST_PINS[3].rows);
  });

  it("reads each image the arcade selftest pins its icon encoder to, and writes it back to the same bytes", () => {
    for (const pin of SELFTEST_PINS) {
      const image = imageOf(decodeImageHex(pin.hex));
      assert.equal(image.bpp, pin.bpp, pin.hex);
      assert.deepEqual(rowsOf(image), pin.rows, pin.hex);
      assert.equal(encodeImageHex(image), pin.hex);
    }
  });

  it("reads a buffer the same from its bytes, its hexadecimal and its base64, in either case of hexadecimal", () => {
    const hex = SELFTEST_PINS[0].hex;
    const fromHex = imageOf(decodeImageHex(hex));
    assert.deepEqual(imageOf(decodeImageHex(hex.toUpperCase())), fromHex);
    assert.deepEqual(imageOf(decodeImageBase64(hexToBase64(hex))), fromHex);
    assert.deepEqual(imageOf(decodeImageBuffer(Uint8Array.from(Buffer.from(hex, "hex")))), fromHex);
  });

  it("round-trips images of every height padding at both depths", () => {
    for (const bpp of [1, 4]) {
      for (let height = 1; height <= 17; height++) {
        const rows = Array.from({ length: height }, (_, y) =>
          Array.from({ length: 3 }, (_, x) => (x * 7 + y * 3) % (1 << bpp))
        );
        const image = pixelImage(bpp, rows);
        assert.deepEqual(rowsOf(imageOf(decodeImageHex(encodeImageHex(image)))), rows, `${bpp} bpp, ${height} tall`);
      }
    }
  });

  it("refuses a buffer by stable code, never throwing: wrong magic, unsupported depth, a size its header disagrees with, no pixels", () => {
    const cases: [string, ImageBufferErrorCode][] = [
      ["8804030002000000a0000000010000002f000000", ImageBufferErrorCode.MAGIC_UNKNOWN],
      ["", ImageBufferErrorCode.MAGIC_UNKNOWN],
      ["8702010003000000", ImageBufferErrorCode.BPP_UNSUPPORTED],
      ["8708010001000000ffffffff", ImageBufferErrorCode.BPP_UNSUPPORTED],
      ["8704030002000000a0000000010000002f0000", ImageBufferErrorCode.SIZE_MISMATCH],
      ["8704030002000000a0000000010000002f00000000", ImageBufferErrorCode.SIZE_MISMATCH],
      ["870403", ImageBufferErrorCode.SIZE_MISMATCH],
      ["8704000002000000", ImageBufferErrorCode.EMPTY],
      ["8701020000000000", ImageBufferErrorCode.EMPTY],
    ];
    for (const [hex, code] of cases) {
      assert.deepEqual(decodeImageHex(hex), { code }, hex);
    }
  });

  it("refuses text that does not spell whole bytes", () => {
    for (const text of ["870", "87zz", "87 04"]) {
      assert.deepEqual(decodeImageHex(text), { code: ImageBufferErrorCode.TEXT_MALFORMED }, text);
    }
    assert.deepEqual(decodeImageBase64("not base64!"), { code: ImageBufferErrorCode.TEXT_MALFORMED });
  });
});
