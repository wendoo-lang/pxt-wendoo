import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MakeCodeAsset } from "./makecode-assets.js";
import type { MakeCodeProjectInfo } from "./makecode-project-info.js";
import type { MakeCodeSession, MakeCodeSessionMessage, MakeCodeSessionPort } from "./makecode-session.js";
import { connectMakeCodeSession } from "./makecode-session.js";

/** Project facts whose name needs escapes on a JSON wire. */
const INFO: MakeCodeProjectInfo = { name: 'My "Platformer" café 😀' };

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
 * Two sessions joined by a JSON wire, as the relay joins an editor and the
 * party serving the project: every message one posts reaches the other.
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

describe("makecode session project info", () => {
  it("sends the project's facts as one makecode:projectInfo message", async () => {
    const { session, port } = await openSession();

    session.publishProjectInfo(INFO);

    assert.deepEqual(port.sent.at(-1), { type: "makecode:projectInfo", payload: INFO });
    session.dispose();
  });

  it("delivers each published reading to the peer intact across a JSON wire, in order", async () => {
    const { editor, simx } = await openPair();
    const received: MakeCodeProjectInfo[] = [];
    editor.onProjectInfo((info) => {
      received.push(info);
    });

    simx.publishProjectInfo(INFO);
    simx.publishProjectInfo({ name: "Renamed" });
    await settle();

    assert.deepEqual(received, [INFO, { name: "Renamed" }]);
    editor.dispose();
    simx.dispose();
  });

  it("replays readings received while no listener was attached to the first listener, in arrival order", async () => {
    const { session, port } = await openSession();
    port.deliver({ type: "makecode:projectInfo", payload: INFO });
    port.deliver({ type: "makecode:projectInfo", payload: { name: "Renamed" } });

    const received: MakeCodeProjectInfo[] = [];
    session.onProjectInfo((info) => {
      received.push(info);
    });

    assert.deepEqual(received, [INFO, { name: "Renamed" }]);
    session.dispose();
  });

  it("delivers project info to its listeners only, beside asset snapshots and catalogs, ignoring types it does not know", async () => {
    const { session, port } = await openSession();
    const infos: MakeCodeProjectInfo[] = [];
    const snapshots: MakeCodeAsset[][] = [];
    const catalogs: string[] = [];
    session.onProjectInfo((info) => {
      infos.push(info);
    });
    session.onAssets((assets) => {
      snapshots.push(assets);
    });
    session.onCatalog((content) => {
      catalogs.push(content);
    });

    port.deliver({ type: "makecode:projectInfo", payload: INFO });
    port.deliver({ type: "makecode:assets", payload: { assets: [] } });
    port.deliver({ type: "makecode:catalog", payload: { content: "a catalog" } });
    port.deliver({ type: "makecode:somethingNewer", payload: { name: "not project info" } });
    port.deliver({ type: "makecode:projectInfo", payload: { name: "Renamed" } });

    assert.deepEqual(infos, [INFO, { name: "Renamed" }]);
    assert.deepEqual(snapshots, [[]]);
    assert.deepEqual(catalogs, ["a catalog"]);
    session.dispose();
  });

  it("drops a message type it does not know, as an earlier party drops project info, with its traffic intact", async () => {
    const { session, port } = await openSession();
    const snapshots: MakeCodeAsset[][] = [];
    session.onAssets((assets) => {
      snapshots.push(assets);
    });
    const listing = session.listBrains();
    const request = port.sent.at(-1) as { id: string };

    port.deliver({ type: "makecode:factsFromANewerPublisher", payload: { name: "Mine" } });
    port.deliver({ type: "makecode:assets", payload: { assets: [] } });
    port.deliver({ type: "makecode:brainsListReply", id: request.id, payload: { brains: [] } });

    assert.deepEqual(await listing, []);
    assert.deepEqual(snapshots, [[]]);
    session.dispose();
  });

  it("carries fields a newer publisher adds beside the name to the listener as they arrive", async () => {
    const { session, port } = await openSession();
    const received: MakeCodeProjectInfo[] = [];
    session.onProjectInfo((info) => {
      received.push(info);
    });

    port.deliver({ type: "makecode:projectInfo", payload: { name: "Mine", factFromANewerPublisher: 1 } });

    assert.equal(received.length, 1);
    assert.equal(received[0].name, "Mine");
    session.dispose();
  });
});
