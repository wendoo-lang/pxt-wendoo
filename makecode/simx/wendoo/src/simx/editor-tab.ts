import { SIMXEDITOR_MESSAGE_TYPE, type SimxEditorOpenRequest, type SimxEditorReply } from "../vendor/simxeditor.js";
import type { SimxLog } from "./simx-bridge.js";

/** The window an {@link EditorTabOpener} posts its requests through and hears their replies on. */
export interface EditorTabFrame {
  addEventListener(type: "message", listener: (event: { data: unknown; source: unknown }) => void): void;
  removeEventListener(type: "message", listener: (event: { data: unknown; source: unknown }) => void): void;
  readonly parent: { postMessage(message: unknown, targetOrigin: string): void };
}

/** Asks MakeCode to show this simulator extension's editor tab. */
export interface EditorTabOpener {
  /**
   * Post an open request to MakeCode. Resolves once MakeCode replies: on an
   * acknowledgment, and on a refusal, whose code is logged.
   */
  open(): Promise<void>;
  /** Stop hearing replies; a request still unanswered stays unresolved. */
  dispose(): void;
}

/**
 * Open the conversation in which this simulator extension frame asks
 * MakeCode to show its editor tab: each request is posted to `frame`'s
 * parent at `parentOrigin` under a fresh id, and the reply carrying that id
 * from the parent window settles it. A refusal is logged to `log` by its
 * code (`UNREGISTERED`, `PERMISSION_DENIED`, `UNAVAILABLE` or
 * `INVALID_REQUEST`).
 */
export function connectEditorTabOpener(frame: EditorTabFrame, parentOrigin: string, log: SimxLog): EditorTabOpener {
  const prefix = Math.random().toString(36).slice(2, 10);
  let count = 0;
  const pending = new Map<string, () => void>();
  const receive = (event: { data: unknown; source: unknown }): void => {
    if (event.source !== frame.parent) return;
    const reply = event.data as Partial<SimxEditorReply> | null;
    if (reply?.type !== SIMXEDITOR_MESSAGE_TYPE || typeof reply.id !== "string") return;
    const settle = pending.get(reply.id);
    if (settle === undefined) return;
    pending.delete(reply.id);
    if (reply.subtype === "error") {
      log.error(`${reply.code}: MakeCode did not open the Wendoo editor tab.`);
    }
    settle();
  };
  frame.addEventListener("message", receive);

  return {
    open() {
      const id = `${prefix}-${++count}`;
      const request: SimxEditorOpenRequest = { type: SIMXEDITOR_MESSAGE_TYPE, subtype: "open", id };
      return new Promise<void>((resolve) => {
        pending.set(id, resolve);
        frame.parent.postMessage(request, parentOrigin);
      });
    },
    dispose() {
      frame.removeEventListener("message", receive);
      pending.clear();
    },
  };
}
