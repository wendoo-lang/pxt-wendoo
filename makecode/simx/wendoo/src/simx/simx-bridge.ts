import { PeerSessionErrorCode } from "@wendoo/bridge-app/peer-session";
import type {
  MakeCodeAsset,
  MakeCodeBrainSummary,
  MakeCodeBrainsRequest,
  MakeCodeManifestReading,
  MakeCodeMessagePort,
  MakeCodeSession,
  MakeCodeSessionPort,
} from "@wendoo/makecode-session";
import { connectMakeCodeSession, messagePortSessionPort } from "@wendoo/makecode-session";
import { SIMXEDITOR_PORT_MESSAGE_TYPE, type SimxEditorTab } from "../vendor/simxeditor.js";
import { BrainsProject } from "./brains-project.js";
import { enrichCatalogIcons } from "./catalog-icons.js";
import { IDS_MODULE_FILE } from "./ids-module.js";
import { LivePrograms } from "./live-programs.js";
import { ManifestProject } from "./manifest-project.js";
import { ProjectAssets, type ProjectAssetsProvider } from "./project-assets.js";
import { type ProjectFiles, type ProjectFileWatchTimings, watchProjectFiles } from "./project-files.js";
import {
  connectSimChannel,
  SIM_CHANNEL_VERSION,
  SIMX_CHANNEL,
  SimChannelErrorCode,
  type SimxFrame,
} from "./sim-channel.js";
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
   * the project's brains and the ids module are read from at start and
   * whenever MakeCode reports them changed, and written to.
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
   * that cannot be rendered in full, the code of a catalog whose target
   * has no icon palette, the code of every ids module and brains module
   * problem, and the code of every failed read, write or subscription of
   * the project's files.
   */
  log: SimxLog;
  /** Timings of the watch of `files`' change notifications; each left out takes its default. */
  fileWatchTimings?: ProjectFileWatchTimings;
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
  /**
   * Take `tabs`, the editor tabs MakeCode lists as talking to this frame, as
   * the source of each brain's origin label, republishing the brains to
   * every session when a label changes.
   *
   * @param tabs - The tabs MakeCode lists, each with its key and label.
   */
  setTabs(tabs: readonly SimxEditorTab[]): void;
  /** Stop listening for ports and to the program, ending every tab's session. */
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
 * The makecode session with one editor tab, the counterpart, over one port.
 * It sends this side's hello at once. Once the counterpart's hello
 * establishes it and the project's current id manifest and brains are read,
 * it publishes the latest catalog, then that manifest, then the latest asset
 * snapshot, then the project's latest name as its project info, then the
 * project's latest brains, and from then on publishes what it is given and
 * answers the counterpart's brains requests.
 */
class CounterpartSession {
  private readonly _unsubscribes = new Set<() => void>();
  private _session: MakeCodeSession | undefined;
  /** Whether the session's first publications have gone out, so later ones may follow. */
  private _publishing = false;
  private _closed = false;

  /**
   * @param peer - The key the counterpart's session is held under: its tab's, or the frame's own channel when the port names none.
   * @param port - The transport to the counterpart.
   * @param target - Id of the MakeCode target to declare in this side's hello, if known.
   * @param latestCatalog - The latest catalog the program posted, as published, if any.
   * @param currentManifest - Resolves with the project's current id manifest.
   * @param latestAssets - The latest asset snapshot, if any.
   * @param latestName - The project's latest name, if known.
   * @param brainsRead - Resolves once the project's brains are read.
   * @param latestBrains - The project's latest brains.
   * @param serve - Answers each brains request the counterpart sends once the first publications are out.
   * @param settled - Called once the counterpart's hello is read: with
   *   `undefined` when the session is established, or with
   *   `PeerSessionErrorCode.PROTOCOL_VERSION_NEWER` when the hello declared a
   *   newer version and no session was established.
   */
  constructor(
    readonly peer: string,
    port: MakeCodeSessionPort,
    target: string | undefined,
    latestCatalog: () => string | undefined,
    currentManifest: () => Promise<MakeCodeManifestReading>,
    latestAssets: () => readonly MakeCodeAsset[] | undefined,
    latestName: () => string | undefined,
    brainsRead: () => Promise<unknown>,
    latestBrains: () => readonly MakeCodeBrainSummary[],
    serve: (request: MakeCodeBrainsRequest) => void,
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
        settled(undefined);
        void Promise.all([currentManifest(), brainsRead()]).then(([reading]) => {
          if (this._closed) return;
          const catalog = latestCatalog();
          if (catalog !== undefined) {
            session.publishCatalog(catalog);
          }
          session.publishManifest(reading);
          const snapshot = latestAssets();
          if (snapshot !== undefined) {
            session.publishAssets(snapshot);
          }
          const name = latestName();
          if (name !== undefined) {
            session.publishProjectInfo({ name });
          }
          session.publishBrains(latestBrains());
          this._publishing = true;
          session.onBrainsRequest(serve);
        });
      },
      () => {
        // No session over this port.
        settled(PeerSessionErrorCode.PROTOCOL_VERSION_NEWER);
      }
    );
  }

  /** Publish `catalog`, then the id manifest `reading` allocating it, to the peer, once the first publications are out. */
  publish(catalog: string, reading: MakeCodeManifestReading): void {
    if (!this._publishing) return;
    this._session?.publishCatalog(catalog);
    this._session?.publishManifest(reading);
  }

  /** Publish the id manifest `reading` to the peer, once the first publications are out. */
  publishManifest(reading: MakeCodeManifestReading): void {
    if (this._publishing) this._session?.publishManifest(reading);
  }

  /** Publish the asset snapshot `snapshot` to the peer, once the first publications are out. */
  publishAssets(snapshot: readonly MakeCodeAsset[]): void {
    if (this._publishing) this._session?.publishAssets(snapshot);
  }

  /** Publish the project's `name` to the peer as its project info, once the first publications are out. */
  publishName(name: string): void {
    if (this._publishing) this._session?.publishProjectInfo({ name });
  }

  /** Publish the project's `brains` to the peer, once the first publications are out. */
  publishBrains(brains: readonly MakeCodeBrainSummary[]): void {
    if (this._publishing) this._session?.publishBrains(brains);
  }

  /** Detach from the port, whether or not the session was established. */
  close(): void {
    this._closed = true;
    this._session?.dispose();
    for (const unsubscribe of this._unsubscribes) {
      unsubscribe();
    }
    this._unsubscribes.clear();
  }
}

/** The MakeCode project as the simulator extension serves it to one counterpart session per editor tab. */
interface ProjectServer {
  /**
   * Open a makecode session with the tab keyed `peer` over `port`, closing
   * that tab's current one, and report its handshake's outcome to `settled`.
   * Its brains requests are served as from `origin`: the tab's key, or `null`
   * when the port named none.
   */
  attach(
    peer: string,
    origin: string | null,
    port: MakeCodeSessionPort,
    settled: (rejection: PeerSessionErrorCode | undefined) => void
  ): void;
  /** Take `tabs`, the editor tabs MakeCode lists, as the source of each brain's origin label. */
  setTabs(tabs: readonly SimxEditorTab[]): void;
  /** Close every counterpart session and stop listening to the program and the asset provider. */
  dispose(): void;
}

/**
 * Serve the MakeCode project beside this simulator extension to every
 * attached counterpart session, one per editor tab. The project's brains and
 * id manifest are read from `files`, allocated, compiled and written here
 * alone, re-read when MakeCode reports a change, and recompiled whenever the
 * catalog, the manifest or the asset snapshot changes. Each session receives
 * the catalog, the manifest, the asset snapshot, the project's name and the
 * brains once established and again as each changes; compiles that change a
 * program are posted to the running program at once. The protocol and the
 * ordering rules are in docs/session-management.md.
 */
function startProjectServer(options: SimxServingOptions): ProjectServer {
  const { log } = options;
  const unwatch = watchProjectFiles(
    options.files,
    log,
    (names) => {
      brains.reported(names);
      if (names.includes(IDS_MODULE_FILE)) manifest.reported();
    },
    () => {
      brains.rescan();
      manifest.reported();
    },
    options.fileWatchTimings
  );
  const channel = connectSimChannel(options.frame, options.channel);
  const live = new LivePrograms((update) => {
    channel.postProgramUpdate(update);
  });
  const brains = new BrainsProject(options.files, log, live);
  const serveBrains = (peer: string | null, request: MakeCodeBrainsRequest): void => {
    brains.serve(peer, request);
  };
  const manifest = new ManifestProject(options.files, log);
  void manifest.current().then((reading) => {
    brains.adoptManifest(reading);
  });
  const projectAssets = new ProjectAssets(options.assets, log);
  const iconPalette = targetIconPalette(options.target);
  // the latest catalog with its icons rendered under the target's icon palette, as sessions receive it
  let publishedCatalog: string | undefined;
  // advanced by every catalog and every rejection; a catalog allocated under an earlier count is not published
  let catalogCount = 0;
  // the session of each editor tab, by the tab's key
  const counterparts = new Map<string, CounterpartSession>();

  const channelUnsubscribes = [
    channel.onCatalog((posted) => {
      const rendered = enrichCatalogIcons(posted, options.target, iconPalette, log);
      const count = ++catalogCount;
      void manifest.adopt(rendered).then((reading) => {
        if (count !== catalogCount) return;
        publishedCatalog = rendered;
        brains.adoptCatalog(rendered, reading);
        for (const counterpart of counterparts.values()) counterpart.publish(rendered, reading);
      });
    }),
    channel.onProgramStart(() => {
      live.repost();
    }),
    channel.onRejected((code) => {
      catalogCount += 1;
      publishedCatalog = undefined;
      log.error(`${code}: ${REJECTION_EXPLANATIONS[code]}`);
    }),
    projectAssets.onSnapshot((snapshot) => {
      brains.adoptAssets(snapshot);
      for (const counterpart of counterparts.values()) counterpart.publishAssets(snapshot);
    }),
    brains.onChange((summaries) => {
      for (const counterpart of counterparts.values()) counterpart.publishBrains(summaries);
    }),
    projectAssets.onName((name) => {
      for (const counterpart of counterparts.values()) counterpart.publishName(name);
    }),
    manifest.onChange((reading) => {
      brains.adoptManifest(reading);
      for (const counterpart of counterparts.values()) counterpart.publishManifest(reading);
    }),
  ];

  channel.requestCatalog();

  return {
    attach(peer, origin, port, settled) {
      counterparts.get(peer)?.close();
      const counterpart = new CounterpartSession(
        peer,
        port,
        options.target,
        () => publishedCatalog,
        () => manifest.current(),
        () => projectAssets.snapshot,
        () => projectAssets.name,
        () => brains.current(),
        () => brains.summaries(),
        (request) => {
          serveBrains(origin, request);
        },
        settled
      );
      counterparts.set(peer, counterpart);
    },
    setTabs(tabs) {
      brains.adoptTabs(tabs);
    },
    dispose() {
      for (const counterpart of counterparts.values()) counterpart.close();
      counterparts.clear();
      for (const unsubscribe of channelUnsubscribes) {
        unsubscribe();
      }
      unwatch();
      projectAssets.dispose();
      manifest.dispose();
      brains.dispose();
      channel.dispose();
    },
  };
}

/**
 * Join the MakeCode program beside this simulator extension to the editor in
 * each MakeCode editor tab that talks to this frame: each `simxeditorport`
 * message from `parentOrigin` opens a makecode session for the tab its `peer`
 * names (the frame's own `channel` when it names none), replacing that tab's
 * previous session, and declares `target` in the hello when one is given.
 * The project is served to every session as {@link startProjectServer}
 * describes, a session whose port names no tab stamping no brain origin; the
 * program's messages are read on `channel`. An editor hello declaring a newer
 * makecode protocol is logged by its code and not served.
 */
export function startSimxPortBridge(options: SimxPortBridgeOptions): SimxPortBridge {
  const { frame, parentOrigin, log } = options;
  const ownChannel = options.channel ?? SIMX_CHANNEL;
  const server = startProjectServer(options);
  const settled = (rejection: PeerSessionErrorCode | undefined): void => {
    if (rejection !== undefined) logRejection(log, rejection);
  };
  const receive = (event: SimxPortFrameEvent): void => {
    if (event.origin !== parentOrigin) return;
    const message = event.data as { type?: unknown; peer?: unknown } | null;
    if (message?.type !== SIMXEDITOR_PORT_MESSAGE_TYPE) return;
    const port = event.ports[0];
    if (port === undefined) return;
    const named = typeof message.peer === "string" ? message.peer : null;
    server.attach(named ?? ownChannel, named, messagePortSessionPort(port), settled);
  };
  frame.addEventListener("message", receive);

  return {
    setTabs(tabs) {
      server.setTabs(tabs);
    },
    dispose() {
      frame.removeEventListener("message", receive);
      server.dispose();
    },
  };
}
