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
