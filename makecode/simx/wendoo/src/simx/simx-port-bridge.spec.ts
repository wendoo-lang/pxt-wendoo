import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { PeerSessionErrorCode } from "@wendoo/bridge-protocol";
import {
  connectMakeCodeSession,
  MAKECODE_SESSION_PROTOCOL_VERSION,
  type MakeCodeAsset,
  type MakeCodeProjectInfo,
  type MakeCodeSession,
  messagePortSessionPort,
} from "@wendoo/makecode-session";
import type { ProjfsClient } from "../vendor/projfs.js";
import { type SimxPortBridge, startSimxPortBridge } from "./simx-bridge.js";
import { FakeAssetProvider, listedImage } from "./test-support/asset-provider.js";
import { FakePortFrame, PARENT_ORIGIN } from "./test-support/port-frame.js";
import { FakeProjfsHost } from "./test-support/projfs-host.js";

/** How long a wait in these specs lasts before it fails, in milliseconds. */
const WAIT_MS = 2000;

/** How long a spec watches a port to see that nothing arrives on it, in milliseconds. */
const QUIET_MS = 50;

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

/** Resolves once {@link QUIET_MS} have passed. */
function quiet(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, QUIET_MS));
}

/** What an editor session over a port received from the simulator extension. */
interface Received {
  catalogs: string[];
  assets: MakeCodeAsset[][];
  projectInfo: MakeCodeProjectInfo[];
}

describe("simx port bridge", () => {
  let host: FakeProjfsHost;
  let clients: ProjfsClient[];
  let bridges: SimxPortBridge[];
  let channels: MessageChannel[];
  let sessions: MakeCodeSession[];
  let errors: string[];

  beforeEach(() => {
    host = new FakeProjfsHost();
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

  /** Starts the port bridge in a fresh frame over the spec's project, declaring the arcade target. */
  function start(): FakePortFrame {
    const frame = new FakePortFrame();
    const files = host.client();
    clients.push(files);
    const assets = new FakeAssetProvider();
    assets.images = [listedImage("image1", [[1, 2]], "hero")];
    assets.answer();
    const log = {
      info() {},
      error(message: string) {
        errors.push(message);
      },
    };
    bridges.push(startSimxPortBridge({ frame, parentOrigin: PARENT_ORIGIN, files, assets, log, target: "arcade" }));
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

  it("serves a session over a port MakeCode brokers: the target declared, the catalog, assets and project info published, brains listed from the project", async () => {
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
});
