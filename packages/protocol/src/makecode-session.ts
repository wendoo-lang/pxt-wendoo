import type {
  PeerSession,
  PeerSessionHelloMessage,
  PeerSessionKind,
  PeerSessionPort,
} from "@wendoo/bridge-app/peer-session";
import { connectPeerSession } from "@wendoo/bridge-app/peer-session";
import type { MakeCodeAsset, MakeCodeAssetsMessage } from "./makecode-assets.js";
import type {
  MakeCodeBrainOpenMessage,
  MakeCodeBrainSummary,
  MakeCodeBrainsErrorPayload,
  MakeCodeBrainsMessage,
  MakeCodeBrainsReplyMessage,
  MakeCodeBrainsRequest,
  MakeCodeBrainsRequestMessage,
  MakeCodeWireBrain,
  MakeCodeWireBrainPush,
  MakeCodeWireCompileOutcome,
} from "./makecode-brains.js";
import { MakeCodeBrainsError, MakeCodeBrainsErrorCode } from "./makecode-brains.js";
import type { MakeCodeManifestMessage, MakeCodeManifestReading } from "./makecode-manifest.js";
import type { MakeCodeProjectInfo, MakeCodeProjectInfoMessage } from "./makecode-project-info.js";

/** Newest version of the makecode-session protocol this build speaks. */
export const MAKECODE_SESSION_PROTOCOL_VERSION = 2;

/** The makecode session kind: its name, which prefixes its message types, and its version. */
const MAKECODE_SESSION_KIND: PeerSessionKind<"makecode"> = {
  kind: "makecode",
  protocolVersion: MAKECODE_SESSION_PROTOCOL_VERSION,
};

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
 * Liveness probe either party of an established makecode session may send.
 * The peer answers it with a {@link MakeCodePongMessage} carrying the same
 * `id`.
 */
export interface MakeCodePingMessage {
  type: "makecode:ping";
  /** The probe's id, minted by its sender and carried back by the answer. */
  id: string;
}

/** Answer to a {@link MakeCodePingMessage}, carrying the ping's `id`. */
export interface MakeCodePongMessage {
  type: "makecode:pong";
  /** The `id` of the ping this answers. */
  id: string;
}

/**
 * Messages either party of a makecode session sends to the other. Every
 * message type is named `makecode:<name>`, and under one
 * {@link MAKECODE_SESSION_PROTOCOL_VERSION} the set only grows: a party
 * ignores every message whose type it does not know.
 */
export type MakeCodeSessionMessage =
  | MakeCodeHelloMessage
  | MakeCodeCatalogMessage
  | MakeCodeManifestMessage
  | MakeCodeAssetsMessage
  | MakeCodeProjectInfoMessage
  | MakeCodeBrainsMessage
  | MakeCodeBrainOpenMessage
  | MakeCodeBrainsRequestMessage
  | MakeCodeBrainsReplyMessage
  | MakeCodePingMessage
  | MakeCodePongMessage;

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
  /** Publish the project's id manifest to the peer, whole. */
  publishManifest(reading: MakeCodeManifestReading): void;
  /**
   * Subscribe to the id manifests published by the peer, each delivered
   * whole. Manifests received while no listener is attached are replayed to
   * the next listener that attaches. Returns an unsubscribe function.
   */
  onManifest(listener: (reading: MakeCodeManifestReading) => void): () => void;
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
  /** Publish the project's brains to the peer, whole. */
  publishBrains(brains: readonly MakeCodeBrainSummary[]): void;
  /**
   * Subscribe to the project's brains published by the peer, each
   * publication delivered whole. Publications received while no listener is
   * attached are replayed to the next listener that attaches. Returns an
   * unsubscribe function.
   */
  onBrains(listener: (brains: MakeCodeBrainSummary[]) => void): () => void;
  /** Ask the peer's editor to open the brain `id` for editing. */
  publishBrainOpen(id: string): void;
  /**
   * Subscribe to the brains the peer asks this side's editor to open, each
   * delivered by its document id. Asks received while no listener is
   * attached are replayed to the next listener that attaches. Returns an
   * unsubscribe function.
   */
  onBrainOpen(listener: (id: string) => void): () => void;
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
   * Resolves with the requested brains the project holds, in request order;
   * rejects as {@link listBrains} does.
   *
   * @param ids - Document ids of the brains to return.
   */
  pullBrains(ids: readonly string[]): Promise<MakeCodeWireBrain[]>;
  /**
   * Ask the peer serving the project to apply `push` to the project's
   * brains. Resolves once the peer has applied it, with a write's compile
   * outcome or `null` for a removal; rejects as {@link listBrains} does.
   *
   * @param push - The change to apply.
   */
  pushBrain(push: MakeCodeWireBrainPush): Promise<MakeCodeWireCompileOutcome | null>;
  /**
   * Ask the peer serving the project to create an empty brain named `name`.
   * Resolves once the brain's source is in the project, with the brain as
   * the project holds it; rejects as {@link listBrains} does.
   *
   * @param name - Display name of the brain; any text, including empty.
   */
  createBrain(name: string): Promise<MakeCodeBrainSummary>;
  /**
   * Ask the peer serving the project to open the brain `id` in the tab of
   * its origin, or in this side's tab for a brain with none. Resolves once
   * the peer has acknowledged it; rejects as {@link listBrains} does,
   * `UNKNOWN_BRAIN` and `ORIGIN_ABSENT` among the codes.
   *
   * @param id - Document id of the brain to open.
   */
  openBrain(id: string): Promise<void>;
  /**
   * Subscribe to the brains requests the peer sends, for the party serving
   * the project to answer: each is delivered once per listener with the
   * senders of its answer, which reaches the peer carrying the request's
   * `id`. Requests received while no listener is attached are replayed to
   * the next listener that attaches. Returns an unsubscribe function.
   */
  onBrainsRequest(listener: (request: MakeCodeBrainsRequest) => void): () => void;
  /**
   * Probe the peer's liveness: sends a `makecode:ping` under a freshly
   * minted id and resolves once the peer's `makecode:pong` carrying that id
   * arrives. The session sets no deadline: a peer that does not answer
   * leaves the ping pending, so race it against a deadline of your own. A
   * ping pending when the session is disposed, and one made afterwards,
   * never settles.
   */
  ping(): Promise<void>;
  /**
   * Detach from the port. Every brains request still awaiting its reply
   * rejects with `CLOSED`, as does every request made afterwards; an answer
   * to a request from the peer is no longer sent, nor is the answer to a
   * ping. Pings still awaiting their answer are dropped unsettled.
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
 * peer reconnects. Until it is disposed, the session answers every
 * `makecode:ping` the peer sends with the `makecode:pong` carrying its id.
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

/** A brains request awaiting its reply. */
interface PendingRequest {
  /** Type of the reply that answers the request, beside an error reply. */
  readonly replyType: Exclude<MakeCodeBrainsReplyMessage["type"], "makecode:brainsError">;
  resolve(reply: MakeCodeBrainsReplyMessage): void;
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
  private readonly _manifestListeners = new Set<(reading: MakeCodeManifestReading) => void>();
  /** Manifests received while no manifest listener was attached, in arrival order. */
  private readonly _bufferedManifests: MakeCodeManifestReading[] = [];
  private readonly _assetsListeners = new Set<(assets: MakeCodeAsset[]) => void>();
  /** Asset snapshots received while no assets listener was attached, in arrival order. */
  private readonly _bufferedAssets: MakeCodeAsset[][] = [];
  private readonly _projectInfoListeners = new Set<(info: MakeCodeProjectInfo) => void>();
  /** Project facts received while no project-info listener was attached, in arrival order. */
  private readonly _bufferedProjectInfo: MakeCodeProjectInfo[] = [];
  private readonly _brainsListeners = new Set<(brains: MakeCodeBrainSummary[]) => void>();
  /** Brains publications received while no brains listener was attached, in arrival order. */
  private readonly _bufferedBrains: MakeCodeBrainSummary[][] = [];
  private readonly _brainOpenListeners = new Set<(id: string) => void>();
  /** Ids of the brains asked open while no brain-open listener was attached, in arrival order. */
  private readonly _bufferedBrainOpens: string[] = [];
  private readonly _pending = new Map<string, PendingRequest>();
  /** Resolvers of the pings awaiting their pong, by ping id. */
  private readonly _pings = new Map<string, () => void>();
  private readonly _requestListeners = new Set<(request: MakeCodeBrainsRequest) => void>();
  /** Requests from the peer received while no request listener was attached, in arrival order. */
  private readonly _bufferedRequests: MakeCodeBrainsRequest[] = [];
  /**
   * Prefix of every request and ping id this session mints, random per
   * session, so a late reply to an earlier session's request or ping on the
   * same connection never matches one of this one.
   */
  private readonly _idPrefix = Math.random().toString(36).slice(2, 10);
  private _idCount = 0;
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

  publishManifest(reading: MakeCodeManifestReading): void {
    this._session.postMessage({ type: "makecode:manifest", payload: reading });
  }

  onManifest(listener: (reading: MakeCodeManifestReading) => void): () => void {
    this._manifestListeners.add(listener);
    for (const reading of this._bufferedManifests.splice(0)) listener(reading);
    return () => {
      this._manifestListeners.delete(listener);
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

  publishBrains(brains: readonly MakeCodeBrainSummary[]): void {
    this._session.postMessage({ type: "makecode:brains", payload: { brains: [...brains] } });
  }

  onBrains(listener: (brains: MakeCodeBrainSummary[]) => void): () => void {
    this._brainsListeners.add(listener);
    for (const brains of this._bufferedBrains.splice(0)) listener(brains);
    return () => {
      this._brainsListeners.delete(listener);
    };
  }

  publishBrainOpen(id: string): void {
    this._session.postMessage({ type: "makecode:brainOpen", payload: { id } });
  }

  onBrainOpen(listener: (id: string) => void): () => void {
    this._brainOpenListeners.add(listener);
    for (const id of this._bufferedBrainOpens.splice(0)) listener(id);
    return () => {
      this._brainOpenListeners.delete(listener);
    };
  }

  async listBrains(): Promise<MakeCodeBrainSummary[]> {
    const reply = await this.request((id) => ({ type: "makecode:brainsList", id }), "makecode:brainsListReply");
    return reply.payload.brains;
  }

  async pullBrains(ids: readonly string[]): Promise<MakeCodeWireBrain[]> {
    const reply = await this.request(
      (id) => ({ type: "makecode:brainsPull", id, payload: { ids: [...ids] } }),
      "makecode:brainsPullReply"
    );
    return reply.payload.brains;
  }

  async pushBrain(push: MakeCodeWireBrainPush): Promise<MakeCodeWireCompileOutcome | null> {
    const reply = await this.request(
      (id) => ({ type: "makecode:brainsPush", id, payload: push }),
      "makecode:brainsPushReply"
    );
    return reply.payload;
  }

  async createBrain(name: string): Promise<MakeCodeBrainSummary> {
    const reply = await this.request(
      (id) => ({ type: "makecode:brainsCreate", id, payload: { name } }),
      "makecode:brainsCreateReply"
    );
    return reply.payload.brain;
  }

  async openBrain(id: string): Promise<void> {
    await this.request(
      (requestId) => ({ type: "makecode:brainsOpen", id: requestId, payload: { id } }),
      "makecode:brainsOpenReply"
    );
  }

  onBrainsRequest(listener: (request: MakeCodeBrainsRequest) => void): () => void {
    this._requestListeners.add(listener);
    for (const request of this._bufferedRequests.splice(0)) listener(request);
    return () => {
      this._requestListeners.delete(listener);
    };
  }

  ping(): Promise<void> {
    if (this._disposed) return new Promise(() => {});
    const id = this.mintId();
    return new Promise((resolve) => {
      this._pings.set(id, resolve);
      this._session.postMessage({ type: "makecode:ping", id });
    });
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this._unsubscribe();
    this._session.dispose();
    this._pings.clear();
    const pending = [...this._pending.values()];
    this._pending.clear();
    for (const request of pending) {
      request.reject(closedError());
    }
  }

  /**
   * Sends the request `build` makes under a freshly minted id and resolves
   * with the reply of `replyType` carrying that id; rejects on an error reply
   * carrying it, and with `CLOSED` once the session is disposed.
   */
  private request<TReply extends PendingRequest["replyType"]>(
    build: (id: string) => MakeCodeBrainsRequestMessage,
    replyType: TReply
  ): Promise<Extract<MakeCodeBrainsReplyMessage, { type: TReply }>> {
    if (this._disposed) return Promise.reject(closedError());
    const id = this.mintId();
    return new Promise((resolve, reject) => {
      this._pending.set(id, {
        replyType,
        resolve: (reply) => {
          resolve(reply as Extract<MakeCodeBrainsReplyMessage, { type: TReply }>);
        },
        reject,
      });
      this._session.postMessage(build(id));
    });
  }

  /** A fresh request or ping id: the session's random prefix and a count no earlier id of this session used. */
  private mintId(): string {
    return `${this._idPrefix}-${++this._idCount}`;
  }

  /**
   * Routes one message from the peer: answers a ping with its pong, settles
   * the ping a pong answers, routes catalogs, manifests, asset snapshots,
   * project facts, brains publications and brain opens to their listeners,
   * brains requests to the request listeners, and replies to their
   * requests; drops the rest.
   */
  private receive(message: SessionTraffic): void {
    if (message.type === "makecode:ping") {
      this._session.postMessage({ type: "makecode:pong", id: message.id });
      return;
    }
    if (message.type === "makecode:pong") {
      const answered = this._pings.get(message.id);
      if (answered === undefined) return;
      this._pings.delete(message.id);
      answered();
      return;
    }
    if (message.type === "makecode:catalog") {
      const { content } = message.payload;
      if (this._catalogListeners.size === 0) {
        this._bufferedCatalogs.push(content);
        return;
      }
      for (const listener of this._catalogListeners) listener(content);
      return;
    }
    if (message.type === "makecode:manifest") {
      const reading = message.payload;
      if (this._manifestListeners.size === 0) {
        this._bufferedManifests.push(reading);
        return;
      }
      for (const listener of this._manifestListeners) listener(reading);
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
    if (message.type === "makecode:brains") {
      const { brains } = message.payload;
      if (this._brainsListeners.size === 0) {
        this._bufferedBrains.push(brains);
        return;
      }
      for (const listener of this._brainsListeners) listener(brains);
      return;
    }
    if (message.type === "makecode:brainOpen") {
      const { id } = message.payload;
      if (this._brainOpenListeners.size === 0) {
        this._bufferedBrainOpens.push(id);
        return;
      }
      for (const listener of this._brainOpenListeners) listener(id);
      return;
    }
    if (
      message.type === "makecode:brainsList" ||
      message.type === "makecode:brainsPull" ||
      message.type === "makecode:brainsPush" ||
      message.type === "makecode:brainsCreate" ||
      message.type === "makecode:brainsOpen"
    ) {
      const request = this.incoming(message);
      if (this._requestListeners.size === 0) {
        this._bufferedRequests.push(request);
        return;
      }
      for (const listener of this._requestListeners) listener(request);
      return;
    }
    const pending = typeof message.id === "string" ? this._pending.get(message.id) : undefined;
    if (pending === undefined) return;
    if (message.type === "makecode:brainsError") {
      this._pending.delete(message.id);
      pending.reject(new MakeCodeBrainsError(message.payload.code, message.payload.message));
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
            answer({ type: "makecode:brainsPullReply", id, payload: { brains: [...brains] } });
          },
          fail: failWith(MakeCodeBrainsErrorCode.READ_FAILED),
        };
      case "makecode:brainsPush":
        return {
          kind: "push",
          push: message.payload,
          reply: (outcome) => {
            answer({ type: "makecode:brainsPushReply", id, payload: outcome });
          },
          fail: failWith(MakeCodeBrainsErrorCode.WRITE_FAILED),
          refuse: failWith(MakeCodeBrainsErrorCode.NOT_ORIGIN),
        };
      case "makecode:brainsCreate":
        return {
          kind: "create",
          name: message.payload.name,
          reply: (brain) => {
            answer({ type: "makecode:brainsCreateReply", id, payload: { brain } });
          },
          fail: failWith(MakeCodeBrainsErrorCode.WRITE_FAILED),
        };
      case "makecode:brainsOpen":
        return {
          kind: "open",
          id: message.payload.id,
          reply: () => {
            answer({ type: "makecode:brainsOpenReply", id });
          },
          refuseUnknown: failWith(MakeCodeBrainsErrorCode.UNKNOWN_BRAIN),
          refuseAbsent: failWith(MakeCodeBrainsErrorCode.ORIGIN_ABSENT),
        };
    }
  }
}

/** The rejection of a request whose session was disposed before its reply. */
function closedError(): Error {
  return new MakeCodeBrainsError(
    MakeCodeBrainsErrorCode.CLOSED,
    "The makecode session ended before the brains request was answered."
  );
}
