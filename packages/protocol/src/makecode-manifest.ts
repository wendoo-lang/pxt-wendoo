/**
 * The id manifest's wire contract: the permanent id allocations for the
 * vocabulary the MakeCode project's packs register, published by the party
 * serving the project, which allocates them.
 */

/** One allocated id: a registration name and the id it holds forever. */
export interface MakeCodeIdEntry {
  /** The registration name, as the catalog carries it. */
  name: string;
  /** The id; never changed, and never given to another name. */
  id: number;
}

/**
 * One host-registered struct type's allocation: its type-atom id and its
 * fields' ids. A field's id is its position in {@link fields}, which only
 * ever grows: a field the type stops declaring keeps its position, so its id
 * is never given to another field.
 */
export interface MakeCodeTypeIdEntry {
  /** The type name, as the catalog carries it. */
  name: string;
  /** The type-atom id; never changed, and never given to another type. */
  atom: number;
  /** Every field name ever allocated for the type, each at the position that is its id. */
  fields: string[];
}

/**
 * The next id each id space hands out. Each is above every id the space has
 * ever handed out, including ids of entries since removed by hand, so an id
 * is never handed out twice.
 */
export interface MakeCodeIdWatermarks {
  /** Next host-action id. */
  action: number;
  /** Next operator host-function id. */
  operator: number;
  /** Next type-atom id. */
  atom: number;
}

/**
 * Every id allocated for a MakeCode project's pack vocabulary, in allocation
 * order: host-action ids for tiles, host-function ids for
 * operators, and type-atom and field ids for struct types. Entries are
 * append-only.
 */
export interface MakeCodeIdManifest {
  /** Host-action ids of the packs' tiles. */
  actions: MakeCodeIdEntry[];
  /** Host-function ids of the packs' operators. */
  operators: MakeCodeIdEntry[];
  /** Type-atom and field ids of the packs' struct types. */
  types: MakeCodeTypeIdEntry[];
  /** The next id of each space. */
  next: MakeCodeIdWatermarks;
}

/** Stable codes of a problem the party serving the project found reading the project's manifest. */
export const MakeCodeManifestProblemCode = {
  /**
   * The project's manifest declares no format the serving party reads: it
   * is not a manifest at all, or has been damaged. No entry is read from it,
   * and the next write replaces it.
   */
  UNREADABLE: "MAKECODE_MANIFEST_UNREADABLE",
  /**
   * The project's manifest declares a format newer than the serving party
   * reads. No entry is read from it, and it is never written while it stands.
   */
  FORMAT_NEWER: "MAKECODE_MANIFEST_FORMAT_NEWER",
  /**
   * Part of the project's manifest does not follow its format. The rest is
   * read, and the next write replaces it.
   */
  ENTRY_MALFORMED: "MAKECODE_MANIFEST_ENTRY_MALFORMED",
} as const;

/** Union of all {@link MakeCodeManifestProblemCode} values. */
export type MakeCodeManifestProblemCode =
  (typeof MakeCodeManifestProblemCode)[keyof typeof MakeCodeManifestProblemCode];

/**
 * The project's manifest as the party serving the project holds it: what it
 * read of the manifest, with every id it has allocated since.
 */
export interface MakeCodeManifestReading {
  /**
   * The entries held: every entry when {@link problem} is absent, the
   * readable ones under `ENTRY_MALFORMED`; `null` when none is held, or
   * under `UNREADABLE` or `FORMAT_NEWER`.
   */
  manifest: MakeCodeIdManifest | null;
  /** What was wrong with the manifest, absent when nothing was. */
  problem?: MakeCodeManifestProblemCode;
}

/**
 * The project's id manifest as the party serving the project holds it,
 * published by that party once the session is established and again after
 * every catalog it publishes, whether or not the allocation changed. Each
 * message is whole: a later one replaces an earlier one.
 */
export interface MakeCodeManifestMessage {
  type: "makecode:manifest";
  payload: MakeCodeManifestReading;
}
