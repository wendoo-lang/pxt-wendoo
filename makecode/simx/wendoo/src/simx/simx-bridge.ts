import { type ConnectionStatus, ProjectSession } from "@wendoo/bridge-client";
import {
  BridgeSessionErrorCode,
  PeerSessionErrorCode,
  type SessionJoinCodeMessage,
  type SessionWelcomeMessage,
  type WsMessage,
} from "@wendoo/bridge-protocol";
import type {
  MakeCodeAsset,
  MakeCodeBrainsRequest,
  MakeCodeManifestRequest,
  MakeCodeMessagePort,
  MakeCodeSession,
  MakeCodeSessionMessage,
  MakeCodeSessionPort,
} from "@wendoo/makecode-session";
import { connectMakeCodeSession, MAKECODE_SESSION_ROLE_PATHS, messagePortSessionPort } from "@wendoo/makecode-session";
import { SIMXEDITOR_PORT_MESSAGE_TYPE } from "../vendor/simxeditor.js";
import type { BindingTokenStore } from "./binding-token-store.js";
import { BrainsProject, type ProjectFiles } from "./brains-project.js";
import { enrichCatalogIcons } from "./catalog-icons.js";
import { LivePrograms } from "./live-programs.js";
import { ManifestProject } from "./manifest-project.js";
import { ProjectAssets, type ProjectAssetsProvider } from "./project-assets.js";
import { connectSimChannel, SIM_CHANNEL_VERSION, SimChannelErrorCode, type SimxFrame } from "./sim-channel.js";

/** Messages the bridge service sends that the simulator extension reads. */
type RelayMessage = SessionWelcomeMessage | SessionJoinCodeMessage;

/**
 * Stable code of a failure the simulator extension bridge reports: one that
 * stopped the bridge connection, or `PeerSessionErrorCode.PROTOCOL_VERSION_NEWER`
 * when the counterpart's makecode hello declared a protocol version newer than
 * this simulator extension speaks.
 */
export type SimxBridgeErrorCode = BridgeSessionErrorCode | PeerSessionErrorCode;

/** Where the simulator extension writes its log lines for developers. */
export interface SimxLog {
  info(message: string): void;
  error(message: string): void;
}

/** What a simulator extension serves the MakeCode project to the editor from, and where it logs what goes wrong. */
export interface SimxServingOptions {
  /** The window the simulator extension runs in. */
  frame: SimxFrame;
  /**
   * The MakeCode project's files in this simulator extension's folder, which
   * the editor's brains and manifest requests are answered from and written
   * to.
   */
  files: ProjectFiles;
  /**
   * The editor's asset provider, which the MakeCode project's images,
   * palette and name are listed from for the asset snapshot, the catalog's
   * icons and the project info.
   */
  assets: ProjectAssetsProvider;
  /**
   * The simulator message channel the program's messages arrive on, as
   * MakeCode names it in the frame URL's `channel` parameter. Defaults to
   * `SIMX_CHANNEL`.
   */
  channel?: string;
  /**
   * Receives every message from the program that was rejected, by its code,
   * the code of a counterpart's rejected makecode hello, the code of every
   * request the asset provider fails, and the code of every image or icon
   * that cannot be rendered in full.
   */
  log: SimxLog;
  /**
   * Id of the MakeCode target running the program, for example `microbit`
   * or `arcade`, declared to the editor in each makecode session's hello.
   * Informational, for display and theming. When omitted, no target is
   * declared.
   */
  target?: string;
}

/** Options for {@link startSimxBridge}. */
export interface SimxBridgeOptions extends SimxServingOptions {
  /** Address of the bridge service, as a host with an optional port. */
  bridgeUrl: string;
  /** Keeps the bridge session's binding token across reloads of the frame. */
  tokens: BindingTokenStore;
  /**
   * Receives what {@link SimxServingOptions.log} receives, and each join
   * code the bridge service sends for a vacant role and the code of a
   * failure that stops the bridge connection.
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
  /**
   * `true` while the counterpart is connected to the session: from each
   * welcome until the bridge service reports the counterpart away or this
   * side's own connection drops.
   */
  readonly counterpartConnected: boolean;
  /**
   * `true` while this side holds a binding token: from its first welcome, or
   * from the start when the token store held one, until the session is
   * ended. A bound session whose counterpart is not connected is waiting for
   * that counterpart to return by its own token.
   */
  readonly bound: boolean;
  /** The status of the bridge connection, as the bridge client reports it. */
  readonly connection: ConnectionStatus;
  /**
   * The code of the failure that stopped the bridge connection, or of the
   * counterpart's makecode hello declaring a newer protocol version, or
   * `undefined` while neither applies. A stopped connection's code stays
   * until {@link startNewSession}; a rejected hello's code stays until a
   * later makecode handshake completes.
   */
  readonly errorCode: SimxBridgeErrorCode | undefined;
  /** The channel version the program's latest catalog message declared, or `undefined` before the first. */
  readonly channelVersion: number | undefined;
  /**
   * Subscribe to changes of {@link joinCode}, {@link counterpartAway},
   * {@link counterpartConnected}, {@link bound}, {@link connection}, and
   * {@link errorCode}. Returns an unsubscribe function.
   */
  onChange(listener: () => void): () => void;
  /**
   * End the current session and open a new one at once. When the bridge
   * connection is open, sends `session:goodbye`, so the bridge service ends
   * the session and tells a connected counterpart it ended; a connection
   * already stopped sends nothing. Either way the binding token is cleared
   * from the token store and a new connection presenting none opens a new
   * session, whose join code arrives as {@link joinCode}.
   */
  startNewSession(): void;
  /** Close the bridge connection and stop listening to the program. */
  dispose(): void;
}

/** A message event delivered to the window the simulator extension runs in, with the fields the port bridge reads. */
export interface SimxPortFrameEvent {
  readonly data: unknown;
  /** The origin of the window that posted the message. */
  readonly origin: string;
  /** The ports transferred with the message. */
  readonly ports: readonly MakeCodeMessagePort[];
}

/** The window a simulator extension runs in, as {@link startSimxPortBridge} reads its message events. */
export interface SimxPortFrame extends SimxFrame {
  addEventListener(type: "message", listener: (event: SimxPortFrameEvent) => void): void;
  removeEventListener(type: "message", listener: (event: SimxPortFrameEvent) => void): void;
}

/** Options for {@link startSimxPortBridge}. */
export interface SimxPortBridgeOptions extends SimxServingOptions {
  /** The window the simulator extension runs in. */
  frame: SimxPortFrame;
  /**
   * The MakeCode editor's origin, as MakeCode names it in the frame URL's
   * `parentOrigin` parameter. Port messages from any other origin are
   * ignored.
   */
  parentOrigin: string;
}

/** A running simulator extension port bridge. */
export interface SimxPortBridge {
  /** Stop listening for ports and to the program, ending the current port's session. */
  dispose(): void;
}

/** What the log says about a message from the program rejected for each code. */
const REJECTION_EXPLANATIONS: Record<SimChannelErrorCode, string> = {
  [SimChannelErrorCode.VERSION_NEWER]: `the program's Wendoo extension speaks a channel version newer than ${SIM_CHANNEL_VERSION}; update this simulator extension to read its catalog.`,
  [SimChannelErrorCode.FRAME_MALFORMED]:
    "a message from the program declares no channel version; its catalog was not read.",
};

/** Logs `rejection`, the code of a counterpart hello declaring a newer makecode protocol, to `log`. */
function logRejection(log: SimxLog, rejection: PeerSessionErrorCode): void {
  log.error(`${rejection}: the editor speaks a newer makecode protocol; reload the page to update Wendoo.`);
}

/**
 * The makecode session with the counterpart over one port. It sends this
 * side's hello at once and publishes the latest catalog, then the latest
 * asset snapshot, then the project's latest name as its project info, once
 * the counterpart's hello establishes it.
 */
class CounterpartSession {
  private readonly _unsubscribes = new Set<() => void>();
  private _session: MakeCodeSession | undefined;

  /**
   * @param port - The transport to the counterpart.
   * @param target - Id of the MakeCode target to declare in this side's hello, if known.
   * @param latestCatalog - The latest catalog the program posted, as published, if any.
   * @param latestAssets - The latest asset snapshot, if any.
   * @param latestName - The project's latest name, if known.
   * @param serve - Answers each brains request the counterpart sends once the session is established.
   * @param serveManifest - Answers each manifest request the counterpart sends once the session is established.
   * @param settled - Called once the counterpart's hello is read: with
   *   `undefined` when the session is established, or with
   *   `PeerSessionErrorCode.PROTOCOL_VERSION_NEWER` when the hello declared a
   *   newer version and no session was established.
   */
  constructor(
    port: MakeCodeSessionPort,
    target: string | undefined,
    latestCatalog: () => string | undefined,
    latestAssets: () => readonly MakeCodeAsset[] | undefined,
    latestName: () => string | undefined,
    serve: (request: MakeCodeBrainsRequest) => void,
    serveManifest: (request: MakeCodeManifestRequest) => void,
    settled: (rejection: PeerSessionErrorCode | undefined) => void
  ) {
    const tracked: MakeCodeSessionPort = {
      postMessage(message) {
        port.postMessage(message);
      },
      onMessage: (listener) => {
        const unsubscribe = port.onMessage(listener);
        this._unsubscribes.add(unsubscribe);
        return () => {
          this._unsubscribes.delete(unsubscribe);
          unsubscribe();
        };
      },
    };
    connectMakeCodeSession({ port: tracked, target }).then(
      (session) => {
        this._session = session;
        const catalog = latestCatalog();
        if (catalog !== undefined) {
          session.publishCatalog(catalog);
        }
        const snapshot = latestAssets();
        if (snapshot !== undefined) {
          session.publishAssets(snapshot);
        }
        const name = latestName();
        if (name !== undefined) {
          session.publishProjectInfo({ name });
        }
        session.onBrainsRequest(serve);
        session.onManifestRequest(serveManifest);
        settled(undefined);
      },
      () => {
        // No session over this port.
        settled(PeerSessionErrorCode.PROTOCOL_VERSION_NEWER);
      }
    );
  }

  /** Publish `catalog` to the peer, once the session is established. */
  publish(catalog: string): void {
    this._session?.publishCatalog(catalog);
  }

  /** Publish the asset snapshot `snapshot` to the peer, once the session is established. */
  publishAssets(snapshot: readonly MakeCodeAsset[]): void {
    this._session?.publishAssets(snapshot);
  }

  /** Publish the project's `name` to the peer as its project info, once the session is established. */
  publishName(name: string): void {
    this._session?.publishProjectInfo({ name });
  }

  /** Detach from the port, whether or not the session was established. */
  close(): void {
    this._session?.dispose();
    for (const unsubscribe of this._unsubscribes) {
      unsubscribe();
    }
    this._unsubscribes.clear();
  }
}

/** The MakeCode project as the simulator extension serves it to one counterpart session at a time. */
interface ProjectServer {
  /** The channel version the program's latest catalog message declared, or `undefined` before the first. */
  readonly channelVersion: number | undefined;
  /**
   * Open a makecode session with the counterpart over `port`, closing the
   * current one, and report its handshake's outcome to `settled`.
   */
  attach(port: MakeCodeSessionPort, settled: (rejection: PeerSessionErrorCode | undefined) => void): void;
  /** Close the current counterpart session, if any. */
  detach(): void;
  /** Close the current counterpart session and stop listening to the program and the asset provider. */
  dispose(): void;
}

/**
 * Serve the MakeCode project running beside this simulator extension to
 * the counterpart session attached at the time. Each session's brains and
 * manifest requests are answered from the project's `files`, and its pushes
 * and manifest writes are written to them. Each push that changes what a
 * program runs is also posted to the running program as a program update the
 * moment it arrives, without waiting on the project write, and the last
 * update of every program is posted again each time the program starts. The
 * program's messages are read on `channel`, and the program is asked for its
 * catalog at once. The latest catalog the program posted is published into
 * each session once it is established, and every later catalog into the
 * current one, each with its icons rendered as `iconUrl` data URIs under the
 * project's palette; the catalog as posted is kept, and published again
 * re-rendered whenever the palette changes the result. A rejected message
 * from the program is logged by its code and discards the latest catalog, so
 * no session receives a catalog older than the program's newest. The
 * project's asset snapshot, listed from `assets`, is published into each
 * session once it is established, after the catalog, and into the current
 * one whenever it changes; so is the project's name, listed beside it, as
 * the session's project info, after the snapshot.
 */
function startProjectServer(options: SimxServingOptions): ProjectServer {
  const { log } = options;
  const channel = connectSimChannel(options.frame, options.channel);
  const brains = new BrainsProject(options.files, log);
  const live = new LivePrograms((update) => {
    channel.postProgramUpdate(update);
  });
  const serveBrains = (request: MakeCodeBrainsRequest): void => {
    if (request.kind === "push") live.push(request.push);
    brains.serve(request);
  };
  const manifest = new ManifestProject(options.files, log);
  const projectAssets = new ProjectAssets(options.assets, log);
  const serveManifest = (request: MakeCodeManifestRequest): void => {
    manifest.serve(request);
  };
  let catalog: string | undefined;
  // the latest catalog with its icons rendered under the project's palette, as sessions receive it
  let publishedCatalog: string | undefined;
  let counterpart: CounterpartSession | undefined;
  let channelVersion: number | undefined;

  const channelUnsubscribes = [
    channel.onCatalog((posted, version) => {
      catalog = posted;
      channelVersion = version;
      const rendered = enrichCatalogIcons(posted, projectAssets.palette, log);
      publishedCatalog = rendered;
      counterpart?.publish(rendered);
    }),
    channel.onProgramStart(() => {
      live.repost();
    }),
    channel.onRejected((code) => {
      catalog = undefined;
      publishedCatalog = undefined;
      log.error(`${code}: ${REJECTION_EXPLANATIONS[code]}`);
    }),
    projectAssets.onPalette((palette) => {
      if (catalog === undefined) return;
      const rendered = enrichCatalogIcons(catalog, palette, log);
      if (rendered === publishedCatalog) return;
      publishedCatalog = rendered;
      counterpart?.publish(rendered);
    }),
    projectAssets.onSnapshot((snapshot) => {
      counterpart?.publishAssets(snapshot);
    }),
    projectAssets.onName((name) => {
      counterpart?.publishName(name);
    }),
  ];

  const detach = (): void => {
    counterpart?.close();
    counterpart = undefined;
  };

  channel.requestCatalog();

  return {
    get channelVersion() {
      return channelVersion;
    },
    attach(port, settled) {
      counterpart?.close();
      counterpart = new CounterpartSession(
        port,
        options.target,
        () => publishedCatalog,
        () => projectAssets.snapshot,
        () => projectAssets.name,
        serveBrains,
        serveManifest,
        settled
      );
    },
    detach,
    dispose() {
      detach();
      for (const unsubscribe of channelUnsubscribes) {
        unsubscribe();
      }
      projectAssets.dispose();
      channel.dispose();
    },
  };
}

/** The payload messages of the bridge connection `relay` as a makecode-session port. */
function relayPort(relay: ProjectSession<WsMessage, RelayMessage>): MakeCodeSessionPort {
  return {
    postMessage(message) {
      relay.sendPayload(message);
    },
    onMessage(listener) {
      return relay.onPayload((message) => {
        listener(message as MakeCodeSessionMessage);
      });
    },
  };
}

/**
 * Join the MakeCode program running beside this simulator extension to the
 * Wendoo editor through the bridge service. Connects to the bridge service at
 * the makecode session's simx role path, presenting the binding token
 * `tokens` holds, and asks the program for its catalog. The current
 * session's brains and manifest requests are answered from `files`, and its
 * pushes and manifest writes are written to them; each push that changes
 * what a program runs is posted to the running program at once, and the last
 * update of every program is posted again each time the program starts. The
 * program's latest catalog, its icons rendered under the project's palette,
 * then the latest asset snapshot, then the project's name are published into
 * each session once it is established, and each later one into the current
 * session; a message from the program rejected by its code is logged and
 * discards the latest catalog. Every welcome the bridge service sends -- when the editor first
 * pairs, and again whenever either side reconnects -- opens a new makecode
 * session with the counterpart, declaring `target` when one is given, and
 * disposes the previous one, and its binding token is saved to `tokens`; a
 * connection that closes disposes its session. When the bridge service
 * reports a failure that stops the connection -- another connection
 * replacing this one, or the session ending -- the code is logged and the
 * bridge stays disconnected until {@link SimxBridge.startNewSession}; an
 * ended session's binding token is cleared from `tokens`, so the next start
 * forms a new session.
 */
export function startSimxBridge(options: SimxBridgeOptions): SimxBridge {
  const { tokens, log } = options;
  const server = startProjectServer(options);
  const listeners = new Set<() => void>();
  let relay: ProjectSession<WsMessage, RelayMessage>;
  let relayUnsubscribes: (() => void)[] = [];
  let joinCode: string | undefined;
  let counterpartAway = false;
  let counterpartConnected = false;
  let relayError: BridgeSessionErrorCode | undefined;
  let handshakeRejection: PeerSessionErrorCode | undefined;

  const changed = (): void => {
    for (const listener of listeners) {
      listener();
    }
  };

  const adoptJoinCode = (received: string): void => {
    if (received === joinCode) return;
    joinCode = received;
    log.info(`Wendoo join code: ${received}`);
  };

  const handshakeSettled = (rejection: PeerSessionErrorCode | undefined): void => {
    if (rejection !== undefined) logRejection(log, rejection);
    if (rejection === handshakeRejection) return;
    handshakeRejection = rejection;
    changed();
  };

  /** Opens a bridge connection presenting the binding token `tokens` holds, if any. */
  const connect = (): void => {
    const session = new ProjectSession<WsMessage, RelayMessage>(MAKECODE_SESSION_ROLE_PATHS.simx, options.bridgeUrl, {
      bindingToken: tokens.load(),
    });
    relay = session;
    relayUnsubscribes = [
      session.on("session:welcome", (message) => {
        const { bindingToken } = message.payload;
        joinCode = undefined;
        if (bindingToken !== undefined && bindingToken !== tokens.load()) {
          tokens.save(bindingToken);
        }
        counterpartAway = false;
        counterpartConnected = true;
        server.attach(relayPort(session), handshakeSettled);
        changed();
      }),
      session.on("session:joinCode", (message) => {
        adoptJoinCode(message.payload.joinCode);
        changed();
      }),
      session.addEventListener("counterpartAway", () => {
        counterpartAway = true;
        counterpartConnected = false;
        changed();
      }),
      session.addEventListener("error", (code) => {
        relayError = code;
        if (code === BridgeSessionErrorCode.SESSION_ENDED) tokens.clear();
        log.error(`${code}: the bridge connection stopped.`);
      }),
      session.addEventListener("status", (status) => {
        if (status !== "connected") {
          counterpartAway = false;
          counterpartConnected = false;
          server.detach();
        }
        changed();
      }),
    ];
    session.start();
  };

  /** Detaches from the current bridge connection, so nothing it reports reaches this bridge again. */
  const detachRelay = (): void => {
    for (const unsubscribe of relayUnsubscribes.splice(0)) {
      unsubscribe();
    }
    server.detach();
  };

  connect();

  return {
    get joinCode() {
      return joinCode;
    },
    get counterpartAway() {
      return counterpartAway;
    },
    get counterpartConnected() {
      return counterpartConnected;
    },
    get bound() {
      return tokens.load() !== undefined;
    },
    get connection() {
      return relay.status;
    },
    get errorCode() {
      return relayError ?? handshakeRejection;
    },
    get channelVersion() {
      return server.channelVersion;
    },
    onChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    startNewSession() {
      detachRelay();
      relay.end();
      tokens.clear();
      joinCode = undefined;
      counterpartAway = false;
      counterpartConnected = false;
      relayError = undefined;
      handshakeRejection = undefined;
      connect();
      changed();
    },
    dispose() {
      detachRelay();
      listeners.clear();
      server.dispose();
      relay.stop();
    },
  };
}

/**
 * Join the MakeCode program running beside this simulator extension to the
 * Wendoo editor in its MakeCode editor tab, over the ports MakeCode brokers
 * between the two frames. Each `simxeditorport` message from `parentOrigin`
 * carrying a port opens a new makecode session with the editor over that
 * port, declaring `target` when one is given, and closes the previous one;
 * every other message is ignored. The program is asked for its catalog at
 * once. The current session's brains and manifest requests are answered
 * from `files`, and its pushes and manifest writes are written to them; each
 * push that changes what a program runs is posted to the running program at
 * once, and the last update of every program is posted again each time the
 * program starts. The program's latest catalog, its icons rendered under the
 * project's palette, then the latest asset snapshot, then the project's name
 * are published into each session once it is established, and each later
 * one into the current session; a message from the program rejected by its
 * code is logged and discards the latest catalog. An editor hello declaring
 * a newer makecode protocol is logged by its code, and no session is served
 * over that port.
 */
export function startSimxPortBridge(options: SimxPortBridgeOptions): SimxPortBridge {
  const { frame, parentOrigin, log } = options;
  const server = startProjectServer(options);
  const settled = (rejection: PeerSessionErrorCode | undefined): void => {
    if (rejection !== undefined) logRejection(log, rejection);
  };
  const receive = (event: SimxPortFrameEvent): void => {
    if (event.origin !== parentOrigin) return;
    const message = event.data as { type?: unknown } | null;
    if (message?.type !== SIMXEDITOR_PORT_MESSAGE_TYPE) return;
    const port = event.ports[0];
    if (port === undefined) return;
    server.attach(messagePortSessionPort(port), settled);
  };
  frame.addEventListener("message", receive);

  return {
    dispose() {
      frame.removeEventListener("message", receive);
      server.dispose();
    },
  };
}
