import { decodeImageHex, ImageBufferErrorCode, type ImageBufferReading } from "./image-buffer.js";
import type { SimxLog } from "./simx-bridge.js";
import { imageSvg, SvgImageProblemCode } from "./svg-image.js";

/** Stable codes of the problems {@link enrichCatalogIcons} reports about a catalog it renders. */
export const CatalogIconProblemCode = {
  /** No icon palette is known for the hosting target, or no target is declared; every icon of the catalog is left out. */
  TARGET_PALETTE_MISSING: "CATALOG_ICON_TARGET_PALETTE_MISSING",
} as const;

/** Union of all {@link CatalogIconProblemCode} values. */
export type CatalogIconProblemCode = (typeof CatalogIconProblemCode)[keyof typeof CatalogIconProblemCode];

/**
 * The data URI rendering the catalog icon `icon` under `palette`, or
 * `undefined` when `icon` is not hexadecimal of an image buffer; that
 * refusal, and pixels the palette cannot paint, are logged by code naming
 * `where`.
 */
function iconUrl(icon: unknown, palette: readonly string[], where: string, log: SimxLog): string | undefined {
  const reading: ImageBufferReading =
    typeof icon === "string" ? decodeImageHex(icon) : { code: ImageBufferErrorCode.TEXT_MALFORMED };
  if (reading.code !== undefined) {
    log.error(
      `${reading.code}: the catalog icon of ${where} is not an image buffer; it is published without its icon.`
    );
    return undefined;
  }
  const rendered = imageSvg(reading.image, palette);
  if (rendered.unpainted > 0) {
    log.error(
      `${SvgImageProblemCode.COLOR_OUTSIDE_PALETTE}: the catalog icon of ${where} indexes colors the target's palette lacks; ${rendered.unpainted} pixels are left unpainted.`
    );
  }
  return rendered.url;
}

/**
 * The catalog text `text` with every icon rendered for the editor: each
 * `icon` field -- hexadecimal of an image buffer, on a type, a tile or a
 * slot -- is replaced in its place by an `iconUrl` field holding the data
 * URI of the icon rendered under `palette`. An icon that is not an image
 * buffer is left out with no `iconUrl`, and logged by code naming the entry
 * carrying it; the rest of the catalog is rendered all the same. While
 * `palette` is `undefined` every icon is left out without an `iconUrl`,
 * logged once for the catalog by
 * {@link CatalogIconProblemCode.TARGET_PALETTE_MISSING} naming `target`. No
 * `icon` field remains in the result.
 *
 * Text carrying no `icon` field, and text that is not a JSON document, is
 * returned verbatim. Never throws.
 *
 * @param text - The catalog text, as the program posted it.
 * @param target - Id of the hosting MakeCode target, or `undefined` while none is declared.
 * @param palette - The hosting target's icon palette, or `undefined` when it has none.
 * @param log - Receives a coded line for every icon that cannot be rendered in full, and one line for the catalog while `palette` is `undefined`.
 */
export function enrichCatalogIcons(
  text: string,
  target: string | undefined,
  palette: readonly string[] | undefined,
  log: SimxLog
): string {
  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch {
    return text;
  }
  let carriesIcons = false;
  // `where` names the entry holding `value`: its pack and entry names, by `/`;
  // an entry is named by its `name`, else its `tileId`, else its `type`
  const render = (value: unknown, where: string): unknown => {
    if (Array.isArray(value)) return value.map((item) => render(item, where));
    if (typeof value !== "object" || value === null) return value;
    const entry = value as Record<string, unknown>;
    const name =
      typeof entry.name === "string" ? entry.name : typeof entry.tileId === "string" ? entry.tileId : entry.type;
    const here = typeof name !== "string" ? where : where === "" ? name : `${where}/${name}`;
    const fields: [string, unknown][] = [];
    for (const [key, field] of Object.entries(entry)) {
      if (key !== "icon") {
        fields.push([key, render(field, here)]);
        continue;
      }
      carriesIcons = true;
      const url = palette === undefined ? undefined : iconUrl(field, palette, here, log);
      if (url !== undefined) fields.push(["iconUrl", url]);
    }
    return Object.fromEntries(fields);
  };
  const rendered = render(document, "");
  if (!carriesIcons) return text;
  if (palette === undefined) {
    const named = target === undefined ? "no declared target" : `the target ${target}`;
    log.error(
      `${CatalogIconProblemCode.TARGET_PALETTE_MISSING}: ${named} has no icon palette; the catalog is published without its icons.`
    );
  }
  return JSON.stringify(rendered);
}
