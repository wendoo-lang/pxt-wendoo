import { PeerSessionErrorCode } from "@wendoo/bridge-app";
import type { MakeCodeEditorSessionErrorCode } from "@wendoo/makecode-session";
import type { EditorSessionViewState } from "./editor-session-store";

/** Whether `code` reports that this editor and its counterpart speak no common version. */
export function isVersionCode(code: MakeCodeEditorSessionErrorCode | undefined): boolean {
  return code === PeerSessionErrorCode.PROTOCOL_VERSION_NEWER;
}

/**
 * The editor's connection with the MakeCode project:
 *
 * - `connecting` -- the session has not connected since the page started it;
 * - `connected` -- the session is connected;
 * - `reconnecting` -- the session connected earlier and is disconnected now;
 * - `update` -- this editor and its counterpart speak no common version.
 */
export type EditorConnectionStatus = "connecting" | "connected" | "reconnecting" | "update";

/**
 * The {@link EditorConnectionStatus} for a reading of the session store. A
 * version rejection shows as `update` whatever the connectivity; a
 * disconnection after the session has connected shows as `reconnecting`.
 */
export function connectionStatus(
  state: Pick<EditorSessionViewState, "status" | "errorCode" | "connectedSinceOpen">
): EditorConnectionStatus {
  if (isVersionCode(state.errorCode)) return "update";
  if (state.status === "connected") return "connected";
  return state.connectedSinceOpen ? "reconnecting" : "connecting";
}
