/**
 * The MakeCode Wendoo VM's device profiles: each key names a world brains
 * are compiled for -- the computational semantics a compiled brain assumes
 * -- and maps it to the numeric device-profile id written into the envelope
 * of every brain compiled for that world. `sts-f64` is the static TypeScript
 * VM computing in 64-bit floating point, on every MakeCode target.
 *
 * Append-only: never renumber an entry, and never reuse the id of a removed
 * one.
 */
export const MakeCodeDeviceProfileNumericId = Object.freeze({
  "sts-f64": 2001,
} as const);

/**
 * Numeric device-profile id written into the envelope of every brain
 * compiled for the MakeCode Wendoo VM: the id of its `sts-f64` world in
 * {@link MakeCodeDeviceProfileNumericId}.
 */
export const MAKECODE_VM_PROFILE_ID = MakeCodeDeviceProfileNumericId["sts-f64"];

/**
 * Hash of a brain source text: 32-bit FNV-1a over its UTF-16 code units, as
 * eight lowercase hex digits. Equal texts hash equal in every runtime, so
 * both parties of a makecode session compute the same hash for the same
 * source.
 *
 * @param source - Source text to hash.
 */
export function brainSourceHash(source: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Stable codes of a failed brains request. */
export const MakeCodeBrainsErrorCode = {
  /**
   * The party serving the project could not read the project's brains to
   * answer a list or a pull. Carried by a {@link MakeCodeBrainsErrorMessage}.
   */
  READ_FAILED: "MAKECODE_BRAINS_READ_FAILED",
  /**
   * The party serving the project could not apply a push to the project.
   * Carried by a {@link MakeCodeBrainsErrorMessage}.
   */
  WRITE_FAILED: "MAKECODE_BRAINS_WRITE_FAILED",
  /**
   * The makecode handshake carrying the request ended -- the transport
   * closed, or a new port replaced the handshake -- before the reply
   * arrived. Raised by the requesting side; never on the
   * wire.
   */
  CLOSED: "MAKECODE_BRAINS_CLOSED",
} as const;

/** Union of all {@link MakeCodeBrainsErrorCode} values. */
export type MakeCodeBrainsErrorCode = (typeof MakeCodeBrainsErrorCode)[keyof typeof MakeCodeBrainsErrorCode];

/** The error a brains request rejects with. */
export class MakeCodeBrainsError extends Error {
  /** Stable machine-readable error code. */
  readonly code: MakeCodeBrainsErrorCode;

  constructor(code: MakeCodeBrainsErrorCode, message: string) {
    super(message);
    this.name = "MakeCodeBrainsError";
    this.code = code;
  }
}

/** One brain the project holds, as a {@link MakeCodeBrainsListReplyMessage} lists it. */
export interface MakeCodeBrainSummary {
  /** The brain's document id: the id its source file is addressed by in the project. */
  id: string;
  /** The brain's display name, as the serving party reads it; any text, including empty. */
  name: string;
  /** {@link brainSourceHash} of the brain's source text as the project holds it now. */
  sourceHash: string;
  /**
   * What the project's compiled form of the brain says about its source:
   *
   * - a string: the {@link brainSourceHash} carried by the brain's current
   *   registration of its compiled form -- equal to {@link sourceHash}
   *   exactly when that compiled form was compiled from the source the
   *   project holds now;
   * - `null`: the serving party read the project and found no current
   *   registration of the brain (no entry for it, an entry it cannot read,
   *   or no readable compiled-form file at all); pushing the brain with a
   *   compiled form restores one;
   * - absent: the serving party does not report the registration -- it
   *   predates this field, or holds compiled forms in a format it cannot
   *   read or rewrite. The requester draws no conclusion from its absence.
   */
  compiledSourceHash?: string | null;
}

/** A brain's compiled form as carried on the wire. */
export interface MakeCodeWireCompiledBrain {
  /** The compiled program in the binary form the MakeCode Wendoo VM loads, encoded as base64. */
  bytecode: string;
  /** {@link brainSourceHash} of the source text the program was compiled from. */
  sourceHash: string;
}

/** One brain as carried on the wire: its source and, when it has one, its compiled form. */
export interface MakeCodeWireBrain {
  /**
   * The brain's document id: the id its source file is addressed by in the
   * project. The serving party takes it from the file's address, never from
   * the source, so a source whose embedded id differs from it is carried as
   * it is.
   */
  id: string;
  /** The brain's display name; any text, including empty. */
  name: string;
  /**
   * The brain's source text: the upstream persisted brain JSON. Carried
   * verbatim, whether or not it is a valid brain document.
   */
  source: string;
  /** The brain's compiled form, absent when the brain has none. */
  compiled?: MakeCodeWireCompiledBrain;
}

/**
 * One change to the project's brains, as carried on the wire: `write`
 * stores `brain` under its id, replacing both forms of any brain held under
 * it, and removing a compiled form `brain` does not carry; `remove` removes
 * the brain `brainId` in both forms, and is applied whether or not the
 * project holds it.
 */
export type MakeCodeWireBrainPush = { op: "write"; brain: MakeCodeWireBrain } | { op: "remove"; brainId: string };

/**
 * Asks the party serving the project for the brains the project holds. The
 * reply, carrying the same `id`, is a {@link MakeCodeBrainsListReplyMessage}
 * or a {@link MakeCodeBrainsErrorMessage} carrying
 * `MakeCodeBrainsErrorCode.READ_FAILED`.
 */
export interface MakeCodeBrainsListMessage {
  type: "makecode:brainsList";
  /** Correlates the request with its reply; unique among the sender's requests on its connection. */
  id: string;
}

/** Payload of a {@link MakeCodeBrainsListReplyMessage}. */
export interface MakeCodeBrainsListReplyPayload {
  /** Every brain the project holds, one entry per id, in no particular order. */
  brains: MakeCodeBrainSummary[];
}

/** Answers a {@link MakeCodeBrainsListMessage}, carrying its `id`. */
export interface MakeCodeBrainsListReplyMessage {
  type: "makecode:brainsListReply";
  id: string;
  payload: MakeCodeBrainsListReplyPayload;
}

/** Payload of a {@link MakeCodeBrainsPullMessage}. */
export interface MakeCodeBrainsPullPayload {
  /** Document ids of the brains to return. */
  ids: string[];
}

/**
 * Asks the party serving the project for the full brains `ids` names. The
 * reply, carrying the same `id`, is a {@link MakeCodeBrainsPullReplyMessage}
 * or a {@link MakeCodeBrainsErrorMessage} carrying
 * `MakeCodeBrainsErrorCode.READ_FAILED`.
 */
export interface MakeCodeBrainsPullMessage {
  type: "makecode:brainsPull";
  /** Correlates the request with its reply; unique among the sender's requests on its connection. */
  id: string;
  payload: MakeCodeBrainsPullPayload;
}

/** Payload of a {@link MakeCodeBrainsPullReplyMessage}. */
export interface MakeCodeBrainsPullReplyPayload {
  /**
   * The requested brains the project holds, in request order. A requested
   * id the project does not hold has no entry.
   */
  brains: MakeCodeWireBrain[];
}

/** Answers a {@link MakeCodeBrainsPullMessage}, carrying its `id`. */
export interface MakeCodeBrainsPullReplyMessage {
  type: "makecode:brainsPullReply";
  id: string;
  payload: MakeCodeBrainsPullReplyPayload;
}

/**
 * Asks the party serving the project to apply one change to the project's
 * brains. The reply, carrying the same `id`, is a
 * {@link MakeCodeBrainsAckMessage} once the change is applied, or a
 * {@link MakeCodeBrainsErrorMessage} carrying
 * `MakeCodeBrainsErrorCode.WRITE_FAILED`.
 */
export interface MakeCodeBrainsPushMessage {
  type: "makecode:brainsPush";
  /** Correlates the request with its reply; unique among the sender's requests on its connection. */
  id: string;
  payload: MakeCodeWireBrainPush;
}

/** Confirms that the {@link MakeCodeBrainsPushMessage} carrying the same `id` was applied. */
export interface MakeCodeBrainsAckMessage {
  type: "makecode:brainsAck";
  id: string;
}

/** Payload of a {@link MakeCodeBrainsErrorMessage}. */
export interface MakeCodeBrainsErrorPayload {
  /** Stable code of the failure: `READ_FAILED` for a list or a pull, `WRITE_FAILED` for a push. */
  code: typeof MakeCodeBrainsErrorCode.READ_FAILED | typeof MakeCodeBrainsErrorCode.WRITE_FAILED;
  /** Human-readable description of the failure. */
  message: string;
}

/** Reports that the brains request carrying the same `id` failed. */
export interface MakeCodeBrainsErrorMessage {
  type: "makecode:brainsError";
  id: string;
  payload: MakeCodeBrainsErrorPayload;
}

/** The brains requests: sent by the editor to the party serving the project. */
export type MakeCodeBrainsRequestMessage =
  | MakeCodeBrainsListMessage
  | MakeCodeBrainsPullMessage
  | MakeCodeBrainsPushMessage;

/** The brains replies: sent by the party serving the project, each carrying its request's `id`. */
export type MakeCodeBrainsReplyMessage =
  | MakeCodeBrainsListReplyMessage
  | MakeCodeBrainsPullReplyMessage
  | MakeCodeBrainsAckMessage
  | MakeCodeBrainsErrorMessage;

/** A brain's compiled form, with its program as bytes. */
export interface MakeCodeCompiledBrain {
  /** The compiled program in the binary form the MakeCode Wendoo VM loads. */
  bytecode: Uint8Array;
  /** {@link brainSourceHash} of the source text the program was compiled from. */
  sourceHash: string;
}

/** One brain, as a brains request returns or pushes it: its source and, when it has one, its compiled form. */
export interface MakeCodeBrain {
  /** The brain's document id: the id its source file is addressed by in the project. */
  id: string;
  /** The brain's display name; any text, including empty. */
  name: string;
  /** The brain's source text, verbatim, whether or not it is a valid brain document. */
  source: string;
  /** The brain's compiled form, its program as bytes; absent when the brain has none. */
  compiled?: MakeCodeCompiledBrain;
}

/**
 * One change to the project's brains: `write` stores `brain` under its id,
 * replacing both forms of any brain held under it; `remove` removes the
 * brain `brainId` in both forms, whether or not the project holds it.
 */
export type MakeCodeBrainPush = { op: "write"; brain: MakeCodeBrain } | { op: "remove"; brainId: string };

/**
 * A list request from the peer, delivered to the party serving the project.
 * Answer it once, with {@link reply} or {@link fail}; later answers are not
 * sent.
 */
export interface MakeCodeBrainsListRequest {
  readonly kind: "list";
  /**
   * Answer with every brain the project holds, one entry per id.
   *
   * @param brains - The project's brains, in any order.
   */
  reply(brains: readonly MakeCodeBrainSummary[]): void;
  /**
   * Answer that the project's brains could not be read, with
   * `MakeCodeBrainsErrorCode.READ_FAILED`.
   *
   * @param message - Human-readable description of the failure.
   */
  fail(message: string): void;
}

/**
 * A pull request from the peer, delivered to the party serving the project.
 * Answer it once, with {@link reply} or {@link fail}; later answers are not
 * sent.
 */
export interface MakeCodeBrainsPullRequest {
  readonly kind: "pull";
  /** Document ids of the brains to return. */
  readonly ids: readonly string[];
  /**
   * Answer with the requested brains the project holds, in request order,
   * leaving out each id it does not hold.
   *
   * @param brains - The brains, each compiled program as bytes.
   */
  reply(brains: readonly MakeCodeBrain[]): void;
  /**
   * Answer that the project's brains could not be read, with
   * `MakeCodeBrainsErrorCode.READ_FAILED`.
   *
   * @param message - Human-readable description of the failure.
   */
  fail(message: string): void;
}

/**
 * A push request from the peer, delivered to the party serving the project.
 * Answer it once, with {@link ack} or {@link fail}; later answers are not
 * sent.
 */
export interface MakeCodeBrainsPushRequest {
  readonly kind: "push";
  /** The change to apply, each compiled program as bytes. */
  readonly push: MakeCodeBrainPush;
  /** Answer that the change is applied to the project. */
  ack(): void;
  /**
   * Answer that the change could not be applied, with
   * `MakeCodeBrainsErrorCode.WRITE_FAILED`.
   *
   * @param message - Human-readable description of the failure.
   */
  fail(message: string): void;
}

/** A brains request from the peer, as the party serving the project receives it. */
export type MakeCodeBrainsRequest = MakeCodeBrainsListRequest | MakeCodeBrainsPullRequest | MakeCodeBrainsPushRequest;
