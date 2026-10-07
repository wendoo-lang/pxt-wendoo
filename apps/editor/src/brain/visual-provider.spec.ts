import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { IBrainTileDef } from "@wendoo/core/app";
import {
  CoreHostActions,
  CoreTypeIds,
  CoreVariableFactoryId,
  mkActuatorTileId,
  mkLiteralTileId,
  mkModifierTileId,
  mkSensorTileId,
  mkVariableFactoryTileId,
} from "@wendoo/core/app";
import { type BrainTileFactoryDef, BrainTilePageDef } from "@wendoo/core/brain/tiles";
import { mkTypeId, NativeType } from "@wendoo/core/runtime";
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

/** The icon {@link VARIABLE_CATALOG} carries on its `Spot` type. */
const SPOT_TYPE_ICON = "data:image/svg+xml;base64,c3BvdA==";

/** The icon {@link VARIABLE_CATALOG} gives the core number type. */
const NUMBER_TYPE_ICON = "data:image/svg+xml;base64,bnVtYmVy";

/**
 * A catalog in the rendered form the simx publishes whose one pack declares
 * two types brains may hold variables of -- `Spot`, carrying an icon, and
 * `Bare`, carrying none -- and gives the core number type an icon.
 */
const VARIABLE_CATALOG = JSON.stringify({
  packs: [
    {
      name: "lookout",
      types: [
        { name: "Spot", variableFactory: true, fields: [{ name: "x", type: "number" }], iconUrl: SPOT_TYPE_ICON },
        { name: "Bare", variableFactory: true, fields: [{ name: "x", type: "number" }] },
      ],
      coreTypeIcons: [{ type: "number", iconUrl: NUMBER_TYPE_ICON }],
    },
  ],
});

/** The variable tile named `name` the variable factory `factoryId` of `environment` mints. */
function mintedVariable(
  environment: ReturnType<typeof buildAuthoringEnvironment>["environment"],
  factoryId: string,
  name: string
): IBrainTileDef {
  const factory = catalogTile(environment, mkVariableFactoryTileId(factoryId)) as BrainTileFactoryDef;
  const variable = factory.manufacture(factory, { name });
  if (variable === undefined) throw new Error(`factory ${factoryId} minted nothing`);
  return variable;
}

/** An environment binding the asset catalog, its literals minted from `assets`. */
function bound(assets?: Parameters<ReturnType<typeof buildAuthoringEnvironment>["assetLiterals"]["applySnapshot"]>[0]) {
  const built = buildAuthoringEnvironment(ASSET_CATALOG, assetCatalogIds());
  built.assetLiterals.applySnapshot(assets);
  return built;
}

describe("createTileVisualProvider", () => {
  it("resolves a vocabulary tile to the icon its catalog entry carries", () => {
    const { environment, assetLiterals, typeIcons } = bound();
    const resolve = createTileVisualProvider(environment.tileCatalogs(), assetLiterals.view, typeIcons);

    assert.equal(resolve(catalogTile(environment, mkSensorTileId(SPOT)))?.iconUrl, SPOT_ICON);
    assert.equal(resolve(catalogTile(environment, mkActuatorTileId(SHOW)))?.iconUrl, SHOW_ICON);
    assert.equal(resolve(catalogTile(environment, mkModifierTileId("modifier.gallery.blank")))?.iconUrl, BLANK_ICON);
    assert.equal(resolve(catalogTile(environment, mkSensorTileId(SPOT)))?.label, "spot");
  });

  it("resolves a tile read in another environment to the icon this environment binds under its id", () => {
    const repaintedIcon = "data:image/svg+xml;base64,cmVwYWludGVk";
    const earlier = bound();
    const repainted = ASSET_CATALOG.replace(SPOT_ICON, repaintedIcon);
    assert.notEqual(repainted, ASSET_CATALOG);
    const current = buildAuthoringEnvironment(repainted, assetCatalogIds());
    const resolve = createTileVisualProvider(
      current.environment.tileCatalogs(),
      current.assetLiterals.view,
      current.typeIcons
    );

    assert.equal(resolve(catalogTile(earlier.environment, mkSensorTileId(SPOT)))?.iconUrl, repaintedIcon);
    assert.equal(resolve(catalogTile(earlier.environment, mkActuatorTileId(SHOW)))?.iconUrl, SHOW_ICON);
  });

  it("resolves a tile carrying no icon to no icon", () => {
    const { environment, assetLiterals, typeIcons } = bound();
    const resolve = createTileVisualProvider(environment.tileCatalogs(), assetLiterals.view, typeIcons);

    assert.equal(
      resolve(catalogTile(environment, mkSensorTileId(CoreHostActions.OnPageEntered.key)))?.iconUrl,
      undefined
    );
  });

  it("resolves an asset literal to its asset's preview as its face and its name as its label", () => {
    const { environment, assetLiterals, typeIcons } = bound([
      picture("img1", "hero", "data:image/svg+xml;base64,aGVybw=="),
    ]);
    const resolve = createTileVisualProvider(environment.tileCatalogs(), assetLiterals.view, typeIcons);

    const visual = resolve(catalogTile(environment, mkLiteralTileId(PICTURE_TYPE, "img1")));

    assert.equal(visual?.iconUrl, "data:image/svg+xml;base64,aGVybw==");
    assert.equal(visual?.label, "hero");
  });

  it("resolves an unresolved asset literal to its label alone, with no face", () => {
    const { environment, assetLiterals, typeIcons } = bound([picture("img1", "hero")]);
    assetLiterals.applySnapshot([]);
    const resolve = createTileVisualProvider(environment.tileCatalogs(), assetLiterals.view, typeIcons);

    const visual = resolve(catalogTile(environment, mkLiteralTileId(PICTURE_TYPE, "img1")));

    assert.equal(visual?.iconUrl, undefined);
    assert.equal(visual?.label, "hero");
  });

  it("resolves every page tile to the page icon the environment binds, keeping each page's name as its label", () => {
    const built = buildAuthoringEnvironment(PAGE_ICON_CATALOG, emptyIdManifest());
    const resolve = createTileVisualProvider(
      built.environment.tileCatalogs(),
      built.assetLiterals.view,
      built.typeIcons,
      built.pageIcon
    );

    assert.deepEqual(resolve(new BrainTilePageDef("page-start", "start")), { label: "start", iconUrl: PAGE_ICON });
    assert.deepEqual(resolve(new BrainTilePageDef("page-chase", "chase")), { label: "chase", iconUrl: PAGE_ICON });
  });

  it("leaves a page tile as its own metadata reads while the environment binds no page icon", () => {
    const { environment, assetLiterals, typeIcons, pageIcon } = bound();
    const resolve = createTileVisualProvider(environment.tileCatalogs(), assetLiterals.view, typeIcons, pageIcon);
    const page = new BrainTilePageDef("page-start", "start");

    assert.equal(pageIcon, undefined);
    assert.deepEqual(resolve(page), page.metadata);
    assert.equal(resolve(page)?.iconUrl, undefined);
  });

  it("resolves a variable tile to its variable type's icon as its face, a pack type's and a core type's alike", () => {
    const built = buildAuthoringEnvironment(VARIABLE_CATALOG, emptyIdManifest());
    const resolve = createTileVisualProvider(
      built.environment.tileCatalogs(),
      built.assetLiterals.view,
      built.typeIcons
    );
    const spotType = mkTypeId(NativeType.Struct, "Spot");

    const spot = resolve(mintedVariable(built.environment, spotType, "home"));
    const count = resolve(mintedVariable(built.environment, CoreVariableFactoryId.Number, "count"));

    assert.notEqual(built.typeIcons.get(spotType), undefined);
    assert.equal(spot?.iconUrl, built.typeIcons.get(spotType));
    assert.notEqual(built.typeIcons.get(CoreTypeIds.Number), undefined);
    assert.equal(count?.iconUrl, built.typeIcons.get(CoreTypeIds.Number));
  });

  it("leaves a variable tile whose type carries no icon as its own metadata reads", () => {
    const built = buildAuthoringEnvironment(VARIABLE_CATALOG, emptyIdManifest());
    const resolve = createTileVisualProvider(
      built.environment.tileCatalogs(),
      built.assetLiterals.view,
      built.typeIcons
    );
    const bare = mintedVariable(built.environment, mkTypeId(NativeType.Struct, "Bare"), "spot");

    assert.deepEqual(resolve(bare), bare.metadata);
    assert.equal(resolve(bare)?.iconUrl, undefined);
  });
});
