import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CoreTypeIds, mkLiteralTileId } from "@wendoo/core/app";
import { projectRuleSentence } from "@wendoo/core/brain/language-service";
import type { BrainPageDef, BrainRuleDef } from "@wendoo/core/brain/model";
import { type BrainTileLiteralDef, BrainTilePageDef } from "@wendoo/core/brain/tiles";
import type { Localizer } from "@wendoo/core/localization";
import { createDefaultLocalizer } from "@wendoo/core/localization";
import type { BrainEditorConfig } from "@wendoo/ui";
import { buildAuthoringEnvironment } from "../services/authoring-environment.js";
import { BRAIN_SOURCE_NAMESPACE, readBrainSource } from "../services/brain-source.js";
import { emptyIdManifest } from "../services/id-allocation.js";
import { TARGET_THEMES } from "../services/target-theme.js";
import {
  ASSET_CATALOG,
  assetCatalogIds,
  catalogTile,
  PICTURE_TYPE,
  picture,
  pictureBrainSource,
} from "../test-support/asset-catalog.js";
import { BRAIN_CATALOG, brainCatalogIds, KIN_TYPE, kinTileId } from "../test-support/brain-catalog.js";
import { buildBrainEditorConfig } from "./editor-config.js";

describe("buildBrainEditorConfig", () => {
  it("reads the environment's brain services, localizer and tile catalogs", () => {
    const { environment } = buildAuthoringEnvironment(undefined);

    const config = buildBrainEditorConfig(environment, new Map(), new Map(), new Map(), new Map(), new Map());

    assert.equal(config.brainServices, environment.brainServices);
    assert.equal(config.localizer?.locale(), environment.appServices.localizer.locale());
    assert.equal(
      config.localizer?.tr("{n} tiles", { n: 2 }),
      environment.appServices.localizer.tr("{n} tiles", { n: 2 })
    );
    assert.deepEqual(config.tileCatalogs, environment.tileCatalogs());
  });

  it("names each registered type by its registry name, without a qualifier", () => {
    const { environment } = buildAuthoringEnvironment(undefined);
    const types = environment.brainServices.runtime.types;

    const config = buildBrainEditorConfig(environment, new Map(), new Map(), new Map(), new Map(), new Map());

    assert.equal(config.dataTypeNames.get(CoreTypeIds.Number), types.get(CoreTypeIds.Number)?.name);
    assert.equal(config.dataTypeNames.get(CoreTypeIds.String), types.get(CoreTypeIds.String)?.name);
    for (const [typeId] of types.entries()) {
      assert.ok(config.dataTypeNames.has(typeId), `expected a name for ${typeId}`);
      assert.doesNotMatch(config.dataTypeNames.get(typeId) ?? "", /::/);
    }
  });

  it("saves and loads brain files relative to the namespace brain sources are stored in", () => {
    const { environment } = buildAuthoringEnvironment(undefined);

    const config = buildBrainEditorConfig(environment, new Map(), new Map(), new Map(), new Map(), new Map());

    assert.equal(config.projectNamespace, BRAIN_SOURCE_NAMESPACE);
  });

  it("fills tiles in the tile colors it is given, and gives them no fill of their own without", () => {
    const { environment } = buildAuthoringEnvironment(undefined);
    const tileColors = TARGET_THEMES.get("arcade")?.tileColors;
    const page = new BrainTilePageDef("page-start", "start");

    const themed = buildBrainEditorConfig(
      environment,
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      undefined,
      tileColors
    );
    const plain = buildBrainEditorConfig(environment, new Map(), new Map(), new Map(), new Map(), new Map());

    assert.notEqual(tileColors, undefined);
    assert.equal(themed.resolveTileVisual?.(page)?.colorDef, tileColors?.page);
    assert.equal(plain.resolveTileVisual?.(page)?.colorDef, undefined);
  });

  it("follows a rebuilt environment: a config built from it reads the new environment", () => {
    const first = buildAuthoringEnvironment(undefined).environment;
    const rebuilt = buildAuthoringEnvironment('{"packs":[]}').environment;

    const config = buildBrainEditorConfig(rebuilt, new Map(), new Map(), new Map(), new Map(), new Map());

    assert.notEqual(first, rebuilt);
    assert.equal(config.brainServices, rebuilt.brainServices);
    assert.notEqual(config.brainServices, first.brainServices);
  });

  it("resolves tile visuals through the visual provider: an asset literal shows its asset's preview", () => {
    const built = buildAuthoringEnvironment(ASSET_CATALOG, assetCatalogIds());
    built.assetLiterals.applySnapshot([picture("img1", "hero", "data:,hero")]);

    const config = buildBrainEditorConfig(
      built.environment,
      built.assetLiterals.view,
      built.brainLiterals.view,
      built.packLiterals,
      built.typeIcons,
      built.typeLabels
    );

    const literal = catalogTile(built.environment, mkLiteralTileId(PICTURE_TYPE, "img1"));
    assert.equal(config.resolveTileVisual?.(literal)?.iconUrl, "data:,hero");
  });

  it("resolves every page tile through the visual provider to the page icon the environment binds", () => {
    const pageIcon = "data:image/svg+xml;base64,cGFnZQ==";
    const built = buildAuthoringEnvironment(
      JSON.stringify({ packs: [{ name: "pages", coreTileIcons: [{ tileId: "tile.page", iconUrl: pageIcon }] }] }),
      emptyIdManifest()
    );

    const config = buildBrainEditorConfig(
      built.environment,
      built.assetLiterals.view,
      built.brainLiterals.view,
      built.packLiterals,
      built.typeIcons,
      built.typeLabels,
      built.pageIcon
    );

    assert.equal(config.resolveTileVisual?.(new BrainTilePageDef("page-start", "start"))?.iconUrl, pageIcon);
    assert.equal(config.resolveTileVisual?.(new BrainTilePageDef("page-chase", "chase"))?.iconUrl, pageIcon);
  });

  it("re-reads a rule's sentence after an asset rename, the brain left uncompiled", () => {
    const built = buildAuthoringEnvironment(ASSET_CATALOG, assetCatalogIds());
    built.assetLiterals.applySnapshot([picture("img1", "hero")]);
    const source = pictureBrainSource(built.environment, mkLiteralTileId(PICTURE_TYPE, "img1"));
    const rule = (readBrainSource(built.environment, source).pages().get(0) as BrainPageDef)
      .children()
      .get(0) as BrainRuleDef;
    const sentence = memoizedSentence(rule);
    const before = buildBrainEditorConfig(
      built.environment,
      built.assetLiterals.view,
      built.brainLiterals.view,
      built.packLiterals,
      built.typeIcons,
      built.typeLabels
    );
    assert.ok(sentence(before).includes("hero"));

    built.assetLiterals.applySnapshot([picture("img1", "villain")]);
    const after = buildBrainEditorConfig(
      built.environment,
      built.assetLiterals.view,
      built.brainLiterals.view,
      built.packLiterals,
      built.typeIcons,
      built.typeLabels
    );

    const words = sentence(after);
    assert.ok(words.includes("villain"), words.join(" "));
    assert.equal(words.includes("hero"), false);
  });

  it("maps each type to its data-type icon as the environment's type icons hold it", () => {
    const { environment } = buildAuthoringEnvironment(undefined);
    const typeIcons = new Map([[CoreTypeIds.Number, "data:image/svg+xml;base64,bnVtYmVy"]]);

    const config = buildBrainEditorConfig(environment, new Map(), new Map(), new Map(), typeIcons, new Map());

    assert.deepEqual([...config.dataTypeIcons], [...typeIcons]);
  });

  it("shows a placed brain literal's value as its brain's name, with no face", () => {
    const built = buildAuthoringEnvironment(BRAIN_CATALOG, brainCatalogIds());
    built.brainLiterals.applyBrains(new Map([["chaserBrain00001", { name: "Chaser" }]]));
    const literal = catalogTile(built.environment, kinTileId("chaserBrain00001")) as BrainTileLiteralDef;

    const config = buildBrainEditorConfig(
      built.environment,
      built.assetLiterals.view,
      built.brainLiterals.view,
      built.packLiterals,
      built.typeIcons,
      built.typeLabels
    );

    const literalType = config.customLiteralTypes?.find((type) => type.typeId === KIN_TYPE);
    assert.ok(literalType);
    assert.equal(literalType.formatValue(literal.valueLabel), "Chaser");
    assert.equal(literalType.formatValue(literal.value), "Chaser");
    assert.equal(literalType.renderValue?.(literal.value), undefined);
  });
});

/**
 * The words of `rule`'s sentence as the brain editor's sentence line reads
 * them under a config: projected afresh only when one of the inputs the line
 * re-reads its sentence on changes -- the rule, the config's localizer, and
 * the rule's revision, which an asset snapshot never changes.
 */
function memoizedSentence(rule: BrainRuleDef): (config: BrainEditorConfig) => string[] {
  let held: { localizer: Localizer | undefined; words: string[] } | undefined;
  return (config) => {
    if (held === undefined || held.localizer !== config.localizer) {
      const localizer = config.localizer ?? createDefaultLocalizer();
      const words = projectRuleSentence(rule, localizer)
        .toArray()
        .flatMap((segment) => (segment.kind === "word" ? [segment.text] : []));
      held = { localizer: config.localizer, words };
    }
    return held.words;
  };
}
