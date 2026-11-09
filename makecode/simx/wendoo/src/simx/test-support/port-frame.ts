import type { MakeCodeMessagePort } from "@wendoo/makecode-session";
import {
  SIMXEDITOR_PORT_MESSAGE_TYPE,
  type SimxEditorPortMessage,
  type SimxEditorTab,
} from "../../vendor/simxeditor.js";
import type { EditorTabOpener } from "../editor-tab.js";
import { SIM_CHANNEL_VERSION, SIMX_CHANNEL } from "../sim-channel.js";
import type { SimxPortFrame, SimxPortFrameEvent } from "../simx-bridge.js";

/** The origin of the MakeCode editor hosting the frames in the specs. */
export const PARENT_ORIGIN = "https://arcade.makecode.com";

/**
 * The window of a simulator extension frame MakeCode offers the editor tab
 * to, driven by a spec in place of MakeCode: it delivers the running
 * program's messages and the ports MakeCode brokers, and records every
 * message the extension posts to MakeCode.
 */
export class FakePortFrame implements SimxPortFrame {
  private readonly _listeners = new Set<(event: SimxPortFrameEvent) => void>();
  /** Every message the extension posted to MakeCode. */
  readonly posted: unknown[] = [];
  readonly parent = {
    postMessage: (message: unknown): void => {
      this.posted.push(message);
    },
  };

  addEventListener(_type: "message", listener: (event: SimxPortFrameEvent) => void): void {
    this._listeners.add(listener);
  }

  removeEventListener(_type: "message", listener: (event: SimxPortFrameEvent) => void): void {
    this._listeners.delete(listener);
  }

  /**
   * MakeCode delivering the catalog message the running program posted on
   * `channel`: `catalog` framed under channel version `version`, as UTF-8
   * bytes.
   */
  programPosts(catalog: string, channel = SIMX_CHANNEL, version = SIM_CHANNEL_VERSION): void {
    this.programPostsText(`${version}\n${catalog}`, channel);
  }

  /** MakeCode delivering a message the running program posted on `channel` with `text` as its UTF-8 bytes. */
  programPostsText(text: string, channel = SIMX_CHANNEL): void {
    const packet = {
      type: "messagepacket",
      broadcast: true,
      channel,
      data: new TextEncoder().encode(text),
      srcFrameIndex: 0,
    };
    this.deliver({ data: packet, origin: PARENT_ORIGIN, ports: [] });
  }

  /** MakeCode delivering the ping the running program posts when it starts: a frame with an empty payload. */
  programPings(): void {
    this.programPosts("");
  }

  /**
   * MakeCode brokering `port` to this frame, posting it from `origin`, for
   * the editor tab keyed `peer`: the frame's own tab by default.
   */
  brokerPort(port: MakeCodeMessagePort, origin = PARENT_ORIGIN, peer = SIMX_CHANNEL): void {
    const message: SimxEditorPortMessage = { type: SIMXEDITOR_PORT_MESSAGE_TYPE, key: SIMX_CHANNEL, peer };
    this.deliver({ data: message, origin, ports: [port] });
  }

  /** MakeCode below API level 2 brokering `port` to this frame: its port message names no `peer`. */
  brokerPortNamingNoPeer(port: MakeCodeMessagePort): void {
    this.deliver({
      data: { type: SIMXEDITOR_PORT_MESSAGE_TYPE, key: SIMX_CHANNEL },
      origin: PARENT_ORIGIN,
      ports: [port],
    });
  }

  /** Delivers `event` to every message listener. */
  deliver(event: SimxPortFrameEvent): void {
    for (const listener of this._listeners) listener(event);
  }
}

/**
 * The editor tab opener of a simulator extension frame, played by a spec in
 * place of MakeCode: it records the key of every tab it is asked to show, in
 * order, answering each at once unless {@link holdingOpens}, and holds every
 * tabs request until the spec answers it with {@link answerTabs} or lists the
 * tabs with {@link listTabs}, after which each request is answered at once.
 */
export class FakeTabOpener implements Pick<EditorTabOpener, "open" | "tabs"> {
  /** The key of every tab asked to show, `undefined` for the frame's own. */
  readonly opened: (string | undefined)[] = [];
  /** Whether each open request from now on answered at once is refused rather than acknowledged. */
  refusing = false;
  /** Whether each open request from now on waits for {@link answerOpen}. */
  holdingOpens = false;
  /** How many tabs requests were posted. */
  tabsAsked = 0;
  private _listed: readonly SimxEditorTab[] | undefined;
  private readonly _unansweredTabs: ((tabs: SimxEditorTab[]) => void)[] = [];
  private readonly _unansweredOpens: ((opened: boolean) => void)[] = [];

  open(key?: string): Promise<boolean> {
    this.opened.push(key);
    if (!this.holdingOpens) return Promise.resolve(!this.refusing);
    return new Promise((resolve) => {
      this._unansweredOpens.push(resolve);
    });
  }

  tabs(): Promise<SimxEditorTab[]> {
    this.tabsAsked += 1;
    const listed = this._listed;
    if (listed !== undefined) return Promise.resolve([...listed]);
    return new Promise((resolve) => {
      this._unansweredTabs.push(resolve);
    });
  }

  /** MakeCode answering the oldest open request still unanswered: acknowledged when `acknowledged`, else refused. */
  answerOpen(acknowledged: boolean): void {
    this._unansweredOpens.shift()?.(acknowledged);
  }

  /** MakeCode answering every tabs request still unanswered with `tabs`, holding later ones. */
  answerTabs(tabs: readonly SimxEditorTab[]): void {
    for (const answer of this._unansweredTabs.splice(0)) answer([...tabs]);
  }

  /** MakeCode listing `tabs` from now on, answering every tabs request still unanswered with them. */
  listTabs(tabs: readonly SimxEditorTab[]): void {
    this._listed = tabs;
    this.answerTabs(tabs);
  }
}
