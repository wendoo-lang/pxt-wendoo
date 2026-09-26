import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { type AppBridge, BridgeSessionErrorCode, createAppBridge, PeerSessionErrorCode } from "@wendoo/bridge-app";
import {
  assertCounterpartAway,
  assertJoinCode,
  assertSessionError,
  assertWelcome,
  delay,
  type ScriptedPeer,
  startTestRelay,
  type TestRelay,
  type Welcome,
  within,
} from "@wendoo/bridge-session/testing";
import {
  createEditorSessionOver,
  createMakeCodeEditorSession,
  type MakeCodeEditorSession,
  type MakeCodeEditorSessionOptions,
  type MakeCodeEditorSessionState,
} from "./makecode-editor-session.js";
import {
  MAKECODE_SESSION_PROTOCOL_VERSION,
  MAKECODE_SESSION_ROLE_PATHS,
  type MakeCodeSessionMessage,
} from "./makecode-session.js";

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

/** Join-code rotation interval of the relay the rotation spec starts, in milliseconds. */
const ROTATION_MS = 1000;

/** How many payload messages overflow an app bridge's outbound queue while its connection is down. */
const QUEUE_OVERFLOW_COUNT = 1001;

/**
 * A WebSocket, installed as the global WebSocket for these specs, that
 * records every instance created, every text frame each one sends, and the
 * type of every text frame each one receives.
 */
class RecordingWebSocket extends WebSocket {
  /** Every socket created, in creation order. */
  static readonly created: RecordingWebSocket[] = [];

  /** Every text frame this socket sent, parsed. */
  readonly sent: { type: string; payload?: Record<string, unknown> }[] = [];
  private readonly _receivedTypes: string[] = [];
  private readonly _arrivals = new Set<() => void>();

  constructor(url: string | URL, protocols?: string | string[]) {
    super(url, protocols);
    RecordingWebSocket.created.push(this);
    this.addEventListener("message", (event) => {
      this._receivedTypes.push((JSON.parse(String(event.data)) as { type: string }).type);
      for (const arrival of this._arrivals) arrival();
    });
  }

  override send(data: Parameters<WebSocket["send"]>[0]): void {
    if (typeof data === "string") this.sent.push(JSON.parse(data));
    super.send(data);
  }

  /** Resolves once this socket has received a text frame of `type`. */
  received(type: string): Promise<void> {
    return within(
      new Promise((resolve) => {
        const arrival = () => {
          if (!this._receivedTypes.includes(type)) return;
          this._arrivals.delete(arrival);
          resolve();
        };
        this._arrivals.add(arrival);
        arrival();
      }),
      `a ${type} frame`
    );
  }
}

/** The sockets opened at the editor role path, in creation order. */
function editorSockets(): RecordingWebSocket[] {
  return RecordingWebSocket.created.filter((socket) => socket.url.endsWith(`/${EDITOR}`));
}

/** The payload of the `session:hello` the newest editor socket sent. */
function lastEditorHello(): Record<string, unknown> | undefined {
  return editorSockets()
    .at(-1)
    ?.sent.find((frame) => frame.type === "session:hello")?.payload;
}

/** Resolves with the session's state once it satisfies `predicate`. */
function until(
  session: MakeCodeEditorSession,
  predicate: (state: MakeCodeEditorSessionState) => boolean,
  what: string
): Promise<MakeCodeEditorSessionState> {
  return within(
    new Promise((resolve) => {
      if (predicate(session.state)) {
        resolve(session.state);
        return;
      }
      const unsubscribe = session.onStateChange((state) => {
        if (!predicate(state)) return;
        unsubscribe();
        resolve(state);
      });
    }),
    what
  );
}

/** Resolves with the next catalog the session delivers. */
function nextCatalog(session: MakeCodeEditorSession): Promise<string> {
  return within(
    new Promise((resolve) => {
      const unsubscribe = session.onCatalog((content) => {
        unsubscribe();
        resolve(content);
      });
    }),
    "a catalog"
  );
}

/** Asserts that `message` is the `session:error` refusing a hello's join code, answering the hello. */
function assertJoinCodeUnknown(message: Parameters<typeof assertSessionError>[0]): void {
  assertSessionError(message, BridgeSessionErrorCode.JOIN_CODE_UNKNOWN);
  assert.equal(message.id, "hello");
}

/**
 * Runs the simx's side of the makecode handshake after a welcome, as the simx
 * endpoint does: sends the simx's hello, asserts that the next frame the simx
 * receives is the editor's hello, then publishes `catalog`.
 */
async function simxHandshake(simx: ScriptedPeer, catalog: string): Promise<void> {
  simx.send(MAKECODE_HELLO);
  assert.deepEqual(await simx.nextMessage(), MAKECODE_HELLO);
  simx.send(catalogMessage(catalog));
}

describe("makecode editor session on the relay", () => {
  const originalWebSocket = globalThis.WebSocket;
  let relay: TestRelay;
  let sessions: MakeCodeEditorSession[];

  before(async () => {
    (globalThis as Record<string, unknown>).WebSocket = RecordingWebSocket;
    relay = await startTestRelay({ bindingSecret: "spec-secret" });
  });

  beforeEach(() => {
    RecordingWebSocket.created.length = 0;
    sessions = [];
  });

  afterEach(async () => {
    for (const session of sessions) session.stop();
    await relay.closePeers();
  });

  after(async () => {
    await relay.close();
    (globalThis as Record<string, unknown>).WebSocket = originalWebSocket;
  });

  /** Creates an editor session against the relay, stopped by the spec's cleanup. */
  function editorSession(options: MakeCodeEditorSessionOptions): MakeCodeEditorSession {
    const session = createMakeCodeEditorSession({ bridgeUrl: relay.address, ...options });
    sessions.push(session);
    return session;
  }

  /** Connects a scripted simx with no credentials and returns it with the join code the relay issued it. */
  async function connectSimx(): Promise<{ simx: ScriptedPeer; joinCode: string }> {
    const simx = await relay.connect(SIMX);
    return { simx, joinCode: assertJoinCode(await simx.hello()) };
  }

  /**
   * Forms a session: a scripted simx, then an editor session joining by the
   * simx's join code. Resolves once the handshake has run and the editor has
   * received `catalog`, with the simx, the editor session, the simx's welcome,
   * and every binding token the editor session saved.
   */
  async function formSession(catalog: string): Promise<{
    simx: ScriptedPeer;
    session: MakeCodeEditorSession;
    joinCode: string;
    welcome: Welcome;
    saved: string[];
  }> {
    const { simx, joinCode } = await connectSimx();
    const saved: string[] = [];
    const session = editorSession({
      joinCode,
      saveBindingToken: (token) => {
        saved.push(token);
      },
    });
    const received = nextCatalog(session);
    session.start();
    const welcome = assertWelcome(await simx.nextMessage());
    await simxHandshake(simx, catalog);
    assert.equal(await received, catalog);
    return { simx, session, joinCode, welcome, saved };
  }

  it("forms a session by join code: connected, saving the binding token, and delivering the catalog", async () => {
    const { simx, joinCode } = await connectSimx();
    const saved: string[] = [];
    const session = editorSession({
      joinCode,
      saveBindingToken: (token) => {
        saved.push(token);
      },
    });
    assert.deepEqual(session.state, { status: "none", entry: undefined, joinCode: undefined, errorCode: undefined });
    const received = nextCatalog(session);

    session.start();
    const welcome = assertWelcome(await simx.nextMessage());
    await simxHandshake(simx, "{}");

    assert.equal(await received, "{}");
    assert.deepEqual(session.state, {
      status: "connected",
      entry: undefined,
      joinCode: undefined,
      errorCode: undefined,
    });
    assert.deepEqual(saved, [welcome.bindingToken]);
    assert.equal(editorSockets()[0].url, `ws://${relay.address}/${EDITOR}`);
  });

  it("reclaims the session by its binding token when its own connection drops, with a fresh handshake", async () => {
    const { simx, session, welcome } = await formSession("{}");

    editorSockets()[0].close();
    await until(session, (state) => state.status === "disconnected", "the session to be disconnected");
    assertCounterpartAway(await simx.nextMessage());
    assertJoinCode(await simx.nextMessage());
    const received = nextCatalog(session);
    const rewelcome = assertWelcome(await simx.nextMessage());
    await simxHandshake(simx, "[]");

    assert.equal(await received, "[]");
    assert.deepEqual(session.state, {
      status: "connected",
      entry: undefined,
      joinCode: undefined,
      errorCode: undefined,
    });
    assert.equal(rewelcome.sessionId, welcome.sessionId);
    assert.equal(lastEditorHello()?.bindingToken, welcome.bindingToken);
  });

  it("reclaims the session in a new session object by the saved binding token alone", async () => {
    const { simx, session, welcome, saved } = await formSession("{}");
    session.stop();
    assertCounterpartAway(await simx.nextMessage());
    assertJoinCode(await simx.nextMessage());

    const reloaded = editorSession({ loadBindingToken: () => saved.at(-1) });
    assert.deepEqual(reloaded.state, {
      status: "disconnected",
      entry: undefined,
      joinCode: undefined,
      errorCode: undefined,
    });
    const received = nextCatalog(reloaded);
    reloaded.start();
    const rewelcome = assertWelcome(await simx.nextMessage());
    await simxHandshake(simx, "[]");

    assert.equal(await received, "[]");
    assert.deepEqual(reloaded.state, {
      status: "connected",
      entry: undefined,
      joinCode: undefined,
      errorCode: undefined,
    });
    assert.equal(rewelcome.sessionId, welcome.sessionId);
  });

  it("opens a fresh handshake on the re-welcome when the counterpart returns", async () => {
    const { simx, session, welcome } = await formSession("{}");

    await simx.close();
    const away = await until(
      session,
      (state) => state.status === "disconnected" && state.joinCode !== undefined,
      "the session to be disconnected, showing the code minted for the vacant role"
    );
    const vacancyCode = away.joinCode;
    assert.deepEqual(away, { status: "disconnected", entry: undefined, joinCode: vacancyCode, errorCode: undefined });
    const returned = await relay.connect(SIMX);
    const received = nextCatalog(session);
    assert.equal(assertJoinCode(await returned.hello({ bindingToken: welcome.bindingToken })), vacancyCode);
    assert.equal(assertWelcome(await returned.nextMessage()).sessionId, welcome.sessionId);
    await simxHandshake(returned, "[]");

    assert.equal(await received, "[]");
    assert.deepEqual(session.state, {
      status: "connected",
      entry: undefined,
      joinCode: undefined,
      errorCode: undefined,
    });
  });

  it("heals across a relay restart by its binding token alone, under the join code the restarted relay mints", async () => {
    const { simx, session, joinCode, welcome, saved } = await formSession("{}");
    const statuses: string[] = [];
    session.onStateChange((state) => {
      if (statuses.at(-1) !== state.status) statuses.push(state.status);
    });

    await relay.restart();
    await within(simx.closed, "the simx's connection to close");
    await until(session, (state) => state.status === "disconnected", "the session to be disconnected");
    const returned = await relay.connect(SIMX);
    const rebuiltCode = assertJoinCode(await returned.hello({ bindingToken: welcome.bindingToken }));
    const received = nextCatalog(session);
    const rewelcome = assertWelcome(await returned.nextMessage());
    await simxHandshake(returned, "[]");

    assert.equal(await received, "[]");
    assert.deepEqual(session.state, {
      status: "connected",
      entry: undefined,
      joinCode: undefined,
      errorCode: undefined,
    });
    assert.deepEqual(statuses, ["disconnected", "connected"]);
    assert.notEqual(rebuiltCode, joinCode);
    assert.notEqual(rewelcome.sessionId, welcome.sessionId);
    assert.equal(rewelcome.bindingToken, welcome.bindingToken);
    assert.deepEqual(saved, [welcome.bindingToken]);
    assert.equal(lastEditorHello()?.joinCode, undefined);
    assert.equal(lastEditorHello()?.bindingToken, welcome.bindingToken);
  });

  it("does not present a join code the relay sent when it connects again, nor show one once welcomed", async () => {
    const { simx, session, saved } = await formSession("{}");
    session.stop();
    assertCounterpartAway(await simx.nextMessage());
    const firstVacancy = assertJoinCode(await simx.nextMessage());

    const rejoined = editorSession({ loadBindingToken: () => saved.at(-1) });
    rejoined.start();
    await until(rejoined, (state) => state.status === "connected", "the rejoined session to connect");
    assertWelcome(await simx.nextMessage());
    assert.deepEqual(await simx.nextMessage(), MAKECODE_HELLO);
    rejoined.stop();
    assertCounterpartAway(await simx.nextMessage());
    const secondVacancy = assertJoinCode(await simx.nextMessage());
    rejoined.start();
    assertWelcome(await simx.nextMessage());
    await until(rejoined, (state) => state.status === "connected", "the rejoined session to connect again");

    assert.equal(rejoined.state.joinCode, undefined);
    assert.notEqual(secondVacancy, firstVacancy);
    assert.equal(lastEditorHello()?.joinCode, undefined);
    assert.equal(lastEditorHello()?.bindingToken, saved.at(-1));
  });

  it("holds on JOIN_CODE_UNKNOWN when it enters a code no session holds, though it also holds a saved token", async () => {
    const { simx, session, joinCode, saved } = await formSession("{}");
    session.stop();
    assertCounterpartAway(await simx.nextMessage());
    assertJoinCode(await simx.nextMessage());

    const entered = editorSession({ joinCode, loadBindingToken: () => saved.at(-1) });
    entered.start();
    const held = await until(
      entered,
      (state) => state.errorCode === BridgeSessionErrorCode.JOIN_CODE_UNKNOWN,
      "the session to report the unknown code"
    );
    const socketsAfterRefusal = editorSockets().length;
    // Waits out the bridge client's first reconnect attempt.
    await delay(1200);

    assert.equal(held.status, "disconnected");
    assert.equal(editorSockets().length, socketsAfterRefusal);
    assert.equal(lastEditorHello()?.joinCode, joinCode);
    await simx.ping();
    simx.assertNothingReceived();
  });

  it("holds with no session on JOIN_CODE_UNKNOWN when the code it presents opens no vacant role", async () => {
    const entered = editorSession({ joinCode: "no-such-code" });
    entered.start();
    assert.equal(entered.state.entry, "submitted");

    const held = await until(
      entered,
      (state) => state.errorCode === BridgeSessionErrorCode.JOIN_CODE_UNKNOWN,
      "the session to report the unknown code"
    );

    assert.deepEqual(held, {
      status: "none",
      entry: undefined,
      joinCode: undefined,
      errorCode: BridgeSessionErrorCode.JOIN_CODE_UNKNOWN,
    });
  });

  it("forgets a live session by ending it, which the simx is told as SESSION_ENDED", async () => {
    const { simx, session } = await formSession("{}");

    session.forget();

    assertSessionError(await simx.nextMessage(), BridgeSessionErrorCode.SESSION_ENDED);
    await within(simx.closed, "the simx's connection to close");
    assert.deepEqual(session.state, { status: "none", entry: undefined, joinCode: undefined, errorCode: undefined });
  });

  it("respects an end the simx asks for: drops its binding token and holds with no session", async () => {
    const store = new Map<string, string>();
    const { simx, joinCode } = await connectSimx();
    const session = editorSession({
      joinCode,
      loadBindingToken: () => store.get("token"),
      saveBindingToken: (token) => {
        store.set("token", token);
      },
      clearBindingToken: () => {
        store.delete("token");
      },
    });
    session.start();
    assertWelcome(await simx.nextMessage());
    await until(session, (state) => state.status === "connected", "the session to connect");

    simx.send({ type: "session:goodbye" });
    const ended = await until(
      session,
      (state) => state.errorCode === BridgeSessionErrorCode.SESSION_ENDED,
      "the session to report its end"
    );
    const socketsAfterEnd = editorSockets().length;
    // Waits out the bridge client's first reconnect attempt.
    await delay(1200);

    assert.deepEqual(ended, {
      status: "none",
      entry: undefined,
      joinCode: undefined,
      errorCode: BridgeSessionErrorCode.SESSION_ENDED,
    });
    assert.equal(store.size, 0);
    assert.equal(editorSockets().length, socketsAfterEnd);
  });

  it("holds without reconnecting when a newer connection presenting its token supersedes it, and started again takes the session back", async () => {
    const { simx, session, welcome, saved } = await formSession("{}");

    const newer = await relay.connect(EDITOR);
    assertJoinCode(await newer.hello({ bindingToken: welcome.bindingToken }));
    await until(
      session,
      (state) => state.errorCode === BridgeSessionErrorCode.SESSION_REPLACED,
      "the session to report its supersession"
    );
    assert.deepEqual(session.state, {
      status: "disconnected",
      entry: undefined,
      joinCode: undefined,
      errorCode: BridgeSessionErrorCode.SESSION_REPLACED,
    });
    assert.equal(assertWelcome(await simx.nextMessage()).sessionId, welcome.sessionId);
    assert.equal(assertWelcome(await newer.nextMessage()).sessionId, welcome.sessionId);
    const socketsAfterSupersession = editorSockets().length;
    // Waits out the bridge client's first reconnect attempt.
    await delay(1200);
    assert.equal(editorSockets().length, socketsAfterSupersession);

    const received = nextCatalog(session);
    session.start();
    assertSessionError(await newer.nextMessage(), BridgeSessionErrorCode.SESSION_REPLACED);
    assert.equal(assertWelcome(await simx.nextMessage()).sessionId, welcome.sessionId);
    await simxHandshake(simx, "[]");

    assert.equal(await received, "[]");
    assert.equal(session.state.status, "connected");
    assert.equal(lastEditorHello()?.joinCode, undefined);
    assert.equal(lastEditorHello()?.bindingToken, saved.at(-1));
  });

  it("forgets a superseded session and joins by a code alone, persisting the token it is welcomed with", async () => {
    const store = new Map<string, string>();
    const hooks: MakeCodeEditorSessionOptions = {
      loadBindingToken: () => store.get("token"),
      saveBindingToken: (token) => {
        store.set("token", token);
      },
      clearBindingToken: () => {
        store.delete("token");
      },
    };
    const { simx, joinCode } = await connectSimx();
    const session = editorSession({ joinCode, ...hooks });
    const received = nextCatalog(session);
    session.start();
    const welcome = assertWelcome(await simx.nextMessage());
    await simxHandshake(simx, "{}");
    assert.equal(await received, "{}");

    const newer = await relay.connect(EDITOR);
    assertJoinCode(await newer.hello({ bindingToken: welcome.bindingToken }));
    await until(
      session,
      (state) => state.errorCode === BridgeSessionErrorCode.SESSION_REPLACED,
      "the session to report its supersession"
    );
    assertWelcome(await simx.nextMessage());

    session.forget();

    assert.deepEqual(session.state, { status: "none", entry: undefined, joinCode: undefined, errorCode: undefined });
    assert.equal(store.size, 0);

    await newer.close();
    assertCounterpartAway(await simx.nextMessage());
    const vacancyCode = assertJoinCode(await simx.nextMessage());
    const rejoined = editorSession({ joinCode: vacancyCode, ...hooks });
    const redelivered = nextCatalog(rejoined);
    rejoined.start();
    const rewelcome = assertWelcome(await simx.nextMessage());
    await simxHandshake(simx, "[]");

    assert.equal(await redelivered, "[]");
    assert.deepEqual(rejoined.state, {
      status: "connected",
      entry: undefined,
      joinCode: undefined,
      errorCode: undefined,
    });
    assert.equal(rewelcome.sessionId, welcome.sessionId);
    assert.equal(store.get("token"), welcome.bindingToken);
    assert.equal(lastEditorHello()?.joinCode, vacancyCode);
    assert.equal(lastEditorHello()?.bindingToken, undefined);
  });

  it("stays connected when another simx presents the join code, which the relay refuses", async () => {
    const { simx, session, joinCode, saved } = await formSession("{}");
    const socketsBefore = editorSockets().length;

    const claimant = await relay.connect(SIMX);
    assertJoinCodeUnknown(await claimant.hello({ joinCode }));
    await within(claimant.closed, "the refused connection to close");
    await simx.ping();
    simx.assertNothingReceived();

    assert.equal(session.state.status, "connected");
    assert.equal(session.state.errorCode, undefined);
    assert.equal(saved.length, 1);
    assert.equal(editorSockets().length, socketsBefore);
  });

  it("joins by a code shown before a rotation within the entry grace, then shows live every rotated code of a vacancy", async () => {
    const rotating = await startTestRelay({ bindingSecret: "spec-secret", rotationMs: ROTATION_MS });
    try {
      const simx = await rotating.connect(SIMX);
      const shown = assertJoinCode(await simx.hello());
      const rotated = assertJoinCode(await simx.nextMessage());
      assert.notEqual(rotated, shown);

      const session = createMakeCodeEditorSession({ bridgeUrl: rotating.address, joinCode: shown });
      sessions.push(session);
      const received = nextCatalog(session);
      session.start();
      const welcome = assertWelcome(await simx.nextMessage());
      await simxHandshake(simx, "{}");
      assert.equal(await received, "{}");
      assert.equal(welcome.joinCode, rotated);
      assert.deepEqual(session.state, {
        status: "connected",
        entry: undefined,
        joinCode: undefined,
        errorCode: undefined,
      });

      await simx.close();
      const vacancy = await until(
        session,
        (current) => current.status === "disconnected" && current.joinCode !== undefined,
        "the code minted for the vacant role"
      );
      const rotatedVacancy = await until(
        session,
        (current) => current.joinCode !== vacancy.joinCode,
        "the vacancy's next rotated join code"
      );
      assert.equal(rotatedVacancy.status, "disconnected");
    } finally {
      await rotating.close();
    }
  });

  it("recovers by itself from an outbound queue overflow on the payload path, discarding the queued payloads", async () => {
    const { simx, joinCode } = await connectSimx();
    const bridges: AppBridge[] = [];
    const states: MakeCodeEditorSessionState[] = [];
    const session = createEditorSessionOver({ bridgeUrl: relay.address, joinCode }, (options) => {
      const bridge = createAppBridge(options);
      bridges.push(bridge);
      return bridge;
    });
    sessions.push(session);
    session.onStateChange((state) => {
      states.push(state);
    });
    session.start();
    const welcome = assertWelcome(await simx.nextMessage());
    await simxHandshake(simx, "{}");
    await until(session, (state) => state.status === "connected", "the session to connect");

    editorSockets()[0].close();
    await until(session, (state) => state.status === "disconnected", "the session to be disconnected");
    for (let sent = 0; sent < QUEUE_OVERFLOW_COUNT; sent++) {
      bridges[0].sendPayload(catalogMessage("queued"));
    }

    assert.deepEqual(states.at(-1), {
      status: "disconnected",
      entry: undefined,
      joinCode: undefined,
      errorCode: BridgeSessionErrorCode.OUTBOUND_QUEUE_OVERFLOW,
    });
    assertCounterpartAway(await simx.nextMessage());
    assertJoinCode(await simx.nextMessage());
    const received = nextCatalog(session);
    assert.equal(assertWelcome(await simx.nextMessage()).sessionId, welcome.sessionId);
    await simxHandshake(simx, "[]");
    assert.equal(await received, "[]");
    assert.deepEqual(session.state, {
      status: "connected",
      entry: undefined,
      joinCode: undefined,
      errorCode: undefined,
    });
    assert.equal(bridges.length, 2);
    await simx.ping();
    simx.assertNothingReceived();
  });

  it("holds with the code when the counterpart declares a newer makecode version, and connects again when started", async () => {
    const { simx, joinCode } = await connectSimx();
    const session = editorSession({ joinCode });
    session.start();
    assertWelcome(await simx.nextMessage());

    simx.send({ type: "makecode:hello", payload: { protocolVersion: MAKECODE_SESSION_PROTOCOL_VERSION + 1 } });
    assert.deepEqual(await simx.nextMessage(), MAKECODE_HELLO);
    await until(
      session,
      (state) => state.errorCode === PeerSessionErrorCode.PROTOCOL_VERSION_NEWER,
      "the session to report the newer version"
    );
    assertCounterpartAway(await simx.nextMessage());
    assertJoinCode(await simx.nextMessage());
    assert.equal(session.state.status, "disconnected");

    const received = nextCatalog(session);
    session.start();
    assertWelcome(await simx.nextMessage());
    await simxHandshake(simx, "{}");

    assert.equal(await received, "{}");
    assert.deepEqual(session.state, {
      status: "connected",
      entry: undefined,
      joinCode: undefined,
      errorCode: undefined,
    });
  });
});
