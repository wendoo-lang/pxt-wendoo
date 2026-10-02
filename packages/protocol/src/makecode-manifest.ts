/**
 * The id manifest's wire contract: the editor's permanent id allocations for
 * the vocabulary the MakeCode project's packs register, and the request-reply
 * family that reads them from and writes them to the project.
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
 * Every id the editor has allocated for a MakeCode project's pack vocabulary,
 * in allocation order: host-action ids for tiles, host-function ids for
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
   * reads. No entry is read from it, and writes are refused while it stands.
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

/** What the party serving the project read of the project's manifest. */
export interface MakeCodeManifestReading {
  /**
   * The entries read: every entry when {@link problem} is absent, the
   * readable ones under `ENTRY_MALFORMED`; `null` when the project holds no
   * manifest, or under `UNREADABLE` or `FORMAT_NEWER`.
   */
  manifest: MakeCodeIdManifest | null;
  /** What was wrong with the manifest, absent when nothing was. */
  problem?: MakeCodeManifestProblemCode;
}

/** Stable codes of a failed manifest request. */
export const MakeCodeManifestErrorCode = {
  /**
   * The party serving the project could not read the project to answer a
   * read. Carried by a {@link MakeCodeManifestErrorMessage}.
   */
  READ_FAILED: "MAKECODE_MANIFEST_READ_FAILED",
  /**
   * The party serving the project could not write the manifest to the
   * project. Carried by a {@link MakeCodeManifestErrorMessage}.
   */
  WRITE_FAILED: "MAKECODE_MANIFEST_WRITE_FAILED",
  /**
   * The makecode handshake carrying the request ended before the reply
   * arrived. Raised by the requesting side; never on the wire.
   */
  CLOSED: "MAKECODE_MANIFEST_CLOSED",
} as const;

/** Union of all {@link MakeCodeManifestErrorCode} values. */
export type MakeCodeManifestErrorCode = (typeof MakeCodeManifestErrorCode)[keyof typeof MakeCodeManifestErrorCode];

/** The error a manifest request rejects with. */
export class MakeCodeManifestError extends Error {
  /** Stable machine-readable error code. */
  readonly code: MakeCodeManifestErrorCode;

  constructor(code: MakeCodeManifestErrorCode, message: string) {
    super(message);
    this.name = "MakeCodeManifestError";
    this.code = code;
  }
}

/**
 * Asks the party serving the project for the project's manifest. The reply,
 * carrying the same `id`, is a {@link MakeCodeManifestReadReplyMessage} or a
 * {@link MakeCodeManifestErrorMessage} carrying
 * `MakeCodeManifestErrorCode.READ_FAILED`.
 */
export interface MakeCodeManifestReadMessage {
  type: "makecode:manifestRead";
  /** Correlates the request with its reply; unique among the sender's requests on its connection. */
  id: string;
}

/** Answers a {@link MakeCodeManifestReadMessage}, carrying its `id`. */
export interface MakeCodeManifestReadReplyMessage {
  type: "makecode:manifestReadReply";
  id: string;
  payload: MakeCodeManifestReading;
}

/** Payload of a {@link MakeCodeManifestWriteMessage}. */
export interface MakeCodeManifestWritePayload {
  /** The editor's whole allocation, which replaces the project's manifest. */
  manifest: MakeCodeIdManifest;
}

/**
 * Asks the party serving the project to replace the project's manifest with
 * the editor's whole allocation. The reply, carrying the same `id`, is a
 * {@link MakeCodeManifestAckMessage} once the manifest is written, or a
 * {@link MakeCodeManifestErrorMessage} carrying
 * `MakeCodeManifestErrorCode.WRITE_FAILED`.
 */
export interface MakeCodeManifestWriteMessage {
  type: "makecode:manifestWrite";
  /** Correlates the request with its reply; unique among the sender's requests on its connection. */
  id: string;
  payload: MakeCodeManifestWritePayload;
}

/** Confirms that the {@link MakeCodeManifestWriteMessage} carrying the same `id` was written. */
export interface MakeCodeManifestAckMessage {
  type: "makecode:manifestAck";
  id: string;
}

/** Payload of a {@link MakeCodeManifestErrorMessage}. */
export interface MakeCodeManifestErrorPayload {
  /** Stable code of the failure: `READ_FAILED` for a read, `WRITE_FAILED` for a write. */
  code: typeof MakeCodeManifestErrorCode.READ_FAILED | typeof MakeCodeManifestErrorCode.WRITE_FAILED;
  /** Human-readable description of the failure. */
  message: string;
}

/** Reports that the manifest request carrying the same `id` failed. */
export interface MakeCodeManifestErrorMessage {
  type: "makecode:manifestError";
  id: string;
  payload: MakeCodeManifestErrorPayload;
}

/** The manifest requests: sent by the editor to the party serving the project. */
export type MakeCodeManifestRequestMessage = MakeCodeManifestReadMessage | MakeCodeManifestWriteMessage;

/** The manifest replies: sent by the party serving the project, each carrying its request's `id`. */
export type MakeCodeManifestReplyMessage =
  | MakeCodeManifestReadReplyMessage
  | MakeCodeManifestAckMessage
  | MakeCodeManifestErrorMessage;

/**
 * A manifest read request from the peer, delivered to the party serving the
 * project. Answer it once, with {@link reply} or {@link fail}; later answers
 * are not sent.
 */
export interface MakeCodeManifestReadRequest {
  readonly kind: "read";
  /**
   * Answer with what was read of the project's manifest.
   *
   * @param reading - The entries read, and what was wrong with the manifest.
   */
  reply(reading: MakeCodeManifestReading): void;
  /**
   * Answer that the project could not be read, with
   * `MakeCodeManifestErrorCode.READ_FAILED`.
   *
   * @param message - Human-readable description of the failure.
   */
  fail(message: string): void;
}

/**
 * A manifest write request from the peer, delivered to the party serving the
 * project. Answer it once, with {@link ack} or {@link fail}; later answers are
 * not sent.
 */
export interface MakeCodeManifestWriteRequest {
  readonly kind: "write";
  /** The editor's whole allocation, to replace the project's manifest. */
  readonly manifest: MakeCodeIdManifest;
  /** Answer that the manifest is written to the project. */
  ack(): void;
  /**
   * Answer that the manifest could not be written, with
   * `MakeCodeManifestErrorCode.WRITE_FAILED`.
   *
   * @param message - Human-readable description of the failure.
   */
  fail(message: string): void;
}

/** A manifest request from the peer, as the party serving the project receives it. */
export type MakeCodeManifestRequest = MakeCodeManifestReadRequest | MakeCodeManifestWriteRequest;
