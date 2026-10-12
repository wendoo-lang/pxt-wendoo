import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MakeCodeAsset } from "./makecode-assets.js";
import type { MakeCodeSession, MakeCodeSessionMessage, MakeCodeSessionPort } from "./makecode-session.js";
import { connectMakeCodeSession } from "./makecode-session.js";

/** An SVG preview as a data URI. */
const SVG_PREVIEW =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxIiBoZWlnaHQ9IjEiLz4=";

/** A PNG preview as a data URI. */
const PNG_PREVIEW =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

/**
 * A snapshot whose first entry carries a name needing escapes on a JSON wire,
 * whose second carries no name, and whose third, of a kind with no visual
 * form, carries no dimensions and no preview.
 */
const SNAPSHOT: MakeCodeAsset[] = [
  { kind: "image", id: "image1", name: 'hero "jumping" café 😀', width: 16, height: 16, previewUrl: SVG_PREVIEW },
  { kind: "image", id: "image2", width: 160, height: 120, previewUrl: PNG_PREVIEW },
  { kind: "song", id: "song1", name: "theme" },
];

/** A port whose sent messages the spec can read, and into which it can deliver messages from the peer. */
interface WirePort extends MakeCodeSessionPort {
  /** Every message sent to the peer, as the JSON wire carried it. */
  readonly sent: MakeCodeSessionMessage[];
  /** A message arriving from the peer, as the JSON wire carries it. */
  deliver(message: object): void;
}

/** A port on a JSON wire that answers this side's hello with a hello at this build's version. */
function wirePort(): WirePort {
  const listeners = new Set<(message: MakeCodeSessionMessage) => void>();
  const sent: MakeCodeSessionMessage[] = [];
  const deliver = (message: object): void => {
    const parsed = JSON.parse(JSON.stringify(message)) as MakeCodeSessionMessage;
    for (const listener of listeners) listener(parsed);
  };
  return {
    sent,
    deliver,
    postMessage(message) {
      sent.push(JSON.parse(JSON.stringify(message)) as MakeCodeSessionMessage);
      if (message.type === "makecode:hello") deliver({ type: "makecode:hello", payload: { protocolVersion: 1 } });
    },
    onMessage(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Opens a session over a fresh {@link wirePort}. */
async function openSession(): Promise<{ session: MakeCodeSession; port: WirePort }> {
  const port = wirePort();
  const session = await connectMakeCodeSession({ port });
  return { session, port };
}

/**
 * Two sessions joined by a JSON wire, standing in for the port that joins an
 * editor and the party serving the project: every message one posts reaches
 * the other.
 */
async function openPair(): Promise<{ editor: MakeCodeSession; simx: MakeCodeSession }> {
  const listeners = [
    new Set<(message: MakeCodeSessionMessage) => void>(),
    new Set<(message: MakeCodeSessionMessage) => void>(),
  ];
  const end = (side: 0 | 1): MakeCodeSessionPort => ({
    postMessage(message) {
      const parsed = JSON.parse(JSON.stringify(message)) as MakeCodeSessionMessage;
      queueMicrotask(() => {
        for (const listener of listeners[1 - side]) listener(parsed);
      });
    },
    onMessage(listener) {
      listeners[side].add(listener);
      return () => {
        listeners[side].delete(listener);
      };
    },
  });
  const [editor, simx] = await Promise.all([
    connectMakeCodeSession({ port: end(0) }),
    connectMakeCodeSession({ port: end(1), target: "arcade" }),
  ]);
  return { editor, simx };
}

/** Resolves once queued microtasks and the current macrotask have run. */
function settle(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe("makecode session assets", () => {
  it("sends a snapshot as one makecode:assets message carrying its entries", async () => {
    const { session, port } = await openSession();

    session.publishAssets(SNAPSHOT);

    assert.deepEqual(port.sent.at(-1), { type: "makecode:assets", payload: { assets: SNAPSHOT } });
    session.dispose();
  });

  it("delivers each published snapshot to the peer whole and intact across a JSON wire, in order", async () => {
    const { editor, simx } = await openPair();
    const received: MakeCodeAsset[][] = [];
    editor.onAssets((assets) => {
      received.push(assets);
    });

    simx.publishAssets(SNAPSHOT);
    simx.publishAssets(SNAPSHOT.slice(1));
    await settle();

    assert.deepEqual(received, [SNAPSHOT, SNAPSHOT.slice(1)]);
    assert.equal("name" in received[0][1], false);
    assert.equal("width" in received[0][2], false);
    assert.equal("height" in received[0][2], false);
    assert.equal("previewUrl" in received[0][2], false);
    editor.dispose();
    simx.dispose();
  });

  it("carries an empty snapshot as an empty list", async () => {
    const { editor, simx } = await openPair();
    const received: MakeCodeAsset[][] = [];
    editor.onAssets((assets) => {
      received.push(assets);
    });

    simx.publishAssets([]);
    await settle();

    assert.deepEqual(received, [[]]);
    editor.dispose();
    simx.dispose();
  });

  it("carries entries of several kinds, including one it names nowhere, two sharing an id", async () => {
    const { editor, simx } = await openPair();
    const mixed: MakeCodeAsset[] = [
      { kind: "image", id: "hero", width: 16, height: 16, previewUrl: SVG_PREVIEW },
      { kind: "animation", id: "hero", name: "hero walk", width: 16, height: 16, previewUrl: SVG_PREVIEW },
      { kind: "kind-from-a-newer-publisher", id: "thing1", width: 8, height: 4, previewUrl: PNG_PREVIEW },
    ];
    const received: MakeCodeAsset[][] = [];
    editor.onAssets((assets) => {
      received.push(assets);
    });

    simx.publishAssets(mixed);
    await settle();

    assert.deepEqual(received, [mixed]);
    editor.dispose();
    simx.dispose();
  });

  it("replays snapshots received while no listener was attached to the first listener, in arrival order", async () => {
    const { session, port } = await openSession();
    port.deliver({ type: "makecode:assets", payload: { assets: SNAPSHOT } });
    port.deliver({ type: "makecode:assets", payload: { assets: [] } });

    const received: MakeCodeAsset[][] = [];
    session.onAssets((assets) => {
      received.push(assets);
    });

    assert.deepEqual(received, [SNAPSHOT, []]);
    session.dispose();
  });

  it("delivers snapshots to asset listeners only and catalogs to catalog listeners only, ignoring types it does not know", async () => {
    const { session, port } = await openSession();
    const snapshots: MakeCodeAsset[][] = [];
    const catalogs: string[] = [];
    session.onAssets((assets) => {
      snapshots.push(assets);
    });
    session.onCatalog((content) => {
      catalogs.push(content);
    });

    port.deliver({ type: "makecode:assets", payload: { assets: SNAPSHOT } });
    port.deliver({ type: "makecode:catalog", payload: { content: "a catalog" } });
    port.deliver({ type: "makecode:brainsAck", id: "no-such-request" });
    port.deliver({ type: "makecode:somethingNewer", payload: { assets: [] } });
    port.deliver({ type: "makecode:assets", payload: { assets: [] } });

    assert.deepEqual(snapshots, [SNAPSHOT, []]);
    assert.deepEqual(catalogs, ["a catalog"]);
    session.dispose();
  });
});
