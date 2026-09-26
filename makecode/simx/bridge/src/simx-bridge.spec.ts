import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { BridgeSessionErrorCode, PROTOCOL_VERSION, type WsMessage } from "@wendoo/bridge-protocol";
import {
  assertCounterpartAway,
  assertJoinCode,
  assertSessionError,
  assertVersionRejected,
  assertWelcome,
  delay,
  type ScriptedPeer,
  startTestRelay,
  type TestRelay,
  type Welcome,
  within,
} from "@wendoo/bridge-session/testing";
import {
  MAKECODE_SESSION_PROTOCOL_VERSION,
  MAKECODE_SESSION_ROLE_PATHS,
  type MakeCodeSessionMessage,
} from "@wendoo/makecode-session";
import { type BindingTokenStore, openBindingTokenStore, type TokenStorage } from "./binding-token-store.js";
import { SIM_CHANNEL_VERSION, SIMX_CHANNEL, SimChannelErrorCode, type SimxFrame } from "./sim-channel.js";
import { type SimxBridge, type SimxLog, startSimxBridge } from "./simx-bridge.js";

/**
 * A catalog document exercising characters a JSON wire must carry intact: quotes,
 * backslashes, escape sequences written as text, control characters, and
 * non-ASCII code units including a surrogate pair.
 */
const CATALOG_TEXT =
  '{"packs":[{"name":"beacon","tiles":[{"name":"say \\"hi\\"","kind":"actuator","docs":"line\\nnext \\u00e9"}]}]}' +
  "\t\r\n\u0001 caf\u00e9 \ud83d\ude00 \\";

/** The relay path of the simx role. */
const SIMX = MAKECODE_SESSION_ROLE_PATHS.simx;

/** The relay path of the editor role. */
const EDITOR = MAKECODE_SESSION_ROLE_PATHS.editor;

/** The hello each party of a makecode session at this build's version sends. */
const MAKECODE_HELLO: MakeCodeSessionMessage = {
  type: "makecode:hello",
  payload: { protocolVersion: MAKECODE_SESSION_PROTOCOL_VERSION },
};

/** The `makecode:catalog` message publishing `content`. */
function catalogMessage(content: string): MakeCodeSessionMessage {
  return { type: "makecode:catalog", payload: { content } };
}

/**
 * A WebSocket, installed as the global WebSocket for these specs, that records
 * every instance created and every text frame each one sends and receives.
 */
class RecordingWebSocket extends WebSocket {
  /** Every socket created, in creation order. */
  static readonly created: RecordingWebSocket[] = [];

  /** The type of every text frame this socket sent and received, in order, as `out:<type>` or `in:<type>`. */
  readonly traffic: string[] = [];
  /** Resolves when the connection has closed, from either side. */
  readonly closed: Promise<void>;
  private readonly _received: WsMessage[] = [];
  private readonly _arrivals = new Set<() => void>();

  constructor(url: string | URL, protocols?: string | string[]) {
    super(url, protocols);
    RecordingWebSocket.created.push(this);
    this.closed = new Promise((resolve) => {
      this.addEventListener("close", () => {
        resolve();
      });
    });
    this.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as WsMessage;
      this._received.push(message);
      this.traffic.push(`in:${message.type}`);
      for (const arrival of this._arrivals) arrival();
    });
  }

  override send(data: Parameters<WebSocket["send"]>[0]): void {
    if (typeof data === "string") {
      this.traffic.push(`out:${(JSON.parse(data) as WsMessage).type}`);
    }
    super.send(data);
  }

  /** Resolves with the first frame of `type` this socket received, once it has arrived. */
  firstReceived(type: string): Promise<WsMessage> {
    const find = () => this._received.find((message) => message.type === type);
    return within(
      new Promise((resolve) => {
        const arrival = () => {
          const found = find();
          if (found === undefined) return;
          this._arrivals.delete(arrival);
          resolve(found);
        };
        this._arrivals.add(arrival);
        arrival();
      }),
      `a ${type} frame`
    );
  }
}

/** The window of a simulator extension frame, driven by the spec in place of MakeCode. */
class FakeFrame implements SimxFrame {
  private readonly _listeners = new Set<(event: { data: unknown }) => void>();
  /** Every message the extension posted to MakeCode. */
  readonly posted: unknown[] = [];
  readonly parent = {
    postMessage: (message: unknown) => {
      this.posted.push(message);
    },
  };

  addEventListener(_type: "message", listener: (event: { data: unknown }) => void): void {
    this._listeners.add(listener);
  }

  removeEventListener(_type: "message", listener: (event: { data: unknown }) => void): void {
    this._listeners.delete(listener);
  }

  /**
   * MakeCode delivering the catalog message the running program posted on
   * `channel`: `catalog` framed under channel version `version`, as UTF-8
   * bytes.
   */
  programPosts(catalog: string, channel = SIMX_CHANNEL, version = SIM_CHANNEL_VERSION): void {
    this.programPostsText(`${version}\n${catalog}`, channel);
  }

  /** MakeCode delivering a message the running program posted on `channel` with `text` as its UTF-8 bytes. */
  programPostsText(text: string, channel = SIMX_CHANNEL): void {
    const packet = {
      type: "messagepacket",
      broadcast: true,
      channel,
      data: new TextEncoder().encode(text),
      srcFrameIndex: 0,
    };
    for (const listener of this._listeners) {
      listener({ data: packet });
    }
  }
}

/** Web storage holding its items in memory. */
class MemoryStorage implements TokenStorage {
  readonly items = new Map<string, string>();

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}

/** A log recording every line written to it, by level. */
class RecordingLog implements SimxLog {
  readonly infos: string[] = [];
  readonly errors: string[] = [];

  info(message: string): void {
    this.infos.push(message);
  }

  error(message: string): void {
    this.errors.push(message);
  }
}

/**
 * Runs the editor's side of the makecode handshake after a welcome, as an
 * editor endpoint does: sends the editor's hello, then asserts that the next
 * frame the editor receives is the simx's hello.
 */
async function handshake(editor: ScriptedPeer): Promise<void> {
  editor.send(MAKECODE_HELLO);
  assert.deepEqual(await editor.nextMessage(), MAKECODE_HELLO);
}

describe("simx bridge on the relay", () => {
  const originalWebSocket = globalThis.WebSocket;
  let relay: TestRelay;
  let frame: FakeFrame;
  let tokens: BindingTokenStore;
  let log: RecordingLog;
  let bridge: SimxBridge | undefined;

  /** The sockets the simx role path has been connected on, in creation order. */
  function simxSockets(): RecordingWebSocket[] {
    return RecordingWebSocket.created.filter((socket) => socket.url.endsWith(`/${SIMX}`));
  }

  /**
   * Starts the simx bridge against the relay, the program posting `catalog`
   * before the bridge's connection opens when one is given, and resolves once
   * the relay has answered the bridge's hello, with its connection and the
   * join code it was answered with.
   */
  async function startSimx(catalog?: string): Promise<{ socket: RecordingWebSocket; joinCode: string }> {
    bridge = startSimxBridge({ frame, bridgeUrl: relay.address, tokens, log });
    if (catalog !== undefined) frame.programPosts(catalog);
    const socket = simxSockets().at(-1);
    assert.ok(socket);
    const joinCode = assertJoinCode(await socket.firstReceived("session:joinCode"));
    return { socket, joinCode };
  }

  before(async () => {
    (globalThis as Record<string, unknown>).WebSocket = RecordingWebSocket;
    relay = await startTestRelay({ bindingSecret: "spec-secret" });
  });

  beforeEach(() => {
    RecordingWebSocket.created.length = 0;
    frame = new FakeFrame();
    tokens = openBindingTokenStore(() => new MemoryStorage());
    log = new RecordingLog();
  });

  afterEach(async () => {
    bridge?.dispose();
    bridge = undefined;
    await relay.closePeers();
  });

  after(async () => {
    await relay.close();
    (globalThis as Record<string, unknown>).WebSocket = originalWebSocket;
  });

  /**
   * Connects a scripted editor presenting `joinCode`, runs its handshake with
   * the simx on the welcome, and resolves once the editor has received
   * `catalog`, with the editor and its welcome.
   */
  async function joinEditor(joinCode: string, catalog: string): Promise<{ editor: ScriptedPeer; welcome: Welcome }> {
    const editor = await relay.connect(EDITOR);
    assert.equal(assertJoinCode(await editor.hello({ joinCode })), joinCode);
    const welcome = assertWelcome(await editor.nextMessage());
    await handshake(editor);
    assert.deepEqual(await editor.nextMessage(), catalogMessage(catalog));
    return { editor, welcome };
  }

  it("connects at the makecode simx role path and asks the program for its catalog", async () => {
    const { socket } = await startSimx();

    assert.equal(socket.url, `ws://${relay.address}/${SIMX}`);
    assert.deepEqual(frame.posted, [{ type: "messagepacket", channel: SIMX_CHANNEL, data: new Uint8Array(0) }]);
  });

  it("pairs simx-first: an editor joining by the simx's join code completes the handshake and receives the catalog byte-verbatim", async () => {
    const { joinCode } = await startSimx(CATALOG_TEXT);

    const editor = await relay.connect(EDITOR);
    assert.equal(assertJoinCode(await editor.hello({ joinCode })), joinCode);
    assertWelcome(await editor.nextMessage());
    await handshake(editor);

    assert.deepEqual(await editor.nextMessage(), catalogMessage(CATALOG_TEXT));
    frame.programPosts("not a catalog", "other/channel");
    frame.programPosts("{}");
    assert.deepEqual(await editor.nextMessage(), catalogMessage("{}"));
    assert.equal(bridge?.joinCode, joinCode);
    assert.ok(log.infos.some((line) => line.includes(joinCode)));
    assert.equal(bridge?.channelVersion, SIM_CHANNEL_VERSION);
    assert.deepEqual(log.errors, []);
  });

  it("rebuilds its session by its saved binding token after a relay restart, logging the new join code, and publishes the catalog to the editor returning by its token", async () => {
    const { joinCode } = await startSimx(CATALOG_TEXT);
    const { editor, welcome } = await joinEditor(joinCode, CATALOG_TEXT);

    await relay.restart();
    await within(editor.closed, "the editor's connection to close");
    // Waits out the bridge client's first reconnect attempt.
    await delay(1200);
    assert.equal(simxSockets().length, 2);
    const renewed = assertJoinCode(await simxSockets()[1].firstReceived("session:joinCode"));
    const returned = await relay.connect(EDITOR);
    assert.equal(assertJoinCode(await returned.hello({ bindingToken: welcome.bindingToken })), renewed);
    const rewelcome = assertWelcome(await returned.nextMessage());
    await handshake(returned);

    assert.deepEqual(await returned.nextMessage(), catalogMessage(CATALOG_TEXT));
    assert.notEqual(renewed, joinCode);
    assert.equal(bridge?.joinCode, renewed);
    assert.ok(log.infos.some((line) => line.includes(renewed)));
    assert.equal(rewelcome.joinCode, renewed);
    assert.notEqual(rewelcome.sessionId, welcome.sessionId);
    assert.equal(tokens.load(), welcome.bindingToken);
  });

  it("opens a fresh session when the editor returns and publishes the latest catalog into it", async () => {
    const { socket, joinCode } = await startSimx(CATALOG_TEXT);
    const { editor, welcome } = await joinEditor(joinCode, CATALOG_TEXT);

    assert.equal(bridge?.counterpartAway, false);
    await editor.close();
    assertCounterpartAway(await socket.firstReceived("session:counterpartAway"));
    assert.equal(bridge?.counterpartAway, true);
    frame.programPosts("{}");
    const returned = await relay.connect(EDITOR);
    assertJoinCode(await returned.hello({ bindingToken: welcome.bindingToken }));
    const returnedWelcome = assertWelcome(await returned.nextMessage());
    await handshake(returned);

    assert.deepEqual(await returned.nextMessage(), catalogMessage("{}"));
    assert.equal(returnedWelcome.sessionId, welcome.sessionId);
    assert.equal(simxSockets().length, 1);
    assert.equal(bridge?.counterpartAway, false);
  });

  it("rejoins the session the editor holds by its saved binding token when its frame reloads", async () => {
    const { joinCode } = await startSimx(CATALOG_TEXT);
    const { editor, welcome } = await joinEditor(joinCode, CATALOG_TEXT);
    assert.equal(tokens.load(), welcome.bindingToken);

    bridge?.dispose();
    assertCounterpartAway(await editor.nextMessage());
    frame = new FakeFrame();
    bridge = startSimxBridge({ frame, bridgeUrl: relay.address, tokens, log });
    frame.programPosts("{}");
    const rewelcome = assertWelcome(await editor.nextMessage());
    await handshake(editor);

    assert.deepEqual(await editor.nextMessage(), catalogMessage("{}"));
    assert.equal(rewelcome.sessionId, welcome.sessionId);
    assert.equal(bridge.joinCode, joinCode);
    assert.equal(simxSockets().length, 2);
  });

  it("logs a message from the program declaring a newer channel version or none by its code, and publishes no catalog older than it", async () => {
    const { joinCode } = await startSimx(CATALOG_TEXT);

    frame.programPosts("{}", SIMX_CHANNEL, SIM_CHANNEL_VERSION + 1);
    frame.programPostsText("{}");
    const editor = await relay.connect(EDITOR);
    assertJoinCode(await editor.hello({ joinCode }));
    assertWelcome(await editor.nextMessage());
    await handshake(editor);
    await editor.ping();

    editor.assertNothingReceived();
    assert.equal(log.errors.length, 2);
    assert.ok(log.errors[0].startsWith(SimChannelErrorCode.VERSION_NEWER));
    assert.ok(log.errors[1].startsWith(SimChannelErrorCode.FRAME_MALFORMED));
    frame.programPosts("{}");
    assert.deepEqual(await editor.nextMessage(), catalogMessage("{}"));
  });

  it("publishes once, into the newest session only, when the editor drops before answering the simx's hello and returns", async () => {
    const { socket, joinCode } = await startSimx(CATALOG_TEXT);
    const editor = await relay.connect(EDITOR);
    assertJoinCode(await editor.hello({ joinCode }));
    const welcome = assertWelcome(await editor.nextMessage());
    assert.deepEqual(await editor.nextMessage(), MAKECODE_HELLO);

    await editor.close();
    assertCounterpartAway(await socket.firstReceived("session:counterpartAway"));
    const returned = await relay.connect(EDITOR);
    assertJoinCode(await returned.hello({ bindingToken: welcome.bindingToken }));
    assertWelcome(await returned.nextMessage());
    await handshake(returned);

    assert.deepEqual(await returned.nextMessage(), catalogMessage(CATALOG_TEXT));
    await returned.ping();
    returned.assertNothingReceived();
  });

  it("opens a fresh session on a new connection when the simx's connection drops and it reconnects", async () => {
    const { socket, joinCode } = await startSimx(CATALOG_TEXT);
    const { editor, welcome } = await joinEditor(joinCode, CATALOG_TEXT);

    socket.close();
    assertCounterpartAway(await editor.nextMessage());
    frame.programPosts("{}");
    const rewelcome = assertWelcome(await editor.nextMessage());
    await handshake(editor);

    assert.deepEqual(await editor.nextMessage(), catalogMessage("{}"));
    assert.deepEqual(rewelcome, welcome);
    assert.equal(simxSockets().length, 2);
  });

  it("holds without reconnecting when a new claimant of the simx role replaces it, while the editor is carried to the claimant", async () => {
    const { socket, joinCode } = await startSimx(CATALOG_TEXT);
    const { editor, welcome } = await joinEditor(joinCode, CATALOG_TEXT);

    const claimant = await relay.connect(SIMX);
    assert.equal(assertJoinCode(await claimant.hello({ joinCode })), joinCode);
    assertSessionError(await socket.firstReceived("session:error"), BridgeSessionErrorCode.SESSION_REPLACED);
    await within(socket.closed, "the replaced connection to close");
    assert.doesNotThrow(() => {
      frame.programPosts("{}");
    });
    const carried = assertWelcome(await editor.nextMessage());
    assert.equal(assertWelcome(await claimant.nextMessage()).sessionId, carried.sessionId);
    const socketsAfterReplacement = simxSockets().length;
    // Waits out the bridge client's first reconnect attempt.
    await delay(1200);

    assert.notEqual(carried.sessionId, welcome.sessionId);
    assert.equal(carried.joinCode, joinCode);
    assert.equal(simxSockets().length, socketsAfterReplacement);
  });

  it("is carried into the session a new editor claimant opens, on its open connection: saves the new token and publishes the latest catalog", async () => {
    const { socket, joinCode } = await startSimx(CATALOG_TEXT);
    const { editor, welcome } = await joinEditor(joinCode, CATALOG_TEXT);
    frame.programPosts("{}");
    assert.deepEqual(await editor.nextMessage(), catalogMessage("{}"));

    const claimant = await relay.connect(EDITOR);
    assert.equal(assertJoinCode(await claimant.hello({ joinCode })), joinCode);
    assertSessionError(await editor.nextMessage(), BridgeSessionErrorCode.SESSION_REPLACED);
    const claimantWelcome = assertWelcome(await claimant.nextMessage());
    await handshake(claimant);

    assert.deepEqual(await claimant.nextMessage(), catalogMessage("{}"));
    assert.notEqual(claimantWelcome.sessionId, welcome.sessionId);
    assert.equal(tokens.load(), claimantWelcome.bindingToken);
    assert.notEqual(claimantWelcome.bindingToken, welcome.bindingToken);
    assert.equal(bridge?.joinCode, joinCode);
    assert.equal(socket.readyState, WebSocket.OPEN);
    assert.equal(simxSockets().length, 1);
  });

  it("stays open for a correct editor after the relay rejects an editor declaring a newer bridge protocol", async () => {
    const { socket, joinCode } = await startSimx(CATALOG_TEXT);

    const newer = await relay.connect(EDITOR);
    assertVersionRejected(await newer.hello({ joinCode, protocolVersion: PROTOCOL_VERSION + 1 }));
    await within(newer.closed, "the rejected connection to close");
    assert.ok(!socket.traffic.includes("in:session:welcome"));

    await joinEditor(joinCode, CATALOG_TEXT);
  });

  describe("before pairing", () => {
    it("drops a makecode hello sent by an unpaired member: the editor that pairs afterwards never receives it", async () => {
      const early = await relay.connect(SIMX);
      const joinCode = assertJoinCode(await early.hello());
      early.send(MAKECODE_HELLO);
      await early.ping();

      const editor = await relay.connect(EDITOR);
      assertJoinCode(await editor.hello({ joinCode }));
      assertWelcome(await editor.nextMessage());
      assertWelcome(await early.nextMessage());
      await editor.ping();

      editor.assertNothingReceived();
    });

    it("sends nothing but its session hello until it is welcomed", async () => {
      const { socket, joinCode } = await startSimx(CATALOG_TEXT);
      const editor = await relay.connect(EDITOR);
      assertJoinCode(await editor.hello({ joinCode }));
      assertWelcome(await editor.nextMessage());
      await socket.firstReceived("session:welcome");

      assert.deepEqual(socket.traffic.slice(0, socket.traffic.indexOf("in:session:welcome")), [
        "out:session:hello",
        "in:session:joinCode",
      ]);
      await handshake(editor);
      assert.deepEqual(await editor.nextMessage(), catalogMessage(CATALOG_TEXT));
    });
  });
});
