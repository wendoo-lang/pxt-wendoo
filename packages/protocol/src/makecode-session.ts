import type { PeerSessionHelloMessage, PeerSessionKind, PeerSessionPort } from "@wendoo/bridge-app/peer-session";
import { connectPeerSession } from "@wendoo/bridge-app/peer-session";

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
 * First message each party sends to open a makecode session, declaring the
 * version it speaks. Neither party sends any other message before it has
 * received the peer's hello.
 */
export type MakeCodeHelloMessage = PeerSessionHelloMessage<"makecode">;

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

/** Messages either party of a makecode session sends to the other. */
export type MakeCodeSessionMessage = MakeCodeHelloMessage | MakeCodeCatalogMessage;

/**
 * Transport carrying makecode-session messages between this party and its
 * peer. Message order is preserved in both directions.
 */
export type MakeCodeSessionPort = PeerSessionPort<MakeCodeSessionMessage>;

/** Options for {@link connectMakeCodeSession}. */
export interface MakeCodeSessionOptions {
  /** Transport to the peer. */
  port: MakeCodeSessionPort;
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
  /** Publish the serialized tile catalog to the peer, verbatim. */
  publishCatalog(content: string): void;
  /**
   * Subscribe to catalogs published by the peer, each delivered as the
   * verbatim serialized text. Catalogs received while no listener is attached
   * are replayed to the next listener that attaches. Returns an unsubscribe
   * function.
   */
  onCatalog(listener: (content: string) => void): () => void;
  /** Detach from the port. */
  dispose(): void;
}

/**
 * Open a makecode session over `port`: sends this side's hello and waits for
 * the peer's. A peer declaring any version up to
 * {@link MAKECODE_SESSION_PROTOCOL_VERSION} is accepted and its version
 * recorded on the session. Rejects with `PeerSessionError` carrying
 * `PROTOCOL_VERSION_NEWER` when the peer declares a newer version. A
 * session covers one connection of the peer; open a new session when the
 * peer reconnects.
 */
export async function connectMakeCodeSession(options: MakeCodeSessionOptions): Promise<MakeCodeSession> {
  const session = await connectPeerSession<"makecode", MakeCodeCatalogMessage>({
    kind: MAKECODE_SESSION_KIND,
    port: options.port,
  });
  return {
    peerProtocolVersion: session.peerProtocolVersion,
    publishCatalog(content: string): void {
      session.postMessage({ type: "makecode:catalog", payload: { content } });
    },
    onCatalog(listener: (content: string) => void): () => void {
      return session.onMessage((message) => {
        listener(message.payload.content);
      });
    },
    dispose(): void {
      session.dispose();
    },
  };
}
