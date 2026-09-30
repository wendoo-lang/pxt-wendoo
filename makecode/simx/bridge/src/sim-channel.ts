/**
 * The simulator message channel of this simulator extension: the key its
 * registration carries in each MakeCode target's `approvedRepoLib`. MakeCode
 * routes a program's messages on this channel to this extension's frame, and
 * names the channel in the frame URL's `channel` parameter; this is the
 * channel of a frame whose URL names none.
 */
export const SIMX_CHANNEL = "wendoo-lang/pxt-wendoo";

/**
 * Newest version of the channel framing this simulator extension reads. The
 * program's Wendoo extension declares the version it speaks in every message
 * it posts; a message declaring this version or an older one is read, and a
 * newer one is rejected with {@link SimChannelErrorCode.VERSION_NEWER}.
 */
export const SIM_CHANNEL_VERSION = 1;

/** Stable codes of the messages from the program that {@link connectSimChannel} rejects. */
export const SimChannelErrorCode = {
  /**
   * The message declared a channel version newer than
   * {@link SIM_CHANNEL_VERSION}. The remedy is updating this simulator
   * extension.
   */
  VERSION_NEWER: "SIM_CHANNEL_VERSION_NEWER",
  /** The message does not begin with a channel version declaration. */
  FRAME_MALFORMED: "SIM_CHANNEL_FRAME_MALFORMED",
} as const;

/** Union of all {@link SimChannelErrorCode} values. */
export type SimChannelErrorCode = (typeof SimChannelErrorCode)[keyof typeof SimChannelErrorCode];

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

/** A channel version declaration: a decimal integer from 1, without leading zeros. */
const VERSION_DECLARATION = /^[1-9][0-9]*$/;

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
 * The conversation with the running MakeCode program over one simulator
 * message channel.
 *
 * Every message the program posts is one frame, read as UTF-8 text: the
 * channel version its Wendoo extension declares in decimal, a line feed, then
 * the payload. A frame whose payload is empty is the ping the extension posts
 * when the program starts, and is ignored; any other payload is the
 * serialized tile catalog. Every message posted to the program is a request
 * for the catalog, and carries no bytes.
 */
export interface SimChannel {
  /**
   * Subscribe to catalogs the program posts in frames this extension reads,
   * each delivered with the channel version its frame declared. Returns an
   * unsubscribe function.
   */
  onCatalog(listener: (catalog: string, version: number) => void): () => void;
  /** Subscribe to the frames this extension rejects, each reported by its code. Returns an unsubscribe function. */
  onRejected(listener: (code: SimChannelErrorCode) => void): () => void;
  /** Ask the program to post its catalog. A program whose vocabulary is not registered yet answers once it is. */
  requestCatalog(): void;
  /** Stop listening to `frame`. */
  dispose(): void;
}

/**
 * Open the conversation with the running MakeCode program through `frame`,
 * on `channel`. Messages on other channels are ignored.
 *
 * @param frame - The window this simulator extension runs in.
 * @param channel - The simulator message channel; defaults to {@link SIMX_CHANNEL}.
 */
export function connectSimChannel(frame: SimxFrame, channel: string = SIMX_CHANNEL): SimChannel {
  const catalogListeners = new Set<(catalog: string, version: number) => void>();
  const rejectionListeners = new Set<(code: SimChannelErrorCode) => void>();
  const decoder = new TextDecoder();
  const reject = (code: SimChannelErrorCode): void => {
    for (const listener of rejectionListeners) {
      listener(code);
    }
  };
  const receive = (event: { data: unknown }): void => {
    const packet = event.data as Partial<MessagePacket> | null;
    if (packet?.type !== "messagepacket" || packet.channel !== channel) {
      return;
    }
    const text = decoder.decode(packet.data);
    const lineEnd = text.indexOf("\n");
    const declaration = lineEnd < 0 ? "" : text.slice(0, lineEnd);
    if (!VERSION_DECLARATION.test(declaration)) {
      reject(SimChannelErrorCode.FRAME_MALFORMED);
      return;
    }
    const version = Number(declaration);
    if (version > SIM_CHANNEL_VERSION) {
      reject(SimChannelErrorCode.VERSION_NEWER);
      return;
    }
    const catalog = text.slice(lineEnd + 1);
    if (catalog.length === 0) {
      // The program's ping, which carries nothing to read.
      return;
    }
    for (const listener of catalogListeners) {
      listener(catalog, version);
    }
  };
  frame.addEventListener("message", receive);

  return {
    onCatalog(listener) {
      catalogListeners.add(listener);
      return () => {
        catalogListeners.delete(listener);
      };
    },
    onRejected(listener) {
      rejectionListeners.add(listener);
      return () => {
        rejectionListeners.delete(listener);
      };
    },
    requestCatalog() {
      const request: MessagePacket = { type: "messagepacket", channel, data: new Uint8Array(0) };
      frame.parent.postMessage(request, "*");
    },
    dispose() {
      frame.removeEventListener("message", receive);
    },
  };
}
