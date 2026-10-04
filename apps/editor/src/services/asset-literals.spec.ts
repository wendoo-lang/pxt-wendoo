import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { List } from "@wendoo/core";
import type { IBrainTileDef } from "@wendoo/core/app";
import { BrainDef, CoreTypeIds, mkActuatorTileId, mkLiteralTileId, mkSensorTileId } from "@wendoo/core/app";
import { RuleSide } from "@wendoo/core/brain";
import { buildInsertionContext, suggestTiles } from "@wendoo/core/brain/language-service";
import type { BrainPageDef, BrainRuleDef } from "@wendoo/core/brain/model";
import type { BrainTileLiteralDef } from "@wendoo/core/brain/tiles";
import type { StructTypeDef, StructValue } from "@wendoo/core/runtime";
import { getClosedStructFieldByName, mkStringValue } from "@wendoo/core/runtime";
import {
  ASSET_CATALOG,
  assetCatalogIds,
  catalogTile,
  NEAR,
  PICTURE_KIND,
  PICTURE_TYPE,
  picture,
  pictureBrainSource,
  SHOW,
  SPOT,
} from "../test-support/asset-catalog.js";
import type { AuthoringEnvironment } from "./authoring-environment.js";
import { buildAuthoringEnvironment } from "./authoring-environment.js";
import { compileBrainSource } from "./brain-source.js";

/** The literal tile id an asset `id` of {@link ASSET_CATALOG}'s asset type is minted under. */
function pictureTileId(id: string): string {
  return mkLiteralTileId(PICTURE_TYPE, id);
}

/** A fresh environment binding {@link ASSET_CATALOG}, its asset literals minted from `assets`, or from no snapshot. */
function environmentWith(assets?: Parameters<AuthoringEnvironment["assetLiterals"]["applySnapshot"]>[0]) {
  const built = buildAuthoringEnvironment(ASSET_CATALOG, assetCatalogIds());
  built.assetLiterals.applySnapshot(assets);
  return built;
}

/** Whether the suggestion oracle offers `tileId` at the end of a side holding `existing`. */
function offered(built: AuthoringEnvironment, side: RuleSide, existing: readonly IBrainTileDef[], tileId: string) {
  const { environment } = built;
  const brain = BrainDef.emptyBrainDef(environment.brainServices, "probe");
  const rule = (brain.pages().get(0) as BrainPageDef).children().get(0) as BrainRuleDef;
  const tileSet = side === RuleSide.When ? rule.when() : rule.do();
  for (const tile of existing) tileSet.appendTile(tile);
  const context = buildInsertionContext({ side, expr: tileSet.expr(), ruleDef: rule, existingTiles: tileSet.tiles() });
  const result = suggestTiles(context, List.from(environment.tileCatalogs()), environment.brainServices);
  const has = (suggestions: typeof result.exact) =>
    suggestions.findIndex((suggestion) => suggestion.tileDef.tileId === tileId) !== -1;
  return has(result.exact) || has(result.withConversion);
}

describe("asset literals", () => {
  describe("minting", () => {
    it("mints one literal per snapshot asset of a catalog asset type, its value the asset struct naming the short id", () => {
      const built = environmentWith([picture("img1", "hero")]);
      const literal = catalogTile(built.environment, pictureTileId("img1")) as BrainTileLiteralDef;

      assert.equal(literal.kind, "literal");
      assert.equal(literal.valueType, PICTURE_TYPE);
      const typeDef = built.environment.brainServices.runtime.types.get(PICTURE_TYPE) as StructTypeDef;
      assert.deepEqual(
        getClosedStructFieldByName(typeDef, literal.value as StructValue, "asset"),
        mkStringValue("img1")
      );
      assert.equal(literal.metadata?.label, "hero");
      assert.equal(literal.persist, false);
    });

    it("labels a nameless asset's literal by its short id", () => {
      const built = environmentWith([picture("img2")]);

      assert.equal(catalogTile(built.environment, pictureTileId("img2")).metadata?.label, "img2");
    });

    it("reports each minted literal with its asset's kind, id, label and preview", () => {
      const built = environmentWith([picture("img1", "hero", "data:image/svg+xml;base64,aGVybw==")]);

      assert.deepEqual(
        [...built.assetLiterals.view.values()],
        [
          {
            tileId: pictureTileId("img1"),
            typeId: PICTURE_TYPE,
            kind: PICTURE_KIND,
            id: "img1",
            label: "hero",
            previewUrl: "data:image/svg+xml;base64,aGVybw==",
            resolved: true,
          },
        ]
      );
    });

    it("mints nothing for an asset of a kind no catalog asset type declares", () => {
      const built = environmentWith([{ kind: "song", id: "song1", name: "tune", previewUrl: "data:," }]);

      assert.equal(built.assetLiterals.view.size, 0);
    });

    it("mints nothing while no allocation binds the catalog's packs", () => {
      const built = buildAuthoringEnvironment(ASSET_CATALOG);
      built.assetLiterals.applySnapshot([picture("img1", "hero")]);

      assert.equal(built.assetLiterals.view.size, 0);
    });

    it("keeps the definition out of the brain: the source holds the literal's reference alone", () => {
      const built = environmentWith([picture("img1", "hero", "data:image/svg+xml;base64,aGVybw==")]);

      const source = pictureBrainSource(built.environment, pictureTileId("img1"));

      const document = JSON.parse(source);
      assert.deepEqual(
        document.catalog.map((entry: { kind: string }) => entry.kind),
        ["page"]
      );
      assert.deepEqual(document.pages[0].rules[0].when[1], pictureTileId("img1"));
      assert.doesNotMatch(source, /hero/);
      assert.doesNotMatch(source, /aGVybw==/);
    });
  });

  describe("references", () => {
    it("binds a literal a source references with no snapshot held, compiling to the same bytes as the resolved literal", () => {
      const resolved = environmentWith([picture("img1", "hero")]);
      const source = pictureBrainSource(resolved.environment, pictureTileId("img1"));
      const unresolved = environmentWith();

      unresolved.assetLiterals.bindSource(source);

      const fromSnapshot = compileBrainSource(resolved.environment, source);
      const fromReference = compileBrainSource(unresolved.environment, source);
      assert.deepEqual(fromSnapshot.diagnostics, []);
      assert.deepEqual(fromReference.diagnostics, []);
      assert.ok(fromSnapshot.bytecode);
      assert.deepEqual(fromReference.bytecode, fromSnapshot.bytecode);
    });

    it("binds a referenced literal the held snapshot lacks, compiling to the same bytes", () => {
      const resolved = environmentWith([picture("img1", "hero")]);
      const source = pictureBrainSource(resolved.environment, pictureTileId("img1"));
      const deleted = environmentWith([picture("img9", "other")]);

      deleted.assetLiterals.bindSource(source);

      assert.deepEqual(
        compileBrainSource(deleted.environment, source).bytecode,
        compileBrainSource(resolved.environment, source).bytecode
      );
    });

    it("flags a referenced literal the held snapshot lacks as unresolved, and none while no snapshot is held", () => {
      const resolved = environmentWith([picture("img1", "hero")]);
      const source = pictureBrainSource(resolved.environment, pictureTileId("img1"));
      const deleted = environmentWith([]);
      const cold = environmentWith();
      deleted.assetLiterals.bindSource(source);
      cold.assetLiterals.bindSource(source);

      assert.deepEqual(
        deleted.assetLiterals.unresolvedIn(source).map((literal) => literal.id),
        ["img1"]
      );
      assert.equal(deleted.assetLiterals.view.get(pictureTileId("img1"))?.resolved, false);
      assert.deepEqual(cold.assetLiterals.unresolvedIn(source), []);
      assert.deepEqual(resolved.assetLiterals.unresolvedIn(source), []);
    });

    it("binds only literals of catalog asset types", () => {
      const built = environmentWith();
      const numberLiteral = mkLiteralTileId(CoreTypeIds.Number, "7");
      const source = JSON.stringify({
        pages: [{ rules: [{ when: [numberLiteral, pictureTileId("img1")], do: [], children: [] }] }],
      });

      built.assetLiterals.bindSource(source);

      assert.deepEqual([...built.assetLiterals.view.keys()], [pictureTileId("img1")]);
      assert.equal(
        built.environment.tileCatalogs().some((catalog) => catalog.has(numberLiteral)),
        false
      );
    });

    it("reads no reference from a source that is not a document", () => {
      const built = environmentWith();

      built.assetLiterals.bindSource("not a document");

      assert.equal(built.assetLiterals.view.size, 0);
    });
  });

  describe("candidates", () => {
    it("offers a resolved literal at the picture slots of both consumers and not at a number slot", () => {
      const built = environmentWith([picture("img1", "hero")]);
      const tile = (id: string) => catalogTile(built.environment, id);
      const literal = pictureTileId("img1");

      assert.ok(offered(built, RuleSide.When, [tile(mkSensorTileId(SPOT))], literal));
      assert.ok(offered(built, RuleSide.Do, [tile(mkActuatorTileId(SHOW))], literal));
      assert.equal(offered(built, RuleSide.When, [tile(mkSensorTileId(NEAR))], literal), false);
    });

    it("never offers a literal bound from a reference alone", () => {
      const built = environmentWith([]);
      built.assetLiterals.bindSource(
        JSON.stringify({ pages: [{ rules: [{ when: [pictureTileId("gone")], do: [], children: [] }] }] })
      );

      assert.equal(
        offered(built, RuleSide.When, [catalogTile(built.environment, mkSensorTileId(SPOT))], pictureTileId("gone")),
        false
      );
    });
  });

  describe("snapshot changes", () => {
    it("relabels a renamed asset's literal in place, its sentence word included", () => {
      const built = environmentWith([picture("img1", "hero")]);
      const literal = catalogTile(built.environment, pictureTileId("img1"));

      built.assetLiterals.applySnapshot([picture("img1", "villain")]);

      assert.equal(catalogTile(built.environment, pictureTileId("img1")), literal);
      assert.equal(literal.metadata?.label, "villain");
      assert.equal(literal.metadata?.language?.form, "villain");
      assert.equal(built.assetLiterals.view.get(pictureTileId("img1"))?.label, "villain");
    });

    it("reports a redrawn asset's new preview, leaving its definition untouched", () => {
      const built = environmentWith([picture("img1", "hero", "data:,old")]);
      const literal = catalogTile(built.environment, pictureTileId("img1"));
      const metadata = literal.metadata;

      built.assetLiterals.applySnapshot([picture("img1", "hero", "data:,new")]);

      assert.equal(literal.metadata, metadata);
      assert.equal(built.assetLiterals.view.get(pictureTileId("img1"))?.previewUrl, "data:,new");
    });

    it("withdraws a deleted asset's literal from the candidates and offers it again when the same id returns", () => {
      const built = environmentWith([picture("img1", "hero")]);
      const spot = [catalogTile(built.environment, mkSensorTileId(SPOT))];

      built.assetLiterals.applySnapshot([]);
      assert.equal(offered(built, RuleSide.When, spot, pictureTileId("img1")), false);
      assert.deepEqual(built.assetLiterals.view.get(pictureTileId("img1")), {
        tileId: pictureTileId("img1"),
        typeId: PICTURE_TYPE,
        kind: PICTURE_KIND,
        id: "img1",
        label: "hero",
        previewUrl: undefined,
        resolved: false,
      });

      built.assetLiterals.applySnapshot([picture("img1", "hero")]);
      assert.ok(offered(built, RuleSide.When, spot, pictureTileId("img1")));
      assert.equal(built.assetLiterals.view.get(pictureTileId("img1"))?.resolved, true);
    });

    it("keeps its report when a snapshot changes nothing it holds", () => {
      const built = environmentWith([picture("img1", "hero")]);
      const view = built.assetLiterals.view;

      built.assetLiterals.applySnapshot([picture("img1", "hero")]);

      assert.equal(built.assetLiterals.view, view);
    });
  });
});
