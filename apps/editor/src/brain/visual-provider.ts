import type { BrainTileVariableDef, IBrainTileDef } from "@wendoo/core/app";
import { getCatalogFallbackLabel, mkLiteralTileId } from "@wendoo/core/app";
import type { ITileCatalog } from "@wendoo/core/brain";
import type { StructTypeDef, StructValue, TypeId } from "@wendoo/core/runtime";
import { getClosedStructFieldByName, NativeType } from "@wendoo/core/runtime";
import type { CustomLiteralType, TileVisual } from "@wendoo/ui";
import { createElement } from "react";
import { ASSET_FIELD, type AssetLiteral } from "@/services/asset-literals";
import { BRAIN_FIELD, type BrainLiteral } from "@/services/brain-literals";

/** The registered types an asset literal's value is read through. */
export interface AssetTypeRegistry {
  /** The registered definition of `typeId`, or `undefined` when none is registered. */
  get(typeId: TypeId): unknown;
}

/**
 * The display metadata `tileCatalogs` bind under `tileDef`'s tile id, the first
 * catalog holding the id standing, or `tileDef`'s own metadata when none holds
 * it.
 */
function boundMetadata(tileCatalogs: readonly ITileCatalog[], tileDef: IBrainTileDef): TileVisual | undefined {
  for (const catalog of tileCatalogs) {
    const bound = catalog.get(tileDef.tileId);
    if (bound !== undefined) return bound.metadata as TileVisual | undefined;
  }
  return tileDef.metadata as TileVisual | undefined;
}

/**
 * The editor's one tile visual provider: resolves any tile to how it shows.
 * An asset literal shows its asset's name as its label and its asset's
 * preview as its face while the snapshot lists the asset, and its label
 * alone, with no face, while it is unresolved. A page's own tile shows its
 * metadata with `pageIcon` as its face, and its metadata alone while no page
 * icon is given. A variable tile carrying no icon of its own shows its
 * variable type's icon, as `typeIcons` holds it, as its face. Every other tile
 * shows the display metadata the environment binds under its tile id, the
 * icon its catalog entry carries included -- whichever environment the tile
 * was read in -- and its own metadata when the environment binds no tile
 * under its id. Icons are data URIs for an image source; render them only as
 * one.
 *
 * Build a new provider whenever the environment is rebuilt or the asset
 * literals, the type icons or the page icon change.
 *
 * @param tileCatalogs - The environment's tile catalogs.
 * @param assetLiterals - The environment's asset literals, keyed by tile id.
 * @param typeIcons - The environment's type icons, keyed by type id.
 * @param pageIcon - The icon every page's own tile wears; omit it while none is bound.
 */
export function createTileVisualProvider(
  tileCatalogs: readonly ITileCatalog[],
  assetLiterals: ReadonlyMap<string, AssetLiteral>,
  typeIcons: ReadonlyMap<TypeId, string>,
  pageIcon?: string
): (tileDef: IBrainTileDef) => TileVisual | undefined {
  return (tileDef) => {
    const metadata = boundMetadata(tileCatalogs, tileDef);
    if (tileDef.kind === "page" && pageIcon !== undefined) {
      return { ...(metadata ?? { label: getCatalogFallbackLabel(tileDef) }), iconUrl: pageIcon };
    }
    if (tileDef.kind === "variable" && metadata?.iconUrl === undefined) {
      const typeIcon = typeIcons.get((tileDef as BrainTileVariableDef).varType);
      if (typeIcon !== undefined) {
        return { ...(metadata ?? { label: getCatalogFallbackLabel(tileDef) }), iconUrl: typeIcon };
      }
    }
    const literal = assetLiterals.get(tileDef.tileId);
    if (literal === undefined) return metadata;
    return {
      ...metadata,
      label: literal.label,
      ...(literal.previewUrl === undefined ? {} : { iconUrl: literal.previewUrl }),
    };
  };
}

/**
 * The short id `value` names: `value` itself when it is text -- a literal's
 * value label, which is its short id -- or the `asset` field of a struct value
 * of the asset type `typeId`; `undefined` when it names none.
 */
function assetIdOf(types: AssetTypeRegistry, typeId: TypeId, value: unknown): string | undefined {
  if (typeof value === "string") return value;
  const typeDef = types.get(typeId) as StructTypeDef | undefined;
  const struct = value as StructValue | undefined;
  if (typeDef === undefined || struct?.t !== NativeType.Struct) return undefined;
  const field = getClosedStructFieldByName(typeDef, struct, ASSET_FIELD);
  return field?.t === NativeType.String ? field.v : undefined;
}

/**
 * The brain editor's literal types for the asset types `assetLiterals` hold
 * literals of, one per type: each display-only, formatting a value -- or a
 * literal's value label -- as its literal's label, and drawing a placed literal's value box as its asset's
 * preview, an image source filling the value box's content height as a
 * candidate chip's face fills its slot, while the snapshot lists the asset -- and as that
 * label's text while it is unresolved.
 *
 * Build new types whenever the asset literals change.
 *
 * @param types - The environment's type registry.
 * @param assetLiterals - The environment's asset literals, keyed by tile id.
 */
export function createAssetLiteralTypes(
  types: AssetTypeRegistry,
  assetLiterals: ReadonlyMap<string, AssetLiteral>
): CustomLiteralType[] {
  const kinds = new Map<TypeId, string>();
  for (const literal of assetLiterals.values()) kinds.set(literal.typeId, literal.kind);
  return [...kinds].map(([typeId, kind]) => {
    const literalOf = (value: unknown): AssetLiteral | undefined => {
      const id = assetIdOf(types, typeId, value);
      return id === undefined ? undefined : assetLiterals.get(mkLiteralTileId(typeId, id));
    };
    return {
      typeId,
      description: `A ${kind} from the MakeCode project.`,
      formatValue: (value) => literalOf(value)?.label ?? assetIdOf(types, typeId, value) ?? "",
      renderValue: (value) => {
        const previewUrl = literalOf(value)?.previewUrl;
        if (previewUrl === undefined) return undefined;
        return createElement("img", {
          src: previewUrl,
          alt: "",
          "aria-hidden": true,
          className: "block h-12 w-12 object-contain",
        });
      },
    };
  });
}

/**
 * The document id `value` names: `value` itself when it is text -- a
 * literal's value label, which is its document id -- or the `id` field of a
 * struct value of the brain type `typeId`; `undefined` when it names none.
 */
function documentIdOf(types: AssetTypeRegistry, typeId: TypeId, value: unknown): string | undefined {
  if (typeof value === "string") return value;
  const typeDef = types.get(typeId) as StructTypeDef | undefined;
  const struct = value as StructValue | undefined;
  if (typeDef === undefined || struct?.t !== NativeType.Struct) return undefined;
  const field = getClosedStructFieldByName(typeDef, struct, BRAIN_FIELD);
  return field?.t === NativeType.String ? field.v : undefined;
}

/**
 * The brain editor's literal types for the brain types `brainLiterals` hold
 * literals of, one per type: each display-only, formatting a value -- or a
 * literal's value label -- as its literal's label, the brain's name, and
 * drawing a placed literal's value box as that label's text.
 *
 * Build new types whenever the brain literals change.
 *
 * @param types - The environment's type registry.
 * @param brainLiterals - The environment's brain literals, keyed by tile id.
 */
export function createBrainLiteralTypes(
  types: AssetTypeRegistry,
  brainLiterals: ReadonlyMap<string, BrainLiteral>
): CustomLiteralType[] {
  const typeIds = new Set<TypeId>();
  for (const literal of brainLiterals.values()) typeIds.add(literal.typeId);
  return [...typeIds].map((typeId) => {
    const labelOf = (value: unknown): string => {
      const id = documentIdOf(types, typeId, value);
      if (id === undefined) return "";
      return brainLiterals.get(mkLiteralTileId(typeId, id))?.label ?? id;
    };
    return {
      typeId,
      description: "A brain in this project.",
      formatValue: labelOf,
      renderValue: () => undefined,
    };
  });
}
