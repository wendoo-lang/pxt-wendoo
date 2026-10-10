import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PeerSessionError, PeerSessionErrorCode } from "@wendoo/bridge-app";
import type { MakeCodeSessionMessage, MakeCodeSessionPort } from "./makecode-session.js";
import { connectMakeCodeSession, MAKECODE_SESSION_PROTOCOL_VERSION } from "./makecode-session.js";

/**
 * A catalog document exercising characters a JSON wire must carry intact: quotes,
 * backslashes, escape sequences written as text, control characters, and
 * non-ASCII code units including a surrogate pair.
 */
const CATALOG_TEXT =
  '{"packs":[{"name":"beacon","tiles":[{"name":"say \\"hi\\"","kind":"actuator","docs":"line\\nnext \\u00e9"}]}]}' +
  "\t\r\n\u0001 caf\u00e9 \ud83d\ude00 \\";

/**
 * Two ports joined by a JSON wire: every message one side posts is
 * serialized, parsed, and delivered to the other side in a later microtask.
 */
function linkedPorts(): [MakeCodeSessionPort, MakeCodeSessionPort] {
  const listeners: [Set<(message: MakeCodeSessionMessage) => void>, Set<(message: MakeCodeSessionMessage) => void>] = [
    new Set(),
    new Set(),
  ];
  const port = (self: 0 | 1): MakeCodeSessionPort => ({
    postMessage(message) {
      const wire = JSON.stringify(message);
      queueMicrotask(() => {
        for (const listener of listeners[1 - self]) {
          listener(JSON.parse(wire) as MakeCodeSessionMessage);
        }
      });
    },
    onMessage(listener) {
      listeners[self].add(listener);
      return () => {
        listeners[self].delete(listener);
      };
    },
  });
  return [port(0), port(1)];
}

/**
 * A scripted peer: answers this side's `makecode:hello` with `replies`,
 * delivered synchronously and in order, and reports how many listeners are
 * attached.
 */
function scriptedPeer(replies: readonly MakeCodeSessionMessage[]): MakeCodeSessionPort & {
  listenerCount(): number;
} {
  const listeners = new Set<(message: MakeCodeSessionMessage) => void>();
  return {
    listenerCount: () => listeners.size,
    postMessage(message) {
      if (message.type === "makecode:hello") {
        for (const reply of replies) {
          for (const listener of listeners) {
            listener(reply);
          }
        }
      }
    },
    onMessage(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

describe("makecode session establishment", () => {
  it("accepts a peer declaring v1 and records its version", async () => {
    const port = scriptedPeer([{ type: "makecode:hello", payload: { protocolVersion: 1 } }]);

    const session = await connectMakeCodeSession({ port });

    assert.equal(session.peerProtocolVersion, 1);
    session.dispose();
  });

  it("establishes between two parties, each recording the version the other declared", async () => {
    const [editorPort, peerPort] = linkedPorts();

    const [editor, peer] = await Promise.all([
      connectMakeCodeSession({ port: editorPort }),
      connectMakeCodeSession({ port: peerPort }),
    ]);

    assert.equal(editor.peerProtocolVersion, MAKECODE_SESSION_PROTOCOL_VERSION);
    assert.equal(peer.peerProtocolVersion, MAKECODE_SESSION_PROTOCOL_VERSION);
    editor.dispose();
    peer.dispose();
  });

  it("rejects a peer declaring a newer version with the stable code and detaches", async () => {
    const port = scriptedPeer([{ type: "makecode:hello", payload: { protocolVersion: 2 } }]);

    await assert.rejects(connectMakeCodeSession({ port }), (error: unknown) => {
      assert.ok(error instanceof PeerSessionError);
      assert.equal(error.code, PeerSessionErrorCode.PROTOCOL_VERSION_NEWER);
      return true;
    });
    assert.equal(port.listenerCount(), 0);
  });
});

describe("makecode session target declaration", () => {
  it("declares the target it is given in its hello, and a peer declaring none records none", async () => {
    const [simxPort, editorPort] = linkedPorts();

    const [simx, editor] = await Promise.all([
      connectMakeCodeSession({ port: simxPort, target: "microbit" }),
      connectMakeCodeSession({ port: editorPort }),
    ]);

    assert.equal(editor.peerTarget, "microbit");
    assert.equal(simx.peerTarget, undefined);
    simx.dispose();
    editor.dispose();
  });

  it("sends a hello carrying its target, and one carrying only its version when it declares none", async () => {
    const hellos: MakeCodeSessionMessage[] = [];
    const recording = (): MakeCodeSessionPort => {
      const peer = scriptedPeer([{ type: "makecode:hello", payload: { protocolVersion: 1 } }]);
      return {
        postMessage(message) {
          hellos.push(message);
          peer.postMessage(message);
        },
        onMessage: (listener) => peer.onMessage(listener),
      };
    };

    const declaring = await connectMakeCodeSession({ port: recording(), target: "arcade" });
    const silent = await connectMakeCodeSession({ port: recording() });

    assert.deepEqual(hellos, [
      {
        type: "makecode:hello",
        payload: { protocolVersion: MAKECODE_SESSION_PROTOCOL_VERSION, declaration: { target: "arcade" } },
      },
      { type: "makecode:hello", payload: { protocolVersion: MAKECODE_SESSION_PROTOCOL_VERSION } },
    ]);
    declaring.dispose();
    silent.dispose();
  });

  it("records the target a peer's hello declares, and none for a declaration without one", async () => {
    const declaring = await connectMakeCodeSession({
      port: scriptedPeer([
        { type: "makecode:hello", payload: { protocolVersion: 1, declaration: { target: "arcade" } } },
      ]),
    });
    const empty = await connectMakeCodeSession({
      port: scriptedPeer([{ type: "makecode:hello", payload: { protocolVersion: 1, declaration: {} } }]),
    });

    assert.equal(declaring.peerTarget, "arcade");
    assert.equal(empty.peerTarget, undefined);
    declaring.dispose();
    empty.dispose();
  });
});

describe("makecode session catalog", () => {
  it("delivers a published catalog to the peer byte-verbatim across a JSON wire", async () => {
    const [simxPort, editorPort] = linkedPorts();
    const [simx, editor] = await Promise.all([
      connectMakeCodeSession({ port: simxPort }),
      connectMakeCodeSession({ port: editorPort }),
    ]);
    const received: string[] = [];
    editor.onCatalog((content) => {
      received.push(content);
    });

    simx.publishCatalog(CATALOG_TEXT);
    simx.publishCatalog("{}");
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.deepEqual(received, [CATALOG_TEXT, "{}"]);
    simx.dispose();
    editor.dispose();
  });

  it("replays a catalog that arrives with the peer's hello to the first listener", async () => {
    const port = scriptedPeer([
      { type: "makecode:hello", payload: { protocolVersion: 1 } },
      { type: "makecode:catalog", payload: { content: CATALOG_TEXT } },
    ]);
    const session = await connectMakeCodeSession({ port });

    const received: string[] = [];
    session.onCatalog((content) => {
      received.push(content);
    });

    assert.deepEqual(received, [CATALOG_TEXT]);
    session.dispose();
  });
});

describe("makecode session liveness", () => {
  /**
   * A session over one end of a JSON wire whose other end the spec drives by
   * hand: the hello is answered, and every message the session sends after
   * it is recorded.
   */
  async function handDriven(): Promise<{
    session: Awaited<ReturnType<typeof connectMakeCodeSession>>;
    send(message: MakeCodeSessionMessage): void;
    sent: MakeCodeSessionMessage[];
  }> {
    const [sessionPort, handPort] = linkedPorts();
    const sent: MakeCodeSessionMessage[] = [];
    handPort.onMessage((message) => {
      if (message.type === "makecode:hello") return;
      sent.push(message);
    });
    handPort.postMessage({ type: "makecode:hello", payload: { protocolVersion: MAKECODE_SESSION_PROTOCOL_VERSION } });
    const session = await connectMakeCodeSession({ port: sessionPort });
    return { session, send: (message) => handPort.postMessage(message), sent };
  }

  it("answers each ping with the pong carrying the same id", async () => {
    const { session, send, sent } = await handDriven();

    send({ type: "makecode:ping", id: "probe-1" });
    send({ type: "makecode:ping", id: "probe-2" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.deepEqual(sent, [
      { type: "makecode:pong", id: "probe-1" },
      { type: "makecode:pong", id: "probe-2" },
    ]);
    session.dispose();
  });

  it("answers no ping once disposed", async () => {
    const { session, send, sent } = await handDriven();

    session.dispose();
    send({ type: "makecode:ping", id: "late" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.deepEqual(sent, []);
  });

  it("resolves a ping once the peer's pong arrives", async () => {
    const [editorPort, peerPort] = linkedPorts();
    const [editor, peer] = await Promise.all([
      connectMakeCodeSession({ port: editorPort }),
      connectMakeCodeSession({ port: peerPort, target: "arcade" }),
    ]);

    await editor.ping();
    await peer.ping();

    editor.dispose();
    peer.dispose();
  });

  it("settles a ping only on the pong carrying its own id, and leaves a ping pending at dispose unsettled", async () => {
    const { session, send, sent } = await handDriven();
    let settled = false;
    session.ping().then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      }
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    const [probe] = sent;
    assert.equal(probe?.type, "makecode:ping");

    send({ type: "makecode:pong", id: "another" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(settled, false);

    session.dispose();
    if (probe?.type === "makecode:ping") send({ type: "makecode:pong", id: probe.id });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(settled, false);
  });

  it("mints each ping a distinct id", async () => {
    const { session, sent } = await handDriven();

    void session.ping();
    void session.ping();
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(sent.length, 2);
    const ids = sent.map((message) => (message.type === "makecode:ping" ? message.id : undefined));
    assert.ok(ids.every((id) => typeof id === "string"));
    assert.notEqual(ids[0], ids[1]);
    session.dispose();
  });
});
