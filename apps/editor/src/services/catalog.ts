/** Stable code of a catalog text the editor cannot read as a catalog document. */
export const CATALOG_UNREADABLE = "CATALOG_UNREADABLE";

/** One tile of a pack, as the catalog document declares it. */
export interface CatalogTile {
  /** The tile's name. */
  readonly name: string;
  /** The tile's kind, or `undefined` when the registration declared none. */
  readonly kind: string | undefined;
}

/** One vocabulary pack of the catalog. */
export interface CatalogPack {
  /** The pack's name. */
  readonly name: string;
  /** The pack's tiles, in registration order. */
  readonly tiles: readonly CatalogTile[];
}

/** A catalog document read for showing. */
export interface ParsedCatalog {
  /** The catalog's packs, in registration order. Empty when the document declares none. */
  readonly packs: readonly CatalogPack[];
  /** {@link CATALOG_UNREADABLE} when the text could not be read, and `undefined` when it was. */
  readonly errorCode: typeof CATALOG_UNREADABLE | undefined;
}

/** Whether `value` is an object with a string `name`, the shape every named catalog entry carries. */
function isNamed(value: unknown): value is { name: string } {
  return typeof value === "object" && value !== null && typeof (value as { name?: unknown }).name === "string";
}

/**
 * Reads a catalog's serialized text into the packs and tiles the editor
 * shows. Entries without the declared shape are dropped; text that is not a
 * JSON document at all yields no packs and {@link CATALOG_UNREADABLE}.
 */
export function parseCatalog(text: string): ParsedCatalog {
  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch {
    return { packs: [], errorCode: CATALOG_UNREADABLE };
  }
  const declared = (document as { packs?: unknown } | null)?.packs;
  const packs: CatalogPack[] = [];
  if (Array.isArray(declared)) {
    for (const pack of declared) {
      if (!isNamed(pack)) continue;
      const tiles: CatalogTile[] = [];
      const declaredTiles = (pack as { tiles?: unknown }).tiles;
      if (Array.isArray(declaredTiles)) {
        for (const tile of declaredTiles) {
          if (!isNamed(tile)) continue;
          const kind = (tile as { kind?: unknown }).kind;
          tiles.push({ name: tile.name, kind: typeof kind === "string" ? kind : undefined });
        }
      }
      packs.push({ name: pack.name, tiles });
    }
  }
  return { packs, errorCode: undefined };
}
