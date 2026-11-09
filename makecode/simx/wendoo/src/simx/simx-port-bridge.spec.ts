import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { PeerSessionErrorCode } from "@wendoo/bridge-app/peer-session";
import { BrainDef, CoreHostActions, mkActuatorTileId, mkSensorTileId } from "@wendoo/core/app";
import type { BrainPageDef, BrainRuleDef } from "@wendoo/core/brain/model";
import {
  brainSourceHash,
  connectMakeCodeSession,
  MAKECODE_SESSION_PROTOCOL_VERSION,
  type MakeCodeAsset,
  type MakeCodeBrainSummary,
  MakeCodeBrainsErrorCode,
  type MakeCodeIdManifest,
  type MakeCodeManifestReading,
  type MakeCodeProjectInfo,
  type MakeCodeSession,
  type MakeCodeSessionMessage,
  type MakeCodeWireBrainSource,
  type MakeCodeWireCompileOutcome,
  messagePortSessionPort,
} from "@wendoo/makecode-session";
import { buildAuthoringEnvironment } from "../authoring/authoring-environment.js";
import { serializeBrainSource } from "../authoring/brain-source.js";
import type { ProjfsClient } from "../vendor/projfs.js";
import { BRAINS_MODULE_FILE, readBrainsModule } from "./brains-module.js";
import { IDS_MODULE_FILE, readIdsModule, writeIdsModule } from "./ids-module.js";
import { decodeImageHex } from "./image-buffer.js";
import { SIM_CHANNEL_VERSION, SIMX_CHANNEL, SimChannelErrorCode } from "./sim-channel.js";
import { type SimxPortBridge, startSimxPortBridge } from "./simx-bridge.js";
import { imageSvg } from "./svg-image.js";
import { targetIconPalette } from "./target-icon-palettes.js";
import { FakeAssetProvider, listedImage, listedSong } from "./test-support/asset-provider.js";
import { pixelImage } from "./test-support/image-buffer-encoder.js";
import { FakePortFrame, FakeTabOpener, PARENT_ORIGIN } from "./test-support/port-frame.js";
import { postedProgramUpdates } from "./test-support/program-update-frame.js";
import { FakeProjfsHost, PROJFS_SCOPE_QUOTA_BYTES } from "./test-support/projfs-host.js";

/** How long a wait in these specs lasts before it fails, in milliseconds. */
const WAIT_MS = 2000;

/** How long a spec watches a port to see that nothing arrives on it, in milliseconds. */
const QUIET_MS = 50;

/** Project-file watch timings short enough for several subscription retries to fit in {@link QUIET_MS}. */
const WATCH_TIMINGS = { retryDelayMs: 2, maxRetryDelayMs: 8, debounceMs: 5 };

/**
 * A catalog document exercising characters a message must carry intact:
 * quotes, backslashes, escape sequences written as text, control characters,
 * and non-ASCII code units including a surrogate pair.
 */
const CATALOG_TEXT =
  '{"packs":[{"name":"beacon","tiles":[{"name":"say \\"hi\\"","kind":"actuator","docs":"line\\nnext \\u00e9"}]}]}' +
  "\t\r\n\u0001 café 😀 \\";

/** The key of an editor tab whose registration names this simulator extension's frame as its own. */
const DESIGNER_TAB = "owner/repo-designer";

/** The key of the arcade front door, whose registration carries the Wendoo editor tab. */
const ARCADE_TAB = "wendoo-lang/pxt-wendoo/makecode/extensions/arcade";

/** The hello the editor's side of a makecode session at this build's version sends. */
const MAKECODE_HELLO: MakeCodeSessionMessage = {
  type: "makecode:hello",
  payload: { protocolVersion: MAKECODE_SESSION_PROTOCOL_VERSION },
};

/** Resolves with `read()` once `predicate` holds for it, polling until {@link WAIT_MS}. */
async function eventually<T>(read: () => T, predicate: (value: T) => boolean, what: string): Promise<T> {
  const deadline = Date.now() + WAIT_MS;
  for (;;) {
    const value = read();
    if (predicate(value)) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/** Resolves after `ms` milliseconds, {@link QUIET_MS} when omitted. */
function quiet(ms = QUIET_MS): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The `makecode:catalog` message publishing `content`. */
function catalogMessage(content: string): MakeCodeSessionMessage {
  return { type: "makecode:catalog", payload: { content } };
}

/** The `makecode:manifest` message publishing `reading`. */
function manifestMessage(reading: MakeCodeManifestReading): MakeCodeSessionMessage {
  return { type: "makecode:manifest", payload: reading };
}

/** A message the editor's end of a port received, as the spec reads it. */
interface ReceivedMessage {
  readonly type: string;
  readonly id?: string;
  readonly payload?: unknown;
}

/** What an editor session over a port received from the simulator extension. */
interface Received {
  catalogs: string[];
  assets: MakeCodeAsset[][];
  projectInfo: MakeCodeProjectInfo[];
}

/** The message type of a brains publication. */
const BRAINS_PUBLICATION = "makecode:brains";

/**
 * The editor's end of a port brokered to the simulator extension, driven raw
 * by the spec: it records every message arriving, and the spec reads them in
 * order, the brains publications apart.
 */
class RawEditor {
  /** Every message arrived, in order. */
  readonly arrived: ReceivedMessage[] = [];
  /** The brains each brains publication arrived carried, in order. */
  readonly brains: MakeCodeBrainSummary[][] = [];
  private _read = 0;
  private readonly _port: MessagePort;

  constructor(port: MessagePort) {
    this._port = port;
    port.addEventListener("message", (event) => {
      const message = event.data as ReceivedMessage;
      this.arrived.push(message);
      if (message.type === BRAINS_PUBLICATION) {
        this.brains.push((message.payload as { brains: MakeCodeBrainSummary[] }).brains);
      }
    });
    port.start();
  }

  /** Sends `message` to the simulator extension as it is. */
  send(message: object): void {
    this._port.postMessage(message);
  }

  /** Resolves with the first message not read yet other than a brains publication, once it has arrived. */
  async nextMessage(): Promise<ReceivedMessage> {
    for (;;) {
      await eventually(
        () => this.arrived.length,
        (count) => count > this._read,
        "the next message"
      );
      const message = this.arrived[this._read];
      this._read += 1;
      if (message.type !== BRAINS_PUBLICATION) return message;
    }
  }

  /** Resolves with the brains the next brains publication carries, once one arrives after the `seen` ones before it. */
  async nextBrains(seen: number): Promise<MakeCodeBrainSummary[]> {
    await eventually(
      () => this.brains.length,
      (count) => count > seen,
      "the next brains publication"
    );
    return this.brains[seen];
  }

  /** The messages other than brains publications arrived and not read yet. */
  unread(): ReceivedMessage[] {
    return this.arrived.slice(this._read).filter((message) => message.type !== BRAINS_PUBLICATION);
  }
}

/**
 * Reads `catalog`, then the manifest following it, as the next two messages
 * arriving at `editor`; resolves with the manifest's reading.
 */
async function nextCatalog(editor: RawEditor, catalog: string): Promise<MakeCodeManifestReading> {
  assert.deepEqual(await editor.nextMessage(), catalogMessage(catalog));
  const manifest = await editor.nextMessage();
  assert.equal(manifest.type, "makecode:manifest");
  return manifest.payload as MakeCodeManifestReading;
}

describe("simx port bridge", () => {
  let host: FakeProjfsHost;
  let assets: FakeAssetProvider;
  let clients: ProjfsClient[];
  let bridges: SimxPortBridge[];
  let openers: FakeTabOpener[];
  let channels: MessageChannel[];
  let sessions: MakeCodeSession[];
  let errors: string[];

  beforeEach(() => {
    host = new FakeProjfsHost();
    assets = new FakeAssetProvider();
    clients = [];
    bridges = [];
    openers = [];
    channels = [];
    sessions = [];
    errors = [];
  });

  afterEach(() => {
    for (const session of sessions) session.dispose();
    for (const bridge of bridges) bridge.dispose();
    for (const client of clients) client.dispose();
    for (const channel of channels) {
      channel.port1.close();
      channel.port2.close();
    }
  });

  /**
   * Starts the port bridge in a fresh frame over the spec's project and asset
   * provider, with a fresh tab opener, declaring the arcade target and
   * reading the program's messages on `channel` when one is given.
   */
  function start(channel?: string): FakePortFrame {
    const frame = new FakePortFrame();
    const opener = new FakeTabOpener();
    openers.push(opener);
    const files = host.client();
    clients.push(files);
    const log = {
      info() {},
      error(message: string) {
        errors.push(message);
      },
    };
    bridges.push(
      startSimxPortBridge({
        frame,
        parentOrigin: PARENT_ORIGIN,
        files,
        assets,
        log,
        target: "arcade",
        channel,
        fileWatchTimings: WATCH_TIMINGS,
        opener,
      })
    );
    return frame;
  }

  /** A new message channel, closed by the spec's cleanup. */
  function channel(): MessageChannel {
    const created = new MessageChannel();
    channels.push(created);
    return created;
  }

  /**
   * Brokers a fresh port pair to `frame` from `origin` and opens the editor's
   * makecode session over the other end, recording what it receives.
   */
  async function editorOver(
    frame: FakePortFrame,
    origin = PARENT_ORIGIN
  ): Promise<{ session: MakeCodeSession; received: Received }> {
    const { port1, port2 } = channel();
    frame.brokerPort(port1, origin);
    const session = await connectMakeCodeSession({ port: messagePortSessionPort(port2) });
    sessions.push(session);
    const received: Received = { catalogs: [], assets: [], projectInfo: [] };
    session.onCatalog((content) => received.catalogs.push(content));
    session.onAssets((assets) => received.assets.push(assets));
    session.onProjectInfo((info) => received.projectInfo.push(info));
    return { session, received };
  }

  /** Every message arriving on the editor's end of a port brokered to `frame` from `origin`, recorded as it arrives. */
  function rawPort(frame: FakePortFrame, origin = PARENT_ORIGIN): { port: MessagePort; arrived: unknown[] } {
    const { port1, port2 } = channel();
    const arrived: unknown[] = [];
    port2.addEventListener("message", (event) => arrived.push(event.data));
    port2.start();
    frame.brokerPort(port1, origin);
    return { port: port2, arrived };
  }

  /**
   * Brokers a fresh port pair to `frame` for the editor tab keyed `peer`, the
   * frame's own by default, through `broker`, and runs the editor's side of
   * the makecode handshake over the other end raw: sends the editor's hello
   * and reads the simulator extension's. Resolves with the editor's end.
   */
  async function joinRaw(
    frame: FakePortFrame,
    peer = SIMX_CHANNEL,
    broker = (port: MessagePort): void => frame.brokerPort(port, PARENT_ORIGIN, peer)
  ): Promise<RawEditor> {
    const { port1, port2 } = channel();
    const editor = new RawEditor(port2);
    broker(port1);
    editor.send(MAKECODE_HELLO);
    assert.equal((await editor.nextMessage()).type, "makecode:hello");
    return editor;
  }

  /**
   * Joins a raw editor to `frame` for the editor tab keyed `peer`, as
   * {@link joinRaw}, and reads `catalog`, then the manifest, as the first
   * messages after the hello.
   */
  async function joinEditor(frame: FakePortFrame, catalog: string, peer = SIMX_CHANNEL): Promise<RawEditor> {
    const editor = await joinRaw(frame, peer);
    await nextCatalog(editor, catalog);
    return editor;
  }

  /**
   * Joins a raw editor to `frame`, which holds no catalog, as {@link joinRaw},
   * and reads the manifest of a project holding none as the first message
   * after the hello.
   */
  async function joinBare(frame: FakePortFrame): Promise<RawEditor> {
    const editor = await joinRaw(frame);
    assert.deepEqual(await editor.nextMessage(), manifestMessage({ manifest: null }));
    return editor;
  }

  /** Resolves once {@link QUIET_MS} have passed with nothing more arriving at `editor`. */
  async function nothingMore(editor: RawEditor): Promise<void> {
    await quiet();
    assert.deepEqual(editor.unread(), []);
  }

  /** Sends `editor` a brains list request under `id` and resolves with the reply's type and listed ids. */
  async function listedBrains(editor: RawEditor, id: string): Promise<{ type: string; ids: string[] }> {
    editor.send({ type: "makecode:brainsList", id });
    const reply = await editor.nextMessage();
    assert.equal(reply.id, id);
    const brains = (reply.payload as { brains: { id: string }[] }).brains;
    return { type: reply.type, ids: brains.map((brain) => brain.id) };
  }

  it("serves a session over a port MakeCode brokers: the target declared, the catalog, assets and project info published, brains listed from the project", async () => {
    assets.images = [listedImage("image1", [[1, 2]], "hero")];
    assets.answer();
    const frame = start();
    frame.programPosts('{"packs":[]}');

    const { session, received } = await editorOver(frame);
    await eventually(
      () => received.projectInfo.length,
      (count) => count > 0,
      "the project info"
    );

    assert.equal(session.peerTarget, "arcade");
    assert.deepEqual(received.catalogs, ['{"packs":[]}']);
    assert.equal(received.assets.length, 1);
    assert.deepEqual(
      received.assets[0].map((asset) => [asset.kind, asset.id]),
      [["image", "image1"]]
    );
    assert.equal(typeof received.projectInfo[0].name, "string");
    assert.deepEqual(await session.listBrains(), []);
  });

  it("ignores a port posted from another origin", async () => {
    const frame = start();

    const { arrived } = rawPort(frame, "https://elsewhere.example");
    await quiet();

    assert.deepEqual(arrived, []);
  });

  it("ignores a message of another type carrying a port", async () => {
    const frame = start();
    const { port1, port2 } = channel();
    const arrived: unknown[] = [];
    port2.addEventListener("message", (event) => arrived.push(event.data));
    port2.start();

    frame.deliver({ data: { type: "simxeditor", event: "shown" }, origin: PARENT_ORIGIN, ports: [port1] });
    await quiet();

    assert.deepEqual(arrived, []);
  });

  describe("editor tabs", () => {
    it("serves a session per tab MakeCode names on its port, publishing the catalog, the asset snapshot and the name into each, now and as they change", async () => {
      assets.images = [listedImage("image1", [[1, 2]])];
      assets.answer();
      const frame = start();
      frame.programPosts("{}");

      const own = await joinEditor(frame, "{}");
      const designer = await joinEditor(frame, "{}", DESIGNER_TAB);

      for (const editor of [own, designer]) {
        const snapshot = await editor.nextMessage();
        assert.equal(snapshot.type, "makecode:assets");
        assert.deepEqual(
          (snapshot.payload as { assets: MakeCodeAsset[] }).assets.map((asset) => asset.id),
          ["image1"]
        );
        assert.deepEqual(await editor.nextMessage(), {
          type: "makecode:projectInfo",
          payload: { name: assets.name },
        });
      }
      frame.programPosts(CATALOG_TEXT);
      assets.name = "Space Chase";
      assets.change();
      for (const editor of [own, designer]) {
        await nextCatalog(editor, CATALOG_TEXT);
        assert.deepEqual(await editor.nextMessage(), {
          type: "makecode:projectInfo",
          payload: { name: "Space Chase" },
        });
      }
    });

    it("ends the session of the tab a new port names, serving that tab over the new port and keeping every other tab's", async () => {
      const frame = start();
      frame.programPosts("{}");
      const own = await joinEditor(frame, "{}");
      const designer = await joinEditor(frame, "{}", DESIGNER_TAB);

      const returned = await joinEditor(frame, "{}", DESIGNER_TAB);
      designer.send({ type: "makecode:brainsList", id: "late" });
      frame.programPosts(CATALOG_TEXT);

      await nextCatalog(own, CATALOG_TEXT);
      await nextCatalog(returned, CATALOG_TEXT);
      await nothingMore(designer);
      assert.deepEqual(await listedBrains(own, "list-own"), { type: "makecode:brainsListReply", ids: [] });
      assert.deepEqual(await listedBrains(returned, "list-returned"), { type: "makecode:brainsListReply", ids: [] });
    });

    it("keys a port whose message names no peer on the frame's own channel", async () => {
      const ownChannel = "fork-owner/fork-repo";
      const frame = start(ownChannel);
      frame.programPosts("{}", ownChannel);
      const own = await joinEditor(frame, "{}", ownChannel);
      const designer = await joinEditor(frame, "{}", DESIGNER_TAB);

      const returned = await joinRaw(frame, ownChannel, (port) => frame.brokerPortNamingNoPeer(port));
      await nextCatalog(returned, "{}");
      own.send({ type: "makecode:brainsList", id: "late" });

      await nothingMore(own);
      assert.deepEqual(await listedBrains(designer, "list-designer"), { type: "makecode:brainsListReply", ids: [] });
      assert.deepEqual(await listedBrains(returned, "list-returned"), { type: "makecode:brainsListReply", ids: [] });
    });

    it("ends every tab's session once disposed", async () => {
      const frame = start();
      frame.programPosts("{}");
      const own = await joinEditor(frame, "{}");
      const designer = await joinEditor(frame, "{}", DESIGNER_TAB);

      bridges.splice(0)[0].dispose();
      for (const editor of [own, designer]) editor.send({ type: "makecode:brainsList", id: "late" });

      await nothingMore(own);
      await nothingMore(designer);
    });
  });

  it("logs an editor hello declaring a newer protocol by its code, serving nothing over that port", async () => {
    const frame = start();
    const { port, arrived } = rawPort(frame);
    await eventually(
      () => arrived.length,
      (count) => count === 1,
      "the hello"
    );

    port.postMessage({ type: "makecode:hello", payload: { protocolVersion: MAKECODE_SESSION_PROTOCOL_VERSION + 1 } });
    await eventually(
      () => errors.length,
      (count) => count === 1,
      "the logged rejection"
    );
    port.postMessage({ type: "makecode:brainsList", id: "ignored" });
    await quiet();

    assert.ok(errors[0].startsWith(`${PeerSessionErrorCode.PROTOCOL_VERSION_NEWER}:`));
    assert.deepEqual(
      arrived.map((message) => (message as { type: string }).type),
      ["makecode:hello"]
    );
  });

  it("takes no port once disposed", async () => {
    const frame = start();
    bridges.splice(0)[0].dispose();

    const { arrived } = rawPort(frame);
    await quiet();

    assert.deepEqual(arrived, []);
  });

  it("logs a message from the program declaring a newer channel version or none by its code, and publishes no catalog older than it", async () => {
    const frame = start();
    frame.programPosts(CATALOG_TEXT);

    frame.programPosts("{}", SIMX_CHANNEL, SIM_CHANNEL_VERSION + 1);
    frame.programPostsText("{}");
    const editor = await joinBare(frame);
    await nothingMore(editor);

    assert.equal(errors.length, 2);
    assert.ok(errors[0].startsWith(SimChannelErrorCode.VERSION_NEWER));
    assert.ok(errors[1].startsWith(SimChannelErrorCode.FRAME_MALFORMED));
    frame.programPosts("{}");
    await nextCatalog(editor, "{}");
  });

  it("ignores the program's ping, before its catalog and after: it logs nothing and publishes nothing", async () => {
    const frame = start();

    frame.programPings();
    const editor = await joinBare(frame);
    await nothingMore(editor);

    frame.programPosts(CATALOG_TEXT);
    await nextCatalog(editor, CATALOG_TEXT);
    frame.programPings();
    await nothingMore(editor);
    assert.deepEqual(errors, []);
  });

  describe("project assets and tile icons", () => {
    /** A 4-bit tile icon, 1 wide and 2 tall: palette index 1 above index 2. */
    const ICON = "870401000200000021000000";

    /** A catalog of one tile whose icon is `icon`, as the program posts it. */
    function iconCatalog(icon: string): string {
      return JSON.stringify({
        packs: [{ name: "arcade", tiles: [{ name: "sensor.arcade.dpad", kind: "sensor", icon }] }],
      });
    }

    /** The catalog the editor receives for {@link iconCatalog} of `icon`, its icon rendered under the arcade target's icon palette. */
    function renderedIconCatalog(icon: string): string {
      const reading = decodeImageHex(icon);
      assert.ok(reading.image);
      const palette = targetIconPalette("arcade");
      assert.ok(palette);
      const iconUrl = imageSvg(reading.image, palette).url;
      return JSON.stringify({
        packs: [{ name: "arcade", tiles: [{ name: "sensor.arcade.dpad", kind: "sensor", iconUrl }] }],
      });
    }

    /** The `makecode:assets` message publishing `snapshot`. */
    function assetsMessage(snapshot: MakeCodeAsset[]): MakeCodeSessionMessage {
      return { type: "makecode:assets", payload: { assets: snapshot } };
    }

    /** The `makecode:projectInfo` message publishing the project's `name`. */
    function projectInfoMessage(name: string): MakeCodeSessionMessage {
      return { type: "makecode:projectInfo", payload: { name } };
    }

    /** The snapshot entry of a song `id`, named `name` when given. */
    function songEntry(id: string, name?: string): MakeCodeAsset {
      return { kind: "song", id, ...(name === undefined ? {} : { name }) };
    }

    /** The snapshot entry of a 4-bit image `id` of pixels `rows`, named `name` when given, under `palette`. */
    function snapshotEntry(id: string, rows: number[][], palette: readonly string[], name?: string): MakeCodeAsset {
      const entry: MakeCodeAsset = { kind: "image", id, width: rows[0].length, height: rows.length, previewUrl: "" };
      if (name !== undefined) entry.name = name;
      entry.previewUrl = imageSvg(pixelImage(4, rows), palette).url;
      return entry;
    }

    it("publishes the project's asset snapshot into the session once established, after the catalog, each image with its size and then each song", async () => {
      assets.images = [
        listedImage("image2", [[1, 2]], "hero"),
        listedImage("transparency16", [[0]]),
        listedImage("image1", [[3]]),
      ];
      assets.songs = [listedSong("song2"), listedSong("song1", "theme")];
      assets.answer();
      const frame = start();
      frame.programPosts("{}");
      const editor = await joinEditor(frame, "{}");

      assert.deepEqual(
        await editor.nextMessage(),
        assetsMessage([
          snapshotEntry("image1", [[3]], assets.palette),
          snapshotEntry("image2", [[1, 2]], assets.palette, "hero"),
          songEntry("song1", "theme"),
          songEntry("song2"),
        ])
      );
      assert.deepEqual(errors, []);
    });

    it("publishes the project's name into the session once established, after the asset snapshot", async () => {
      assets.answer();
      const frame = start();
      frame.programPosts("{}");
      const editor = await joinEditor(frame, "{}");

      assert.deepEqual(await editor.nextMessage(), assetsMessage([]));
      assert.deepEqual(await editor.nextMessage(), projectInfoMessage(assets.name));
    });

    it("publishes the project's name again when the project is renamed, and nothing for a change that keeps it", async () => {
      assets.answer();
      const frame = start();
      frame.programPosts("{}");
      const editor = await joinEditor(frame, "{}");
      await editor.nextMessage();
      await editor.nextMessage();

      assets.change();
      await quiet(300);
      await nothingMore(editor);
      assets.name = "Space Chase";
      assets.change();

      assert.deepEqual(await editor.nextMessage(), projectInfoMessage("Space Chase"));
      await quiet(300);
      await nothingMore(editor);
    });

    it("re-sends its current snapshot into the session over a re-brokered port", async () => {
      assets.images = [listedImage("image1", [[3]])];
      assets.answer();
      const frame = start();
      frame.programPosts("{}");
      const editor = await joinEditor(frame, "{}");
      const published = assetsMessage([snapshotEntry("image1", [[3]], assets.palette)]);
      assert.deepEqual(await editor.nextMessage(), published);

      const returned = await joinRaw(frame);

      await nextCatalog(returned, "{}");
      assert.deepEqual(await returned.nextMessage(), published);
      assert.deepEqual(await returned.nextMessage(), projectInfoMessage(assets.name));
    });

    it("publishes a new snapshot when the project's assets change, and nothing for a change that leaves the snapshot as it was", async () => {
      assets.images = [listedImage("image1", [[3]])];
      assets.answer();
      const frame = start();
      frame.programPosts("{}");
      const editor = await joinEditor(frame, "{}");
      await editor.nextMessage();
      assert.deepEqual(await editor.nextMessage(), projectInfoMessage(assets.name));

      assets.change();
      await quiet(300);
      await nothingMore(editor);
      assets.images = [listedImage("image1", [[3]]), listedImage("image3", [[4, 4]], "wall")];
      assets.change();

      assert.deepEqual(
        await editor.nextMessage(),
        assetsMessage([
          snapshotEntry("image1", [[3]], assets.palette),
          snapshotEntry("image3", [[4, 4]], assets.palette, "wall"),
        ])
      );
    });

    it("publishes the catalog with each tile icon rendered as an iconUrl under the target's icon palette, never the project's, and no icon text", async () => {
      assets.palette = ["#000000", "#00aa00", "#0000aa"];
      assets.answer();
      const frame = start();
      const editor = await joinBare(frame);
      assert.deepEqual(await editor.nextMessage(), assetsMessage([]));
      assert.deepEqual(await editor.nextMessage(), projectInfoMessage(assets.name));

      frame.programPosts(iconCatalog(ICON));

      await nextCatalog(editor, renderedIconCatalog(ICON));
    });

    it("publishes a tile whose icon it cannot read without an iconUrl, logging the icon's code, and the catalog all the same", async () => {
      assets.answer();
      const frame = start();
      const editor = await joinBare(frame);
      assert.deepEqual(await editor.nextMessage(), assetsMessage([]));
      assert.deepEqual(await editor.nextMessage(), projectInfoMessage(assets.name));

      frame.programPosts(iconCatalog("8804"));

      assert.deepEqual(
        await editor.nextMessage(),
        catalogMessage(
          JSON.stringify({ packs: [{ name: "arcade", tiles: [{ name: "sensor.arcade.dpad", kind: "sensor" }] }] })
        )
      );
      assert.equal(errors.length, 1);
      assert.ok(errors[0].startsWith("IMAGE_BUFFER_MAGIC_UNKNOWN: "));
    });

    it("re-publishes the snapshot when the project's palette changes, and never the catalog", async () => {
      assets.images = [listedImage("image1", [[1]])];
      assets.answer();
      const frame = start();
      frame.programPosts(iconCatalog(ICON));
      const editor = await joinRaw(frame);
      await nextCatalog(editor, renderedIconCatalog(ICON));
      assert.deepEqual(await editor.nextMessage(), assetsMessage([snapshotEntry("image1", [[1]], assets.palette)]));
      assert.deepEqual(await editor.nextMessage(), projectInfoMessage(assets.name));

      const recolored = ["#000000", "#00aa00", "#0000aa"];
      assets.palette = recolored;
      assets.change();

      assert.deepEqual(await editor.nextMessage(), assetsMessage([snapshotEntry("image1", [[1]], recolored)]));
      await quiet(300);
      await nothingMore(editor);
    });

    it("keeps publishing the catalog and serving brains requests when MakeCode refuses it the project's assets, logging the code", async () => {
      assets.failLists("image", "PERMISSION_DENIED");
      assets.failLists("song", "PERMISSION_DENIED");
      assets.failSubscribes("PERMISSION_DENIED");
      assets.answer();
      const frame = start();
      frame.programPosts(iconCatalog(ICON));
      const editor = await joinRaw(frame);

      await nextCatalog(editor, renderedIconCatalog(ICON));
      editor.send({ type: "makecode:brainsList", id: "list-1" });
      assert.deepEqual(await editor.nextMessage(), {
        type: "makecode:brainsListReply",
        id: "list-1",
        payload: { brains: [] },
      });
      await nothingMore(editor);
      assert.equal(errors.length, 3);
      assert.equal(
        errors.every((line) => line.startsWith("PERMISSION_DENIED: ")),
        true
      );
    });
  });

  describe("id manifest", () => {
    /** A catalog of one pack declaring the actuators `tiles`, by name. */
    function tileCatalog(...tiles: string[]): string {
      return JSON.stringify({ packs: [{ name: "beacon", tiles: tiles.map((name) => ({ name, kind: "actuator" })) }] });
    }

    /** The manifest allocating the actuators `tiles`, in order, from the base of the action space. */
    function tilesManifest(...tiles: string[]): MakeCodeIdManifest {
      return {
        actions: tiles.map((name, index) => ({ name, id: 1024 + index })),
        operators: [],
        types: [],
        next: { action: 1024 + tiles.length, operator: 1024, atom: 1024 },
      };
    }

    it("publishes into a session on establish the catalog, then the manifest allocating it, then the asset snapshot, then the name, then the brains", async () => {
      assets.answer();
      host.edit("brains/abcdabcdabcdabcd.src.json", JSON.stringify({ version: 1, id: "abcdabcdabcdabcd", pages: [] }));
      const frame = start();
      frame.programPosts(tileCatalog("actuator.beacon.flash"));

      const editor = await joinRaw(frame);
      await editor.nextBrains(0);

      assert.deepEqual(
        editor.arrived.slice(1, 6).map((message) => message.type),
        ["makecode:catalog", "makecode:manifest", "makecode:assets", "makecode:projectInfo", "makecode:brains"]
      );
      assert.deepEqual(editor.arrived[1], catalogMessage(tileCatalog("actuator.beacon.flash")));
      assert.deepEqual(editor.arrived[2], manifestMessage({ manifest: tilesManifest("actuator.beacon.flash") }));
      assert.deepEqual(
        editor.brains[0].map((brain) => brain.id),
        ["abcdabcdabcdabcd"]
      );
    });

    it("publishes the project's ids module first into a session established before any catalog", async () => {
      host.edit(IDS_MODULE_FILE, writeIdsModule(tilesManifest("actuator.chime.ring")));
      const frame = start();

      const editor = await joinRaw(frame);

      assert.deepEqual(await editor.nextMessage(), manifestMessage({ manifest: tilesManifest("actuator.chime.ring") }));
    });

    it("publishes the manifest after each later catalog, whether or not the allocation changed", async () => {
      const frame = start();
      const editor = await joinBare(frame);

      frame.programPosts(tileCatalog("actuator.beacon.flash"));
      const first = await nextCatalog(editor, tileCatalog("actuator.beacon.flash"));
      frame.programPosts(tileCatalog("actuator.beacon.flash"));
      const again = await nextCatalog(editor, tileCatalog("actuator.beacon.flash"));
      frame.programPosts(tileCatalog("actuator.beacon.flash", "actuator.beacon.dim"));
      const grown = await nextCatalog(editor, tileCatalog("actuator.beacon.flash", "actuator.beacon.dim"));

      assert.deepEqual(first, { manifest: tilesManifest("actuator.beacon.flash") });
      assert.deepEqual(again, first);
      assert.deepEqual(grown, { manifest: tilesManifest("actuator.beacon.flash", "actuator.beacon.dim") });
      assert.deepEqual(
        host.mutations.filter((mutation) => mutation === `write ${IDS_MODULE_FILE}`),
        [`write ${IDS_MODULE_FILE}`, `write ${IDS_MODULE_FILE}`]
      );
    });

    it("publishes the same manifest into every tab's session", async () => {
      const frame = start();
      const own = await joinBare(frame);
      const designer = await joinRaw(frame, DESIGNER_TAB);
      assert.deepEqual(await designer.nextMessage(), manifestMessage({ manifest: null }));

      frame.programPosts(tileCatalog("actuator.beacon.flash"));

      const readings = [
        await nextCatalog(own, tileCatalog("actuator.beacon.flash")),
        await nextCatalog(designer, tileCatalog("actuator.beacon.flash")),
      ];
      assert.deepEqual(readings, [
        { manifest: tilesManifest("actuator.beacon.flash") },
        { manifest: tilesManifest("actuator.beacon.flash") },
      ]);
    });

    it("allocates and writes ids.g.ts from a catalog the program posts with no editor attached", async () => {
      const frame = start();

      frame.programPosts(tileCatalog("actuator.beacon.flash"));

      const written = await eventually(
        () => host.file(IDS_MODULE_FILE),
        (text) => text !== undefined,
        "the ids module"
      );
      assert.deepEqual(readIdsModule(written ?? ""), { manifest: tilesManifest("actuator.beacon.flash") });
    });
  });

  describe("brains requests", () => {
    /** A brain as the editor pushes it on the wire: an empty brain document. */
    function wireBrain(id: string, name: string): MakeCodeWireBrainSource {
      return { id, name, source: JSON.stringify({ version: 1, id, name, pages: [] }, null, 2) };
    }

    /** The outcome of compiling `brain`, a source compiling clean with its program registered. */
    function cleanOutcome(brain: MakeCodeWireBrainSource): MakeCodeWireCompileOutcome {
      const sourceHash = brainSourceHash(brain.source);
      return { sourceHash, compiled: { sourceHash }, diagnostics: [], unresolvedTiles: [] };
    }

    it("compiles the editor's push and answers it with the outcome, then serves list and pull from the project", async () => {
      const frame = start();
      frame.programPosts(CATALOG_TEXT);
      const editor = await joinEditor(frame, CATALOG_TEXT);
      const chaser = wireBrain("abcdabcdabcdabcd", "Chaser");

      editor.send({ type: "makecode:brainsPush", id: "push-1", payload: { op: "write", brain: chaser } });
      assert.deepEqual(await editor.nextMessage(), {
        type: "makecode:brainsPushReply",
        id: "push-1",
        payload: cleanOutcome(chaser),
      });
      editor.send({ type: "makecode:brainsList", id: "list-1" });
      assert.deepEqual(await editor.nextMessage(), {
        type: "makecode:brainsListReply",
        id: "list-1",
        payload: {
          brains: [
            {
              id: chaser.id,
              name: "Chaser",
              sourceHash: brainSourceHash(chaser.source),
              compiledSourceHash: brainSourceHash(chaser.source),
              origin: SIMX_CHANNEL,
              originLabel: null,
            },
          ],
        },
      });
      editor.send({ type: "makecode:brainsPull", id: "pull-1", payload: { ids: [chaser.id, "absentabsentabse"] } });
      assert.deepEqual(await editor.nextMessage(), {
        type: "makecode:brainsPullReply",
        id: "pull-1",
        payload: {
          brains: [
            { ...chaser, compiledSourceHash: brainSourceHash(chaser.source), origin: SIMX_CHANNEL, originLabel: null },
          ],
        },
      });

      assert.equal(host.file(`brains/${chaser.id}.src.json`), chaser.source);
      assert.match(
        host.file("brains.g.ts") ?? "",
        /^ {4}export const p_abcdabcdabcdabcd = wendoo\.registerCompiledBrain\("abcdabcdabcdabcd", "Chaser", hex`$/m
      );
    });

    it("creates a brain the editor asks for, answering with its summary once its source is in the project", async () => {
      const frame = start();
      frame.programPosts(CATALOG_TEXT);
      const editor = await joinEditor(frame, CATALOG_TEXT);

      editor.send({ type: "makecode:brainsCreate", id: "create-1", payload: { name: "Chaser" } });
      const reply = await editor.nextMessage();

      assert.equal(reply.type, "makecode:brainsCreateReply");
      assert.equal(reply.id, "create-1");
      const { brain } = reply.payload as { brain: MakeCodeBrainSummary };
      assert.equal(brain.name, "Chaser");
      assert.equal(brain.compiledSourceHash, brain.sourceHash);
      assert.equal(brain.origin, SIMX_CHANNEL);
      assert.equal(brainSourceHash(host.file(`brains/${brain.id}.src.json`) ?? ""), brain.sourceHash);
    });

    it("stamps a brain with the key of the tab that created it, refusing another tab's push of it with NOT_ORIGIN", async () => {
      const frame = start();
      frame.programPosts(CATALOG_TEXT);
      const own = await joinEditor(frame, CATALOG_TEXT, ARCADE_TAB);
      const designer = await joinEditor(frame, CATALOG_TEXT, DESIGNER_TAB);
      own.send({ type: "makecode:brainsCreate", id: "create-1", payload: { name: "Chaser" } });
      const { brain } = (await own.nextMessage()).payload as { brain: MakeCodeBrainSummary };
      const edited = wireBrain(brain.id, "Renamed");

      designer.send({ type: "makecode:brainsPush", id: "push-1", payload: { op: "write", brain: edited } });
      const refused = await designer.nextMessage();
      designer.send({ type: "makecode:brainsPush", id: "push-2", payload: { op: "remove", brainId: brain.id } });
      const removal = await designer.nextMessage();
      own.send({ type: "makecode:brainsPush", id: "push-3", payload: { op: "write", brain: edited } });
      const applied = await own.nextMessage();

      for (const [reply, id] of [
        [refused, "push-1"],
        [removal, "push-2"],
      ] as const) {
        assert.equal(reply.type, "makecode:brainsError");
        assert.equal(reply.id, id);
        assert.equal((reply.payload as { code: string }).code, MakeCodeBrainsErrorCode.NOT_ORIGIN);
      }
      assert.equal(applied.type, "makecode:brainsPushReply");
      assert.equal(applied.id, "push-3");
      assert.equal(host.file(`brains/${brain.id}.src.json`), edited.source);
      assert.equal(errors.filter((line) => line.startsWith(MakeCodeBrainsErrorCode.NOT_ORIGIN)).length, 1);
    });

    it("labels each brain's origin by the tab MakeCode lists for its key, republishing the brains when the tabs arrive", async () => {
      const frame = start();
      frame.programPosts(CATALOG_TEXT);
      const own = await joinEditor(frame, CATALOG_TEXT, ARCADE_TAB);
      const designer = await joinEditor(frame, CATALOG_TEXT, DESIGNER_TAB);
      own.send({ type: "makecode:brainsCreate", id: "create-1", payload: { name: "Chaser" } });
      const { brain } = (await own.nextMessage()).payload as { brain: MakeCodeBrainSummary };
      designer.send({ type: "makecode:brainsCreate", id: "create-2", payload: { name: "Runner" } });
      const designed = ((await designer.nextMessage()).payload as { brain: MakeCodeBrainSummary }).brain;
      await eventually(
        () => own.brains.at(-1)?.length ?? 0,
        (count) => count === 2,
        "both brains published"
      );
      const seen = own.brains.length;

      bridges[0].setTabs([
        { key: ARCADE_TAB, label: "Wendoo" },
        { key: DESIGNER_TAB, label: "Designer" },
      ]);
      const republished = await own.nextBrains(seen);

      const labels = Object.fromEntries(
        republished.map((summary) => [summary.id, [summary.origin, summary.originLabel]])
      );
      assert.deepEqual(labels, {
        [brain.id]: [ARCADE_TAB, "Wendoo"],
        [designed.id]: [DESIGNER_TAB, "Designer"],
      });
      assert.equal(brain.originLabel, null);
    });

    it("stamps no origin for a port naming no peer, and refuses its session nothing", async () => {
      const frame = start();
      frame.programPosts(CATALOG_TEXT);
      const designer = await joinEditor(frame, CATALOG_TEXT, DESIGNER_TAB);
      const unnamed = await joinRaw(frame, SIMX_CHANNEL, (port) => frame.brokerPortNamingNoPeer(port));
      await nextCatalog(unnamed, CATALOG_TEXT);
      designer.send({ type: "makecode:brainsCreate", id: "create-1", payload: { name: "Chaser" } });
      const owned = ((await designer.nextMessage()).payload as { brain: MakeCodeBrainSummary }).brain;

      unnamed.send({ type: "makecode:brainsCreate", id: "create-2", payload: { name: "Runner" } });
      const created = await unnamed.nextMessage();
      const edited = wireBrain(owned.id, "Renamed");
      unnamed.send({ type: "makecode:brainsPush", id: "push-1", payload: { op: "write", brain: edited } });
      const pushed = await unnamed.nextMessage();

      assert.equal(created.type, "makecode:brainsCreateReply");
      assert.equal((created.payload as { brain: MakeCodeBrainSummary }).brain.origin, null);
      assert.equal(pushed.type, "makecode:brainsPushReply");
      assert.equal(host.file(`brains/${owned.id}.src.json`), edited.source);
      assert.equal(readBrainsModule(host.file(BRAINS_MODULE_FILE) ?? "").entries.get(owned.id)?.origin, DESIGNER_TAB);
    });

    describe("opening a brain in its origin", () => {
      /** Has `editor` create a brain named `name` and resolves with its summary. */
      async function created(editor: RawEditor, name: string): Promise<MakeCodeBrainSummary> {
        editor.send({ type: "makecode:brainsCreate", id: `create-${name}`, payload: { name } });
        const reply = await editor.nextMessage();
        assert.equal(reply.type, "makecode:brainsCreateReply");
        return (reply.payload as { brain: MakeCodeBrainSummary }).brain;
      }

      /** The message `editor` receives in answer to the open of the brain `id` it sends under `requestId`. */
      async function openAnswer(editor: RawEditor, requestId: string, id: string): Promise<ReceivedMessage> {
        editor.send({ type: "makecode:brainsOpen", id: requestId, payload: { id } });
        const reply = await editor.nextMessage();
        assert.equal(reply.id, requestId);
        return reply;
      }

      it("shows the origin's tab by key and publishes the brain open into the origin's session, not the requester's", async () => {
        const frame = start();
        frame.programPosts(CATALOG_TEXT);
        const own = await joinEditor(frame, CATALOG_TEXT, ARCADE_TAB);
        const designer = await joinEditor(frame, CATALOG_TEXT, DESIGNER_TAB);
        const brain = await created(designer, "Runner");
        bridges[0].setTabs([
          { key: ARCADE_TAB, label: "Wendoo" },
          { key: DESIGNER_TAB, label: "Designer" },
        ]);

        const reply = await openAnswer(own, "open-1", brain.id);

        assert.deepEqual(reply, { type: "makecode:brainsOpenReply", id: "open-1" });
        assert.deepEqual(await designer.nextMessage(), { type: "makecode:brainOpen", payload: { id: brain.id } });
        assert.deepEqual(openers[0].opened, [DESIGNER_TAB]);
        await nothingMore(own);
        await nothingMore(designer);
      });

      it("publishes the brain open of a brain with no origin back to the tab that asked, showing no tab", async () => {
        const frame = start();
        frame.programPosts(CATALOG_TEXT);
        const designer = await joinEditor(frame, CATALOG_TEXT, DESIGNER_TAB);
        const unnamed = await joinRaw(frame, SIMX_CHANNEL, (port) => frame.brokerPortNamingNoPeer(port));
        await nextCatalog(unnamed, CATALOG_TEXT);
        const brain = await created(unnamed, "Runner");
        assert.equal(brain.origin, null);

        const reply = await openAnswer(designer, "open-1", brain.id);

        assert.equal(reply.type, "makecode:brainsOpenReply");
        assert.deepEqual(await designer.nextMessage(), { type: "makecode:brainOpen", payload: { id: brain.id } });
        assert.deepEqual(openers[0].opened, []);
        await nothingMore(unnamed);
      });

      it("refuses an open by code: ORIGIN_ABSENT for an origin MakeCode does not list, UNKNOWN_BRAIN for an id it does not hold", async () => {
        const frame = start();
        frame.programPosts(CATALOG_TEXT);
        const own = await joinEditor(frame, CATALOG_TEXT, ARCADE_TAB);
        const designer = await joinEditor(frame, CATALOG_TEXT, DESIGNER_TAB);
        const brain = await created(designer, "Runner");
        bridges[0].setTabs([{ key: ARCADE_TAB, label: "Wendoo" }]);

        const absent = await openAnswer(own, "open-1", brain.id);
        const unknown = await openAnswer(own, "open-2", "absentabsentabse");

        for (const [reply, code] of [
          [absent, MakeCodeBrainsErrorCode.ORIGIN_ABSENT],
          [unknown, MakeCodeBrainsErrorCode.UNKNOWN_BRAIN],
        ] as const) {
          assert.equal(reply.type, "makecode:brainsError");
          assert.equal((reply.payload as { code: string }).code, code);
        }
        assert.deepEqual(openers[0].opened, []);
        assert.equal(errors.filter((line) => line.startsWith(MakeCodeBrainsErrorCode.ORIGIN_ABSENT)).length, 1);
        assert.equal(errors.filter((line) => line.startsWith(MakeCodeBrainsErrorCode.UNKNOWN_BRAIN)).length, 1);
        await nothingMore(designer);
      });

      /** The ids of the brain opens arrived at `editor`, in order. */
      function brainOpens(editor: RawEditor): string[] {
        return editor.arrived
          .filter((message) => message.type === "makecode:brainOpen")
          .map((message) => (message.payload as { id: string }).id);
      }

      it("holds only the latest of two opens for an origin tab with no session, delivering it once the tab's session is up", async () => {
        const first = start();
        first.programPosts(CATALOG_TEXT);
        const origin = await joinEditor(first, CATALOG_TEXT, DESIGNER_TAB);
        const earlier = await created(origin, "Runner");
        const later = await created(origin, "Walker");
        bridges.splice(0)[0].dispose();
        clients.splice(0)[0].dispose();
        const frame = start();
        frame.programPosts(CATALOG_TEXT);
        const own = await joinEditor(frame, CATALOG_TEXT, ARCADE_TAB);
        bridges[0].setTabs([
          { key: ARCADE_TAB, label: "Wendoo" },
          { key: DESIGNER_TAB, label: "Designer" },
        ]);

        assert.equal((await openAnswer(own, "open-1", earlier.id)).type, "makecode:brainsOpenReply");
        assert.equal((await openAnswer(own, "open-2", later.id)).type, "makecode:brainsOpenReply");
        const designer = await joinEditor(frame, CATALOG_TEXT, DESIGNER_TAB);
        await eventually(
          () => brainOpens(designer).length,
          (count) => count > 0,
          "the held brain open"
        );
        await quiet();

        assert.deepEqual(brainOpens(designer), [later.id]);
        assert.deepEqual(openers.at(-1)?.opened, [DESIGNER_TAB, DESIGNER_TAB]);
      });

      it("holds the brain open for an origin tab whose session is up before the project's brains are read, delivering it once", async () => {
        const first = start();
        first.programPosts(CATALOG_TEXT);
        const brain = await created(await joinEditor(first, CATALOG_TEXT, DESIGNER_TAB), "Runner");
        bridges.splice(0)[0].dispose();
        clients.splice(0)[0].dispose();
        host.hold();
        const frame = start();
        const designer = await joinRaw(frame, DESIGNER_TAB);
        const own = await joinRaw(frame, ARCADE_TAB);
        bridges[0].setTabs([
          { key: ARCADE_TAB, label: "Wendoo" },
          { key: DESIGNER_TAB, label: "Designer" },
        ]);

        own.send({ type: "makecode:brainsOpen", id: "open-1", payload: { id: brain.id } });
        host.release();
        await eventually(
          () => brainOpens(designer).length,
          (count) => count > 0,
          "the held brain open"
        );
        await quiet();

        assert.deepEqual(brainOpens(designer), [brain.id]);
        assert.deepEqual(brainOpens(own), []);
        assert.ok(
          own.arrived.some((message) => message.type === "makecode:brainsOpenReply" && message.id === "open-1")
        );
        assert.deepEqual(openers.at(-1)?.opened, [DESIGNER_TAB]);
      });

      it("holds the brain open for an origin tab with no session until its first publications are out, delivering it once", async () => {
        const first = start();
        first.programPosts(CATALOG_TEXT);
        const brain = await created(await joinEditor(first, CATALOG_TEXT, DESIGNER_TAB), "Runner");
        bridges.splice(0)[0].dispose();
        clients.splice(0)[0].dispose();
        const frame = start();
        frame.programPosts(CATALOG_TEXT);
        const own = await joinEditor(frame, CATALOG_TEXT, ARCADE_TAB);
        bridges[0].setTabs([
          { key: ARCADE_TAB, label: "Wendoo" },
          { key: DESIGNER_TAB, label: "Designer" },
        ]);

        const reply = await openAnswer(own, "open-1", brain.id);
        const designer = await joinEditor(frame, CATALOG_TEXT, DESIGNER_TAB);
        const opened = await designer.nextMessage();
        const again = await joinEditor(frame, CATALOG_TEXT, DESIGNER_TAB);

        assert.equal(reply.type, "makecode:brainsOpenReply");
        assert.deepEqual(opened, { type: "makecode:brainOpen", payload: { id: brain.id } });
        assert.deepEqual(openers.at(-1)?.opened, [DESIGNER_TAB]);
        await nothingMore(again);
        await nothingMore(own);
      });
    });

    it("publishes the brains into every tab's session after a push over one tab's lands", async () => {
      const frame = start();
      frame.programPosts(CATALOG_TEXT);
      const own = await joinEditor(frame, CATALOG_TEXT);
      const designer = await joinEditor(frame, CATALOG_TEXT, DESIGNER_TAB);
      const established = (await designer.nextBrains(0)).length;
      assert.equal(established, 0);
      const chaser = wireBrain("abcdabcdabcdabcd", "Chaser");

      own.send({ type: "makecode:brainsPush", id: "push-1", payload: { op: "write", brain: chaser } });

      assert.deepEqual(await designer.nextBrains(1), [
        {
          id: chaser.id,
          name: "Chaser",
          sourceHash: brainSourceHash(chaser.source),
          compiledSourceHash: brainSourceHash(chaser.source),
          origin: SIMX_CHANNEL,
          originLabel: null,
        },
      ]);
      assert.equal((await own.nextMessage()).type, "makecode:brainsPushReply");
      assert.deepEqual(await listedBrains(designer, "list-1"), { type: "makecode:brainsListReply", ids: [chaser.id] });
    });

    it("serves the project's brains after its frame reloads, holding nothing but what it reads", async () => {
      const frame = start();
      frame.programPosts(CATALOG_TEXT);
      const editor = await joinEditor(frame, CATALOG_TEXT);
      const chaser = wireBrain("abcdabcdabcdabcd", "Chaser");
      editor.send({ type: "makecode:brainsPush", id: "push-1", payload: { op: "write", brain: chaser } });
      assert.equal((await editor.nextMessage()).type, "makecode:brainsPushReply");

      bridges.splice(0)[0].dispose();
      clients.splice(0)[0].dispose();
      const reloaded = start();
      reloaded.programPosts("{}");
      const returned = await joinEditor(reloaded, "{}");
      returned.send({ type: "makecode:brainsPull", id: "pull-1", payload: { ids: [chaser.id] } });

      assert.deepEqual(await returned.nextMessage(), {
        type: "makecode:brainsPullReply",
        id: "pull-1",
        payload: {
          brains: [
            { ...chaser, compiledSourceHash: brainSourceHash(chaser.source), origin: SIMX_CHANNEL, originLabel: null },
          ],
        },
      });
    });

    it("answers a push the project refuses with WRITE_FAILED, the refusal's code leading its message", async () => {
      const frame = start();
      frame.programPosts(CATALOG_TEXT);
      const editor = await joinEditor(frame, CATALOG_TEXT);
      host.edit("filler.bin", "x".repeat(PROJFS_SCOPE_QUOTA_BYTES));

      editor.send({
        type: "makecode:brainsPush",
        id: "push-1",
        payload: { op: "write", brain: wireBrain("abcdabcdabcdabcd", "Chaser") },
      });
      const reply = await editor.nextMessage();

      assert.equal(reply.type, "makecode:brainsError");
      assert.equal(reply.id, "push-1");
      const payload = reply.payload as { code: string; message: string };
      assert.equal(payload.code, MakeCodeBrainsErrorCode.WRITE_FAILED);
      assert.match(payload.message, /^QUOTA_EXCEEDED\b/);
      assert.equal(host.file("brains/abcdabcdabcdabcd.src.json"), undefined);
    });

    describe("program updates to the running program", () => {
      it("posts a pushed program to the running program as it compiles, before the project's write lands", async () => {
        const frame = start();
        frame.programPosts(CATALOG_TEXT);
        const editor = await joinEditor(frame, CATALOG_TEXT);
        const chaser = wireBrain("abcdabcdabcdabcd", "Chaser");
        host.hold();

        editor.send({ type: "makecode:brainsPush", id: "push-1", payload: { op: "write", brain: chaser } });
        await eventually(
          () => postedProgramUpdates(frame.posted).length,
          (count) => count === 1,
          "the program update"
        );

        const [update] = postedProgramUpdates(frame.posted);
        assert.deepEqual(
          [update.version, update.documentId, update.name, update.sourceHash],
          [SIM_CHANNEL_VERSION, chaser.id, "Chaser", brainSourceHash(chaser.source)]
        );
        assert.ok(update.bytecode.length > 0);
        assert.equal(host.file(`brains/${chaser.id}.src.json`), undefined);
        assert.equal(host.file("brains.g.ts"), undefined);
        host.release();
        assert.equal((await editor.nextMessage()).type, "makecode:brainsPushReply");
        assert.equal(host.file(`brains/${chaser.id}.src.json`), chaser.source);
      });

      it("posts nothing for a push whose compile keeps the registration", async () => {
        const frame = start();
        frame.programPosts(CATALOG_TEXT);
        const editor = await joinEditor(frame, CATALOG_TEXT);
        const chaser = wireBrain("abcdabcdabcdabcd", "Chaser");
        const mangled = { ...chaser, source: "not json {" };

        editor.send({ type: "makecode:brainsPush", id: "push-1", payload: { op: "write", brain: chaser } });
        assert.equal((await editor.nextMessage()).type, "makecode:brainsPushReply");
        editor.send({ type: "makecode:brainsPush", id: "push-2", payload: { op: "write", brain: mangled } });
        assert.equal((await editor.nextMessage()).type, "makecode:brainsPushReply");

        assert.equal(postedProgramUpdates(frame.posted).length, 1);
        assert.equal(host.file(`brains/${chaser.id}.src.json`), mangled.source);
      });

      it("posts a removal to the running program as an update carrying no program", async () => {
        const frame = start();
        frame.programPosts(CATALOG_TEXT);
        const editor = await joinEditor(frame, CATALOG_TEXT);
        const chaser = wireBrain("abcdabcdabcdabcd", "Chaser");
        editor.send({ type: "makecode:brainsPush", id: "push-1", payload: { op: "write", brain: chaser } });
        assert.equal((await editor.nextMessage()).type, "makecode:brainsPushReply");

        editor.send({ type: "makecode:brainsPush", id: "push-2", payload: { op: "remove", brainId: chaser.id } });
        assert.deepEqual(await editor.nextMessage(), { type: "makecode:brainsPushReply", id: "push-2", payload: null });

        assert.deepEqual(postedProgramUpdates(frame.posted).at(-1), {
          version: SIM_CHANNEL_VERSION,
          documentId: chaser.id,
          name: "",
          sourceHash: "",
          bytecode: new Uint8Array(0),
        });
      });

      it("re-posts the last update of every program when the program starts again", async () => {
        const frame = start();
        frame.programPosts(CATALOG_TEXT);
        const editor = await joinEditor(frame, CATALOG_TEXT);
        const chaser = wireBrain("abcdabcdabcdabcd", "Chaser");
        const runner = wireBrain("efghefghefghefgh", "Runner");
        editor.send({ type: "makecode:brainsPush", id: "push-1", payload: { op: "write", brain: chaser } });
        editor.send({ type: "makecode:brainsPush", id: "push-2", payload: { op: "write", brain: runner } });
        assert.equal((await editor.nextMessage()).id, "push-1");
        assert.equal((await editor.nextMessage()).id, "push-2");

        frame.programPings();

        assert.deepEqual(
          postedProgramUpdates(frame.posted).map((update) => update.documentId),
          [chaser.id, runner.id, chaser.id, runner.id]
        );
      });
    });
  });

  describe("project-file change notifications", () => {
    /** The source of an empty brain document `id` named `name`. */
    function brainSource(id: string, name: string): string {
      return JSON.stringify({ version: 1, id, name, pages: [] }, null, 2);
    }

    const CHASER = "abcdabcdabcdabcd";

    /** A catalog of one pack declaring the actuator `tile`. */
    function tileCatalog(tile: string): string {
      return JSON.stringify({ packs: [{ name: "beacon", tiles: [{ name: tile, kind: "actuator" }] }] });
    }

    it("re-reads a brain source MakeCode reports edited by hand, publishing the brains into the session", async () => {
      host.edit(`brains/${CHASER}.src.json`, brainSource(CHASER, "Chaser"));
      const frame = start();
      frame.programPosts(CATALOG_TEXT);
      const editor = await joinEditor(frame, CATALOG_TEXT);
      await editor.nextBrains(0);
      const edited = brainSource(CHASER, "Chaser by hand");

      host.edit(`brains/${CHASER}.src.json`, edited, { notify: true });

      const published = await eventually(
        () => editor.brains.at(-1) ?? [],
        (brains) => brains[0]?.sourceHash === brainSourceHash(edited),
        "the hand edit to be published"
      );
      assert.deepEqual(
        published.map((brain) => [brain.id, brain.name, brain.sourceHash]),
        [[CHASER, "Chaser by hand", brainSourceHash(edited)]]
      );
    });

    it("publishes the manifest into the session when MakeCode reports ids.g.ts edited by hand", async () => {
      const frame = start();
      const editor = await joinBare(frame);
      const edited: MakeCodeIdManifest = {
        actions: [{ name: "actuator.beacon.flash", id: 1030 }],
        operators: [],
        types: [],
        next: { action: 1031, operator: 1024, atom: 1024 },
      };

      host.edit(IDS_MODULE_FILE, writeIdsModule(edited), { notify: true });

      assert.deepEqual(await editor.nextMessage(), manifestMessage({ manifest: edited }));
    });

    it("keeps an edited ids.g.ts's ids when the program's catalog is allocated over it", async () => {
      const frame = start();
      frame.programPosts(tileCatalog("actuator.beacon.flash"));
      const editor = await joinEditor(frame, tileCatalog("actuator.beacon.flash"));
      const edited: MakeCodeIdManifest = {
        actions: [{ name: "actuator.beacon.flash", id: 1030 }],
        operators: [],
        types: [],
        next: { action: 1031, operator: 1024, atom: 1024 },
      };

      host.edit(IDS_MODULE_FILE, writeIdsModule(edited), { notify: true });

      assert.deepEqual(await editor.nextMessage(), manifestMessage({ manifest: edited }));
      assert.equal(host.file(IDS_MODULE_FILE), writeIdsModule(edited));
    });

    it("rebuilds the brains on a manifest re-read, posting the program recompiled under the edited ids", async () => {
      const chime = JSON.stringify({
        packs: [{ name: "chime", tiles: [{ name: "actuator.chime.ring", kind: "actuator" }] }],
      });
      const held: MakeCodeIdManifest = {
        actions: [{ name: "actuator.chime.ring", id: 1024 }],
        operators: [],
        types: [],
        next: { action: 1025, operator: 1024, atom: 1024 },
      };
      const { environment } = buildAuthoringEnvironment(chime, held);
      const definition = BrainDef.emptyBrainDef(environment.brainServices, "Ringer");
      const rule = (definition.pages().get(0) as BrainPageDef).children().get(0) as BrainRuleDef;
      for (const catalog of environment.tileCatalogs()) {
        const when = catalog.get(mkSensorTileId(CoreHostActions.OnPageEntered.key));
        const ring = catalog.get(mkActuatorTileId("actuator.chime.ring"));
        if (when) rule.when().appendTile(when);
        if (ring) rule.do().appendTile(ring);
      }
      const id = definition.id();
      host.edit(IDS_MODULE_FILE, writeIdsModule(held));
      host.edit(`brains/${id}.src.json`, serializeBrainSource(definition));
      const frame = start();
      frame.programPosts(chime);
      const registered = (): Uint8Array | undefined =>
        readBrainsModule(host.file(BRAINS_MODULE_FILE) ?? "").entries.get(id)?.bytecode;
      const before = await eventually(registered, (bytecode) => bytecode !== undefined, "the pack brain to register");
      const updates = postedProgramUpdates(frame.posted).length;
      const renumbered: MakeCodeIdManifest = {
        actions: [{ name: "actuator.chime.ring", id: 1030 }],
        operators: [],
        types: [],
        next: { action: 1031, operator: 1024, atom: 1024 },
      };

      host.edit(IDS_MODULE_FILE, writeIdsModule(renumbered), { notify: true });

      const after = await eventually(
        registered,
        (bytecode) => bytecode !== undefined && bytecode.join() !== before?.join(),
        "the brain to be recompiled under the edited ids"
      );
      const posted = postedProgramUpdates(frame.posted).slice(updates);
      assert.deepEqual(
        posted.map((update) => [update.documentId, update.bytecode.join()]),
        [[id, after?.join()]]
      );
      assert.equal(host.file(IDS_MODULE_FILE), writeIdsModule(renumbered));
    });

    it("asks again for a subscription MakeCode refuses, logging the code, and re-reads every brain file once acknowledged", async () => {
      host.failSubscribes("FAILED");
      const acknowledge = host.holdSubscriptions();
      host.edit(`brains/${CHASER}.src.json`, brainSource(CHASER, "Chaser"));
      const frame = start();
      frame.programPosts(CATALOG_TEXT);
      const editor = await joinEditor(frame, CATALOG_TEXT);
      await editor.nextBrains(0);
      const edited = brainSource(CHASER, "Chaser by hand");

      host.edit(`brains/${CHASER}.src.json`, edited);
      acknowledge();

      const published = await eventually(
        () => editor.brains.at(-1) ?? [],
        (brains) => brains[0]?.sourceHash === brainSourceHash(edited),
        "the rescan to publish the hand edit"
      );
      assert.deepEqual(
        published.map((brain) => brain.id),
        [CHASER]
      );
      assert.equal(errors.filter((line) => line.startsWith("FAILED: ")).length, 1);
    });

    it("logs a subscription MakeCode refuses for good once, asking no more", async () => {
      host.failSubscribes("PERMISSION_DENIED", "PERMISSION_DENIED");
      start();

      await eventually(
        () => errors.length,
        (count) => count > 0,
        "the refusal to be logged"
      );
      await quiet();

      assert.equal(errors.length, 1);
      assert.ok(errors[0].startsWith("PERMISSION_DENIED: "));
    });
  });

  describe("frame parameters", () => {
    it("reads the program's messages on the channel it was started with, and asks for the catalog on it", async () => {
      const frame = start("fork-owner/fork-repo");
      frame.programPosts("from the default channel");
      frame.programPosts("from its own channel", "fork-owner/fork-repo");

      await joinEditor(frame, "from its own channel");

      assert.deepEqual(frame.posted, [
        { type: "messagepacket", channel: "fork-owner/fork-repo", data: new Uint8Array(0) },
      ]);
    });
  });
});
