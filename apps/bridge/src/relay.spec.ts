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
} from "./testing/index.js";

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

describe("relay", () => {
  let relay: TestRelay;

  /** Opens a scripted peer that the suite closes after each spec. */
  function open(path: string): Promise<ScriptedPeer> {
    return relay.connect(path);
  }

  /** Opens `alpha` and `beta` peers of the sample kind, paired by the join code alpha is answered with. */
  async function openPair(): Promise<{
    alpha: ScriptedPeer;
    beta: ScriptedPeer;
    alphaWelcome: Welcome;
    betaWelcome: Welcome;
  }> {
    const pair = await relay.pair("sample/alpha", "sample/beta");
    return { alpha: pair.first, beta: pair.second, alphaWelcome: pair.firstWelcome, betaWelcome: pair.secondWelcome };
  }

  before(async () => {
    relay = await startTestRelay({ bindingSecret: "spec-secret" });
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
      assert.equal(assertJoinCode(await beta.hello({ joinCode })), joinCode);
      const betaWelcome = assertWelcome(await beta.nextMessage());
      const alphaWelcome = assertWelcome(await alpha.nextMessage());

      assert.equal(alphaWelcome.joinCode, joinCode);
      assert.equal(betaWelcome.joinCode, joinCode);
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

    it("refuses a third role into a pairing, leaving the pair intact", async () => {
      const { alpha, beta, alphaWelcome } = await openPair();
      const gamma = await open("sample/gamma");

      const refusal = await gamma.hello({ joinCode: alphaWelcome.joinCode });

      assertSessionError(refusal, undefined);
      gamma.send({ type: "sample:document", payload: { content: "from gamma" } });
      alpha.send({ type: "sample:document", payload: { content: "to beta" } });
      assert.deepEqual(await beta.nextMessage(), { type: "sample:document", payload: { content: "to beta" } });
      await gamma.ping();
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
    it("never pairs connections of different kinds that present the same join code", async () => {
      const alpha = await open("sample/alpha");
      const joinCode = assertJoinCode(await alpha.hello());
      const stranger = await open("other/beta");
      assert.equal(assertJoinCode(await stranger.hello({ joinCode })), joinCode);

      alpha.send({ type: "sample:document", payload: { content: "for my own kind" } });
      stranger.send({ type: "sample:document", payload: { content: "across kinds" } });
      await alpha.ping();
      await stranger.ping();
      await alpha.ping();

      alpha.assertNothingReceived();
      stranger.assertNothingReceived();

      const beta = await open("sample/beta");
      assertJoinCode(await beta.hello({ joinCode }));
      assertWelcome(await beta.nextMessage());
      assertWelcome(await alpha.nextMessage());
      alpha.send({ type: "sample:document", payload: { content: "for my own kind" } });
      assert.deepEqual(await beta.nextMessage(), { type: "sample:document", payload: { content: "for my own kind" } });
      await stranger.ping();
      stranger.assertNothingReceived();
    });

    it("ends the session when a new claimant takes an occupied role, opening a new session under the same join code", async () => {
      const { alpha, beta, alphaWelcome } = await openPair();
      const newBeta = await open("sample/beta");

      assert.equal(assertJoinCode(await newBeta.hello({ joinCode: alphaWelcome.joinCode })), alphaWelcome.joinCode);

      assertSessionError(await beta.nextMessage(), BridgeSessionErrorCode.SESSION_REPLACED);
      await within(beta.closed, "the replaced connection to close");
      await within(alpha.closed, "the peer to close");
      alpha.assertNothingReceived();
      await newBeta.ping();
      newBeta.assertNothingReceived();

      const staleOnly = await open("sample/alpha");
      assert.notEqual(
        assertJoinCode(await staleOnly.hello({ bindingToken: alphaWelcome.bindingToken })),
        alphaWelcome.joinCode
      );
      await staleOnly.close();

      const newAlpha = await open("sample/alpha");
      assert.equal(
        assertJoinCode(
          await newAlpha.hello({ bindingToken: alphaWelcome.bindingToken, joinCode: alphaWelcome.joinCode })
        ),
        alphaWelcome.joinCode
      );
      const newAlphaWelcome = assertWelcome(await newAlpha.nextMessage());
      const newBetaWelcome = assertWelcome(await newBeta.nextMessage());

      assert.equal(newAlphaWelcome.sessionId, newBetaWelcome.sessionId);
      assert.notEqual(newAlphaWelcome.sessionId, alphaWelcome.sessionId);
      assert.equal(newAlphaWelcome.joinCode, alphaWelcome.joinCode);
      assert.notEqual(newAlphaWelcome.bindingToken, alphaWelcome.bindingToken);
      newAlpha.send({ type: "sample:document", payload: { content: "to the newcomer" } });
      assert.deepEqual(await newBeta.nextMessage(), {
        type: "sample:document",
        payload: { content: "to the newcomer" },
      });
      newBeta.send({ type: "sample:document", payload: { content: "back" } });
      assert.deepEqual(await newAlpha.nextMessage(), { type: "sample:document", payload: { content: "back" } });
    });

    it("binds a reconnect presenting its binding token back into the same session and welcomes the connected peer again", async () => {
      const { alpha, beta, alphaWelcome, betaWelcome } = await openPair();
      await alpha.close();
      assertCounterpartAway(await beta.nextMessage());

      const newAlpha = await open("sample/alpha");
      assertJoinCode(await newAlpha.hello({ bindingToken: alphaWelcome.bindingToken }));
      const newAlphaWelcome = assertWelcome(await newAlpha.nextMessage());

      const betaRewelcome = assertWelcome(await beta.nextMessage());

      assert.equal(newAlphaWelcome.sessionId, alphaWelcome.sessionId);
      assert.equal(newAlphaWelcome.joinCode, alphaWelcome.joinCode);
      assert.equal(newAlphaWelcome.bindingToken, alphaWelcome.bindingToken);
      assert.deepEqual(betaRewelcome, betaWelcome);
      newAlpha.send({ type: "sample:document", payload: { content: "after reconnect" } });
      assert.deepEqual(await beta.nextMessage(), { type: "sample:document", payload: { content: "after reconnect" } });
      beta.send({ type: "sample:document", payload: { content: "still here" } });
      assert.deepEqual(await newAlpha.nextMessage(), { type: "sample:document", payload: { content: "still here" } });
    });

    it("binds a reconnect presenting only its join code back into the same session and welcomes the connected peer again", async () => {
      const { alpha, beta, alphaWelcome } = await openPair();
      await beta.close();
      assertCounterpartAway(await alpha.nextMessage());

      const newBeta = await open("sample/beta");
      assertJoinCode(await newBeta.hello({ joinCode: alphaWelcome.joinCode }));
      const newBetaWelcome = assertWelcome(await newBeta.nextMessage());

      const alphaRewelcome = assertWelcome(await alpha.nextMessage());

      assert.equal(newBetaWelcome.sessionId, alphaWelcome.sessionId);
      assert.deepEqual(alphaRewelcome, alphaWelcome);
      newBeta.send({ type: "sample:document", payload: { content: "rejoined" } });
      assert.deepEqual(await alpha.nextMessage(), { type: "sample:document", payload: { content: "rejoined" } });
    });

    it("supersedes a member's still-open connection when it binds back in with its token, keeping the peer connected", async () => {
      const { alpha, beta, alphaWelcome, betaWelcome } = await openPair();
      const newAlpha = await open("sample/alpha");

      assertJoinCode(await newAlpha.hello({ bindingToken: alphaWelcome.bindingToken }));
      const newAlphaWelcome = assertWelcome(await newAlpha.nextMessage());
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
      assertJoinCode(await newAlpha.hello({ bindingToken: alphaWelcome.bindingToken }));
      const newAlphaWelcome = assertWelcome(await newAlpha.nextMessage());
      const newBetaWelcome = assertWelcome(await newBeta.nextMessage());

      assert.deepEqual(newAlphaWelcome, alphaWelcome);
      assert.deepEqual(newBetaWelcome, betaWelcome);
      newAlpha.send({ type: "sample:document", payload: { content: "together again" } });
      assert.deepEqual(await newBeta.nextMessage(), {
        type: "sample:document",
        payload: { content: "together again" },
      });
    });

    it("binds a reconnect presenting only its join code back into a session whose members all left", async () => {
      const { alpha, beta, alphaWelcome, betaWelcome } = await openPair();
      await alpha.close();
      assertCounterpartAway(await beta.nextMessage());
      await beta.close();
      await relay.settle();

      const newBeta = await open("sample/beta");
      assert.equal(assertJoinCode(await newBeta.hello({ joinCode: alphaWelcome.joinCode })), alphaWelcome.joinCode);
      const newAlpha = await open("sample/alpha");
      assertJoinCode(await newAlpha.hello({ bindingToken: alphaWelcome.bindingToken }));

      assert.deepEqual(assertWelcome(await newAlpha.nextMessage()), alphaWelcome);
      assert.deepEqual(assertWelcome(await newBeta.nextMessage()), betaWelcome);
    });
  });
});

describe("session linger", () => {
  it("ends a session that has had no member for the linger time, after which its tokens open new sessions", async () => {
    const relay = await startTestRelay({ bindingSecret: "spec-secret", lingerMs: 20 });
    try {
      const alpha = await relay.connect("sample/alpha");
      const joinCode = assertJoinCode(await alpha.hello());
      const beta = await relay.connect("sample/beta");
      assertJoinCode(await beta.hello({ joinCode }));
      const betaWelcome = assertWelcome(await beta.nextMessage());
      const alphaWelcome = assertWelcome(await alpha.nextMessage());
      await alpha.close();
      await beta.close();
      await relay.expireLinger();

      const newAlpha = await relay.connect("sample/alpha");
      const newAlphaCode = assertJoinCode(await newAlpha.hello({ bindingToken: alphaWelcome.bindingToken }));
      const newBeta = await relay.connect("sample/beta");
      const newBetaCode = assertJoinCode(await newBeta.hello({ bindingToken: betaWelcome.bindingToken }));
      await newAlpha.ping();
      await newBeta.ping();

      assert.notEqual(newAlphaCode, joinCode);
      assert.notEqual(newBetaCode, joinCode);
      assert.notEqual(newBetaCode, newAlphaCode);
      newAlpha.assertNothingReceived();
      newBeta.assertNothingReceived();
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
    relay = await startTestRelay({ bindingSecret: "spec-secret" });
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

  it("reconnects the same session when an endpoint returns with only its join code", async () => {
    const { alpha, beta, alphaEndpoint, betaSocket, joinCode } = await connectedPair();
    const sessionId = alpha.sessionId;
    const alphaSignals = recordSignals(alpha);

    const away = nextCounterpartAway(alpha);
    beta.stop();
    await socketClosed(betaSocket);
    await away;
    const returned = createSession("beta", joinCode);
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
    // Long enough for several bridge-client reconnect attempts, whose first delay is half a second.
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

  it("heals the pair when a new claimant ends the session: the alpha endpoint rejoins by join code", async () => {
    const alpha = createSession("alpha");
    const alphaEndpoint = endpoint(alpha);
    const joinCode = await within(alphaEndpoint.joinCode, "alpha's join code");
    const displaced = await relay.connect("sample/beta");
    try {
      assertJoinCode(await displaced.hello({ joinCode }));
      assertWelcome(await displaced.nextMessage());
      displaced.send({ type: "sample:hello", payload: { protocolVersion: 1 } });
      await alphaEndpoint.peerSession(0);
      const endedSessionId = alpha.sessionId;
      const alphaErrors: string[] = [];
      alpha.addEventListener("error", (code) => {
        alphaErrors.push(code);
      });

      const claimant = createSession("beta", joinCode);
      const claimantEndpoint = endpoint(claimant);
      const [alphaSession, claimantSession] = await Promise.all([
        alphaEndpoint.peerSession(1),
        claimantEndpoint.peerSession(0),
      ]);

      assert.equal((await displaced.nextMessage()).type, "sample:hello");
      assertSessionError(await displaced.nextMessage(), BridgeSessionErrorCode.SESSION_REPLACED);
      await within(displaced.closed, "the displaced connection to close");
      assert.deepEqual(alphaErrors, []);
      assert.notEqual(alpha.sessionId, endedSessionId);
      assert.equal(claimant.sessionId, alpha.sessionId);
      assert.equal(await carry(claimantSession, alphaSession, CATALOG_TEXT), CATALOG_TEXT);
    } finally {
      await displaced.close();
    }
  });
});
