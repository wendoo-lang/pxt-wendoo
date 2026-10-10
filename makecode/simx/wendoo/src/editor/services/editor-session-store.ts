import type {
  MakeCodeAsset,
  MakeCodeBrainsChannel,
  MakeCodeEditorSession,
  MakeCodeEditorSessionErrorCode,
  MakeCodeEditorSessionStatus,
} from "@wendoo/makecode-session";

/** What the editor shows for one reading of the session store. */
export interface EditorSessionViewState {
  /** The session's connectivity, exactly as the session reports it. */
  readonly status: MakeCodeEditorSessionStatus;
  /** Stable code of the failure that ended the latest connection, or `undefined` when none did. */
  readonly errorCode: MakeCodeEditorSessionErrorCode | undefined;
  /** `true` once the session has been connected since the page started it; kept through later disconnections. */
  readonly connectedSinceOpen: boolean;
  /**
   * The latest tile catalog the MakeCode side published, as its serialized
   * text, or `undefined` before the first. Kept while disconnected.
   */
  readonly catalogText: string | undefined;
  /**
   * The latest asset snapshot the MakeCode side published, whole, or
   * `undefined` before the first. Kept while disconnected.
   */
  readonly assets: readonly MakeCodeAsset[] | undefined;
  /**
   * The project name the MakeCode side published last, exactly as it
   * published it, or `undefined` before the first -- a MakeCode side that
   * publishes no project facts leaves it `undefined`. Kept while
   * disconnected.
   */
  readonly projectName: string | undefined;
  /**
   * Id of the MakeCode target the MakeCode side declared, for example
   * `microbit` or `arcade`, exactly as the session reports it: kept while
   * disconnected, `undefined` when unknown. Informational, for display and
   * theming.
   */
  readonly target: string | undefined;
}

/**
 * The editor's makecode session as the UI consumes it: one store over the
 * session object for the life of the page. Components read
 * {@link getSnapshot} and subscribe with {@link subscribe} (both
 * `useSyncExternalStore`-shaped); {@link start} and {@link stop} are the only
 * ways the page drives the session.
 */
export class EditorSessionStore {
  private readonly _session: MakeCodeEditorSession;
  private readonly _listeners = new Set<() => void>();
  private _connectedSinceOpen = false;
  private _catalogText: string | undefined;
  private _assets: readonly MakeCodeAsset[] | undefined;
  private _projectName: string | undefined;
  private _state: EditorSessionViewState;

  /** @param session - The session the store follows for the life of the page, not yet started. */
  constructor(session: MakeCodeEditorSession) {
    this._session = session;
    session.onStateChange(() => {
      this.sessionChanged();
    });
    session.onCatalog((content) => {
      this._catalogText = content;
      this.publish();
    });
    session.onAssets((assets) => {
      this._assets = assets;
      this.publish();
    });
    session.onProjectInfo((info) => {
      this._projectName = info.name;
      this.publish();
    });
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
   * Subscribe to the brains channel of each makecode handshake the session
   * completes. Returns an unsubscribe function.
   */
  onBrainsChannel = (listener: (channel: MakeCodeBrainsChannel) => void): (() => void) => {
    return this._session.onBrainsChannel(listener);
  };

  /** Starts the session. */
  start(): void {
    this._session.start();
  }

  /** Stops the session, closing its connection. */
  stop(): void {
    this._session.stop();
  }

  private sessionChanged(): void {
    if (this._session.state.status === "connected") this._connectedSinceOpen = true;
    this.publish();
  }

  private readState(): EditorSessionViewState {
    const sessionState = this._session.state;
    return {
      status: sessionState.status,
      errorCode: sessionState.errorCode,
      connectedSinceOpen: this._connectedSinceOpen,
      catalogText: this._catalogText,
      assets: this._assets,
      projectName: this._projectName,
      target: sessionState.target,
    };
  }

  /** Publishes the current snapshot when any field differs from the last one published. */
  private publish(): void {
    const next = this.readState();
    const last = this._state;
    if (
      next.status === last.status &&
      next.errorCode === last.errorCode &&
      next.connectedSinceOpen === last.connectedSinceOpen &&
      next.catalogText === last.catalogText &&
      next.assets === last.assets &&
      next.projectName === last.projectName &&
      next.target === last.target
    ) {
      return;
    }
    this._state = next;
    for (const listener of this._listeners) listener();
  }
}
