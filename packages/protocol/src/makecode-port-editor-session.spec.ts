import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { PeerSessionErrorCode } from "@wendoo/bridge-app";
import type { MakeCodeAsset } from "./makecode-assets.js";
import { MakeCodeBrainsError, MakeCodeBrainsErrorCode } from "./makecode-brains.js";
import type { MakeCodeBrainsChannel, MakeCodeEditorSessionState } from "./makecode-editor-session.js";
import { MakeCodeManifestError, MakeCodeManifestErrorCode } from "./makecode-manifest.js";
import {
  createMakeCodePortEditorSession,
  type MakeCodeHeartbeatOptions,
  type MakeCodePortEditorSession,
  messagePortSessionPort,
} from "./makecode-port-editor-session.js";
import type { MakeCodeProjectInfo } from "./makecode-project-info.js";
import { connectMakeCodeSession, MAKECODE_SESSION_PROTOCOL_VERSION, type MakeCodeSession } from "./makecode-session.js";

/** How long a wait in these specs lasts before it fails, in milliseconds. */
const WAIT_MS = 2000;

/** Heartbeat timing short enough for several pings, and a missed deadline, to fit well inside {@link WAIT_MS}. */
const HEARTBEAT: MakeCodeHeartbeatOptions = { intervalMs: 20, deadlineMs: 150 };

/** An asset snapshot holding one image. */
const ASSETS: MakeCodeAsset[] = [{ kind: "image", id: "image1", previewUrl: "data:image/png;base64," }];

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

/** What an editor session delivered, in arrival order per kind. */
interface Delivered {
  states: MakeCodeEditorSessionState[];
  catalogs: string[];
  assets: MakeCodeAsset[][];
  projectInfo: MakeCodeProjectInfo[];
  channels: MakeCodeBrainsChannel[];
}

/** Records everything `session` delivers. */
function record(session: MakeCodePortEditorSession): Delivered {
  const delivered: Delivered = { states: [], catalogs: [], assets: [], projectInfo: [], channels: [] };
  session.onStateChange((state) => delivered.states.push(state));
  session.onCatalog((content) => delivered.catalogs.push(content));
  session.onAssets((assets) => delivered.assets.push(assets));
  session.onProjectInfo((info) => delivered.projectInfo.push(info));
  session.onBrainsChannel((channel) => delivered.channels.push(channel));
  return delivered;
}

describe("port-backed editor session", () => {
  let channels: MessageChannel[];
  let sessions: MakeCodePortEditorSession[];
  let peers: MakeCodeSession[];

  beforeEach(() => {
    channels = [];
    sessions = [];
    peers = [];
  });

  afterEach(() => {
    for (const session of sessions) session.stop();
    for (const peer of peers) peer.dispose();
    for (const channel of channels) {
      channel.port1.close();
      channel.port2.close();
    }
  });

  /** A new message channel, closed by the spec's cleanup. */
  function channel(): MessageChannel {
    const created = new MessageChannel();
    channels.push(created);
    return created;
  }

  /**
   * A new started session, pinging on `heartbeat` when one is given, stopped
   * by the spec's cleanup, with what it delivers recorded.
   */
  function started(heartbeat?: MakeCodeHeartbeatOptions): {
    session: MakeCodePortEditorSession;
    delivered: Delivered;
  } {
    const session = createMakeCodePortEditorSession({ heartbeat });
    sessions.push(session);
    const delivered = record(session);
    session.start();
    return { session, delivered };
  }

  /**
   * Attaches a fresh port to `session` and connects the MakeCode side over
   * the other end, declaring `target`; resolves with that side's session,
   * whose brains list answers with no brains.
   */
  async function pair(session: MakeCodePortEditorSession, target = "arcade"): Promise<MakeCodeSession> {
    const { port1, port2 } = channel();
    session.attachPort(messagePortSessionPort(port2));
    const peer = await connectMakeCodeSession({ port: messagePortSessionPort(port1), target });
    peers.push(peer);
    peer.onBrainsRequest((request) => {
      if (request.kind === "list") request.reply([]);
    });
    return peer;
  }

  /**
   * Attaches a fresh port to `session` and completes the handshake over the
   * other end by hand, sending a hello and answering nothing but pings: the
   * ping at each index (0 for the first) is answered after the delay in
   * milliseconds `pongDelay` gives for it, or never when it gives
   * `undefined`. Resolves with every message the session sent over the port
   * once the session is connected.
   */
  async function pairByHand(
    session: MakeCodePortEditorSession,
    pongDelay: (index: number) => number | undefined
  ): Promise<{ type?: unknown; id?: unknown }[]> {
    const { port1, port2 } = channel();
    const arrived: { type?: unknown; id?: unknown }[] = [];
    let pinged = 0;
    port1.addEventListener("message", (event) => {
      const message = event.data as { type?: unknown; id?: unknown };
      arrived.push(message);
      if (message.type !== "makecode:ping") return;
      const delay = pongDelay(pinged++);
      if (delay === undefined) return;
      setTimeout(() => port1.postMessage({ type: "makecode:pong", id: message.id }), delay);
    });
    port1.start();
    session.attachPort(messagePortSessionPort(port2));
    port1.postMessage({ type: "makecode:hello", payload: { protocolVersion: MAKECODE_SESSION_PROTOCOL_VERSION } });
    await eventually(
      () => session.state.status,
      (status) => status === "connected",
      "the hand-made handshake"
    );
    return arrived;
  }

  /** {@link pairByHand} with a counterpart that answers no ping. */
  function pairSilent(session: MakeCodePortEditorSession): Promise<{ type?: unknown }[]> {
    return pairByHand(session, () => undefined);
  }

  /** How many liveness pings `arrived` holds. */
  function pings(arrived: readonly { type?: unknown }[]): number {
    return arrived.filter((message) => message.type === "makecode:ping").length;
  }

  it("is disconnected until its port's handshake completes, then connected with the declared target", async () => {
    const { session, delivered } = started();
    assert.deepEqual(session.state, { status: "disconnected", errorCode: undefined, target: undefined });

    const peer = await pair(session, "microbit");
    peer.publishCatalog("catalog one");
    peer.publishAssets(ASSETS);
    peer.publishProjectInfo({ name: "Racer" });
    await eventually(
      () => delivered.projectInfo.length,
      (count) => count === 1,
      "the project info"
    );

    assert.equal(session.state.status, "connected");
    assert.equal(session.state.target, "microbit");
    assert.deepEqual(delivered.catalogs, ["catalog one"]);
    assert.deepEqual(delivered.assets, [ASSETS]);
    assert.deepEqual(delivered.projectInfo, [{ name: "Racer" }]);
    assert.equal(delivered.channels.length, 1);
    assert.deepEqual(await delivered.channels[0].listBrains(), []);
  });

  it("opens a handshake over a port attached before it was started once it starts", async () => {
    const session = createMakeCodePortEditorSession();
    sessions.push(session);
    const delivered = record(session);
    const { port1, port2 } = channel();
    session.attachPort(messagePortSessionPort(port2));
    const peer = connectMakeCodeSession({ port: messagePortSessionPort(port1), target: "arcade" });
    assert.equal(session.state.status, "disconnected");

    session.start();
    peers.push(await peer);
    await eventually(
      () => session.state.status,
      (status) => status === "connected",
      "the handshake"
    );

    assert.equal(delivered.channels.length, 1);
  });

  it("replaces its port as a reconnection: the first handshake's requests reject CLOSED, and only the new port's publications and channel arrive", async () => {
    const { session, delivered } = started();
    const first = await pair(session, "arcade");
    await eventually(
      () => delivered.channels.length,
      (count) => count === 1,
      "the first channel"
    );
    const closed = assert.rejects(delivered.channels[0].listBrains(), (error: unknown) => {
      assert.ok(error instanceof MakeCodeBrainsError);
      assert.equal(error.code, MakeCodeBrainsErrorCode.CLOSED);
      return true;
    });

    const second = await pair(session, "microbit");
    await closed;
    first.publishCatalog("from the first port");
    second.publishCatalog("from the second port");
    await eventually(
      () => delivered.catalogs.length,
      (count) => count === 1,
      "the second port's catalog"
    );
    await eventually(
      () => delivered.channels.length,
      (count) => count === 2,
      "the second channel"
    );

    assert.deepEqual(delivered.catalogs, ["from the second port"]);
    assert.equal(session.state.status, "connected");
    assert.equal(session.state.target, "microbit");
    assert.deepEqual(await delivered.channels[1].listBrains(), []);
    await assert.rejects(delivered.channels[0].listBrains(), (error: unknown) => {
      assert.ok(error instanceof MakeCodeBrainsError);
      assert.equal(error.code, MakeCodeBrainsErrorCode.CLOSED);
      return true;
    });
    assert.deepEqual(
      delivered.states.map((state) => state.status),
      ["connected", "disconnected", "connected"]
    );
  });

  it("reports a counterpart hello declaring a newer version, staying disconnected with no channel, until a later port's handshake completes", async () => {
    const { session, delivered } = started();
    const { port1, port2 } = channel();
    session.attachPort(messagePortSessionPort(port2));
    port1.postMessage({ type: "makecode:hello", payload: { protocolVersion: MAKECODE_SESSION_PROTOCOL_VERSION + 1 } });

    await eventually(
      () => session.state.errorCode,
      (code) => code === PeerSessionErrorCode.PROTOCOL_VERSION_NEWER,
      "the version rejection"
    );
    assert.equal(session.state.status, "disconnected");
    assert.equal(delivered.channels.length, 0);

    await pair(session);
    await eventually(
      () => session.state.status,
      (status) => status === "connected",
      "the later handshake"
    );

    assert.equal(session.state.errorCode, undefined);
    assert.equal(delivered.channels.length, 1);
  });

  it("keeps two sessions over two channels apart", async () => {
    const one = started();
    const two = started();
    const peerOne = await pair(one.session, "arcade");
    const peerTwo = await pair(two.session, "microbit");

    peerOne.publishCatalog("one");
    peerTwo.publishCatalog("two");
    await eventually(
      () => one.delivered.catalogs.length + two.delivered.catalogs.length,
      (n) => n === 2,
      "both"
    );

    assert.deepEqual(one.delivered.catalogs, ["one"]);
    assert.deepEqual(two.delivered.catalogs, ["two"]);
    assert.equal(one.session.state.target, "arcade");
    assert.equal(two.session.state.target, "microbit");
  });

  it("lets its port go on stop, opening no handshake until a port is attached after it starts again", async () => {
    const { session, delivered } = started();
    await pair(session);
    await eventually(
      () => session.state.status,
      (status) => status === "connected",
      "the handshake"
    );

    session.stop();
    assert.equal(session.state.status, "disconnected");
    session.start();
    assert.equal(session.state.status, "disconnected");

    await pair(session);
    await eventually(
      () => delivered.channels.length,
      (count) => count === 2,
      "the next port's channel"
    );
    assert.equal(session.state.status, "connected");
  });

  it("never declares a target in its own hello", async () => {
    const { session } = started();
    const { port1, port2 } = channel();
    const arrived: unknown[] = [];
    port1.addEventListener("message", (event) => arrived.push(event.data));
    port1.start();

    session.attachPort(messagePortSessionPort(port2));
    await eventually(
      () => arrived.length,
      (count) => count === 1,
      "the editor's hello"
    );

    assert.deepEqual(arrived, [
      { type: "makecode:hello", payload: { protocolVersion: MAKECODE_SESSION_PROTOCOL_VERSION } },
    ]);
  });

  it("delivers the asset snapshots of the current port's handshake only", async () => {
    const { session, delivered } = started();
    const first = await pair(session);
    first.publishAssets(ASSETS);
    await eventually(
      () => delivered.assets.length,
      (count) => count === 1,
      "the first port's snapshot"
    );

    const second = await pair(session);
    first.publishAssets([{ ...ASSETS[0], id: "from-the-first-port" }]);
    second.publishAssets([]);
    await eventually(
      () => delivered.assets.length,
      (count) => count === 2,
      "the second port's snapshot"
    );

    assert.deepEqual(delivered.assets, [ASSETS, []]);
  });

  it("delivers the project info of the current port's handshake only", async () => {
    const { session, delivered } = started();
    const first = await pair(session);
    first.publishProjectInfo({ name: "first" });
    await eventually(
      () => delivered.projectInfo.length,
      (count) => count === 1,
      "the first port's project info"
    );

    const second = await pair(session);
    first.publishProjectInfo({ name: "from the first port" });
    second.publishProjectInfo({ name: "second" });
    await eventually(
      () => delivered.projectInfo.length,
      (count) => count === 2,
      "the second port's project info"
    );

    assert.deepEqual(delivered.projectInfo, [{ name: "first" }, { name: "second" }]);
  });

  it("carries the manifest requests on the handshake's port, closing them when the handshake ends", async () => {
    const { session, delivered } = started();
    const peer = await pair(session);
    const writes: unknown[] = [];
    peer.onManifestRequest((request) => {
      if (request.kind === "read") request.reply({ manifest: null });
      else writes.push(request.manifest);
    });
    await eventually(
      () => delivered.channels.length,
      (count) => count === 1,
      "the channel"
    );

    assert.deepEqual(await delivered.channels[0].readManifest(), { manifest: null });
    const written = delivered.channels[0].writeManifest({
      actions: [],
      operators: [],
      types: [],
      next: { action: 1024, operator: 1024, atom: 1024 },
    });
    await eventually(
      () => writes.length,
      (count) => count === 1,
      "the manifest write"
    );
    const closed = assert.rejects(written, (error: unknown) => {
      assert.ok(error instanceof MakeCodeManifestError);
      assert.equal(error.code, MakeCodeManifestErrorCode.CLOSED);
      return true;
    });

    await pair(session);

    await closed;
  });

  it("stays connected across several heartbeat intervals while its counterpart answers every ping", async () => {
    const { session, delivered } = started(HEARTBEAT);
    const { port1, port2 } = channel();
    const arrived: { type?: unknown }[] = [];
    port1.addEventListener("message", (event) => arrived.push(event.data as { type?: unknown }));
    session.attachPort(messagePortSessionPort(port2));
    peers.push(await connectMakeCodeSession({ port: messagePortSessionPort(port1), target: "arcade" }));

    await eventually(
      () => pings(arrived),
      (count) => count >= 3,
      "three pings"
    );

    assert.equal(session.state.status, "connected");
    assert.deepEqual(
      delivered.states.map((state) => state.status),
      ["connected"]
    );
  });

  it("stays connected when its counterpart misses one ping but answers the follow-up, and pings on at the interval", async () => {
    const { session, delivered } = started(HEARTBEAT);
    const arrived = await pairByHand(session, (index) => (index === 0 ? undefined : 0));

    await eventually(
      () => pings(arrived),
      (count) => count >= 3,
      "the interval ping after the follow-up"
    );

    assert.equal(session.state.status, "connected");
    assert.deepEqual(
      delivered.states.map((state) => state.status),
      ["connected"]
    );
  });

  it("stays connected when the pong to a missed ping arrives late, after the follow-up went out", async () => {
    const { session, delivered } = started(HEARTBEAT);
    const late = HEARTBEAT.deadlineMs + HEARTBEAT.deadlineMs / 2;
    const arrived = await pairByHand(session, (index) => (index === 0 ? late : index === 1 ? undefined : 0));

    await eventually(
      () => pings(arrived),
      (count) => count >= 3,
      "the interval ping after the late pong"
    );

    assert.equal(session.state.status, "connected");
    assert.deepEqual(
      delivered.states.map((state) => state.status),
      ["connected"]
    );
  });

  it("ends the handshake when its counterpart leaves two pings in a row unanswered, within the interval plus twice the deadline: disconnected with no error code, its requests rejecting CLOSED", async () => {
    const { session, delivered } = started(HEARTBEAT);
    const changedAt: number[] = [];
    session.onStateChange(() => changedAt.push(Date.now()));
    const arrived = await pairSilent(session);
    await eventually(
      () => delivered.channels.length,
      (count) => count === 1,
      "the channel"
    );
    const pulled = assert.rejects(delivered.channels[0].pullBrains(["unanswered"]), (error: unknown) => {
      assert.ok(error instanceof MakeCodeBrainsError);
      assert.equal(error.code, MakeCodeBrainsErrorCode.CLOSED);
      return true;
    });
    const read = assert.rejects(delivered.channels[0].readManifest(), (error: unknown) => {
      assert.ok(error instanceof MakeCodeManifestError);
      assert.equal(error.code, MakeCodeManifestErrorCode.CLOSED);
      return true;
    });

    await eventually(
      () => session.state.status,
      (status) => status === "disconnected",
      "the second missed deadline"
    );

    await pulled;
    await read;
    assert.equal(pings(arrived), 2);
    assert.deepEqual(session.state, { status: "disconnected", errorCode: undefined, target: undefined });
    assert.deepEqual(
      delivered.states.map((state) => state.status),
      ["connected", "disconnected"]
    );
    const bound = HEARTBEAT.intervalMs + HEARTBEAT.deadlineMs * 2;
    const elapsed = changedAt[1] - changedAt[0];
    assert.ok(elapsed >= bound - 5, `disconnected after ${elapsed} ms, before the ${bound} ms bound`);
    assert.ok(elapsed < bound + HEARTBEAT.deadlineMs, `disconnected after ${elapsed} ms, past the ${bound} ms bound`);
  });

  it("connects again over the next port attached after its counterpart stopped answering", async () => {
    const { session, delivered } = started(HEARTBEAT);
    const silent = await pair(session);
    await eventually(
      () => session.state.status,
      (status) => status === "connected",
      "the first handshake"
    );
    silent.dispose();
    await eventually(
      () => session.state.status,
      (status) => status === "disconnected",
      "the missed deadline"
    );

    await pair(session, "microbit");
    await eventually(
      () => delivered.channels.length,
      (count) => count === 2,
      "the next port's channel"
    );

    assert.equal(session.state.status, "connected");
    assert.equal(session.state.target, "microbit");
    assert.deepEqual(await delivered.channels[1].listBrains(), []);
    assert.deepEqual(
      delivered.states.map((state) => state.status),
      ["connected", "disconnected", "connected"]
    );
  });

  it("pings no more, and publishes no later state, once stopped", async () => {
    const { session, delivered } = started(HEARTBEAT);
    const arrived = await pairSilent(session);
    await eventually(
      () => pings(arrived),
      (count) => count === 1,
      "the first ping"
    );

    session.stop();
    const sent = arrived.length;
    const published = delivered.states.length;
    await new Promise((resolve) => setTimeout(resolve, HEARTBEAT.intervalMs + HEARTBEAT.deadlineMs * 2));

    assert.equal(arrived.length, sent);
    assert.equal(delivered.states.length, published);
    assert.equal(session.state.status, "disconnected");
  });

  it("pings the replaced port no more, and leaves the next port's handshake standing past the replaced ping's deadline, once its port is replaced", async () => {
    const { session, delivered } = started(HEARTBEAT);
    const replaced = await pairSilent(session);
    await eventually(
      () => pings(replaced),
      (count) => count === 1,
      "the first ping"
    );

    await pair(session, "microbit");
    const sent = replaced.length;
    await new Promise((resolve) => setTimeout(resolve, HEARTBEAT.intervalMs + HEARTBEAT.deadlineMs * 2));

    assert.equal(replaced.length, sent);
    assert.equal(session.state.status, "connected");
    assert.deepEqual(
      delivered.states.map((state) => state.status),
      ["connected", "disconnected", "connected"]
    );
  });
});

describe("messagePortSessionPort", () => {
  it("delivers the messages its port receives until unsubscribed", async () => {
    const { port1, port2 } = new MessageChannel();
    const received: unknown[] = [];
    const unsubscribe = messagePortSessionPort(port2).onMessage((message) => received.push(message));
    port1.postMessage({ type: "makecode:catalog", payload: { content: "one" } });
    await eventually(
      () => received.length,
      (count) => count === 1,
      "the first message"
    );

    unsubscribe();
    port1.postMessage({ type: "makecode:catalog", payload: { content: "two" } });
    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.deepEqual(received, [{ type: "makecode:catalog", payload: { content: "one" } }]);
    port1.close();
    port2.close();
  });
});
