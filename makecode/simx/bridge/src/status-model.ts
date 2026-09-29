import { BridgeSessionErrorCode, PeerSessionErrorCode } from "@wendoo/bridge-protocol";
import type { SimxBridge, SimxBridgeErrorCode } from "./simx-bridge.js";

/**
 * How long the counterpart must stay continuously away before the status
 * shows {@link SimxStatusState} `away`, in milliseconds.
 */
export const AWAY_DISPLAY_GRACE_MS = 4000;

/**
 * What the simulator extension's status panel shows:
 *
 * - `connecting`: the bridge connection is not open, or the bridge service
 *   has not yet answered its hello.
 * - `code`: this side holds no binding, so the editor's seat is vacant; the
 *   join code that fills it is shown.
 * - `connected`: the editor is connected to the session.
 * - `away`: the session is bound, but its editor has been away for the
 *   display grace.
 * - `confirm`: ending the session was requested from `connected` or `away`
 *   and awaits confirmation.
 * - `ended`: the connection stopped for good -- the session was ended, or
 *   another failure stopped it -- until a new session is started.
 * - `update`: this side and the bridge service or the editor speak no common
 *   version; reloading the page updates this side.
 */
export type SimxStatusState = "connecting" | "code" | "connected" | "away" | "confirm" | "ended" | "update";

/** One reading of the simulator extension's session status, as the panel renders it. */
export interface SimxStatusView {
  readonly state: SimxStatusState;
  /** The join code to show: defined exactly when {@link state} is `code`. */
  readonly joinCode: string | undefined;
  /** In `connecting`, `true` while the bridge client is retrying after a failed connect attempt; `false` otherwise. */
  readonly retrying: boolean;
  /**
   * In `confirm`, the view the pending end request is shown over, `connected`
   * or `away`, whose status the panel keeps showing; `undefined` otherwise.
   */
  readonly endFrom: "connected" | "away" | undefined;
}

/** The session state a {@link SimxStatusModel} follows: the part of a {@link SimxBridge} it reads and drives. */
export type SimxStatusSource = Pick<
  SimxBridge,
  | "joinCode"
  | "counterpartAway"
  | "counterpartConnected"
  | "bound"
  | "connection"
  | "errorCode"
  | "onChange"
  | "startNewSession"
>;

/** Options for {@link SimxStatusModel}. */
export interface SimxStatusModelOptions {
  /**
   * How long the counterpart must stay away before the status shows `away`,
   * in milliseconds. Defaults to {@link AWAY_DISPLAY_GRACE_MS}.
   */
  awayGraceMs?: number;
}

/** Whether `code` reports that this side and its peer speak no common version. */
function isVersionCode(code: SimxBridgeErrorCode | undefined): boolean {
  return (
    code === BridgeSessionErrorCode.PROTOCOL_VERSION_MISMATCH || code === PeerSessionErrorCode.PROTOCOL_VERSION_NEWER
  );
}

/** The view the session state of `source` calls for, before the away grace and any pending confirmation apply. */
function readSource(source: SimxStatusSource): SimxStatusView {
  const view = (state: SimxStatusState, joinCode?: string): SimxStatusView => ({
    state,
    joinCode,
    retrying: false,
    endFrom: undefined,
  });
  if (isVersionCode(source.errorCode)) return view("update");
  if (source.errorCode !== undefined) return view("ended");
  if (source.connection !== "connected") {
    return { ...view("connecting"), retrying: source.connection === "reconnecting" };
  }
  if (source.counterpartConnected) return view("connected");
  if (source.bound) {
    return source.counterpartAway || source.joinCode !== undefined ? view("away") : view("connecting");
  }
  return source.joinCode === undefined ? view("connecting") : view("code", source.joinCode);
}

/**
 * The simulator extension's session status as its panel shows it: one view
 * derived from the bridge's session state, plus the two things only the
 * panel adds -- the display grace before `away`, and the confirmation step
 * before ending. Components read {@link getSnapshot} and subscribe with
 * {@link subscribe}; {@link requestEnd}, {@link cancelEnd},
 * {@link confirmEnd}, and {@link startNewSession} drive the session.
 *
 * The view shows a join code exactly while the bridge holds no binding: a
 * bound session whose editor is gone shows `away`, never the code the
 * bridge service sends for the editor's seat. `away` shows only once the
 * session has called for it continuously for the grace; until then the view
 * it replaces stays shown.
 */
export class SimxStatusModel {
  private readonly _source: SimxStatusSource;
  private readonly _awayGraceMs: number;
  private readonly _listeners = new Set<() => void>();
  private readonly _unsubscribe: () => void;
  /** The latest view shown that was not `away`, shown in place of `away` during the grace. */
  private _held: SimxStatusView = { state: "connecting", joinCode: undefined, retrying: false, endFrom: undefined };
  private _graceTimer: ReturnType<typeof setTimeout> | undefined;
  private _awayShown = false;
  private _confirming = false;
  private _view: SimxStatusView;

  constructor(source: SimxStatusSource, options: SimxStatusModelOptions = {}) {
    this._source = source;
    this._awayGraceMs = options.awayGraceMs ?? AWAY_DISPLAY_GRACE_MS;
    this._unsubscribe = source.onChange(() => {
      this.sourceChanged();
    });
    this.track(readSource(source));
    this._view = this.readView();
  }

  /** Subscribe to view changes. Returns an unsubscribe function. */
  subscribe = (listener: () => void): (() => void) => {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  };

  /** The current view. A new object each time any of its fields changes. */
  getSnapshot = (): SimxStatusView => {
    return this._view;
  };

  /** Asks to end the session: shows `confirm` when the view is `connected` or `away`; does nothing otherwise. */
  requestEnd(): void {
    const { state } = this._view;
    if (state !== "connected" && state !== "away") return;
    this._confirming = true;
    this.publish();
  }

  /** Withdraws a pending end request, returning to the view it was made from. */
  cancelEnd(): void {
    this._confirming = false;
    this.publish();
  }

  /**
   * Confirms a pending end request: ends the session and opens a new one at
   * once, whose join code the view then shows. Does nothing when no end
   * request is pending.
   */
  confirmEnd(): void {
    if (!this._confirming) return;
    this._confirming = false;
    this._source.startNewSession();
  }

  /** Opens a new session once the view is `ended`, whose join code the view then shows. Does nothing otherwise. */
  startNewSession(): void {
    if (this._view.state !== "ended") return;
    this._source.startNewSession();
  }

  /** Stops following the bridge and cancels the grace. */
  dispose(): void {
    this._unsubscribe();
    clearTimeout(this._graceTimer);
    this._graceTimer = undefined;
    this._listeners.clear();
  }

  private sourceChanged(): void {
    this.track(readSource(this._source));
    this.publish();
  }

  /** Runs the away grace for `base`, the view the session calls for, and drops a confirmation it no longer allows. */
  private track(base: SimxStatusView): void {
    if (base.state !== "connected" && base.state !== "away") this._confirming = false;
    if (base.state === "away") {
      if (this._graceTimer === undefined && !this._awayShown) {
        this._graceTimer = setTimeout(() => {
          this._graceTimer = undefined;
          this._awayShown = true;
          this.publish();
        }, this._awayGraceMs);
      }
      return;
    }
    clearTimeout(this._graceTimer);
    this._graceTimer = undefined;
    this._awayShown = false;
    this._held = base;
  }

  private readView(): SimxStatusView {
    const base = readSource(this._source);
    const shown = base.state === "away" && !this._awayShown ? this._held : base;
    if (!this._confirming) return shown;
    return {
      state: "confirm",
      joinCode: undefined,
      retrying: false,
      endFrom: shown.state === "away" ? "away" : "connected",
    };
  }

  /** Publishes the current view when any field differs from the last one published. */
  private publish(): void {
    const next = this.readView();
    const last = this._view;
    if (
      next.state === last.state &&
      next.joinCode === last.joinCode &&
      next.retrying === last.retrying &&
      next.endFrom === last.endFrom
    ) {
      return;
    }
    this._view = next;
    for (const listener of this._listeners) listener();
  }
}
