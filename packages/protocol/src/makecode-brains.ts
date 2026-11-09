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
   * The party serving the project could not apply a push or a create to the
   * project. Carried by a {@link MakeCodeBrainsErrorMessage}.
   */
  WRITE_FAILED: "MAKECODE_BRAINS_WRITE_FAILED",
  /**
   * The requesting tab is not the brain's origin, so the party serving the
   * project refused its push: a write, a rename or a removal of a brain
   * another tab created. Carried by a {@link MakeCodeBrainsErrorMessage}.
   */
  NOT_ORIGIN: "MAKECODE_BRAINS_NOT_ORIGIN",
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

/**
 * One brain the project holds, as the party serving the project lists and
 * publishes it.
 */
export interface MakeCodeBrainSummary {
  /** The brain's document id: the id its source file is addressed by in the project. */
  id: string;
  /** The brain's display name, as the serving party reads it; any text, including empty. */
  name: string;
  /** {@link brainSourceHash} of the brain's source text as the project holds it now. */
  sourceHash: string;
  /**
   * The {@link brainSourceHash} of the source the brain's current
   * registration of its compiled form was compiled from -- equal to
   * {@link sourceHash} exactly when that compiled form was compiled from the
   * source the project holds now -- or `null` when the project holds no
   * registration of the brain the serving party can read.
   */
  compiledSourceHash: string | null;
  /**
   * The brain's origin: the registration key of the front door whose tab
   * created it, or `null` when none is recorded.
   */
  origin: string | null;
  /**
   * The name of the {@link origin} tab as MakeCode lists it, or `null` when
   * no such tab talks to the serving party.
   */
  originLabel: string | null;
}

/** A brain's source as the editor pushes it: its id, its name and its source text. */
export interface MakeCodeWireBrainSource {
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
}

/** One brain as a pull returns it: its source, what the project registers of its compiled form, and its origin. */
export interface MakeCodeWireBrain extends MakeCodeWireBrainSource {
  /** As {@link MakeCodeBrainSummary.compiledSourceHash}: the source hash of the brain's registration, or `null` for none. */
  compiledSourceHash: string | null;
  /** As {@link MakeCodeBrainSummary.origin}: the registration key of the tab that created the brain, or `null` for none recorded. */
  origin: string | null;
  /** As {@link MakeCodeBrainSummary.originLabel}: the origin tab's name, or `null` when no such tab talks to the serving party. */
  originLabel: string | null;
}

/**
 * One diagnostic of compiling a brain source, as carried on the wire: the
 * compiler's or linker's report, its code stable across releases.
 */
export interface MakeCodeWireDiagnostic {
  /** The upstream compiler's stable numeric code of the diagnostic. */
  code: number;
  /** `error` stops the build from producing a program; `warning` and `info` do not. */
  severity: "error" | "warning" | "info";
  /** Human-readable description of the diagnostic. */
  message: string;
  /**
   * Machine-readable values {@link message} interpolates, by name: each a
   * text, a number, or a list of texts. Absent when it interpolates none.
   */
  params?: Record<string, string | number | string[]>;
}

/**
 * What the party serving the project made of a pushed source: its compile,
 * and the registration of the brain's compiled form it holds after it.
 */
export interface MakeCodeWireCompileOutcome {
  /** {@link brainSourceHash} of the source compiled: the pushed source. */
  sourceHash: string;
  /**
   * The registration of the brain's compiled form the project holds once
   * the push is applied: `{ sourceHash }` naming the source it was compiled
   * from -- {@link sourceHash} when this compile produced a program with
   * every tile resolved, an earlier source's hash when it did not and an
   * earlier compile did -- or `null` when no compile of the brain has.
   */
  compiled: { sourceHash: string } | null;
  /** The compile's diagnostics, in the order they were reported. */
  diagnostics: MakeCodeWireDiagnostic[];
  /**
   * Ids of the tiles the source places that the serving party's environment
   * holds no tile for, each once, in the order first placed; empty when
   * every tile resolved.
   */
  unresolvedTiles: string[];
}

/**
 * One change to the project's brains, as carried on the wire: `write`
 * stores `brain`'s source under its id, replacing the source held under it,
 * and the serving party compiles it; `remove` removes the brain `brainId`,
 * its source and its compiled form, and is applied whether or not the
 * project holds it.
 */
export type MakeCodeWireBrainPush = { op: "write"; brain: MakeCodeWireBrainSource } | { op: "remove"; brainId: string };

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
 * {@link MakeCodeBrainsPushReplyMessage} once the change is applied, or a
 * {@link MakeCodeBrainsErrorMessage} carrying
 * `MakeCodeBrainsErrorCode.WRITE_FAILED`, or `NOT_ORIGIN` when the
 * requesting tab is not the brain's origin.
 */
export interface MakeCodeBrainsPushMessage {
  type: "makecode:brainsPush";
  /** Correlates the request with its reply; unique among the sender's requests on its connection. */
  id: string;
  payload: MakeCodeWireBrainPush;
}

/**
 * Answers the {@link MakeCodeBrainsPushMessage} carrying the same `id` once
 * its change is applied: a write's {@link MakeCodeWireCompileOutcome}, or
 * `null` for a removal.
 */
export interface MakeCodeBrainsPushReplyMessage {
  type: "makecode:brainsPushReply";
  id: string;
  payload: MakeCodeWireCompileOutcome | null;
}

/** Payload of a {@link MakeCodeBrainsCreateMessage}. */
export interface MakeCodeBrainsCreatePayload {
  /** Display name of the brain to create; any text, including empty or one another brain carries. */
  name: string;
}

/**
 * Asks the party serving the project to create an empty brain named
 * `name` under a document id it mints. The reply, carrying the same `id`, is
 * a {@link MakeCodeBrainsCreateReplyMessage} once the brain's source is in
 * the project, or a {@link MakeCodeBrainsErrorMessage} carrying
 * `MakeCodeBrainsErrorCode.WRITE_FAILED`. The created brain's origin is the
 * requesting tab's key, or none when the serving party knows no key for it.
 */
export interface MakeCodeBrainsCreateMessage {
  type: "makecode:brainsCreate";
  /** Correlates the request with its reply; unique among the sender's requests on its connection. */
  id: string;
  payload: MakeCodeBrainsCreatePayload;
}

/** Payload of a {@link MakeCodeBrainsCreateReplyMessage}. */
export interface MakeCodeBrainsCreateReplyPayload {
  /** The brain created, as the project holds it now. */
  brain: MakeCodeBrainSummary;
}

/** Answers a {@link MakeCodeBrainsCreateMessage}, carrying its `id`. */
export interface MakeCodeBrainsCreateReplyMessage {
  type: "makecode:brainsCreateReply";
  id: string;
  payload: MakeCodeBrainsCreateReplyPayload;
}

/** Payload of a {@link MakeCodeBrainsErrorMessage}. */
export interface MakeCodeBrainsErrorPayload {
  /**
   * Stable code of the failure: `READ_FAILED` for a list or a pull,
   * `WRITE_FAILED` for a push or a create, `NOT_ORIGIN` for a push from a
   * tab that is not the brain's origin.
   */
  code:
    | typeof MakeCodeBrainsErrorCode.READ_FAILED
    | typeof MakeCodeBrainsErrorCode.WRITE_FAILED
    | typeof MakeCodeBrainsErrorCode.NOT_ORIGIN;
  /** Human-readable description of the failure. */
  message: string;
}

/** Reports that the brains request carrying the same `id` failed. */
export interface MakeCodeBrainsErrorMessage {
  type: "makecode:brainsError";
  id: string;
  payload: MakeCodeBrainsErrorPayload;
}

/** Payload of a {@link MakeCodeBrainsMessage}. */
export interface MakeCodeBrainsPayload {
  /** Every brain the project holds, one entry per id, in no particular order. */
  brains: MakeCodeBrainSummary[];
}

/**
 * The project's brains, published whole by the party serving the project.
 * A later publication replaces an earlier one.
 */
export interface MakeCodeBrainsMessage {
  type: "makecode:brains";
  payload: MakeCodeBrainsPayload;
}

/** The brains requests: sent by the editor to the party serving the project. */
export type MakeCodeBrainsRequestMessage =
  | MakeCodeBrainsListMessage
  | MakeCodeBrainsPullMessage
  | MakeCodeBrainsPushMessage
  | MakeCodeBrainsCreateMessage;

/** The brains replies: sent by the party serving the project, each carrying its request's `id`. */
export type MakeCodeBrainsReplyMessage =
  | MakeCodeBrainsListReplyMessage
  | MakeCodeBrainsPullReplyMessage
  | MakeCodeBrainsPushReplyMessage
  | MakeCodeBrainsCreateReplyMessage
  | MakeCodeBrainsErrorMessage;

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
   * @param brains - The brains.
   */
  reply(brains: readonly MakeCodeWireBrain[]): void;
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
 * Answer it once, with {@link reply}, {@link fail} or {@link refuse}; later
 * answers are not sent.
 */
export interface MakeCodeBrainsPushRequest {
  readonly kind: "push";
  /** The change to apply. */
  readonly push: MakeCodeWireBrainPush;
  /**
   * Answer that the change is applied to the project.
   *
   * @param outcome - A write's compile outcome; `null` for a removal.
   */
  reply(outcome: MakeCodeWireCompileOutcome | null): void;
  /**
   * Answer that the change could not be applied, with
   * `MakeCodeBrainsErrorCode.WRITE_FAILED`.
   *
   * @param message - Human-readable description of the failure.
   */
  fail(message: string): void;
  /**
   * Answer that the requesting tab is not the brain's origin, with
   * `MakeCodeBrainsErrorCode.NOT_ORIGIN`.
   *
   * @param message - Human-readable description of the refusal.
   */
  refuse(message: string): void;
}

/**
 * A create request from the peer, delivered to the party serving the
 * project. Answer it once, with {@link reply} or {@link fail}; later answers
 * are not sent.
 */
export interface MakeCodeBrainsCreateRequest {
  readonly kind: "create";
  /** Display name of the brain to create; any text, including empty. */
  readonly name: string;
  /**
   * Answer that the brain is created, its source in the project.
   *
   * @param brain - The brain created, as the project holds it now.
   */
  reply(brain: MakeCodeBrainSummary): void;
  /**
   * Answer that the brain could not be created, with
   * `MakeCodeBrainsErrorCode.WRITE_FAILED`.
   *
   * @param message - Human-readable description of the failure.
   */
  fail(message: string): void;
}

/** A brains request from the peer, as the party serving the project receives it. */
export type MakeCodeBrainsRequest =
  | MakeCodeBrainsListRequest
  | MakeCodeBrainsPullRequest
  | MakeCodeBrainsPushRequest
  | MakeCodeBrainsCreateRequest;
