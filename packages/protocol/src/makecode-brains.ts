/**
 * Numeric device-profile id written into the envelope of every brain
 * compiled for the MakeCode Wendoo VM. The value is interim: it stands until
 * the platform's device-profile map assigns the MakeCode Wendoo VM its
 * identity, and it changes then.
 */
export const MAKECODE_VM_PROFILE_ID = 1001;

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
   * The makecode handshake carrying the request ended -- the counterpart
   * left, the connection closed, or a new welcome replaced the handshake --
   * before the reply arrived. Raised by the requesting side; never on the
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
