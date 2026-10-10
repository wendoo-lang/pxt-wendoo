import type { MakeCodeAsset } from "./makecode-assets.js";
import { CounterpartSession } from "./makecode-counterpart.js";
import type {
  MakeCodeBrainsChannel,
  MakeCodeEditorSession,
  MakeCodeEditorSessionErrorCode,
  MakeCodeEditorSessionState,
} from "./makecode-editor-session.js";
import type { MakeCodeProjectInfo } from "./makecode-project-info.js";
import type { MakeCodeSessionMessage, MakeCodeSessionPort } from "./makecode-session.js";

/**
 * The editor's makecode session with the MakeCode project over ports the
 * page hosting the editor supplies: one session for the life of the editor's
 * frame. Its status is:
 *
 * - `connected` once the makecode handshake over the current port has
 *   completed;
 * - `disconnected` while no port is attached, while the current port's
 *   handshake is pending, after it was rejected, and after
 *   {@link MakeCodeEditorSession.stop}.
 *
 * Every port attached opens a fresh handshake, replacing the previous
 * port's: the catalogs, asset snapshots, project facts and brains channel
 * delivered come from the current handshake only.
 * The one error code is `PeerSessionErrorCode.PROTOCOL_VERSION_NEWER`, for a
 * counterpart hello declaring a newer version; it stays until a later
 * handshake completes, or until {@link MakeCodeEditorSession.start} starts
 * the session again after a stop. {@link MakeCodeEditorSession.stop} ends
 * the current port's handshake and lets the port go; a port carries one
 * handshake, and the next port attached carries the next.
 */
export interface MakeCodePortEditorSession extends MakeCodeEditorSession {
  /**
   * Make `port` the session's port, replacing the current one: the current
   * port's handshake ends and stops reading it, and while the session is
   * started a new handshake opens over `port` at once.
   */
  attachPort(port: MakeCodeSessionPort): void;
}

/**
 * Create a {@link MakeCodePortEditorSession}, with no port attached and not
 * started: it handshakes over the ports attached once
 * {@link MakeCodeEditorSession.start} is called.
 */
export function createMakeCodePortEditorSession(): MakeCodePortEditorSession {
  return new PortEditorSession();
}

/** The parts of a `MessagePort` {@link messagePortSessionPort} uses. */
export interface MakeCodeMessagePort {
  postMessage(message: unknown): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  removeEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  start(): void;
}

/**
 * `port` as a makecode-session port: each message is posted to `port` as it
 * is, and each message `port` receives is delivered as a makecode-session
 * message. Subscribing starts `port`'s message queue.
 */
export function messagePortSessionPort(port: MakeCodeMessagePort): MakeCodeSessionPort {
  return {
    postMessage(message) {
      port.postMessage(message);
    },
    onMessage(listener) {
      const receive = (event: { data: unknown }): void => {
        listener(event.data as MakeCodeSessionMessage);
      };
      port.addEventListener("message", receive);
      port.start();
      return () => {
        port.removeEventListener("message", receive);
      };
    },
  };
}

class PortEditorSession implements MakeCodePortEditorSession {
  private readonly _stateListeners = new Set<(state: MakeCodeEditorSessionState) => void>();
  private readonly _catalogListeners = new Set<(content: string) => void>();
  private readonly _assetsListeners = new Set<(assets: MakeCodeAsset[]) => void>();
  private readonly _projectInfoListeners = new Set<(info: MakeCodeProjectInfo) => void>();
  private readonly _brainsChannelListeners = new Set<(channel: MakeCodeBrainsChannel) => void>();
  /** The port attached while no handshake has opened over it yet. */
  private _port: MakeCodeSessionPort | undefined;
  /** The handshake over the current port, if one is open. */
  private _counterpart: CounterpartSession | undefined;
  /** Whether the current handshake has completed. */
  private _established = false;
  /** Whether the session handshakes over the ports attached: set by `start()`, cleared by `stop()`. */
  private _running = false;
  private _errorCode: MakeCodeEditorSessionErrorCode | undefined;
  /** The target the counterpart declared in the latest completed handshake. */
  private _target: string | undefined;
  private _state: MakeCodeEditorSessionState = this.readState();

  get state(): MakeCodeEditorSessionState {
    return this._state;
  }

  onStateChange(listener: (state: MakeCodeEditorSessionState) => void): () => void {
    this._stateListeners.add(listener);
    return () => {
      this._stateListeners.delete(listener);
    };
  }

  onCatalog(listener: (content: string) => void): () => void {
    this._catalogListeners.add(listener);
    return () => {
      this._catalogListeners.delete(listener);
    };
  }

  onAssets(listener: (assets: MakeCodeAsset[]) => void): () => void {
    this._assetsListeners.add(listener);
    return () => {
      this._assetsListeners.delete(listener);
    };
  }

  onProjectInfo(listener: (info: MakeCodeProjectInfo) => void): () => void {
    this._projectInfoListeners.add(listener);
    return () => {
      this._projectInfoListeners.delete(listener);
    };
  }

  onBrainsChannel(listener: (channel: MakeCodeBrainsChannel) => void): () => void {
    this._brainsChannelListeners.add(listener);
    return () => {
      this._brainsChannelListeners.delete(listener);
    };
  }

  attachPort(port: MakeCodeSessionPort): void {
    this.leave();
    this._port = port;
    if (this._running) this.open();
    this.update();
  }

  start(): void {
    if (this._running) return;
    this._running = true;
    this._errorCode = undefined;
    this.open();
    this.update();
  }

  stop(): void {
    this._running = false;
    this.leave();
    this.update();
  }

  /** Opens a handshake over the attached port, if one is attached, taking it so no later handshake reuses it. */
  private open(): void {
    const port = this._port;
    if (port === undefined) return;
    this._port = undefined;
    this._counterpart = new CounterpartSession(port, {
      established: (target, channel) => {
        this._established = true;
        this._errorCode = undefined;
        this._target = target;
        this.update();
        for (const listener of this._brainsChannelListeners) listener(channel);
      },
      catalog: (content) => {
        for (const listener of this._catalogListeners) listener(content);
      },
      assets: (assets) => {
        for (const listener of this._assetsListeners) listener(assets);
      },
      projectInfo: (info) => {
        for (const listener of this._projectInfoListeners) listener(info);
      },
      rejected: (code) => {
        this._errorCode = code;
        this.update();
      },
    });
  }

  /** Ends the current handshake, if any, and lets the attached port go. */
  private leave(): void {
    this._counterpart?.close();
    this._counterpart = undefined;
    this._established = false;
    this._port = undefined;
  }

  private readState(): MakeCodeEditorSessionState {
    return {
      status: this._established ? "connected" : "disconnected",
      errorCode: this._errorCode,
      target: this._target,
    };
  }

  /** Publishes the current state when any field differs from the last one published. */
  private update(): void {
    const next = this.readState();
    const last = this._state;
    if (next.status === last.status && next.errorCode === last.errorCode && next.target === last.target) {
      return;
    }
    this._state = next;
    for (const listener of this._stateListeners) listener(next);
  }
}
