/**
 * The simulator message channel between this extension and the Wendoo
 * simulator extension: the channel's framing, every message this extension
 * posts on it, and the handler of every message it receives on it.
 *
 * Each message this extension posts is one frame, as UTF-8 bytes:
 * {@link SIM_CHANNEL_VERSION} in decimal, a line feed, then the payload. The
 * payload tells the frame's kind:
 *
 * - the catalog frame carries the catalog payload {@link serializeCatalog}
 *   renders, which is never empty;
 * - the ping frame carries an empty payload. This file's top-level code
 *   posts it once, when the program starts, before any user code runs.
 *
 * Each message the simulator extension posts is a catalog request when it
 * carries no bytes, and a program update otherwise, framed as
 * {@link receiveSimMessage} reads it.
 *
 * Messages are posted and received in the simulator only; on hardware
 * nothing is.
 *
 * Keep this file last in the extension's pxt.json `files`, so the handler is
 * listening and the ping is posted after every other file of the extension
 * has initialized.
 */
namespace wendoo {
  /**
   * Version of the simulator message channel framing this extension speaks,
   * declared in every message it posts, and the newest it reads.
   */
  export const SIM_CHANNEL_VERSION = 1;

  /** A program update declared a channel version newer than {@link SIM_CHANNEL_VERSION}. */
  export const SIM_CHANNEL_VERSION_NEWER = "SIM_CHANNEL_VERSION_NEWER";

  /** A program update does not begin with a channel version declaration, or does not follow the framing. */
  export const SIM_CHANNEL_FRAME_MALFORMED = "SIM_CHANNEL_FRAME_MALFORMED";

  /**
   * The simulator message channel of the Wendoo simulator extension: the key
   * of its `approvedRepoLib` registration in each MakeCode target.
   */
  const SIMX_CHANNEL = "wendoo-lang/pxt-wendoo";

  /** Byte value of the line feed ending a channel version declaration. */
  const LINE_FEED = 0x0a;

  /** Post one frame carrying `payload` on {@link SIMX_CHANNEL}. */
  function postFrame(payload: string): void {
    control.simmessages.send(SIMX_CHANNEL, Buffer.fromUTF8(`${SIM_CHANNEL_VERSION}\n${payload}`), false);
  }

  /** Icon encoder of the host target, once {@link publishCatalog} has published the catalog. */
  let catalogIcons: CatalogIconEncoder;

  /**
   * Post the catalog payload of the current registration set to the Wendoo
   * simulator extension, and from then on answer every catalog request the
   * simulator extension sends by posting a freshly serialized catalog the
   * same way. The first call publishes; every later call in the same program
   * run does nothing. In the simulator only; on hardware it does nothing.
   *
   * @param icons - Icon encoder of the host target.
   */
  //% shim=TD_NOOP
  export function publishCatalog(icons: CatalogIconEncoder): void {
    if (catalogIcons) {
      return;
    }
    catalogIcons = icons;
    postFrame(serializeCatalog(icons));
  }

  /** Post a freshly serialized catalog, encoding icons with `icons`. In the simulator only. */
  //% shim=TD_NOOP
  function postCatalog(icons: CatalogIconEncoder): void {
    postFrame(serializeCatalog(icons));
  }

  /**
   * The channel version `bytes` declare before the line feed at `lineEnd`: a
   * decimal integer from 1 without leading zeros, or -1 when the bytes
   * before it are not one.
   */
  function declaredVersion(bytes: number[], lineEnd: number): number {
    if (lineEnd < 1 || bytes[0] === 0x30) {
      return -1;
    }
    let version = 0;
    for (let i = 0; i < lineEnd; i++) {
      if (bytes[i] < 0x30 || bytes[i] > 0x39) {
        return -1;
      }
      version = version * 10 + (bytes[i] - 0x30);
    }
    return version;
  }

  /** Log the refusal of a message from the simulator extension as `wendoo sim-channel-rejected <code>`. */
  function refuse(code: string): void {
    console.log(`wendoo sim-channel-rejected ${code}`);
  }

  /**
   * Handle one message the Wendoo simulator extension posted on the
   * channel; MakeCode delivers every such message to it.
   *
   * A message carrying no bytes is a catalog request: once
   * {@link publishCatalog} has published, a freshly serialized catalog is
   * posted, and before then nothing is. Any other message is a program
   * update: the channel version in decimal and a line feed, then the
   * program's document id, name, and source hash, each a ULEB128 byte length
   * followed by that many UTF-8 bytes, then the program's byte length as a
   * ULEB128 followed by the program bytes -- none for a removal. The update
   * is queued for the next program host drain ({@link queueProgramUpdate});
   * nothing is decoded or run here. An update declaring a newer channel
   * version than {@link SIM_CHANNEL_VERSION}, or not following the framing,
   * is refused and logged as `wendoo sim-channel-rejected <code>`.
   *
   * @param message - The message bytes.
   */
  //% hidden
  export function receiveSimMessage(message: Buffer): void {
    if (message.length === 0) {
      if (catalogIcons) {
        postCatalog(catalogIcons);
      }
      return;
    }
    const bytes = message.toArray(NumberFormat.UInt8LE);
    const lineEnd = bytes.indexOf(LINE_FEED);
    const version = declaredVersion(bytes, lineEnd);
    if (version < 0) {
      refuse(SIM_CHANNEL_FRAME_MALFORMED);
      return;
    }
    if (version > SIM_CHANNEL_VERSION) {
      refuse(SIM_CHANNEL_VERSION_NEWER);
      return;
    }
    const r = new ByteReader(bytes.slice(lineEnd + 1));
    const documentId = r.varString();
    const name = r.varString();
    const sourceHash = r.varString();
    const length = r.varUint();
    const program: number[] = [];
    for (let i = 0; i < length && !r.failed(); i++) {
      program.push(r.u8());
    }
    if (r.failed()) {
      refuse(SIM_CHANNEL_FRAME_MALFORMED);
      return;
    }
    queueProgramUpdate(documentId, name, sourceHash, Buffer.fromArray(program));
  }

  /** Hand every message on {@link SIMX_CHANNEL} to {@link receiveSimMessage}. In the simulator only. */
  //% shim=TD_NOOP
  function listen(): void {
    control.simmessages.onReceived(SIMX_CHANNEL, receiveSimMessage);
  }

  /** Post the ping frame. In the simulator only; on hardware it does nothing. */
  //% shim=TD_NOOP
  function postPing(): void {
    postFrame("");
  }

  listen();
  postPing();
}
