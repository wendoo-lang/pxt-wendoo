import { BridgeSessionErrorCode } from "@wendoo/bridge-app";
import type { EditorSessionViewState } from "@/services/editor-session-store";
import { isVersionCode } from "./VersionNotice";

/**
 * The editor's connection with the MakeCode project, as its status displays
 * show it:
 *
 * - `connecting` -- an entered join code is presented, not yet answered,
 *   or the session view's session has not connected since it was opened;
 * - `waiting` -- the entered code was accepted, and the project has not
 *   connected yet;
 * - `connected` -- the session view, connected, or disconnected for less
 *   than the disconnect grace after having connected;
 * - `reconnecting` -- disconnected for longer than the disconnect grace;
 * - `replaced` -- another editor took the session over;
 * - `ended` -- the session was ended;
 * - `update` -- this editor and its counterpart speak no common version.
 */
export type EditorConnectionStatus =
  | "connecting"
  | "waiting"
  | "connected"
  | "reconnecting"
  | "replaced"
  | "ended"
  | "update";

/**
 * The {@link EditorConnectionStatus} for a reading of the session store.
 * On the connect page it follows the entered code, and is `undefined` while
 * none is pending; in the session view a version rejection, a replacement,
 * or an ended session shows at once, and a disconnection only once
 * `disconnectedBeyondGrace` is set -- until then the status stays what it
 * was: connected once the session has connected, connecting before.
 */
export function connectionStatus(
  state: Pick<EditorSessionViewState, "view" | "entry" | "errorCode" | "disconnectedBeyondGrace" | "connectedSinceOpen">
): EditorConnectionStatus | undefined {
  if (state.view === "connect") {
    if (state.entry === "submitted") return "connecting";
    if (state.entry === "accepted") return "waiting";
    return undefined;
  }
  if (isVersionCode(state.errorCode)) return "update";
  if (state.errorCode === BridgeSessionErrorCode.SESSION_REPLACED) return "replaced";
  if (state.errorCode === BridgeSessionErrorCode.SESSION_ENDED) return "ended";
  if (state.disconnectedBeyondGrace) return "reconnecting";
  return state.connectedSinceOpen ? "connected" : "connecting";
}

/** The themeable token each status's dot is painted in, as its Tailwind background utility. */
const DOT_TOKENS: Record<EditorConnectionStatus, string> = {
  connecting: "bg-muted-foreground",
  waiting: "bg-primary",
  connected: "bg-success",
  reconnecting: "bg-warning",
  replaced: "bg-muted-foreground",
  ended: "bg-muted-foreground",
  update: "bg-destructive",
};

/** The lowercase status text the app header shows for each status. */
const STATUS_WORDS: Record<EditorConnectionStatus, string> = {
  connecting: "connecting",
  waiting: "waiting for the project",
  connected: "connected",
  reconnecting: "reconnecting",
  replaced: "taken over",
  ended: "ended",
  update: "update needed",
};

/** The 8px status dot, colored for `status` and carrying it as `data-status`. Decorative; label it alongside. */
export function StatusDot({ status }: { status: EditorConnectionStatus }) {
  return (
    <span
      data-testid="status-dot"
      data-status={status}
      aria-hidden="true"
      className={`size-2 shrink-0 rounded-full ${DOT_TOKENS[status]}`}
    />
  );
}

/** The status dot and its lowercase status word, carrying `status` as `data-status`. */
export function ConnectionStatus({ status }: { status: EditorConnectionStatus }) {
  return (
    <output
      data-testid="connection-status"
      data-status={status}
      className="flex items-center gap-1.5 text-muted-foreground text-xs"
    >
      <StatusDot status={status} />
      {STATUS_WORDS[status]}
    </output>
  );
}
