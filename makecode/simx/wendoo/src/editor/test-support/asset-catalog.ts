/**
 * A small session catalog declaring an asset type, and the helpers the asset
 * specs build their environments, brains and snapshots from.
 */
import type { IBrainTileDef, WendooEnvironment } from "@wendoo/core/app";
import { BrainDef, mkActuatorTileId, mkSensorTileId } from "@wendoo/core/app";
import type { BrainPageDef, BrainRuleDef } from "@wendoo/core/brain/model";
import { mkTypeId, NativeType } from "@wendoo/core/runtime";
import type { MakeCodeAsset, MakeCodeIdManifest } from "@wendoo/makecode-session";
import { serializeBrainSource } from "../services/brain-source.js";
import { parseCatalog } from "../services/catalog.js";
import { allocateIds, emptyIdManifest } from "../services/id-allocation.js";

/** The asset kind {@link ASSET_CATALOG}'s asset type declares. */
export const PICTURE_KIND = "image";

/** Type id of {@link ASSET_CATALOG}'s asset type. */
export const PICTURE_TYPE = mkTypeId(NativeType.Struct, "Picture");

/** The icon {@link ASSET_CATALOG} carries on its `spot` sensor. */
export const SPOT_ICON = "data:image/svg+xml;base64,c3BvdA==";

/** The icon {@link ASSET_CATALOG} carries on its `show` actuator. */
export const SHOW_ICON = "data:image/svg+xml;base64,c2hvdw==";

/** The icon {@link ASSET_CATALOG} carries on the `blank` modifier slot of its `show` actuator. */
export const BLANK_ICON = "data:image/svg+xml;base64,Ymxhbms=";

/** Name of the sensor taking an optional picture to look for. */
export const SPOT = "sensor.gallery.spot";

/** Name of the sensor taking an optional number. */
export const NEAR = "sensor.gallery.near";

/** Name of the actuator taking a choice of a picture or the `blank` modifier. */
export const SHOW = "actuator.gallery.show";

/**
 * A catalog in the rendered form the simx publishes: one pack declaring the
 * asset type `Picture` (kind {@link PICTURE_KIND}, one read-only `asset`
 * field), a sensor whose optional anonymous slot takes a picture, a sensor
 * whose optional anonymous slot takes a number, and an actuator choosing
 * between a picture and a modifier slot. Its tiles and the modifier slot
 * carry icons as data URIs.
 */
export const ASSET_CATALOG = JSON.stringify({
  packs: [
    {
      name: "gallery",
      types: [{ name: "Picture", asset: PICTURE_KIND, fields: [{ name: "asset", type: "string", readOnly: true }] }],
      tiles: [
        {
          name: SPOT,
          kind: "sensor",
          args: [{ tileId: "anon.Picture", type: "Picture", optional: true, anonymous: true }],
          returns: "boolean",
          label: "spot",
          iconUrl: SPOT_ICON,
        },
        {
          name: NEAR,
          kind: "sensor",
          args: [{ tileId: "anon.number", type: "number", optional: true, anonymous: true }],
          returns: "boolean",
          label: "near",
        },
        {
          name: SHOW,
          kind: "actuator",
          call: [
            {
              kind: "choice",
              options: [
                { kind: "arg", tileId: "anon.Picture", type: "Picture", anonymous: true },
                { kind: "arg", tileId: "modifier.gallery.blank", modifier: true, label: "blank", iconUrl: BLANK_ICON },
              ],
            },
          ],
          label: "show",
          iconUrl: SHOW_ICON,
        },
      ],
    },
  ],
});

/** The allocation a project holding no manifest gets for {@link ASSET_CATALOG}. */
export function assetCatalogIds(): MakeCodeIdManifest {
  return allocateIds(emptyIdManifest(), parseCatalog(ASSET_CATALOG));
}

/**
 * One snapshot entry of kind {@link PICTURE_KIND}.
 *
 * @param id - The asset's short id.
 * @param name - The asset's display name; omit for a nameless asset.
 * @param previewUrl - The asset's preview; defaults to one derived from `id`.
 */
export function picture(id: string, name?: string, previewUrl = `data:image/svg+xml;base64,${id}`): MakeCodeAsset {
  return { kind: PICTURE_KIND, id, ...(name === undefined ? {} : { name }), width: 16, height: 16, previewUrl };
}

/** The tile `tileId` from `environment`'s catalogs. Throws when none holds it. */
export function catalogTile(environment: WendooEnvironment, tileId: string): IBrainTileDef {
  for (const catalog of environment.tileCatalogs()) {
    const found = catalog.get(tileId);
    if (found) return found;
  }
  throw new Error(`no tile ${tileId}`);
}

/**
 * The source of a one-rule brain `WHEN spot [literal] DO show [literal]`,
 * placing the literal tile `literalTileId` from `environment` on both sides.
 */
export function pictureBrainSource(environment: WendooEnvironment, literalTileId: string): string {
  const literal = catalogTile(environment, literalTileId);
  const brain = BrainDef.emptyBrainDef(environment.brainServices, "Gallery");
  const rule = (brain.pages().get(0) as BrainPageDef).children().get(0) as BrainRuleDef;
  rule.when().appendTile(catalogTile(environment, mkSensorTileId(SPOT)));
  rule.when().appendTile(literal);
  rule.do().appendTile(catalogTile(environment, mkActuatorTileId(SHOW)));
  rule.do().appendTile(literal);
  return serializeBrainSource(brain);
}
