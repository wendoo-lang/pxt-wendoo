/**
 * A small session catalog declaring a brain type, and the helpers the brain
 * literal specs build their environments and brains from.
 */
import type { WendooEnvironment } from "@wendoo/core/app";
import { BrainDef, mkLiteralTileId, mkSensorTileId } from "@wendoo/core/app";
import type { BrainPageDef, BrainRuleDef } from "@wendoo/core/brain/model";
import { mkTypeId, NativeType } from "@wendoo/core/runtime";
import type { MakeCodeIdManifest } from "@wendoo/makecode-session";
import { serializeBrainSource } from "../services/brain-source.js";
import { parseCatalog } from "../services/catalog.js";
import { allocateIds, emptyIdManifest } from "../services/id-allocation.js";
import { catalogTile } from "./asset-catalog.js";

/** Type id of {@link BRAIN_CATALOG}'s brain type. */
export const KIN_TYPE = mkTypeId(NativeType.Struct, "Kin");

/** Name of the sensor taking an optional brain to look for. */
export const SEEK = "sensor.roster.seek";

/** Name of the sensor taking an optional number. */
export const COUNT = "sensor.roster.count";

/**
 * A catalog in the rendered form the simx publishes: one pack declaring the
 * brain type `Kin` (one read-only `id` field), a struct type `Badge` of the
 * same shape that is no brain type, a sensor whose optional
 * anonymous slot takes a brain, and a sensor whose optional anonymous slot
 * takes a number; and a second pack declaring an asset type, which is no
 * brain type.
 */
export const BRAIN_CATALOG = JSON.stringify({
  packs: [
    {
      name: "roster",
      types: [
        { name: "Kin", brain: true, fields: [{ name: "id", type: "string", readOnly: true }] },
        { name: "Badge", fields: [{ name: "id", type: "string", readOnly: true }] },
      ],
      tiles: [
        {
          name: SEEK,
          kind: "sensor",
          args: [{ tileId: "anon.Kin", type: "Kin", optional: true, anonymous: true }],
          returns: "boolean",
          label: "seek",
        },
        {
          name: COUNT,
          kind: "sensor",
          args: [{ tileId: "anon.number", type: "number", optional: true, anonymous: true }],
          returns: "boolean",
          label: "count",
        },
      ],
    },
    {
      name: "gallery",
      types: [{ name: "Picture", asset: "image", fields: [{ name: "asset", type: "string", readOnly: true }] }],
    },
  ],
});

/** The allocation a project holding no manifest gets for {@link BRAIN_CATALOG}. */
export function brainCatalogIds(): MakeCodeIdManifest {
  return allocateIds(emptyIdManifest(), parseCatalog(BRAIN_CATALOG));
}

/** The literal tile id the brain `documentId` is minted under. */
export function kinTileId(documentId: string): string {
  return mkLiteralTileId(KIN_TYPE, documentId);
}

/**
 * The source of a one-rule brain `WHEN seek [literal]`, placing the literal
 * tile `literalTileId` from `environment`, under the document id `id`.
 */
export function kinBrainSource(environment: WendooEnvironment, literalTileId: string, id: string): string {
  const brain = BrainDef.emptyBrainDef(environment.brainServices, "Seeker");
  const rule = (brain.pages().get(0) as BrainPageDef).children().get(0) as BrainRuleDef;
  rule.when().appendTile(catalogTile(environment, mkSensorTileId(SEEK)));
  rule.when().appendTile(catalogTile(environment, literalTileId));
  return serializeBrainSource(brain).replace(/"id": "[^"]+"/, `"id": "${id}"`);
}
