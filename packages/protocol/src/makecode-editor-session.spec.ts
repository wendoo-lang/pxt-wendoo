import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  type AppBridge,
  type AppBridgeOptions,
  type AppBridgeSnapshot,
  type AppBridgeState,
  type AppBridgeWelcome,
  BridgeSessionErrorCode,
  PeerSessionErrorCode,
} from "@wendoo/bridge-app";
import {
  createEditorSessionOver,
  DEFAULT_MAKECODE_BRIDGE_URL,
  type MakeCodeEditorSession,
  type MakeCodeEditorSessionOptions,
  type MakeCodeEditorSessionState,
} from "./makecode-editor-session.js";
import { MAKECODE_SESSION_PROTOCOL_VERSION, MAKECODE_SESSION_ROLE_PATHS } from "./makecode-session.js";

/** A message an app bridge carries. */
type WsMessage = Parameters<AppBridge["sendPayload"]>[0];

/** The hello a makecode party at this build's version sends. */
const MAKECODE_HELLO: WsMessage = {
  type: "makecode:hello",
  payload: { protocolVersion: MAKECODE_SESSION_PROTOCOL_VERSION },
};

/** An app bridge driven by the spec in place of a bridge connection. */
class FakeBridge implements AppBridge {
  readonly options: AppBridgeOptions;
  /** Every payload message sent to the peer. */
  readonly sent: WsMessage[] = [];
  started = false;
  stopped = false;
  /** Whether the bridge was ended on purpose rather than stopped. */
  ended = false;
  private _snapshot: AppBridgeSnapshot = { status: "disconnected" };
  private readonly _stateListeners = new Set<(state: AppBridgeState) => void>();
  private readonly _welcomeListeners = new Set<(welcome: AppBridgeWelcome) => void>();
  private readonly _payloadListeners = new Set<(message: WsMessage) => void>();

  constructor(options: AppBridgeOptions) {
    this.options = options;
  }

  start(): void {
    this.started = true;
    this.change({ status: "connecting" });
  }

  stop(): void {
    this.stopped = true;
  }

  end(): void {
    this.ended = true;
  }

  requestSync(): Promise<void> {
    return Promise.resolve();
  }

  snapshot(): AppBridgeSnapshot {
    return this._snapshot;
  }

  onStateChange(listener: (state: AppBridgeState) => void): () => void {
    this._stateListeners.add(listener);
    return () => {
      this._stateListeners.delete(listener);
    };
  }

  onWelcome(listener: (welcome: AppBridgeWelcome) => void): () => void {
    this._welcomeListeners.add(listener);
    return () => {
      this._welcomeListeners.delete(listener);
    };
  }

  onRemoteChange(): () => void {
    return () => {};
  }

  sendPayload(message: WsMessage): void {
    this.sent.push(message);
  }

  onPayload(listener: (message: WsMessage) => void): () => void {
    this._payloadListeners.add(listener);
    return () => {
      this._payloadListeners.delete(listener);
    };
  }

  /** The bridge's connection opening and the bridge service answering its hello with `joinCode`. */
  answer(joinCode: string): void {
    this.change({ status: "connected", joinCode });
  }

  /**
   * The bridge accepting a welcome carrying `token`, as an app bridge reports
   * one: the snapshot drops the join code and the counterpart's absence, then
   * the welcome is reported.
   */
  welcome(token: string): void {
    this.change({ status: "connected", joinCode: undefined, counterpartAway: undefined });
    for (const listener of this._welcomeListeners) listener({ bindingToken: token });
  }

  /** The bridge's snapshot changing by `fields`, reported to its state listeners. */
  change(fields: Partial<AppBridgeSnapshot>): void {
    this._snapshot = { ...this._snapshot, ...fields };
    for (const listener of this._stateListeners) listener(this._snapshot.status);
  }

  /** The session ending for `code`, as an app bridge reports it. */
  fail(code: BridgeSessionErrorCode): void {
    this.change({ status: "disconnected", errorCode: code, joinCode: undefined, counterpartAway: undefined });
  }

  /** A payload message arriving from the peer. */
  deliver(message: WsMessage): void {
    for (const listener of this._payloadListeners) listener(message);
  }
}

describe("makecode editor session", () => {
  let bridges: FakeBridge[];

  /** Creates a session over fake bridges, recording every state it publishes. */
  function openSession(options: MakeCodeEditorSessionOptions = {}): {
    session: MakeCodeEditorSession;
    states: MakeCodeEditorSessionState[];
  } {
    const session = createEditorSessionOver(options, (bridgeOptions) => {
      const bridge = new FakeBridge(bridgeOptions);
      bridges.push(bridge);
      return bridge;
    });
    const states: MakeCodeEditorSessionState[] = [];
    session.onStateChange((state) => {
      states.push(state);
    });
    return { session, states };
  }

  /** The newest bridge the session opened. */
  function lastBridge(): FakeBridge {
    const bridge = bridges.at(-1);
    assert.ok(bridge, "expected the session to have opened a bridge");
    return bridge;
  }

  /** Resolves once queued microtasks have run. */
  function microtasks(): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }

  /** A state with `fields` layered over a state reporting no session and nothing pending. */
  function stateWith(fields: Partial<MakeCodeEditorSessionState>): MakeCodeEditorSessionState {
    return { status: "none", entry: undefined, joinCode: undefined, errorCode: undefined, ...fields };
  }

  beforeEach(() => {
    bridges = [];
  });

  it("defaults to a bare-host bridge address", () => {
    assert.doesNotMatch(DEFAULT_MAKECODE_BRIDGE_URL, /:\/\//);

    const { session } = openSession();
    session.start();

    assert.equal(lastBridge().options.bridgeUrl, DEFAULT_MAKECODE_BRIDGE_URL);
  });

  it("connects at the editor role path, presenting the given join code and the loaded binding token", () => {
    const { session } = openSession({
      bridgeUrl: "localhost:8787",
      joinCode: "apple-bird-cloud",
      loadBindingToken: () => "token-1",
    });

    assert.equal(bridges.length, 0);
    session.start();
    session.start();

    assert.equal(bridges.length, 1);
    const { options, started } = lastBridge();
    assert.equal(started, true);
    assert.equal(options.bridgeUrl, "localhost:8787");
    assert.equal(options.wsPath, MAKECODE_SESSION_ROLE_PATHS.editor);
    assert.equal(options.joinCode, "apple-bird-cloud");
    assert.equal(options.bindingToken, "token-1");
  });

  it("has no session until welcomed when it holds no binding token, and a disconnected one when it does", () => {
    assert.deepEqual(openSession({ joinCode: "apple-bird-cloud" }).session.state, stateWith({}));
    assert.deepEqual(
      openSession({ loadBindingToken: () => "token-1" }).session.state,
      stateWith({ status: "disconnected" })
    );
  });

  it("reports an entered code submitted, then accepted once the bridge service answers it, until a welcome connects the session", () => {
    const { session, states } = openSession({ joinCode: "apple-bird-cloud" });
    session.start();
    const bridge = lastBridge();

    assert.deepEqual(session.state, stateWith({ entry: "submitted" }));

    bridge.change({ status: "connected" });
    assert.equal(session.state.entry, "submitted");

    bridge.answer("apple-bird-cloud");
    assert.deepEqual(session.state, stateWith({ entry: "accepted", joinCode: "apple-bird-cloud" }));

    bridge.welcome("token-1");

    assert.deepEqual(session.state, stateWith({ status: "connected" }));
    const entries = states.map((state) => state.entry);
    assert.deepEqual(
      entries.filter((entry, index) => entry !== entries[index - 1]),
      ["submitted", "accepted", undefined]
    );
  });

  it("holds on a refused code with no session and nothing pending, and does not reconnect", async () => {
    const { session } = openSession({ joinCode: "apple-bird-cloud" });
    session.start();

    lastBridge().fail(BridgeSessionErrorCode.JOIN_CODE_UNKNOWN);
    await microtasks();

    assert.equal(bridges.length, 1);
    assert.equal(lastBridge().stopped, true);
    assert.deepEqual(session.state, stateWith({ errorCode: BridgeSessionErrorCode.JOIN_CODE_UNKNOWN }));
  });

  it("is connected at each welcome, opening a makecode handshake per welcome and saving each new binding token once", () => {
    const saved: string[] = [];
    const { session, states } = openSession({
      saveBindingToken: (token) => {
        saved.push(token);
      },
    });
    session.start();
    const bridge = lastBridge();

    bridge.welcome("token-1");

    assert.deepEqual(states, [stateWith({ status: "connected" })]);
    assert.deepEqual(bridge.sent, [MAKECODE_HELLO]);

    bridge.welcome("token-1");
    bridge.welcome("token-2");

    assert.deepEqual(saved, ["token-1", "token-2"]);
    assert.deepEqual(bridge.sent, [MAKECODE_HELLO, MAKECODE_HELLO, MAKECODE_HELLO]);
  });

  it("delivers the catalogs of the current handshake only", async () => {
    const { session } = openSession();
    const catalogs: string[] = [];
    session.onCatalog((content) => {
      catalogs.push(content);
    });
    session.start();
    const bridge = lastBridge();
    bridge.welcome("token-1");
    bridge.deliver(MAKECODE_HELLO);
    await microtasks();
    bridge.deliver({ type: "makecode:catalog", payload: { content: "first" } });

    bridge.change({ counterpartAway: true });
    bridge.deliver({ type: "makecode:catalog", payload: { content: "after the counterpart left" } });
    bridge.welcome("token-1");
    bridge.deliver(MAKECODE_HELLO);
    await microtasks();
    bridge.deliver({ type: "makecode:catalog", payload: { content: "second" } });

    assert.deepEqual(catalogs, ["first", "second"]);
  });

  it("is disconnected while its own connection is down or the counterpart is away", () => {
    const { session, states } = openSession();
    session.start();
    const bridge = lastBridge();
    bridge.welcome("token-1");

    bridge.change({ counterpartAway: true });
    bridge.welcome("token-1");
    bridge.change({ status: "reconnecting" });
    bridge.change({ status: "connected" });

    assert.deepEqual(
      states.map((state) => state.status),
      ["connected", "disconnected", "connected", "disconnected"]
    );
  });

  it("shows each join code the bridge service sends until a welcome takes it out of service, never an entered one", () => {
    const { session } = openSession({ joinCode: "apple-bird-cloud" });
    session.start();
    const bridge = lastBridge();
    assert.equal(session.state.joinCode, undefined);

    bridge.welcome("token-1");
    bridge.change({ counterpartAway: true, joinCode: "delta-echo-fox" });
    assert.deepEqual(session.state, stateWith({ status: "disconnected", joinCode: "delta-echo-fox" }));

    bridge.welcome("token-1");

    assert.equal(session.state.joinCode, undefined);
  });

  it("presents the join code it was created with on each connection until first welcomed, never one the bridge reports", async () => {
    const { session } = openSession({ joinCode: "apple-bird-cloud" });
    session.start();
    const unwelcomed = lastBridge();
    unwelcomed.answer("delta-echo-fox");

    unwelcomed.fail(BridgeSessionErrorCode.OUTBOUND_QUEUE_OVERFLOW);
    await microtasks();
    const welcomed = lastBridge();
    welcomed.welcome("token-1");
    welcomed.fail(BridgeSessionErrorCode.OUTBOUND_QUEUE_OVERFLOW);
    await microtasks();

    assert.equal(bridges.length, 3);
    assert.equal(welcomed.options.joinCode, "apple-bird-cloud");
    assert.equal(lastBridge().options.joinCode, undefined);
    assert.equal(lastBridge().options.bindingToken, "token-1");
  });

  it("reconnects at once after an outbound queue overflow, presenting its binding token alone and keeping the code until connected", async () => {
    const { session, states } = openSession({ joinCode: "apple-bird-cloud" });
    session.start();
    const failed = lastBridge();
    failed.welcome("token-1");

    failed.fail(BridgeSessionErrorCode.OUTBOUND_QUEUE_OVERFLOW);

    assert.equal(failed.stopped, true);
    assert.deepEqual(
      states.at(-1),
      stateWith({ status: "disconnected", errorCode: BridgeSessionErrorCode.OUTBOUND_QUEUE_OVERFLOW })
    );
    await microtasks();
    assert.equal(bridges.length, 2);
    const reopened = lastBridge();
    assert.equal(reopened.started, true);
    assert.equal(reopened.options.joinCode, undefined);
    assert.equal(reopened.options.bindingToken, "token-1");
    assert.equal(session.state.errorCode, BridgeSessionErrorCode.OUTBOUND_QUEUE_OVERFLOW);

    reopened.welcome("token-1");

    assert.deepEqual(session.state, stateWith({ status: "connected" }));
  });

  it("does not reconnect after an overflow when stopped before the reconnect", async () => {
    const { session } = openSession();
    session.start();
    lastBridge().fail(BridgeSessionErrorCode.OUTBOUND_QUEUE_OVERFLOW);

    session.stop();
    await microtasks();

    assert.equal(bridges.length, 1);
  });

  it("holds after being replaced until started again, then connects presenting its binding token alone", async () => {
    const { session, states } = openSession({ joinCode: "apple-bird-cloud" });
    session.start();
    lastBridge().welcome("token-1");

    lastBridge().fail(BridgeSessionErrorCode.SESSION_REPLACED);
    await microtasks();

    assert.equal(bridges.length, 1);
    assert.deepEqual(
      states.at(-1),
      stateWith({ status: "disconnected", errorCode: BridgeSessionErrorCode.SESSION_REPLACED })
    );

    session.start();

    assert.equal(bridges.length, 2);
    assert.equal(lastBridge().options.joinCode, undefined);
    assert.equal(lastBridge().options.bindingToken, "token-1");
    assert.deepEqual(session.state, stateWith({ status: "disconnected" }));
  });

  it("respects an ended session: drops its binding token and the persisted one, holding with no session", async () => {
    let cleared = 0;
    const { session } = openSession({
      loadBindingToken: () => "token-1",
      clearBindingToken: () => {
        cleared += 1;
      },
    });
    session.start();
    lastBridge().welcome("token-1");

    lastBridge().fail(BridgeSessionErrorCode.SESSION_ENDED);
    await microtasks();

    assert.equal(bridges.length, 1);
    assert.equal(cleared, 1);
    assert.deepEqual(session.state, stateWith({ errorCode: BridgeSessionErrorCode.SESSION_ENDED }));

    session.start();

    assert.equal(lastBridge().options.bindingToken, undefined);
  });

  it("holds with the code when the counterpart declares a newer makecode version, and connects again when started", async () => {
    const { session } = openSession();
    session.start();
    const rejected = lastBridge();
    rejected.welcome("token-1");

    rejected.deliver({ type: "makecode:hello", payload: { protocolVersion: MAKECODE_SESSION_PROTOCOL_VERSION + 1 } });
    await microtasks();

    assert.equal(rejected.stopped, true);
    assert.equal(bridges.length, 1);
    assert.deepEqual(
      session.state,
      stateWith({ status: "disconnected", errorCode: PeerSessionErrorCode.PROTOCOL_VERSION_NEWER })
    );

    session.start();
    lastBridge().welcome("token-1");

    assert.deepEqual(session.state, stateWith({ status: "connected" }));
  });

  it("forgets the session: ends it on its open connection, clears the persisted token, and returns the state to none", () => {
    let cleared = 0;
    const { session, states } = openSession({
      joinCode: "apple-bird-cloud",
      clearBindingToken: () => {
        cleared += 1;
      },
    });
    session.start();
    const bridge = lastBridge();
    bridge.welcome("token-1");

    session.forget();
    bridge.welcome("token-2");

    assert.equal(bridge.ended, true);
    assert.equal(bridge.stopped, false);
    assert.equal(cleared, 1);
    assert.deepEqual(states.at(-1), stateWith({}));
    assert.deepEqual(session.state, stateWith({}));
  });

  it("forgets a session held disconnected after its replacement locally, without reconnecting", async () => {
    let cleared = 0;
    const { session } = openSession({
      loadBindingToken: () => "token-1",
      clearBindingToken: () => {
        cleared += 1;
      },
    });
    session.start();
    lastBridge().fail(BridgeSessionErrorCode.SESSION_REPLACED);

    session.forget();
    await microtasks();

    assert.equal(bridges.length, 1);
    assert.equal(lastBridge().ended, false);
    assert.equal(cleared, 1);
    assert.deepEqual(session.state, stateWith({}));
  });

  it("closes its connection when stopped and ignores the connection afterwards", () => {
    const { session } = openSession();
    session.start();
    const bridge = lastBridge();
    bridge.welcome("token-1");

    session.stop();
    bridge.welcome("token-2");

    assert.equal(bridge.stopped, true);
    assert.equal(bridge.ended, false);
    assert.deepEqual(session.state, stateWith({ status: "disconnected" }));
  });
});
