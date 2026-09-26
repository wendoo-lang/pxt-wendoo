import assert from "node:assert/strict";
import { after, afterEach, before, describe, it } from "node:test";
import type { PeerSession, PeerSessionHelloMessage, PeerSessionKind, PeerSessionPort } from "@wendoo/bridge-app";
import { connectPeerSession } from "@wendoo/bridge-app";
import { ProjectSession } from "@wendoo/bridge-client";
import type { AppServerMessage, WsMessage } from "@wendoo/bridge-protocol";
import { BridgeSessionErrorCode, PROTOCOL_VERSION } from "@wendoo/bridge-protocol";
import {
  assertCounterpartAway,
  assertJoinCode,
  assertSessionError,
  assertVersionRejected,
  assertWelcome,
  delay,
  type ScriptedPeer,
  startTestRelay,
  type TestRelay,
  type Welcome,
  within,
} from "@wendoo/bridge-session/testing";
import { startRelayServer } from "./server.js";

/**
 * A catalog document exercising characters a JSON wire must carry intact: quotes,
 * backslashes, escape sequences written as text, control characters, and
 * non-ASCII code units including a surrogate pair.
 */
const CATALOG_TEXT =
  '{"packs":[{"name":"beacon","tiles":[{"name":"say \\"hi\\"","kind":"actuator","docs":"line\\nnext \\u00e9"}]}]}' +
  "\t\r\n\u0001 caf\u00e9 \ud83d\ude00 \\";

/**
 * A payload frame whose exact text a parse-and-reserialize would change. It
 * carries tab, carriage-return, and newline whitespace between tokens, escapes
 * a serializer would rewrite, non-canonical numbers, a raw surrogate pair, and
 * keys no schema declares.
 */
const HOSTILE_FRAME = `{\t"type" : "sample:document" ,\r\n  "payload": {"content": ${JSON.stringify(CATALOG_TEXT)}, "escapes": "\\u0041\\/\\b\\f\\u001f", "count": 2.50, "big": 1E3, "raw": "caf\u00e9 \ud83d\ude00"},\n  "unknownKey": [null, true, {}]\n}`;

/** Asserts that `message` is the `session:error` refusing a hello's join code, answering the hello. */
function assertJoinCodeUnknown(message: WsMessage): void {
  assertSessionError(message, BridgeSessionErrorCode.JOIN_CODE_UNKNOWN);
  assert.equal(message.id, "hello");
}

describe("relay", () => {
  let relay: TestRelay;

  /** Opens a scripted peer that the suite closes after each spec. */
  function open(path: string): Promise<ScriptedPeer> {
    return relay.connect(path);
  }

  /**
   * Opens `alpha` and `beta` peers of the sample kind, paired by the join code
   * alpha is answered with, and returns them with that code and their welcomes.
   */
  async function openPair(): Promise<{
    alpha: ScriptedPeer;
    beta: ScriptedPeer;
    joinCode: string;
    alphaWelcome: Welcome;
    betaWelcome: Welcome;
  }> {
    const pair = await relay.pair("sample/alpha", "sample/beta");
    return {
      alpha: pair.first,
      beta: pair.second,
      joinCode: pair.joinCode,
      alphaWelcome: pair.firstWelcome,
      betaWelcome: pair.secondWelcome,
    };
  }

  before(async () => {
    relay = await startTestRelay({ bindingSecret: "spec-secret", server: startRelayServer });
  });

  afterEach(async () => {
    await relay.closePeers();
  });

  after(async () => {
    await relay.close();
  });

  describe("establishment", () => {
    it("answers a hello with a new join code at once and welcomes both members when a hello presenting it pairs", async () => {
      const alpha = await open("sample/alpha");
      const joinCode = assertJoinCode(await alpha.hello());
      await alpha.ping();
      alpha.assertNothingReceived();

      const beta = await open("sample/beta");
      const betaWelcome = assertWelcome(await beta.hello({ joinCode }));
      const alphaWelcome = assertWelcome(await alpha.nextMessage());

      assert.equal(betaWelcome.sessionId, alphaWelcome.sessionId);

      alpha.send({ type: "sample:document", payload: { content: "to beta" } });
      beta.send({ type: "sample:document", payload: { content: "to alpha" } });
      assert.deepEqual(await beta.nextMessage(), { type: "sample:document", payload: { content: "to beta" } });
      assert.deepEqual(await alpha.nextMessage(), { type: "sample:document", payload: { content: "to alpha" } });
    });

    it("answers a ping itself and forwards nothing to the peer", async () => {
      const { alpha, beta } = await openPair();

      await alpha.ping();
      await beta.ping();

      alpha.assertNothingReceived();
      beta.assertNothingReceived();
    });

    it("rejects an unsupported protocol version with the stable code and closes the connection", async () => {
      for (const payload of [{ protocolVersion: PROTOCOL_VERSION + 1 }, { protocolVersion: 0 }, undefined]) {
        const peer = await open("sample/alpha");
        peer.send({ type: "session:hello", id: "hello", payload });

        const rejection = await peer.nextMessage();

        assertVersionRejected(rejection);
        await within(peer.closed, "the rejected connection to close");
      }
    });

    it("refuses a third role presenting a pair's join code, which left service when the pair formed, leaving the pair intact", async () => {
      const { alpha, beta, joinCode } = await openPair();
      const gamma = await open("sample/gamma");

      assertJoinCodeUnknown(await gamma.hello({ joinCode }));
      await within(gamma.closed, "the refused connection to close");

      alpha.send({ type: "sample:document", payload: { content: "to beta" } });
      assert.deepEqual(await beta.nextMessage(), { type: "sample:document", payload: { content: "to beta" } });
      await alpha.ping();
      alpha.assertNothingReceived();
    });
  });

  describe("forwarding", () => {
    it("forwards a payload frame byte-verbatim in both directions", async () => {
      assert.notEqual(
        JSON.stringify(JSON.parse(HOSTILE_FRAME)),
        HOSTILE_FRAME,
        "the fixture must not survive a reserialize"
      );
      const { alpha, beta } = await openPair();

      alpha.sendText(HOSTILE_FRAME);
      const atBeta = await beta.next();
      beta.sendText(HOSTILE_FRAME);
      const atAlpha = await alpha.next();

      assert.equal(atBeta, HOSTILE_FRAME);
      assert.equal(atAlpha, HOSTILE_FRAME);
      assert.ok(Buffer.from(atBeta, "utf8").equals(Buffer.from(HOSTILE_FRAME, "utf8")));
    });

    it("forwards filesystem and compile messages, which are not relay control", async () => {
      const { alpha, beta } = await openPair();
      const frames = [
        '{"type":"filesystem:change","payload":{"path":"a.ts","extra":1}}',
        '{"type":"compile:status","payload":{"ok":true}}',
        '{"type":"bare-payload"}',
      ];

      for (const frame of frames) alpha.sendText(frame);

      for (const frame of frames) assert.equal(await beta.next(), frame);
    });

    it("drops frames that are not JSON objects with a string type", async () => {
      const { alpha, beta } = await openPair();

      for (const garbage of ["not json", "[1,2]", "42", "null", '"text"', "{}", '{"type":7}', '{"payload":{}}']) {
        alpha.sendText(garbage);
      }
      alpha.sendBinary(new Uint8Array([123, 125]));
      alpha.send({ type: "sample:document", payload: { content: "after the garbage" } });

      assert.deepEqual(await beta.nextMessage(), {
        type: "sample:document",
        payload: { content: "after the garbage" },
      });
      await alpha.ping();
    });

    it("forwards a control-namespace reply correlated by id to a forwarded message, once, verbatim", async () => {
      const { alpha, beta } = await openPair();
      alpha.send({ type: "sample:request", id: "request-1", payload: {} });
      assert.equal((await beta.nextMessage()).id, "request-1");
      const reply = '{"type":"session:error","id":"request-1","payload":{"message":"refused","detail":{"x":1}}}';

      beta.sendText(reply);
      beta.sendText(reply);
      beta.send({ type: "session:error", id: "never-forwarded", payload: { message: "uncorrelated" } });

      assert.equal(await alpha.next(), reply);
      await beta.ping();
      await alpha.ping();
      alpha.assertNothingReceived();
    });
  });

  describe("pairing", () => {
    it("never pairs connections of different kinds: a join code of one kind is unknown to another", async () => {
      const alpha = await open("sample/alpha");
      const joinCode = assertJoinCode(await alpha.hello());
      const stranger = await open("other/beta");
      assertJoinCodeUnknown(await stranger.hello({ joinCode }));
      await within(stranger.closed, "the refused connection to close");
      await alpha.ping();
      alpha.assertNothingReceived();

      const beta = await open("sample/beta");
      assertWelcome(await beta.hello({ joinCode }));
      assertWelcome(await alpha.nextMessage());
      alpha.send({ type: "sample:document", payload: { content: "for my own kind" } });
      assert.deepEqual(await beta.nextMessage(), { type: "sample:document", payload: { content: "for my own kind" } });
    });

    it("refuses a claimant presenting the join code of a pair whose roles are both connected, leaving the pair connected", async () => {
      const { alpha, beta, joinCode } = await openPair();
      const newBeta = await open("sample/beta");

      assertJoinCodeUnknown(await newBeta.hello({ joinCode }));
      await within(newBeta.closed, "the refused connection to close");

      alpha.send({ type: "sample:document", payload: { content: "still to beta" } });
      assert.deepEqual(await beta.nextMessage(), { type: "sample:document", payload: { content: "still to beta" } });
      await alpha.ping();
      alpha.assertNothingReceived();
    });

    it("keys nothing on a session id a hello carries: one with a live session's id and no credential opens a new session", async () => {
      const { alpha, beta, joinCode, alphaWelcome } = await openPair();
      const stranger = await open("sample/alpha");

      stranger.send({
        type: "session:hello",
        id: "hello",
        payload: { protocolVersion: PROTOCOL_VERSION, sessionId: alphaWelcome.sessionId },
      });

      assert.notEqual(assertJoinCode(await stranger.nextMessage()), joinCode);
      await stranger.ping();
      stranger.assertNothingReceived();
      await alpha.ping();
      await beta.ping();
      alpha.assertNothingReceived();
      beta.assertNothingReceived();
    });

    it("refuses a claimant for the connected role of a pair whose other member is away, by its old code or its current one; the away member returns by its token", async () => {
      const { alpha, beta, joinCode, alphaWelcome, betaWelcome } = await openPair();
      await alpha.close();
      assertCounterpartAway(await beta.nextMessage());
      const vacancyCode = assertJoinCode(await beta.nextMessage());

      for (const presented of [joinCode, vacancyCode]) {
        const claimant = await open("sample/beta");
        assertJoinCodeUnknown(await claimant.hello({ joinCode: presented }));
        await within(claimant.closed, "the refused connection to close");
      }
      await beta.ping();
      beta.assertNothingReceived();

      const returned = await open("sample/alpha");
      assert.deepEqual(assertWelcome(await returned.hello({ bindingToken: alphaWelcome.bindingToken })), alphaWelcome);
      assert.deepEqual(assertWelcome(await beta.nextMessage()), betaWelcome);
    });

    it("binds a reconnect presenting its binding token back into the same session and welcomes the connected peer again", async () => {
      const { alpha, beta, alphaWelcome, betaWelcome } = await openPair();
      await alpha.close();
      assertCounterpartAway(await beta.nextMessage());
      assertJoinCode(await beta.nextMessage());

      const newAlpha = await open("sample/alpha");
      const newAlphaWelcome = assertWelcome(await newAlpha.hello({ bindingToken: alphaWelcome.bindingToken }));

      const betaRewelcome = assertWelcome(await beta.nextMessage());

      assert.equal(newAlphaWelcome.sessionId, alphaWelcome.sessionId);
      assert.equal(newAlphaWelcome.bindingToken, alphaWelcome.bindingToken);
      assert.deepEqual(betaRewelcome, betaWelcome);
      newAlpha.send({ type: "sample:document", payload: { content: "after reconnect" } });
      assert.deepEqual(await beta.nextMessage(), { type: "sample:document", payload: { content: "after reconnect" } });
      beta.send({ type: "sample:document", payload: { content: "still here" } });
      assert.deepEqual(await newAlpha.nextMessage(), { type: "sample:document", payload: { content: "still here" } });
    });

    it("binds a newcomer presenting the code the connected member was sent at the drop into the same session, and welcomes that member again", async () => {
      const { alpha, beta, alphaWelcome } = await openPair();
      await beta.close();
      assertCounterpartAway(await alpha.nextMessage());
      const vacancyCode = assertJoinCode(await alpha.nextMessage());

      const newBeta = await open("sample/beta");
      const newBetaWelcome = assertWelcome(await newBeta.hello({ joinCode: vacancyCode }));

      const alphaRewelcome = assertWelcome(await alpha.nextMessage());

      assert.equal(newBetaWelcome.sessionId, alphaWelcome.sessionId);
      assert.deepEqual(alphaRewelcome, alphaWelcome);
      newBeta.send({ type: "sample:document", payload: { content: "rejoined" } });
      assert.deepEqual(await alpha.nextMessage(), { type: "sample:document", payload: { content: "rejoined" } });
    });

    it("supersedes a member's still-open connection when it binds back in with its token, keeping the peer connected", async () => {
      const { alpha, beta, alphaWelcome, betaWelcome } = await openPair();
      const newAlpha = await open("sample/alpha");

      const newAlphaWelcome = assertWelcome(await newAlpha.hello({ bindingToken: alphaWelcome.bindingToken }));
      const betaRewelcome = assertWelcome(await beta.nextMessage());

      assertSessionError(await alpha.nextMessage(), BridgeSessionErrorCode.SESSION_REPLACED);
      await within(alpha.closed, "the superseded connection to close");
      assert.equal(newAlphaWelcome.sessionId, alphaWelcome.sessionId);
      assert.deepEqual(betaRewelcome, betaWelcome);
      beta.send({ type: "sample:document", payload: { content: "to the returned member" } });
      assert.deepEqual(await newAlpha.nextMessage(), {
        type: "sample:document",
        payload: { content: "to the returned member" },
      });
      await beta.ping();
      beta.assertNothingReceived();
    });

    it("binds two reconnects presenting their binding tokens back into the same session after both members left", async () => {
      const { alpha, beta, alphaWelcome, betaWelcome } = await openPair();
      await alpha.close();
      assertCounterpartAway(await beta.nextMessage());
      await beta.close();
      await relay.settle();

      const newBeta = await open("sample/beta");
      assertJoinCode(await newBeta.hello({ bindingToken: betaWelcome.bindingToken }));
      const newAlpha = await open("sample/alpha");
      const newAlphaWelcome = assertWelcome(await newAlpha.hello({ bindingToken: alphaWelcome.bindingToken }));
      const newBetaWelcome = assertWelcome(await newBeta.nextMessage());

      assert.deepEqual(newAlphaWelcome, alphaWelcome);
      assert.deepEqual(newBetaWelcome, betaWelcome);
      newAlpha.send({ type: "sample:document", payload: { content: "together again" } });
      assert.deepEqual(await newBeta.nextMessage(), {
        type: "sample:document",
        payload: { content: "together again" },
      });
    });

    it("refuses the code a session formed with once its members all left, and binds a newcomer entering the code its returning member is answered with", async () => {
      const { alpha, beta, joinCode, alphaWelcome } = await openPair();
      await alpha.close();
      assertCounterpartAway(await beta.nextMessage());
      await beta.close();
      await relay.settle();

      const stale = await open("sample/beta");
      assertJoinCodeUnknown(await stale.hello({ joinCode }));
      const newAlpha = await open("sample/alpha");
      const vacancyCode = assertJoinCode(await newAlpha.hello({ bindingToken: alphaWelcome.bindingToken }));
      const newBeta = await open("sample/beta");

      assert.equal(assertWelcome(await newBeta.hello({ joinCode: vacancyCode })).sessionId, alphaWelcome.sessionId);
      assert.deepEqual(assertWelcome(await newAlpha.nextMessage()), alphaWelcome);
    });
  });
});

describe("session linger", () => {
  it("ends a session that has had no member for the linger time, after which its tokens rebuild the binding under a new session id and join code", async () => {
    const relay = await startTestRelay({ bindingSecret: "spec-secret", lingerMs: 20, server: startRelayServer });
    try {
      const alpha = await relay.connect("sample/alpha");
      const joinCode = assertJoinCode(await alpha.hello());
      const beta = await relay.connect("sample/beta");
      const betaWelcome = assertWelcome(await beta.hello({ joinCode }));
      const alphaWelcome = assertWelcome(await alpha.nextMessage());
      await alpha.close();
      await beta.close();
      await relay.expireLinger();

      const newAlpha = await relay.connect("sample/alpha");
      const newAlphaCode = assertJoinCode(await newAlpha.hello({ bindingToken: alphaWelcome.bindingToken }));
      await newAlpha.ping();
      newAlpha.assertNothingReceived();
      const newBeta = await relay.connect("sample/beta");
      const newBetaWelcome = assertWelcome(await newBeta.hello({ bindingToken: betaWelcome.bindingToken }));
      const newAlphaWelcome = assertWelcome(await newAlpha.nextMessage());

      assert.notEqual(newAlphaCode, joinCode);
      assert.equal(newAlphaWelcome.sessionId, newBetaWelcome.sessionId);
      assert.notEqual(newAlphaWelcome.sessionId, alphaWelcome.sessionId);
      assert.equal(newAlphaWelcome.bindingToken, alphaWelcome.bindingToken);
    } finally {
      await relay.close();
    }
  });

  it("keeps a session rebuilt from a binding token past the linger time while it has a member", async () => {
    const relay = await startTestRelay({ bindingSecret: "spec-secret", lingerMs: 20, server: startRelayServer });
    try {
      const { first, second, firstWelcome, secondWelcome } = await relay.pair("sample/alpha", "sample/beta");
      await relay.restart();
      await within(first.closed, "alpha's connection to close");
      await within(second.closed, "beta's connection to close");
      const alpha = await relay.connect("sample/alpha");
      assertJoinCode(await alpha.hello({ bindingToken: firstWelcome.bindingToken }));
      await relay.expireLinger();

      const beta = await relay.connect("sample/beta");
      const betaWelcome = assertWelcome(await beta.hello({ bindingToken: secondWelcome.bindingToken }));
      const alphaWelcome = assertWelcome(await alpha.nextMessage());

      assert.equal(alphaWelcome.sessionId, betaWelcome.sessionId);
    } finally {
      await relay.close();
    }
  });
});

describe("join code rotation", () => {
  it("rotates the join code of a session with a vacant role, pushing the new code to its member", async () => {
    const relay = await startTestRelay({ bindingSecret: "spec-secret", rotationMs: 500, server: startRelayServer });
    try {
      const alpha = await relay.connect("sample/alpha");
      const joinCode = assertJoinCode(await alpha.hello());

      const rotated = assertJoinCode(await alpha.nextMessage());
      assert.notEqual(rotated, joinCode);
    } finally {
      await relay.close();
    }
  });
});

describe("liveness", () => {
  it("closes a connection that sends nothing for the activity timeout, telling its counterpart it is away", async () => {
    const relay = await startTestRelay({
      bindingSecret: "spec-secret",
      activityTimeoutMs: 300,
      server: startRelayServer,
    });
    const { first, second } = await relay.pair("sample/alpha", "sample/beta");
    const beat = setInterval(() => {
      first.send({ type: "control:ping" });
    }, 50);
    try {
      await within(second.closed, "the silent connection to close");
      let message = await first.nextMessage();
      while (message.type === "control:pong") message = await first.nextMessage();
      assertCounterpartAway(message);
    } finally {
      clearInterval(beat);
      await relay.close();
    }
  });
});

describe("relay restart", () => {
  it("rebuilds a session from its members' binding tokens under the same binding, with a new session id and join code, welcoming both", async () => {
    const relay = await startTestRelay({ bindingSecret: "spec-secret", server: startRelayServer });
    try {
      const { first, second, joinCode, firstWelcome, secondWelcome } = await relay.pair("sample/alpha", "sample/beta");

      await relay.restart();
      await within(first.closed, "alpha's connection to close");
      await within(second.closed, "beta's connection to close");
      const alpha = await relay.connect("sample/alpha");
      const rebuiltCode = assertJoinCode(await alpha.hello({ bindingToken: firstWelcome.bindingToken }));
      await alpha.ping();
      alpha.assertNothingReceived();
      const beta = await relay.connect("sample/beta");
      const betaWelcome = assertWelcome(await beta.hello({ bindingToken: secondWelcome.bindingToken }));
      const alphaWelcome = assertWelcome(await alpha.nextMessage());

      assert.notEqual(rebuiltCode, joinCode);
      assert.equal(alphaWelcome.sessionId, betaWelcome.sessionId);
      assert.notEqual(alphaWelcome.sessionId, firstWelcome.sessionId);
      assert.equal(alphaWelcome.bindingToken, firstWelcome.bindingToken);
      assert.equal(betaWelcome.bindingToken, secondWelcome.bindingToken);
      alpha.send({ type: "sample:document", payload: { content: "after the restart" } });
      assert.deepEqual(await beta.nextMessage(), {
        type: "sample:document",
        payload: { content: "after the restart" },
      });
      beta.send({ type: "sample:document", payload: { content: "and back" } });
      assert.deepEqual(await alpha.nextMessage(), { type: "sample:document", payload: { content: "and back" } });
    } finally {
      await relay.close();
    }
  });

  it("pairs, welcomes, and refuses a claimant in a session rebuilt from one member's token as in any other", async () => {
    const relay = await startTestRelay({ bindingSecret: "spec-secret", server: startRelayServer });
    try {
      const { first, second, firstWelcome } = await relay.pair("sample/alpha", "sample/beta");
      await relay.restart();
      await within(first.closed, "alpha's connection to close");
      await within(second.closed, "beta's connection to close");

      const alpha = await relay.connect("sample/alpha");
      const rebuiltCode = assertJoinCode(await alpha.hello({ bindingToken: firstWelcome.bindingToken }));
      const entered = await relay.connect("sample/beta");
      const enteredWelcome = assertWelcome(await entered.hello({ joinCode: rebuiltCode }));
      const alphaWelcome = assertWelcome(await alpha.nextMessage());
      assert.equal(enteredWelcome.sessionId, alphaWelcome.sessionId);
      assert.equal(alphaWelcome.bindingToken, firstWelcome.bindingToken);

      const claimant = await relay.connect("sample/beta");
      assertJoinCodeUnknown(await claimant.hello({ joinCode: rebuiltCode }));
      await within(claimant.closed, "the refused connection to close");

      alpha.send({ type: "sample:document", payload: { content: "to the entered member" } });
      assert.deepEqual(await entered.nextMessage(), {
        type: "sample:document",
        payload: { content: "to the entered member" },
      });
    } finally {
      await relay.close();
    }
  });

  it("ends every session when it restarts under a new binding secret: tokens issued before it open separate new sessions", async () => {
    const relay = await startTestRelay({ server: startRelayServer });
    try {
      const { first, second, firstWelcome, secondWelcome } = await relay.pair("sample/alpha", "sample/beta");

      await relay.restart();
      await within(first.closed, "alpha's connection to close");
      await within(second.closed, "beta's connection to close");
      const alpha = await relay.connect("sample/alpha");
      const alphaCode = assertJoinCode(await alpha.hello({ bindingToken: firstWelcome.bindingToken }));
      const beta = await relay.connect("sample/beta");
      const betaCode = assertJoinCode(await beta.hello({ bindingToken: secondWelcome.bindingToken }));
      await alpha.ping();
      await beta.ping();

      assert.notEqual(betaCode, alphaCode);
      alpha.assertNothingReceived();
      beta.assertNothingReceived();
    } finally {
      await relay.close();
    }
  });
});

describe("peer session across the relay", () => {
  /** The peer-session kind these specs speak: `sample`, at protocol version 1. */
  const SAMPLE_KIND: PeerSessionKind<"sample"> = { kind: "sample", protocolVersion: 1 };

  /** The sample kind's one message besides its hello. */
  interface SampleDocumentMessage {
    type: "sample:document";
    payload: { content: string };
  }

  type SampleMessage = PeerSessionHelloMessage<"sample"> | SampleDocumentMessage;

  /** A bridge-client session to the relay, typed for the messages the relay sends. */
  type RelaySession = ProjectSession<WsMessage, AppServerMessage>;

  /** A WebSocket subclass, installed as the global WebSocket for these specs, that records every instance created. */
  class RecordingWebSocket extends WebSocket {
    /** Every socket created, in creation order. */
    static readonly created: RecordingWebSocket[] = [];

    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols);
      RecordingWebSocket.created.push(this);
    }
  }

  /** Resolves once `socket` has closed. */
  function socketClosed(socket: WebSocket): Promise<void> {
    if (socket.readyState === WebSocket.CLOSED) return Promise.resolve();
    return within(
      new Promise((resolve) => {
        socket.addEventListener("close", () => {
          resolve();
        });
      }),
      "a socket to close"
    );
  }

  /**
   * An endpoint that treats every welcome as "the session is connected": on
   * each one it disposes the connection-scoped `PeerSession` handshake it
   * holds and opens a new one.
   */
  interface Endpoint {
    /** Resolves with the join code the relay answers the endpoint's first hello with. */
    readonly joinCode: Promise<string>;
    /** Resolves with the `PeerSession` the endpoint opened on its welcome number `index`, counting from 0. */
    peerSession(index: number): Promise<PeerSession<SampleDocumentMessage>>;
    /** Number of welcomes the endpoint has received. */
    welcomes(): number;
    /** Disposes the `PeerSession` the endpoint holds. */
    dispose(): void;
  }

  /** Starts `session` as an {@link Endpoint}. */
  function startEndpoint(session: RelaySession): Endpoint {
    const opened: {
      promise: Promise<PeerSession<SampleDocumentMessage>>;
      resolve(peerSession: PeerSession<SampleDocumentMessage>): void;
      reject(error: unknown): void;
    }[] = [];
    const slot = (index: number) => {
      while (opened.length <= index) {
        let resolve!: (peerSession: PeerSession<SampleDocumentMessage>) => void;
        let reject!: (error: unknown) => void;
        const promise = new Promise<PeerSession<SampleDocumentMessage>>((resolvePromise, rejectPromise) => {
          resolve = resolvePromise;
          reject = rejectPromise;
        });
        opened.push({ promise, resolve, reject });
      }
      return opened[index];
    };
    let welcomes = 0;
    let current: PeerSession<SampleDocumentMessage> | undefined;
    const joinCode = new Promise<string>((resolve) => {
      session.on("session:joinCode", (message) => {
        resolve(message.payload.joinCode);
      });
    });
    session.on("session:welcome", () => {
      const index = welcomes++;
      current?.dispose();
      current = undefined;
      connectPeerSession<"sample", SampleDocumentMessage>({ kind: SAMPLE_KIND, port: payloadPort(session) }).then(
        (peerSession) => {
          if (index === welcomes - 1) current = peerSession;
          else peerSession.dispose();
          slot(index).resolve(peerSession);
        },
        (error: unknown) => {
          slot(index).reject(error);
        }
      );
    });
    session.start();
    return {
      joinCode,
      peerSession: (index) => within(slot(index).promise, `peer session ${index}`),
      welcomes: () => welcomes,
      dispose: () => {
        current?.dispose();
      },
    };
  }

  /** A peer-session port carried by `session`'s payload messages. */
  function payloadPort(session: RelaySession): PeerSessionPort<SampleMessage> {
    return {
      postMessage(message) {
        session.sendPayload(message);
      },
      onMessage(listener) {
        return session.onPayload((message) => {
          listener(message as SampleMessage);
        });
      },
    };
  }

  /** Posts `content` over `from` and resolves once `to` delivers it. */
  function carry(
    from: PeerSession<SampleDocumentMessage>,
    to: PeerSession<SampleDocumentMessage>,
    content: string
  ): Promise<string> {
    const received = within(
      new Promise<string>((resolve) => {
        const unsubscribe = to.onMessage((message) => {
          unsubscribe();
          resolve(message.payload.content);
        });
      }),
      "the document"
    );
    from.postMessage({ type: "sample:document", payload: { content } });
    return received;
  }

  let relay: TestRelay;
  let bridgeUrl: string;
  const sessions: RelaySession[] = [];
  const endpoints: Endpoint[] = [];
  const originalWebSocket = globalThis.WebSocket;

  /**
   * Creates a bridge-client `ProjectSession` connecting as role `role` of the
   * sample kind, holding `meta` across reconnects; stopped after each spec.
   */
  function createSession(role: string, joinCode?: string, meta: { bindingToken?: string } = {}): RelaySession {
    const session: RelaySession = new ProjectSession(`sample/${role}`, bridgeUrl, meta, joinCode);
    sessions.push(session);
    return session;
  }

  /** Starts `session` as an endpoint that is disposed after each spec. */
  function endpoint(session: RelaySession): Endpoint {
    const started = startEndpoint(session);
    endpoints.push(started);
    return started;
  }

  /**
   * Records `session`'s status signals in the order they arrive: `away` for
   * each counterpart-away event and `welcome` for each accepted welcome.
   */
  function recordSignals(session: RelaySession): string[] {
    const signals: string[] = [];
    session.addEventListener("counterpartAway", () => {
      signals.push("away");
    });
    session.on("session:welcome", () => {
      signals.push("welcome");
    });
    return signals;
  }

  /** Resolves on `session`'s next counterpart-away event. */
  function nextCounterpartAway(session: RelaySession): Promise<void> {
    return within(
      new Promise((resolve) => {
        const unsubscribe = session.addEventListener("counterpartAway", () => {
          unsubscribe();
          resolve();
        });
      }),
      "a counterpart-away signal"
    );
  }

  /** Resolves with the next join code the bridge sends `session`. */
  function nextJoinCode(session: RelaySession): Promise<string> {
    return within(
      new Promise((resolve) => {
        const unsubscribe = session.on("session:joinCode", (message) => {
          unsubscribe();
          resolve(message.payload.joinCode);
        });
      }),
      "a join code"
    );
  }

  /** Resolves once `session`'s status becomes `disconnected`. */
  function nextDisconnected(session: RelaySession): Promise<void> {
    return within(
      new Promise((resolve) => {
        const unsubscribe = session.addEventListener("status", (status) => {
          if (status !== "disconnected") return;
          unsubscribe();
          resolve();
        });
      }),
      "the session to disconnect"
    );
  }

  /** The socket bridge-client most recently opened. */
  function lastSocket(): RecordingWebSocket {
    const socket = RecordingWebSocket.created.at(-1);
    assert.ok(socket);
    return socket;
  }

  /**
   * Opens alpha and beta endpoints, alpha first and alone, and resolves once
   * both hold their first `PeerSession`.
   */
  async function connectedPair() {
    const alpha = createSession("alpha");
    const alphaEndpoint = endpoint(alpha);
    const alphaSocket = lastSocket();
    const joinCode = await within(alphaEndpoint.joinCode, "alpha's join code");
    const beta = createSession("beta", joinCode);
    const betaEndpoint = endpoint(beta);
    const betaSocket = lastSocket();
    const [alphaSession, betaSession] = await Promise.all([alphaEndpoint.peerSession(0), betaEndpoint.peerSession(0)]);
    return { alpha, beta, alphaEndpoint, betaEndpoint, alphaSocket, betaSocket, alphaSession, betaSession, joinCode };
  }

  before(async () => {
    (globalThis as Record<string, unknown>).WebSocket = RecordingWebSocket;
    relay = await startTestRelay({ bindingSecret: "spec-secret", server: startRelayServer });
    bridgeUrl = relay.address;
  });

  afterEach(() => {
    for (const started of endpoints.splice(0)) started.dispose();
    for (const session of sessions.splice(0)) session.stop();
  });

  after(async () => {
    (globalThis as Record<string, unknown>).WebSocket = originalWebSocket;
    await relay.close();
  });

  it("connects a session between endpoints arriving one after the other and carries a document byte-identically", async () => {
    const alpha = createSession("alpha");
    const alphaEndpoint = endpoint(alpha);
    const joinCode = await within(alphaEndpoint.joinCode, "alpha's join code");
    await within(alpha.request("control:ping"), "alpha's pong");
    assert.equal(alphaEndpoint.welcomes(), 0);

    const betaEndpoint = endpoint(createSession("beta", joinCode));
    const [alphaSession, betaSession] = await Promise.all([alphaEndpoint.peerSession(0), betaEndpoint.peerSession(0)]);

    assert.equal(alphaSession.peerProtocolVersion, 1);
    assert.equal(betaSession.peerProtocolVersion, 1);
    assert.equal(await carry(alphaSession, betaSession, CATALOG_TEXT), CATALOG_TEXT);
  });

  it("reconnects the same session when an endpoint's connection drops and it returns with its binding token", async () => {
    const { alpha, beta, alphaEndpoint, betaEndpoint, alphaSocket, betaSocket } = await connectedPair();
    const sessionId = alpha.sessionId;
    const statuses: string[] = [];
    beta.addEventListener("status", (status) => {
      statuses.push(status);
    });
    const betaSignals = recordSignals(beta);

    const away = nextCounterpartAway(beta);
    alpha.stop();
    await socketClosed(alphaSocket);
    await away;
    alpha.start();
    const [alphaSession, betaSession] = await Promise.all([alphaEndpoint.peerSession(1), betaEndpoint.peerSession(1)]);

    assert.equal(alpha.sessionId, sessionId);
    assert.equal(beta.sessionId, sessionId);
    assert.equal(betaEndpoint.welcomes(), 2);
    assert.deepEqual(betaSignals, ["away", "welcome"]);
    assert.deepEqual(statuses, []);
    assert.equal(lastSocket().readyState, WebSocket.OPEN);
    assert.equal(betaSocket.readyState, WebSocket.OPEN);
    assert.equal(await carry(alphaSession, betaSession, CATALOG_TEXT), CATALOG_TEXT);
    assert.equal(await carry(betaSession, alphaSession, "and back"), "and back");
  });

  it("reconnects the same session when a newcomer enters the code its counterpart is sent when the endpoint drops", async () => {
    const { alpha, beta, alphaEndpoint, betaSocket, joinCode } = await connectedPair();
    const sessionId = alpha.sessionId;
    const alphaSignals = recordSignals(alpha);
    const vacancyCode = nextJoinCode(alpha);

    const away = nextCounterpartAway(alpha);
    beta.stop();
    await socketClosed(betaSocket);
    await away;
    assert.notEqual(await vacancyCode, joinCode);
    const returned = createSession("beta", await vacancyCode);
    const returnedEndpoint = endpoint(returned);
    const [alphaSession, returnedSession] = await Promise.all([
      alphaEndpoint.peerSession(1),
      returnedEndpoint.peerSession(0),
    ]);

    assert.equal(returned.sessionId, sessionId);
    assert.equal(alpha.sessionId, sessionId);
    assert.equal(alphaEndpoint.welcomes(), 2);
    assert.deepEqual(alphaSignals, ["away", "welcome"]);
    assert.equal(await carry(alphaSession, returnedSession, CATALOG_TEXT), CATALOG_TEXT);
  });

  it("keeps exactly one of two clients sharing a binding token: the displaced one is told it was replaced and stays away", async () => {
    const firstMeta: { bindingToken?: string } = {};
    const first = createSession("alpha", undefined, firstMeta);
    const firstEndpoint = endpoint(first);
    const joinCode = await within(firstEndpoint.joinCode, "the first client's join code");
    const beta = createSession("beta", joinCode);
    const betaEndpoint = endpoint(beta);
    await Promise.all([firstEndpoint.peerSession(0), betaEndpoint.peerSession(0)]);
    const firstErrors: string[] = [];
    first.addEventListener("error", (code) => {
      firstErrors.push(code);
    });
    const betaSignals = recordSignals(beta);

    const second = createSession("alpha", undefined, { bindingToken: firstMeta.bindingToken });
    const secondEndpoint = endpoint(second);
    const [secondSession, betaSession] = await Promise.all([
      secondEndpoint.peerSession(0),
      betaEndpoint.peerSession(1),
    ]);
    const socketsAfterTakeover = RecordingWebSocket.created.length;
    // Gives the bridge client time to reconnect, which the assertions below expect it not to do.
    await delay(2500);

    assert.equal(RecordingWebSocket.created.length - socketsAfterTakeover, 0);
    assert.deepEqual(firstErrors, [BridgeSessionErrorCode.SESSION_REPLACED]);
    assert.equal(first.status, "disconnected");
    assert.equal(second.status, "connected");
    assert.equal(secondEndpoint.welcomes(), 1);
    assert.deepEqual(betaSignals, ["welcome"]);
    assert.equal(second.sessionId, beta.sessionId);
    assert.equal(await carry(betaSession, secondSession, CATALOG_TEXT), CATALOG_TEXT);
  });

  it("holds a client entering the code of a connected session on JOIN_CODE_UNKNOWN without reconnecting, leaving the session undisturbed", async () => {
    const { alpha, beta, alphaSession, betaSession, joinCode } = await connectedPair();
    const alphaSignals = recordSignals(alpha);
    const betaSignals = recordSignals(beta);
    const claimant = createSession("beta", joinCode);
    const claimantErrors: string[] = [];
    claimant.addEventListener("error", (code) => {
      claimantErrors.push(code);
    });
    const held = nextDisconnected(claimant);
    const socketsBeforeClaimant = RecordingWebSocket.created.length;

    claimant.start();
    await held;
    // Gives the bridge client time to reconnect, which the assertions below expect it not to do.
    await delay(1500);

    assert.deepEqual(claimantErrors, [BridgeSessionErrorCode.JOIN_CODE_UNKNOWN]);
    assert.equal(RecordingWebSocket.created.length - socketsBeforeClaimant, 1);
    assert.deepEqual(alphaSignals, []);
    assert.deepEqual(betaSignals, []);
    assert.equal(await carry(alphaSession, betaSession, CATALOG_TEXT), CATALOG_TEXT);
  });

  it("ends the session when an endpoint ends it on purpose: its counterpart holds on SESSION_ENDED without reconnecting", async () => {
    const { alpha, beta, alphaSocket, betaSocket } = await connectedPair();
    const betaErrors: string[] = [];
    beta.addEventListener("error", (code) => {
      betaErrors.push(code);
    });
    const held = nextDisconnected(beta);
    const socketsBeforeEnd = RecordingWebSocket.created.length;

    alpha.end();
    await held;
    await socketClosed(alphaSocket);
    await socketClosed(betaSocket);
    // Gives the bridge client time to reconnect, which the assertions below expect it not to do.
    await delay(1500);

    assert.deepEqual(betaErrors, [BridgeSessionErrorCode.SESSION_ENDED]);
    assert.equal(alpha.status, "disconnected");
    assert.equal(beta.status, "disconnected");
    assert.equal(RecordingWebSocket.created.length, socketsBeforeEnd);
  });
});
