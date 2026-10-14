import type { MakeCodeMessagePort } from "@wendoo/makecode-session";
import {
  SIMXEDITOR_MESSAGE_TYPE,
  SIMXEDITOR_PORT_MESSAGE_TYPE,
  type SimxEditorEvent,
  type SimxEditorReadyEvent,
} from "../../vendor/simxeditor.js";

/** Stable code logged when the frame URL names no valid `parentOrigin`, so the editor tab hears nothing from MakeCode. */
export const TAB_PARENT_ORIGIN_INVALID = "TAB_PARENT_ORIGIN_INVALID";

/**
 * Returns the origin the frame URL's `parentOrigin` parameter names: the
 * MakeCode editor's, which MakeCode passes to every editor tab frame. Returns
 * `undefined` when the parameter is absent or is not exactly an origin, such
 * as `https://arcade.makecode.com`.
 *
 * @param search - The frame URL's query string.
 */
export function readParentOrigin(search: string): string | undefined {
  const named = new URLSearchParams(search).get("parentOrigin");
  if (named === null) return undefined;
  try {
    return new URL(named).origin === named ? named : undefined;
  } catch {
    return undefined;
  }
}

/** A message event delivered to the editor tab's window, with the fields the client reads. */
export interface SimxEditorClientEvent {
  readonly data: unknown;
  /** The origin of the window that posted the message. */
  readonly origin: string;
  /** The ports transferred with the message. */
  readonly ports: readonly MakeCodeMessagePort[];
}

/** The window the editor tab runs in, as {@link connectSimxEditorClient} uses it. */
export interface SimxEditorClientFrame {
  addEventListener(type: "message", listener: (event: SimxEditorClientEvent) => void): void;
  removeEventListener(type: "message", listener: (event: SimxEditorClientEvent) => void): void;
  readonly parent: { postMessage(message: unknown, targetOrigin: string): void };
}

/** The editor tab's side of MakeCode's editor-tab messages. */
export interface SimxEditorClient {
  /**
   * Subscribe to the ports MakeCode brokers to this tab, each connecting it
   * to the simulator extension's frame and delivered as it arrives; each
   * replaces the one before.
   * Returns an unsubscribe function.
   */
  onPort(listener: (port: MakeCodeMessagePort) => void): () => void;
  /**
   * Subscribe to the lifecycle and simulator events MakeCode posts to the
   * tab: `shown`, `hidden`, `simulator`, `simulatorstate` and `fullscreen`.
   * Returns an unsubscribe function.
   */
  onEvent(listener: (event: SimxEditorEvent) => void): () => void;
  /** Tell MakeCode the tab listens for messages; MakeCode brokers ports only after. */
  ready(): void;
  /** Stop listening for messages. */
  dispose(): void;
}

/**
 * Open the editor tab's conversation with MakeCode through `frame`, posting
 * to its parent at `parentOrigin` and reading only the messages from
 * `parentOrigin`: the port messages carrying a port, and the editor-tab
 * events. Subscribe before calling {@link SimxEditorClient.ready}.
 */
export function connectSimxEditorClient(frame: SimxEditorClientFrame, parentOrigin: string): SimxEditorClient {
  const portListeners = new Set<(port: MakeCodeMessagePort) => void>();
  const eventListeners = new Set<(event: SimxEditorEvent) => void>();
  const receive = (event: SimxEditorClientEvent): void => {
    if (event.origin !== parentOrigin) return;
    const data = event.data as { type?: unknown; event?: unknown } | null;
    if (data?.type === SIMXEDITOR_PORT_MESSAGE_TYPE) {
      const port = event.ports[0];
      if (port === undefined) return;
      for (const listener of portListeners) listener(port);
      return;
    }
    if (data?.type === SIMXEDITOR_MESSAGE_TYPE && typeof data.event === "string") {
      for (const listener of eventListeners) listener(data as SimxEditorEvent);
    }
  };
  frame.addEventListener("message", receive);

  return {
    onPort(listener) {
      portListeners.add(listener);
      return () => {
        portListeners.delete(listener);
      };
    },
    onEvent(listener) {
      eventListeners.add(listener);
      return () => {
        eventListeners.delete(listener);
      };
    },
    ready() {
      const message: SimxEditorReadyEvent = { type: SIMXEDITOR_MESSAGE_TYPE, event: "ready" };
      frame.parent.postMessage(message, parentOrigin);
    },
    dispose() {
      frame.removeEventListener("message", receive);
      portListeners.clear();
      eventListeners.clear();
    },
  };
}
