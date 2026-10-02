import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { BridgeSessionErrorCode } from "@wendoo/bridge-app";
import type {
  MakeCodeBrainsChannel,
  MakeCodeEditorSession,
  MakeCodeEditorSessionOptions,
  MakeCodeEditorSessionState,
} from "@wendoo/makecode-session";
import type { BindingTokenPersistence, EditorBrainsChannel } from "./editor-session-store.js";
import { DISCONNECT_GRACE_MS, EditorSessionStore } from "./editor-session-store.js";

/** An editor session driven by the spec in place of a real one. */
class FakeSession implements MakeCodeEditorSession {
  readonly options: MakeCodeEditorSessionOptions;
  started = 0;
  stopped = 0;
  forgotten = 0;
  state: MakeCodeEditorSessionState;
  private readonly _stateListeners = new Set<(state: MakeCodeEditorSessionState) => void>();
  private readonly _catalogListeners = new Set<(content: string) => void>();
  private readonly _brainsChannelListeners = new Set<(channel: MakeCodeBrainsChannel) => void>();

  constructor(options: MakeCodeEditorSessionOptions) {
    this.options = options;
    this.state = {
      status: options.loadBindingToken?.() === undefined ? "none" : "disconnected",
      entry: undefined,
      joinCode: undefined,
      errorCode: undefined,
      target: undefined,
    };
  }

  onStateChange(listener: (state: MakeCodeEditorSessionState) => void): () => void {
    this._stateListeners.add(listener);
    return () => {
      this._stateListeners.delete(listener);
    };
  }

  onCatalog(listener: (content: string) => void): () => void {
    this._catalogListeners.add(listener);
    return () => {
      this._catalogListeners.delete(listener);
    };
  }

  onBrainsChannel(listener: (channel: MakeCodeBrainsChannel) => void): () => void {
    this._brainsChannelListeners.add(listener);
    return () => {
      this._brainsChannelListeners.delete(listener);
    };
  }

  start(): void {
    this.started += 1;
  }

  stop(): void {
    this.stopped += 1;
  }

  forget(): void {
    this.forgotten += 1;
    this.options.clearBindingToken?.();
    this.set({ status: "none", entry: undefined, joinCode: undefined, errorCode: undefined, target: undefined });
  }

  /** The session's state changing by `fields`, reported to its listeners. */
  set(fields: Partial<MakeCodeEditorSessionState>): void {
    this.state = { ...this.state, ...fields };
    for (const listener of this._stateListeners) listener(this.state);
  }

  /** A catalog arriving from the counterpart. */
  deliver(content: string): void {
    for (const listener of this._catalogListeners) listener(content);
  }

  /** A makecode handshake completing, handing out `channel`. */
  handshake(channel: MakeCodeBrainsChannel): void {
    for (const listener of this._brainsChannelListeners) listener(channel);
  }
}

/** A brains channel whose requests never settle, recording the removals pushed on it. */
function idleChannel(): MakeCodeBrainsChannel & { removed: string[] } {
  const removed: string[] = [];
  return {
    removed,
    listBrains: () => new Promise(() => {}),
    pullBrains: () => new Promise(() => {}),
    pushBrain: (push) => {
      if (push.op === "remove") removed.push(push.brainId);
      return new Promise(() => {});
    },
    readManifest: () => new Promise(() => {}),
    writeManifest: () => new Promise(() => {}),
  };
}

describe("editor session store", () => {
  let sessions: FakeSession[];
  let tokens: Map<string, string>;
  let persistence: BindingTokenPersistence;

  beforeEach(() => {
    sessions = [];
    tokens = new Map();
    persistence = {
      load: () => tokens.get("token"),
      save: (token) => {
        tokens.set("token", token);
      },
      clear: () => {
        tokens.delete("token");
      },
      has: () => tokens.has("token"),
    };
  });

  /** Creates a store over fake sessions and the spec's persistence. */
  function openStore(): EditorSessionStore {
    return new EditorSessionStore({
      persistence,
      createSession: (options) => {
        const session = new FakeSession(options);
        sessions.push(session);
        return session;
      },
    });
  }

  /** The newest session the store opened. */
  function lastSession(): FakeSession {
    const session = sessions[sessions.length - 1];
    assert.ok(session, "expected the store to have opened a session");
    return session;
  }

  it("shows the connect page and opens no session when no token is persisted", () => {
    const store = openStore();

    assert.equal(store.resume(), false);

    assert.equal(sessions.length, 0);
    const state = store.getSnapshot();
    assert.equal(state.view, "connect");
    assert.equal(state.status, "none");
    assert.equal(state.catalogText, undefined);
  });

  it("resumes the persisted session on load, entering the session view with no code", () => {
    tokens.set("token", "token-1");
    const store = openStore();

    assert.equal(store.resume(), true);

    const session = lastSession();
    assert.equal(session.started, 1);
    assert.equal(session.options.joinCode, undefined);
    assert.equal(session.options.loadBindingToken?.(), "token-1");
    assert.equal(store.getSnapshot().view, "session");
    assert.equal(store.getSnapshot().status, "disconnected");
  });

  it("connects by an entered code, reaching the session view once welcomed", () => {
    const store = openStore();

    store.connect("apple-bird-cloud");

    const session = lastSession();
    assert.equal(session.started, 1);
    assert.equal(session.options.joinCode, "apple-bird-cloud");
    assert.equal(store.getSnapshot().view, "connect");

    session.set({ status: "connected", joinCode: "apple-bird-cloud" });

    assert.equal(store.getSnapshot().view, "session");
    assert.equal(store.getSnapshot().joinCode, "apple-bird-cloud");
  });

  it("shows the entered code's progress on the connect page until the session connects", () => {
    const store = openStore();
    store.connect("apple-bird-cloud");
    const session = lastSession();

    session.set({ entry: "submitted" });
    assert.equal(store.getSnapshot().entry, "submitted");

    session.set({ entry: "accepted" });
    assert.equal(store.getSnapshot().entry, "accepted");
    assert.equal(store.getSnapshot().view, "connect");

    session.set({ status: "connected", entry: undefined });
    assert.equal(store.getSnapshot().entry, undefined);
    assert.equal(store.getSnapshot().view, "session");
  });

  it("returns to the connect page without the catalog when the session reports it ended", () => {
    tokens.set("token", "token-1");
    const store = openStore();
    store.resume();
    const session = lastSession();
    session.set({ status: "connected" });
    session.deliver('{"packs":[]}');

    session.set({ status: "none", errorCode: BridgeSessionErrorCode.SESSION_ENDED });

    const state = store.getSnapshot();
    assert.equal(state.view, "connect");
    assert.equal(state.errorCode, BridgeSessionErrorCode.SESSION_ENDED);
    assert.equal(state.catalogText, undefined);
  });

  it("wires the persistence into the session's token hooks", () => {
    const store = openStore();
    store.connect("apple-bird-cloud");
    const { options } = lastSession();

    options.saveBindingToken?.("token-1");
    assert.deepEqual([...tokens.values()], ["token-1"]);
    assert.equal(options.loadBindingToken?.(), "token-1");

    options.clearBindingToken?.();
    assert.equal(tokens.size, 0);
  });

  it("reports a disconnection only once it outlasts the grace, and clears the report on reconnect", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const store = openStore();
    store.connect("apple-bird-cloud");
    const session = lastSession();
    session.set({ status: "connected" });

    session.set({ status: "disconnected" });
    assert.equal(store.getSnapshot().disconnectedBeyondGrace, false);

    t.mock.timers.tick(DISCONNECT_GRACE_MS - 1);
    assert.equal(store.getSnapshot().disconnectedBeyondGrace, false);

    t.mock.timers.tick(1);
    assert.equal(store.getSnapshot().disconnectedBeyondGrace, true);

    session.set({ status: "connected" });
    assert.equal(store.getSnapshot().disconnectedBeyondGrace, false);
  });

  it("never reports a disconnection healed within the grace, and starts the next disconnection's grace afresh", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const store = openStore();
    store.connect("apple-bird-cloud");
    const session = lastSession();
    session.set({ status: "connected" });

    session.set({ status: "disconnected" });
    t.mock.timers.tick(DISCONNECT_GRACE_MS - 1);
    session.set({ status: "connected" });
    t.mock.timers.tick(DISCONNECT_GRACE_MS * 3);
    assert.equal(store.getSnapshot().disconnectedBeyondGrace, false);

    session.set({ status: "disconnected" });
    t.mock.timers.tick(DISCONNECT_GRACE_MS - 1);
    assert.equal(store.getSnapshot().disconnectedBeyondGrace, false);
    t.mock.timers.tick(1);
    assert.equal(store.getSnapshot().disconnectedBeyondGrace, true);
  });

  it("records whether the session it opened has connected, kept across disconnections and reset by the next open", () => {
    tokens.set("token", "token-1");
    const store = openStore();
    store.resume();
    const resumed = lastSession();
    assert.equal(store.getSnapshot().connectedSinceOpen, false);

    resumed.set({ status: "connected" });
    assert.equal(store.getSnapshot().connectedSinceOpen, true);

    resumed.set({ status: "disconnected" });
    assert.equal(store.getSnapshot().connectedSinceOpen, true);

    store.connect("apple-bird-cloud");
    assert.equal(store.getSnapshot().connectedSinceOpen, false);
  });

  it("keeps the latest catalog across a disconnection", () => {
    const store = openStore();
    store.connect("apple-bird-cloud");
    const session = lastSession();
    session.set({ status: "connected" });

    session.deliver('{"packs":[]}');
    session.set({ status: "disconnected", errorCode: BridgeSessionErrorCode.SESSION_REPLACED });

    const state = store.getSnapshot();
    assert.equal(state.catalogText, '{"packs":[]}');
    assert.equal(state.errorCode, BridgeSessionErrorCode.SESSION_REPLACED);
  });

  it("exposes the MakeCode target the session reports, unknown while it reports none", () => {
    const store = openStore();
    store.connect("apple-bird-cloud");
    const session = lastSession();
    assert.equal(store.getSnapshot().target, undefined);

    session.set({ status: "connected", target: "microbit" });
    assert.equal(store.getSnapshot().target, "microbit");

    session.set({ status: "disconnected" });
    assert.equal(store.getSnapshot().target, "microbit");

    session.set({ status: "connected", target: undefined });
    assert.equal(store.getSnapshot().target, undefined);
  });

  it("forgets the session and its catalog, returning to the connect page with the persistence cleared", () => {
    tokens.set("token", "token-1");
    const store = openStore();
    store.resume();
    const session = lastSession();
    session.set({ status: "connected", joinCode: "apple-bird-cloud" });
    session.deliver('{"packs":[]}');

    store.forget();

    assert.equal(session.forgotten, 1);
    assert.equal(tokens.size, 0);
    const state = store.getSnapshot();
    assert.equal(state.view, "connect");
    assert.equal(state.catalogText, undefined);
  });

  it("reconnects the held session in place", () => {
    const store = openStore();
    store.connect("apple-bird-cloud");

    store.reconnect();

    assert.equal(lastSession().started, 2);
  });

  it("stops the session's connection, keeping the persisted token", () => {
    tokens.set("token", "token-1");
    const store = openStore();
    store.resume();

    store.stop();

    assert.equal(lastSession().stopped, 1);
    assert.equal(tokens.get("token"), "token-1");
  });

  it("replaces an earlier connect attempt: the first session is stopped and no longer heard", () => {
    const store = openStore();
    store.connect("apple-bird-cloud");
    const first = lastSession();

    store.connect("delta-echo-fox");
    const second = lastSession();

    assert.equal(first.stopped, 1);
    first.deliver('{"packs":[]}');
    first.set({ status: "connected", joinCode: "apple-bird-cloud" });
    assert.equal(store.getSnapshot().view, "connect");
    assert.equal(store.getSnapshot().catalogText, undefined);

    second.set({ status: "connected", joinCode: "delta-echo-fox" });
    assert.equal(store.getSnapshot().view, "session");
    assert.equal(store.getSnapshot().joinCode, "delta-echo-fox");
  });

  it("falls back to the held session by its token when an entered code is refused, reporting the refusal until the welcome", async () => {
    tokens.set("token", "token-1");
    const store = openStore();
    store.connect("stale-code-here");
    const refused = lastSession();
    assert.equal(refused.options.joinCode, "stale-code-here");
    assert.equal(refused.options.loadBindingToken?.(), "token-1");

    refused.set({ status: "disconnected", errorCode: BridgeSessionErrorCode.JOIN_CODE_UNKNOWN });
    assert.equal(store.getSnapshot().view, "session");
    assert.equal(store.getSnapshot().errorCode, BridgeSessionErrorCode.JOIN_CODE_UNKNOWN);
    await Promise.resolve();

    const fallback = lastSession();
    assert.notEqual(fallback, refused);
    assert.equal(refused.stopped, 1);
    assert.equal(fallback.started, 1);
    assert.equal(fallback.options.joinCode, undefined);
    assert.equal(fallback.options.loadBindingToken?.(), "token-1");
    assert.equal(tokens.get("token"), "token-1");
    let state = store.getSnapshot();
    assert.equal(state.view, "session");
    assert.equal(state.errorCode, BridgeSessionErrorCode.JOIN_CODE_UNKNOWN);
    assert.equal(state.connectedSinceOpen, false);

    fallback.set({ status: "disconnected", joinCode: "vacant-role-code" });
    assert.equal(store.getSnapshot().errorCode, BridgeSessionErrorCode.JOIN_CODE_UNKNOWN);

    fallback.set({ status: "connected", joinCode: undefined });
    state = store.getSnapshot();
    assert.equal(state.errorCode, undefined);
    assert.equal(state.connectedSinceOpen, true);

    fallback.set({ status: "disconnected" });
    assert.equal(store.getSnapshot().errorCode, undefined);
    assert.equal(sessions.length, 2);
  });

  it("reports the fallback session's own failure over the refusal", async () => {
    tokens.set("token", "token-1");
    const store = openStore();
    store.connect("stale-code-here");
    lastSession().set({ status: "disconnected", errorCode: BridgeSessionErrorCode.JOIN_CODE_UNKNOWN });
    await Promise.resolve();

    lastSession().set({ status: "disconnected", errorCode: BridgeSessionErrorCode.SESSION_REPLACED });

    assert.equal(store.getSnapshot().errorCode, BridgeSessionErrorCode.SESSION_REPLACED);
  });

  it("stays on the connect page with the refusal when no token is held, opening no other session", async () => {
    const store = openStore();
    store.connect("stale-code-here");

    lastSession().set({ status: "none", errorCode: BridgeSessionErrorCode.JOIN_CODE_UNKNOWN });
    await Promise.resolve();

    assert.equal(sessions.length, 1);
    assert.equal(store.getSnapshot().view, "connect");
    assert.equal(store.getSnapshot().errorCode, BridgeSessionErrorCode.JOIN_CODE_UNKNOWN);
  });

  it("drops a refusal's report when a new code is entered or the session is forgotten", async () => {
    tokens.set("token", "token-1");
    const store = openStore();
    store.connect("stale-code-here");
    lastSession().set({ status: "disconnected", errorCode: BridgeSessionErrorCode.JOIN_CODE_UNKNOWN });
    await Promise.resolve();

    store.connect("apple-bird-cloud");
    assert.equal(store.getSnapshot().errorCode, undefined);

    lastSession().set({ status: "disconnected", errorCode: BridgeSessionErrorCode.JOIN_CODE_UNKNOWN });
    await Promise.resolve();
    store.forget();
    assert.equal(store.getSnapshot().errorCode, undefined);
    assert.equal(store.getSnapshot().view, "connect");
  });

  it("opens no fallback once the refused session was replaced before the fallback ran", async () => {
    tokens.set("token", "token-1");
    const store = openStore();
    store.connect("stale-code-here");
    lastSession().set({ status: "disconnected", errorCode: BridgeSessionErrorCode.JOIN_CODE_UNKNOWN });

    store.connect("apple-bird-cloud");
    await Promise.resolve();

    assert.equal(sessions.length, 2);
    assert.equal(lastSession().options.joinCode, "apple-bird-cloud");
  });

  it("hands out each handshake's brains channel carrying the binding token held when it completed", () => {
    tokens.set("token", "token-1");
    const store = openStore();
    const channels: EditorBrainsChannel[] = [];
    store.onBrainsChannel((channel) => {
      channels.push(channel);
    });
    store.resume();
    const resumed = idleChannel();

    lastSession().handshake(resumed);
    lastSession().options.saveBindingToken?.("token-2");
    lastSession().handshake(idleChannel());
    store.forget();
    store.connect("ABCD");
    lastSession().handshake(idleChannel());
    lastSession().options.saveBindingToken?.("token-3");
    lastSession().handshake(idleChannel());

    assert.deepEqual(
      channels.map((channel) => channel.binding),
      ["token-1", "token-2", undefined, "token-3"]
    );
    void channels[0].pushBrain({ op: "remove", brainId: "abcdabcdabcdabcd" });
    assert.deepEqual(resumed.removed, ["abcdabcdabcdabcd"]);
  });
});
