import type { PeerSessionErrorCode } from "@wendoo/bridge-app";
import type { MakeCodeAsset } from "./makecode-assets.js";
import type { MakeCodeProjectInfo } from "./makecode-project-info.js";
import type { MakeCodeSession } from "./makecode-session.js";

/**
 * Status of a {@link MakeCodeEditorSession}.
 *
 * - `connected` -- the latest makecode handshake with the counterpart has
 *   completed and has not ended.
 * - `disconnected` -- no completed handshake is current: none has completed
 *   yet, the latest was rejected, or it ended.
 */
export type MakeCodeEditorSessionStatus = "connected" | "disconnected";

/**
 * Stable code of a failure that ends a {@link MakeCodeEditorSession}'s
 * handshake: `PeerSessionErrorCode.PROTOCOL_VERSION_NEWER` when the
 * counterpart's hello declares a newer makecode protocol.
 */
export type MakeCodeEditorSessionErrorCode = PeerSessionErrorCode;

/** One reading of a {@link MakeCodeEditorSession}'s state. */
export interface MakeCodeEditorSessionState {
  /** Whether the session is connected. */
  readonly status: MakeCodeEditorSessionStatus;
  /**
   * Stable code of the failure that ended this side's latest handshake, or
   * `undefined` when none did. `PeerSessionErrorCode.PROTOCOL_VERSION_NEWER`
   * means this side and its counterpart speak no common version; the remedy
   * is updating the outdated side, which for the evergreen editor means
   * reloading it.
   */
  readonly errorCode: MakeCodeEditorSessionErrorCode | undefined;
  /**
   * Id of the MakeCode target the counterpart declared, for example
   * `microbit` or `arcade`, or `undefined` when it is unknown: before the
   * first makecode handshake completes, and when the latest one declared no
   * target. Set by each completed handshake and kept while the session is
   * disconnected. Informational, for display and theming: the counterpart's
   * own claim, never an identity or a basis for trust.
   */
  readonly target: string | undefined;
}

/**
 * The brains and manifest requests of one makecode handshake with the
 * counterpart: each travels on that handshake and rejects with its family's
 * `CLOSED` code once the handshake ends.
 */
export type MakeCodeBrainsChannel = Pick<
  MakeCodeSession,
  "listBrains" | "pullBrains" | "pushBrain" | "readManifest" | "writeManifest"
>;

/**
 * The editor's makecode session with the MakeCode project: one object for
 * the whole life of the editor's page, whatever happens to the transports
 * carrying it. Every handshake with the counterpart delivers its own brains
 * channel and publications.
 */
export interface MakeCodeEditorSession {
  /** The current state. A new object each time the state changes. */
  readonly state: MakeCodeEditorSessionState;
  /**
   * Subscribe to state changes. `listener` receives the new state each time
   * any of its fields changes, at once. Returns an unsubscribe function.
   */
  onStateChange(listener: (state: MakeCodeEditorSessionState) => void): () => void;
  /**
   * Subscribe to the tile catalogs the counterpart publishes, each delivered
   * as the verbatim serialized text. Returns an unsubscribe function.
   */
  onCatalog(listener: (content: string) => void): () => void;
  /**
   * Subscribe to the asset snapshots the counterpart publishes, each
   * delivered whole. Returns an unsubscribe function.
   */
  onAssets(listener: (assets: MakeCodeAsset[]) => void): () => void;
  /**
   * Subscribe to the project facts the counterpart publishes, each reading
   * delivered whole. Returns an unsubscribe function.
   */
  onProjectInfo(listener: (info: MakeCodeProjectInfo) => void): () => void;
  /**
   * Subscribe to the brains channel of each makecode handshake with the
   * counterpart, delivered once the handshake completes. A channel is good
   * only while its handshake lasts; every later handshake delivers a new
   * one. Returns an unsubscribe function.
   */
  onBrainsChannel(listener: (channel: MakeCodeBrainsChannel) => void): () => void;
  /** Start handshaking with the counterpart, clearing the error code. Does nothing while started. */
  start(): void;
  /** Stop: end the current handshake, if any, and open none until started again. */
  stop(): void;
}
