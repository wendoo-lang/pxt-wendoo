// ---------------------------------------------------------------------------
// Docs curation for the editor. The core docs come from @wendoo/docs; every
// other visible tile the environment's catalog holds -- the tiles the
// session's packs bind among them -- gets a docs entry derived at
// registry-build time. These maps hold the rules that derivation follows.
// ---------------------------------------------------------------------------

import type { BrainTileKind } from "@wendoo/core/app";

/**
 * Docs sidebar category for each tile kind that gets a derived docs entry.
 * Visible catalog tiles of kinds absent here get no entry.
 */
export const tileKindCategories: Partial<Record<BrainTileKind, string>> = {
  sensor: "Sensors",
  actuator: "Actuators",
  modifier: "Parameters & Modifiers",
  parameter: "Parameters & Modifiers",
  literal: "Literals",
};

/** Docs sidebar category of a struct type's page: the docs its variable factory tile carries. */
export const dataTypesCategory = "Data Types";

/**
 * Tile kinds whose tiles get a derived docs entry only while they carry docs,
 * and then an unlisted one: carrying no category, it is in no docs list or
 * search, and opens only by its tile id.
 */
export const unlistedTileKinds: ReadonlySet<BrainTileKind> = new Set<BrainTileKind>(["output", "accessor"]);

/** Visible catalog tiles that get no derived docs entry. */
export const undocumentedTileIds: ReadonlySet<string> = new Set([
  "tile.literal->boolean:<boolean>->true",
  "tile.literal->boolean:<boolean>->false",
  "tile.literal->nil:<nil>->nil",
]);
