import {
  SIMXEDITOR_MESSAGE_TYPE,
  type SimxEditorOpenRequest,
  type SimxEditorReply,
  type SimxEditorTab,
  type SimxEditorTabsRequest,
} from "../vendor/simxeditor.js";
import type { SimxLog } from "./simx-bridge.js";

/** The window an {@link EditorTabOpener} posts its requests through and hears their replies on. */
export interface EditorTabFrame {
  addEventListener(type: "message", listener: (event: { data: unknown; source: unknown }) => void): void;
  removeEventListener(type: "message", listener: (event: { data: unknown; source: unknown }) => void): void;
  readonly parent: { postMessage(message: unknown, targetOrigin: string): void };
}

/** Asks MakeCode which editor tabs talk to this simulator extension frame, and to show one of them. */
export interface EditorTabOpener {
  /**
   * Post a tabs request to MakeCode. Resolves with the tabs MakeCode lists,
   * each naming its key, its label and, when MakeCode gives one, its icon's
   * URL: the frame's own tab first, when it has one, then the tabs of the
   * registrations naming the frame. Resolves with an empty list on a
   * refusal, whose code is logged.
   */
  tabs(): Promise<SimxEditorTab[]>;
  /**
   * Post an open request to MakeCode for the tab keyed `key`, the key of one
   * of the tabs {@link tabs} lists, or for the frame's own tab when `key` is
   * omitted. Resolves once MakeCode replies: on an acknowledgment, and on a
   * refusal, whose code is logged.
   */
  open(key?: string): Promise<void>;
  /** Stop hearing replies; a request still unanswered stays unresolved. */
  dispose(): void;
}

/**
 * Open the conversation in which this simulator extension frame asks
 * MakeCode which editor tabs talk to it and to show one of them: each
 * request is posted to `frame`'s parent at `parentOrigin` under a fresh id,
 * and the reply carrying that id from the parent window settles it. A
 * refusal is logged to `log` by its code (`UNREGISTERED`,
 * `PERMISSION_DENIED`, `UNAVAILABLE` or `INVALID_REQUEST`).
 */
export function connectEditorTabOpener(frame: EditorTabFrame, parentOrigin: string, log: SimxLog): EditorTabOpener {
  const prefix = Math.random().toString(36).slice(2, 10);
  let count = 0;
  const pending = new Map<string, (reply: Partial<SimxEditorReply>) => void>();
  const receive = (event: { data: unknown; source: unknown }): void => {
    if (event.source !== frame.parent) return;
    const reply = event.data as Partial<SimxEditorReply> | null;
    if (reply?.type !== SIMXEDITOR_MESSAGE_TYPE || typeof reply.id !== "string") return;
    const settle = pending.get(reply.id);
    if (settle === undefined) return;
    pending.delete(reply.id);
    settle(reply);
  };
  frame.addEventListener("message", receive);
  const nextId = (): string => `${prefix}-${++count}`;
  const post = (
    request: SimxEditorOpenRequest | SimxEditorTabsRequest,
    settle: (reply: Partial<SimxEditorReply>) => void
  ): void => {
    pending.set(request.id, settle);
    frame.parent.postMessage(request, parentOrigin);
  };

  return {
    tabs() {
      const request: SimxEditorTabsRequest = { type: SIMXEDITOR_MESSAGE_TYPE, subtype: "tabs", id: nextId() };
      return new Promise<SimxEditorTab[]>((resolve) => {
        post(request, (reply) => {
          if (reply.subtype === "error") {
            log.error(`${reply.code}: MakeCode did not list the Wendoo editor tabs.`);
          }
          resolve(reply.subtype === "tabs" ? (reply.tabs ?? []) : []);
        });
      });
    },
    open(key) {
      const request: SimxEditorOpenRequest = { type: SIMXEDITOR_MESSAGE_TYPE, subtype: "open", id: nextId() };
      if (key !== undefined) request.key = key;
      return new Promise<void>((resolve) => {
        post(request, (reply) => {
          if (reply.subtype === "error") {
            log.error(`${reply.code}: MakeCode did not open the Wendoo editor tab.`);
          }
          resolve();
        });
      });
    },
    dispose() {
      frame.removeEventListener("message", receive);
      pending.clear();
    },
  };
}
