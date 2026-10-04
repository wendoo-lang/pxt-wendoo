import type { IBrainTileDef } from "@wendoo/core/app";
import { mkLiteralTileId } from "@wendoo/core/app";
import type { StructTypeDef, StructValue, TypeId } from "@wendoo/core/runtime";
import { getClosedStructFieldByName, NativeType } from "@wendoo/core/runtime";
import type { CustomLiteralType, TileVisual } from "@wendoo/ui";
import { createElement } from "react";
import { ASSET_FIELD, type AssetLiteral } from "@/services/asset-literals";

/** The registered types an asset literal's value is read through. */
export interface AssetTypeRegistry {
  /** The registered definition of `typeId`, or `undefined` when none is registered. */
  get(typeId: TypeId): unknown;
}

/**
 * The editor's one tile visual provider: resolves any tile to how it shows.
 * An asset literal shows its asset's name as its label and its asset's
 * preview as its face while the snapshot lists the asset, and its label
 * alone, with no face, while it is unresolved. Every other tile shows the
 * display metadata the environment bound for it, the icon its catalog entry
 * carries included. Icons are data URIs for an image source; render them only
 * as one.
 *
 * Build a new provider whenever the asset literals change.
 *
 * @param assetLiterals - The environment's asset literals, keyed by tile id.
 */
export function createTileVisualProvider(
  assetLiterals: ReadonlyMap<string, AssetLiteral>
): (tileDef: IBrainTileDef) => TileVisual | undefined {
  return (tileDef) => {
    const intrinsic = tileDef.metadata as TileVisual | undefined;
    const literal = assetLiterals.get(tileDef.tileId);
    if (literal === undefined) return intrinsic;
    return {
      ...intrinsic,
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
