import type {
  PeerSession,
  PeerSessionHelloMessage,
  PeerSessionKind,
  PeerSessionPort,
} from "@wendoo/bridge-app/peer-session";
import { connectPeerSession } from "@wendoo/bridge-app/peer-session";
import { base64ToBytes, bytesToBase64 } from "@wendoo/service-api";
import type { MakeCodeAsset, MakeCodeAssetsMessage } from "./makecode-assets.js";
import type {
  MakeCodeBrain,
  MakeCodeBrainPush,
  MakeCodeBrainSummary,
  MakeCodeBrainsErrorPayload,
  MakeCodeBrainsReplyMessage,
  MakeCodeBrainsRequest,
  MakeCodeBrainsRequestMessage,
  MakeCodeWireBrain,
  MakeCodeWireBrainPush,
} from "./makecode-brains.js";
import { MakeCodeBrainsError, MakeCodeBrainsErrorCode } from "./makecode-brains.js";
import type {
  MakeCodeIdManifest,
  MakeCodeManifestErrorPayload,
  MakeCodeManifestReading,
  MakeCodeManifestReplyMessage,
  MakeCodeManifestRequest,
  MakeCodeManifestRequestMessage,
} from "./makecode-manifest.js";
import { MakeCodeManifestError, MakeCodeManifestErrorCode } from "./makecode-manifest.js";
import type { MakeCodeProjectInfo, MakeCodeProjectInfoMessage } from "./makecode-project-info.js";

/** Newest version of the makecode-session protocol this build speaks. */
export const MAKECODE_SESSION_PROTOCOL_VERSION = 1;

/** The makecode session kind: its name, which prefixes its message types, and its version. */
const MAKECODE_SESSION_KIND: PeerSessionKind<"makecode"> = {
  kind: "makecode",
  protocolVersion: MAKECODE_SESSION_PROTOCOL_VERSION,
};

/**
 * The relay path each role of a makecode session connects at, `<kind>/<role>`:
 * `editor` for the Wendoo editor, `simx` for the MakeCode simulator extension
 * serving the project. Pass it as the `wsPath` of the role's bridge-client
 * `ProjectSession`.
 */
export const MAKECODE_SESSION_ROLE_PATHS = {
  editor: `${MAKECODE_SESSION_KIND.kind}/editor`,
  simx: `${MAKECODE_SESSION_KIND.kind}/simx`,
} as const;

/**
 * What a party of a makecode session declares about itself in its hello.
 * Only the party serving the MakeCode project declares one; the editor's
 * hello carries none.
 */
export interface MakeCodeSessionDeclaration {
  /**
   * Id of the MakeCode target running the project, for example `microbit`
   * or `arcade`. Absent when the serving party does not know it.
   * Informational, for display and theming: it is the sender's own claim,
   * never an identity or a basis for trust.
   */
  target?: string;
}

/**
 * First message each party sends to open a makecode session, declaring the
 * version it speaks and, for the party serving the project, a
 * {@link MakeCodeSessionDeclaration}. Neither party sends any other message
 * before it has received the peer's hello.
 */
export type MakeCodeHelloMessage = PeerSessionHelloMessage<"makecode", MakeCodeSessionDeclaration>;

/** Payload of a {@link MakeCodeCatalogMessage}. */
export interface MakeCodeCatalogPayload {
  /**
   * The serialized tile catalog of the MakeCode project, as opaque text. Its
   * grammar is defined by the catalog serializer of the MakeCode VM extension.
   */
  content: string;
}

/**
 * The MakeCode project's tile catalog, published by the party serving the
 * project. A later catalog replaces an earlier one.
 */
export interface MakeCodeCatalogMessage {
  type: "makecode:catalog";
  payload: MakeCodeCatalogPayload;
}

/**
 * Messages either party of a makecode session sends to the other. Every
 * message type is named `makecode:<name>`, and the set grows additively
 * under {@link MAKECODE_SESSION_PROTOCOL_VERSION}: a party ignores every
 * message whose type it does not know.
 */
export type MakeCodeSessionMessage =
  | MakeCodeHelloMessage
  | MakeCodeCatalogMessage
  | MakeCodeAssetsMessage
  | MakeCodeProjectInfoMessage
  | MakeCodeBrainsRequestMessage
  | MakeCodeBrainsReplyMessage
  | MakeCodeManifestRequestMessage
  | MakeCodeManifestReplyMessage;

/**
 * Transport carrying makecode-session messages between this party and its
 * peer. Message order is preserved in both directions.
 */
export type MakeCodeSessionPort = PeerSessionPort<MakeCodeSessionMessage>;

/** Options for {@link connectMakeCodeSession}. */
export interface MakeCodeSessionOptions {
  /** Transport to the peer. */
  port: MakeCodeSessionPort;
  /**
   * Id of the MakeCode target running the project, declared in this side's
   * hello; see {@link MakeCodeSessionDeclaration.target}. Given only by the
   * party serving the project, and only when it knows the target. When
   * omitted, the hello declares nothing.
   */
  target?: string;
}

/**
 * An established makecode session with one peer, joining a Wendoo editor to
 * the peer serving a MakeCode project.
 */
export interface MakeCodeSession {
  /**
   * Protocol version the peer declared in its hello. Never newer than
   * {@link MAKECODE_SESSION_PROTOCOL_VERSION}.
   */
  readonly peerProtocolVersion: number;
  /**
   * Id of the MakeCode target the peer declared in its hello, or `undefined`
   * when it declared none. Informational, for display and theming; see
   * {@link MakeCodeSessionDeclaration.target}.
   */
  readonly peerTarget: string | undefined;
  /** Publish the serialized tile catalog to the peer, verbatim. */
  publishCatalog(content: string): void;
  /**
   * Subscribe to catalogs published by the peer, each delivered as the
   * verbatim serialized text. Catalogs received while no listener is attached
   * are replayed to the next listener that attaches. Returns an unsubscribe
   * function.
   */
  onCatalog(listener: (content: string) => void): () => void;
  /** Publish the project's asset snapshot to the peer, whole. */
  publishAssets(assets: readonly MakeCodeAsset[]): void;
  /**
   * Subscribe to asset snapshots published by the peer, each delivered whole.
   * Snapshots received while no listener is attached are replayed to the
   * next listener that attaches. Returns an unsubscribe function.
   */
  onAssets(listener: (assets: MakeCodeAsset[]) => void): () => void;
  /** Publish the project's facts to the peer, whole. */
  publishProjectInfo(info: MakeCodeProjectInfo): void;
  /**
   * Subscribe to the project facts published by the peer, each reading
   * delivered whole. Readings received while no listener is attached are
   * replayed to the next listener that attaches. Returns an unsubscribe
   * function.
   */
  onProjectInfo(listener: (info: MakeCodeProjectInfo) => void): () => void;
  /**
   * Ask the peer serving the project for the brains the project holds.
   * Resolves with the peer's list; rejects with a `MakeCodeBrainsError`
   * carrying the code of the peer's error reply, or `CLOSED` when the
   * session is disposed before the reply arrives. A peer that does not
   * answer leaves the request pending until the session is disposed.
   */
  listBrains(): Promise<MakeCodeBrainSummary[]>;
  /**
   * Ask the peer serving the project for the full brains `ids` names.
   * Resolves with the requested brains the project holds, in request order,
   * each compiled program decoded to bytes; rejects as {@link listBrains}
   * does.
   *
   * @param ids - Document ids of the brains to return.
   */
  pullBrains(ids: readonly string[]): Promise<MakeCodeBrain[]>;
  /**
   * Ask the peer serving the project to apply `push` to the project's
   * brains. Resolves once the peer acknowledges it; rejects as
   * {@link listBrains} does.
   *
   * @param push - The change to apply.
   */
  pushBrain(push: MakeCodeBrainPush): Promise<void>;
  /**
   * Subscribe to the brains requests the peer sends, for the party serving
   * the project to answer: each is delivered once per listener with the
   * senders of its answer, which reaches the peer carrying the request's
   * `id`. Requests received while no listener is attached are replayed to
   * the next listener that attaches. Returns an unsubscribe function.
   */
  onBrainsRequest(listener: (request: MakeCodeBrainsRequest) => void): () => void;
  /**
   * Ask the peer serving the project for the project's manifest. Resolves
   * with what the peer read of it; rejects with a `MakeCodeManifestError`
   * carrying the code of the peer's error reply, or `CLOSED` when the session
   * is disposed before the reply arrives. A peer that does not answer leaves
   * the request pending until the session is disposed.
   */
  readManifest(): Promise<MakeCodeManifestReading>;
  /**
   * Ask the peer serving the project to replace the project's manifest with
   * `manifest`. Resolves once the peer acknowledges it; rejects as
   * {@link readManifest} does.
   *
   * @param manifest - The editor's whole allocation.
   */
  writeManifest(manifest: MakeCodeIdManifest): Promise<void>;
  /**
   * Subscribe to the manifest requests the peer sends, for the party serving
   * the project to answer, delivered as {@link onBrainsRequest} delivers
   * brains requests. Returns an unsubscribe function.
   */
  onManifestRequest(listener: (request: MakeCodeManifestRequest) => void): () => void;
  /**
   * Detach from the port. Every brains and manifest request still awaiting
   * its reply rejects with its family's `CLOSED`, as does every request made
   * afterwards; an answer to a request from the peer is no longer sent.
   */
  dispose(): void;
}

/**
 * Open a makecode session over `port`: sends this side's hello, declaring
 * `target` when one is given, and waits for the peer's. A peer declaring any
 * version up to {@link MAKECODE_SESSION_PROTOCOL_VERSION} is accepted, and
 * its version and declared target are recorded on the session. Rejects with `PeerSessionError` carrying
 * `PROTOCOL_VERSION_NEWER` when the peer declares a newer version. A
 * session covers one connection of the peer; open a new session when the
 * peer reconnects.
 */
export async function connectMakeCodeSession(options: MakeCodeSessionOptions): Promise<MakeCodeSession> {
  const { port, target } = options;
  const session = await connectPeerSession<"makecode", SessionTraffic, MakeCodeSessionDeclaration>({
    kind: MAKECODE_SESSION_KIND,
    port,
    declaration: target === undefined ? undefined : { target },
  });
  return new EstablishedSession(session);
}

/** The messages of a makecode session other than its hello. */
type SessionTraffic = Exclude<MakeCodeSessionMessage, MakeCodeHelloMessage>;

/** Every reply a request this session sent can be answered by. */
type RequestReplyMessage = MakeCodeBrainsReplyMessage | MakeCodeManifestReplyMessage;

/** The error reply types, one per request family. */
type ErrorReplyType = "makecode:brainsError" | "makecode:manifestError";

/** A brains or manifest request awaiting its reply. */
interface PendingRequest {
  /** Type of the reply that answers the request, beside an error reply. */
  readonly replyType: Exclude<RequestReplyMessage["type"], ErrorReplyType>;
  /** Type of the error reply of the request's family. */
  readonly errorType: ErrorReplyType;
  resolve(reply: RequestReplyMessage): void;
  reject(error: Error): void;
}

class EstablishedSession implements MakeCodeSession {
  readonly peerProtocolVersion: number;
  readonly peerTarget: string | undefined;
  private readonly _session: PeerSession<SessionTraffic, MakeCodeSessionDeclaration>;
  private readonly _unsubscribe: () => void;
  private readonly _catalogListeners = new Set<(content: string) => void>();
  /** Catalogs received while no catalog listener was attached, in arrival order. */
  private readonly _bufferedCatalogs: string[] = [];
  private readonly _assetsListeners = new Set<(assets: MakeCodeAsset[]) => void>();
  /** Asset snapshots received while no assets listener was attached, in arrival order. */
  private readonly _bufferedAssets: MakeCodeAsset[][] = [];
  private readonly _projectInfoListeners = new Set<(info: MakeCodeProjectInfo) => void>();
  /** Project facts received while no project-info listener was attached, in arrival order. */
  private readonly _bufferedProjectInfo: MakeCodeProjectInfo[] = [];
  private readonly _pending = new Map<string, PendingRequest>();
  private readonly _requestListeners = new Set<(request: MakeCodeBrainsRequest) => void>();
  /** Requests from the peer received while no request listener was attached, in arrival order. */
  private readonly _bufferedRequests: MakeCodeBrainsRequest[] = [];
  private readonly _manifestListeners = new Set<(request: MakeCodeManifestRequest) => void>();
  /** Manifest requests from the peer received while no manifest listener was attached, in arrival order. */
  private readonly _bufferedManifestRequests: MakeCodeManifestRequest[] = [];
  /**
   * Prefix of every request id this session mints, random per session, so a
   * late reply to an earlier session's request on the same connection never
   * matches a request of this one.
   */
  private readonly _requestPrefix = Math.random().toString(36).slice(2, 10);
  private _requestCount = 0;
  private _disposed = false;

  constructor(session: PeerSession<SessionTraffic, MakeCodeSessionDeclaration>) {
    this._session = session;
    this.peerProtocolVersion = session.peerProtocolVersion;
    this.peerTarget = session.peerDeclaration?.target;
    this._unsubscribe = session.onMessage((message) => {
      this.receive(message);
    });
  }

  publishCatalog(content: string): void {
    this._session.postMessage({ type: "makecode:catalog", payload: { content } });
  }

  onCatalog(listener: (content: string) => void): () => void {
    this._catalogListeners.add(listener);
    for (const content of this._bufferedCatalogs.splice(0)) listener(content);
    return () => {
      this._catalogListeners.delete(listener);
    };
  }

  publishAssets(assets: readonly MakeCodeAsset[]): void {
    this._session.postMessage({ type: "makecode:assets", payload: { assets: [...assets] } });
  }

  onAssets(listener: (assets: MakeCodeAsset[]) => void): () => void {
    this._assetsListeners.add(listener);
    for (const assets of this._bufferedAssets.splice(0)) listener(assets);
    return () => {
      this._assetsListeners.delete(listener);
    };
  }

  publishProjectInfo(info: MakeCodeProjectInfo): void {
    this._session.postMessage({ type: "makecode:projectInfo", payload: { ...info } });
  }

  onProjectInfo(listener: (info: MakeCodeProjectInfo) => void): () => void {
    this._projectInfoListeners.add(listener);
    for (const info of this._bufferedProjectInfo.splice(0)) listener(info);
    return () => {
      this._projectInfoListeners.delete(listener);
    };
  }

  async listBrains(): Promise<MakeCodeBrainSummary[]> {
    const reply = await this.request((id) => ({ type: "makecode:brainsList", id }), "makecode:brainsListReply");
    return reply.payload.brains;
  }

  async pullBrains(ids: readonly string[]): Promise<MakeCodeBrain[]> {
    const reply = await this.request(
      (id) => ({ type: "makecode:brainsPull", id, payload: { ids: [...ids] } }),
      "makecode:brainsPullReply"
    );
    return reply.payload.brains.map(brainFromWire);
  }

  async pushBrain(push: MakeCodeBrainPush): Promise<void> {
    await this.request((id) => ({ type: "makecode:brainsPush", id, payload: pushToWire(push) }), "makecode:brainsAck");
  }

  async readManifest(): Promise<MakeCodeManifestReading> {
    const reply = await this.request((id) => ({ type: "makecode:manifestRead", id }), "makecode:manifestReadReply");
    return reply.payload;
  }

  async writeManifest(manifest: MakeCodeIdManifest): Promise<void> {
    await this.request((id) => ({ type: "makecode:manifestWrite", id, payload: { manifest } }), "makecode:manifestAck");
  }

  onManifestRequest(listener: (request: MakeCodeManifestRequest) => void): () => void {
    this._manifestListeners.add(listener);
    for (const request of this._bufferedManifestRequests.splice(0)) listener(request);
    return () => {
      this._manifestListeners.delete(listener);
    };
  }

  onBrainsRequest(listener: (request: MakeCodeBrainsRequest) => void): () => void {
    this._requestListeners.add(listener);
    for (const request of this._bufferedRequests.splice(0)) listener(request);
    return () => {
      this._requestListeners.delete(listener);
    };
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this._unsubscribe();
    this._session.dispose();
    const pending = [...this._pending.values()];
    this._pending.clear();
    for (const request of pending) {
      request.reject(closedError(request.errorType));
    }
  }

  /**
   * Sends the request `build` makes under a freshly minted id and resolves
   * with the reply of `replyType` carrying that id; rejects on an error reply
   * of the request's family carrying it, and with the family's `CLOSED` once
   * the session is disposed.
   */
  private request<TReply extends PendingRequest["replyType"]>(
    build: (id: string) => MakeCodeBrainsRequestMessage | MakeCodeManifestRequestMessage,
    replyType: TReply
  ): Promise<Extract<RequestReplyMessage, { type: TReply }>> {
    const errorType: ErrorReplyType = replyType.startsWith("makecode:manifest")
      ? "makecode:manifestError"
      : "makecode:brainsError";
    if (this._disposed) return Promise.reject(closedError(errorType));
    const id = `${this._requestPrefix}-${++this._requestCount}`;
    return new Promise((resolve, reject) => {
      this._pending.set(id, {
        replyType,
        errorType,
        resolve: (reply) => {
          resolve(reply as Extract<RequestReplyMessage, { type: TReply }>);
        },
        reject,
      });
      this._session.postMessage(build(id));
    });
  }

  /**
   * Routes one message from the peer: catalogs, asset snapshots and project
   * facts to their listeners, brains and manifest requests to their
   * family's request listeners, replies to their requests; drops the rest.
   */
  private receive(message: SessionTraffic): void {
    if (message.type === "makecode:catalog") {
      const { content } = message.payload;
      if (this._catalogListeners.size === 0) {
        this._bufferedCatalogs.push(content);
        return;
      }
      for (const listener of this._catalogListeners) listener(content);
      return;
    }
    if (message.type === "makecode:assets") {
      const { assets } = message.payload;
      if (this._assetsListeners.size === 0) {
        this._bufferedAssets.push(assets);
        return;
      }
      for (const listener of this._assetsListeners) listener(assets);
      return;
    }
    if (message.type === "makecode:projectInfo") {
      const info = message.payload;
      if (this._projectInfoListeners.size === 0) {
        this._bufferedProjectInfo.push(info);
        return;
      }
      for (const listener of this._projectInfoListeners) listener(info);
      return;
    }
    if (
      message.type === "makecode:brainsList" ||
      message.type === "makecode:brainsPull" ||
      message.type === "makecode:brainsPush"
    ) {
      const request = this.incoming(message);
      if (this._requestListeners.size === 0) {
        this._bufferedRequests.push(request);
        return;
      }
      for (const listener of this._requestListeners) listener(request);
      return;
    }
    if (message.type === "makecode:manifestRead" || message.type === "makecode:manifestWrite") {
      const request = this.incomingManifest(message);
      if (this._manifestListeners.size === 0) {
        this._bufferedManifestRequests.push(request);
        return;
      }
      for (const listener of this._manifestListeners) listener(request);
      return;
    }
    const pending = typeof message.id === "string" ? this._pending.get(message.id) : undefined;
    if (pending === undefined) return;
    if (message.type === "makecode:brainsError" && pending.errorType === message.type) {
      this._pending.delete(message.id);
      pending.reject(new MakeCodeBrainsError(message.payload.code, message.payload.message));
      return;
    }
    if (message.type === "makecode:manifestError" && pending.errorType === message.type) {
      this._pending.delete(message.id);
      pending.reject(new MakeCodeManifestError(message.payload.code, message.payload.message));
      return;
    }
    if (message.type !== pending.replyType) return;
    this._pending.delete(message.id);
    pending.resolve(message);
  }

  /**
   * The request `message` from the peer carries, whose first answer is sent
   * to the peer carrying the message's `id` unless this session is disposed.
   */
  private incoming(message: MakeCodeBrainsRequestMessage): MakeCodeBrainsRequest {
    const { id } = message;
    let answered = false;
    const answer = (reply: MakeCodeBrainsReplyMessage): void => {
      if (answered || this._disposed) return;
      answered = true;
      this._session.postMessage(reply);
    };
    const failWith =
      (code: MakeCodeBrainsErrorPayload["code"]) =>
      (text: string): void => {
        answer({ type: "makecode:brainsError", id, payload: { code, message: text } });
      };
    switch (message.type) {
      case "makecode:brainsList":
        return {
          kind: "list",
          reply: (brains) => {
            answer({ type: "makecode:brainsListReply", id, payload: { brains: [...brains] } });
          },
          fail: failWith(MakeCodeBrainsErrorCode.READ_FAILED),
        };
      case "makecode:brainsPull":
        return {
          kind: "pull",
          ids: message.payload.ids,
          reply: (brains) => {
            answer({ type: "makecode:brainsPullReply", id, payload: { brains: brains.map(brainToWire) } });
          },
          fail: failWith(MakeCodeBrainsErrorCode.READ_FAILED),
        };
      case "makecode:brainsPush":
        return {
          kind: "push",
          push: pushFromWire(message.payload),
          ack: () => {
            answer({ type: "makecode:brainsAck", id });
          },
          fail: failWith(MakeCodeBrainsErrorCode.WRITE_FAILED),
        };
    }
  }

  /**
   * The manifest request `message` from the peer carries, whose first answer
   * is sent to the peer carrying the message's `id` unless this session is
   * disposed.
   */
  private incomingManifest(message: MakeCodeManifestRequestMessage): MakeCodeManifestRequest {
    const { id } = message;
    let answered = false;
    const answer = (reply: MakeCodeManifestReplyMessage): void => {
      if (answered || this._disposed) return;
      answered = true;
      this._session.postMessage(reply);
    };
    const failWith =
      (code: MakeCodeManifestErrorPayload["code"]) =>
      (text: string): void => {
        answer({ type: "makecode:manifestError", id, payload: { code, message: text } });
      };
    switch (message.type) {
      case "makecode:manifestRead":
        return {
          kind: "read",
          reply: (reading) => {
            answer({ type: "makecode:manifestReadReply", id, payload: reading });
          },
          fail: failWith(MakeCodeManifestErrorCode.READ_FAILED),
        };
      case "makecode:manifestWrite":
        return {
          kind: "write",
          manifest: message.payload.manifest,
          ack: () => {
            answer({ type: "makecode:manifestAck", id });
          },
          fail: failWith(MakeCodeManifestErrorCode.WRITE_FAILED),
        };
    }
  }
}

/** The rejection of a request of the family answered by `errorType` whose session was disposed before its reply. */
function closedError(errorType: ErrorReplyType): Error {
  return errorType === "makecode:manifestError"
    ? new MakeCodeManifestError(
        MakeCodeManifestErrorCode.CLOSED,
        "The makecode session ended before the manifest request was answered."
      )
    : new MakeCodeBrainsError(
        MakeCodeBrainsErrorCode.CLOSED,
        "The makecode session ended before the brains request was answered."
      );
}

/** `brain` as the program-as-bytes API carries it, its compiled program decoded from base64. */
function brainFromWire(brain: MakeCodeWireBrain): MakeCodeBrain {
  const { compiled, ...rest } = brain;
  return compiled === undefined
    ? rest
    : { ...rest, compiled: { bytecode: base64ToBytes(compiled.bytecode), sourceHash: compiled.sourceHash } };
}

/** `brain` as the wire carries it, its compiled program encoded as base64. */
function brainToWire(brain: MakeCodeBrain): MakeCodeWireBrain {
  const { compiled, ...rest } = brain;
  return compiled === undefined
    ? rest
    : { ...rest, compiled: { bytecode: bytesToBase64(compiled.bytecode), sourceHash: compiled.sourceHash } };
}

/** `push` as the wire carries it, a written brain's compiled program encoded as base64. */
function pushToWire(push: MakeCodeBrainPush): MakeCodeWireBrainPush {
  return push.op === "remove"
    ? { op: "remove", brainId: push.brainId }
    : { op: "write", brain: brainToWire(push.brain) };
}

/** `push` as the program-as-bytes API carries it, a written brain's compiled program decoded from base64. */
function pushFromWire(push: MakeCodeWireBrainPush): MakeCodeBrainPush {
  return push.op === "remove"
    ? { op: "remove", brainId: push.brainId }
    : { op: "write", brain: brainFromWire(push.brain) };
}
