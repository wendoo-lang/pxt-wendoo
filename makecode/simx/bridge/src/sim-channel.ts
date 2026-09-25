/**
 * The simulator message channel of this simulator extension: the key its
 * registration carries in each MakeCode target's `approvedRepoLib`. MakeCode
 * routes a program's messages on this channel to this extension's frame.
 */
export const SIMX_CHANNEL = "wendoo-lang/pxt-wendoo";

/**
 * One message on a simulator message channel, as MakeCode carries it between
 * the running program and a simulator extension frame.
 */
interface MessagePacket {
  type: "messagepacket";
  /** Channel the message travels on. */
  channel: string;
  /** Message bytes. */
  data: Uint8Array;
}

/**
 * The window this simulator extension runs in: the message events MakeCode
 * delivers to it, and the parent window it posts to MakeCode through.
 */
export interface SimxFrame {
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  removeEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  readonly parent: { postMessage(message: unknown, targetOrigin: string): void };
}

/**
 * The conversation with the running MakeCode program over {@link SIMX_CHANNEL}.
 * Every message the program posts is a serialized tile catalog; every
 * message posted to the program is a request for one.
 */
export interface SimChannel {
  /**
   * Subscribe to catalogs the program posts, each delivered as the text of the
   * message's UTF-8 bytes. Returns an unsubscribe function.
   */
  onCatalog(listener: (catalog: string) => void): () => void;
  /** Ask the program to post its catalog. A program whose vocabulary is not registered yet answers once it is. */
  requestCatalog(): void;
  /** Stop listening to `frame`. */
  dispose(): void;
}

/**
 * Open the conversation with the running MakeCode program through `frame`.
 * Messages on channels other than {@link SIMX_CHANNEL} are ignored.
 */
export function connectSimChannel(frame: SimxFrame): SimChannel {
  const listeners = new Set<(catalog: string) => void>();
  const decoder = new TextDecoder();
  const receive = (event: { data: unknown }): void => {
    const packet = event.data as Partial<MessagePacket> | null;
    if (packet?.type !== "messagepacket" || packet.channel !== SIMX_CHANNEL) {
      return;
    }
    const catalog = decoder.decode(packet.data);
    for (const listener of listeners) {
      listener(catalog);
    }
  };
  frame.addEventListener("message", receive);

  return {
    onCatalog(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    requestCatalog() {
      const request: MessagePacket = { type: "messagepacket", channel: SIMX_CHANNEL, data: new Uint8Array(0) };
      frame.parent.postMessage(request, "*");
    },
    dispose() {
      frame.removeEventListener("message", receive);
    },
  };
}
