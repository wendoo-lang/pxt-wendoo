import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { IBrainTileDef } from "@wendoo/core/app";
import { mkLiteralTileId } from "@wendoo/core/app";
import { RuleSide } from "@wendoo/core/brain";
import type { BrainPageDef, BrainRuleDef } from "@wendoo/core/brain/model";
import type { BrainEditorConfig } from "@wendoo/ui";
import { BrainEditorProvider, BrainTile } from "@wendoo/ui";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildAuthoringEnvironment } from "../services/authoring-environment.js";
import { readBrainSource } from "../services/brain-source.js";
import {
  ASSET_CATALOG,
  assetCatalogIds,
  catalogTile,
  PICTURE_TYPE,
  picture,
  pictureBrainSource,
} from "../test-support/asset-catalog.js";
import { BRAIN_CATALOG, brainCatalogIds, kinBrainSource, kinTileId } from "../test-support/brain-catalog.js";
import { buildBrainEditorConfig } from "./editor-config.js";

/** The attribute marking a placed tile's value frame, the box its value is drawn in. */
const VALUE_FRAME_ATTRIBUTE = "data-tile-value-frame";

/** The preview the asset these specs place carries. */
const PREVIEW = "data:image/svg+xml;base64,cHJpbmNl";

/** The literal tile id of the asset these specs place. */
const LITERAL_ID = mkLiteralTileId(PICTURE_TYPE, "image1");

/** The markup of the value frame of `tileDef` rendered as a placed tile under `config`. */
function valueFrame(config: BrainEditorConfig, tileDef: IBrainTileDef): string {
  const markup = renderToStaticMarkup(
    createElement(BrainEditorProvider, { config }, createElement(BrainTile, { tileDef, side: RuleSide.When }))
  );
  const start = markup.indexOf(`${VALUE_FRAME_ATTRIBUTE}=`);
  assert.ok(start >= 0, "expected a value frame");
  return markup.slice(start, markup.indexOf("</div>", start));
}

/** The asset literal as minted into the environment and as the brain reader places it, with the environment. */
function bothDefs() {
  const built = buildAuthoringEnvironment(ASSET_CATALOG, assetCatalogIds());
  built.assetLiterals.applySnapshot([picture("image1", "prince", PREVIEW)]);
  const minted = catalogTile(built.environment, LITERAL_ID);
  const read = readBrainSource(built.environment, pictureBrainSource(built.environment, LITERAL_ID));
  const rule = (read.pages().get(0) as BrainPageDef).children().get(0) as BrainRuleDef;
  const placed = rule.when().tiles().get(1);
  return { built, defs: [minted, placed] as const };
}

describe("a placed asset literal tile", () => {
  it("draws its asset's preview in its value box, as minted and as the brain reader places it", () => {
    const { built, defs } = bothDefs();
    const config = buildBrainEditorConfig(built.environment, built.assetLiterals.view, built.brainLiterals.view);

    for (const def of defs) {
      const frame = valueFrame(config, def);
      assert.ok(frame.includes(`<img src="${PREVIEW}"`), frame);
      assert.doesNotMatch(frame, />image1</);
      const classes = frame.match(/<img[^>]*class="([^"]*)"/)?.[1]?.split(" ") ?? [];
      for (const fill of ["h-12", "w-12", "object-contain"]) assert.ok(classes.includes(fill), `img lacks ${fill}`);
    }
  });

  it("draws its label as text, with no preview, while its asset is unresolved", () => {
    const { built, defs } = bothDefs();
    built.assetLiterals.applySnapshot([]);
    const config = buildBrainEditorConfig(built.environment, built.assetLiterals.view, built.brainLiterals.view);

    for (const def of defs) {
      const frame = valueFrame(config, def);
      assert.doesNotMatch(frame, /<img/);
      assert.match(frame, />prince</);
    }
  });
});

describe("a placed brain literal tile", () => {
  it("draws its brain's name as text in its value box, never its document id, as minted and as placed", () => {
    const built = buildAuthoringEnvironment(BRAIN_CATALOG, brainCatalogIds());
    built.brainLiterals.applyBrains(new Map([["chaserBrain00001", { name: "Chaser" }]]));
    const literalId = kinTileId("chaserBrain00001");
    const minted = catalogTile(built.environment, literalId);
    const read = readBrainSource(built.environment, kinBrainSource(built.environment, literalId, "seekerBrain00001"));
    const placed = ((read.pages().get(0) as BrainPageDef).children().get(0) as BrainRuleDef).when().tiles().get(1);
    const config = buildBrainEditorConfig(built.environment, built.assetLiterals.view, built.brainLiterals.view);

    for (const def of [minted, placed]) {
      const frame = valueFrame(config, def);
      assert.doesNotMatch(frame, /<img/);
      assert.doesNotMatch(frame, /chaserBrain00001/);
      assert.match(frame, />Chaser</);
    }
  });
});
