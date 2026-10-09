import { decodeImageHex, ImageBufferErrorCode, type ImageBufferReading } from "./image-buffer.js";
import type { SimxLog } from "./simx-bridge.js";
import { imageSvg, SvgImageProblemCode } from "./svg-image.js";

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
      `${SvgImageProblemCode.COLOR_OUTSIDE_PALETTE}: the catalog icon of ${where} indexes colors the project's palette lacks; ${rendered.unpainted} pixels are left unpainted.`
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
 * `palette` is `undefined` every icon is left out without an `iconUrl`. No
 * `icon` field remains in the result.
 *
 * Text carrying no `icon` field, and text that is not a JSON document, is
 * returned verbatim. Never throws.
 *
 * @param text - The catalog text, as the program posted it.
 * @param palette - The project's palette, or `undefined` while it is not known.
 * @param log - Receives a coded line for every icon that cannot be rendered in full.
 */
export function enrichCatalogIcons(text: string, palette: readonly string[] | undefined, log: SimxLog): string {
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
  return carriesIcons ? JSON.stringify(rendered) : text;
}
