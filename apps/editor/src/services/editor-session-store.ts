import type {
  MakeCodeEditorSession,
  MakeCodeEditorSessionEntry,
  MakeCodeEditorSessionErrorCode,
  MakeCodeEditorSessionOptions,
  MakeCodeEditorSessionStatus,
} from "@wendoo/makecode-session";
import { createMakeCodeEditorSession } from "@wendoo/makecode-session";

/**
 * How long the session must stay continuously disconnected before
 * {@link EditorSessionViewState.disconnectedBeyondGrace} becomes `true`, in
 * milliseconds.
 */
export const DISCONNECT_GRACE_MS = 4000;

/** Where the store keeps the session's binding token across page loads. */
export interface BindingTokenPersistence {
  /** The persisted token, or `undefined` when none is persisted. */
  load(): string | undefined;
  /** Persist `token`, replacing any persisted before. */
  save(token: string): void;
  /** Remove the persisted token. */
  clear(): void;
  /** Whether a token is currently persisted. */
  has(): boolean;
}

/** What the editor shows for one reading of the session store. */
export interface EditorSessionViewState {
  /**
   * The page to show: `connect` -- the join-code entry, when no session
   * exists -- or `session`, once one does.
   */
  readonly view: "connect" | "session";
  /** The session's connectivity, exactly as the session reports it. */
  readonly status: MakeCodeEditorSessionStatus;
  /**
   * Progress of the join code entered on the connect page, exactly as the
   * session reports it: `submitted`, then `accepted`, until a welcome
   * connects the session; `undefined` when no entered code is pending.
   */
  readonly entry: MakeCodeEditorSessionEntry | undefined;
  /**
   * The code a person enters on the MakeCode side to join the session's
   * vacant role, live-updated as the bridge service sends newer ones;
   * `undefined` while both roles are bound.
   */
  readonly joinCode: string | undefined;
  /** Stable code of the failure that ended the latest connection, or `undefined` when none did. */
  readonly errorCode: MakeCodeEditorSessionErrorCode | undefined;
  /**
   * `true` once the session has been continuously disconnected for
   * {@link DISCONNECT_GRACE_MS}; `false` again the moment it reconnects.
   */
  readonly disconnectedBeyondGrace: boolean;
  /**
   * The latest tile catalog the MakeCode side published, as its serialized
   * text. Kept while disconnected; dropped whenever no session exists -- by
   * {@link EditorSessionStore.forget}, and when the session ends.
   */
  readonly catalogText: string | undefined;
  /**
   * Id of the MakeCode target the MakeCode side declared, for example
   * `microbit` or `arcade`, exactly as the session reports it: kept while
   * disconnected, `undefined` when unknown. Informational, for display and
   * theming.
   */
  readonly target: string | undefined;
}

/** Options for {@link EditorSessionStore}. */
export interface EditorSessionStoreOptions {
  /** Address of the MakeCode bridge service as a bare host with an optional port. Defaults to the deployed service. */
  bridgeUrl?: string;
  /** Keeps the session's binding token across page loads. */
  persistence: BindingTokenPersistence;
  /** Creates the session each connect attempt opens. Defaults to `createMakeCodeEditorSession`. */
  createSession?: (options: MakeCodeEditorSessionOptions) => MakeCodeEditorSession;
}

/**
 * The editor's makecode session as the UI consumes it: one store over the
 * session object, the binding token persistence, and the disconnect grace.
 * Components read {@link getSnapshot} and subscribe with {@link subscribe}
 * (both `useSyncExternalStore`-shaped); the actions below are the only ways
 * the UI touches the session.
 */
export class EditorSessionStore {
  private readonly _bridgeUrl: string | undefined;
  private readonly _persistence: BindingTokenPersistence;
  private readonly _createSession: (options: MakeCodeEditorSessionOptions) => MakeCodeEditorSession;
  private readonly _listeners = new Set<() => void>();
  private readonly _unsubscribes: (() => void)[] = [];
  private _session: MakeCodeEditorSession | undefined;
  private _graceTimer: ReturnType<typeof setTimeout> | undefined;
  private _beyondGrace = false;
  private _catalogText: string | undefined;
  private _state: EditorSessionViewState;

  constructor(options: EditorSessionStoreOptions) {
    this._bridgeUrl = options.bridgeUrl;
    this._persistence = options.persistence;
    this._createSession = options.createSession ?? createMakeCodeEditorSession;
    this._state = this.readState();
  }

  /** Subscribe to snapshot changes. Returns an unsubscribe function. */
  subscribe = (listener: () => void): (() => void) => {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  };

  /** The current view state. A new object each time any of its fields changes. */
  getSnapshot = (): EditorSessionViewState => {
    return this._state;
  };

  /**
   * Reopens the session a token persisted by an earlier page load names, so
   * the editor resumes without a join code entered. Returns whether a token
   * was persisted; when none is, the connect page is the way in.
   */
  resume(): boolean {
    if (!this._persistence.has()) return false;
    this.open(undefined);
    return true;
  }

  /** Joins the session `joinCode` names, replacing any earlier connect attempt. */
  connect(joinCode: string): void {
    this.open(joinCode);
  }

  /** Reconnects the held session in place, as after a `SESSION_REPLACED` hold. */
  reconnect(): void {
    this._session?.start();
  }

  /**
   * Forgets the session: ends it over a live connection, so the MakeCode
   * side is told it ended, then drops its binding token, held and persisted,
   * and the catalog, returning the editor to the connect page. With no live
   * connection this is a local clear. The way back into a session is
   * entering a join code.
   */
  forget(): void {
    this._catalogText = undefined;
    if (this._session === undefined) {
      this.publish();
      return;
    }
    this._session.forget();
  }

  /** Closes the connection, keeping the session and its persisted token for the next page load. */
  stop(): void {
    this._session?.stop();
  }

  /** Opens a fresh session presenting `joinCode` and the persisted token, replacing any current one. */
  private open(joinCode: string | undefined): void {
    const previous = this._session;
    for (const unsubscribe of this._unsubscribes.splice(0)) unsubscribe();
    previous?.stop();
    const session = this._createSession({
      bridgeUrl: this._bridgeUrl,
      joinCode,
      loadBindingToken: () => this._persistence.load(),
      saveBindingToken: (token) => {
        this._persistence.save(token);
      },
      clearBindingToken: () => {
        this._persistence.clear();
      },
    });
    this._session = session;
    this._unsubscribes.push(
      session.onStateChange(() => {
        this.sessionChanged();
      }),
      session.onCatalog((content) => {
        this._catalogText = content;
        this.publish();
      })
    );
    session.start();
    this.sessionChanged();
  }

  /** Tracks the session's connectivity into the grace bookkeeping, drops the catalog when no session exists, then publishes. */
  private sessionChanged(): void {
    const status = this._session?.state.status ?? "none";
    if (status === "none") this._catalogText = undefined;
    if (status === "disconnected") {
      if (this._graceTimer === undefined && !this._beyondGrace) {
        this._graceTimer = setTimeout(() => {
          this._graceTimer = undefined;
          this._beyondGrace = true;
          this.publish();
        }, DISCONNECT_GRACE_MS);
      }
    } else {
      if (this._graceTimer !== undefined) {
        clearTimeout(this._graceTimer);
        this._graceTimer = undefined;
      }
      this._beyondGrace = false;
    }
    this.publish();
  }

  private readState(): EditorSessionViewState {
    const sessionState = this._session?.state;
    const status = sessionState?.status ?? "none";
    return {
      view: status === "none" ? "connect" : "session",
      status,
      entry: sessionState?.entry,
      joinCode: sessionState?.joinCode,
      errorCode: sessionState?.errorCode,
      disconnectedBeyondGrace: this._beyondGrace,
      catalogText: this._catalogText,
      target: sessionState?.target,
    };
  }

  /** Publishes the current snapshot when any field differs from the last one published. */
  private publish(): void {
    const next = this.readState();
    const last = this._state;
    if (
      next.view === last.view &&
      next.status === last.status &&
      next.entry === last.entry &&
      next.joinCode === last.joinCode &&
      next.errorCode === last.errorCode &&
      next.disconnectedBeyondGrace === last.disconnectedBeyondGrace &&
      next.catalogText === last.catalogText &&
      next.target === last.target
    ) {
      return;
    }
    this._state = next;
    for (const listener of this._listeners) listener();
  }
}
