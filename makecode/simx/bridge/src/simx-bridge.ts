import { ProjectSession } from "@wendoo/bridge-client";
import type { WsMessage } from "@wendoo/bridge-protocol";
import type { MakeCodeSession, MakeCodeSessionMessage, MakeCodeSessionPort } from "@wendoo/makecode-session";
import { connectMakeCodeSession, MAKECODE_SESSION_ROLE_PATHS } from "@wendoo/makecode-session";
import { connectSimChannel, type SimxFrame } from "./sim-channel.js";

/**
 * Default address of the bridge service the simulator extension connects
 * to: a bare host with an optional port, without a scheme.
 */
export const DEFAULT_MAKECODE_BRIDGE_URL = "makecode-bridge.playwendoo.com";

/** Options for {@link startSimxBridge}. */
export interface SimxBridgeOptions {
  /** The window the simulator extension runs in. */
  frame: SimxFrame;
  /** Address of the bridge service, as a host with an optional port. */
  bridgeUrl: string;
}

/** A running simulator extension bridge. */
export interface SimxBridge {
  /** Close the bridge connection and stop listening to the program. */
  dispose(): void;
}

/**
 * The makecode session with the counterpart the bridge service has just
 * welcomed this connection to. It sends this side's hello at once and
 * publishes the latest catalog once the counterpart's hello establishes it.
 */
class CounterpartSession {
  private readonly _unsubscribes = new Set<() => void>();
  private _session: MakeCodeSession | undefined;

  /**
   * @param relay - The bridge connection, just welcomed.
   * @param latestCatalog - The latest catalog the program posted, if any.
   */
  constructor(relay: ProjectSession<WsMessage, WsMessage>, latestCatalog: () => string | undefined) {
    const port: MakeCodeSessionPort = {
      postMessage(message) {
        relay.sendPayload(message);
      },
      onMessage: (listener) => {
        const unsubscribe = relay.onPayload((message) => {
          listener(message as MakeCodeSessionMessage);
        });
        this._unsubscribes.add(unsubscribe);
        return () => {
          this._unsubscribes.delete(unsubscribe);
          unsubscribe();
        };
      },
    };
    connectMakeCodeSession({ port }).then(
      (session) => {
        this._session = session;
        const catalog = latestCatalog();
        if (catalog !== undefined) {
          session.publishCatalog(catalog);
        }
      },
      () => {
        // The counterpart declared a newer protocol version; no session until the next welcome.
      }
    );
  }

  /** Publish `catalog` to the peer, once the session is established. */
  publish(catalog: string): void {
    this._session?.publishCatalog(catalog);
  }

  /** Detach from the connection, whether or not the session was established. */
  close(): void {
    this._session?.dispose();
    for (const unsubscribe of this._unsubscribes) {
      unsubscribe();
    }
    this._unsubscribes.clear();
  }
}

/**
 * Join the MakeCode program running beside this simulator extension to the
 * Wendoo editor. Connects to the bridge service at the makecode session's
 * simx role path and asks the program for its catalog. Every welcome the
 * bridge service sends -- when the editor first pairs, and again whenever
 * either side reconnects -- opens a new makecode session with the counterpart
 * and disposes the previous one; a connection that closes disposes its
 * session. The latest catalog the program posted is published into each
 * session once it is established, and every later catalog into the current
 * one. When the bridge service reports that another connection has replaced
 * this one, the bridge stays disconnected.
 */
export function startSimxBridge(options: SimxBridgeOptions): SimxBridge {
  const channel = connectSimChannel(options.frame);
  const relay = new ProjectSession<WsMessage, WsMessage>(MAKECODE_SESSION_ROLE_PATHS.simx, options.bridgeUrl, {});
  let catalog: string | undefined;
  let counterpart: CounterpartSession | undefined;

  const unsubscribeWelcome = relay.on("session:welcome", () => {
    counterpart?.close();
    counterpart = new CounterpartSession(relay, () => catalog);
  });
  const unsubscribeStatus = relay.addEventListener("status", (status) => {
    if (status === "connected") return;
    counterpart?.close();
    counterpart = undefined;
  });
  const unsubscribeCatalog = channel.onCatalog((posted) => {
    catalog = posted;
    counterpart?.publish(posted);
  });

  relay.start();
  channel.requestCatalog();

  return {
    dispose() {
      unsubscribeWelcome();
      unsubscribeStatus();
      unsubscribeCatalog();
      counterpart?.close();
      counterpart = undefined;
      relay.stop();
      channel.dispose();
    },
  };
}
