import type { AppBridge, AppBridgeOptions, PeerSessionErrorCode } from "@wendoo/bridge-app";
import {
  BridgeSessionErrorCode,
  createAppBridge,
  createInMemoryProjectFileSystem,
  PeerSessionError,
} from "@wendoo/bridge-app";
import type { MakeCodeSession, MakeCodeSessionMessage, MakeCodeSessionPort } from "./makecode-session.js";
import { connectMakeCodeSession, MAKECODE_SESSION_ROLE_PATHS } from "./makecode-session.js";

/**
 * Address of the MakeCode bridge service a session connects to when none is
 * given: a bare host with an optional port, never a scheme. The bridge
 * client connects with `ws://` to a loopback host and `wss://` to any other.
 */
export const DEFAULT_MAKECODE_BRIDGE_URL = "makecode-bridge.playwendoo.com";

/**
 * Status of a {@link MakeCodeEditorSession}.
 *
 * - `none` -- there is no session: this side holds no binding token and the
 *   bridge service has not welcomed it into one.
 * - `connected` -- the bridge service has welcomed this side into the
 *   session and the counterpart is connected.
 * - `disconnected` -- the session exists (this side holds its binding
 *   token) but is not connected: this side's connection is down or stopped,
 *   or the counterpart is away.
 */
export type MakeCodeEditorSessionStatus = "none" | "connected" | "disconnected";

/**
 * Stable code of a failure that ends a {@link MakeCodeEditorSession}'s
 * connection: a `BridgeSessionErrorCode` from the bridge connection, or
 * `PeerSessionErrorCode.PROTOCOL_VERSION_NEWER` from the makecode handshake.
 */
export type MakeCodeEditorSessionErrorCode = BridgeSessionErrorCode | PeerSessionErrorCode;

/**
 * Progress of the join code a person entered, while it is presented and not
 * yet welcomed:
 *
 * - `submitted` -- presented to the bridge service, which has not answered;
 * - `accepted` -- the bridge service accepted it and joined this side to the
 *   session, whose counterpart is not connected yet.
 */
export type MakeCodeEditorSessionEntry = "submitted" | "accepted";

/** One reading of a {@link MakeCodeEditorSession}'s state. */
export interface MakeCodeEditorSessionState {
  /** Whether a session exists and whether it is connected. */
  readonly status: MakeCodeEditorSessionStatus;
  /**
   * Progress of the join code the session was created with, while a
   * connection presents it and no welcome has arrived; `undefined` otherwise
   * -- no code was entered, a welcome spent it, the bridge service refused
   * it (see {@link errorCode}), or no connection is open.
   */
  readonly entry: MakeCodeEditorSessionEntry | undefined;
  /**
   * The code a person enters on the MakeCode side to join the session: the
   * latest code the bridge service sent while one of the session's roles is
   * vacant. `undefined` before the first, from each welcome until the next
   * code arrives, and after the session is forgotten or ended.
   */
  readonly joinCode: string | undefined;
  /**
   * Stable code of the failure that ended this side's latest connection, or
   * `undefined` when none did. Cleared when the session is connected again
   * and when {@link MakeCodeEditorSession.start} is called.
   *
   * `BridgeSessionErrorCode.JOIN_CODE_UNKNOWN` means the entered code opened
   * no vacant role, and `BridgeSessionErrorCode.SESSION_ENDED` that the
   * session was ended on purpose; the session then holds no binding token,
   * so the status is `none`, and the way into a session is a person entering
   * a current code.
   *
   * The version codes -- `BridgeSessionErrorCode.PROTOCOL_VERSION_MISMATCH`
   * and `PeerSessionErrorCode.PROTOCOL_VERSION_NEWER` -- mean this side and
   * its counterpart speak no common version; the remedy is updating the
   * outdated side, which for the evergreen editor means reloading it.
   */
  readonly errorCode: MakeCodeEditorSessionErrorCode | undefined;
  /**
   * Id of the MakeCode target the counterpart declared, for example
   * `microbit` or `arcade`, or `undefined` when it is unknown: before the
   * first makecode handshake completes, when the latest one declared no
   * target, and after the session is forgotten or ended. Set by each
   * completed handshake and kept while the session is disconnected.
   * Informational, for display and theming: the counterpart's own claim,
   * never an identity or a basis for trust.
   */
  readonly target: string | undefined;
}

/**
 * The brains requests of one makecode handshake with the counterpart: each
 * travels on that handshake and rejects with `MakeCodeBrainsErrorCode.CLOSED`
 * once the handshake ends -- the counterpart leaves, the connection closes,
 * or a further welcome replaces the handshake.
 */
export type MakeCodeBrainsChannel = Pick<MakeCodeSession, "listBrains" | "pullBrains" | "pushBrain">;

/** Options for {@link createMakeCodeEditorSession}. */
export interface MakeCodeEditorSessionOptions {
  /**
   * Address of the MakeCode bridge service as a bare host with an optional
   * port, without a scheme. Defaults to {@link DEFAULT_MAKECODE_BRIDGE_URL}.
   */
  bridgeUrl?: string;
  /**
   * Join code of the session to join, as the MakeCode side shows it.
   * Presented on each connection until the bridge service first welcomes
   * this session.
   */
  joinCode?: string;
  /**
   * Returns the binding token saved by {@link saveBindingToken}, if any.
   * Called once, when the session is created.
   */
  loadBindingToken?: () => string | undefined;
  /** Stores `token`, the session's newest binding token, for {@link loadBindingToken} to return. */
  saveBindingToken?: (token: string) => void;
  /**
   * Removes the token {@link saveBindingToken} stored, so
   * {@link loadBindingToken} returns none. Called by
   * {@link MakeCodeEditorSession.forget}, and when the bridge service reports
   * the session ended.
   */
  clearBindingToken?: () => void;
}

/**
 * The editor's makecode session with the MakeCode project: one object for
 * the whole life of the binding, whatever happens to the connections
 * carrying it. Every welcome the bridge service sends opens a fresh makecode
 * handshake with the counterpart; a session is continued across drops by its
 * binding token and entered by its join code.
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
   * Subscribe to the brains channel of each makecode handshake with the
   * counterpart, delivered once the handshake completes. A channel is good
   * only while its handshake lasts; every later handshake delivers a new
   * one. Returns an unsubscribe function.
   */
  onBrainsChannel(listener: (channel: MakeCodeBrainsChannel) => void): () => void;
  /**
   * Connect, presenting the binding token the session holds, and the join
   * code it was created with until the bridge service first welcomes it.
   * Clears the error code. Does nothing while a connection is open or
   * opening.
   *
   * After a failure the session connects again by itself only for
   * `BridgeSessionErrorCode.OUTBOUND_QUEUE_OVERFLOW`, at once, keeping that
   * code until it is connected. After any other failure it stays
   * disconnected until this is called.
   */
  start(): void;
  /**
   * Close the connection. The session, its join code, and its binding token
   * are kept, and the session lives on at the bridge service.
   */
  stop(): void;
  /**
   * Forget the session: on an open connection, end the session on purpose,
   * which the counterpart is told as `BridgeSessionErrorCode.SESSION_ENDED`;
   * then close the connection, drop the binding token, the join code, and
   * the error code, clear the token persisted through the
   * `clearBindingToken` option, and return the state to `none`. With no open
   * connection nothing reaches the bridge service. The way into a session
   * afterwards is a person entering a join code.
   */
  forget(): void;
}

/**
 * Create a {@link MakeCodeEditorSession}. It connects at the makecode
 * session's editor role path once {@link MakeCodeEditorSession.start} is
 * called.
 */
export function createMakeCodeEditorSession(options: MakeCodeEditorSessionOptions = {}): MakeCodeEditorSession {
  return createEditorSessionOver(options, createAppBridge);
}

/**
 * Create a {@link MakeCodeEditorSession} whose connections are the app
 * bridges `createBridge` returns, one per connection the session opens.
 */
export function createEditorSessionOver(
  options: MakeCodeEditorSessionOptions,
  createBridge: (options: AppBridgeOptions) => AppBridge
): MakeCodeEditorSession {
  return new EditorSession(options, createBridge);
}

/**
 * The makecode handshake with the counterpart of one welcome, carried over
 * the bridge's payload messages. Reports the established session once the
 * handshake completes, then the catalogs the counterpart publishes.
 */
class CounterpartSession {
  private readonly _unsubscribes = new Set<() => void>();
  private _session: MakeCodeSession | undefined;
  private _closed = false;

  /**
   * @param bridge - The bridge connection, just welcomed.
   * @param onEstablished - Receives the established session once the handshake completes.
   * @param onCatalog - Receives each catalog the counterpart publishes.
   * @param onRejected - Receives the code of a failed handshake.
   */
  constructor(
    bridge: AppBridge,
    onEstablished: (session: MakeCodeSession) => void,
    onCatalog: (content: string) => void,
    onRejected: (code: PeerSessionErrorCode) => void
  ) {
    const port: MakeCodeSessionPort = {
      postMessage(message) {
        bridge.sendPayload(message);
      },
      onMessage: (listener) => {
        // The makecode kind is the only session kind on the editor role path, so
        // every payload message on this bridge is a makecode-session message.
        const unsubscribe = bridge.onPayload((message) => {
          listener(message as MakeCodeSessionMessage);
        });
        this._unsubscribes.add(unsubscribe);
        return () => {
          this._unsubscribes.delete(unsubscribe);
          unsubscribe();
        };
      },
    };
    connectMakeCodeSession({ port }).then(
      (session) => {
        if (this._closed) {
          session.dispose();
          return;
        }
        this._session = session;
        onEstablished(session);
        session.onCatalog(onCatalog);
      },
      (error: unknown) => {
        if (!this._closed && error instanceof PeerSessionError) {
          onRejected(error.code);
        }
      }
    );
  }

  /** Detach from the bridge, whether or not the handshake completed. */
  close(): void {
    this._closed = true;
    this._session?.dispose();
    for (const unsubscribe of this._unsubscribes) {
      unsubscribe();
    }
    this._unsubscribes.clear();
  }
}

class EditorSession implements MakeCodeEditorSession {
  private readonly _bridgeUrl: string;
  private readonly _createBridge: (options: AppBridgeOptions) => AppBridge;
  private readonly _saveBindingToken: ((token: string) => void) | undefined;
  private readonly _clearBindingToken: (() => void) | undefined;
  private readonly _stateListeners = new Set<(state: MakeCodeEditorSessionState) => void>();
  private readonly _catalogListeners = new Set<(content: string) => void>();
  private readonly _brainsChannelListeners = new Set<(channel: MakeCodeBrainsChannel) => void>();
  /** The join code the state shows. */
  private _joinCode: string | undefined;
  /** The join code connections present: the one created with, until the first welcome. */
  private _entryCode: string | undefined;
  private _bindingToken: string | undefined;
  private _errorCode: MakeCodeEditorSessionErrorCode | undefined;
  /** The target the counterpart declared in the latest completed handshake of this binding. */
  private _target: string | undefined;
  /** Whether the bridge service has welcomed the open connection and the counterpart has not left since. */
  private _welcomed = false;
  /** Whether the bridge service has answered the open connection's hello presenting the entry join code. */
  private _entryAccepted = false;
  /** Whether the session is to be connected: set by `start()`, cleared by `stop()` and by a failure it holds on. */
  private _running = false;
  /** The open connection, if any. */
  private _bridge: AppBridge | undefined;
  private _bridgeUnsubscribe: (() => void) | undefined;
  private _counterpart: CounterpartSession | undefined;
  private _state: MakeCodeEditorSessionState;

  constructor(options: MakeCodeEditorSessionOptions, createBridge: (options: AppBridgeOptions) => AppBridge) {
    this._bridgeUrl = options.bridgeUrl ?? DEFAULT_MAKECODE_BRIDGE_URL;
    this._createBridge = createBridge;
    this._saveBindingToken = options.saveBindingToken;
    this._clearBindingToken = options.clearBindingToken;
    this._entryCode = options.joinCode;
    this._bindingToken = options.loadBindingToken?.();
    this._state = this.readState();
  }

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

  onBrainsChannel(listener: (channel: MakeCodeBrainsChannel) => void): () => void {
    this._brainsChannelListeners.add(listener);
    return () => {
      this._brainsChannelListeners.delete(listener);
    };
  }

  start(): void {
    if (this._bridge) return;
    this._running = true;
    this._errorCode = undefined;
    this.open();
    this.update();
  }

  stop(): void {
    this._running = false;
    this.release();
    this.update();
  }

  forget(): void {
    this._running = false;
    this.release(true);
    this.dropBinding();
    this._errorCode = undefined;
    this.update();
  }

  /** Opens a connection presenting the session's entry join code, while it has one, and binding token. */
  private open(): void {
    const bridge = this._createBridge({
      bridgeUrl: this._bridgeUrl,
      wsPath: MAKECODE_SESSION_ROLE_PATHS.editor,
      filesystem: createInMemoryProjectFileSystem(),
      joinCode: this._entryCode,
      bindingToken: this._bindingToken,
    });
    this._bridge = bridge;
    this._entryAccepted = false;
    const unsubscribes = [
      bridge.onStateChange(() => {
        if (bridge === this._bridge) this.bridgeChanged(bridge);
      }),
      bridge.onWelcome((welcome) => {
        if (bridge === this._bridge) this.welcome(bridge, welcome.bindingToken);
      }),
    ];
    this._bridgeUnsubscribe = () => {
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
    bridge.start();
  }

  /**
   * Closes the open connection, if any, and the handshake it carries; with
   * `end`, ends the session on purpose over the connection first.
   */
  private release(end = false): void {
    const bridge = this._bridge;
    this.leaveCounterpart();
    this._bridgeUnsubscribe?.();
    this._bridgeUnsubscribe = undefined;
    this._bridge = undefined;
    if (end) {
      bridge?.end();
    } else {
      bridge?.stop();
    }
  }

  /** Drops the binding token, held and persisted, the entry join code, the join code, and the declared target. */
  private dropBinding(): void {
    this._bindingToken = undefined;
    this._entryCode = undefined;
    this._joinCode = undefined;
    this._target = undefined;
    this._clearBindingToken?.();
  }

  private welcome(bridge: AppBridge, token: string | undefined): void {
    this._entryCode = undefined;
    if (token !== undefined && token !== this._bindingToken) {
      this._bindingToken = token;
      this._saveBindingToken?.(token);
    }
    this._counterpart?.close();
    this._counterpart = new CounterpartSession(
      bridge,
      (session) => {
        this._target = session.peerTarget;
        this.update();
        const channel: MakeCodeBrainsChannel = {
          listBrains: () => session.listBrains(),
          pullBrains: (ids) => session.pullBrains(ids),
          pushBrain: (push) => session.pushBrain(push),
        };
        for (const listener of this._brainsChannelListeners) listener(channel);
      },
      (content) => {
        for (const listener of this._catalogListeners) listener(content);
      },
      (code) => {
        this.fail(code);
      }
    );
    this._welcomed = true;
    this._errorCode = undefined;
    this.update();
  }

  private bridgeChanged(bridge: AppBridge): void {
    const snapshot = bridge.snapshot();
    if (snapshot.errorCode !== undefined) {
      this.fail(snapshot.errorCode);
      return;
    }
    if (snapshot.status !== "connected") {
      this._entryAccepted = false;
    } else if (snapshot.joinCode !== undefined && snapshot.joinCode !== this._joinCode) {
      // A code arriving on the open connection answers the hello, or follows the answer.
      this._entryAccepted = true;
    }
    this._joinCode = snapshot.joinCode;
    if (snapshot.status !== "connected" || snapshot.counterpartAway) this.leaveCounterpart();
    this.update();
  }

  /**
   * Ends the open connection for `code`, dropping the binding when the
   * session was ended, then reconnects at once when the code calls for it.
   */
  private fail(code: MakeCodeEditorSessionErrorCode): void {
    this.release();
    this._errorCode = code;
    if (code === BridgeSessionErrorCode.SESSION_ENDED) this.dropBinding();
    if (code !== BridgeSessionErrorCode.OUTBOUND_QUEUE_OVERFLOW) this._running = false;
    this.update();
    if (this._running) {
      // Reopens once the failed bridge's current call has returned.
      queueMicrotask(() => {
        if (this._running && !this._bridge) this.open();
      });
    }
  }

  private leaveCounterpart(): void {
    this._counterpart?.close();
    this._counterpart = undefined;
    this._welcomed = false;
  }

  private readState(): MakeCodeEditorSessionState {
    const entryPending = this._entryCode !== undefined && this._bridge !== undefined;
    return {
      status: this._welcomed ? "connected" : this._bindingToken === undefined ? "none" : "disconnected",
      entry: entryPending ? (this._entryAccepted ? "accepted" : "submitted") : undefined,
      joinCode: this._joinCode,
      errorCode: this._errorCode,
      target: this._target,
    };
  }

  /** Publishes the current state when any field differs from the last one published. */
  private update(): void {
    const next = this.readState();
    const last = this._state;
    if (
      next.status === last.status &&
      next.entry === last.entry &&
      next.joinCode === last.joinCode &&
      next.errorCode === last.errorCode &&
      next.target === last.target
    ) {
      return;
    }
    this._state = next;
    for (const listener of this._stateListeners) listener(next);
  }
}
