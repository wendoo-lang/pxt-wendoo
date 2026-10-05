import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { List } from "@wendoo/core";
import type { IBrainTileDef } from "@wendoo/core/app";
import { BrainDef, mkSensorTileId } from "@wendoo/core/app";
import { RuleSide } from "@wendoo/core/brain";
import { buildInsertionContext, suggestTiles } from "@wendoo/core/brain/language-service";
import type { BrainPageDef, BrainRuleDef } from "@wendoo/core/brain/model";
import type { BrainTileLiteralDef } from "@wendoo/core/brain/tiles";
import type { StructTypeDef, StructValue } from "@wendoo/core/runtime";
import { getClosedStructFieldByName, mkStringValue } from "@wendoo/core/runtime";
import { catalogTile } from "../test-support/asset-catalog.js";
import {
  BRAIN_CATALOG,
  brainCatalogIds,
  COUNT,
  KIN_TYPE,
  kinBrainSource,
  kinTileId,
  SEEK,
} from "../test-support/brain-catalog.js";
import type { AuthoringEnvironment } from "./authoring-environment.js";
import { buildAuthoringEnvironment } from "./authoring-environment.js";
import { compileBrainSource } from "./brain-source.js";

/** Document id of the brain the specs' literals name. */
const CHASER_ID = "chaserBrain00001";

/** Document id of the brain placing the literals. */
const SEEKER_ID = "seekerBrain00001";

/** The brains store's brains as the literals read them: document id to name. */
function brains(...entries: [string, string][]): ReadonlyMap<string, { readonly name: string }> {
  return new Map(entries.map(([id, name]) => [id, { name }]));
}

/** A fresh environment binding {@link BRAIN_CATALOG}, its brain literals minted from `held`, or from no brains. */
function environmentWith(held?: ReadonlyMap<string, { readonly name: string }>) {
  const built = buildAuthoringEnvironment(BRAIN_CATALOG, brainCatalogIds());
  if (held !== undefined) built.brainLiterals.applyBrains(held);
  return built;
}

/** Whether the suggestion oracle offers `tileId` at the end of a WHEN side holding `existing`. */
function offered(built: AuthoringEnvironment, existing: readonly IBrainTileDef[], tileId: string) {
  const { environment } = built;
  const brain = BrainDef.emptyBrainDef(environment.brainServices, "probe");
  const rule = (brain.pages().get(0) as BrainPageDef).children().get(0) as BrainRuleDef;
  const tileSet = rule.when();
  for (const tile of existing) tileSet.appendTile(tile);
  const context = buildInsertionContext({
    side: RuleSide.When,
    expr: tileSet.expr(),
    ruleDef: rule,
    existingTiles: tileSet.tiles(),
  });
  const result = suggestTiles(context, List.from(environment.tileCatalogs()), environment.brainServices);
  const has = (suggestions: typeof result.exact) =>
    suggestions.findIndex((suggestion) => suggestion.tileDef.tileId === tileId) !== -1;
  return has(result.exact) || has(result.withConversion);
}

describe("brain literals", () => {
  describe("minting", () => {
    it("mints one literal per brain of a catalog brain type, its value the brain struct naming the document id", () => {
      const built = environmentWith(brains([CHASER_ID, "Chaser"]));
      const literal = catalogTile(built.environment, kinTileId(CHASER_ID)) as BrainTileLiteralDef;

      assert.equal(literal.kind, "literal");
      assert.equal(literal.valueType, KIN_TYPE);
      const typeDef = built.environment.brainServices.runtime.types.get(KIN_TYPE) as StructTypeDef;
      assert.deepEqual(
        getClosedStructFieldByName(typeDef, literal.value as StructValue, "id"),
        mkStringValue(CHASER_ID)
      );
      assert.equal(literal.metadata?.label, "Chaser");
      assert.equal(literal.persist, false);
    });

    it("reports each minted literal with its brain's id, label and whether it is resolved", () => {
      const built = environmentWith(brains([CHASER_ID, "Chaser"]));

      assert.deepEqual(
        [...built.brainLiterals.view.values()],
        [{ tileId: kinTileId(CHASER_ID), typeId: KIN_TYPE, id: CHASER_ID, label: "Chaser", resolved: true }]
      );
    });

    it("mints literals only of the types the catalog marks as brain types", () => {
      const built = environmentWith(brains([CHASER_ID, "Chaser"]));

      assert.deepEqual([...built.brainLiterals.view.keys()], [kinTileId(CHASER_ID)]);
    });

    it("mints nothing while no allocation binds the catalog's packs", () => {
      const built = buildAuthoringEnvironment(BRAIN_CATALOG);
      built.brainLiterals.applyBrains(brains([CHASER_ID, "Chaser"]));

      assert.equal(built.brainLiterals.view.size, 0);
    });

    it("keeps the definition out of the brain: the source holds the literal's reference alone", () => {
      const built = environmentWith(brains([CHASER_ID, "Chaser"]));

      const source = kinBrainSource(built.environment, kinTileId(CHASER_ID), SEEKER_ID);

      const document = JSON.parse(source);
      assert.deepEqual(
        document.catalog.map((entry: { kind: string }) => entry.kind),
        ["page"]
      );
      assert.deepEqual(document.pages[0].rules[0].when[1], kinTileId(CHASER_ID));
      assert.doesNotMatch(source, /Chaser/);
    });
  });

  describe("references", () => {
    it("binds a literal a source references with no brains held, compiling to the same bytes as the resolved literal", () => {
      const resolved = environmentWith(brains([CHASER_ID, "Chaser"]));
      const source = kinBrainSource(resolved.environment, kinTileId(CHASER_ID), SEEKER_ID);
      const cold = environmentWith();

      cold.brainLiterals.bindSource(source);

      const fromBrains = compileBrainSource(resolved.environment, source);
      const fromReference = compileBrainSource(cold.environment, source);
      assert.deepEqual(fromBrains.diagnostics, []);
      assert.deepEqual(fromReference.diagnostics, []);
      assert.ok(fromBrains.bytecode);
      assert.deepEqual(fromReference.bytecode, fromBrains.bytecode);
    });

    it("flags a referenced literal whose brain is no longer held as unresolved, and none while no brains are held", () => {
      const resolved = environmentWith(brains([CHASER_ID, "Chaser"]));
      const source = kinBrainSource(resolved.environment, kinTileId(CHASER_ID), SEEKER_ID);
      const deleted = environmentWith(brains([SEEKER_ID, "Seeker"]));
      const cold = environmentWith();
      deleted.brainLiterals.bindSource(source);
      cold.brainLiterals.bindSource(source);

      assert.deepEqual(
        deleted.brainLiterals.unresolvedIn(source).map((literal) => literal.id),
        [CHASER_ID]
      );
      assert.equal(deleted.brainLiterals.view.get(kinTileId(CHASER_ID))?.resolved, false);
      assert.deepEqual(cold.brainLiterals.unresolvedIn(source), []);
      assert.deepEqual(resolved.brainLiterals.unresolvedIn(source), []);
    });

    it("binds only literals of catalog brain types", () => {
      const built = environmentWith();
      const picture = "tile.literal->struct:<Picture>->img1";
      const source = JSON.stringify({
        pages: [{ rules: [{ when: [picture, kinTileId(CHASER_ID)], do: [], children: [] }] }],
      });

      built.brainLiterals.bindSource(source);

      assert.deepEqual([...built.brainLiterals.view.keys()], [kinTileId(CHASER_ID)]);
    });

    it("reads no reference from a source that is not a document", () => {
      const built = environmentWith();

      built.brainLiterals.bindSource("not a document");

      assert.equal(built.brainLiterals.view.size, 0);
    });
  });

  describe("candidates", () => {
    it("offers a held brain's literal at a brain slot and not at a number slot", () => {
      const built = environmentWith(brains([CHASER_ID, "Chaser"]));
      const tile = (name: string) => catalogTile(built.environment, mkSensorTileId(name));

      assert.ok(offered(built, [tile(SEEK)], kinTileId(CHASER_ID)));
      assert.equal(offered(built, [tile(COUNT)], kinTileId(CHASER_ID)), false);
    });

    it("never offers a literal bound from a reference alone", () => {
      const built = environmentWith(brains());
      built.brainLiterals.bindSource(
        JSON.stringify({ pages: [{ rules: [{ when: [kinTileId("goneBrain0000001")], do: [], children: [] }] }] })
      );

      assert.equal(
        offered(built, [catalogTile(built.environment, mkSensorTileId(SEEK))], kinTileId("goneBrain0000001")),
        false
      );
    });
  });

  describe("brain changes", () => {
    it("relabels a renamed brain's literal in place, its sentence word included", () => {
      const built = environmentWith(brains([CHASER_ID, "Chaser"]));
      const literal = catalogTile(built.environment, kinTileId(CHASER_ID));

      built.brainLiterals.applyBrains(brains([CHASER_ID, "Hunter"]));

      assert.equal(catalogTile(built.environment, kinTileId(CHASER_ID)), literal);
      assert.equal(literal.metadata?.label, "Hunter");
      assert.equal(literal.metadata?.language?.form, "Hunter");
      assert.equal(built.brainLiterals.view.get(kinTileId(CHASER_ID))?.label, "Hunter");
    });

    it("withdraws a removed brain's literal from the candidates and offers it again when the same id returns", () => {
      const built = environmentWith(brains([CHASER_ID, "Chaser"]));
      const seek = [catalogTile(built.environment, mkSensorTileId(SEEK))];

      built.brainLiterals.applyBrains(brains());
      assert.equal(offered(built, seek, kinTileId(CHASER_ID)), false);
      assert.deepEqual(built.brainLiterals.view.get(kinTileId(CHASER_ID)), {
        tileId: kinTileId(CHASER_ID),
        typeId: KIN_TYPE,
        id: CHASER_ID,
        label: "Chaser",
        resolved: false,
      });

      built.brainLiterals.applyBrains(brains([CHASER_ID, "Chaser"]));
      assert.ok(offered(built, seek, kinTileId(CHASER_ID)));
      assert.equal(built.brainLiterals.view.get(kinTileId(CHASER_ID))?.resolved, true);
    });

    it("keeps its report when the brains change nothing it holds", () => {
      const built = environmentWith(brains([CHASER_ID, "Chaser"]));
      const view = built.brainLiterals.view;

      built.brainLiterals.applyBrains(brains([CHASER_ID, "Chaser"]));

      assert.equal(built.brainLiterals.view, view);
    });
  });
});
