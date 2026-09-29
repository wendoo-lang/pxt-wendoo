import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { BridgeSessionErrorCode } from "@wendoo/bridge-app";
import { assertWelcome, delay, startTestRelay, type TestRelay } from "@wendoo/bridge-session/testing";
import { MAKECODE_SESSION_ROLE_PATHS } from "@wendoo/makecode-session";
import {
  type BindingTokenStore,
  openBindingTokenStore,
  type TokenStorage,
} from "../../../../makecode/simx/bridge/src/binding-token-store.js";
import { SIM_CHANNEL_VERSION, SIMX_CHANNEL, type SimxFrame } from "../../../../makecode/simx/bridge/src/sim-channel.js";
import { type SimxBridge, type SimxLog, startSimxBridge } from "../../../../makecode/simx/bridge/src/simx-bridge.js";
import type { BindingTokenPersistence, EditorSessionViewState } from "./editor-session-store.js";
import { EditorSessionStore } from "./editor-session-store.js";
import { enterSession, type PageAddress } from "./fragment-entry.js";

const CATALOG = '{"packs":[{"name":"motion","tiles":[{"name":"move","kind":"actuator"}]}]}';

const NEWER_CATALOG = '{"packs":[]}';

/** The relay path of the editor role. */
const EDITOR = MAKECODE_SESSION_ROLE_PATHS.editor;

/**
 * A WebSocket, installed as the global WebSocket for these specs, that
 * records every instance created and the payload of every `session:hello`
 * each one sends.
 */
class RecordingWebSocket extends WebSocket {
  /** Every socket created, in creation order. */
  static readonly created: RecordingWebSocket[] = [];

  /** The payload of every `session:hello` this socket sent, in order. */
  readonly sentHellos: Record<string, unknown>[] = [];

  constructor(url: string | URL, protocols?: string | string[]) {
    super(url, protocols);
    RecordingWebSocket.created.push(this);
  }

  override send(data: Parameters<WebSocket["send"]>[0]): void {
    if (typeof data === "string") {
      const message = JSON.parse(data) as { type: string; payload?: Record<string, unknown> };
      if (message.type === "session:hello" && message.payload !== undefined) this.sentHellos.push(message.payload);
    }
    super.send(data);
  }
}

/** The payload of the `session:hello` the newest editor-role socket sent. */
function lastEditorHello(): Record<string, unknown> | undefined {
  const sockets = RecordingWebSocket.created.filter((socket) => socket.url.endsWith(`/${EDITOR}`));
  return sockets[sockets.length - 1]?.sentHellos[0];
}

/** The window of a simulator extension frame, driven by the spec in place of MakeCode. */
class FakeFrame implements SimxFrame {
  private readonly _listeners = new Set<(event: { data: unknown }) => void>();
  readonly parent = {
    postMessage: () => {},
  };

  addEventListener(_type: "message", listener: (event: { data: unknown }) => void): void {
    this._listeners.add(listener);
  }

  removeEventListener(_type: "message", listener: (event: { data: unknown }) => void): void {
    this._listeners.delete(listener);
  }

  /** MakeCode delivering `catalog` as the running program posts it, framed under the current channel version. */
  programPosts(catalog: string): void {
    const packet = {
      type: "messagepacket",
      channel: SIMX_CHANNEL,
      data: new TextEncoder().encode(`${SIM_CHANNEL_VERSION}\n${catalog}`),
    };
    for (const listener of this._listeners) {
      listener({ data: packet });
    }
  }
}

/** Web storage holding its items in memory. */
class MemoryStorage implements TokenStorage {
  private readonly _items = new Map<string, string>();

  getItem(key: string): string | null {
    return this._items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this._items.set(key, value);
  }

  removeItem(key: string): void {
    this._items.delete(key);
  }
}

/** The address of an editor page at `/` carrying `hash`, whose `replaceState` rewrites it as a browser's history does. */
function pageAt(hash: string): PageAddress {
  const location = { pathname: "/", search: "", hash };
  return {
    location,
    history: {
      state: null,
      replaceState(_state, _unused, url) {
        location.hash = new URL(String(url), "http://localhost:5176").hash;
      },
    },
  };
}

/** A simx log keeping its lines out of the test output. */
const silentLog: SimxLog = { info() {}, error() {} };

/**
 * Resolves with the store's state once it satisfies `predicate`, waiting up
 * to `timeoutMs`.
 */
function until(
  store: EditorSessionStore,
  predicate: (state: EditorSessionViewState) => boolean,
  what: string,
  timeoutMs = 2000
): Promise<EditorSessionViewState> {
  return new Promise((resolve, reject) => {
    if (predicate(store.getSnapshot())) {
      resolve(store.getSnapshot());
      return;
    }
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error(`timed out waiting for ${what}`));
    }, timeoutMs);
    const unsubscribe = store.subscribe(() => {
      const state = store.getSnapshot();
      if (!predicate(state)) return;
      clearTimeout(timer);
      unsubscribe();
      resolve(state);
    });
  });
}

describe("editor session store with the simx module on the relay", () => {
  const originalWebSocket = globalThis.WebSocket;
  let relay: TestRelay;
  let frame: FakeFrame;
  let simxTokens: BindingTokenStore;
  let editorTokens: Map<string, string>;
  let persistence: BindingTokenPersistence;
  let bridges: SimxBridge[];
  let stores: EditorSessionStore[];

  before(async () => {
    (globalThis as Record<string, unknown>).WebSocket = RecordingWebSocket;
    relay = await startTestRelay({ bindingSecret: "spec-secret" });
  });

  beforeEach(() => {
    RecordingWebSocket.created.length = 0;
    frame = new FakeFrame();
    simxTokens = openBindingTokenStore(() => new MemoryStorage());
    editorTokens = new Map();
    persistence = {
      load: () => editorTokens.get("token"),
      save: (token) => {
        editorTokens.set("token", token);
      },
      clear: () => {
        editorTokens.delete("token");
      },
      has: () => editorTokens.has("token"),
    };
    bridges = [];
    stores = [];
  });

  afterEach(async () => {
    for (const store of stores) store.stop();
    for (const bridge of bridges) bridge.dispose();
    await relay.closePeers();
  });

  after(async () => {
    await relay.close();
    (globalThis as Record<string, unknown>).WebSocket = originalWebSocket;
  });

  /**
   * Starts the real simx module against the relay in `frame`, declaring
   * `target` when one is given, and resolves with the join code it is issued.
   */
  async function startSimx(target?: string): Promise<string> {
    const bridge = startSimxBridge({ frame, bridgeUrl: relay.address, tokens: simxTokens, log: silentLog, target });
    bridges.push(bridge);
    const deadline = Date.now() + 2000;
    while (bridge.joinCode === undefined) {
      if (Date.now() > deadline) throw new Error("timed out waiting for the simx's join code");
      await delay(10);
    }
    return bridge.joinCode;
  }

  /** Resolves with the join code the simx module shows once it differs from `shown`. */
  async function nextSimxCode(shown: string): Promise<string> {
    const deadline = Date.now() + 2000;
    while (bridges[0].joinCode === shown || bridges[0].joinCode === undefined) {
      if (Date.now() > deadline) throw new Error("timed out waiting for the simx's next join code");
      await delay(10);
    }
    return bridges[0].joinCode;
  }

  /** Creates a store over the spec's persistence, stopped by the spec's cleanup. */
  function editorStore(): EditorSessionStore {
    const store = new EditorSessionStore({ bridgeUrl: relay.address, persistence });
    stores.push(store);
    return store;
  }

  /**
   * Forms a session: the real simx with `CATALOG` posted, and a store
   * connected by the simx's join code. Resolves once the store holds the
   * catalog, with the store and the join code.
   */
  async function formSession(): Promise<{ store: EditorSessionStore; joinCode: string }> {
    const joinCode = await startSimx();
    frame.programPosts(CATALOG);
    const store = editorStore();
    store.connect(joinCode);
    await until(
      store,
      (state) => state.status === "connected" && state.catalogText === CATALOG,
      "the session to form and deliver the catalog"
    );
    return { store, joinCode };
  }

  it("joins by code: the store connects, holds no spent code, and renders each catalog the program posts", async () => {
    const joinCode = await startSimx();
    frame.programPosts(CATALOG);
    const store = editorStore();
    assert.equal(store.getSnapshot().view, "connect");

    store.connect(joinCode);
    assert.equal(store.getSnapshot().entry, "submitted");
    const state = await until(
      store,
      (s) => s.status === "connected" && s.catalogText !== undefined,
      "the session to form and deliver the catalog"
    );

    assert.equal(state.view, "session");
    assert.equal(state.entry, undefined);
    assert.equal(state.joinCode, undefined);
    assert.equal(bridges[0].joinCode, undefined);
    assert.equal(state.catalogText, CATALOG);
    assert.equal(editorTokens.size, 1);

    frame.programPosts(NEWER_CATALOG);
    await until(store, (s) => s.catalogText === NEWER_CATALOG, "the newer catalog to replace the shown one");
  });

  it("exposes the MakeCode target the simx declares, and none when it declares none", async () => {
    const declaredCode = await startSimx("microbit");
    const declaring = editorStore();
    declaring.connect(declaredCode);
    await until(declaring, (s) => s.status === "connected" && s.target === "microbit", "the declared target");
    declaring.forget();
    for (const bridge of bridges.splice(0)) bridge.dispose();

    simxTokens = openBindingTokenStore(() => new MemoryStorage());
    const silentCode = await startSimx();
    frame.programPosts(CATALOG);
    const silent = editorStore();
    silent.connect(silentCode);
    const state = await until(
      silent,
      (s) => s.status === "connected" && s.catalogText === CATALOG,
      "the session to form and deliver the catalog"
    );

    assert.equal(state.target, undefined);
  });

  it("resumes by the persisted token on a fresh page load, presenting no code", async () => {
    const { store } = await formSession();
    store.stop();

    const reloaded = editorStore();
    assert.equal(reloaded.resume(), true);
    assert.equal(reloaded.getSnapshot().view, "session");
    const state = await until(
      reloaded,
      (s) => s.status === "connected" && s.catalogText === CATALOG,
      "the reloaded editor to resume the session"
    );

    assert.equal(state.joinCode, undefined);
    assert.equal(bridges[0].joinCode, undefined);
    assert.equal(lastEditorHello()?.joinCode, undefined);
    assert.equal(lastEditorHello()?.bindingToken, editorTokens.get("token"));
  });

  it("keeps the session across a simx frame reallocation without ever reporting past the grace", async () => {
    const { store } = await formSession();
    const trace: EditorSessionViewState[] = [];
    store.subscribe(() => trace.push(store.getSnapshot()));

    bridges[0].dispose();
    await until(store, (state) => state.status === "disconnected", "the drop to be reported");
    frame = new FakeFrame();
    const rejoined = startSimxBridge({ frame, bridgeUrl: relay.address, tokens: simxTokens, log: silentLog });
    bridges.push(rejoined);
    frame.programPosts(NEWER_CATALOG);
    await until(
      store,
      (state) => state.status === "connected" && state.catalogText === NEWER_CATALOG,
      "the session to heal across the reallocation"
    );

    assert.ok(trace.some((state) => state.status === "disconnected"));
    assert.ok(trace.every((state) => !state.disconnectedBeyondGrace));
    assert.ok(trace.every((state) => state.view === "session"));
    assert.ok(trace.every((state) => state.catalogText !== undefined));
  });

  it("heals across a relay restart by tokens alone, following the join code the restarted relay mints", async () => {
    const { store } = await formSession();
    const token = editorTokens.get("token");

    await relay.restart();
    frame.programPosts(NEWER_CATALOG);
    const state = await until(
      store,
      (s) => s.status === "connected" && s.catalogText === NEWER_CATALOG,
      "the session to heal across the restart under a new code",
      8000
    );

    assert.equal(state.joinCode, undefined);
    assert.equal(editorTokens.get("token"), token);
    assert.equal(lastEditorHello()?.joinCode, undefined);
    assert.equal(lastEditorHello()?.bindingToken, token);
  });

  it("holds when a newer connection presenting its token supersedes it, and forget-and-rejoin enters the code the simx then shows", async () => {
    const { store, joinCode } = await formSession();

    const newer = await relay.connect(EDITOR);
    assertWelcome(await newer.hello({ bindingToken: editorTokens.get("token") }));
    const held = await until(
      store,
      (state) => state.errorCode === BridgeSessionErrorCode.SESSION_REPLACED,
      "the store to report the supersession hold"
    );
    assert.equal(held.view, "session");
    assert.equal(held.status, "disconnected");
    assert.equal(held.catalogText, CATALOG);

    store.forget();

    assert.equal(store.getSnapshot().view, "connect");
    assert.equal(editorTokens.size, 0);

    await newer.close();
    const vacancyCode = await nextSimxCode(joinCode);
    frame.programPosts(NEWER_CATALOG);
    store.connect(vacancyCode);
    const state = await until(
      store,
      (s) => s.status === "connected" && s.catalogText === NEWER_CATALOG,
      "the rejoined session to form"
    );

    assert.equal(state.joinCode, undefined);
    assert.equal(editorTokens.size, 1);
    assert.equal(lastEditorHello()?.joinCode, vacancyCode);
    assert.equal(lastEditorHello()?.bindingToken, undefined);
  });

  it("returns to the connect page with the refusal's code when the relay does not recognize the entered code", async () => {
    await startSimx();
    const store = editorStore();

    store.connect("no-such-code");
    const state = await until(
      store,
      (s) => s.errorCode === BridgeSessionErrorCode.JOIN_CODE_UNKNOWN,
      "the store to report the refusal"
    );

    assert.equal(state.view, "connect");
    assert.equal(state.entry, undefined);
    assert.equal(editorTokens.size, 0);
  });

  it("boots from a link's fragment: scrubs it, then joins by the carried code through the entry flow", async () => {
    const joinCode = await startSimx();
    frame.programPosts(CATALOG);
    const page = pageAt(`#code=${joinCode}`);
    const store = editorStore();

    enterSession(store, page);

    assert.equal(page.location.hash, "");
    assert.equal(store.getSnapshot().view, "connect");
    assert.equal(store.getSnapshot().entry, "submitted");
    const state = await until(
      store,
      (s) => s.status === "connected" && s.catalogText === CATALOG,
      "the session to form from the fragment's code"
    );
    assert.equal(state.entry, undefined);
    assert.equal(lastEditorHello()?.joinCode, joinCode);
    assert.equal(editorTokens.size, 1);
  });

  it("lands on the refusal when a link's code is stale on arrival and no token is held", async () => {
    await startSimx();
    const store = editorStore();

    enterSession(store, pageAt("#code=no-such-code"));
    const state = await until(
      store,
      (s) => s.errorCode === BridgeSessionErrorCode.JOIN_CODE_UNKNOWN,
      "the store to report the refusal"
    );

    assert.equal(state.view, "connect");
    assert.equal(editorTokens.size, 0);
  });

  it("falls back to the held session by its token when a link's code is stale, reporting the refusal until the welcome", async () => {
    const { store } = await formSession();
    const token = editorTokens.get("token");
    store.stop();

    const reloaded = editorStore();
    const trace: EditorSessionViewState[] = [];
    reloaded.subscribe(() => trace.push(reloaded.getSnapshot()));
    enterSession(reloaded, pageAt("#code=no-such-code"));
    const state = await until(
      reloaded,
      (s) => s.status === "connected" && s.catalogText === CATALOG,
      "the reloaded editor to fall back to its session"
    );

    assert.ok(
      trace.some((s) => s.view === "session" && s.errorCode === BridgeSessionErrorCode.JOIN_CODE_UNKNOWN),
      "expected the refusal reported in the session view"
    );
    assert.ok(trace.every((s) => s.view === "session"));
    assert.equal(state.errorCode, undefined);
    assert.equal(editorTokens.get("token"), token);
    const hellos = RecordingWebSocket.created
      .filter((socket) => socket.url.endsWith(`/${EDITOR}`))
      .map((socket) => socket.sentHellos[0]);
    assert.deepEqual(
      hellos.slice(-2).map((hello) => [hello?.joinCode, hello?.bindingToken]),
      [
        ["no-such-code", token],
        [undefined, token],
      ]
    );
  });

  it("joins a fresh code over a held token by the code, keeping the joined session's token", async () => {
    const { store } = await formSession();
    const oldToken = editorTokens.get("token");
    store.stop();
    const other = startSimxBridge({
      frame: new FakeFrame(),
      bridgeUrl: relay.address,
      tokens: openBindingTokenStore(() => new MemoryStorage()),
      log: silentLog,
    });
    bridges.push(other);
    const deadline = Date.now() + 2000;
    while (other.joinCode === undefined) {
      if (Date.now() > deadline) throw new Error("timed out waiting for the other simx's join code");
      await delay(10);
    }
    const freshCode = other.joinCode;

    const reloaded = editorStore();
    enterSession(reloaded, pageAt(`#code=${freshCode}`));
    const state = await until(reloaded, (s) => s.status === "connected", "the editor to join the fresh code's session");

    assert.equal(state.errorCode, undefined);
    assert.equal(lastEditorHello()?.joinCode, freshCode);
    assert.equal(lastEditorHello()?.bindingToken, oldToken);
    assert.notEqual(editorTokens.get("token"), undefined);
    assert.notEqual(editorTokens.get("token"), oldToken);
    assert.equal(other.joinCode, undefined);
  });

  it("ends a live session when forgotten: the simx is told it ended and forgets its token, so its restart forms a new session", async () => {
    const { store } = await formSession();
    assert.notEqual(simxTokens.load(), undefined);

    store.forget();
    assert.equal(store.getSnapshot().view, "connect");
    assert.equal(editorTokens.size, 0);
    const deadline = Date.now() + 2000;
    while (simxTokens.load() !== undefined) {
      if (Date.now() > deadline) throw new Error("timed out waiting for the simx to forget its token");
      await delay(10);
    }

    bridges[0].dispose();
    frame = new FakeFrame();
    const restartedCode = await startSimx();
    frame.programPosts(NEWER_CATALOG);
    store.connect(restartedCode);
    const state = await until(
      store,
      (s) => s.status === "connected" && s.catalogText === NEWER_CATALOG,
      "a new session to form with the restarted simx"
    );

    assert.equal(state.view, "session");
    assert.equal(lastEditorHello()?.bindingToken, undefined);
    assert.equal(lastEditorHello()?.joinCode, restartedCode);
  });
});
