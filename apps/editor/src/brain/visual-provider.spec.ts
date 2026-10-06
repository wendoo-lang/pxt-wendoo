import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CoreHostActions, mkActuatorTileId, mkLiteralTileId, mkModifierTileId, mkSensorTileId } from "@wendoo/core/app";
import { BrainTilePageDef } from "@wendoo/core/brain/tiles";
import { buildAuthoringEnvironment } from "../services/authoring-environment.js";
import { emptyIdManifest } from "../services/id-allocation.js";
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

/** The icon {@link PAGE_ICON_CATALOG} gives the page family. */
const PAGE_ICON = "data:image/svg+xml;base64,cGFnZQ==";

/** A catalog in the rendered form the simx publishes whose one pack gives the page family id {@link PAGE_ICON}. */
const PAGE_ICON_CATALOG = JSON.stringify({
  packs: [{ name: "pages", coreTileIcons: [{ tileId: "tile.page", iconUrl: PAGE_ICON }] }],
});

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

  it("resolves every page tile to the page icon the environment binds, keeping each page's name as its label", () => {
    const built = buildAuthoringEnvironment(PAGE_ICON_CATALOG, emptyIdManifest());
    const resolve = createTileVisualProvider(built.assetLiterals.view, built.pageIcon);

    assert.deepEqual(resolve(new BrainTilePageDef("page-start", "start")), { label: "start", iconUrl: PAGE_ICON });
    assert.deepEqual(resolve(new BrainTilePageDef("page-chase", "chase")), { label: "chase", iconUrl: PAGE_ICON });
  });

  it("leaves a page tile as its own metadata reads while the environment binds no page icon", () => {
    const { assetLiterals, pageIcon } = bound();
    const resolve = createTileVisualProvider(assetLiterals.view, pageIcon);
    const page = new BrainTilePageDef("page-start", "start");

    assert.equal(pageIcon, undefined);
    assert.deepEqual(resolve(page), page.metadata);
    assert.equal(resolve(page)?.iconUrl, undefined);
  });
});
