/**
 * Asset types: struct types whose values each name one of the MakeCode
 * project's assets -- an image, a song, a tile -- by the id the project gives
 * it. A pack declares one with {@link Pack.defineAssetType}, naming the kind
 * of asset its values name; a value holds the asset's id and nothing of the
 * asset itself, so the target extension resolving it finds the asset as the
 * project holds it when the value is used.
 */
namespace wendoo {
  /** Name of an asset type's one field: a read-only string holding the id of the asset the value names. */
  export const ASSET_FIELD = "asset";

  /**
   * Log code: a value named an asset the project holds none of -- one it has
   * deleted, or renamed away from the id the value holds. Logged as
   * `wendoo WENDOO_ASSET_UNRESOLVED <kind> <id>`, once per asset id.
   */
  export const ASSET_UNRESOLVED = "WENDOO_ASSET_UNRESOLVED";

  /**
   * The binding of one asset type. Pass it to {@link Pack.defineAssetType};
   * once the drain has registered the type, read the asset id of a value
   * with {@link AssetTypeBinding.assetIdOf}, and when the project holds no
   * asset under that id, report it with
   * {@link AssetTypeBinding.reportUnresolved}.
   */
  export class AssetTypeBinding extends StructTypeBinding {
    /** Kind of the project assets the type's values name, such as `"image"`; the catalog carries it. */
    assetKind: string;
    /** Asset ids already reported unresolved, each logged once. */
    private unresolved: string[] = [];

    /**
     * @param assetKind - Kind of the project assets the type's values name.
     */
    constructor(assetKind: string) {
      super();
      this.assetKind = assetKind;
    }

    /**
     * The asset id `value` holds in its {@link ASSET_FIELD} when it is a
     * value of this type; `""` for any other value, nil included.
     *
     * @param value - Any value a program produced.
     */
    assetIdOf(value: Value): string {
      if (!value || value.t !== ValueTag.Struct || value.typeId !== this.typeId) {
        return "";
      }
      const asset = value.fields[this.fieldIds[0]];
      return asset ? asset.str : "";
    }

    /**
     * Log that the project holds no asset under `assetId`, as
     * `wendoo WENDOO_ASSET_UNRESOLVED <kind> <id>`: the first time it is
     * reported, and never again in the same program run.
     *
     * @param assetId - The asset id a value held.
     */
    reportUnresolved(assetId: string): void {
      if (this.unresolved.indexOf(assetId) >= 0) {
        return;
      }
      this.unresolved.push(assetId);
      console.log(`wendoo ${ASSET_UNRESOLVED} ${this.assetKind} ${assetId}`);
    }
  }
}
