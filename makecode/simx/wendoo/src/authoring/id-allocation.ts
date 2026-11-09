import { TARGET_ACTION_ID_BASE, TARGET_FUNC_ID_BASE, TARGET_TYPE_ATOM_BASE } from "@wendoo/core/runtime";
import type {
  MakeCodeIdEntry,
  MakeCodeIdManifest,
  MakeCodeManifestReading,
  MakeCodeTypeIdEntry,
} from "@wendoo/makecode-session";
import { MakeCodeManifestProblemCode } from "@wendoo/makecode-session";
import type { ParsedCatalog } from "./catalog";

/**
 * The first id of each id space pack vocabulary is allocated from:
 * the target partition of the host-action, host-function and type-atom
 * spaces, above every id the core vocabulary holds.
 */
export const ID_SPACE_BASES = {
  action: TARGET_ACTION_ID_BASE,
  operator: TARGET_FUNC_ID_BASE,
  atom: TARGET_TYPE_ATOM_BASE,
} as const;

/** A manifest allocating nothing, every id space at its base. */
export function emptyIdManifest(): MakeCodeIdManifest {
  return {
    actions: [],
    operators: [],
    types: [],
    next: { action: ID_SPACE_BASES.action, operator: ID_SPACE_BASES.operator, atom: ID_SPACE_BASES.atom },
  };
}

/** The id the next allocation in a space takes: above its watermark, its base, and every id it holds. */
function nextFree(watermark: number, base: number, ids: readonly number[]): number {
  let next = Math.max(watermark, base);
  for (const id of ids) next = Math.max(next, id + 1);
  return next;
}

/**
 * `entries` with every name `names` holds that they lack appended, each
 * taking the next free id of a space at `watermark` whose base is `base`.
 */
function appendEntries(
  entries: readonly MakeCodeIdEntry[],
  names: readonly string[],
  watermark: number,
  base: number
): { entries: MakeCodeIdEntry[]; next: number } {
  const appended = [...entries];
  const held = new Set(entries.map((entry) => entry.name));
  let id = nextFree(
    watermark,
    base,
    entries.map((entry) => entry.id)
  );
  for (const name of names) {
    if (held.has(name)) continue;
    held.add(name);
    appended.push({ name, id });
    id++;
  }
  return { entries: appended, next: id };
}

/**
 * The manifest allocating every name `catalog` declares: `manifest` itself
 * when it already allocates every one, and otherwise `manifest` with each new
 * name appended, in catalog order, taking the next free id of its space --
 * each struct type its type atom, each tile its host-action id, each
 * operator its host-function id, and each overload a pack adds to a core
 * operator its host-function id under the overload's name, after its pack's
 * operators -- and each field a type declares that its
 * entry lacks appended to the type's field list, its position there being
 * its id. Nothing allocated is ever renumbered or dropped, so a name the
 * catalog no longer declares keeps its id, and no id is handed out twice:
 * every allocation lands above the space's watermark and every id the space
 * holds. A tile is allocated whether or not the editor can make a tile of it.
 *
 * @param manifest - The allocation so far.
 * @param catalog - The session catalog, read.
 */
export function allocateIds(manifest: MakeCodeIdManifest, catalog: ParsedCatalog): MakeCodeIdManifest {
  const tiles = catalog.packs.flatMap((pack) => pack.tiles.map((tile) => tile.name));
  const operators = catalog.packs.flatMap((pack) => [
    ...pack.operators.map((operator) => operator.name),
    ...pack.overloads.map((overload) => overload.name),
  ]);
  const declaredTypes = catalog.packs.flatMap((pack) => pack.types);

  const actions = appendEntries(manifest.actions, tiles, manifest.next.action, ID_SPACE_BASES.action);
  const operatorIds = appendEntries(manifest.operators, operators, manifest.next.operator, ID_SPACE_BASES.operator);

  const types: MakeCodeTypeIdEntry[] = manifest.types.map((type) => ({ ...type, fields: [...type.fields] }));
  let atom = nextFree(
    manifest.next.atom,
    ID_SPACE_BASES.atom,
    types.map((type) => type.atom)
  );
  let changed = false;
  for (const declared of declaredTypes) {
    let entry = types.find((type) => type.name === declared.name);
    if (entry === undefined) {
      entry = { name: declared.name, atom, fields: [] };
      types.push(entry);
      atom++;
      changed = true;
    }
    for (const field of declared.fields) {
      if (entry.fields.includes(field.name)) continue;
      entry.fields.push(field.name);
      changed = true;
    }
  }

  const next = { action: actions.next, operator: operatorIds.next, atom };
  changed ||=
    actions.entries.length !== manifest.actions.length ||
    operatorIds.entries.length !== manifest.operators.length ||
    next.action !== manifest.next.action ||
    next.operator !== manifest.next.operator ||
    next.atom !== manifest.next.atom;
  return changed ? { actions: actions.entries, operators: operatorIds.entries, types, next } : manifest;
}

/** Whether `a` and `b` allocate the same ids, entry for entry and watermark for watermark. */
export function sameIdManifest(a: MakeCodeIdManifest, b: MakeCodeIdManifest): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The id allocation a manifest reading holds, and whether it differs from the allocation held before it. */
export interface AdoptedIds {
  /**
   * The allocation to bind packs under: the reading's manifest, an empty
   * allocation when it holds none, and `undefined` when the reading is of a
   * newer format.
   */
  readonly ids: MakeCodeIdManifest | undefined;
  /** Whether {@link ids} differs from the allocation held before: one present and one not, or two unequal allocations. */
  readonly changed: boolean;
}

/**
 * The allocation `reading` holds, compared with `held`: under
 * `FORMAT_NEWER` no allocation, otherwise the reading's manifest or an
 * empty one.
 *
 * @param reading - A manifest reading, as the simulator extension publishes it.
 * @param held - The allocation held before it, or `undefined` for none.
 */
export function adoptIds(reading: MakeCodeManifestReading, held: MakeCodeIdManifest | undefined): AdoptedIds {
  const ids =
    reading.problem === MakeCodeManifestProblemCode.FORMAT_NEWER ? undefined : (reading.manifest ?? emptyIdManifest());
  const same = held === undefined || ids === undefined ? held === ids : sameIdManifest(held, ids);
  return { ids, changed: !same };
}
