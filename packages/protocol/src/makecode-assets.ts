/**
 * The asset snapshot's wire contract: the MakeCode project's assets, published
 * whole by the party serving the project.
 */

/** One asset of the MakeCode project, as a {@link MakeCodeAssetsMessage} lists it. */
export interface MakeCodeAsset {
  /**
   * The asset's kind, as MakeCode names it, for example `image`. The set of
   * kinds is open: a party skips an entry whose kind it does not handle.
   */
  kind: string;
  /**
   * The asset's short id, as MakeCode stamps it in the project's asset
   * files: the id a compiled program names the asset by, unchanged when the
   * asset is renamed. Unique within its kind, so an entry is identified by
   * its kind and id together.
   */
  id: string;
  /** The asset's display name; absent when the asset has none. */
  name?: string;
  /** Width of the asset, in pixels; present for a kind with a pixel form, absent for one without. */
  width?: number;
  /** Height of the asset, in pixels; present for a kind with a pixel form, absent for one without. */
  height?: number;
  /** A data URI rendering the asset, usable as an image source as it is. */
  previewUrl: string;
}

/** Payload of a {@link MakeCodeAssetsMessage}. */
export interface MakeCodeAssetsPayload {
  /** Every asset the snapshot holds, in no particular order; empty when it holds none. */
  assets: MakeCodeAsset[];
}

/**
 * The MakeCode project's asset snapshot, published by the party serving the
 * project. Each snapshot is whole: a later snapshot replaces an earlier one.
 */
export interface MakeCodeAssetsMessage {
  type: "makecode:assets";
  payload: MakeCodeAssetsPayload;
}
