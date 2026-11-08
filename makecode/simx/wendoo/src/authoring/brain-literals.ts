import { Dict } from "@wendoo/core";
import { mkLiteralTileId } from "@wendoo/core/app";
import type { BrainServices } from "@wendoo/core/brain";
import { BrainTileLiteralDef } from "@wendoo/core/brain/tiles";
import type { StructTypeDef, TypeId, Value } from "@wendoo/core/runtime";
import { mkClosedStructValueByName, mkStringValue } from "@wendoo/core/runtime";
import { literalIdOf, ruleTileRefs } from "./asset-literals";

/**
 * Stable code of a brain placing the literal of a brain the brains store no
 * longer holds. Informational: the brain still compiles, to the same program
 * as while the named brain was held.
 */
export const BRAIN_REFERENCE_UNRESOLVED = "BRAIN_REFERENCE_UNRESOLVED";

/** Name of the field of a brain type's struct value holding the brain's document id. */
export const BRAIN_FIELD = "id";

/** One catalog brain type the environment binds. */
export interface BrainType {
  /** The type's id. */
  readonly typeId: TypeId;
  /** The type's registered definition. */
  readonly typeDef: StructTypeDef;
  /** The type's icon, which each of its literals wears, or absent when the type carries none. */
  readonly iconUrl?: string;
}

/** One brain literal tile the environment holds, as the UI reads it. */
export interface BrainLiteral {
  /** The literal tile's id, derived from its type and the brain's document id. */
  readonly tileId: string;
  /** The id of the literal's type, a catalog brain type. */
  readonly typeId: TypeId;
  /** The document id of the brain the literal names. */
  readonly id: string;
  /** What the literal reads as: the brain's name, else its document id; kept from the last brains holding it while it is unresolved. */
  readonly label: string;
  /** Whether the brains store holds the brain. */
  readonly resolved: boolean;
}

/** A brain literal a brain source places whose brain the brains store does not hold. */
export interface UnresolvedBrainReference extends BrainLiteral {
  /** Why the reference is reported. */
  readonly code: typeof BRAIN_REFERENCE_UNRESOLVED;
}

/** A minted literal tile and the brain it names. */
interface Minted {
  readonly def: BrainTileLiteralDef;
  readonly type: BrainType;
  readonly id: string;
}

/**
 * The brain literal tiles of one environment: one per brain the brains store
 * holds, for each catalog brain type, and one per such literal a brain source
 * references, minted through the language model's literal builder. Each
 * literal wears its type's icon, its value is its type's struct naming the
 * brain's document id, and its tile id follows from type and id alone, so a
 * literal minted from a reference compiles exactly as one minted from the
 * held brains. Definitions are never persisted: a brain holds only the
 * literal's reference.
 *
 * A literal whose brain is held is resolved and offered as a candidate; one
 * whose brain is not stays bound for reading and compiling brains, and is
 * hidden from the candidates. Changes to the held brains update the literals
 * in place, never touching the environment's other contents.
 */
export class BrainLiterals {
  private readonly _minted = new Map<string, Minted>();
  /** The held brains' names by document id, or `undefined` while none have been applied. */
  private _brains: ReadonlyMap<string, { readonly name: string }> | undefined;
  private _view: ReadonlyMap<string, BrainLiteral> = new Map();

  /**
   * @param services - The environment's brain services; literals register in its tile catalog.
   * @param types - The catalog brain types the environment binds.
   */
  constructor(
    private readonly services: BrainServices,
    private readonly types: readonly BrainType[]
  ) {}

  /** Every literal held, keyed by tile id, in the order minted. A new map each time any literal changes. */
  get view(): ReadonlyMap<string, BrainLiteral> {
    return this._view;
  }

  /**
   * Takes `brains` as the held brains, replacing any held before: mints a
   * literal for each brain and each bound brain type, relabels each one whose
   * brain was renamed, and marks each literal resolved or unresolved by
   * whether `brains` holds its brain.
   *
   * @param brains - The held brains, keyed by document id, each with its name.
   */
  applyBrains(brains: ReadonlyMap<string, { readonly name: string }>): void {
    this._brains = brains;
    for (const id of brains.keys()) {
      for (const type of this.types) this.mint(type, id);
    }
    for (const minted of this._minted.values()) {
      const brain = brains.get(minted.id);
      minted.def.hidden = brain === undefined;
      if (brain !== undefined && minted.def.displayName !== this.labelOf(minted.id)) {
        minted.def.setDisplayName(this.labelOf(minted.id));
      }
    }
    this.refreshView();
  }

  /**
   * Mints each literal of a bound brain type that the brain source `source`
   * references and the environment does not hold yet, resolved when the held
   * brains hold its brain. Reads nothing from a source that is not a brain
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
   * The literals the brain source `source` references whose brain the held
   * brains do not hold, in reference order; empty while no brains have been
   * applied. Call {@link bindSource} with `source` first.
   *
   * @param source - A brain source, as the brains store holds it.
   */
  unresolvedIn(source: string): readonly UnresolvedBrainReference[] {
    if (this._brains === undefined) return [];
    const unresolved: UnresolvedBrainReference[] = [];
    for (const { type, id } of this.referencesIn(source)) {
      const literal = this._view.get(mkLiteralTileId(type.typeId, id));
      if (literal === undefined || literal.resolved) continue;
      if (unresolved.some((held) => held.tileId === literal.tileId)) continue;
      unresolved.push({ ...literal, code: BRAIN_REFERENCE_UNRESOLVED });
    }
    return unresolved;
  }

  /** The bound brain type and document id of each brain literal `source` references. */
  private referencesIn(source: string): { type: BrainType; id: string }[] {
    let document: unknown;
    try {
      document = JSON.parse(source);
    } catch {
      return [];
    }
    const references: { type: BrainType; id: string }[] = [];
    for (const ref of ruleTileRefs(document)) {
      for (const type of this.types) {
        const id = literalIdOf(ref, type.typeId);
        if (id !== undefined) references.push({ type, id });
      }
    }
    return references;
  }

  /** What the literal naming the brain `id` reads as: the held brain's name when it has one, else `id`. */
  private labelOf(id: string): string {
    const name = this._brains?.get(id)?.name;
    return name === undefined || name === "" ? id : name;
  }

  /** Mints and registers the literal of `type` naming the brain `id`, unless the environment holds it. */
  private mint(type: BrainType, id: string): void {
    const tileId = mkLiteralTileId(type.typeId, id);
    if (this._minted.has(tileId) || this.services.edit.tiles.has(tileId)) return;
    const fields = new Dict<string, Value>();
    fields.set(BRAIN_FIELD, mkStringValue(id));
    const def = new BrainTileLiteralDef(
      type.typeId,
      mkClosedStructValueByName(type.typeDef, fields),
      {
        persist: false,
        valueLabel: id,
        displayName: this.labelOf(id),
        hidden: this._brains?.get(id) === undefined,
        ...(type.iconUrl === undefined ? {} : { metadata: { label: id, iconUrl: type.iconUrl } }),
      },
      this.services
    );
    this.services.edit.tiles.registerTileDef(def);
    this._minted.set(tileId, { def, type, id });
  }

  /** Rebuilds {@link view} from the minted literals, keeping the current map when nothing in it changed. */
  private refreshView(): void {
    const next = new Map<string, BrainLiteral>();
    let changed = false;
    for (const [tileId, minted] of this._minted) {
      const held = this._view.get(tileId);
      const literal: BrainLiteral = {
        tileId,
        typeId: minted.type.typeId,
        id: minted.id,
        label: minted.def.displayName ?? minted.id,
        resolved: this._brains?.has(minted.id) === true,
      };
      const same = held !== undefined && held.label === literal.label && held.resolved === literal.resolved;
      next.set(tileId, same ? held : literal);
      if (!same) changed = true;
    }
    if (changed || next.size !== this._view.size) this._view = next;
  }
}
