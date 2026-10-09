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
 * One program update for the running program: the latest compiled form of
 * one program, or the program's removal.
 */
export interface ProgramUpdate {
  /** The program's document id. */
  documentId: string;
  /** The program's display name; any text, including empty. Empty for a removal. */
  name: string;
  /** `brainSourceHash` of the source the program was compiled from. Empty for a removal. */
  sourceHash: string;
  /** The compiled program, in the binary form the MakeCode Wendoo VM loads. Empty for a removal. */
  bytecode: Uint8Array;
}

/** `value` as a ULEB128 unsigned integer: seven bits per byte, least significant group first. */
function varUint(value: number): number[] {
  const out: number[] = [];
  let rest = value;
  while (rest >= 0x80) {
    out.push((rest % 0x80) | 0x80);
    rest = Math.floor(rest / 0x80);
  }
  out.push(rest);
  return out;
}

/** The frame {@link SimChannel.postProgramUpdate} posts for `update`. */
function programUpdateFrame(update: ProgramUpdate): Uint8Array {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [encoder.encode(`${SIM_CHANNEL_VERSION}\n`)];
  for (const text of [update.documentId, update.name, update.sourceHash]) {
    const bytes = encoder.encode(text);
    parts.push(Uint8Array.from(varUint(bytes.length)), bytes);
  }
  parts.push(Uint8Array.from(varUint(update.bytecode.length)), update.bytecode);
  const frame = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    frame.set(part, offset);
    offset += part.length;
  }
  return frame;
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
 * The conversation with the running MakeCode program over one simulator
 * message channel.
 *
 * Every message the program posts is one frame, read as UTF-8 text: the
 * channel version its Wendoo extension declares in decimal, a line feed, then
 * the payload. A frame whose payload is empty is the ping the extension posts
 * when the program starts; any other payload is the serialized tile catalog.
 *
 * A message posted to the program that carries no bytes is a request for the
 * catalog. Any other is a program update, framed as {@link postProgramUpdate}
 * describes.
 */
export interface SimChannel {
  /**
   * Subscribe to catalogs the program posts in frames this extension reads,
   * each delivered with the channel version its frame declared. Returns an
   * unsubscribe function.
   */
  onCatalog(listener: (catalog: string, version: number) => void): () => void;
  /**
   * Subscribe to the program's starts, each announced by the ping of a frame
   * this extension reads. Returns an unsubscribe function.
   */
  onProgramStart(listener: () => void): () => void;
  /** Subscribe to the frames this extension rejects, each reported by its code. Returns an unsubscribe function. */
  onRejected(listener: (code: SimChannelErrorCode) => void): () => void;
  /** Ask the program to post its catalog. A program whose vocabulary is not registered yet answers once it is. */
  requestCatalog(): void;
  /**
   * Post `update` to the program, as one frame declaring
   * {@link SIM_CHANNEL_VERSION}: the version in decimal and a line feed, then
   * the document id, the name, and the source hash, each as its UTF-8 byte
   * length in ULEB128 followed by those bytes, then the program's byte length
   * in ULEB128 followed by the program bytes, verbatim.
   */
  postProgramUpdate(update: ProgramUpdate): void;
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
  const startListeners = new Set<() => void>();
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
      for (const listener of startListeners) {
        listener();
      }
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
    onProgramStart(listener) {
      startListeners.add(listener);
      return () => {
        startListeners.delete(listener);
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
    postProgramUpdate(update) {
      const message: MessagePacket = { type: "messagepacket", channel, data: programUpdateFrame(update) };
      frame.parent.postMessage(message, "*");
    },
    dispose() {
      frame.removeEventListener("message", receive);
    },
  };
}
