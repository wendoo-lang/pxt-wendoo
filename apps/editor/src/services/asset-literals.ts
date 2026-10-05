import { Dict } from "@wendoo/core";
import { mkLiteralTileId } from "@wendoo/core/app";
import type { BrainServices } from "@wendoo/core/brain";
import { BrainTileLiteralDef } from "@wendoo/core/brain/tiles";
import type { StructTypeDef, TypeId, Value } from "@wendoo/core/runtime";
import { mkClosedStructValueByName, mkStringValue } from "@wendoo/core/runtime";
import type { MakeCodeAsset } from "@wendoo/makecode-session";

/**
 * Stable code of a brain placing the literal of a project asset the held
 * asset snapshot no longer lists. Informational: the brain still compiles,
 * to the same program as while the asset was listed.
 */
export const BRAIN_ASSET_UNRESOLVED = "BRAIN_ASSET_UNRESOLVED";

/** Name of the field of an asset type's struct value holding the asset's short id. */
export const ASSET_FIELD = "asset";

/** One catalog asset type the environment binds. */
export interface AssetType {
  /** The type's id. */
  readonly typeId: TypeId;
  /** The project asset kind its values name, for example `image`. */
  readonly kind: string;
  /** The type's registered definition. */
  readonly typeDef: StructTypeDef;
}

/** One asset literal tile the environment holds, as the UI reads it. */
export interface AssetLiteral {
  /** The literal tile's id, derived from its type and the asset's short id. */
  readonly tileId: string;
  /** The id of the literal's type, a catalog asset type. */
  readonly typeId: TypeId;
  /** The asset kind the literal's type names. */
  readonly kind: string;
  /** The asset's short id. */
  readonly id: string;
  /** What the literal reads as: the asset's name, else its short id; kept from the last snapshot listing it while it is unresolved. */
  readonly label: string;
  /** The asset's preview, a data URI for an image source; `undefined` while the literal is unresolved. */
  readonly previewUrl: string | undefined;
  /** Whether the held asset snapshot lists the asset. */
  readonly resolved: boolean;
}

/** A minted literal tile and the asset it names. */
interface Minted {
  readonly def: BrainTileLiteralDef;
  readonly type: AssetType;
  readonly id: string;
}

/** The key an asset is identified by: its kind and short id together. */
function assetKey(kind: string, id: string): string {
  return `${kind}\n${id}`;
}

/** Every tile reference the rules of the parsed brain source `document` hold, in no particular order. */
export function ruleTileRefs(document: unknown): unknown[] {
  const refs: unknown[] = [];
  const visitRule = (rule: unknown): void => {
    if (typeof rule !== "object" || rule === null) return;
    const { when, do: act, children } = rule as { when?: unknown; do?: unknown; children?: unknown };
    for (const side of [when, act]) if (Array.isArray(side)) refs.push(...side);
    if (Array.isArray(children)) children.forEach(visitRule);
  };
  const pages = (document as { pages?: unknown } | null)?.pages;
  if (Array.isArray(pages)) {
    for (const page of pages) {
      const rules = (page as { rules?: unknown } | null)?.rules;
      if (Array.isArray(rules)) rules.forEach(visitRule);
    }
  }
  return refs;
}

/**
 * The asset literal tiles of one environment: one per asset of a catalog
 * asset type that the held snapshot lists, and one per such literal a brain
 * source references, minted through the language model's literal builder.
 * Each literal's value is its type's struct naming the asset's short id, and
 * its tile id follows from type and id alone, so a literal minted from a
 * reference compiles exactly as one minted from the snapshot. Definitions
 * are never persisted: a brain holds only the literal's reference.
 *
 * A literal the held snapshot lists is resolved and offered as a candidate;
 * one it does not list stays bound for reading and compiling brains, and is
 * hidden from the candidates. Snapshot changes update the literals in place,
 * never touching the environment's other contents.
 */
export class AssetLiterals {
  private readonly _minted = new Map<string, Minted>();
  /** The held snapshot's assets by {@link assetKey}, or `undefined` while none is held. */
  private _assets: ReadonlyMap<string, MakeCodeAsset> | undefined;
  private _view: ReadonlyMap<string, AssetLiteral> = new Map();

  /**
   * @param services - The environment's brain services; literals register in its tile catalog.
   * @param types - The catalog asset types the environment binds.
   */
  constructor(
    private readonly services: BrainServices,
    private readonly types: readonly AssetType[]
  ) {}

  /** Every literal held, keyed by tile id, in the order minted. A new map each time any literal changes. */
  get view(): ReadonlyMap<string, AssetLiteral> {
    return this._view;
  }

  /**
   * Takes `assets` as the held snapshot, replacing any held before: mints a
   * literal for each listed asset of a bound asset type, relabels each one
   * whose asset was renamed, and marks each literal resolved or unresolved by
   * whether the snapshot lists its asset. `undefined` holds no snapshot.
   *
   * @param assets - The snapshot, or `undefined` for none.
   */
  applySnapshot(assets: readonly MakeCodeAsset[] | undefined): void {
    this._assets =
      assets === undefined ? undefined : new Map(assets.map((asset) => [assetKey(asset.kind, asset.id), asset]));
    for (const asset of assets ?? []) {
      for (const type of this.types) {
        if (type.kind === asset.kind) this.mint(type, asset.id);
      }
    }
    for (const minted of this._minted.values()) {
      const asset = this.assetOf(minted);
      minted.def.hidden = asset === undefined;
      const label = asset?.name ?? asset?.id;
      if (label !== undefined && minted.def.displayName !== label) minted.def.setDisplayName(label);
    }
    this.refreshView();
  }

  /**
   * Mints each literal of a bound asset type that the brain source `source`
   * references and the environment does not hold yet, resolved when the held
   * snapshot lists its asset. Reads nothing from a source that is not a brain
   * document.
   *
   * @param source - A brain source, as the brains store holds it.
   */
  bindSource(source: string): void {
    const before = this._minted.size;
    for (const { type, id } of this.referencesIn(source)) this.mint(type, id);
    if (this._minted.size !== before) this.refreshView();
  }

  /**
   * The literals the brain source `source` references whose asset the held
   * snapshot does not list, in reference order; empty while no snapshot is
   * held. Call {@link bindSource} with `source` first.
   *
   * @param source - A brain source, as the brains store holds it.
   */
  unresolvedIn(source: string): readonly AssetLiteral[] {
    if (this._assets === undefined) return [];
    const unresolved: AssetLiteral[] = [];
    for (const { type, id } of this.referencesIn(source)) {
      const literal = this._view.get(mkLiteralTileId(type.typeId, id));
      if (literal !== undefined && !literal.resolved && !unresolved.includes(literal)) unresolved.push(literal);
    }
    return unresolved;
  }

  /** The bound asset type and short id of each asset literal `source` references. */
  private referencesIn(source: string): { type: AssetType; id: string }[] {
    let document: unknown;
    try {
      document = JSON.parse(source);
    } catch {
      return [];
    }
    const references: { type: AssetType; id: string }[] = [];
    for (const ref of ruleTileRefs(document)) {
      for (const type of this.types) {
        const id = literalIdOf(ref, type.typeId);
        if (id !== undefined) references.push({ type, id });
      }
    }
    return references;
  }

  /** The held snapshot's entry for the asset `minted` names, or `undefined` when it lists none or none is held. */
  private assetOf(minted: Minted): MakeCodeAsset | undefined {
    return this._assets?.get(assetKey(minted.type.kind, minted.id));
  }

  /** Mints and registers the literal of `type` naming the asset `id`, unless the environment holds it. */
  private mint(type: AssetType, id: string): void {
    const tileId = mkLiteralTileId(type.typeId, id);
    if (this._minted.has(tileId) || this.services.edit.tiles.has(tileId)) return;
    const fields = new Dict<string, Value>();
    fields.set(ASSET_FIELD, mkStringValue(id));
    const asset = this._assets?.get(assetKey(type.kind, id));
    const def = new BrainTileLiteralDef(
      type.typeId,
      mkClosedStructValueByName(type.typeDef, fields),
      { persist: false, valueLabel: id, displayName: asset?.name ?? id, hidden: asset === undefined },
      this.services
    );
    this.services.edit.tiles.registerTileDef(def);
    this._minted.set(tileId, { def, type, id });
  }

  /** Rebuilds {@link view} from the minted literals, keeping the current map when nothing in it changed. */
  private refreshView(): void {
    const next = new Map<string, AssetLiteral>();
    let changed = false;
    for (const [tileId, minted] of this._minted) {
      const asset = this.assetOf(minted);
      const held = this._view.get(tileId);
      const literal: AssetLiteral = {
        tileId,
        typeId: minted.type.typeId,
        kind: minted.type.kind,
        id: minted.id,
        label: minted.def.displayName ?? minted.id,
        previewUrl: asset?.previewUrl,
        resolved: asset !== undefined,
      };
      const same =
        held !== undefined &&
        held.label === literal.label &&
        held.previewUrl === literal.previewUrl &&
        held.resolved === literal.resolved;
      next.set(tileId, same ? held : literal);
      if (!same) changed = true;
    }
    if (changed || next.size !== this._view.size) this._view = next;
  }
}

/**
 * The short id the tile reference `ref` names when it references a literal
 * of `typeId` -- a plain tile id, or a structured literal reference -- and
 * `undefined` otherwise.
 */
export function literalIdOf(ref: unknown, typeId: TypeId): string | undefined {
  if (typeof ref === "string") {
    const prefix = mkLiteralTileId(typeId, "");
    return ref.startsWith(prefix) && ref.length > prefix.length ? ref.slice(prefix.length) : undefined;
  }
  if (typeof ref !== "object" || ref === null) return undefined;
  const { k, type, label, format } = ref as { k?: unknown; type?: unknown; label?: unknown; format?: unknown };
  return k === "literal" && type === typeId && typeof label === "string" && format === undefined ? label : undefined;
}
