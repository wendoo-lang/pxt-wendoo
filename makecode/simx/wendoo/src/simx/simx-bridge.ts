import { PeerSessionErrorCode } from "@wendoo/bridge-app/peer-session";
import type {
  MakeCodeAsset,
  MakeCodeBrainsRequest,
  MakeCodeManifestRequest,
  MakeCodeMessagePort,
  MakeCodeSession,
  MakeCodeSessionPort,
} from "@wendoo/makecode-session";
import { connectMakeCodeSession, messagePortSessionPort } from "@wendoo/makecode-session";
import { SIMXEDITOR_PORT_MESSAGE_TYPE } from "../vendor/simxeditor.js";
import { BrainsProject, type ProjectFiles } from "./brains-project.js";
import { enrichCatalogIcons } from "./catalog-icons.js";
import { LivePrograms } from "./live-programs.js";
import { ManifestProject } from "./manifest-project.js";
import { ProjectAssets, type ProjectAssetsProvider } from "./project-assets.js";
import { connectSimChannel, SIM_CHANNEL_VERSION, SimChannelErrorCode, type SimxFrame } from "./sim-channel.js";
import { targetIconPalette } from "./target-icon-palettes.js";

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
   * songs, palette and name are listed from for the asset snapshot and the
   * project info.
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
   * request the asset provider fails, the code of every image or icon
   * that cannot be rendered in full, and the code of a catalog whose target
   * has no icon palette.
   */
  log: SimxLog;
  /**
   * Id of the MakeCode target running the program, for example `microbit`
   * or `arcade`, declared to the editor in each makecode session's hello,
   * and keying the palette the catalog's icons are rendered under. When
   * omitted, no target is declared.
   */
  target?: string;
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
  /**
   * Open a makecode session with the counterpart over `port`, closing the
   * current one, and report its handshake's outcome to `settled`.
   */
  attach(port: MakeCodeSessionPort, settled: (rejection: PeerSessionErrorCode | undefined) => void): void;
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
 * current one, each rendered once as it arrives, its icons as `iconUrl` data
 * URIs under the hosting `target`'s icon palette. A rejected message from
 * the program is logged by its code and discards the latest catalog, so no
 * session receives a catalog older than the program's newest. The
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
  const iconPalette = targetIconPalette(options.target);
  // the latest catalog with its icons rendered under the target's icon palette, as sessions receive it
  let publishedCatalog: string | undefined;
  let counterpart: CounterpartSession | undefined;

  const channelUnsubscribes = [
    channel.onCatalog((posted) => {
      const rendered = enrichCatalogIcons(posted, options.target, iconPalette, log);
      publishedCatalog = rendered;
      counterpart?.publish(rendered);
    }),
    channel.onProgramStart(() => {
      live.repost();
    }),
    channel.onRejected((code) => {
      publishedCatalog = undefined;
      log.error(`${code}: ${REJECTION_EXPLANATIONS[code]}`);
    }),
    projectAssets.onSnapshot((snapshot) => {
      counterpart?.publishAssets(snapshot);
    }),
    projectAssets.onName((name) => {
      counterpart?.publishName(name);
    }),
  ];

  channel.requestCatalog();

  return {
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
    dispose() {
      counterpart?.close();
      counterpart = undefined;
      for (const unsubscribe of channelUnsubscribes) {
        unsubscribe();
      }
      projectAssets.dispose();
      channel.dispose();
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
 * program starts. The program's latest catalog, its icons rendered under
 * the `target`'s icon palette, then the latest asset snapshot, then the
 * project's name are published into each session once it is established,
 * and each later one into the current session; a message from the program
 * rejected by its code is logged and discards the latest catalog. An editor
 * hello declaring a newer makecode protocol is logged by its code, and no
 * session is served over that port.
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
