import type { PixelImage } from "./image-buffer.js";

/** Stable codes of the problems {@link imageSvg} reports about an image it renders. */
export const SvgImageProblemCode = {
  /** Opaque pixels index colors the palette does not hold as `#rrggbb`; they are left unpainted. */
  COLOR_OUTSIDE_PALETTE: "IMAGE_COLOR_OUTSIDE_PALETTE",
} as const;

/** Union of all {@link SvgImageProblemCode} values. */
export type SvgImageProblemCode = (typeof SvgImageProblemCode)[keyof typeof SvgImageProblemCode];

/** An image rendered by {@link imageSvg}. */
export interface ImageSvg {
  /** A data URI of the SVG document, usable as an image source as it is. */
  readonly url: string;
  /**
   * How many opaque pixels were left unpainted because the palette holds no
   * `#rrggbb` color at their index; 0 when every pixel was painted.
   */
  readonly unpainted: number;
}

/** A palette color as the SVG document writes it. */
const PALETTE_COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * Renders `image` as an SVG document, `width` by `height` with a viewBox of
 * its pixel dimensions and `shape-rendering="crispEdges"`, holding one rect
 * per horizontal run of same-colored pixels, rows from the top and runs from
 * the left. A pixel of index 0 is transparent, at every bits per pixel, and
 * is left out; any other pixel is painted in the palette's color at its
 * index, written in lowercase. The same image and palette always render to
 * the same data URI.
 *
 * @param image - The image to render.
 * @param palette - The colors the image's pixels index, as `#rrggbb` strings; any length.
 */
export function imageSvg(image: PixelImage, palette: readonly string[]): ImageSvg {
  const { width, height, pixels } = image;
  const colors = palette.map((color) => (PALETTE_COLOR.test(color) ? color.toLowerCase() : undefined));
  // the color pixel `i` is painted in, or undefined when it is left out
  const fillAt = (i: number): string | undefined => (pixels[i] === 0 ? undefined : colors[pixels[i]]);
  let unpainted = 0;
  for (let i = 0; i < pixels.length; i++) {
    if (pixels[i] !== 0 && fillAt(i) === undefined) unpainted++;
  }
  let rects = "";
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let x = 0;
    while (x < width) {
      const fill = fillAt(row + x);
      let end = x + 1;
      while (end < width && fillAt(row + end) === fill) end++;
      if (fill !== undefined) rects += `<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${fill}"/>`;
      x = end;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">${rects}</svg>`;
  return { url: `data:image/svg+xml;base64,${btoa(svg)}`, unpainted };
}
