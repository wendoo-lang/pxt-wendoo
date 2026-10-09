import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { IBrainTileDef, WendooEnvironment } from "@wendoo/core/app";
import { mkActuatorTileId, mkSensorTileId, mkVariableFactoryTileId } from "@wendoo/core/app";
import { coreConceptDocs } from "@wendoo/core/docs";
import { mkTypeId, NativeType } from "@wendoo/core/runtime";
import { listedTileEntries } from "@wendoo/docs/DocsSidebar";
import type { AuthoringEnvironment } from "../services/authoring-environment.js";
import { buildAuthoringEnvironment } from "../services/authoring-environment.js";
import { ASSET_CATALOG, assetCatalogIds, picture, SHOW, SPOT } from "../test-support/asset-catalog.js";
import { BRAIN_CATALOG, brainCatalogIds } from "../test-support/brain-catalog.js";
import { arcadeCatalog, arcadeIds } from "../test-support/vm-programs.js";
import { createDocsTileCatalog, createEditorDocsRegistry } from "./docs-registry.js";
import { dataTypesCategory, tileKindCategories, undocumentedTileIds, unlistedTileKinds } from "./manifest.js";

/**
 * Tile kinds the core-catalog sweeps below leave out: a tile of these kinds
 * gets a docs entry only while it carries docs, and no core tile of the kind
 * carries any.
 */
const EXCLUDED_KINDS = new Set<string>(["output"]);

/**
 * Individual visible core tiles with no docs entry of their own: the
 * parenthesis tiles and the boolean and nil value literals.
 */
const EXCLUDED_TILE_IDS = [
  "tile.cf->open-paren",
  "tile.cf->close-paren",
  "tile.literal->boolean:<boolean>->true",
  "tile.literal->boolean:<boolean>->false",
  "tile.literal->nil:<nil>->nil",
];

/**
 * Core-owned docs entries whose markdown body is missing: the core manifest
 * registers these tile ids but ships no content for their content keys.
 * Shrink-only.
 */
const CORE_ENTRIES_WITHOUT_CONTENT = [
  "tile.var.factory->boolean",
  "tile.var.factory->number",
  "tile.var.factory->string",
  "tile.lit.factory->number",
  "tile.lit.factory->string",
];

/** Document id of the one brain the brain-literal environment holds. */
const HELD_BRAIN_ID = "heldBrain0000001";

/** The text a tile's docs markdown writes for the tile's own id. */
// biome-ignore lint/suspicious/noTemplateCurlyInString: the placeholder is the literal text doc authors write
const TILE_ID_PLACEHOLDER = "${tileId}";

/** Docs markdown naming its own tile twice through the placeholder. */
const PLACEHOLDER_DOCS = `head ${TILE_ID_PLACEHOLDER} middle ${TILE_ID_PLACEHOLDER} tail`;

/** {@link ASSET_CATALOG}, its tile named `name` carrying `docs`. */
function catalogDocumenting(name: string, docs: string): string {
  const catalog = JSON.parse(ASSET_CATALOG) as { packs: { tiles: { name: string; docs?: string }[] }[] };
  const tile = catalog.packs.flatMap((pack) => pack.tiles).find((entry) => entry.name === name);
  assert.ok(tile, `the catalog declares ${name}`);
  tile.docs = docs;
  return JSON.stringify(catalog);
}

/** Every catalog tile of `environment` that is neither hidden nor deprecated. */
function visibleCatalogTiles(environment: WendooEnvironment): IBrainTileDef[] {
  const tiles: IBrainTileDef[] = [];
  for (const catalog of environment.tileCatalogs()) {
    const all = catalog.getAll();
    for (let i = 0; i < all.size(); i++) {
      const tileDef = all.get(i)!;
      if (tileDef.hidden || tileDef.deprecated) {
        continue;
      }
      tiles.push(tileDef);
    }
  }
  return tiles;
}

/** The core environment, as the editor builds it while no session catalog has arrived. */
function coreEnvironment(): WendooEnvironment {
  return buildAuthoringEnvironment(undefined).environment;
}

/** The tile ids of the value literals `built` holds for the project's assets and brains. */
function valueLiteralTileIds(built: AuthoringEnvironment): ReadonlySet<string> {
  return new Set([...built.assetLiterals.view.keys(), ...built.brainLiterals.view.keys()]);
}

describe("the editor docs registry", () => {
  it("leaves exactly the stated exclusions among the visible core catalog tiles without a docs entry", () => {
    const environment = coreEnvironment();
    const registry = createEditorDocsRegistry(environment, new Set());
    const undocumented = visibleCatalogTiles(environment)
      .filter((tileDef) => !EXCLUDED_KINDS.has(tileDef.kind))
      .filter((tileDef) => !registry.tiles.has(tileDef.tileId))
      .map((tileDef) => tileDef.tileId)
      .sort();
    assert.deepEqual(undocumented, [...EXCLUDED_TILE_IDS].sort());
  });

  it("curates only tiles the core catalog holds visibly", () => {
    const shippedTileIds = new Set(visibleCatalogTiles(coreEnvironment()).map((tileDef) => tileDef.tileId));
    const stale = [...undocumentedTileIds].filter((tileId) => !shippedTileIds.has(tileId));
    assert.deepEqual(stale, [], `curation entries without a visible core catalog tile: ${stale.join(", ")}`);
  });

  it("resolves docs content for every visible core catalog tile but the declared exclusions", () => {
    const environment = coreEnvironment();
    const registry = createEditorDocsRegistry(environment, new Set());
    const contentless = visibleCatalogTiles(environment)
      .filter((tileDef) => !EXCLUDED_KINDS.has(tileDef.kind))
      .map((tileDef) => tileDef.tileId)
      .filter((tileId) => (registry.tiles.get(tileId)?.content ?? "").trim() === "")
      .sort();
    assert.deepEqual(contentless, [...EXCLUDED_TILE_IDS, ...CORE_ENTRIES_WITHOUT_CONTENT].sort());
  });

  it("registers exactly the core concept pages, and no pattern pages", () => {
    const registry = createEditorDocsRegistry(coreEnvironment(), new Set());
    assert.deepEqual([...registry.concepts.keys()], [...coreConceptDocs.map((meta) => meta.id)]);
    assert.equal(registry.patterns.size, 0);
  });

  it("gives each tile a session catalog binds an entry under its kind's category, empty while the tile carries no docs", () => {
    const { environment } = buildAuthoringEnvironment(ASSET_CATALOG, assetCatalogIds());
    const registry = createEditorDocsRegistry(environment, new Set());
    for (const [tileId, kind] of [
      [mkSensorTileId(SPOT), "sensor"],
      [mkActuatorTileId(SHOW), "actuator"],
    ] as const) {
      const entry = registry.tiles.get(tileId);
      assert.ok(entry, `${tileId} gets a derived docs entry`);
      assert.equal(entry.category, tileKindCategories[kind]);
      assert.equal(entry.content, "");
    }
  });

  it("carries the docs a session catalog gives a bound tile, its own tile id in place of the placeholder", () => {
    const { environment } = buildAuthoringEnvironment(catalogDocumenting(SPOT, PLACEHOLDER_DOCS), assetCatalogIds());
    const registry = createEditorDocsRegistry(environment, new Set());
    const spot = mkSensorTileId(SPOT);
    assert.equal(registry.tiles.get(spot)?.content, PLACEHOLDER_DOCS.split(TILE_ID_PLACEHOLDER).join(spot));
    const show = registry.tiles.get(mkActuatorTileId(SHOW));
    assert.ok(show, "a bound tile carrying no docs still gets an entry");
    assert.equal(show.content, "");
  });

  it("gives no entry to the value literals the environment holds for the project's assets and brains", () => {
    const assets = buildAuthoringEnvironment(ASSET_CATALOG, assetCatalogIds());
    assets.assetLiterals.applySnapshot([picture("img1", "hero")]);
    const brains = buildAuthoringEnvironment(BRAIN_CATALOG, brainCatalogIds());
    brains.brainLiterals.applyBrains(new Map([[HELD_BRAIN_ID, { name: "Chaser" }]]));

    for (const built of [assets, brains]) {
      const literals = valueLiteralTileIds(built);
      const visible = new Set(visibleCatalogTiles(built.environment).map((tileDef) => tileDef.tileId));
      assert.ok(literals.size > 0, "the environment holds a value literal");
      for (const tileId of literals) {
        assert.ok(visible.has(tileId), `${tileId} is a visible catalog tile`);
        assert.ok(createEditorDocsRegistry(built.environment, new Set()).tiles.has(tileId));
        assert.equal(createEditorDocsRegistry(built.environment, literals).tiles.has(tileId), false);
      }
    }
  });
});

/** The arcade selftest's catalog, with the docs of its type named `name` taken away. */
function arcadeCatalogWithoutTypeDocs(name: string): string {
  const catalog = JSON.parse(arcadeCatalog()) as { packs: { types: { name: string; docs?: string }[] }[] };
  const type = catalog.packs.flatMap((pack) => pack.types).find((entry) => entry.name === name);
  assert.ok(type?.docs, `the catalog documents ${name}`);
  type.docs = undefined;
  return JSON.stringify(catalog);
}

/** A catalog entry that may carry docs: a tile's output, or a type's field accessor. */
interface DocumentedEntry {
  name: string;
  docs?: string;
}

/** The arcade selftest's catalog, every output and every accessor it declares carrying no docs. */
function arcadeCatalogWithoutOutputAndAccessorDocs(): string {
  const catalog = JSON.parse(arcadeCatalog()) as {
    packs: {
      tiles: { outputs?: DocumentedEntry[] }[];
      types: { fields?: { accessor?: DocumentedEntry }[] }[];
    }[];
  };
  for (const pack of catalog.packs) {
    for (const output of pack.tiles.flatMap((tile) => tile.outputs ?? [])) {
      assert.ok(output.docs, `the catalog documents the output ${output.name}`);
      output.docs = undefined;
    }
    for (const field of pack.types.flatMap((type) => type.fields ?? [])) {
      if (field.accessor) field.accessor.docs = undefined;
    }
  }
  return JSON.stringify(catalog);
}

/** The environment binding `catalog` under the arcade selftest's allocation. */
function arcadeEnvironment(catalog: string = arcadeCatalog()): WendooEnvironment {
  return buildAuthoringEnvironment(catalog, arcadeIds()).environment;
}

/** Every visible catalog tile of `environment` of the kind `kind`. */
function visibleTilesOfKind(environment: WendooEnvironment, kind: string): IBrainTileDef[] {
  return visibleCatalogTiles(environment).filter((tileDef) => tileDef.kind === kind);
}

/** The tile id of the variable factory of the struct type named `name`. */
function factoryTileId(name: string): string {
  return mkVariableFactoryTileId(mkTypeId(NativeType.Struct, name));
}

/** Struct types of the arcade selftest's catalog whose entries carry docs. */
const DOCUMENTED_TYPES = ["Vector2", "Sprite"];

describe("the editor docs registry over a session catalog's types, outputs and accessors", () => {
  it("lists each type carrying docs as its variable factory's entry under the data-types category, carrying those docs", () => {
    const registry = createEditorDocsRegistry(arcadeEnvironment(), new Set());
    for (const name of DOCUMENTED_TYPES) {
      const entry = registry.tiles.get(factoryTileId(name));
      assert.ok(entry, `${name} gets an entry`);
      assert.equal(entry.category, dataTypesCategory);
      assert.notEqual(entry.content.trim(), "");
    }
  });

  it("gives a type carrying no docs no entry", () => {
    const registry = createEditorDocsRegistry(arcadeEnvironment(arcadeCatalogWithoutTypeDocs("Vector2")), new Set());
    assert.equal(registry.tiles.has(factoryTileId("Vector2")), false);
    assert.ok(registry.tiles.has(factoryTileId("Sprite")));
  });

  it("gives each output and accessor tile carrying docs an entry under its own tile id, carrying those docs and no category", () => {
    const environment = arcadeEnvironment();
    const registry = createEditorDocsRegistry(environment, new Set());
    for (const kind of unlistedTileKinds) {
      const tiles = visibleTilesOfKind(environment, kind);
      assert.ok(tiles.length > 1, `the environment binds several ${kind} tiles`);
      for (const tileDef of tiles) {
        const entry = registry.tiles.get(tileDef.tileId);
        assert.ok(entry, `${tileDef.tileId} has an entry`);
        assert.equal(entry.category, undefined, `${tileDef.tileId} is unlisted`);
        assert.notEqual(entry.content.trim(), "");
      }
    }
  });

  it("gives an output or accessor tile carrying no docs no entry", () => {
    const environment = arcadeEnvironment(arcadeCatalogWithoutOutputAndAccessorDocs());
    const registry = createEditorDocsRegistry(environment, new Set());
    for (const kind of unlistedTileKinds) {
      const tiles = visibleTilesOfKind(environment, kind);
      assert.ok(tiles.length > 0, `the environment binds ${kind} tiles`);
      for (const tileDef of tiles) {
        assert.equal(registry.tiles.has(tileDef.tileId), false, `${tileDef.tileId} has no entry`);
      }
    }
  });

  it("lists no output or accessor entry in the docs sidebar, browsing or searching by its tile id", () => {
    const environment = arcadeEnvironment();
    const registry = createEditorDocsRegistry(environment, new Set());
    const catalog = createDocsTileCatalog(environment);
    const listed = (search: string) =>
      new Set(listedTileEntries(registry, catalog, search, (tileId) => tileId).map((entry) => entry.tileId));
    assert.ok(listed("").has(factoryTileId("Sprite")), "the sweep lists the entries it should");
    for (const kind of unlistedTileKinds) {
      for (const tileDef of visibleTilesOfKind(environment, kind)) {
        assert.equal(listed("").has(tileDef.tileId), false, `${tileDef.tileId} is not listed while browsing`);
        assert.equal(listed(tileDef.tileId).has(tileDef.tileId), false, `${tileDef.tileId} is not a search result`);
      }
    }
  });
});

describe("the docs tile catalog", () => {
  it("resolves a tile id across every catalog the environment registers", () => {
    const environment = coreEnvironment();
    const catalog = createDocsTileCatalog(environment);
    for (const tileDef of visibleCatalogTiles(environment)) {
      assert.equal(catalog.get(tileDef.tileId), tileDef);
    }
    assert.equal(catalog.get("tile.sensor->no-such-tile"), undefined);
  });
});
