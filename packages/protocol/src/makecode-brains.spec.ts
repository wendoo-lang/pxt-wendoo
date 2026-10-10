import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  MakeCodeBrain,
  MakeCodeBrainSummary,
  MakeCodeBrainsRequest,
  MakeCodeBrainsRequestMessage,
  MakeCodeWireBrain,
} from "./makecode-brains.js";
import {
  brainSourceHash,
  MAKECODE_VM_PROFILE_ID,
  MakeCodeBrainsError,
  MakeCodeBrainsErrorCode,
  MakeCodeDeviceProfileNumericId,
} from "./makecode-brains.js";
import type { MakeCodeSession, MakeCodeSessionMessage, MakeCodeSessionPort } from "./makecode-session.js";
import { connectMakeCodeSession } from "./makecode-session.js";

/** A source text exercising characters a JSON wire must carry intact. */
const SOURCE = '{"version":1,"id":"abcdabcdabcdabcd","name":"say \\"hi\\" café 😀"}';

/** Bytes covering every byte value, so any lossy encoding shows. */
const BYTECODE = Uint8Array.from({ length: 256 }, (_, index) => index);

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

/** The last brains request `port` sent. Fails the spec when the last message is not one. */
function lastRequest(port: WirePort): MakeCodeBrainsRequestMessage {
  const message = port.sent.at(-1);
  assert.ok(message?.type.startsWith("makecode:brains"), "expected a brains request");
  return message as MakeCodeBrainsRequestMessage;
}

/** Asserts that `promise` rejects with a {@link MakeCodeBrainsError} carrying `code`. */
async function rejectsWith(promise: Promise<unknown>, code: MakeCodeBrainsErrorCode): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof MakeCodeBrainsError);
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

describe("device profiles", () => {
  it("maps the one world, sts-f64, to device-profile id 2001, in a frozen map", () => {
    assert.deepEqual({ ...MakeCodeDeviceProfileNumericId }, { "sts-f64": 2001 });
    assert.equal(Object.isFrozen(MakeCodeDeviceProfileNumericId), true);
  });

  it("stamps compiled brains with the sts-f64 world's id", () => {
    assert.equal(MAKECODE_VM_PROFILE_ID, 2001);
  });
});

describe("brain source hash", () => {
  it("hashes a source to eight lowercase hex digits, the same for the same text", () => {
    const hash = brainSourceHash('{"name":"Chaser"}');

    assert.match(hash, /^[0-9a-f]{8}$/);
    assert.equal(brainSourceHash('{"name":"Chaser"}'), hash);
  });

  it("hashes texts differing in one character differently", () => {
    assert.notEqual(brainSourceHash('{"name":"Chaser"}'), brainSourceHash('{"name":"Chasex"}'));
  });

  it("hashes by the FNV-1a 32-bit function over UTF-16 code units", () => {
    assert.equal(brainSourceHash(""), "811c9dc5");
    assert.equal(brainSourceHash("a"), "e40c292c");
  });
});

describe("makecode session brains requests", () => {
  it("lists the project's brains: sends a list request and resolves with the reply carrying its id", async () => {
    const { session, port } = await openSession();

    const listed = session.listBrains();
    const request = lastRequest(port);
    assert.equal(request.type, "makecode:brainsList");
    port.deliver({
      type: "makecode:brainsListReply",
      id: request.id,
      payload: { brains: [{ id: "abcdabcdabcdabcd", name: "Chaser", sourceHash: brainSourceHash(SOURCE) }] },
    });

    assert.deepEqual(await listed, [{ id: "abcdabcdabcdabcd", name: "Chaser", sourceHash: brainSourceHash(SOURCE) }]);
    session.dispose();
  });

  it("pulls brains by id, decoding each compiled program from base64 intact", async () => {
    const { session, port } = await openSession();
    const wire: MakeCodeWireBrain = {
      id: "abcdabcdabcdabcd",
      name: "Chaser",
      source: SOURCE,
      compiled: { bytecode: Buffer.from(BYTECODE).toString("base64"), sourceHash: brainSourceHash(SOURCE) },
    };

    const pulled = session.pullBrains(["abcdabcdabcdabcd", "missingmissingmi"]);
    const request = lastRequest(port);
    assert.deepEqual(request, {
      type: "makecode:brainsPull",
      id: request.id,
      payload: { ids: ["abcdabcdabcdabcd", "missingmissingmi"] },
    });
    port.deliver({
      type: "makecode:brainsPullReply",
      id: request.id,
      payload: { brains: [wire, { ...wire, id: "b" }] },
    });

    const brains = await pulled;
    assert.equal(brains.length, 2);
    assert.equal(brains[0].source, SOURCE);
    assert.deepEqual(brains[0].compiled?.bytecode, BYTECODE);
    assert.equal(brains[0].compiled?.sourceHash, brainSourceHash(SOURCE));
    session.dispose();
  });

  it("pulls a brain with no compiled form as one without it", async () => {
    const { session, port } = await openSession();

    const pulled = session.pullBrains(["abcdabcdabcdabcd"]);
    port.deliver({
      type: "makecode:brainsPullReply",
      id: lastRequest(port).id,
      payload: { brains: [{ id: "abcdabcdabcdabcd", name: "", source: "not json {" }] },
    });

    assert.deepEqual(await pulled, [{ id: "abcdabcdabcdabcd", name: "", source: "not json {" }]);
    session.dispose();
  });

  it("pushes a write carrying the compiled program as base64, resolving on the acknowledgement", async () => {
    const { session, port } = await openSession();

    const pushed = session.pushBrain({
      op: "write",
      brain: {
        id: "abcdabcdabcdabcd",
        name: "Chaser",
        source: SOURCE,
        compiled: { bytecode: BYTECODE, sourceHash: brainSourceHash(SOURCE) },
      },
    });
    const request = lastRequest(port);
    assert.deepEqual(request, {
      type: "makecode:brainsPush",
      id: request.id,
      payload: {
        op: "write",
        brain: {
          id: "abcdabcdabcdabcd",
          name: "Chaser",
          source: SOURCE,
          compiled: { bytecode: Buffer.from(BYTECODE).toString("base64"), sourceHash: brainSourceHash(SOURCE) },
        },
      },
    });
    port.deliver({ type: "makecode:brainsAck", id: request.id });

    await pushed;
    session.dispose();
  });

  it("pushes a removal by brain id", async () => {
    const { session, port } = await openSession();

    const pushed = session.pushBrain({ op: "remove", brainId: "abcdabcdabcdabcd" });
    const request = lastRequest(port);
    assert.deepEqual(request.type === "makecode:brainsPush" && request.payload, {
      op: "remove",
      brainId: "abcdabcdabcdabcd",
    });
    port.deliver({ type: "makecode:brainsAck", id: request.id });

    await pushed;
    session.dispose();
  });

  it("rejects a request answered by an error reply with the reply's code", async () => {
    const { session, port } = await openSession();

    const listed = session.listBrains();
    port.deliver({
      type: "makecode:brainsError",
      id: lastRequest(port).id,
      payload: { code: MakeCodeBrainsErrorCode.READ_FAILED, message: "unreadable" },
    });
    const pushed = session.pushBrain({ op: "remove", brainId: "abcdabcdabcdabcd" });
    port.deliver({
      type: "makecode:brainsError",
      id: lastRequest(port).id,
      payload: { code: MakeCodeBrainsErrorCode.WRITE_FAILED, message: "unwritable" },
    });

    await rejectsWith(listed, MakeCodeBrainsErrorCode.READ_FAILED);
    await rejectsWith(pushed, MakeCodeBrainsErrorCode.WRITE_FAILED);
    session.dispose();
  });

  it("settles two requests in flight each by its own reply, whatever order the replies arrive in", async () => {
    const { session, port } = await openSession();

    const first = session.pushBrain({ op: "remove", brainId: "first-first-firs" });
    const firstId = lastRequest(port).id;
    const second = session.listBrains();
    const secondId = lastRequest(port).id;
    assert.notEqual(firstId, secondId);
    port.deliver({ type: "makecode:brainsListReply", id: secondId, payload: { brains: [] } });
    port.deliver({ type: "makecode:brainsAck", id: firstId });

    assert.deepEqual(await second, []);
    await first;
    session.dispose();
  });

  it("rejects every request in flight with CLOSED when disposed, and every later request at once", async () => {
    const { session } = await openSession();
    const listed = session.listBrains();
    const pushed = session.pushBrain({ op: "remove", brainId: "abcdabcdabcdabcd" });

    session.dispose();

    await rejectsWith(listed, MakeCodeBrainsErrorCode.CLOSED);
    await rejectsWith(pushed, MakeCodeBrainsErrorCode.CLOSED);
    await rejectsWith(session.pullBrains(["abcdabcdabcdabcd"]), MakeCodeBrainsErrorCode.CLOSED);
  });

  it("never takes a reply to an earlier session's request on the same port as a reply to its own", async () => {
    const port = wirePort();
    const earlier = await connectMakeCodeSession({ port });
    const stale = earlier.listBrains();
    const staleId = lastRequest(port).id;
    earlier.dispose();
    await rejectsWith(stale, MakeCodeBrainsErrorCode.CLOSED);
    const later = await connectMakeCodeSession({ port });

    const listed = later.listBrains();
    const laterId = lastRequest(port).id;
    assert.notEqual(laterId, staleId);
    port.deliver({
      type: "makecode:brainsListReply",
      id: staleId,
      payload: { brains: [{ id: "stale-stale-stal", name: "", sourceHash: "00000000" }] },
    });
    port.deliver({ type: "makecode:brainsListReply", id: laterId, payload: { brains: [] } });

    assert.deepEqual(await listed, []);
    later.dispose();
  });

  it("delivers only catalogs to catalog listeners, ignoring brains traffic and message types it does not know", async () => {
    const { session, port } = await openSession();
    const catalogs: string[] = [];
    session.onCatalog((content) => {
      catalogs.push(content);
    });

    port.deliver({ type: "makecode:catalog", payload: { content: "first" } });
    port.deliver({ type: "makecode:brainsAck", id: "no-such-request" });
    port.deliver({ type: "makecode:brainsList", id: "a-request-from-the-peer" });
    port.deliver({ type: "makecode:somethingNewer", payload: { content: "not a catalog" } });
    port.deliver({ type: "makecode:catalog", payload: { content: "second" } });

    assert.deepEqual(catalogs, ["first", "second"]);
    session.dispose();
  });
});

/** The requests a session delivered to its brains request listener, in arrival order. */
function servedRequests(session: MakeCodeSession): MakeCodeBrainsRequest[] {
  const served: MakeCodeBrainsRequest[] = [];
  session.onBrainsRequest((request) => {
    served.push(request);
  });
  return served;
}

/** The only request in `served`, narrowed to `kind`. Fails the spec otherwise. */
function onlyRequest<TKind extends MakeCodeBrainsRequest["kind"]>(
  served: MakeCodeBrainsRequest[],
  kind: TKind
): Extract<MakeCodeBrainsRequest, { kind: TKind }> {
  assert.equal(served.length, 1);
  assert.equal(served[0].kind, kind);
  return served[0] as Extract<MakeCodeBrainsRequest, { kind: TKind }>;
}

/**
 * Two sessions joined by a JSON wire, standing in for the port that joins an
 * editor and the party serving the project: every message one posts reaches
 * the other.
 */
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

describe("makecode session brains responder", () => {
  it("delivers a list request and answers it with the reply carrying its id", async () => {
    const { session, port } = await openSession();
    const served = servedRequests(session);

    port.deliver({ type: "makecode:brainsList", id: "peer-1" });
    onlyRequest(served, "list").reply([
      { id: "abcdabcdabcdabcd", name: "Chaser", sourceHash: brainSourceHash(SOURCE) },
    ]);

    assert.deepEqual(port.sent.at(-1), {
      type: "makecode:brainsListReply",
      id: "peer-1",
      payload: { brains: [{ id: "abcdabcdabcdabcd", name: "Chaser", sourceHash: brainSourceHash(SOURCE) }] },
    });
    session.dispose();
  });

  it("delivers a pull request's ids and answers with each compiled program encoded as base64", async () => {
    const { session, port } = await openSession();
    const served = servedRequests(session);

    port.deliver({
      type: "makecode:brainsPull",
      id: "peer-1",
      payload: { ids: ["abcdabcdabcdabcd", "missingmissingmi"] },
    });
    const request = onlyRequest(served, "pull");
    assert.deepEqual(request.ids, ["abcdabcdabcdabcd", "missingmissingmi"]);
    request.reply([
      {
        id: "abcdabcdabcdabcd",
        name: "Chaser",
        source: SOURCE,
        compiled: { bytecode: BYTECODE, sourceHash: brainSourceHash(SOURCE) },
      },
      { id: "nocompilednocomp", name: "", source: "not json {" },
    ]);

    assert.deepEqual(port.sent.at(-1), {
      type: "makecode:brainsPullReply",
      id: "peer-1",
      payload: {
        brains: [
          {
            id: "abcdabcdabcdabcd",
            name: "Chaser",
            source: SOURCE,
            compiled: { bytecode: Buffer.from(BYTECODE).toString("base64"), sourceHash: brainSourceHash(SOURCE) },
          },
          { id: "nocompilednocomp", name: "", source: "not json {" },
        ],
      },
    });
    session.dispose();
  });

  it("delivers a pushed write with its compiled program decoded to bytes, and acknowledges it", async () => {
    const { session, port } = await openSession();
    const served = servedRequests(session);

    port.deliver({
      type: "makecode:brainsPush",
      id: "peer-1",
      payload: {
        op: "write",
        brain: {
          id: "abcdabcdabcdabcd",
          name: "Chaser",
          source: SOURCE,
          compiled: { bytecode: Buffer.from(BYTECODE).toString("base64"), sourceHash: brainSourceHash(SOURCE) },
        },
      },
    });
    const request = onlyRequest(served, "push");
    assert.deepEqual(request.push, {
      op: "write",
      brain: {
        id: "abcdabcdabcdabcd",
        name: "Chaser",
        source: SOURCE,
        compiled: { bytecode: BYTECODE, sourceHash: brainSourceHash(SOURCE) },
      },
    });
    request.ack();

    assert.deepEqual(port.sent.at(-1), { type: "makecode:brainsAck", id: "peer-1" });
    session.dispose();
  });

  it("delivers a pushed removal by brain id", async () => {
    const { session, port } = await openSession();
    const served = servedRequests(session);

    port.deliver({ type: "makecode:brainsPush", id: "peer-1", payload: { op: "remove", brainId: "abcdabcdabcdabcd" } });

    assert.deepEqual(onlyRequest(served, "push").push, { op: "remove", brainId: "abcdabcdabcdabcd" });
    session.dispose();
  });

  it("fails a list or a pull with READ_FAILED and a push with WRITE_FAILED", async () => {
    const { session, port } = await openSession();
    const served = servedRequests(session);

    port.deliver({ type: "makecode:brainsList", id: "list-1" });
    port.deliver({ type: "makecode:brainsPull", id: "pull-1", payload: { ids: [] } });
    port.deliver({ type: "makecode:brainsPush", id: "push-1", payload: { op: "remove", brainId: "abcdabcdabcdabcd" } });
    for (const request of served) request.fail("refused");

    assert.deepEqual(port.sent.slice(-3), [
      {
        type: "makecode:brainsError",
        id: "list-1",
        payload: { code: MakeCodeBrainsErrorCode.READ_FAILED, message: "refused" },
      },
      {
        type: "makecode:brainsError",
        id: "pull-1",
        payload: { code: MakeCodeBrainsErrorCode.READ_FAILED, message: "refused" },
      },
      {
        type: "makecode:brainsError",
        id: "push-1",
        payload: { code: MakeCodeBrainsErrorCode.WRITE_FAILED, message: "refused" },
      },
    ]);
    session.dispose();
  });

  it("answers each request once, sending nothing for a later answer", async () => {
    const { session, port } = await openSession();
    const served = servedRequests(session);
    port.deliver({ type: "makecode:brainsPush", id: "peer-1", payload: { op: "remove", brainId: "abcdabcdabcdabcd" } });
    const request = onlyRequest(served, "push");
    const sentBefore = port.sent.length;

    request.ack();
    request.fail("too late");
    request.ack();

    assert.deepEqual(port.sent.slice(sentBefore), [{ type: "makecode:brainsAck", id: "peer-1" }]);
    session.dispose();
  });

  it("replays requests received while no listener was attached to the first listener, in arrival order", async () => {
    const { session, port } = await openSession();
    port.deliver({ type: "makecode:brainsList", id: "first" });
    port.deliver({ type: "makecode:brainsPush", id: "second", payload: { op: "remove", brainId: "abcdabcdabcdabcd" } });

    const served = servedRequests(session);

    assert.deepEqual(
      served.map((request) => request.kind),
      ["list", "push"]
    );
    session.dispose();
  });

  it("sends no answer once disposed", async () => {
    const { session, port } = await openSession();
    const served = servedRequests(session);
    port.deliver({ type: "makecode:brainsList", id: "peer-1" });
    const sentBefore = port.sent.length;

    session.dispose();
    onlyRequest(served, "list").reply([]);

    assert.equal(port.sent.length, sentBefore);
  });

  it("round-trips list, pull and push between a requesting and a responding session, bytes intact", async () => {
    const { requester, responder } = await openPair();
    const project = new Map<string, MakeCodeBrain>();
    responder.onBrainsRequest((request) => {
      switch (request.kind) {
        case "list":
          request.reply(
            [...project.values()].map((brain) => ({
              id: brain.id,
              name: brain.name,
              sourceHash: brainSourceHash(brain.source),
            }))
          );
          return;
        case "pull":
          request.reply(request.ids.flatMap((id) => project.get(id) ?? []));
          return;
        case "push":
          if (request.push.op === "write") project.set(request.push.brain.id, request.push.brain);
          else project.delete(request.push.brainId);
          request.ack();
          return;
      }
    });
    const brain: MakeCodeBrain = {
      id: "abcdabcdabcdabcd",
      name: "Chaser",
      source: SOURCE,
      compiled: { bytecode: BYTECODE, sourceHash: brainSourceHash(SOURCE) },
    };

    await requester.pushBrain({ op: "write", brain });
    const listed = await requester.listBrains();
    const pulled = await requester.pullBrains([brain.id, "missingmissingmi"]);
    await requester.pushBrain({ op: "remove", brainId: brain.id });

    assert.deepEqual(listed, [{ id: brain.id, name: "Chaser", sourceHash: brainSourceHash(SOURCE) }]);
    assert.deepEqual(pulled, [brain]);
    assert.equal(project.size, 0);
    assert.equal(responder.peerTarget, undefined);
    assert.equal(requester.peerTarget, "arcade");
    requester.dispose();
    responder.dispose();
  });

  it("carries each summary's compiled source hash as sent: a hash, null, or absent", async () => {
    const { requester, responder } = await openPair();
    const summaries: MakeCodeBrainSummary[] = [
      { id: "current-current-", name: "Current", sourceHash: "1a2b3c4d", compiledSourceHash: "1a2b3c4d" },
      { id: "stale-stale-stal", name: "Stale", sourceHash: "1a2b3c4d", compiledSourceHash: "00000000" },
      { id: "missing-missing-", name: "Missing", sourceHash: "1a2b3c4d", compiledSourceHash: null },
      { id: "unknown-unknown-", name: "Unknown", sourceHash: "1a2b3c4d" },
    ];
    responder.onBrainsRequest((request) => {
      if (request.kind === "list") request.reply(summaries);
    });

    const listed = await requester.listBrains();

    assert.deepEqual(listed, summaries);
    assert.equal(listed[2].compiledSourceHash, null);
    assert.equal("compiledSourceHash" in listed[3], false);
    requester.dispose();
    responder.dispose();
  });
});
