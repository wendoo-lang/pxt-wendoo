import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import {
  BridgeSessionErrorCode,
  PeerSessionErrorCode,
  PROTOCOL_VERSION,
  type WsMessage,
} from "@wendoo/bridge-protocol";
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
  brainSourceHash,
  MAKECODE_SESSION_PROTOCOL_VERSION,
  MAKECODE_SESSION_ROLE_PATHS,
  MakeCodeBrainsErrorCode,
  type MakeCodeSessionMessage,
  type MakeCodeWireBrain,
} from "@wendoo/makecode-session";
import {
  type BindingTokenStore,
  bindingTokenStorageKey,
  openBindingTokenStore,
  type TokenStorage,
} from "./binding-token-store.js";
import { SIM_CHANNEL_VERSION, SIMX_CHANNEL, SimChannelErrorCode, type SimxFrame } from "./sim-channel.js";
import { type SimxBridge, type SimxLog, startSimxBridge } from "./simx-bridge.js";
import { SimxStatusModel, type SimxStatusState, type SimxStatusView } from "./status-model.js";
import { FakeProjfsHost, PROJFS_SCOPE_QUOTA_BYTES } from "./test-support/projfs-host.js";
import type { ProjfsClient } from "./vendor/projfs.js";

/**
 * A catalog document exercising characters a JSON wire must carry intact: quotes,
 * backslashes, escape sequences written as text, control characters, and
 * non-ASCII code units including a surrogate pair.
 */
const CATALOG_TEXT =
  '{"packs":[{"name":"beacon","tiles":[{"name":"say \\"hi\\"","kind":"actuator","docs":"line\\nnext \\u00e9"}]}]}' +
  "\t\r\n\u0001 caf\u00e9 \ud83d\ude00 \\";

/** Join-code rotation interval of the relay the rotation spec starts, in milliseconds. */
const ROTATION_MS = 1000;

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

  /**
   * Resolves with the first frame of `type` this socket received that
   * satisfies `matches` (any frame of `type` when omitted), once it has arrived.
   */
  firstReceived(type: string, matches: (message: WsMessage) => boolean = () => true): Promise<WsMessage> {
    const find = () => this._received.find((message) => message.type === type && matches(message));
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

  /** MakeCode delivering the ping the running program posts at startup: a frame with an empty payload. */
  programPings(): void {
    this.programPosts("");
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

  removeItem(key: string): void {
    this.items.delete(key);
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

/**
 * Resolves once `check` holds: at once when it already does, otherwise at
 * the first change `bridge` announces after which it does.
 */
function changed(bridge: SimxBridge, check: () => boolean, what: string): Promise<void> {
  return within(
    new Promise<void>((resolve) => {
      const test = (): void => {
        if (!check()) return;
        unsubscribe();
        resolve();
      };
      const unsubscribe = bridge.onChange(test);
      test();
    }),
    what
  );
}

/**
 * Resolves once the view of `model` satisfies `check`: at once when it
 * already does, otherwise at the first view it publishes that does.
 */
function shown(model: SimxStatusModel, check: (view: SimxStatusView) => boolean, what: string): Promise<void> {
  return within(
    new Promise<void>((resolve) => {
      const test = (): void => {
        if (!check(model.getSnapshot())) return;
        unsubscribe();
        resolve();
      };
      const unsubscribe = model.subscribe(test);
      test();
    }),
    what
  );
}

/** Asserts that `message` is the `session:error` refusing a hello's join code, answering the hello. */
function assertJoinCodeUnknown(message: WsMessage): void {
  assertSessionError(message, BridgeSessionErrorCode.JOIN_CODE_UNKNOWN);
  assert.equal(message.id, "hello");
}

describe("simx bridge on the relay", () => {
  const originalWebSocket = globalThis.WebSocket;
  let relay: TestRelay;
  let frame: FakeFrame;
  let tokens: BindingTokenStore;
  let log: RecordingLog;
  let bridge: SimxBridge | undefined;
  let host: FakeProjfsHost;
  let files: ProjfsClient;

  /** The sockets the simx role path has been connected on, in creation order. */
  function simxSockets(): RecordingWebSocket[] {
    return RecordingWebSocket.created.filter((socket) => socket.url.endsWith(`/${SIMX}`));
  }

  /**
   * Starts the simx bridge against the relay, declaring `target` when one is
   * given, the program posting `catalog` before the bridge's connection opens
   * when one is given, and resolves once the relay has answered the bridge's
   * hello, with its connection and the join code it was answered with.
   */
  async function startSimx(
    catalog?: string,
    target?: string
  ): Promise<{ socket: RecordingWebSocket; joinCode: string }> {
    bridge = startSimxBridge({ frame, bridgeUrl: relay.address, tokens, log, target, files });
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
    host = new FakeProjfsHost();
    files = host.client();
  });

  afterEach(async () => {
    bridge?.dispose();
    bridge = undefined;
    files.dispose();
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
    const welcome = assertWelcome(await editor.hello({ joinCode }));
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
    assertWelcome(await editor.hello({ joinCode }));
    await handshake(editor);

    assert.deepEqual(await editor.nextMessage(), catalogMessage(CATALOG_TEXT));
    frame.programPosts("not a catalog", "other/channel");
    frame.programPosts("{}");
    assert.deepEqual(await editor.nextMessage(), catalogMessage("{}"));
    assert.equal(bridge?.joinCode, undefined);
    assert.ok(log.infos.some((line) => line.includes(joinCode)));
    assert.equal(bridge?.channelVersion, SIM_CHANNEL_VERSION);
    assert.deepEqual(log.errors, []);
  });

  it("declares the MakeCode target it was started with in its makecode hello", async () => {
    const { joinCode } = await startSimx(CATALOG_TEXT, "microbit");

    const editor = await relay.connect(EDITOR);
    assertWelcome(await editor.hello({ joinCode }));
    editor.send(MAKECODE_HELLO);

    assert.deepEqual(await editor.nextMessage(), {
      type: "makecode:hello",
      payload: { protocolVersion: MAKECODE_SESSION_PROTOCOL_VERSION, declaration: { target: "microbit" } },
    });
    assert.deepEqual(await editor.nextMessage(), catalogMessage(CATALOG_TEXT));
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
    const rewelcome = assertWelcome(await returned.hello({ bindingToken: welcome.bindingToken }));
    await handshake(returned);

    assert.deepEqual(await returned.nextMessage(), catalogMessage(CATALOG_TEXT));
    assert.notEqual(renewed, joinCode);
    assert.equal(bridge?.joinCode, undefined);
    assert.ok(log.infos.some((line) => line.includes(renewed)));
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
    const returnedWelcome = assertWelcome(await returned.hello({ bindingToken: welcome.bindingToken }));
    await handshake(returned);

    assert.deepEqual(await returned.nextMessage(), catalogMessage("{}"));
    assert.equal(returnedWelcome.sessionId, welcome.sessionId);
    assert.equal(simxSockets().length, 1);
    assert.equal(bridge?.counterpartAway, false);
  });

  it("rejoins the session the editor holds by its saved binding token when its frame reloads, logging no join code", async () => {
    const { joinCode } = await startSimx(CATALOG_TEXT);
    const { editor, welcome } = await joinEditor(joinCode, CATALOG_TEXT);
    assert.equal(tokens.load(), welcome.bindingToken);

    bridge?.dispose();
    assertCounterpartAway(await editor.nextMessage());
    const vacancyCode = assertJoinCode(await editor.nextMessage());
    frame = new FakeFrame();
    bridge = startSimxBridge({ frame, bridgeUrl: relay.address, tokens, log, files });
    frame.programPosts("{}");
    const rewelcome = assertWelcome(await editor.nextMessage());
    await handshake(editor);

    assert.deepEqual(await editor.nextMessage(), catalogMessage("{}"));
    assert.equal(rewelcome.sessionId, welcome.sessionId);
    assert.equal(bridge.joinCode, undefined);
    assert.notEqual(vacancyCode, joinCode);
    assert.ok(!log.infos.some((line) => line.includes(vacancyCode)));
    assert.equal(simxSockets().length, 2);
  });

  it("takes the join code off its handle at each welcome, showing and logging only the codes sent for a vacancy", async () => {
    const { socket, joinCode } = await startSimx(CATALOG_TEXT);
    const { editor, welcome } = await joinEditor(joinCode, CATALOG_TEXT);
    assert.equal(bridge?.joinCode, undefined);

    await editor.close();
    const vacancyCode = assertJoinCode(
      await socket.firstReceived("session:joinCode", (message) => assertJoinCode(message) !== joinCode)
    );
    assert.equal(bridge?.joinCode, vacancyCode);
    const returned = await relay.connect(EDITOR);
    assertWelcome(await returned.hello({ bindingToken: welcome.bindingToken }));
    await handshake(returned);
    assert.deepEqual(await returned.nextMessage(), catalogMessage(CATALOG_TEXT));

    assert.equal(bridge?.joinCode, undefined);
    assert.deepEqual(log.infos.filter((line) => line.includes(joinCode) || line.includes(vacancyCode)).length, 2);
  });

  it("forgets its binding token when the session is ended, logging the code, so its next start forms a new session", async () => {
    const { socket, joinCode } = await startSimx(CATALOG_TEXT);
    const { editor } = await joinEditor(joinCode, CATALOG_TEXT);
    assert.notEqual(tokens.load(), undefined);

    editor.send({ type: "session:goodbye" });
    assertSessionError(await socket.firstReceived("session:error"), BridgeSessionErrorCode.SESSION_ENDED);
    await within(socket.closed, "the simx's connection to close");
    // Waits out the bridge client's first reconnect attempt.
    await delay(1200);

    assert.equal(tokens.load(), undefined);
    assert.ok(log.errors.some((line) => line.startsWith(BridgeSessionErrorCode.SESSION_ENDED)));
    assert.equal(simxSockets().length, 1);
  });

  it("logs a message from the program declaring a newer channel version or none by its code, and publishes no catalog older than it", async () => {
    const { joinCode } = await startSimx(CATALOG_TEXT);

    frame.programPosts("{}", SIMX_CHANNEL, SIM_CHANNEL_VERSION + 1);
    frame.programPostsText("{}");
    const editor = await relay.connect(EDITOR);
    assertWelcome(await editor.hello({ joinCode }));
    await handshake(editor);
    await editor.ping();

    editor.assertNothingReceived();
    assert.equal(log.errors.length, 2);
    assert.ok(log.errors[0].startsWith(SimChannelErrorCode.VERSION_NEWER));
    assert.ok(log.errors[1].startsWith(SimChannelErrorCode.FRAME_MALFORMED));
    frame.programPosts("{}");
    assert.deepEqual(await editor.nextMessage(), catalogMessage("{}"));
  });

  it("ignores the program's ping, before its catalog and after: it logs nothing and publishes nothing", async () => {
    const { joinCode } = await startSimx();

    frame.programPings();
    const editor = await relay.connect(EDITOR);
    assertWelcome(await editor.hello({ joinCode }));
    await handshake(editor);
    await editor.ping();

    editor.assertNothingReceived();
    assert.equal(bridge?.channelVersion, undefined);
    frame.programPosts(CATALOG_TEXT);
    assert.deepEqual(await editor.nextMessage(), catalogMessage(CATALOG_TEXT));
    frame.programPings();
    await editor.ping();
    editor.assertNothingReceived();
    assert.deepEqual(log.errors, []);
  });

  it("publishes once, into the newest session only, when the editor drops before answering the simx's hello and returns", async () => {
    const { socket, joinCode } = await startSimx(CATALOG_TEXT);
    const editor = await relay.connect(EDITOR);
    const welcome = assertWelcome(await editor.hello({ joinCode }));
    assert.deepEqual(await editor.nextMessage(), MAKECODE_HELLO);

    await editor.close();
    assertCounterpartAway(await socket.firstReceived("session:counterpartAway"));
    const returned = await relay.connect(EDITOR);
    assertWelcome(await returned.hello({ bindingToken: welcome.bindingToken }));
    await handshake(returned);

    assert.deepEqual(await returned.nextMessage(), catalogMessage(CATALOG_TEXT));
    await returned.ping();
    returned.assertNothingReceived();
  });

  it("opens a fresh session on a new connection when the simx's connection drops and it reconnects, logging no join code", async () => {
    const { socket, joinCode } = await startSimx(CATALOG_TEXT);
    const { editor, welcome } = await joinEditor(joinCode, CATALOG_TEXT);

    socket.close();
    assertCounterpartAway(await editor.nextMessage());
    const vacancyCode = assertJoinCode(await editor.nextMessage());
    frame.programPosts("{}");
    const rewelcome = assertWelcome(await editor.nextMessage());
    await handshake(editor);

    assert.deepEqual(await editor.nextMessage(), catalogMessage("{}"));
    assert.deepEqual(rewelcome, welcome);
    assert.ok(!log.infos.some((line) => line.includes(vacancyCode)));
    assert.equal(simxSockets().length, 2);
  });

  it("stays connected when another simx presents the join code, which the relay refuses, leaving the editor undisturbed", async () => {
    const { socket, joinCode } = await startSimx(CATALOG_TEXT);
    const { editor, welcome } = await joinEditor(joinCode, CATALOG_TEXT);
    const socketsBeforeClaimant = simxSockets().length;

    const claimant = await relay.connect(SIMX);
    assertJoinCodeUnknown(await claimant.hello({ joinCode }));
    await within(claimant.closed, "the refused connection to close");
    frame.programPosts("{}");

    assert.deepEqual(await editor.nextMessage(), catalogMessage("{}"));
    assert.equal(socket.readyState, WebSocket.OPEN);
    assert.equal(tokens.load(), welcome.bindingToken);
    assert.equal(simxSockets().length, socketsBeforeClaimant + 1);
  });

  it("stays connected to its editor when another editor presents the join code, which the relay refuses", async () => {
    const { socket, joinCode } = await startSimx(CATALOG_TEXT);
    const { editor, welcome } = await joinEditor(joinCode, CATALOG_TEXT);

    const claimant = await relay.connect(EDITOR);
    assertJoinCodeUnknown(await claimant.hello({ joinCode }));
    await within(claimant.closed, "the refused connection to close");
    frame.programPosts("{}");

    assert.deepEqual(await editor.nextMessage(), catalogMessage("{}"));
    assert.equal(bridge?.counterpartAway, false);
    assert.equal(tokens.load(), welcome.bindingToken);
    assert.equal(socket.readyState, WebSocket.OPEN);
    assert.equal(simxSockets().length, 1);
  });

  it("shows each rotated join code on its handle and in its log", async () => {
    const rotating = await startTestRelay({ bindingSecret: "spec-secret", rotationMs: ROTATION_MS });
    try {
      bridge = startSimxBridge({ frame, bridgeUrl: rotating.address, tokens, log, files });
      const socket = simxSockets().at(-1);
      assert.ok(socket);
      const joinCode = assertJoinCode(await socket.firstReceived("session:joinCode"));

      const rotated = assertJoinCode(
        await socket.firstReceived("session:joinCode", (message) => assertJoinCode(message) !== joinCode)
      );

      assert.equal(bridge.joinCode, rotated);
      assert.ok(log.infos.some((line) => line.includes(rotated)));
    } finally {
      bridge?.dispose();
      bridge = undefined;
      await rotating.close();
    }
  });

  it("stays open for a correct editor after the relay rejects an editor declaring a newer bridge protocol", async () => {
    const { socket, joinCode } = await startSimx(CATALOG_TEXT);

    const newer = await relay.connect(EDITOR);
    assertVersionRejected(await newer.hello({ joinCode, protocolVersion: PROTOCOL_VERSION + 1 }));
    await within(newer.closed, "the rejected connection to close");
    assert.ok(!socket.traffic.includes("in:session:welcome"));

    await joinEditor(joinCode, CATALOG_TEXT);
  });

  it("reports its connection, its counterpart's presence, and whether it holds a binding, announcing each change", async () => {
    bridge = startSimxBridge({ frame, bridgeUrl: relay.address, tokens, log, files });
    const current = bridge;
    let changes = 0;
    current.onChange(() => {
      changes += 1;
    });
    assert.equal(current.connection, "connecting");
    const socket = simxSockets().at(-1);
    assert.ok(socket);
    const joinCode = assertJoinCode(await socket.firstReceived("session:joinCode"));
    await changed(current, () => current.joinCode === joinCode, "the join code to be announced");

    assert.equal(current.connection, "connected");
    assert.equal(current.counterpartConnected, false);
    assert.equal(current.bound, false);
    frame.programPosts(CATALOG_TEXT);
    const { editor } = await joinEditor(joinCode, CATALOG_TEXT);
    assert.equal(current.counterpartConnected, true);
    assert.equal(current.bound, true);

    await editor.close();
    await changed(current, () => current.counterpartAway, "the counterpart to be reported away");
    assert.equal(current.counterpartConnected, false);
    assert.equal(current.bound, true);
    assert.equal(current.errorCode, undefined);
    assert.ok(changes >= 4);
  });

  it("ends its session on purpose and opens a new pairing at once: the editor is told the session ended, and the new pairing's join code arrives", async () => {
    const { socket, joinCode } = await startSimx(CATALOG_TEXT);
    const { editor } = await joinEditor(joinCode, CATALOG_TEXT);

    bridge?.startNewSession();

    assertSessionError(await editor.nextMessage(), BridgeSessionErrorCode.SESSION_ENDED);
    assert.ok(socket.traffic.includes("out:session:goodbye"));
    await within(socket.closed, "the ended connection to close");
    assert.equal(simxSockets().length, 2);
    const fresh = assertJoinCode(await simxSockets()[1].firstReceived("session:joinCode"));
    const current = bridge;
    assert.ok(current);
    await changed(current, () => current.joinCode === fresh, "the new pairing's join code to be announced");
    assert.notEqual(fresh, joinCode);
    assert.equal(current.bound, false);
    assert.equal(current.counterpartConnected, false);
    assert.equal(tokens.load(), undefined);
    assert.ok(log.infos.some((line) => line.includes(fresh)));

    const { welcome } = await joinEditor(fresh, CATALOG_TEXT);
    assert.equal(tokens.load(), welcome.bindingToken);
  });

  it("opens a new pairing when started anew after the editor ended the session", async () => {
    const { socket, joinCode } = await startSimx(CATALOG_TEXT);
    const { editor } = await joinEditor(joinCode, CATALOG_TEXT);
    editor.send({ type: "session:goodbye" });
    assertSessionError(await socket.firstReceived("session:error"), BridgeSessionErrorCode.SESSION_ENDED);
    await within(socket.closed, "the ended connection to close");
    const current = bridge;
    assert.ok(current);
    assert.equal(current.errorCode, BridgeSessionErrorCode.SESSION_ENDED);
    assert.equal(current.connection, "disconnected");

    current.startNewSession();

    assert.equal(current.errorCode, undefined);
    const fresh = assertJoinCode(await simxSockets()[1].firstReceived("session:joinCode"));
    await changed(current, () => current.joinCode === fresh, "the new pairing's join code to be announced");
    assert.ok(!simxSockets()[1].traffic.includes("out:session:goodbye"));
    assert.notEqual(fresh, joinCode);
    await joinEditor(fresh, CATALOG_TEXT);
  });

  it("reports a counterpart declaring a newer makecode protocol by its code, until a later handshake completes", async () => {
    const { socket, joinCode } = await startSimx(CATALOG_TEXT);
    const current = bridge;
    assert.ok(current);
    const editor = await relay.connect(EDITOR);
    const welcome = assertWelcome(await editor.hello({ joinCode }));
    editor.send({
      type: "makecode:hello",
      payload: { protocolVersion: MAKECODE_SESSION_PROTOCOL_VERSION + 1 },
    });

    await changed(
      current,
      () => current.errorCode === PeerSessionErrorCode.PROTOCOL_VERSION_NEWER,
      "the newer protocol to be reported"
    );
    assert.equal(current.counterpartConnected, true);
    assert.ok(log.errors.some((line) => line.startsWith(PeerSessionErrorCode.PROTOCOL_VERSION_NEWER)));
    await editor.close();
    assertCounterpartAway(await socket.firstReceived("session:counterpartAway"));
    assert.equal(current.errorCode, PeerSessionErrorCode.PROTOCOL_VERSION_NEWER);

    const returned = await relay.connect(EDITOR);
    assertWelcome(await returned.hello({ bindingToken: welcome.bindingToken }));
    await handshake(returned);
    assert.deepEqual(await returned.nextMessage(), catalogMessage(CATALOG_TEXT));
    assert.equal(current.errorCode, undefined);
  });

  describe("brains requests", () => {
    /** A brain as the editor pushes it on the wire, its compiled program covering every byte value. */
    function wireBrain(id: string, name: string): MakeCodeWireBrain {
      const source = JSON.stringify({ version: 1, id, name, pages: [] }, null, 2);
      const bytecode = Buffer.from(Uint8Array.from({ length: 256 }, (_, index) => index)).toString("base64");
      return { id, name, source, compiled: { bytecode, sourceHash: brainSourceHash(source) } };
    }

    it("answers the editor's push, list and pull from the project's files, writing both forms", async () => {
      const { joinCode } = await startSimx(CATALOG_TEXT);
      const { editor } = await joinEditor(joinCode, CATALOG_TEXT);
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
      const { joinCode } = await startSimx(CATALOG_TEXT);
      const { editor } = await joinEditor(joinCode, CATALOG_TEXT);
      const chaser = wireBrain("abcdabcdabcdabcd", "Chaser");
      editor.send({ type: "makecode:brainsPush", id: "push-1", payload: { op: "write", brain: chaser } });
      assert.deepEqual(await editor.nextMessage(), { type: "makecode:brainsAck", id: "push-1" });

      bridge?.dispose();
      files.dispose();
      assertCounterpartAway(await editor.nextMessage());
      assertJoinCode(await editor.nextMessage());
      frame = new FakeFrame();
      files = host.client();
      bridge = startSimxBridge({ frame, bridgeUrl: relay.address, tokens, log, files });
      frame.programPosts("{}");
      assertWelcome(await editor.nextMessage());
      await handshake(editor);
      assert.deepEqual(await editor.nextMessage(), catalogMessage("{}"));
      editor.send({ type: "makecode:brainsPull", id: "pull-1", payload: { ids: [chaser.id] } });

      assert.deepEqual(await editor.nextMessage(), {
        type: "makecode:brainsPullReply",
        id: "pull-1",
        payload: { brains: [chaser] },
      });
    });

    it("answers a push the project refuses with WRITE_FAILED, the refusal's code leading its message", async () => {
      const { joinCode } = await startSimx(CATALOG_TEXT);
      const { editor } = await joinEditor(joinCode, CATALOG_TEXT);
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
  });

  describe("frame parameters", () => {
    it("reads the program's messages on the channel it was started with, and asks for the catalog on it", async () => {
      bridge = startSimxBridge({
        frame,
        bridgeUrl: relay.address,
        tokens,
        log,
        files,
        channel: "fork-owner/fork-repo",
      });
      const socket = simxSockets().at(-1);
      assert.ok(socket);
      const joinCode = assertJoinCode(await socket.firstReceived("session:joinCode"));
      frame.programPosts("from the default channel");
      frame.programPosts("from its own channel", "fork-owner/fork-repo");

      await joinEditor(joinCode, "from its own channel");

      assert.deepEqual(frame.posted, [
        { type: "messagepacket", channel: "fork-owner/fork-repo", data: new Uint8Array(0) },
      ]);
    });

    it("forms a new pairing for another project opened in the same tab, and rejoins each project's own session when it returns", async () => {
      const storage = new MemoryStorage();
      tokens = openBindingTokenStore(() => storage, "project-a");
      const { joinCode } = await startSimx(CATALOG_TEXT);
      const { editor, welcome } = await joinEditor(joinCode, CATALOG_TEXT);

      bridge?.dispose();
      assertCounterpartAway(await editor.nextMessage());
      assertJoinCode(await editor.nextMessage());
      frame = new FakeFrame();
      bridge = startSimxBridge({
        frame,
        bridgeUrl: relay.address,
        tokens: openBindingTokenStore(() => storage, "project-b"),
        log,
        files,
      });
      const other = simxSockets().at(-1);
      assert.ok(other);
      const otherCode = assertJoinCode(await other.firstReceived("session:joinCode"));
      assert.equal(bridge.bound, false);
      assert.equal(bridge.joinCode, otherCode);
      assert.notEqual(otherCode, joinCode);

      bridge.dispose();
      frame = new FakeFrame();
      bridge = startSimxBridge({
        frame,
        bridgeUrl: relay.address,
        tokens: openBindingTokenStore(() => storage, "project-a"),
        log,
        files,
      });
      frame.programPosts("{}");
      const rewelcome = assertWelcome(await editor.nextMessage());
      await handshake(editor);

      assert.deepEqual(await editor.nextMessage(), catalogMessage("{}"));
      assert.equal(rewelcome.sessionId, welcome.sessionId);
    });
  });

  describe("tabs sharing the project's token storage", () => {
    /**
     * Starts a simx bridge as a newly opened tab on `project` does: in a new
     * frame, with a new token store over `storage`. Returns the bridge and its frame.
     */
    function openTab(storage: TokenStorage, project: string): { tab: SimxBridge; tabFrame: FakeFrame } {
      const tabFrame = new FakeFrame();
      const tab = startSimxBridge({
        frame: tabFrame,
        bridgeUrl: relay.address,
        tokens: openBindingTokenStore(() => storage, project),
        log,
        files,
      });
      return { tab, tabFrame };
    }

    it("restores the session in a newly opened tab, whose new store finds the token the closed tab saved", async () => {
      const storage = new MemoryStorage();
      tokens = openBindingTokenStore(() => storage, "project-a");
      const { joinCode } = await startSimx(CATALOG_TEXT);
      const { editor, welcome } = await joinEditor(joinCode, CATALOG_TEXT);

      bridge?.dispose();
      assertCounterpartAway(await editor.nextMessage());
      const vacancyCode = assertJoinCode(await editor.nextMessage());
      const { tab, tabFrame } = openTab(storage, "project-a");
      bridge = tab;
      tabFrame.programPosts("{}");
      const rewelcome = assertWelcome(await editor.nextMessage());
      await handshake(editor);

      assert.deepEqual(await editor.nextMessage(), catalogMessage("{}"));
      assert.equal(rewelcome.sessionId, welcome.sessionId);
      assert.equal(tab.joinCode, undefined);
      assert.ok(!log.infos.some((line) => line.includes(vacancyCode)));
    });

    it("hands the session to the newer of two tabs on one project: the older rests on replaced, never reconnecting, and leaves the token stored", async () => {
      const storage = new MemoryStorage();
      const key = bindingTokenStorageKey("project-a");
      tokens = openBindingTokenStore(() => storage, "project-a");
      const { socket: olderSocket, joinCode } = await startSimx(CATALOG_TEXT);
      const older = bridge;
      assert.ok(older);
      const olderModel = new SimxStatusModel(older, { awayGraceMs: 50 });
      const { editor, welcome } = await joinEditor(joinCode, CATALOG_TEXT);
      const { tab: newer, tabFrame: newerFrame } = openTab(storage, "project-a");
      let latest: SimxBridge | undefined;
      try {
        newerFrame.programPosts("{}");
        assertSessionError(await olderSocket.firstReceived("session:error"), BridgeSessionErrorCode.SESSION_REPLACED);
        const rewelcome = assertWelcome(await editor.nextMessage());
        await handshake(editor);
        assert.deepEqual(await editor.nextMessage(), catalogMessage("{}"));
        await shown(olderModel, (view) => view.state === "replaced", "the replaced state");

        olderModel.startNewSession();
        olderModel.requestEnd();
        olderModel.confirmEnd();
        // Waits out the bridge client's first reconnect attempt.
        await delay(1200);

        assert.equal(rewelcome.sessionId, welcome.sessionId);
        assert.equal(older.errorCode, BridgeSessionErrorCode.SESSION_REPLACED);
        assert.equal(older.connection, "disconnected");
        assert.equal(olderModel.getSnapshot().state, "replaced");
        assert.equal(simxSockets().length, 2);
        assert.equal(storage.items.get(key), welcome.bindingToken);
        assert.equal(newer.counterpartConnected, true);
        assert.ok(log.errors.some((line) => line.startsWith(BridgeSessionErrorCode.SESSION_REPLACED)));

        newer.dispose();
        assertCounterpartAway(await editor.nextMessage());
        assertJoinCode(await editor.nextMessage());
        const reopened = openTab(storage, "project-a");
        latest = reopened.tab;
        reopened.tabFrame.programPosts(CATALOG_TEXT);
        assert.equal(assertWelcome(await editor.nextMessage()).sessionId, welcome.sessionId);
        await handshake(editor);
        assert.deepEqual(await editor.nextMessage(), catalogMessage(CATALOG_TEXT));
        assert.equal(storage.items.get(key), welcome.bindingToken);
      } finally {
        olderModel.dispose();
        newer.dispose();
        latest?.dispose();
      }
    });
  });

  describe("status model over the bridge", () => {
    /** Starts the simx with `CATALOG_TEXT` posted and a status model over it, grace `awayGraceMs`, recording each state it shows. */
    async function startWatched(
      awayGraceMs: number
    ): Promise<{ model: SimxStatusModel; states: SimxStatusState[]; socket: RecordingWebSocket; joinCode: string }> {
      const { socket, joinCode } = await startSimx(CATALOG_TEXT);
      assert.ok(bridge);
      const model = new SimxStatusModel(bridge, { awayGraceMs });
      const states: SimxStatusState[] = [model.getSnapshot().state];
      model.subscribe(() => states.push(model.getSnapshot().state));
      return { model, states, socket, joinCode };
    }

    it("shows the join code until the welcome, then connected, and after a confirmed end the new pairing's code", async () => {
      const { model, joinCode } = await startWatched(50);
      await shown(model, (view) => view.joinCode === joinCode, "the join code to be shown");
      const { editor } = await joinEditor(joinCode, CATALOG_TEXT);
      await shown(model, (view) => view.state === "connected", "the connected state");

      model.requestEnd();
      assert.equal(model.getSnapshot().state, "confirm");
      model.confirmEnd();

      assertSessionError(await editor.nextMessage(), BridgeSessionErrorCode.SESSION_ENDED);
      await shown(
        model,
        (view) => view.state === "code" && view.joinCode !== joinCode,
        "the new pairing's code to be shown"
      );
      assert.equal(model.getSnapshot().joinCode, bridge?.joinCode);
      model.dispose();
    });

    it("shows ended when the editor ends the session, and the new pairing's code once a new session is started", async () => {
      const { model, joinCode } = await startWatched(50);
      const { editor } = await joinEditor(joinCode, CATALOG_TEXT);

      editor.send({ type: "session:goodbye" });
      await shown(model, (view) => view.state === "ended", "the ended state");
      model.startNewSession();

      await shown(model, (view) => view.state === "code" && view.joinCode !== joinCode, "the new pairing's code");
      model.dispose();
    });

    it("never shows away while the editor reloads and returns by its token within the grace", async () => {
      const { model, states, socket, joinCode } = await startWatched(1500);
      const { editor, welcome } = await joinEditor(joinCode, CATALOG_TEXT);

      await editor.close();
      assertCounterpartAway(await socket.firstReceived("session:counterpartAway"));
      const returned = await relay.connect(EDITOR);
      assertWelcome(await returned.hello({ bindingToken: welcome.bindingToken }));
      await handshake(returned);
      assert.deepEqual(await returned.nextMessage(), catalogMessage(CATALOG_TEXT));
      await delay(1600);

      assert.ok(!states.includes("away"));
      assert.equal(model.getSnapshot().state, "connected");
      model.dispose();
    });

    it("shows away, never a code, once the editor stays gone past the grace", async () => {
      const { model, states, joinCode } = await startWatched(50);
      const { editor } = await joinEditor(joinCode, CATALOG_TEXT);
      const connectedAt = states.length;

      await editor.close();
      await shown(model, (view) => view.state === "away", "the away state");
      await delay(100);

      assert.ok(bridge?.joinCode !== undefined);
      assert.ok(!states.slice(connectedAt).includes("code"));
      model.dispose();
    });

    it("shows away, never a code, when its frame reloads while the editor is gone", async () => {
      const { joinCode } = await startSimx(CATALOG_TEXT);
      const { editor } = await joinEditor(joinCode, CATALOG_TEXT);
      await editor.close();
      bridge?.dispose();

      frame = new FakeFrame();
      bridge = startSimxBridge({ frame, bridgeUrl: relay.address, tokens, log, files });
      const model = new SimxStatusModel(bridge, { awayGraceMs: 50 });
      const states: SimxStatusState[] = [model.getSnapshot().state];
      model.subscribe(() => states.push(model.getSnapshot().state));
      const current = bridge;
      await changed(current, () => current.joinCode !== undefined, "the relay to answer with the editor's vacancy");
      await shown(model, (view) => view.state === "away", "the away state");

      assert.ok(!states.includes("code"));
      model.dispose();
    });
  });

  describe("before pairing", () => {
    it("drops a makecode hello sent by an unpaired member: the editor that pairs afterwards never receives it", async () => {
      const early = await relay.connect(SIMX);
      const joinCode = assertJoinCode(await early.hello());
      early.send(MAKECODE_HELLO);
      await early.ping();

      const editor = await relay.connect(EDITOR);
      assertWelcome(await editor.hello({ joinCode }));
      assertWelcome(await early.nextMessage());
      await editor.ping();

      editor.assertNothingReceived();
    });

    it("sends nothing but its session hello until it is welcomed", async () => {
      const { socket, joinCode } = await startSimx(CATALOG_TEXT);
      const editor = await relay.connect(EDITOR);
      assertWelcome(await editor.hello({ joinCode }));
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
