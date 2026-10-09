import type { WendooEnvironment } from "@wendoo/core/app";
import { mkVariableFactoryTileId } from "@wendoo/core/app";
import type { IBrainTileDef, ITileCatalog } from "@wendoo/core/brain";
import type { DocsRegistry, DocsTileEntry, DocTab } from "@wendoo/docs";
import { buildDocsRegistry } from "@wendoo/docs";
import type { PackLiteral, TypePage } from "../services/authoring-environment";
import { dataTypesCategory, tileKindCategories, undocumentedTileIds, unlistedTileKinds } from "./manifest";

/**
 * The docs entry `tileDef` gets, carrying `content`: a tile of one of the
 * {@link unlistedTileKinds} carrying docs gets an unlisted entry, carrying no
 * category; a tile of kind `factory` carrying docs an entry under
 * {@link dataTypesCategory}, a struct type's variable factory's entry being
 * its type's page; and any other tile an entry under its kind's category.
 * `undefined` -- no entry -- for an unlisted-kind or factory tile carrying no
 * docs, and for a tile of a kind without a category.
 */
function docsEntryFor(tileDef: IBrainTileDef, content: string): DocsTileEntry | undefined {
  const entry = { tileId: tileDef.tileId, tags: [], content };
  if (unlistedTileKinds.has(tileDef.kind)) {
    return content === "" ? undefined : entry;
  }
  if (tileDef.kind === "factory") {
    return content === "" ? undefined : { ...entry, category: dataTypesCategory };
  }
  const category = tileKindCategories[tileDef.kind];
  return category === undefined ? undefined : { ...entry, category };
}

/**
 * Derives docs entries for the visible catalog tiles, each carrying its
 * tile's docs markdown, or empty content when the tile carries none, as
 * {@link docsEntryFor} gives them. Skips hidden and deprecated tiles, tiles
 * for which `isDocumented` reports an existing entry, curated exclusions, the
 * tiles `valueLiteralTileIds` names, and tiles given no entry.
 */
function buildCatalogTileDocEntries(
  catalog: ITileCatalog,
  isDocumented: (tileId: string) => boolean,
  valueLiteralTileIds: ReadonlySet<string>
): DocsTileEntry[] {
  const entries: DocsTileEntry[] = [];
  const all = catalog.getAll();
  for (let i = 0; i < all.size(); i++) {
    const tileDef = all.get(i)!;
    if (tileDef.hidden || tileDef.deprecated) {
      continue;
    }
    if (
      isDocumented(tileDef.tileId) ||
      undocumentedTileIds.has(tileDef.tileId) ||
      valueLiteralTileIds.has(tileDef.tileId)
    ) {
      continue;
    }
    const entry = docsEntryFor(tileDef, tileDef.metadata?.docsMarkdown ?? "");
    if (entry !== undefined) {
      entries.push(entry);
    }
  }
  return entries;
}

/**
 * Builds the editor's docs registry: the core docs, and an entry for each
 * visible tile in `environment`'s catalog the core docs do not document --
 * the tiles the session's packs bind among them -- under its kind's category
 * and with the docs markdown the tile carries, or empty content when it
 * carries none; a type's page is the entry of its variable factory, listed
 * under {@link dataTypesCategory} while it carries docs, and the page of a
 * type no variable factory stands for is listed there too, under the id its
 * factory would hold, by the type's label and icon; and an output or
 * accessor tile carrying docs gets an unlisted entry, in no list or search,
 * that its tile's docs action and a `tile:` reference open by its tile id.
 * Build a new registry whenever the environment is rebuilt.
 *
 * @param environment - The brains store's current environment.
 * @param valueLiteralTileIds - Tile ids of the value literals the environment's catalog holds for the project's assets and brains and for the literals its packs' types declare; these tiles get no entry.
 * @param typePages - The pages of the environment's types no variable factory stands for.
 */
export function createEditorDocsRegistry(
  environment: WendooEnvironment,
  valueLiteralTileIds: ReadonlySet<string>,
  typePages: readonly TypePage[] = []
): DocsRegistry {
  const registry = buildDocsRegistry();
  const catalogTileEntries = buildCatalogTileDocEntries(
    environment.brainServices.edit.tiles,
    (tileId) => registry.tiles.has(tileId),
    valueLiteralTileIds
  );
  const typePageEntries = typePages.map(
    ({ tileId, label, iconUrl, docs }): DocsTileEntry => ({
      tileId,
      tags: [],
      category: dataTypesCategory,
      content: docs,
      label,
      ...(iconUrl === undefined ? {} : { iconUrl }),
    })
  );
  const entries = [...catalogTileEntries, ...typePageEntries];
  if (entries.length > 0) {
    registry.register({ tiles: entries });
  }
  return registry;
}

/** The docs sidebar a tile's docs action drives, as `useDocsSidebar` gives it. */
export interface TileDocsSidebar {
  /** The registry the sidebar shows. */
  readonly registry: DocsRegistry;
  /** Opens the sidebar on the page the sidebar's own rules give `tileDef`. */
  openDocsForTile(tileDef: IBrainTileDef): void;
  /** Opens the sidebar on whatever it shows. */
  open(): void;
  /** Shows the entry `key` of the tab `tab`. */
  navigateToEntry(tab: DocTab, key: string): void;
}

/**
 * The docs action of the brain editor's tiles: a literal one of
 * `packLiterals` holds opens the page of its type while `sidebar`'s registry
 * holds one, under the id of the type's variable factory tile; every other
 * tile, and such a literal while its type has no page, opens as the
 * sidebar's own docs action opens it.
 *
 * @param sidebar - The docs sidebar to open.
 * @param packLiterals - The environment's pack literals, keyed by tile id.
 */
export function createTileDocsAction(
  sidebar: TileDocsSidebar,
  packLiterals: ReadonlyMap<string, PackLiteral>
): (tileDef: IBrainTileDef) => void {
  return (tileDef) => {
    const literal = packLiterals.get(tileDef.tileId);
    const typePage = literal === undefined ? undefined : mkVariableFactoryTileId(literal.typeId);
    if (typePage === undefined || !sidebar.registry.tiles.has(typePage)) {
      sidebar.openDocsForTile(tileDef);
      return;
    }
    sidebar.open();
    sidebar.navigateToEntry("tiles", typePage);
  };
}

/** Tile catalog that resolves a tile id across every catalog the environment registers. */
export function createDocsTileCatalog(environment: WendooEnvironment): ITileCatalog {
  return {
    get: (tileId: string) => {
      for (const catalog of environment.tileCatalogs()) {
        const def = catalog.get(tileId);
        if (def) {
          return def;
        }
      }
      return undefined;
    },
  } as ITileCatalog;
}
