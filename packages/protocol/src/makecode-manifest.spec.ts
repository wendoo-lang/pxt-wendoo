import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MakeCodeIdManifest, MakeCodeManifestReading } from "./makecode-manifest.js";
import { MakeCodeManifestProblemCode } from "./makecode-manifest.js";
import type { MakeCodeSession, MakeCodeSessionMessage, MakeCodeSessionPort } from "./makecode-session.js";
import { connectMakeCodeSession, MAKECODE_SESSION_PROTOCOL_VERSION } from "./makecode-session.js";

/** A manifest exercising every id space, a field list with a retired field, and a name needing escapes on a JSON wire. */
const MANIFEST: MakeCodeIdManifest = {
  actions: [
    { name: "actuator.chime.ring", id: 1024 },
    { name: 'sensor.say "hi" café', id: 1025 },
  ],
  operators: [{ name: "beacon.combine", id: 1024 }],
  types: [{ name: "Beacon", atom: 1024, fields: ["y", "retired", "x"] }],
  next: { action: 1026, operator: 1025, atom: 1025 },
};

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
      if (message.type === "makecode:hello") {
        deliver({ type: "makecode:hello", payload: { protocolVersion: MAKECODE_SESSION_PROTOCOL_VERSION } });
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

describe("makecode session manifest", () => {
  it("sends a reading as one makecode:manifest message carrying it", async () => {
    const { session, port } = await openSession();

    session.publishManifest({ manifest: MANIFEST });

    assert.deepEqual(port.sent.at(-1), { type: "makecode:manifest", payload: { manifest: MANIFEST } });
    session.dispose();
  });

  it("delivers each published reading to the peer whole and intact across a JSON wire, in order", async () => {
    const { editor, simx } = await openPair();
    const received: MakeCodeManifestReading[] = [];
    editor.onManifest((reading) => {
      received.push(reading);
    });

    simx.publishManifest({ manifest: null });
    simx.publishManifest({ manifest: MANIFEST });
    await settle();

    assert.deepEqual(received, [{ manifest: null }, { manifest: MANIFEST }]);
    assert.equal("problem" in received[1], false);
    editor.dispose();
    simx.dispose();
  });

  it("carries a reading's problem with it, and a reading without one as none", async () => {
    const { editor, simx } = await openPair();
    const received: MakeCodeManifestReading[] = [];
    editor.onManifest((reading) => {
      received.push(reading);
    });

    simx.publishManifest({ manifest: null, problem: MakeCodeManifestProblemCode.FORMAT_NEWER });
    simx.publishManifest({ manifest: MANIFEST });
    await settle();

    assert.deepEqual(received, [
      { manifest: null, problem: MakeCodeManifestProblemCode.FORMAT_NEWER },
      { manifest: MANIFEST },
    ]);
    editor.dispose();
    simx.dispose();
  });

  it("replays readings received while no listener was attached to the first listener, in arrival order", async () => {
    const { session, port } = await openSession();
    port.deliver({ type: "makecode:manifest", payload: { manifest: MANIFEST } });
    port.deliver({ type: "makecode:manifest", payload: { manifest: null } });

    const received: MakeCodeManifestReading[] = [];
    session.onManifest((reading) => {
      received.push(reading);
    });

    assert.deepEqual(received, [{ manifest: MANIFEST }, { manifest: null }]);
    session.dispose();
  });

  it("delivers readings to manifest listeners only and catalogs to catalog listeners only", async () => {
    const { session, port } = await openSession();
    const readings: MakeCodeManifestReading[] = [];
    const catalogs: string[] = [];
    session.onManifest((reading) => {
      readings.push(reading);
    });
    session.onCatalog((content) => {
      catalogs.push(content);
    });

    port.deliver({ type: "makecode:catalog", payload: { content: "a catalog" } });
    port.deliver({ type: "makecode:manifest", payload: { manifest: MANIFEST } });
    port.deliver({ type: "makecode:brainsAck", id: "no-such-request" });
    port.deliver({ type: "makecode:assets", payload: { assets: [] } });

    assert.deepEqual(readings, [{ manifest: MANIFEST }]);
    assert.deepEqual(catalogs, ["a catalog"]);
    session.dispose();
  });
});
