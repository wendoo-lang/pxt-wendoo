import { ProjectSession } from "@wendoo/bridge-client";
import {
  type AppSessionJoinCodeMessage,
  type AppSessionWelcomeMessage,
  BridgeSessionErrorCode,
  type WsMessage,
} from "@wendoo/bridge-protocol";
import type { MakeCodeSession, MakeCodeSessionMessage, MakeCodeSessionPort } from "@wendoo/makecode-session";
import { connectMakeCodeSession, MAKECODE_SESSION_ROLE_PATHS } from "@wendoo/makecode-session";
import type { BindingTokenStore } from "./binding-token-store.js";
import { connectSimChannel, SIM_CHANNEL_VERSION, SimChannelErrorCode, type SimxFrame } from "./sim-channel.js";

/** Messages the bridge service sends that the simulator extension reads. */
type RelayMessage = AppSessionWelcomeMessage | AppSessionJoinCodeMessage;

/** Where the simulator extension writes its log lines for developers. */
export interface SimxLog {
  info(message: string): void;
  error(message: string): void;
}

/** Options for {@link startSimxBridge}. */
export interface SimxBridgeOptions {
  /** The window the simulator extension runs in. */
  frame: SimxFrame;
  /** Address of the bridge service, as a host with an optional port. */
  bridgeUrl: string;
  /** Keeps the bridge session's binding token across reloads of the frame. */
  tokens: BindingTokenStore;
  /**
   * Receives each join code the bridge service sends for a vacant role, every
   * message from the program that was rejected, by its code, and the code of
   * a failure that stops the bridge connection.
   */
  log: SimxLog;
}

/** A running simulator extension bridge. */
export interface SimxBridge {
  /**
   * The join code the bridge service sent last while the session has a
   * vacant role, or `undefined` before the first and from each welcome --
   * both roles bound, so no code joins the session -- until the next.
   */
  readonly joinCode: string | undefined;
  /**
   * `true` while the bridge service reports the session's counterpart
   * disconnected: from its `session:counterpartAway` until the next welcome
   * or until this side's own connection drops.
   */
  readonly counterpartAway: boolean;
  /** The channel version the program's latest catalog message declared, or `undefined` before the first. */
  readonly channelVersion: number | undefined;
  /** Close the bridge connection and stop listening to the program. */
  dispose(): void;
}

/** What the log says about a message from the program rejected for each code. */
const REJECTION_EXPLANATIONS: Record<SimChannelErrorCode, string> = {
  [SimChannelErrorCode.VERSION_NEWER]: `the program's Wendoo extension speaks a channel version newer than ${SIM_CHANNEL_VERSION}; update this simulator extension to read its catalog.`,
  [SimChannelErrorCode.FRAME_MALFORMED]:
    "a message from the program declares no channel version; its catalog was not read.",
};

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
  constructor(relay: ProjectSession<WsMessage, RelayMessage>, latestCatalog: () => string | undefined) {
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
 * simx role path, presenting the binding token `tokens` holds, and asks the
 * program for its catalog. Every welcome the bridge service sends -- when the
 * editor first pairs, and again whenever either side reconnects -- opens a
 * new makecode session with the counterpart and disposes the previous one,
 * and its binding token is saved to `tokens`; a connection that closes
 * disposes its session. The latest catalog the program posted is published
 * into each session once it is established, and every later catalog into the
 * current one. A rejected message from the program is logged by its code and
 * discards the latest catalog, so no session receives a catalog older than
 * the program's newest. When the bridge service reports a failure that
 * stops the connection -- another connection replacing this one, or the
 * session ending -- the code is logged and the bridge stays disconnected; an
 * ended session's binding token is cleared from `tokens`, so the next start
 * forms a new session.
 */
export function startSimxBridge(options: SimxBridgeOptions): SimxBridge {
  const { tokens, log } = options;
  const channel = connectSimChannel(options.frame);
  const relay = new ProjectSession<WsMessage, RelayMessage>(MAKECODE_SESSION_ROLE_PATHS.simx, options.bridgeUrl, {
    bindingToken: tokens.load(),
  });
  let catalog: string | undefined;
  let counterpart: CounterpartSession | undefined;
  let joinCode: string | undefined;
  let counterpartAway = false;
  let channelVersion: number | undefined;

  const adoptJoinCode = (received: string): void => {
    if (received === joinCode) return;
    joinCode = received;
    log.info(`Wendoo join code: ${received}`);
  };

  const unsubscribes = [
    relay.on("session:welcome", (message) => {
      const { bindingToken } = message.payload;
      joinCode = undefined;
      if (bindingToken !== undefined && bindingToken !== tokens.load()) {
        tokens.save(bindingToken);
      }
      counterpartAway = false;
      counterpart?.close();
      counterpart = new CounterpartSession(relay, () => catalog);
    }),
    relay.on("session:joinCode", (message) => {
      adoptJoinCode(message.payload.joinCode);
    }),
    relay.addEventListener("counterpartAway", () => {
      counterpartAway = true;
    }),
    relay.addEventListener("error", (code) => {
      if (code === BridgeSessionErrorCode.SESSION_ENDED) tokens.clear();
      log.error(`${code}: the bridge connection stopped and reconnects when the simulator restarts.`);
    }),
    relay.addEventListener("status", (status) => {
      if (status === "connected") return;
      counterpartAway = false;
      counterpart?.close();
      counterpart = undefined;
    }),
    channel.onCatalog((posted, version) => {
      catalog = posted;
      channelVersion = version;
      counterpart?.publish(posted);
    }),
    channel.onRejected((code) => {
      catalog = undefined;
      log.error(`${code}: ${REJECTION_EXPLANATIONS[code]}`);
    }),
  ];

  relay.start();
  channel.requestCatalog();

  return {
    get joinCode() {
      return joinCode;
    },
    get counterpartAway() {
      return counterpartAway;
    },
    get channelVersion() {
      return channelVersion;
    },
    dispose() {
      for (const unsubscribe of unsubscribes) {
        unsubscribe();
      }
      counterpart?.close();
      counterpart = undefined;
      relay.stop();
      channel.dispose();
    },
  };
}
