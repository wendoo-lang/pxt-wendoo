import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { List } from "@wendoo/core";
import type { IBrainTileDef } from "@wendoo/core/app";
import { BrainDef, mkLiteralTileId, mkSensorTileId, mkVariableFactoryTileId } from "@wendoo/core/app";
import { RuleSide } from "@wendoo/core/brain";
import { buildInsertionContext, suggestTiles } from "@wendoo/core/brain/language-service";
import type { BrainPageDef, BrainRuleDef } from "@wendoo/core/brain/model";
import type { BrainTileLiteralDef } from "@wendoo/core/brain/tiles";
import type { StructTypeDef, StructValue } from "@wendoo/core/runtime";
import {
  getClosedStructFieldByName,
  mkNumberValue,
  mkTypeId,
  NativeType,
  NIL_VALUE,
  TRUE_VALUE,
} from "@wendoo/core/runtime";
import type { DocTab } from "@wendoo/docs";
import { listedTileEntries } from "@wendoo/docs/DocsSidebar";
import { buildBrainEditorConfig } from "../brain/editor-config.js";
import { createDocsTileCatalog, createEditorDocsRegistry, createTileDocsAction } from "../docs/docs-registry.js";
import { dataTypesCategory, tileKindCategories } from "../docs/manifest.js";
import { catalogTile } from "../test-support/asset-catalog.js";
import { checkedInText, SELFTEST_IDS_FILE } from "../test-support/vm-programs.js";
import { type AuthoringEnvironment, buildAuthoringEnvironment } from "./authoring-environment.js";
import { compileBrainSource, serializeBrainSource } from "./brain-source.js";
import { parseCatalog } from "./catalog.js";
import { allocateIds, emptyIdManifest } from "./id-allocation.js";
import { PackBindingCode } from "./pack-binding.js";

/** Name of the sensor whose optional anonymous slot takes a `Buoy`. */
const SPOT = "sensor.harbor.spot";

/** Type id of {@link LITERAL_CATALOG}'s `Buoy` type: documented, declaring literals, and no variable factory. */
const BUOY_TYPE = mkTypeId(NativeType.Struct, "Buoy");

/** Type id of {@link LITERAL_CATALOG}'s `Dock` type: documented, declaring a literal, with a variable factory. */
const DOCK_TYPE = mkTypeId(NativeType.Struct, "Dock");

/** Type id of {@link LITERAL_CATALOG}'s `Cove` type: declaring a literal, carrying no docs and no icon. */
const COVE_TYPE = mkTypeId(NativeType.Struct, "Cove");

/** The icon {@link LITERAL_CATALOG}'s `Buoy` type carries. */
const BUOY_ICON = "data:image/svg+xml;base64,YnVveQ==";

/** The icon {@link LITERAL_CATALOG}'s `Dock` type carries. */
const DOCK_ICON = "data:image/svg+xml;base64,ZG9jaw==";

/** Tile id of the labeled `Buoy` literal, setting both fields. */
const RED = mkLiteralTileId(BUOY_TYPE, "red");

/** Tile id of the unlabeled `Buoy` literal, setting `x` alone. */
const GREEN = mkLiteralTileId(BUOY_TYPE, "green");

/** Tile id of the `Dock` literal. */
const NORTH = mkLiteralTileId(DOCK_TYPE, "north");

/** Tile id of the `Cove` literal. */
const HIDDEN = mkLiteralTileId(COVE_TYPE, "hidden");

/**
 * A catalog in the rendered form the simx publishes: a documented `Buoy`
 * type no variable factory stands for, declaring two literals -- one
 * labeled and setting both its fields, one unlabeled and setting `x` alone;
 * a documented `Dock` type with a variable factory, declaring one literal; a
 * `Cove` type carrying no docs and no icon, declaring one literal; and a
 * sensor whose optional anonymous slot takes a `Buoy`.
 */
const LITERAL_CATALOG = JSON.stringify({
  packs: [
    {
      name: "harbor",
      types: [
        {
          name: "Buoy",
          fields: [
            { name: "x", type: "number" },
            { name: "lit", type: "boolean" },
          ],
          literals: [
            {
              key: "red",
              label: "red buoy",
              fields: [
                { name: "x", value: { t: NativeType.Number, v: 1 } },
                { name: "lit", value: { t: NativeType.Boolean, v: true } },
              ],
            },
            { key: "green", fields: [{ name: "x", value: { t: NativeType.Number, v: 2 } }] },
          ],
          label: "buoy",
          docs: "# Buoy",
          iconUrl: BUOY_ICON,
        },
        {
          name: "Dock",
          variableFactory: true,
          fields: [{ name: "x", type: "number" }],
          literals: [
            { key: "north", label: "north dock", fields: [{ name: "x", value: { t: NativeType.Number, v: 3 } }] },
          ],
          label: "dock",
          docs: "# Dock",
          iconUrl: DOCK_ICON,
        },
        { name: "Cove", fields: [{ name: "x", type: "number" }], literals: [{ key: "hidden", fields: [] }] },
      ],
      tiles: [
        {
          name: SPOT,
          kind: "sensor",
          args: [{ tileId: "anon.Buoy", type: "Buoy", optional: true, anonymous: true }],
          returns: "boolean",
          label: "spot",
        },
      ],
    },
  ],
});

/** {@link LITERAL_CATALOG}, the `Buoy` type declaring `extra` after its own literals. */
function catalogAdding(extra: readonly unknown[]): string {
  const catalog = JSON.parse(LITERAL_CATALOG) as { packs: { types: { name: string; literals: unknown[] }[] }[] };
  const buoy = catalog.packs[0].types.find((type) => type.name === "Buoy");
  assert.ok(buoy);
  buoy.literals.push(...extra);
  return JSON.stringify(catalog);
}

/** A fresh environment binding `catalog` under the allocation a project holding no manifest gets for it. */
function bound(catalog: string = LITERAL_CATALOG): AuthoringEnvironment {
  return buildAuthoringEnvironment(catalog, allocateIds(emptyIdManifest(), parseCatalog(catalog)));
}

/** The literal tile `built` binds under `tileId`. */
function literalTile(built: AuthoringEnvironment, tileId: string): BrainTileLiteralDef {
  return catalogTile(built.environment, tileId) as BrainTileLiteralDef;
}

/** The value the literal under `tileId` holds in its field `field`. */
function fieldOf(built: AuthoringEnvironment, tileId: string, field: string) {
  const literal = literalTile(built, tileId);
  const typeDef = built.environment.brainServices.runtime.types.get(literal.valueType) as StructTypeDef;
  return getClosedStructFieldByName(typeDef, literal.value as StructValue, field);
}

/** A one-rule brain `WHEN spot [literal]`, the literal the tile `literalTileId` of `built`. */
function spotting(built: AuthoringEnvironment, literalTileId: string): BrainDef {
  const brain = BrainDef.emptyBrainDef(built.environment.brainServices, "Lookout");
  const rule = (brain.pages().get(0) as BrainPageDef).children().get(0) as BrainRuleDef;
  rule.when().appendTile(catalogTile(built.environment, mkSensorTileId(SPOT)));
  rule.when().appendTile(catalogTile(built.environment, literalTileId));
  return brain;
}

/** Whether the suggestion oracle offers `tileId` at the end of a WHEN side holding the tile `existing`. */
function offeredAfter(built: AuthoringEnvironment, existing: IBrainTileDef, tileId: string): boolean {
  const { environment } = built;
  const brain = BrainDef.emptyBrainDef(environment.brainServices, "probe");
  const rule = (brain.pages().get(0) as BrainPageDef).children().get(0) as BrainRuleDef;
  rule.when().appendTile(existing);
  const context = buildInsertionContext({
    side: RuleSide.When,
    expr: rule.when().expr(),
    ruleDef: rule,
    existingTiles: rule.when().tiles(),
  });
  const result = suggestTiles(context, List.from(environment.tileCatalogs()), environment.brainServices);
  return [...result.exact.toArray(), ...result.withConversion.toArray()].some(
    (suggestion) => suggestion.tileDef.tileId === tileId
  );
}

describe("pack literals", () => {
  it("binds the catalog clean, minting one literal tile per literal each type declares, under its type and key", () => {
    const built = bound();

    assert.deepEqual(built.diagnostics, []);
    assert.deepEqual([...built.packLiterals.keys()], [RED, GREEN, NORTH, HIDDEN]);
    for (const [tileId, literal] of built.packLiterals) {
      const tile = literalTile(built, tileId);
      assert.equal(tile.kind, "literal");
      assert.equal(tile.valueType, literal.typeId);
      assert.equal(tile.valueLabel, literal.key);
      assert.ok(!tile.hidden, `${tileId} is offered`);
    }
  });

  it("holds each field value a literal declares, by field name, and nil in every field it sets none in", () => {
    const built = bound();

    assert.deepEqual(fieldOf(built, RED, "x"), mkNumberValue(1));
    assert.deepEqual(fieldOf(built, RED, "lit"), TRUE_VALUE);
    assert.deepEqual(fieldOf(built, GREEN, "x"), mkNumberValue(2));
    assert.deepEqual(fieldOf(built, GREEN, "lit"), NIL_VALUE);
  });

  it("reads each literal by the label it carries, else its key, wearing its type's icon, and no icon while its type carries none", () => {
    const built = bound();
    const carried = parseCatalog(LITERAL_CATALOG).packs[0].types.find((type) => type.name === "Buoy")?.literals;

    assert.equal(literalTile(built, RED).metadata?.label, carried?.[0].label);
    assert.equal(built.packLiterals.get(RED)?.label, carried?.[0].label);
    assert.equal(literalTile(built, GREEN).metadata?.label, "green");
    assert.equal(built.packLiterals.get(GREEN)?.label, "green");
    assert.equal(literalTile(built, RED).metadata?.iconUrl, BUOY_ICON);
    assert.equal(literalTile(built, GREEN).metadata?.iconUrl, BUOY_ICON);
    assert.equal(literalTile(built, NORTH).metadata?.iconUrl, DOCK_ICON);
    assert.equal(literalTile(built, HIDDEN).metadata?.iconUrl, undefined);
  });

  it("keeps the definition out of the brain, which holds the literal's reference alone and compiles read back", () => {
    const built = bound();

    const source = serializeBrainSource(spotting(built, RED));
    const compiled = compileBrainSource(built.environment, source);

    const document = JSON.parse(source);
    assert.equal(literalTile(built, RED).persist, false);
    assert.deepEqual(
      document.catalog.map((entry: { kind: string }) => entry.kind),
      ["page"]
    );
    assert.equal(document.pages[0].rules[0].when[1], RED);
    assert.deepEqual(compiled.diagnostics, []);
    assert.ok(compiled.bytecode);
  });

  it("offers a literal at a slot of its type", () => {
    const built = bound();
    const spot = catalogTile(built.environment, mkSensorTileId(SPOT));

    assert.ok(offeredAfter(built, spot, RED));
    assert.ok(offeredAfter(built, spot, GREEN));
    assert.equal(offeredAfter(built, spot, NORTH), false);
  });

  it("reports a literal whose key an earlier literal of its type declares, by type and key, the earlier standing", () => {
    const built = bound(
      catalogAdding([{ key: "red", fields: [{ name: "x", value: { t: NativeType.Number, v: 9 } }] }])
    );

    assert.deepEqual(built.diagnostics, [
      { code: PackBindingCode.LITERAL_KEY_DUPLICATE, pack: "harbor", name: "Buoy", token: "red" },
    ]);
    assert.deepEqual(fieldOf(built, RED, "x"), mkNumberValue(1));
    assert.equal(built.packLiterals.get(RED)?.label, "red buoy");
  });

  it("reports a literal the model cannot take by type and key, and binds the rest", () => {
    const built = bound(
      catalogAdding([
        { key: "deep", fields: [{ name: "depth", value: { t: NativeType.Number, v: 1 } }] },
        { key: "odd", fields: [{ name: "x", value: { v: 1 } }] },
      ])
    );

    assert.deepEqual(built.diagnostics, [
      { code: PackBindingCode.TILE_REJECTED, pack: "harbor", name: "Buoy", token: "deep" },
      { code: PackBindingCode.DEFAULT_UNREADABLE, pack: "harbor", name: "Buoy", token: "odd" },
    ]);
    assert.deepEqual([...built.packLiterals.keys()], [RED, GREEN, NORTH, HIDDEN]);
  });

  it("mints nothing while no allocation binds the catalog's packs", () => {
    assert.equal(buildAuthoringEnvironment(LITERAL_CATALOG).packLiterals.size, 0);
  });

  it("formats a placed literal's value label as its label in the brain editor's config", () => {
    const built = bound();
    const config = buildBrainEditorConfig(
      built.environment,
      built.assetLiterals.view,
      built.brainLiterals.view,
      built.packLiterals,
      built.typeIcons
    );

    for (const tileId of [RED, GREEN]) {
      const literal = literalTile(built, tileId);
      const literalType = config.customLiteralTypes.find((type) => type.typeId === literal.valueType);
      assert.ok(literalType);
      assert.equal(literalType.formatValue(literal.valueLabel), built.packLiterals.get(tileId)?.label);
    }
  });

  it("binds the literals the registration selftest's packs declare, as the VM extension serializes them", () => {
    const catalog = JSON.stringify(JSON.parse(checkedInText("makecode/tests/vm-conformance/selftest/catalog.json")));
    const built = buildAuthoringEnvironment(catalog, JSON.parse(checkedInText(SELFTEST_IDS_FILE)));
    const beacon = mkTypeId(NativeType.Struct, "Beacon");

    assert.deepEqual(
      built.diagnostics.filter((diagnostic) => "name" in diagnostic && diagnostic.name === "Beacon"),
      []
    );
    assert.deepEqual(
      [...built.packLiterals.values()].map(({ typeId, key }) => [typeId, key]),
      [
        [beacon, "home"],
        [beacon, "east"],
      ]
    );
  });
});

/** A docs sidebar recording what a docs action asks of it, over `built`'s registry. */
function recordingSidebar(built: AuthoringEnvironment) {
  const calls: string[] = [];
  const registry = createEditorDocsRegistry(built.environment, new Set(built.packLiterals.keys()), built.typePages);
  return {
    calls,
    sidebar: {
      registry,
      openDocsForTile: (tileDef: IBrainTileDef) => {
        calls.push(`own ${tileDef.tileId}`);
      },
      open: () => {
        calls.push("open");
      },
      navigateToEntry: (tab: DocTab, key: string) => {
        calls.push(`${tab} ${key}`);
      },
    },
  };
}

describe("the docs of pack literals and of the types declaring them", () => {
  it("gives no docs entry to a pack literal", () => {
    const built = bound();

    for (const tileId of built.packLiterals.keys()) {
      assert.equal(
        createEditorDocsRegistry(built.environment, new Set()).tiles.get(tileId)?.category,
        tileKindCategories.literal
      );
      assert.equal(
        createEditorDocsRegistry(built.environment, new Set(built.packLiterals.keys())).tiles.has(tileId),
        false
      );
    }
  });

  it("lists the page of a documented type no variable factory stands for, under its factory's id, by the type's label and icon", () => {
    const built = bound();
    const buoy = parseCatalog(LITERAL_CATALOG).packs[0].types.find((type) => type.name === "Buoy");
    const page = mkVariableFactoryTileId(BUOY_TYPE);
    const registry = createEditorDocsRegistry(built.environment, new Set(built.packLiterals.keys()), built.typePages);
    const listed = listedTileEntries(registry, createDocsTileCatalog(built.environment), "", (tileId) => tileId);

    assert.equal(built.environment.brainServices.edit.tiles.has(page), false);
    assert.deepEqual(registry.tiles.get(page), {
      tileId: page,
      tags: [],
      category: dataTypesCategory,
      content: buoy?.docs,
      label: buoy?.label,
      iconUrl: BUOY_ICON,
    });
    assert.equal(listed.filter((entry) => entry.tileId === page).length, 1);
  });

  it("lists a documented type a variable factory stands for once, as its factory's entry", () => {
    const built = bound();
    const page = mkVariableFactoryTileId(DOCK_TYPE);
    const registry = createEditorDocsRegistry(built.environment, new Set(built.packLiterals.keys()), built.typePages);
    const listed = listedTileEntries(registry, createDocsTileCatalog(built.environment), "", (tileId) => tileId);

    assert.ok(built.environment.brainServices.edit.tiles.has(page));
    assert.deepEqual(
      built.typePages.map((typePage) => typePage.tileId),
      [mkVariableFactoryTileId(BUOY_TYPE)]
    );
    assert.equal(registry.tiles.get(page)?.category, dataTypesCategory);
    assert.equal(registry.tiles.get(page)?.label, undefined);
    assert.equal(listed.filter((entry) => entry.tileId === page).length, 1);
  });

  it("gives a type carrying no docs no page", () => {
    const built = bound();
    const registry = createEditorDocsRegistry(built.environment, new Set(built.packLiterals.keys()), built.typePages);

    assert.equal(registry.tiles.has(mkVariableFactoryTileId(COVE_TYPE)), false);
  });

  it("opens a pack literal's type page from its docs action, whether or not a variable factory stands for the type", () => {
    const built = bound();

    for (const [tileId, typeId] of [
      [RED, BUOY_TYPE],
      [NORTH, DOCK_TYPE],
    ] as const) {
      const { calls, sidebar } = recordingSidebar(built);
      createTileDocsAction(sidebar, built.packLiterals)(literalTile(built, tileId));
      assert.deepEqual(calls, ["open", `tiles ${mkVariableFactoryTileId(typeId)}`]);
    }
  });

  it("opens a pack literal of a type with no page, and any other tile, as the sidebar's own docs action does", () => {
    const built = bound();

    for (const tileId of [HIDDEN, mkSensorTileId(SPOT)]) {
      const { calls, sidebar } = recordingSidebar(built);
      createTileDocsAction(sidebar, built.packLiterals)(catalogTile(built.environment, tileId));
      assert.deepEqual(calls, [`own ${tileId}`]);
    }
  });
});
