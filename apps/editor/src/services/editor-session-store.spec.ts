import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { BridgeSessionErrorCode } from "@wendoo/bridge-app";
import type {
  MakeCodeEditorSession,
  MakeCodeEditorSessionOptions,
  MakeCodeEditorSessionState,
} from "@wendoo/makecode-session";
import type { BindingTokenPersistence } from "./editor-session-store.js";
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

  constructor(options: MakeCodeEditorSessionOptions) {
    this.options = options;
    this.state = {
      status: options.loadBindingToken?.() === undefined ? "none" : "disconnected",
      joinCode: options.joinCode,
      errorCode: undefined,
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

  start(): void {
    this.started += 1;
  }

  stop(): void {
    this.stopped += 1;
  }

  forget(): void {
    this.forgotten += 1;
    this.options.clearBindingToken?.();
    this.set({ status: "none", joinCode: undefined, errorCode: undefined });
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
});
