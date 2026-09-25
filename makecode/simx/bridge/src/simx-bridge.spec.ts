import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { PROTOCOL_VERSION } from "@wendoo/bridge-protocol";
import type { MakeCodeSession, MakeCodeSessionMessage, MakeCodeSessionPort } from "@wendoo/makecode-session";
import { connectMakeCodeSession } from "@wendoo/makecode-session";
import { SIMX_CHANNEL, type SimxFrame } from "./sim-channel.js";
import { type SimxBridge, startSimxBridge } from "./simx-bridge.js";

/**
 * A catalog document exercising characters a JSON wire must carry intact: quotes,
 * backslashes, escape sequences written as text, control characters, and
 * non-ASCII code units including a surrogate pair.
 */
const CATALOG_TEXT =
  '{"packs":[{"name":"beacon","tiles":[{"name":"say \\"hi\\"","kind":"actuator","docs":"line\\nnext \\u00e9"}]}]}' +
  "\t\r\n\u0001 caf\u00e9 \ud83d\ude00 \\";

/** How long a spec waits for the bridge client to open its next connection, or for a session to establish. */
const WAIT_MS = 2000;

/** Relay-side stand-in for one WebSocket the bridge client opens. */
class MockWebSocket {
  static instances: MockWebSocket[] = [];

  onopen: ((event: unknown) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  readonly url: string;
  /** Every frame the client sent, as its JSON text. */
  readonly sent: string[] = [];
  /** Called with each frame the client sends. */
  onSend: ((data: string) => void) | undefined;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
    this.onSend?.(data);
  }

  close(): void {}

  /** The relay accepting the connection and welcoming its hello. */
  open(): void {
    this.onopen?.({});
    this.receive({ type: "session:welcome", payload: { protocolVersion: PROTOCOL_VERSION, sessionId: "pairing-1" } });
  }

  /** The relay sending `message` to the client. */
  receive(message: object): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  /** The relay closing the connection. */
  drop(): void {
    this.onclose?.({});
  }

  /** The types of the frames the client sent. */
  sentTypes(): string[] {
    return this.sent.map((data) => (JSON.parse(data) as { type: string }).type);
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

  /** MakeCode delivering a message the running program posted on `channel` with `text` as its UTF-8 bytes. */
  programPosts(text: string, channel = SIMX_CHANNEL): void {
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

/**
 * The editor's end of a JSON wire through the relay over `socket`: payload
 * frames the client sends reach the port's listeners, and messages posted on
 * the port reach the client as JSON text, each in a later microtask.
 */
function editorPortOver(socket: MockWebSocket): MakeCodeSessionPort {
  const listeners = new Set<(message: MakeCodeSessionMessage) => void>();
  socket.onSend = (data) => {
    const message = JSON.parse(data) as { type: string };
    if (!message.type.startsWith("makecode:")) {
      return;
    }
    queueMicrotask(() => {
      for (const listener of listeners) {
        listener(JSON.parse(data) as MakeCodeSessionMessage);
      }
    });
  };
  return {
    postMessage(message) {
      const wire = JSON.stringify(message);
      queueMicrotask(() => {
        socket.receive(JSON.parse(wire) as object);
      });
    },
    onMessage(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/**
 * Open the relay's connection `socket` and establish an editor session with
 * the bridge over it, both hellos crossing once the connection is open.
 */
async function connectEditor(socket: MockWebSocket): Promise<MakeCodeSession> {
  const editor = connectMakeCodeSession({ port: editorPortOver(socket) });
  socket.open();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("the editor session was not established")), WAIT_MS);
  });
  try {
    return await Promise.race([editor, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Catalogs the editor session receives, in arrival order. */
function receivedCatalogs(editor: MakeCodeSession): string[] {
  const received: string[] = [];
  editor.onCatalog((catalog) => {
    received.push(catalog);
  });
  return received;
}

/** Settle every pending microtask and macrotask of the wire. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** The socket the bridge client opens after `count` sockets, once it exists. */
async function nextSocket(count: number): Promise<MockWebSocket> {
  const deadline = Date.now() + WAIT_MS;
  while (MockWebSocket.instances.length <= count) {
    assert.ok(Date.now() < deadline, "the bridge client opened no new connection");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return MockWebSocket.instances[count];
}

describe("simx bridge", () => {
  const realWebSocket = globalThis.WebSocket;
  let frame: FakeFrame;
  let bridge: SimxBridge;

  beforeEach(() => {
    MockWebSocket.instances = [];
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
    frame = new FakeFrame();
    bridge = startSimxBridge({ frame, bridgeUrl: "localhost:6464" });
  });

  afterEach(() => {
    bridge.dispose();
    globalThis.WebSocket = realWebSocket;
  });

  it("connects at the makecode simx role path and asks the program for its catalog", () => {
    assert.equal(MockWebSocket.instances.length, 1);
    assert.equal(MockWebSocket.instances[0].url, "ws://localhost:6464/makecode/simx");
    assert.deepEqual(frame.posted, [{ type: "messagepacket", channel: SIMX_CHANNEL, data: new Uint8Array(0) }]);
  });

  it("publishes each catalog the program posts to the editor byte-verbatim, ignoring other channels", async () => {
    const editor = await connectEditor(MockWebSocket.instances[0]);
    const received = receivedCatalogs(editor);

    frame.programPosts("not a catalog", "other/channel");
    frame.programPosts(CATALOG_TEXT);
    frame.programPosts("{}");
    await settle();

    assert.deepEqual(received, [CATALOG_TEXT, "{}"]);
    editor.dispose();
  });

  it("publishes a catalog posted before the connection opened once the session is established", async () => {
    frame.programPosts(CATALOG_TEXT);

    const editor = await connectEditor(MockWebSocket.instances[0]);
    const received = receivedCatalogs(editor);
    await settle();

    assert.deepEqual(received, [CATALOG_TEXT]);
    editor.dispose();
  });

  it("opens a new session on each connection and leaves the closed connection's session", async () => {
    const first = MockWebSocket.instances[0];
    const firstEditor = await connectEditor(first);
    const firstReceived = receivedCatalogs(firstEditor);
    frame.programPosts("{}");
    await settle();

    first.drop();
    frame.programPosts(CATALOG_TEXT);
    const second = await nextSocket(1);
    const secondEditor = await connectEditor(second);
    const secondReceived = receivedCatalogs(secondEditor);
    await settle();

    assert.deepEqual(firstReceived, ["{}"]);
    assert.deepEqual(first.sentTypes(), ["session:hello", "makecode:hello", "makecode:catalog"]);
    assert.deepEqual(secondReceived, [CATALOG_TEXT]);
    assert.deepEqual(second.sentTypes(), ["session:hello", "makecode:hello", "makecode:catalog"]);
    firstEditor.dispose();
    secondEditor.dispose();
  });
});
