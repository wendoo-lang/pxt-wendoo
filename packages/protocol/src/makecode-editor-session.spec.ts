import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  type AppBridge,
  type AppBridgeOptions,
  type AppBridgeSnapshot,
  type AppBridgeState,
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
  private _snapshot: AppBridgeSnapshot = { status: "disconnected" };
  private readonly _stateListeners = new Set<(state: AppBridgeState) => void>();
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

  /** The bridge accepting a welcome carrying `joinCode` and `token`, as an app bridge reports one. */
  welcome(joinCode: string, token: string): void {
    this.change({ status: "connected", joinCode });
    this.options.onBindingTokenChange?.(token);
    this.change({ counterpartAway: undefined });
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
    assert.deepEqual(openSession({ joinCode: "apple-bird-cloud" }).session.state, {
      status: "none",
      joinCode: "apple-bird-cloud",
      errorCode: undefined,
    });
    assert.deepEqual(openSession({ loadBindingToken: () => "token-1" }).session.state, {
      status: "disconnected",
      joinCode: undefined,
      errorCode: undefined,
    });
  });

  it("is connected once welcomed, opening the makecode handshake and saving each new binding token once", () => {
    const saved: string[] = [];
    const { session, states } = openSession({
      saveBindingToken: (token) => {
        saved.push(token);
      },
    });
    session.start();
    const bridge = lastBridge();

    bridge.welcome("apple-bird-cloud", "token-1");

    assert.deepEqual(states, [
      { status: "none", joinCode: "apple-bird-cloud", errorCode: undefined },
      { status: "connected", joinCode: "apple-bird-cloud", errorCode: undefined },
    ]);
    assert.deepEqual(bridge.sent, [MAKECODE_HELLO]);

    bridge.welcome("apple-bird-cloud", "token-1");
    bridge.welcome("apple-bird-cloud", "token-2");

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
    bridge.welcome("apple-bird-cloud", "token-1");
    bridge.deliver(MAKECODE_HELLO);
    await microtasks();
    bridge.deliver({ type: "makecode:catalog", payload: { content: "first" } });

    bridge.change({ counterpartAway: true });
    bridge.deliver({ type: "makecode:catalog", payload: { content: "after the counterpart left" } });
    bridge.welcome("apple-bird-cloud", "token-1");
    bridge.deliver(MAKECODE_HELLO);
    await microtasks();
    bridge.deliver({ type: "makecode:catalog", payload: { content: "second" } });

    assert.deepEqual(catalogs, ["first", "second"]);
  });

  it("is disconnected while its own connection is down or the counterpart is away, keeping its join code", () => {
    const { session, states } = openSession();
    session.start();
    const bridge = lastBridge();
    bridge.welcome("apple-bird-cloud", "token-1");

    bridge.change({ counterpartAway: true });
    bridge.welcome("apple-bird-cloud", "token-1");
    bridge.change({ status: "reconnecting" });
    bridge.change({ status: "connected" });

    assert.deepEqual(
      states.slice(1).map((state) => state.status),
      ["connected", "disconnected", "connected", "disconnected"]
    );
    assert.equal(session.state.joinCode, "apple-bird-cloud");
  });

  it("shows every join code the bridge reports", () => {
    const { session, states } = openSession({ joinCode: "apple-bird-cloud" });
    session.start();

    lastBridge().change({ joinCode: "delta-echo-fox" });

    assert.deepEqual(states.at(-1), { status: "none", joinCode: "delta-echo-fox", errorCode: undefined });
  });

  it("presents the join code it was created with on each connection until first welcomed, never one the bridge reports", async () => {
    const { session } = openSession({ joinCode: "apple-bird-cloud" });
    session.start();
    const unwelcomed = lastBridge();
    unwelcomed.change({ joinCode: "delta-echo-fox" });

    unwelcomed.fail(BridgeSessionErrorCode.OUTBOUND_QUEUE_OVERFLOW);
    await microtasks();
    const welcomed = lastBridge();
    welcomed.welcome("delta-echo-fox", "token-1");
    welcomed.fail(BridgeSessionErrorCode.OUTBOUND_QUEUE_OVERFLOW);
    await microtasks();

    assert.equal(bridges.length, 3);
    assert.equal(welcomed.options.joinCode, "apple-bird-cloud");
    assert.equal(lastBridge().options.joinCode, undefined);
    assert.equal(lastBridge().options.bindingToken, "token-1");
    assert.equal(session.state.joinCode, "delta-echo-fox");
  });

  it("reconnects at once after an outbound queue overflow, presenting its binding token alone and keeping the code until connected", async () => {
    const { session, states } = openSession({ joinCode: "apple-bird-cloud" });
    session.start();
    const failed = lastBridge();
    failed.welcome("delta-echo-fox", "token-1");

    failed.fail(BridgeSessionErrorCode.OUTBOUND_QUEUE_OVERFLOW);

    assert.equal(failed.stopped, true);
    assert.deepEqual(states.at(-1), {
      status: "disconnected",
      joinCode: "delta-echo-fox",
      errorCode: BridgeSessionErrorCode.OUTBOUND_QUEUE_OVERFLOW,
    });
    await microtasks();
    assert.equal(bridges.length, 2);
    const reopened = lastBridge();
    assert.equal(reopened.started, true);
    assert.equal(reopened.options.joinCode, undefined);
    assert.equal(reopened.options.bindingToken, "token-1");
    assert.equal(session.state.errorCode, BridgeSessionErrorCode.OUTBOUND_QUEUE_OVERFLOW);

    reopened.welcome("delta-echo-fox", "token-1");

    assert.deepEqual(session.state, { status: "connected", joinCode: "delta-echo-fox", errorCode: undefined });
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
    lastBridge().welcome("apple-bird-cloud", "token-1");

    lastBridge().fail(BridgeSessionErrorCode.SESSION_REPLACED);
    await microtasks();

    assert.equal(bridges.length, 1);
    assert.deepEqual(states.at(-1), {
      status: "disconnected",
      joinCode: "apple-bird-cloud",
      errorCode: BridgeSessionErrorCode.SESSION_REPLACED,
    });

    session.start();

    assert.equal(bridges.length, 2);
    assert.equal(lastBridge().options.joinCode, undefined);
    assert.equal(lastBridge().options.bindingToken, "token-1");
    assert.deepEqual(session.state, { status: "disconnected", joinCode: "apple-bird-cloud", errorCode: undefined });
  });

  it("holds with the code when the counterpart declares a newer makecode version, and connects again when started", async () => {
    const { session } = openSession();
    session.start();
    const rejected = lastBridge();
    rejected.welcome("apple-bird-cloud", "token-1");

    rejected.deliver({ type: "makecode:hello", payload: { protocolVersion: MAKECODE_SESSION_PROTOCOL_VERSION + 1 } });
    await microtasks();

    assert.equal(rejected.stopped, true);
    assert.equal(bridges.length, 1);
    assert.deepEqual(session.state, {
      status: "disconnected",
      joinCode: "apple-bird-cloud",
      errorCode: PeerSessionErrorCode.PROTOCOL_VERSION_NEWER,
    });

    session.start();
    lastBridge().welcome("apple-bird-cloud", "token-1");

    assert.deepEqual(session.state, { status: "connected", joinCode: "apple-bird-cloud", errorCode: undefined });
  });

  it("forgets the session: closes the connection, clears the persisted token, and returns the state to none", () => {
    let cleared = 0;
    const { session, states } = openSession({
      joinCode: "apple-bird-cloud",
      clearBindingToken: () => {
        cleared += 1;
      },
    });
    session.start();
    const bridge = lastBridge();
    bridge.welcome("apple-bird-cloud", "token-1");

    session.forget();
    bridge.welcome("apple-bird-cloud", "token-2");

    assert.equal(bridge.stopped, true);
    assert.equal(cleared, 1);
    assert.deepEqual(states.at(-1), { status: "none", joinCode: undefined, errorCode: undefined });
    assert.deepEqual(session.state, { status: "none", joinCode: undefined, errorCode: undefined });
  });

  it("forgets a session held disconnected after its replacement, without reconnecting", async () => {
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
    assert.equal(cleared, 1);
    assert.deepEqual(session.state, { status: "none", joinCode: undefined, errorCode: undefined });
  });

  it("closes its connection when stopped and ignores the connection afterwards", () => {
    const { session } = openSession();
    session.start();
    const bridge = lastBridge();
    bridge.welcome("apple-bird-cloud", "token-1");

    session.stop();
    bridge.welcome("apple-bird-cloud", "token-2");

    assert.equal(bridge.stopped, true);
    assert.deepEqual(session.state, { status: "disconnected", joinCode: "apple-bird-cloud", errorCode: undefined });
  });
});
