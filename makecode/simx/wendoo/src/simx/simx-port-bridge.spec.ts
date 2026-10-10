import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { PeerSessionErrorCode } from "@wendoo/bridge-app/peer-session";
import {
  brainSourceHash,
  connectMakeCodeSession,
  MAKECODE_SESSION_PROTOCOL_VERSION,
  type MakeCodeAsset,
  MakeCodeBrainsErrorCode,
  type MakeCodeProjectInfo,
  type MakeCodeSession,
  type MakeCodeSessionMessage,
  type MakeCodeWireBrain,
  messagePortSessionPort,
} from "@wendoo/makecode-session";
import type { ProjfsClient } from "../vendor/projfs.js";
import { decodeImageHex } from "./image-buffer.js";
import { SIM_CHANNEL_VERSION, SIMX_CHANNEL, SimChannelErrorCode } from "./sim-channel.js";
import { type SimxPortBridge, startSimxPortBridge } from "./simx-bridge.js";
import { imageSvg } from "./svg-image.js";
import { FakeAssetProvider, listedImage } from "./test-support/asset-provider.js";
import { pixelImage } from "./test-support/image-buffer-encoder.js";
import { FakePortFrame, PARENT_ORIGIN } from "./test-support/port-frame.js";
import { postedProgramUpdates } from "./test-support/program-update-frame.js";
import { FakeProjfsHost, PROJFS_SCOPE_QUOTA_BYTES } from "./test-support/projfs-host.js";

/** How long a wait in these specs lasts before it fails, in milliseconds. */
const WAIT_MS = 2000;

/** How long a spec watches a port to see that nothing arrives on it, in milliseconds. */
const QUIET_MS = 50;

/**
 * A catalog document exercising characters a message must carry intact:
 * quotes, backslashes, escape sequences written as text, control characters,
 * and non-ASCII code units including a surrogate pair.
 */
const CATALOG_TEXT =
  '{"packs":[{"name":"beacon","tiles":[{"name":"say \\"hi\\"","kind":"actuator","docs":"line\\nnext \\u00e9"}]}]}' +
  "\t\r\n\u0001 café 😀 \\";

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

/**
 * The editor's end of a port brokered to the simulator extension, driven raw
 * by the spec: it records every message arriving, and the spec reads them in
 * order.
 */
class RawEditor {
  /** Every message arrived, in order. */
  readonly arrived: ReceivedMessage[] = [];
  private _read = 0;
  private readonly _port: MessagePort;

  constructor(port: MessagePort) {
    this._port = port;
    port.addEventListener("message", (event) => {
      this.arrived.push(event.data as ReceivedMessage);
    });
    port.start();
  }

  /** Sends `message` to the simulator extension as it is. */
  send(message: object): void {
    this._port.postMessage(message);
  }

  /** Resolves with the first message not read yet, once it has arrived. */
  async nextMessage(): Promise<ReceivedMessage> {
    await eventually(
      () => this.arrived.length,
      (count) => count > this._read,
      "the next message"
    );
    const message = this.arrived[this._read];
    this._read += 1;
    return message;
  }

  /** The messages arrived and not read yet. */
  unread(): ReceivedMessage[] {
    return this.arrived.slice(this._read);
  }
}

describe("simx port bridge", () => {
  let host: FakeProjfsHost;
  let assets: FakeAssetProvider;
  let clients: ProjfsClient[];
  let bridges: SimxPortBridge[];
  let channels: MessageChannel[];
  let sessions: MakeCodeSession[];
  let errors: string[];

  beforeEach(() => {
    host = new FakeProjfsHost();
    assets = new FakeAssetProvider();
    clients = [];
    bridges = [];
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
   * provider, declaring the arcade target and reading the program's messages
   * on `channel` when one is given.
   */
  function start(channel?: string): FakePortFrame {
    const frame = new FakePortFrame();
    const files = host.client();
    clients.push(files);
    const log = {
      info() {},
      error(message: string) {
        errors.push(message);
      },
    };
    bridges.push(
      startSimxPortBridge({ frame, parentOrigin: PARENT_ORIGIN, files, assets, log, target: "arcade", channel })
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
   * Brokers a fresh port pair to `frame` and runs the editor's side of the
   * makecode handshake over the other end raw: sends the editor's hello and
   * reads the simulator extension's. Resolves with the editor's end.
   */
  async function joinRaw(frame: FakePortFrame): Promise<RawEditor> {
    const { port1, port2 } = channel();
    const editor = new RawEditor(port2);
    frame.brokerPort(port1);
    editor.send(MAKECODE_HELLO);
    assert.equal((await editor.nextMessage()).type, "makecode:hello");
    return editor;
  }

  /** Joins a raw editor to `frame`, as {@link joinRaw}, and reads `catalog` as the first message after the hello. */
  async function joinEditor(frame: FakePortFrame, catalog: string): Promise<RawEditor> {
    const editor = await joinRaw(frame);
    assert.deepEqual(await editor.nextMessage(), catalogMessage(catalog));
    return editor;
  }

  /** Resolves once {@link QUIET_MS} have passed with nothing more arriving at `editor`. */
  async function nothingMore(editor: RawEditor): Promise<void> {
    await quiet();
    assert.deepEqual(editor.unread(), []);
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

  it("ends the previous port's session when MakeCode brokers a new port, serving the new one alone", async () => {
    const frame = start();
    const first = rawPort(frame);
    await eventually(
      () => first.arrived.length,
      (count) => count === 1,
      "the first port's hello"
    );
    first.port.postMessage({ type: "makecode:hello", payload: { protocolVersion: MAKECODE_SESSION_PROTOCOL_VERSION } });

    const { session } = await editorOver(frame);
    first.port.postMessage({ type: "makecode:brainsList", id: "late" });
    await quiet();

    assert.deepEqual(
      first.arrived.map((message) => (message as { type: string }).type),
      ["makecode:hello"]
    );
    assert.deepEqual(await session.listBrains(), []);
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
    const editor = await joinRaw(frame);
    await nothingMore(editor);

    assert.equal(errors.length, 2);
    assert.ok(errors[0].startsWith(SimChannelErrorCode.VERSION_NEWER));
    assert.ok(errors[1].startsWith(SimChannelErrorCode.FRAME_MALFORMED));
    frame.programPosts("{}");
    assert.deepEqual(await editor.nextMessage(), catalogMessage("{}"));
  });

  it("ignores the program's ping, before its catalog and after: it logs nothing and publishes nothing", async () => {
    const frame = start();

    frame.programPings();
    const editor = await joinRaw(frame);
    await nothingMore(editor);

    frame.programPosts(CATALOG_TEXT);
    assert.deepEqual(await editor.nextMessage(), catalogMessage(CATALOG_TEXT));
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

    /** The catalog the editor receives for {@link iconCatalog} of `icon`, its icon rendered under `palette`. */
    function renderedIconCatalog(icon: string, palette: readonly string[]): string {
      const reading = decodeImageHex(icon);
      assert.ok(reading.image);
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

    /** The snapshot entry of a 4-bit image `id` of pixels `rows`, named `name` when given, under `palette`. */
    function snapshotEntry(id: string, rows: number[][], palette: readonly string[], name?: string): MakeCodeAsset {
      const entry: MakeCodeAsset = { kind: "image", id, width: rows[0].length, height: rows.length, previewUrl: "" };
      if (name !== undefined) entry.name = name;
      entry.previewUrl = imageSvg(pixelImage(4, rows), palette).url;
      return entry;
    }

    it("publishes the project's asset snapshot into the session once established, after the catalog, each image with its size", async () => {
      assets.images = [
        listedImage("image2", [[1, 2]], "hero"),
        listedImage("transparency16", [[0]]),
        listedImage("image1", [[3]]),
      ];
      assets.answer();
      const frame = start();
      frame.programPosts("{}");
      const editor = await joinEditor(frame, "{}");

      assert.deepEqual(
        await editor.nextMessage(),
        assetsMessage([
          snapshotEntry("image1", [[3]], assets.palette),
          snapshotEntry("image2", [[1, 2]], assets.palette, "hero"),
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

      assert.deepEqual(await returned.nextMessage(), catalogMessage("{}"));
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

    it("publishes the catalog with each tile icon rendered as an iconUrl, and no icon text", async () => {
      assets.answer();
      const frame = start();
      const editor = await joinRaw(frame);
      assert.deepEqual(await editor.nextMessage(), assetsMessage([]));
      assert.deepEqual(await editor.nextMessage(), projectInfoMessage(assets.name));

      frame.programPosts(iconCatalog(ICON));

      assert.deepEqual(await editor.nextMessage(), catalogMessage(renderedIconCatalog(ICON, assets.palette)));
    });

    it("publishes a tile whose icon it cannot read without an iconUrl, logging the icon's code, and the catalog all the same", async () => {
      assets.answer();
      const frame = start();
      const editor = await joinRaw(frame);
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

    it("re-publishes both the snapshot and the re-rendered catalog when the project's palette changes", async () => {
      assets.images = [listedImage("image1", [[1]])];
      assets.answer();
      const frame = start();
      frame.programPosts(iconCatalog(ICON));
      const editor = await joinRaw(frame);
      const opening = [await editor.nextMessage(), await editor.nextMessage(), await editor.nextMessage()];
      assert.deepEqual(
        opening.find((message) => message.type === "makecode:projectInfo"),
        projectInfoMessage(assets.name)
      );
      assert.deepEqual(
        opening.find((message) => message.type === "makecode:catalog"),
        catalogMessage(renderedIconCatalog(ICON, assets.palette))
      );

      const recolored = ["#000000", "#00aa00", "#0000aa"];
      assets.palette = recolored;
      assets.change();
      const updates = [await editor.nextMessage(), await editor.nextMessage()];

      assert.deepEqual(
        updates.find((message) => message.type === "makecode:catalog"),
        catalogMessage(renderedIconCatalog(ICON, recolored))
      );
      assert.deepEqual(
        updates.find((message) => message.type === "makecode:assets"),
        assetsMessage([snapshotEntry("image1", [[1]], recolored)])
      );
    });

    it("keeps publishing the catalog and serving brains requests when MakeCode refuses it the project's assets, logging the code", async () => {
      assets.failLists("PERMISSION_DENIED");
      assets.failSubscribes("PERMISSION_DENIED");
      assets.answer();
      const frame = start();
      frame.programPosts(iconCatalog(ICON));
      const editor = await joinRaw(frame);

      assert.deepEqual(
        await editor.nextMessage(),
        catalogMessage(
          JSON.stringify({ packs: [{ name: "arcade", tiles: [{ name: "sensor.arcade.dpad", kind: "sensor" }] }] })
        )
      );
      editor.send({ type: "makecode:brainsList", id: "list-1" });
      assert.deepEqual(await editor.nextMessage(), {
        type: "makecode:brainsListReply",
        id: "list-1",
        payload: { brains: [] },
      });
      await nothingMore(editor);
      assert.equal(errors.length, 2);
      assert.equal(
        errors.every((line) => line.startsWith("PERMISSION_DENIED: ")),
        true
      );
    });
  });

  describe("manifest requests", () => {
    it("answers the editor's manifest write and read from the project's ids module", async () => {
      const frame = start();
      frame.programPosts(CATALOG_TEXT);
      const editor = await joinEditor(frame, CATALOG_TEXT);
      const manifest = {
        actions: [{ name: "actuator.chime.ring", id: 1024 }],
        operators: [],
        types: [],
        next: { action: 1025, operator: 1024, atom: 1024 },
      };

      editor.send({ type: "makecode:manifestRead", id: "read-1" });
      assert.deepEqual(await editor.nextMessage(), {
        type: "makecode:manifestReadReply",
        id: "read-1",
        payload: { manifest: null },
      });
      editor.send({ type: "makecode:manifestWrite", id: "write-1", payload: { manifest } });
      assert.deepEqual(await editor.nextMessage(), { type: "makecode:manifestAck", id: "write-1" });
      editor.send({ type: "makecode:manifestRead", id: "read-2" });

      assert.deepEqual(await editor.nextMessage(), {
        type: "makecode:manifestReadReply",
        id: "read-2",
        payload: { manifest },
      });
      assert.match(host.file("ids.g.ts") ?? "", /^ {4}wendoo\.mapActionId\("actuator\.chime\.ring", 1024\);$/m);
    });
  });

  describe("brains requests", () => {
    /** A brain as the editor pushes it on the wire, its compiled program covering every byte value. */
    function wireBrain(id: string, name: string): MakeCodeWireBrain {
      const source = JSON.stringify({ version: 1, id, name, pages: [] }, null, 2);
      const bytecode = Buffer.from(Uint8Array.from({ length: 256 }, (_, index) => index)).toString("base64");
      return { id, name, source, compiled: { bytecode, sourceHash: brainSourceHash(source) } };
    }

    it("answers the editor's push, list and pull from the project's files, writing both forms", async () => {
      const frame = start();
      frame.programPosts(CATALOG_TEXT);
      const editor = await joinEditor(frame, CATALOG_TEXT);
      const chaser = wireBrain("abcdabcdabcdabcd", "Chaser");

      editor.send({ type: "makecode:brainsPush", id: "push-1", payload: { op: "write", brain: chaser } });
      assert.deepEqual(await editor.nextMessage(), { type: "makecode:brainsAck", id: "push-1" });
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
            },
          ],
        },
      });
      editor.send({ type: "makecode:brainsPull", id: "pull-1", payload: { ids: [chaser.id, "absentabsentabse"] } });
      assert.deepEqual(await editor.nextMessage(), {
        type: "makecode:brainsPullReply",
        id: "pull-1",
        payload: { brains: [chaser] },
      });

      assert.equal(host.file(`brains/${chaser.id}.src.json`), chaser.source);
      assert.match(
        host.file("brains.g.ts") ?? "",
        /^ {4}export const p_abcdabcdabcdabcd = wendoo\.registerCompiledBrain\("abcdabcdabcdabcd", "Chaser", hex`$/m
      );
    });

    it("serves the project's brains after its frame reloads, holding none of its own", async () => {
      const frame = start();
      frame.programPosts(CATALOG_TEXT);
      const editor = await joinEditor(frame, CATALOG_TEXT);
      const chaser = wireBrain("abcdabcdabcdabcd", "Chaser");
      editor.send({ type: "makecode:brainsPush", id: "push-1", payload: { op: "write", brain: chaser } });
      assert.deepEqual(await editor.nextMessage(), { type: "makecode:brainsAck", id: "push-1" });

      bridges.splice(0)[0].dispose();
      clients.splice(0)[0].dispose();
      const reloaded = start();
      reloaded.programPosts("{}");
      const returned = await joinEditor(reloaded, "{}");
      returned.send({ type: "makecode:brainsPull", id: "pull-1", payload: { ids: [chaser.id] } });

      assert.deepEqual(await returned.nextMessage(), {
        type: "makecode:brainsPullReply",
        id: "pull-1",
        payload: { brains: [chaser] },
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
      /** The compiled program `wireBrain` pushes, as bytes. */
      const PUSHED_BYTES = Uint8Array.from({ length: 256 }, (_, index) => index);

      it("posts a pushed program to the running program at once, before the project's write lands", async () => {
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

        assert.deepEqual(postedProgramUpdates(frame.posted), [
          {
            version: SIM_CHANNEL_VERSION,
            documentId: chaser.id,
            name: "Chaser",
            sourceHash: brainSourceHash(chaser.source),
            bytecode: PUSHED_BYTES,
          },
        ]);
        assert.equal(host.file(`brains/${chaser.id}.src.json`), undefined);
        assert.equal(host.file("brains.g.ts"), undefined);
        host.release();
        assert.deepEqual(await editor.nextMessage(), { type: "makecode:brainsAck", id: "push-1" });
        assert.equal(host.file(`brains/${chaser.id}.src.json`), chaser.source);
      });

      it("posts nothing for a push carrying the compiled form it posted last, though its source changed", async () => {
        const frame = start();
        frame.programPosts(CATALOG_TEXT);
        const editor = await joinEditor(frame, CATALOG_TEXT);
        const chaser = wireBrain("abcdabcdabcdabcd", "Chaser");
        const halfBuilt = { ...chaser, source: `${chaser.source}\n` };

        editor.send({ type: "makecode:brainsPush", id: "push-1", payload: { op: "write", brain: chaser } });
        assert.deepEqual(await editor.nextMessage(), { type: "makecode:brainsAck", id: "push-1" });
        editor.send({ type: "makecode:brainsPush", id: "push-2", payload: { op: "write", brain: halfBuilt } });
        assert.deepEqual(await editor.nextMessage(), { type: "makecode:brainsAck", id: "push-2" });

        assert.equal(postedProgramUpdates(frame.posted).length, 1);
        assert.equal(host.file(`brains/${chaser.id}.src.json`), halfBuilt.source);
      });

      it("posts a removal to the running program as an update carrying no program", async () => {
        const frame = start();
        frame.programPosts(CATALOG_TEXT);
        const editor = await joinEditor(frame, CATALOG_TEXT);
        const chaser = wireBrain("abcdabcdabcdabcd", "Chaser");
        editor.send({ type: "makecode:brainsPush", id: "push-1", payload: { op: "write", brain: chaser } });
        assert.deepEqual(await editor.nextMessage(), { type: "makecode:brainsAck", id: "push-1" });

        editor.send({ type: "makecode:brainsPush", id: "push-2", payload: { op: "remove", brainId: chaser.id } });
        assert.deepEqual(await editor.nextMessage(), { type: "makecode:brainsAck", id: "push-2" });

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
        assert.deepEqual(await editor.nextMessage(), { type: "makecode:brainsAck", id: "push-1" });
        assert.deepEqual(await editor.nextMessage(), { type: "makecode:brainsAck", id: "push-2" });

        frame.programPings();

        assert.deepEqual(
          postedProgramUpdates(frame.posted).map((update) => update.documentId),
          [chaser.id, runner.id, chaser.id, runner.id]
        );
      });
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
