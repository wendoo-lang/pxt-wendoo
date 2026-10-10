import type { MakeCodeMessagePort } from "@wendoo/makecode-session";
import { SIMXEDITOR_PORT_MESSAGE_TYPE } from "../../vendor/simxeditor.js";
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

  /** MakeCode delivering the catalog message the running program posted, framed under the channel version. */
  programPosts(catalog: string): void {
    const packet = {
      type: "messagepacket",
      broadcast: true,
      channel: SIMX_CHANNEL,
      data: new TextEncoder().encode(`${SIM_CHANNEL_VERSION}\n${catalog}`),
      srcFrameIndex: 0,
    };
    this.deliver({ data: packet, origin: PARENT_ORIGIN, ports: [] });
  }

  /** MakeCode delivering the ping the running program posts when it starts: a frame with an empty payload. */
  programPings(): void {
    this.programPosts("");
  }

  /** MakeCode brokering `port` to this frame, posting it from `origin`. */
  brokerPort(port: MakeCodeMessagePort, origin = PARENT_ORIGIN): void {
    this.deliver({ data: { type: SIMXEDITOR_PORT_MESSAGE_TYPE, key: SIMX_CHANNEL }, origin, ports: [port] });
  }

  /** Delivers `event` to every message listener. */
  deliver(event: SimxPortFrameEvent): void {
    for (const listener of this._listeners) listener(event);
  }
}
