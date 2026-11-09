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
import { BrainsProject, BrainsProjectProblemCode, brainSourceFile } from "./brains-project.js";
import { enrichCatalogIcons } from "./catalog-icons.js";
import type { EditorTabOpener } from "./editor-tab.js";
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
   * problem, the code of every brains push or open refused, the code of
   * every brain open held for a tab and dropped, and the code of every
   * failed read, write or subscription of the project's files.
   */
  log: SimxLog;
  /** Timings of the watch of `files`' change notifications; each left out takes its default. */
  fileWatchTimings?: ProjectFileWatchTimings;
  /** Shows the editor tab of a key MakeCode lists: the origin tab a brain is opened in. */
  opener: Pick<EditorTabOpener, "open">;
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
  /** Asks MakeCode which editor tabs talk to this frame, and shows the origin tab a brain is opened in. */
  opener: Pick<EditorTabOpener, "open" | "tabs">;
  /** The simulator extension API level MakeCode serves, from the frame URL's `apiLevel`; tabs are asked for at 2 or above. */
  apiLevel: number;
  /** Receives each tabs reply MakeCode sends, in order: the tabs that talk to this frame. */
  onTabs(tabs: readonly SimxEditorTab[]): void;
}

/** A running simulator extension port bridge. */
export interface SimxPortBridge {
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

/** What a {@link CounterpartSession} publishes to its counterpart, reads its requests with, and reports its handshake to. */
interface CounterpartSessionOptions {
  /** The transport to the counterpart. */
  readonly port: MakeCodeSessionPort;
  /** Id of the MakeCode target to declare in this side's hello, if known. */
  readonly target: string | undefined;
  /** The latest catalog the program posted, as published, if any. */
  latestCatalog(): string | undefined;
  /** Resolves with the project's current id manifest. */
  currentManifest(): Promise<MakeCodeManifestReading>;
  /** The latest asset snapshot, if any. */
  latestAssets(): readonly MakeCodeAsset[] | undefined;
  /** The project's latest name, if known. */
  latestName(): string | undefined;
  /** Resolves once the project's brains are read. */
  brainsRead(): Promise<unknown>;
  /** The project's latest brains. */
  latestBrains(): readonly MakeCodeBrainSummary[];
  /** Takes the brain held for the tab to open, if any, so no later session receives it. */
  takeHeldOpen(): string | undefined;
  /** Answers each brains request the counterpart sends once the first publications are out. */
  serve(request: MakeCodeBrainsRequest): void;
  /** Called once the counterpart's hello is read: with `undefined` when established, else with `PeerSessionErrorCode.PROTOCOL_VERSION_NEWER`. */
  settled(rejection: PeerSessionErrorCode | undefined): void;
}

/**
 * The makecode session with one editor tab, the counterpart, over
 * `options.port`. It sends this side's hello at once; once established and
 * the project read, it publishes what `options` gives in the order the simx
 * bullet of docs/session-management.md, "Who plays which role", sets out.
 * Each publish method delivers nothing before those first publications.
 */
class CounterpartSession {
  private readonly _unsubscribes = new Set<() => void>();
  private _session: MakeCodeSession | undefined;
  /** Whether the session's first publications have gone out, so later ones may follow. */
  private _publishing = false;
  private _closed = false;

  constructor(options: CounterpartSessionOptions) {
    const { port } = options;
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
    connectMakeCodeSession({ port: tracked, target: options.target }).then(
      (session) => {
        this._session = session;
        options.settled(undefined);
        void Promise.all([options.currentManifest(), options.brainsRead()]).then(([reading]) => {
          if (this._closed) return;
          const catalog = options.latestCatalog();
          if (catalog !== undefined) {
            session.publishCatalog(catalog);
          }
          session.publishManifest(reading);
          const snapshot = options.latestAssets();
          if (snapshot !== undefined) {
            session.publishAssets(snapshot);
          }
          const name = options.latestName();
          if (name !== undefined) {
            session.publishProjectInfo({ name });
          }
          session.publishBrains(options.latestBrains());
          const held = options.takeHeldOpen();
          if (held !== undefined) session.publishBrainOpen(held);
          this._publishing = true;
          session.onBrainsRequest((request) => {
            options.serve(request);
          });
        });
      },
      () => {
        // No session over this port.
        options.settled(PeerSessionErrorCode.PROTOCOL_VERSION_NEWER);
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

  /**
   * Publish an ask for the peer's editor to open the brain `id` when the
   * first publications are out and the session is not closed. Returns
   * whether it was published.
   */
  openBrain(id: string): boolean {
    if (!this._publishing || this._closed || this._session === undefined) return false;
    this._session.publishBrainOpen(id);
    return true;
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
   * Open a makecode session with the tab keyed `key` over `port` -- the
   * frame's own channel when `key` is `null`, for a port naming no tab --
   * closing that tab's current one, and report its handshake's outcome to
   * `settled`. Its brains requests are served as from `key`.
   */
  attach(
    key: string | null,
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
 * attached counterpart session, one per editor tab: the project's brains and
 * id manifest are read from `options.files`, allocated, compiled and written
 * here alone, each session receives the catalog, the manifest, the assets,
 * the name and the brains, compiles reach the running program at once, and
 * a brain a tab asks to open is shown in its origin's tab through
 * `options.opener`. docs/session-management.md holds the protocol and its
 * ordering: "Who plays which role", "The id manifest" and "The simx write
 * path".
 */
function startProjectServer(options: SimxServingOptions): ProjectServer {
  const { log } = options;
  const ownChannel = options.channel ?? SIMX_CHANNEL;
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
  // the brain each tab is to open once its session's first publications are out, by the tab's key; each hold is a fresh object, so a refusal drops only the hold its own open made
  const heldOpens = new Map<string, { readonly id: string }>();

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
    brains.onOpen(({ id, origin, peer }) => {
      const shown = origin === null ? undefined : options.opener.open(origin);
      const key = origin ?? peer ?? ownChannel;
      if (counterparts.get(key)?.openBrain(id) === true) return;
      const held = { id };
      heldOpens.set(key, held);
      void shown?.then((opened) => {
        if (opened || heldOpens.get(key) !== held) return;
        heldOpens.delete(key);
        log.error(
          `${BrainsProjectProblemCode.OPEN_DROPPED}: MakeCode did not show the tab ${key}, so the open of ${brainSourceFile(id)} held for it is dropped.`
        );
      });
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
    attach(key, port, settled) {
      const sessionKey = key ?? ownChannel;
      counterparts.get(sessionKey)?.close();
      const counterpart = new CounterpartSession({
        port,
        target: options.target,
        latestCatalog: () => publishedCatalog,
        currentManifest: () => manifest.current(),
        latestAssets: () => projectAssets.snapshot,
        latestName: () => projectAssets.name,
        brainsRead: () => brains.current(),
        latestBrains: () => brains.summaries(),
        takeHeldOpen: () => {
          const held = heldOpens.get(sessionKey);
          heldOpens.delete(sessionKey);
          return held?.id;
        },
        serve: (request) => {
          serveBrains(key, request);
        },
        settled,
      });
      counterparts.set(sessionKey, counterpart);
    },
    setTabs(tabs) {
      brains.adoptTabs(tabs);
    },
    dispose() {
      for (const counterpart of counterparts.values()) counterpart.close();
      counterparts.clear();
      heldOpens.clear();
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
 * names, the frame's own `channel` when it names none, replacing that tab's
 * previous one, and the project is served to every session as
 * {@link startProjectServer} describes. At `apiLevel` 2 or above it asks
 * `opener` for the tabs at start and again for a port naming a tab the
 * latest reply does not list, one request at a time, handing each reply to
 * `onTabs`. The rules are in docs/session-management.md, OPEN EDITOR under
 * "The brand strip".
 */
export function startSimxPortBridge(options: SimxPortBridgeOptions): SimxPortBridge {
  const { frame, parentOrigin, log, opener } = options;
  const server = startProjectServer(options);
  const asksTabs = options.apiLevel >= 2;
  // the key of each tab MakeCode listed in its latest tabs reply
  let listed: ReadonlySet<string> = new Set();
  // whether a tabs request is out; one is out at a time
  let asking = false;
  // the unlisted keys of the tabs that attached while a request was out
  const attachedMeanwhile = new Set<string>();
  const askTabs = (): void => {
    asking = true;
    void opener.tabs().then((tabs) => {
      asking = false;
      listed = new Set(tabs.map((tab) => tab.key));
      server.setTabs(tabs);
      options.onTabs(tabs);
      const stillUnlisted = [...attachedMeanwhile].some((key) => !listed.has(key));
      attachedMeanwhile.clear();
      if (stillUnlisted) askTabs();
    });
  };
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
    server.attach(named, messagePortSessionPort(port), settled);
    if (!asksTabs || named === null || listed.has(named)) return;
    if (asking) attachedMeanwhile.add(named);
    else askTabs();
  };
  frame.addEventListener("message", receive);
  if (asksTabs) askTabs();

  return {
    dispose() {
      frame.removeEventListener("message", receive);
      server.dispose();
    },
  };
}
