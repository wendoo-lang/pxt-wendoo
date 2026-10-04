import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CoreHostActions, mkActuatorTileId, mkLiteralTileId, mkModifierTileId, mkSensorTileId } from "@wendoo/core/app";
import { buildAuthoringEnvironment } from "../services/authoring-environment.js";
import {
  ASSET_CATALOG,
  assetCatalogIds,
  BLANK_ICON,
  catalogTile,
  PICTURE_TYPE,
  picture,
  SHOW,
  SHOW_ICON,
  SPOT,
  SPOT_ICON,
} from "../test-support/asset-catalog.js";
import { createTileVisualProvider } from "./visual-provider.js";

/** An environment binding the asset catalog, its literals minted from `assets`. */
function bound(assets?: Parameters<ReturnType<typeof buildAuthoringEnvironment>["assetLiterals"]["applySnapshot"]>[0]) {
  const built = buildAuthoringEnvironment(ASSET_CATALOG, assetCatalogIds());
  built.assetLiterals.applySnapshot(assets);
  return built;
}

describe("createTileVisualProvider", () => {
  it("resolves a vocabulary tile to the icon its catalog entry carries", () => {
    const { environment, assetLiterals } = bound();
    const resolve = createTileVisualProvider(assetLiterals.view);

    assert.equal(resolve(catalogTile(environment, mkSensorTileId(SPOT)))?.iconUrl, SPOT_ICON);
    assert.equal(resolve(catalogTile(environment, mkActuatorTileId(SHOW)))?.iconUrl, SHOW_ICON);
    assert.equal(resolve(catalogTile(environment, mkModifierTileId("modifier.gallery.blank")))?.iconUrl, BLANK_ICON);
    assert.equal(resolve(catalogTile(environment, mkSensorTileId(SPOT)))?.label, "spot");
  });

  it("resolves a tile carrying no icon to no icon", () => {
    const { environment, assetLiterals } = bound();
    const resolve = createTileVisualProvider(assetLiterals.view);

    assert.equal(
      resolve(catalogTile(environment, mkSensorTileId(CoreHostActions.OnPageEntered.key)))?.iconUrl,
      undefined
    );
  });

  it("resolves an asset literal to its asset's preview as its face and its name as its label", () => {
    const { environment, assetLiterals } = bound([picture("img1", "hero", "data:image/svg+xml;base64,aGVybw==")]);
    const resolve = createTileVisualProvider(assetLiterals.view);

    const visual = resolve(catalogTile(environment, mkLiteralTileId(PICTURE_TYPE, "img1")));

    assert.equal(visual?.iconUrl, "data:image/svg+xml;base64,aGVybw==");
    assert.equal(visual?.label, "hero");
  });

  it("resolves an unresolved asset literal to its label alone, with no face", () => {
    const { environment, assetLiterals } = bound([picture("img1", "hero")]);
    assetLiterals.applySnapshot([]);
    const resolve = createTileVisualProvider(assetLiterals.view);

    const visual = resolve(catalogTile(environment, mkLiteralTileId(PICTURE_TYPE, "img1")));

    assert.equal(visual?.iconUrl, undefined);
    assert.equal(visual?.label, "hero");
  });
});
