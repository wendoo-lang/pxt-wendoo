/**
 * The simulator message channel between this extension and the Wendoo
 * simulator extension: the channel's framing and every message this
 * extension posts on it.
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
 * Messages are posted in the simulator only; on hardware nothing is posted.
 *
 * Keep this file last in the extension's pxt.json `files`, so the ping is
 * posted after every other file of the extension has initialized.
 */
namespace wendoo {
  /**
   * Version of the simulator message channel framing this extension speaks,
   * declared in every message it posts.
   */
  export const SIM_CHANNEL_VERSION = 1;

  /**
   * The simulator message channel of the Wendoo simulator extension: the key
   * of its `approvedRepoLib` registration in each MakeCode target.
   */
  const SIMX_CHANNEL = "wendoo-lang/pxt-wendoo";

  /** Post one frame carrying `payload` on {@link SIMX_CHANNEL}. */
  function postFrame(payload: string): void {
    control.simmessages.send(SIMX_CHANNEL, Buffer.fromUTF8(`${SIM_CHANNEL_VERSION}\n${payload}`), false);
  }

  /**
   * Post the catalog payload of the current registration set to the Wendoo
   * simulator extension, and from then on answer every message the simulator
   * extension sends by posting a freshly serialized catalog the same way.
   * Call it once, right after the registration drain. In the simulator only;
   * on hardware it does nothing.
   *
   * @param icons - Icon encoder of the host target.
   */
  //% shim=TD_NOOP
  export function publishCatalog(icons: CatalogIconEncoder): void {
    const post = () => {
      postFrame(serializeCatalog(icons));
    };
    post();
    control.simmessages.onReceived(SIMX_CHANNEL, (request: Buffer) => {
      post();
    });
  }

  /** Post the ping frame. In the simulator only; on hardware it does nothing. */
  //% shim=TD_NOOP
  function postPing(): void {
    postFrame("");
  }

  postPing();
}
