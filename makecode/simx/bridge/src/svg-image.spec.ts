import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { imageSvg } from "./svg-image.js";
import { pixelImage } from "./test-support/image-buffer-encoder.js";

/** MakeCode Arcade's default palette. */
const ARCADE_PALETTE = [
  "#000000",
  "#ffffff",
  "#ff2121",
  "#ff93c4",
  "#ff8135",
  "#fff609",
  "#249ca3",
  "#78dc52",
  "#003fad",
  "#87f2ff",
  "#8e2ec4",
  "#a4839f",
  "#5c406c",
  "#e5cdc4",
  "#91463d",
  "#000000",
];

const DATA_URI_PREFIX = "data:image/svg+xml;base64,";

/** The SVG document the data URI `url` carries. */
function svgOf(url: string): string {
  assert.ok(url.startsWith(DATA_URI_PREFIX));
  return Buffer.from(url.slice(DATA_URI_PREFIX.length), "base64").toString("utf8");
}

/** The SVG document of a `width` by `height` image painted with `rects`. */
function svgDocument(width: number, height: number, rects: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">${rects}</svg>`;
}

describe("image SVG rendering", () => {
  it("paints each opaque pixel in its palette color and leaves index 0 transparent", () => {
    const rendered = imageSvg(
      pixelImage(4, [
        [0, 1, 15],
        [10, 0, 2],
      ]),
      ARCADE_PALETTE
    );
    assert.equal(
      svgOf(rendered.url),
      svgDocument(
        3,
        2,
        '<rect x="1" y="0" width="1" height="1" fill="#ffffff"/>' +
          '<rect x="2" y="0" width="1" height="1" fill="#000000"/>' +
          '<rect x="0" y="1" width="1" height="1" fill="#8e2ec4"/>' +
          '<rect x="2" y="1" width="1" height="1" fill="#ff2121"/>'
      )
    );
    assert.equal(rendered.unpainted, 0);
  });

  it("merges each horizontal run of one color into one rect, also across indices sharing a color", () => {
    const palette = ["#000000", "#112233", "#445566", "#112233"];
    const rendered = imageSvg(pixelImage(4, [[1, 1, 3, 0, 2, 2, 1]]), palette);
    assert.equal(
      svgOf(rendered.url),
      svgDocument(
        7,
        1,
        '<rect x="0" y="0" width="3" height="1" fill="#112233"/>' +
          '<rect x="4" y="0" width="2" height="1" fill="#445566"/>' +
          '<rect x="6" y="0" width="1" height="1" fill="#112233"/>'
      )
    );
  });

  it("colors pixels from the palette it is given, and paints a 1-bit image's set pixels in palette index 1", () => {
    const image = pixelImage(1, [
      [1, 0],
      [1, 1],
    ]);
    const light = svgOf(imageSvg(image, ["#000000", "#ffffff"]).url);
    const tinted = svgOf(imageSvg(image, ["#000000", "#aa00aa"]).url);
    assert.equal(
      light,
      svgDocument(
        2,
        2,
        '<rect x="0" y="0" width="1" height="1" fill="#ffffff"/><rect x="0" y="1" width="2" height="1" fill="#ffffff"/>'
      )
    );
    assert.equal(tinted, light.replaceAll("#ffffff", "#aa00aa"));
  });

  it("renders a fully transparent image as an empty document of its size", () => {
    assert.equal(svgOf(imageSvg(pixelImage(4, [[0, 0, 0]]), ARCADE_PALETTE).url), svgDocument(3, 1, ""));
  });

  it("renders the same image and palette to the same data URI every time, writing colors in lowercase", () => {
    const image = pixelImage(4, [
      [1, 2],
      [2, 1],
    ]);
    const first = imageSvg(image, ["#000000", "#ABCDEF", "#00FF00"]).url;
    assert.equal(imageSvg(image, ["#000000", "#abcdef", "#00ff00"]).url, first);
    assert.equal(svgOf(first).includes("#abcdef"), true);
  });

  it("leaves unpainted, and counts, each opaque pixel whose index has no #rrggbb color in the palette", () => {
    const rendered = imageSvg(pixelImage(4, [[1, 5, 2, 1]]), ["#000000", "#ffffff", "red"]);
    assert.equal(
      svgOf(rendered.url),
      svgDocument(
        4,
        1,
        '<rect x="0" y="0" width="1" height="1" fill="#ffffff"/><rect x="3" y="0" width="1" height="1" fill="#ffffff"/>'
      )
    );
    assert.equal(rendered.unpainted, 2);
  });
});
