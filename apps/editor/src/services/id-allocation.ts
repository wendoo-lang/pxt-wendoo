import { TARGET_ACTION_ID_BASE, TARGET_FUNC_ID_BASE, TARGET_TYPE_ATOM_BASE } from "@wendoo/core/runtime";
import type { MakeCodeIdEntry, MakeCodeIdManifest, MakeCodeTypeIdEntry } from "@wendoo/makecode-session";
import type { ParsedCatalog } from "./catalog";

/**
 * The first id of each id space the editor allocates pack vocabulary from:
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

/** `project`'s entries, then each of `held`'s whose name `project` does not hold and whose id it leaves free. */
function adoptEntries(project: readonly MakeCodeIdEntry[], held: readonly MakeCodeIdEntry[]): MakeCodeIdEntry[] {
  const adopted = [...project];
  const names = new Set(project.map((entry) => entry.name));
  const ids = new Set(project.map((entry) => entry.id));
  for (const entry of held) {
    if (names.has(entry.name) || ids.has(entry.id)) continue;
    adopted.push(entry);
    names.add(entry.name);
    ids.add(entry.id);
  }
  return adopted;
}

/**
 * The allocation the editor adopts when it reads the project's manifest
 * while holding an allocation of its own: the project's entries win, and the
 * editor keeps each of its other entries whose name the project does not
 * hold and whose id the project leaves free, so no two names share an id.
 * A type both hold keeps the project's atom and field list, with each field
 * the editor's entry adds appended. Each watermark is the higher of the two,
 * and above every id adopted.
 *
 * @param project - The project's manifest as read, or `null` when the project holds none.
 * @param held - The editor's allocation, or `undefined` when it holds none.
 */
export function mergeIdManifests(
  project: MakeCodeIdManifest | null,
  held: MakeCodeIdManifest | undefined
): MakeCodeIdManifest {
  const base = project ?? emptyIdManifest();
  if (held === undefined) return base;
  const actions = adoptEntries(base.actions, held.actions);
  const operators = adoptEntries(base.operators, held.operators);
  const types: MakeCodeTypeIdEntry[] = base.types.map((type) => ({ ...type, fields: [...type.fields] }));
  const atoms = new Set(types.map((type) => type.atom));
  for (const heldType of held.types) {
    const entry = types.find((type) => type.name === heldType.name);
    if (entry !== undefined) {
      for (const field of heldType.fields) {
        if (!entry.fields.includes(field)) entry.fields.push(field);
      }
      continue;
    }
    if (atoms.has(heldType.atom)) continue;
    types.push({ ...heldType, fields: [...heldType.fields] });
    atoms.add(heldType.atom);
  }
  return {
    actions,
    operators,
    types,
    next: {
      action: nextFree(
        Math.max(base.next.action, held.next.action),
        ID_SPACE_BASES.action,
        actions.map((entry) => entry.id)
      ),
      operator: nextFree(
        Math.max(base.next.operator, held.next.operator),
        ID_SPACE_BASES.operator,
        operators.map((entry) => entry.id)
      ),
      atom: nextFree(
        Math.max(base.next.atom, held.next.atom),
        ID_SPACE_BASES.atom,
        types.map((type) => type.atom)
      ),
    },
  };
}

/** Whether `a` and `b` allocate the same ids, entry for entry and watermark for watermark. */
export function sameIdManifest(a: MakeCodeIdManifest, b: MakeCodeIdManifest): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
