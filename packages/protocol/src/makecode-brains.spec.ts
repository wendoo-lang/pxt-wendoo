import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MakeCodeBrainsRequestMessage, MakeCodeWireBrain } from "./makecode-brains.js";
import { brainSourceHash, MakeCodeBrainsError, MakeCodeBrainsErrorCode } from "./makecode-brains.js";
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
