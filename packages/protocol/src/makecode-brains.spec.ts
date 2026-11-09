import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  MakeCodeBrainSummary,
  MakeCodeBrainsRequest,
  MakeCodeBrainsRequestMessage,
  MakeCodeWireBrain,
  MakeCodeWireCompileOutcome,
} from "./makecode-brains.js";
import {
  brainSourceHash,
  MAKECODE_VM_PROFILE_ID,
  MakeCodeBrainsError,
  MakeCodeBrainsErrorCode,
  MakeCodeDeviceProfileNumericId,
} from "./makecode-brains.js";
import type { MakeCodeSession, MakeCodeSessionMessage, MakeCodeSessionPort } from "./makecode-session.js";
import { connectMakeCodeSession, MAKECODE_SESSION_PROTOCOL_VERSION } from "./makecode-session.js";

/** A source text exercising characters a JSON wire must carry intact. */
const SOURCE = '{"version":1,"id":"abcdabcdabcdabcd","name":"say \\"hi\\" café 😀"}';

/** The registration key of a front door whose tab creates brains. */
const ORIGIN = "wendoo-lang/pxt-wendoo/makecode/extensions/arcade";

/** The name MakeCode lists the {@link ORIGIN} tab by. */
const ORIGIN_LABEL = "Wendoo";

/** A summary of the brain holding {@link SOURCE}, its registration compiled from that source, created by the {@link ORIGIN} tab. */
const SUMMARY: MakeCodeBrainSummary = {
  id: "abcdabcdabcdabcd",
  name: "Chaser",
  sourceHash: brainSourceHash(SOURCE),
  compiledSourceHash: brainSourceHash(SOURCE),
  origin: ORIGIN,
  originLabel: ORIGIN_LABEL,
};

/** A summary of a brain with no origin whose registration was compiled from its source; specs spread it and override fields. */
const BARE: MakeCodeBrainSummary = {
  id: "bare-bare-bare-b",
  name: "",
  sourceHash: "1a2b3c4d",
  compiledSourceHash: "1a2b3c4d",
  origin: null,
  originLabel: null,
};

/** A compile outcome carrying a diagnostic with every kind of param, an unresolved tile and a registration. */
const OUTCOME: MakeCodeWireCompileOutcome = {
  sourceHash: brainSourceHash(SOURCE),
  compiled: { sourceHash: "00000000" },
  diagnostics: [
    {
      code: 2001,
      severity: "error",
      message: "the text says caf\u00e9",
      params: { tileId: "tile.a", conversionCost: 2, expectedTypeIds: ["number", "string"] },
    },
    { code: 3002, severity: "warning", message: "unused" },
  ],
  unresolvedTiles: ["actuator.chime.ring"],
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
    port.deliver({ type: "makecode:brainsListReply", id: request.id, payload: { brains: [SUMMARY] } });

    assert.deepEqual(await listed, [SUMMARY]);
    session.dispose();
  });

  it("pulls brains by id, each source intact with its compiled source hash and origin", async () => {
    const { session, port } = await openSession();
    const wire: MakeCodeWireBrain = {
      id: "abcdabcdabcdabcd",
      name: "Chaser",
      source: SOURCE,
      compiledSourceHash: brainSourceHash(SOURCE),
      origin: ORIGIN,
      originLabel: ORIGIN_LABEL,
    };
    const legacy: MakeCodeWireBrain = {
      id: "b",
      name: "",
      source: "not json {",
      compiledSourceHash: null,
      origin: null,
      originLabel: null,
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
      payload: { brains: [wire, legacy] },
    });

    assert.deepEqual(await pulled, [wire, legacy]);
    session.dispose();
  });

  it("pushes a write carrying the source alone, resolving with the reply's compile outcome", async () => {
    const { session, port } = await openSession();

    const pushed = session.pushBrain({
      op: "write",
      brain: { id: "abcdabcdabcdabcd", name: "Chaser", source: SOURCE },
    });
    const request = lastRequest(port);
    assert.deepEqual(request, {
      type: "makecode:brainsPush",
      id: request.id,
      payload: { op: "write", brain: { id: "abcdabcdabcdabcd", name: "Chaser", source: SOURCE } },
    });
    port.deliver({ type: "makecode:brainsPushReply", id: request.id, payload: OUTCOME });

    assert.deepEqual(await pushed, OUTCOME);
    session.dispose();
  });

  it("pushes a removal by brain id, resolving with the reply's null", async () => {
    const { session, port } = await openSession();

    const pushed = session.pushBrain({ op: "remove", brainId: "abcdabcdabcdabcd" });
    const request = lastRequest(port);
    assert.deepEqual(request.type === "makecode:brainsPush" && request.payload, {
      op: "remove",
      brainId: "abcdabcdabcdabcd",
    });
    port.deliver({ type: "makecode:brainsPushReply", id: request.id, payload: null });

    assert.equal(await pushed, null);
    session.dispose();
  });

  it("creates a brain by name, resolving with the reply's summary", async () => {
    const { session, port } = await openSession();

    const created = session.createBrain("Chaser");
    const request = lastRequest(port);
    assert.deepEqual(request, { type: "makecode:brainsCreate", id: request.id, payload: { name: "Chaser" } });
    port.deliver({ type: "makecode:brainsCreateReply", id: request.id, payload: { brain: SUMMARY } });

    assert.deepEqual(await created, SUMMARY);
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
    const created = session.createBrain("Chaser");
    port.deliver({
      type: "makecode:brainsError",
      id: lastRequest(port).id,
      payload: { code: MakeCodeBrainsErrorCode.WRITE_FAILED, message: "unwritable" },
    });

    await rejectsWith(listed, MakeCodeBrainsErrorCode.READ_FAILED);
    await rejectsWith(pushed, MakeCodeBrainsErrorCode.WRITE_FAILED);
    await rejectsWith(created, MakeCodeBrainsErrorCode.WRITE_FAILED);
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
    port.deliver({ type: "makecode:brainsPushReply", id: firstId, payload: null });

    assert.deepEqual(await second, []);
    assert.equal(await first, null);
    session.dispose();
  });

  it("rejects every request in flight with CLOSED when disposed, and every later request at once", async () => {
    const { session } = await openSession();
    const listed = session.listBrains();
    const pushed = session.pushBrain({ op: "remove", brainId: "abcdabcdabcdabcd" });
    const created = session.createBrain("Chaser");

    session.dispose();

    await rejectsWith(listed, MakeCodeBrainsErrorCode.CLOSED);
    await rejectsWith(pushed, MakeCodeBrainsErrorCode.CLOSED);
    await rejectsWith(created, MakeCodeBrainsErrorCode.CLOSED);
    await rejectsWith(session.pullBrains(["abcdabcdabcdabcd"]), MakeCodeBrainsErrorCode.CLOSED);
    await rejectsWith(session.createBrain("Runner"), MakeCodeBrainsErrorCode.CLOSED);
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
      payload: {
        brains: [
          {
            id: "stale-stale-stal",
            name: "",
            sourceHash: "00000000",
            compiledSourceHash: null,
            origin: null,
            originLabel: null,
          },
        ],
      },
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
    port.deliver({ type: "makecode:brainsPushReply", id: "no-such-request", payload: null });
    port.deliver({ type: "makecode:brainsList", id: "a-request-from-the-peer" });
    port.deliver({ type: "makecode:brains", payload: { brains: [SUMMARY] } });
    port.deliver({ type: "makecode:somethingNewer", payload: { content: "not a catalog" } });
    port.deliver({ type: "makecode:catalog", payload: { content: "second" } });

    assert.deepEqual(catalogs, ["first", "second"]);
    session.dispose();
  });
});

describe("makecode session brains publication", () => {
  it("publishes the project's brains whole, and delivers each publication to every listener", async () => {
    const { session, port } = await openSession();
    const first: MakeCodeBrainSummary[][] = [];
    const second: MakeCodeBrainSummary[][] = [];
    session.onBrains((brains) => {
      first.push(brains);
    });
    session.onBrains((brains) => {
      second.push(brains);
    });

    session.publishBrains([SUMMARY]);
    port.deliver({ type: "makecode:brains", payload: { brains: [SUMMARY] } });
    port.deliver({ type: "makecode:brains", payload: { brains: [] } });

    assert.deepEqual(port.sent.at(-1), { type: "makecode:brains", payload: { brains: [SUMMARY] } });
    assert.deepEqual(first, [[SUMMARY], []]);
    assert.deepEqual(second, [[SUMMARY], []]);
    session.dispose();
  });

  it("replays the publications received while no listener was attached to the first listener, in arrival order", async () => {
    const { session, port } = await openSession();
    port.deliver({ type: "makecode:brains", payload: { brains: [SUMMARY] } });
    port.deliver({ type: "makecode:brains", payload: { brains: [] } });

    const delivered: MakeCodeBrainSummary[][] = [];
    session.onBrains((brains) => {
      delivered.push(brains);
    });
    const later: MakeCodeBrainSummary[][] = [];
    session.onBrains((brains) => {
      later.push(brains);
    });

    assert.deepEqual(delivered, [[SUMMARY], []]);
    assert.deepEqual(later, []);
    session.dispose();
  });

  it("stops delivering to a listener once it unsubscribes", async () => {
    const { session, port } = await openSession();
    const delivered: MakeCodeBrainSummary[][] = [];
    const unsubscribe = session.onBrains((brains) => {
      delivered.push(brains);
    });
    session.onBrains(() => {});

    port.deliver({ type: "makecode:brains", payload: { brains: [SUMMARY] } });
    unsubscribe();
    port.deliver({ type: "makecode:brains", payload: { brains: [] } });

    assert.deepEqual(delivered, [[SUMMARY]]);
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
    onlyRequest(served, "list").reply([SUMMARY]);

    assert.deepEqual(port.sent.at(-1), {
      type: "makecode:brainsListReply",
      id: "peer-1",
      payload: { brains: [SUMMARY] },
    });
    session.dispose();
  });

  it("delivers a pull request's ids and answers with each brain's source and compiled source hash", async () => {
    const { session, port } = await openSession();
    const served = servedRequests(session);

    port.deliver({
      type: "makecode:brainsPull",
      id: "peer-1",
      payload: { ids: ["abcdabcdabcdabcd", "missingmissingmi"] },
    });
    const request = onlyRequest(served, "pull");
    assert.deepEqual(request.ids, ["abcdabcdabcdabcd", "missingmissingmi"]);
    const brains: MakeCodeWireBrain[] = [
      {
        id: "abcdabcdabcdabcd",
        name: "Chaser",
        source: SOURCE,
        compiledSourceHash: brainSourceHash(SOURCE),
        origin: ORIGIN,
        originLabel: ORIGIN_LABEL,
      },
      {
        id: "nocompilednocomp",
        name: "",
        source: "not json {",
        compiledSourceHash: null,
        origin: null,
        originLabel: null,
      },
    ];
    request.reply(brains);

    assert.deepEqual(port.sent.at(-1), { type: "makecode:brainsPullReply", id: "peer-1", payload: { brains } });
    session.dispose();
  });

  it("delivers a pushed write carrying its source, and answers with its compile outcome", async () => {
    const { session, port } = await openSession();
    const served = servedRequests(session);

    port.deliver({
      type: "makecode:brainsPush",
      id: "peer-1",
      payload: { op: "write", brain: { id: "abcdabcdabcdabcd", name: "Chaser", source: SOURCE } },
    });
    const request = onlyRequest(served, "push");
    assert.deepEqual(request.push, {
      op: "write",
      brain: { id: "abcdabcdabcdabcd", name: "Chaser", source: SOURCE },
    });
    request.reply(OUTCOME);

    assert.deepEqual(port.sent.at(-1), { type: "makecode:brainsPushReply", id: "peer-1", payload: OUTCOME });
    session.dispose();
  });

  it("delivers a pushed removal by brain id, and answers it with null", async () => {
    const { session, port } = await openSession();
    const served = servedRequests(session);

    port.deliver({ type: "makecode:brainsPush", id: "peer-1", payload: { op: "remove", brainId: "abcdabcdabcdabcd" } });
    const request = onlyRequest(served, "push");
    assert.deepEqual(request.push, { op: "remove", brainId: "abcdabcdabcdabcd" });
    request.reply(null);

    assert.deepEqual(port.sent.at(-1), { type: "makecode:brainsPushReply", id: "peer-1", payload: null });
    session.dispose();
  });

  it("delivers a create request's name, and answers with the created brain's summary", async () => {
    const { session, port } = await openSession();
    const served = servedRequests(session);

    port.deliver({ type: "makecode:brainsCreate", id: "peer-1", payload: { name: "Chaser" } });
    const request = onlyRequest(served, "create");
    assert.equal(request.name, "Chaser");
    request.reply(SUMMARY);

    assert.deepEqual(port.sent.at(-1), {
      type: "makecode:brainsCreateReply",
      id: "peer-1",
      payload: { brain: SUMMARY },
    });
    session.dispose();
  });

  it("fails a list or a pull with READ_FAILED and a push or a create with WRITE_FAILED", async () => {
    const { session, port } = await openSession();
    const served = servedRequests(session);

    port.deliver({ type: "makecode:brainsList", id: "list-1" });
    port.deliver({ type: "makecode:brainsPull", id: "pull-1", payload: { ids: [] } });
    port.deliver({ type: "makecode:brainsPush", id: "push-1", payload: { op: "remove", brainId: "abcdabcdabcdabcd" } });
    port.deliver({ type: "makecode:brainsCreate", id: "create-1", payload: { name: "" } });
    for (const request of served) request.fail("refused");

    assert.deepEqual(
      port.sent
        .slice(-4)
        .map((message) => message.type === "makecode:brainsError" && [message.id, message.payload.code]),
      [
        ["list-1", MakeCodeBrainsErrorCode.READ_FAILED],
        ["pull-1", MakeCodeBrainsErrorCode.READ_FAILED],
        ["push-1", MakeCodeBrainsErrorCode.WRITE_FAILED],
        ["create-1", MakeCodeBrainsErrorCode.WRITE_FAILED],
      ]
    );
    session.dispose();
  });

  it("refuses a push with NOT_ORIGIN, carrying the request's id", async () => {
    const { session, port } = await openSession();
    const served = servedRequests(session);

    port.deliver({
      type: "makecode:brainsPush",
      id: "write-1",
      payload: { op: "remove", brainId: "abcdabcdabcdabcd" },
    });
    const request = onlyRequest(served, "push");
    request.refuse("not the origin");
    request.reply(null);

    const reply = port.sent.at(-1);
    assert.equal(reply?.type, "makecode:brainsError");
    assert.ok(reply?.type === "makecode:brainsError");
    assert.equal(reply.id, "write-1");
    assert.equal(reply.payload.code, MakeCodeBrainsErrorCode.NOT_ORIGIN);
    session.dispose();
  });

  it("rejects a push answered by a NOT_ORIGIN error reply with NOT_ORIGIN", async () => {
    const { session, port } = await openSession();

    const pushed = session.pushBrain({ op: "remove", brainId: "abcdabcdabcdabcd" });
    port.deliver({
      type: "makecode:brainsError",
      id: lastRequest(port).id,
      payload: { code: MakeCodeBrainsErrorCode.NOT_ORIGIN, message: "not the origin" },
    });

    await rejectsWith(pushed, MakeCodeBrainsErrorCode.NOT_ORIGIN);
    session.dispose();
  });

  it("answers each request once, sending nothing for a later answer", async () => {
    const { session, port } = await openSession();
    const served = servedRequests(session);
    port.deliver({ type: "makecode:brainsPush", id: "peer-1", payload: { op: "remove", brainId: "abcdabcdabcdabcd" } });
    const request = onlyRequest(served, "push");
    const sentBefore = port.sent.length;

    request.reply(null);
    request.fail("too late");
    request.reply(null);

    assert.deepEqual(port.sent.slice(sentBefore), [{ type: "makecode:brainsPushReply", id: "peer-1", payload: null }]);
    session.dispose();
  });

  it("replays requests received while no listener was attached to the first listener, in arrival order", async () => {
    const { session, port } = await openSession();
    port.deliver({ type: "makecode:brainsList", id: "first" });
    port.deliver({ type: "makecode:brainsPush", id: "second", payload: { op: "remove", brainId: "abcdabcdabcdabcd" } });
    port.deliver({ type: "makecode:brainsCreate", id: "third", payload: { name: "Chaser" } });

    const served = servedRequests(session);

    assert.deepEqual(
      served.map((request) => request.kind),
      ["list", "push", "create"]
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

  it("round-trips create, push, list, pull and the brains publication between a requesting and a responding session", async () => {
    const { requester, responder } = await openPair();
    const project = new Map<string, MakeCodeWireBrain>();
    const summaries = (): MakeCodeBrainSummary[] =>
      [...project.values()].map((brain) => ({
        id: brain.id,
        name: brain.name,
        sourceHash: brainSourceHash(brain.source),
        compiledSourceHash: brain.compiledSourceHash,
        origin: brain.origin,
        originLabel: brain.originLabel,
      }));
    const published: MakeCodeBrainSummary[][] = [];
    requester.onBrains((brains) => {
      published.push(brains);
    });
    responder.onBrainsRequest((request) => {
      switch (request.kind) {
        case "list":
          request.reply(summaries());
          return;
        case "pull":
          request.reply(request.ids.flatMap((id) => project.get(id) ?? []));
          return;
        case "push":
          if (request.push.op === "write") {
            const { brain } = request.push;
            const sourceHash = brainSourceHash(brain.source);
            project.set(brain.id, {
              ...brain,
              compiledSourceHash: sourceHash,
              origin: ORIGIN,
              originLabel: ORIGIN_LABEL,
            });
            request.reply({ sourceHash, compiled: { sourceHash }, diagnostics: [], unresolvedTiles: [] });
          } else {
            project.delete(request.push.brainId);
            request.reply(null);
          }
          responder.publishBrains(summaries());
          return;
        case "create": {
          const source = JSON.stringify({ id: "createdcreatedcr", name: request.name });
          project.set("createdcreatedcr", {
            id: "createdcreatedcr",
            name: request.name,
            source,
            compiledSourceHash: null,
            origin: ORIGIN,
            originLabel: ORIGIN_LABEL,
          });
          request.reply({
            id: "createdcreatedcr",
            name: request.name,
            sourceHash: brainSourceHash(source),
            compiledSourceHash: null,
            origin: ORIGIN,
            originLabel: ORIGIN_LABEL,
          });
          responder.publishBrains(summaries());
          return;
        }
      }
    });

    const created = await requester.createBrain("Runner");
    const outcome = await requester.pushBrain({
      op: "write",
      brain: { id: "abcdabcdabcdabcd", name: "Chaser", source: SOURCE },
    });
    const listed = await requester.listBrains();
    const pulled = await requester.pullBrains(["abcdabcdabcdabcd", "missingmissingmi"]);
    const removed = await requester.pushBrain({ op: "remove", brainId: "abcdabcdabcdabcd" });

    assert.equal(created.id, "createdcreatedcr");
    assert.equal(created.origin, ORIGIN);
    assert.deepEqual(outcome, {
      sourceHash: brainSourceHash(SOURCE),
      compiled: { sourceHash: brainSourceHash(SOURCE) },
      diagnostics: [],
      unresolvedTiles: [],
    });
    assert.deepEqual(
      listed.map((brain) => brain.id),
      ["createdcreatedcr", "abcdabcdabcdabcd"]
    );
    assert.deepEqual(pulled, [
      {
        id: "abcdabcdabcdabcd",
        name: "Chaser",
        source: SOURCE,
        compiledSourceHash: brainSourceHash(SOURCE),
        origin: ORIGIN,
        originLabel: ORIGIN_LABEL,
      },
    ]);
    assert.equal(removed, null);
    assert.deepEqual(
      published.map((brains) => brains.length),
      [1, 2, 1]
    );
    assert.equal(responder.peerTarget, undefined);
    assert.equal(requester.peerTarget, "arcade");
    requester.dispose();
    responder.dispose();
  });

  it("carries each summary's compiled source hash as sent: a hash, or null", async () => {
    const { requester, responder } = await openPair();
    const summaries: MakeCodeBrainSummary[] = [
      { ...BARE, id: "current-current-", name: "Current", compiledSourceHash: "1a2b3c4d" },
      { ...BARE, id: "stale-stale-stal", name: "Stale", compiledSourceHash: "00000000" },
      { ...BARE, id: "missing-missing-", name: "Missing", compiledSourceHash: null },
    ];
    responder.onBrainsRequest((request) => {
      if (request.kind === "list") request.reply(summaries);
    });

    const listed = await requester.listBrains();

    assert.deepEqual(listed, summaries);
    assert.equal(listed[2].compiledSourceHash, null);
    requester.dispose();
    responder.dispose();
  });

  it("carries each summary's origin and origin label as sent: both, a key with no label, or neither", async () => {
    const { requester, responder } = await openPair();
    const summaries: MakeCodeBrainSummary[] = [
      { ...BARE, id: "labelled-labelle", origin: ORIGIN, originLabel: ORIGIN_LABEL },
      { ...BARE, id: "unlisted-unliste", origin: "wendoo-lang/pxt-daydream", originLabel: null },
      { ...BARE, id: "legacy-legacy-le", origin: null, originLabel: null },
    ];
    responder.onBrainsRequest((request) => {
      if (request.kind === "list") request.reply(summaries);
    });
    const published: MakeCodeBrainSummary[][] = [];
    requester.onBrains((brains) => {
      published.push(brains);
    });

    const listed = await requester.listBrains();
    responder.publishBrains(summaries);
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.deepEqual(listed, summaries);
    assert.deepEqual(published, [summaries]);
    requester.dispose();
    responder.dispose();
  });
});
