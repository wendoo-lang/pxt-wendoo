import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  MakeCodeIdManifest,
  MakeCodeManifestRequest,
  MakeCodeManifestRequestMessage,
} from "./makecode-manifest.js";
import { MakeCodeManifestError, MakeCodeManifestErrorCode, MakeCodeManifestProblemCode } from "./makecode-manifest.js";
import type { MakeCodeSession, MakeCodeSessionMessage, MakeCodeSessionPort } from "./makecode-session.js";
import { connectMakeCodeSession } from "./makecode-session.js";

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

/** The last manifest request `port` sent. Fails the spec when the last message is not one. */
function lastRequest(port: WirePort): MakeCodeManifestRequestMessage {
  const message = port.sent.at(-1);
  assert.ok(message?.type.startsWith("makecode:manifest"), "expected a manifest request");
  return message as MakeCodeManifestRequestMessage;
}

/** Asserts that `promise` rejects with a {@link MakeCodeManifestError} carrying `code`. */
async function rejectsWith(promise: Promise<unknown>, code: MakeCodeManifestErrorCode): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof MakeCodeManifestError);
    assert.equal(error.code, code);
    return true;
  });
}

/** Opens a session over a fresh {@link wirePort}. */
async function openSession(): Promise<{ session: MakeCodeSession; port: WirePort }> {
  const port = wirePort();
  const session = await connectMakeCodeSession({ port });
  return { session, port };
}

/** The requests a session delivered to its manifest request listener, in arrival order. */
function servedRequests(session: MakeCodeSession): MakeCodeManifestRequest[] {
  const served: MakeCodeManifestRequest[] = [];
  session.onManifestRequest((request) => {
    served.push(request);
  });
  return served;
}

/** The only request in `served`, narrowed to `kind`. Fails the spec otherwise. */
function onlyRequest<TKind extends MakeCodeManifestRequest["kind"]>(
  served: MakeCodeManifestRequest[],
  kind: TKind
): Extract<MakeCodeManifestRequest, { kind: TKind }> {
  assert.equal(served.length, 1);
  assert.equal(served[0].kind, kind);
  return served[0] as Extract<MakeCodeManifestRequest, { kind: TKind }>;
}

/** Two sessions joined by a JSON wire, standing in for the port that joins an editor and the party serving the project. */
async function openPair(): Promise<{ requester: MakeCodeSession; responder: MakeCodeSession }> {
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
  const [requester, responder] = await Promise.all([
    connectMakeCodeSession({ port: end(0) }),
    connectMakeCodeSession({ port: end(1), target: "arcade" }),
  ]);
  return { requester, responder };
}

describe("makecode session manifest requests", () => {
  it("reads the project's manifest: sends a read request and resolves with the reply carrying its id", async () => {
    const { session, port } = await openSession();

    const read = session.readManifest();
    const request = lastRequest(port);
    assert.deepEqual(request, { type: "makecode:manifestRead", id: request.id });
    port.deliver({ type: "makecode:manifestReadReply", id: request.id, payload: { manifest: MANIFEST } });

    assert.deepEqual(await read, { manifest: MANIFEST });
    session.dispose();
  });

  it("reads a missing manifest as null, and a damaged one as its coded problem", async () => {
    const { session, port } = await openSession();

    const missing = session.readManifest();
    port.deliver({ type: "makecode:manifestReadReply", id: lastRequest(port).id, payload: { manifest: null } });
    const newer = session.readManifest();
    port.deliver({
      type: "makecode:manifestReadReply",
      id: lastRequest(port).id,
      payload: { manifest: null, problem: MakeCodeManifestProblemCode.FORMAT_NEWER },
    });

    assert.deepEqual(await missing, { manifest: null });
    assert.deepEqual(await newer, { manifest: null, problem: MakeCodeManifestProblemCode.FORMAT_NEWER });
    session.dispose();
  });

  it("writes the whole manifest, resolving on the acknowledgement", async () => {
    const { session, port } = await openSession();

    const written = session.writeManifest(MANIFEST);
    const request = lastRequest(port);
    assert.deepEqual(request, { type: "makecode:manifestWrite", id: request.id, payload: { manifest: MANIFEST } });
    port.deliver({ type: "makecode:manifestAck", id: request.id });

    await written;
    session.dispose();
  });

  it("rejects a request answered by an error reply with the reply's code", async () => {
    const { session, port } = await openSession();

    const read = session.readManifest();
    port.deliver({
      type: "makecode:manifestError",
      id: lastRequest(port).id,
      payload: { code: MakeCodeManifestErrorCode.READ_FAILED, message: "unreadable" },
    });
    const written = session.writeManifest(MANIFEST);
    port.deliver({
      type: "makecode:manifestError",
      id: lastRequest(port).id,
      payload: { code: MakeCodeManifestErrorCode.WRITE_FAILED, message: "unwritable" },
    });

    await rejectsWith(read, MakeCodeManifestErrorCode.READ_FAILED);
    await rejectsWith(written, MakeCodeManifestErrorCode.WRITE_FAILED);
    session.dispose();
  });

  it("never settles a manifest request by a brains reply carrying its id", async () => {
    const { session, port } = await openSession();

    const written = session.writeManifest(MANIFEST);
    const id = lastRequest(port).id;
    port.deliver({ type: "makecode:brainsAck", id });
    port.deliver({ type: "makecode:manifestAck", id });

    await written;
    session.dispose();
  });

  it("rejects every request in flight with CLOSED when disposed, and every later request at once", async () => {
    const { session } = await openSession();
    const read = session.readManifest();
    const written = session.writeManifest(MANIFEST);

    session.dispose();

    await rejectsWith(read, MakeCodeManifestErrorCode.CLOSED);
    await rejectsWith(written, MakeCodeManifestErrorCode.CLOSED);
    await rejectsWith(session.readManifest(), MakeCodeManifestErrorCode.CLOSED);
  });
});

describe("makecode session manifest responder", () => {
  it("delivers a read request and answers it with the reply carrying its id", async () => {
    const { session, port } = await openSession();
    const served = servedRequests(session);

    port.deliver({ type: "makecode:manifestRead", id: "peer-1" });
    onlyRequest(served, "read").reply({ manifest: null, problem: MakeCodeManifestProblemCode.UNREADABLE });

    assert.deepEqual(port.sent.at(-1), {
      type: "makecode:manifestReadReply",
      id: "peer-1",
      payload: { manifest: null, problem: MakeCodeManifestProblemCode.UNREADABLE },
    });
    session.dispose();
  });

  it("delivers a write request's manifest and acknowledges it", async () => {
    const { session, port } = await openSession();
    const served = servedRequests(session);

    port.deliver({ type: "makecode:manifestWrite", id: "peer-1", payload: { manifest: MANIFEST } });
    const request = onlyRequest(served, "write");
    assert.deepEqual(request.manifest, MANIFEST);
    request.ack();

    assert.deepEqual(port.sent.at(-1), { type: "makecode:manifestAck", id: "peer-1" });
    session.dispose();
  });

  it("fails a read with READ_FAILED and a write with WRITE_FAILED, answering each request once", async () => {
    const { session, port } = await openSession();
    const served = servedRequests(session);

    port.deliver({ type: "makecode:manifestRead", id: "read-1" });
    port.deliver({ type: "makecode:manifestWrite", id: "write-1", payload: { manifest: MANIFEST } });
    for (const request of served) request.fail("refused");
    for (const request of served) request.fail("too late");

    assert.deepEqual(port.sent.slice(-2), [
      {
        type: "makecode:manifestError",
        id: "read-1",
        payload: { code: MakeCodeManifestErrorCode.READ_FAILED, message: "refused" },
      },
      {
        type: "makecode:manifestError",
        id: "write-1",
        payload: { code: MakeCodeManifestErrorCode.WRITE_FAILED, message: "refused" },
      },
    ]);
    session.dispose();
  });

  it("delivers manifest requests to manifest listeners only, replaying those received before the first attaches", async () => {
    const { session, port } = await openSession();
    const brains: string[] = [];
    session.onBrainsRequest((request) => {
      brains.push(request.kind);
    });
    port.deliver({ type: "makecode:manifestRead", id: "first" });
    port.deliver({ type: "makecode:brainsList", id: "a-brains-request" });
    port.deliver({ type: "makecode:manifestWrite", id: "second", payload: { manifest: MANIFEST } });

    const served = servedRequests(session);

    assert.deepEqual(
      served.map((request) => request.kind),
      ["read", "write"]
    );
    assert.deepEqual(brains, ["list"]);
    session.dispose();
  });

  it("sends no answer once disposed", async () => {
    const { session, port } = await openSession();
    const served = servedRequests(session);
    port.deliver({ type: "makecode:manifestRead", id: "peer-1" });
    const sentBefore = port.sent.length;

    session.dispose();
    onlyRequest(served, "read").reply({ manifest: MANIFEST });

    assert.equal(port.sent.length, sentBefore);
  });

  it("round-trips a write and a read between a requesting and a responding session, entries intact", async () => {
    const { requester, responder } = await openPair();
    let project: MakeCodeIdManifest | null = null;
    responder.onManifestRequest((request) => {
      if (request.kind === "read") {
        request.reply({ manifest: project });
        return;
      }
      project = request.manifest;
      request.ack();
    });

    const before = await requester.readManifest();
    await requester.writeManifest(MANIFEST);
    const after = await requester.readManifest();

    assert.deepEqual(before, { manifest: null });
    assert.deepEqual(after, { manifest: MANIFEST });
    requester.dispose();
    responder.dispose();
  });
});
