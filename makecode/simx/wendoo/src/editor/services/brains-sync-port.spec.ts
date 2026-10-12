/**
 * The editor tab and the simulator extension's column frame composed over a
 * real MessageChannel, as MakeCode brokers it between the two frames: the
 * editor's session store and brains store over the port-backed session on
 * one end; on the other, either the simulator extension's port bridge over
 * an in-memory MakeCode project, or a column frame the spec plays over the
 * raw port.
 */

import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { PeerSessionErrorCode } from "@wendoo/bridge-app";
import { stream } from "@wendoo/core";
import type { WendooEnvironment } from "@wendoo/core/app";
import { BrainDef, CoreHostActions, LogLevel, logger, mkActuatorTileId, mkSensorTileId } from "@wendoo/core/app";
import type { BrainPageDef, BrainRuleDef } from "@wendoo/core/brain/model";
import { linkedBrainProgramFromBytes } from "@wendoo/core/runtime";
import type {
  MakeCodeBrainSummary,
  MakeCodeBrainsRequestMessage,
  MakeCodeHeartbeatOptions,
  MakeCodeIdManifest,
  MakeCodeManifestRequestMessage,
  MakeCodePortEditorSession,
  MakeCodeWireBrain,
} from "@wendoo/makecode-session";
import {
  brainSourceHash,
  createMakeCodePortEditorSession,
  MAKECODE_SESSION_PROTOCOL_VERSION,
  MakeCodeBrainsErrorCode,
  messagePortSessionPort,
} from "@wendoo/makecode-session";
import { BRAINS_MODULE_FILE, readBrainsModule } from "../../simx/brains-module.js";
import { IDS_MODULE_FILE, readIdsModule } from "../../simx/ids-module.js";
import { type SimxLog, type SimxPortBridge, startSimxPortBridge } from "../../simx/simx-bridge.js";
import { FakeAssetProvider, listedImage, listedSong } from "../../simx/test-support/asset-provider.js";
import { FakePortFrame } from "../../simx/test-support/port-frame.js";
import { postedProgramUpdates } from "../../simx/test-support/program-update-frame.js";
import {
  FakeProjfsHost,
  PROJFS_RATE_LIMIT,
  PROJFS_RATE_WINDOW_MS,
  PROJFS_SCOPE_QUOTA_BYTES,
} from "../../simx/test-support/projfs-host.js";
import type { ProjfsClient } from "../../vendor/projfs.js";
import { FLUSH_DEBOUNCE_MS, openBrainEditing } from "../brain/editing.js";
import { buildAuthoringEnvironment, MAKECODE_VM_PRECISION } from "./authoring-environment.js";
import {
  BRAIN_SOURCE_ID_MISMATCH,
  BRAIN_SOURCE_INVALID,
  compileBrainSource,
  readBrainSource,
  serializeBrainSource,
} from "./brain-source.js";
import type { BrainsViewState } from "./brains-store.js";
import { BrainsStore } from "./brains-store.js";
import { connectionStatus } from "./connection-status.js";
import { EditorSessionStore, type EditorSessionViewState } from "./editor-session-store.js";

const CATALOG = '{"packs":[]}';

/** A catalog the program posts after the first, replacing it. */
const NEWER_CATALOG = '{"packs":[{"name":"motion","tiles":[]}]}';

/** A catalog whose one pack declares a sensor and an actuator, as the program posts it once it runs. */
const PACK_CATALOG = JSON.stringify({
  packs: [
    {
      name: "walk",
      tiles: [
        { name: "sensor.walk.pressed", kind: "sensor", returns: "boolean" },
        { name: "actuator.walk.step", kind: "actuator" },
      ],
    },
  ],
});

/** A catalog whose one pack declares the ring tile. */
const CHIME_CATALOG = JSON.stringify({
  packs: [{ name: "chime", tiles: [{ name: "actuator.chime.ring", kind: "actuator" }] }],
});

/** How long a wait in these specs lasts before it fails, in milliseconds. */
const WAIT_MS = 2000;

/** A file outside the brains that fills the simulator extension's folder to its quota, so MakeCode refuses every brain write. */
const FILLER = "filler.bin";

/** A simx log keeping its lines out of the test output. */
const silentLog: SimxLog = { info() {}, error() {} };

/** Resolves after `ms` milliseconds. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Resolves with `read()` once `predicate` holds for it, polling until {@link WAIT_MS}. */
async function eventually<T>(read: () => T, predicate: (value: T) => boolean, what: string): Promise<T> {
  const deadline = Date.now() + WAIT_MS;
  for (;;) {
    const value = read();
    if (predicate(value)) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await delay(10);
  }
}

/** The first rule of `definition`'s first page. */
function firstRule(definition: BrainDef): BrainRuleDef {
  const page = definition.pages().get(0) as BrainPageDef;
  return page.children().get(0) as BrainRuleDef;
}

/** Authors a rule that compiles into the first rule of the brain `definition`'s first page. */
function authorCompilingRule(environment: WendooEnvironment, definition: BrainDef): void {
  const rule = firstRule(definition);
  for (const catalog of environment.tileCatalogs()) {
    const when = catalog.get(mkSensorTileId(CoreHostActions.OnPageEntered.key));
    const act = catalog.get(mkActuatorTileId(CoreHostActions.RestartPage.key));
    if (when && act) {
      rule.when().appendTile(when);
      rule.do().appendTile(act);
      return;
    }
  }
  throw new Error("no core tiles");
}

/** Adds a brain named `name` with a compiling rule to `brains`, returning its id. */
function authorBrain(brains: BrainsStore, name: string): string {
  const id = brains.addBrain(name);
  const edited = brains.getBrain(id);
  assert.ok(edited);
  authorCompilingRule(brains.getSnapshot().environment, edited);
  brains.applyBrain(edited);
  return id;
}

/**
 * Adds a brain named `name` to `brains` whose one rule reads the pack sensor
 * `sensor` and runs the pack actuator `actuator`, returning its id. Throws
 * when the store's environment does not bind both tiles.
 */
function authorPackBrain(brains: BrainsStore, name: string, sensor: string, actuator: string): string {
  const id = brains.addBrain(name);
  const edited = brains.getBrain(id);
  assert.ok(edited);
  const rule = firstRule(edited);
  const catalogs = brains.getSnapshot().environment.tileCatalogs();
  const when = catalogs.map((catalog) => catalog.get(mkSensorTileId(sensor))).find((tile) => tile !== undefined);
  const act = catalogs.map((catalog) => catalog.get(mkActuatorTileId(actuator))).find((tile) => tile !== undefined);
  assert.ok(when && act, "the pack's tiles are bound");
  rule.when().appendTile(when);
  rule.do().appendTile(act);
  brains.applyBrain(edited);
  return id;
}

/**
 * Reopens the brain `id` of `brains` as the brain editor does, appends a
 * second compiling rule to its first page, and applies the result.
 */
function reopenWithSecondRule(brains: BrainsStore, id: string): void {
  const reopened = brains.getBrain(id);
  assert.ok(reopened);
  const page = reopened.pages().get(0) as BrainPageDef;
  const rule = page.appendNewRule();
  const environment = brains.getSnapshot().environment;
  for (const catalog of environment.tileCatalogs()) {
    const when = catalog.get(mkSensorTileId(CoreHostActions.OnPageEntered.key));
    const act = catalog.get(mkActuatorTileId(CoreHostActions.RestartPage.key));
    if (when && act) {
      rule.when().appendTile(when);
      rule.do().appendTile(act);
      brains.applyBrain(reopened);
      return;
    }
  }
  throw new Error("no core tiles");
}

/** How many rules the first page of the brain `id` of `brains` holds. */
function pageRules(brains: BrainsStore, id: string): number {
  const held = brains.getBrain(id);
  assert.ok(held);
  return (held.pages().get(0) as BrainPageDef).children().size();
}

/** A brain as a project holds it after an editor pushed it, in the wire form: its source and that source's compiled form. */
function projectBrain(name: string): MakeCodeWireBrain {
  const { environment } = buildAuthoringEnvironment(undefined);
  const definition = BrainDef.emptyBrainDef(environment.brainServices, name);
  const source = serializeBrainSource(definition);
  const { bytecode } = compileBrainSource(environment, source);
  assert.ok(bytecode);
  return {
    id: definition.id(),
    name,
    source,
    compiled: { bytecode: Buffer.from(bytecode).toString("base64"), sourceHash: brainSourceHash(source) },
  };
}

/** The source of `brain` with a compiling rule authored into it, as an out-of-band editor would save it. */
function editedOutOfBand(brain: Pick<MakeCodeWireBrain, "source">): string {
  const { environment } = buildAuthoringEnvironment(undefined);
  const definition = readBrainSource(environment, brain.source);
  authorCompilingRule(environment, definition);
  return serializeBrainSource(definition);
}

/** A project holding `brains`, keyed by id. */
function projectOf(...brains: MakeCodeWireBrain[]): Map<string, MakeCodeWireBrain> {
  return new Map(brains.map((brain) => [brain.id, brain]));
}

/** A brains or manifest request the scripted column frame received. */
type ReceivedRequest = MakeCodeBrainsRequestMessage | MakeCodeManifestRequestMessage;

/**
 * A column frame played by the spec over the raw far end of a brokered
 * port: it sends its makecode hello at once and answers the editor's brains
 * and manifest requests from its in-memory project -- or, while held,
 * queues the answers until released. It records every request it receives
 * and counts the editor hellos, one per handshake. Its list carries each
 * brain's compiled source hash only when opened to report it; otherwise it
 * answers as a column frame predating that field does.
 */
class ScriptedColumn {
  /** The brains the project holds, by document id, in the wire form. */
  readonly project: Map<string, MakeCodeWireBrain>;
  /** The id manifest the project holds, or `null` when it holds none. */
  manifest: MakeCodeIdManifest | null = null;
  /** Every brains and manifest request received, in order. */
  readonly requests: ReceivedRequest[] = [];
  /** How many editor hellos arrived. */
  hellos = 0;
  held = false;
  /** How many of the next lists are answered with a `READ_FAILED` error reply. */
  failingLists = 0;
  /** Whether pushes are received and never answered. */
  dropsPushes = false;
  private readonly _queue: (() => void)[] = [];
  private readonly _port: MessagePort;
  private readonly _reportsCompiled: boolean;

  /**
   * @param port - The far end of the port brokered to the editor tab.
   * @param project - The brains the project holds, shared with any later column frame over the same project.
   * @param reportsCompiled - Whether its list carries each brain's compiled source hash, `null` for a brain with no compiled form.
   */
  constructor(port: MessagePort, project: Map<string, MakeCodeWireBrain>, reportsCompiled: boolean) {
    this._port = port;
    this.project = project;
    this._reportsCompiled = reportsCompiled;
    port.addEventListener("message", (event) => {
      this.handle(event.data as Record<string, unknown>);
    });
    port.start();
    this.send({ type: "makecode:hello", payload: { protocolVersion: MAKECODE_SESSION_PROTOCOL_VERSION } });
  }

  /** Sends `message` to the editor as it is. */
  send(message: object): void {
    this._port.postMessage(message);
  }

  /** Answers every request held so far, in arrival order, and stops holding. */
  release(): void {
    this.held = false;
    for (const answer of this._queue.splice(0)) answer();
  }

  /** The requests of `type` received so far. */
  requestsOf(type: ReceivedRequest["type"]): ReceivedRequest[] {
    return this.requests.filter((request) => request.type === type);
  }

  /** Closes its end of the port. */
  close(): void {
    this._port.close();
  }

  private handle(message: Record<string, unknown>): void {
    switch (message.type) {
      case "makecode:hello":
        this.hellos += 1;
        return;
      case "makecode:brainsList":
      case "makecode:brainsPull":
      case "makecode:brainsPush":
      case "makecode:manifestRead":
      case "makecode:manifestWrite": {
        const request = message as unknown as ReceivedRequest;
        this.requests.push(request);
        if (request.type === "makecode:brainsPush" && this.dropsPushes) return;
        const answer = () => {
          this.send(this.answer(request));
        };
        if (this.held) this._queue.push(answer);
        else answer();
        return;
      }
      default:
        return;
    }
  }

  private answer(request: ReceivedRequest): object {
    switch (request.type) {
      case "makecode:brainsList":
        if (this.failingLists > 0) {
          this.failingLists -= 1;
          return {
            type: "makecode:brainsError",
            id: request.id,
            payload: { code: MakeCodeBrainsErrorCode.READ_FAILED, message: "unreadable" },
          };
        }
        return {
          type: "makecode:brainsListReply",
          id: request.id,
          payload: {
            brains: [...this.project.values()].map((brain) => {
              const summary: MakeCodeBrainSummary = {
                id: brain.id,
                name: brain.name,
                sourceHash: brainSourceHash(brain.source),
              };
              if (this._reportsCompiled) summary.compiledSourceHash = brain.compiled?.sourceHash ?? null;
              return summary;
            }),
          },
        };
      case "makecode:brainsPull":
        return {
          type: "makecode:brainsPullReply",
          id: request.id,
          payload: { brains: request.payload.ids.flatMap((id) => this.project.get(id) ?? []) },
        };
      case "makecode:brainsPush":
        if (request.payload.op === "write") this.project.set(request.payload.brain.id, request.payload.brain);
        else this.project.delete(request.payload.brainId);
        return { type: "makecode:brainsAck", id: request.id };
      case "makecode:manifestRead":
        return { type: "makecode:manifestReadReply", id: request.id, payload: { manifest: this.manifest } };
      case "makecode:manifestWrite":
        this.manifest = request.payload.manifest;
        return { type: "makecode:manifestAck", id: request.id };
    }
  }
}

/** The editor tab: its port-backed session, the session store over it, and the brains store over that. */
interface EditorTab {
  session: MakeCodePortEditorSession;
  store: EditorSessionStore;
  brains: BrainsStore;
}

/** The simulator extension's column frame: its window, its port bridge, the project it serves, and its asset provider. */
interface ColumnFrame {
  frame: FakePortFrame;
  bridge: SimxPortBridge;
  host: FakeProjfsHost;
  assets: FakeAssetProvider;
}

describe("brains sync between the editor tab and the column frame over a brokered port", () => {
  let tabs: EditorTab[];
  let columns: ColumnFrame[];
  let scripted: ScriptedColumn[];
  let clients: ProjfsClient[];
  let channels: MessageChannel[];
  let loggedLevel: LogLevel;

  before(() => {
    loggedLevel = logger.level;
    logger.level = LogLevel.ERROR;
  });

  after(() => {
    logger.level = loggedLevel;
  });

  beforeEach(() => {
    tabs = [];
    columns = [];
    scripted = [];
    clients = [];
    channels = [];
  });

  afterEach(() => {
    for (const tab of tabs) tab.store.stop();
    for (const column of columns) column.bridge.dispose();
    for (const column of scripted) column.close();
    for (const client of clients) client.dispose();
    for (const channel of channels) {
      channel.port1.close();
      channel.port2.close();
    }
  });

  /** Opens an editor tab frame, as its boot does, before any port arrives, pinging on `heartbeat` when one is given. */
  function openTab(heartbeat?: MakeCodeHeartbeatOptions): EditorTab {
    const session = createMakeCodePortEditorSession({ heartbeat });
    const store = new EditorSessionStore(session);
    const brains = new BrainsStore(store, store);
    store.start();
    const tab = { session, store, brains };
    tabs.push(tab);
    return tab;
  }

  /** Starts a column frame over `host`'s project, as MakeCode does on every spawn; the program posts `catalog`. */
  function startColumn(host: FakeProjfsHost, catalog = CATALOG): ColumnFrame {
    const column = spawnColumn(host);
    column.frame.programPosts(catalog);
    return column;
  }

  /**
   * Starts a column frame over `host`'s project beside a program that has not
   * run, so nothing has posted a catalog, declaring the target `declared`
   * names, or none when it names none.
   */
  function spawnColumn(host: FakeProjfsHost, declared: { target?: string } = { target: "arcade" }): ColumnFrame {
    const frame = new FakePortFrame();
    const files = host.client();
    clients.push(files);
    // the project holds one image and one song, so every session also receives an asset snapshot
    const assets = new FakeAssetProvider();
    assets.images = [listedImage("image1", [[1, 2]], "hero")];
    assets.songs = [listedSong("song1", "theme")];
    assets.answer();
    const bridge = startSimxPortBridge({
      frame,
      parentOrigin: "https://arcade.makecode.com",
      files,
      assets,
      log: silentLog,
      target: declared.target,
    });
    const column = { frame, bridge, host, assets };
    columns.push(column);
    return column;
  }

  /** Disposes `column`, as MakeCode does when the simulator restarts or the frame goes. */
  function disposeColumn(column: ColumnFrame): void {
    column.bridge.dispose();
    columns.splice(columns.indexOf(column), 1);
  }

  /**
   * Restarts the simulator under `tab`: `column` goes, and a new column frame
   * over the same project, its program posting `catalog`, is brokered to
   * `tab`. Returns the new column frame.
   */
  function restartColumn(column: ColumnFrame, tab: EditorTab, catalog = CATALOG): ColumnFrame {
    disposeColumn(column);
    const restarted = startColumn(column.host, catalog);
    broker(restarted, tab);
    return restarted;
  }

  /** Stops `tab`, as the page being hidden for good does, and forgets it. */
  function closeTab(tab: EditorTab): void {
    tab.store.stop();
    tabs.splice(tabs.indexOf(tab), 1);
  }

  /** A new message channel, closed by the spec's cleanup. */
  function channel(): MessageChannel {
    const created = new MessageChannel();
    channels.push(created);
    return created;
  }

  /** MakeCode brokering a fresh port pair between `column` and `tab`. */
  function broker(column: ColumnFrame, tab: EditorTab): void {
    const { port1, port2 } = channel();
    column.frame.brokerPort(port1);
    tab.session.attachPort(messagePortSessionPort(port2));
  }

  /**
   * MakeCode brokering a fresh port to `tab` whose other end it has not
   * handed to a column frame yet. Resolves with that other end once the tab
   * reports the session disconnected.
   */
  async function rebroker(tab: EditorTab): Promise<MessagePort> {
    const { port1, port2 } = channel();
    tab.session.attachPort(messagePortSessionPort(port2));
    await storeUntil(tab, (state) => state.status === "disconnected", "the editor to see its port replaced");
    return port1;
  }

  /** Resolves with the brains store's state once `predicate` holds for it. */
  function brainsUntil(
    tab: EditorTab,
    predicate: (state: BrainsViewState) => boolean,
    what: string
  ): Promise<BrainsViewState> {
    return eventually(() => tab.brains.getSnapshot(), predicate, what);
  }

  /** Resolves with the session store's state once `predicate` holds for it. */
  function storeUntil(
    tab: EditorTab,
    predicate: (state: EditorSessionViewState) => boolean,
    what: string
  ): Promise<EditorSessionViewState> {
    return eventually(() => tab.store.getSnapshot(), predicate, what);
  }

  /**
   * Resolves once `host`'s project holds every brain `tab` holds, in both
   * forms as the store holds them, and no source of a brain it does not.
   */
  async function saved(host: FakeProjfsHost, tab: EditorTab, what: string): Promise<void> {
    await eventually(
      () => {
        const { brains: held } = tab.brains.getSnapshot();
        const reading = readBrainsModule(host.file(BRAINS_MODULE_FILE) ?? "");
        const sources = host.listed.filter((name) => name.endsWith(".src.json")).length;
        return (
          sources === held.size &&
          [...held].every(
            ([id, entry]) =>
              host.file(`brains/${id}.src.json`) === entry.source &&
              reading.entries.get(id)?.sourceHash === entry.compiled?.sourceHash
          )
        );
      },
      (done) => done,
      what
    );
  }

  it("delivers the project's catalog, asset snapshot, project info and target to the editor once the port's handshake completes", async () => {
    const host = new FakeProjfsHost();
    const tab = openTab();
    assert.equal(tab.store.getSnapshot().status, "disconnected");
    const column = startColumn(host);

    broker(column, tab);
    const state = await storeUntil(
      tab,
      (reading) => reading.projectName !== undefined && reading.assets !== undefined,
      "the project's publications"
    );

    assert.equal(state.status, "connected");
    assert.equal(state.target, "arcade");
    assert.equal(state.catalogText, CATALOG);
    assert.deepEqual(
      state.assets?.map((asset) => [asset.kind, asset.id]),
      [
        ["image", "image1"],
        ["song", "song1"],
      ]
    );
    assert.equal(connectionStatus(state), "connected");
    await brainsUntil(tab, (reading) => reading.reconciled, "the editor to reconcile");
  });

  it("delivers each catalog the program posts, a newer one replacing the one held", async () => {
    const host = new FakeProjfsHost();
    const tab = openTab();
    const column = startColumn(host);
    broker(column, tab);
    await storeUntil(tab, (state) => state.catalogText === CATALOG, "the first catalog");

    column.frame.programPosts(NEWER_CATALOG);

    await storeUntil(tab, (state) => state.catalogText === NEWER_CATALOG, "the newer catalog to replace the held one");
  });

  it("holds no target while the column frame declares none", async () => {
    const host = new FakeProjfsHost();
    const tab = openTab();
    const column = spawnColumn(host, {});
    column.frame.programPosts(CATALOG);

    broker(column, tab);
    const state = await storeUntil(
      tab,
      (reading) => reading.status === "connected" && reading.catalogText === CATALOG,
      "the session to form and deliver the catalog"
    );

    assert.equal(state.target, undefined);
  });

  it("holds the project name the column frame publishes, and follows a rename in MakeCode", async () => {
    const host = new FakeProjfsHost();
    const tab = openTab();
    const column = startColumn(host);
    broker(column, tab);
    await storeUntil(tab, (state) => state.projectName === column.assets.name, "the project's name");

    column.assets.name = "Space Chase";
    column.assets.change();

    await storeUntil(tab, (state) => state.projectName === "Space Chase", "the renamed project's name");
  });

  it("saves a brain authored in the editor to the project in both forms, and posts its live program update to the running program", async () => {
    const host = new FakeProjfsHost();
    const tab = openTab();
    const column = startColumn(host);
    broker(column, tab);
    await brainsUntil(tab, (state) => state.reconciled, "the editor to reconcile");

    const id = authorBrain(tab.brains, "Chaser");
    await saved(host, tab, "the brain to be saved");

    const stored = tab.brains.getSnapshot().brains.get(id);
    assert.ok(stored?.compiled);
    assert.equal(host.file(`brains/${id}.src.json`), stored.source);
    const updates = postedProgramUpdates(column.frame.posted).filter((update) => update.documentId === id);
    assert.ok(updates.length > 0);
    assert.equal(updates.at(-1)?.sourceHash, stored.compiled.sourceHash);
    assert.deepEqual(updates.at(-1)?.bytecode, stored.compiled.bytecode);
    await brainsUntil(tab, (state) => state.pending.size === 0, "the push to be acknowledged");
  });

  it("keeps brains and pends when the column frame respawns, reconciling over the fresh port's brains channel", async () => {
    const host = new FakeProjfsHost();
    const tab = openTab();
    const first = startColumn(host);
    broker(first, tab);
    await brainsUntil(tab, (state) => state.reconciled, "the editor to reconcile");
    const kept = authorBrain(tab.brains, "Chaser");
    await saved(host, tab, "the first brain to be saved");

    disposeColumn(first);
    const far = await rebroker(tab);
    const pended = authorBrain(tab.brains, "Runner");
    tab.brains.renameBrain(kept, "Chaser Two");
    const waiting = tab.brains.getSnapshot();
    assert.ok(waiting.pending.has(pended));
    assert.ok(waiting.pending.has(kept));

    const second = startColumn(host);
    second.frame.brokerPort(far);
    await brainsUntil(tab, (state) => state.reconciled && state.pending.size === 0, "the pends to be saved");
    await saved(host, tab, "both brains to be saved");

    const { brains } = tab.brains.getSnapshot();
    assert.deepEqual([...brains.keys()].sort(), [kept, pended].sort());
    assert.equal(brains.get(kept)?.name, "Chaser Two");
    assert.equal(readBrainsModule(host.file(BRAINS_MODULE_FILE) ?? "").entries.get(kept)?.name, "Chaser Two");
    assert.equal(tab.store.getSnapshot().status, "connected");
  });

  it("reconnects when the column frame silently stops answering pings, and the re-brokered port's handshake saves the pend", async () => {
    const host = new FakeProjfsHost();
    const tab = openTab({ intervalMs: 20, deadlineMs: 100 });
    const gone = startColumn(host);
    broker(gone, tab);
    await brainsUntil(tab, (state) => state.reconciled, "the editor to reconcile");

    disposeColumn(gone);
    const pended = authorBrain(tab.brains, "Chaser");
    const waiting = await storeUntil(
      tab,
      (state) => connectionStatus(state) === "reconnecting",
      "the heartbeat to end the handshake"
    );
    assert.equal(waiting.errorCode, undefined);
    assert.ok(tab.brains.getSnapshot().pending.has(pended));

    broker(startColumn(host), tab);
    await brainsUntil(tab, (state) => state.reconciled && state.pending.size === 0, "the pend to be saved");
    await saved(host, tab, "the brain to be saved");
    assert.equal(connectionStatus(tab.store.getSnapshot()), "connected");
  });

  it("runs the project's program at every start once the catalog arrives, for a tab that connected before the program first ran", async () => {
    const host = new FakeProjfsHost();
    const authoring = openTab();
    const running = startColumn(host, PACK_CATALOG);
    broker(running, authoring);
    await brainsUntil(authoring, (state) => state.reconciled, "the authoring editor to reconcile");
    const id = authorPackBrain(authoring.brains, "Walker", "sensor.walk.pressed", "actuator.walk.step");
    await saved(host, authoring, "the brain to be saved");
    const project = authoring.brains.getSnapshot().brains.get(id)?.compiled;
    assert.ok(project);
    closeTab(authoring);
    disposeColumn(running);
    const writesBeforeReopen = host.mutations.length;

    const reopened = openTab();
    const stopped = spawnColumn(host);
    broker(stopped, reopened);
    await brainsUntil(
      reopened,
      (state) => state.reconciled && state.brains.has(id) && state.pending.size === 0,
      "the reopened editor to reconcile"
    );
    stopped.frame.programPings();
    stopped.frame.programPosts(PACK_CATALOG);
    await storeUntil(reopened, (state) => state.catalogText !== undefined, "the catalog to arrive");
    await brainsUntil(
      reopened,
      (state) => state.pending.size === 0 && state.pushesInFlight === 0,
      "the reopened editor to settle"
    );
    stopped.frame.programPings();

    assert.deepEqual(reopened.brains.getSnapshot().brains.get(id)?.compiled, project);
    assert.deepEqual(readBrainsModule(host.file(BRAINS_MODULE_FILE) ?? "").entries.get(id)?.bytecode, project.bytecode);
    assert.deepEqual(
      host.mutations.slice(writesBeforeReopen).filter((mutation) => mutation === `write ${BRAINS_MODULE_FILE}`),
      [],
      "the project's compiled form is never rewritten"
    );
    for (const update of postedProgramUpdates(stopped.frame.posted)) {
      if (update.documentId === id) assert.deepEqual(update.bytecode, project.bytecode);
    }
  });

  it("keeps the brains of two tab and column pairs, for two projects, apart", async () => {
    const hostA = new FakeProjfsHost();
    const hostB = new FakeProjfsHost();
    const tabA = openTab();
    const tabB = openTab();
    broker(startColumn(hostA), tabA);
    broker(startColumn(hostB), tabB);
    await brainsUntil(tabA, (state) => state.reconciled, "the first editor to reconcile");
    await brainsUntil(tabB, (state) => state.reconciled, "the second editor to reconcile");

    const inA = authorBrain(tabA.brains, "Chaser");
    const inB = authorBrain(tabB.brains, "Runner");
    await saved(hostA, tabA, "the first project's brain to be saved");
    await saved(hostB, tabB, "the second project's brain to be saved");

    assert.deepEqual([...tabA.brains.getSnapshot().brains.keys()], [inA]);
    assert.deepEqual([...tabB.brains.getSnapshot().brains.keys()], [inB]);
    assert.notEqual(hostA.file(`brains/${inA}.src.json`), undefined);
    assert.equal(hostA.file(`brains/${inB}.src.json`), undefined);
    assert.notEqual(hostB.file(`brains/${inB}.src.json`), undefined);
    assert.equal(hostB.file(`brains/${inA}.src.json`), undefined);
  });

  it("holds a column frame speaking a newer protocol off with the version code, until a re-brokered port pairs it with one this editor speaks", async () => {
    const host = new FakeProjfsHost();
    const tab = openTab();
    const newer = channel();
    tab.session.attachPort(messagePortSessionPort(newer.port2));
    newer.port1.postMessage({
      type: "makecode:hello",
      payload: { protocolVersion: MAKECODE_SESSION_PROTOCOL_VERSION + 1, declaration: { target: "arcade" } },
    });

    const rejected = await storeUntil(
      tab,
      (state) => state.errorCode === PeerSessionErrorCode.PROTOCOL_VERSION_NEWER,
      "the version rejection"
    );
    assert.equal(rejected.status, "disconnected");
    assert.equal(connectionStatus(rejected), "update");
    assert.equal(tab.brains.getSnapshot().reconciled, false);

    broker(startColumn(host), tab);
    const paired = await storeUntil(tab, (state) => state.status === "connected", "the re-brokered pairing");

    assert.equal(paired.errorCode, undefined);
    await brainsUntil(tab, (state) => state.reconciled, "the editor to reconcile");
  });

  describe("with a scripted column frame", () => {
    /** A scripted column frame over `project` on `port`, closed by the spec's cleanup. */
    function scriptOn(
      port: MessagePort,
      project: Map<string, MakeCodeWireBrain>,
      reportsCompiled = false
    ): ScriptedColumn {
      const column = new ScriptedColumn(port, project, reportsCompiled);
      scripted.push(column);
      return column;
    }

    /** Brokers a fresh port pair between a new scripted column frame over `project` and `tab`. */
    function brokerScripted(tab: EditorTab, project: Map<string, MakeCodeWireBrain>): ScriptedColumn {
      const { port1, port2 } = channel();
      const column = scriptOn(port1, project);
      tab.session.attachPort(messagePortSessionPort(port2));
      return column;
    }

    /**
     * Pairs a new editor tab with a new scripted column frame over `project`
     * and resolves once the editor has reconciled -- the column frame
     * answered its list and every pull it needed.
     */
    async function pair(project: Map<string, MakeCodeWireBrain>): Promise<{ tab: EditorTab; simx: ScriptedColumn }> {
      const tab = openTab();
      const simx = brokerScripted(tab, project);
      await eventually(
        () => simx.requestsOf("makecode:brainsList").length,
        (count) => count > 0,
        "the editor's list"
      );
      await brainsUntil(tab, (state) => state.brains.size === project.size, "the editor to reconcile");
      return { tab, simx };
    }

    /** Re-brokers `tab` away from `simx`, closing it, and resolves with the far end of the fresh port. */
    async function dropSimx(simx: ScriptedColumn, tab: EditorTab): Promise<MessagePort> {
      const far = await rebroker(tab);
      simx.close();
      return far;
    }

    it("pushes an authored brain to the project, source and compiled form of one compile, and holds nothing pending", async () => {
      const { tab, simx } = await pair(projectOf());
      const { brains } = tab;

      const id = brains.addBrain("Chaser");
      const edited = brains.getBrain(id);
      assert.ok(edited);
      authorCompilingRule(brains.getSnapshot().environment, edited);
      brains.applyBrain(edited);
      const entry = brains.getSnapshot().brains.get(id);
      assert.ok(entry?.compiled);
      const stored = await eventually(
        () => simx.project.get(id),
        (brain) => brain?.source === entry.source,
        "the applied brain to reach the project"
      );

      assert.deepEqual(stored, {
        id,
        name: "Chaser",
        source: entry.source,
        compiled: { bytecode: Buffer.from(entry.compiled.bytecode).toString("base64"), sourceHash: entry.sourceHash },
      });
      await brainsUntil(tab, (state) => state.pending.size === 0, "nothing pending");
    });

    it("flushes the pends of a disconnection over a re-brokered port, deletions included, clearing them on the acks", async () => {
      const { tab, simx } = await pair(projectOf());
      const { brains } = tab;
      const kept = brains.addBrain("Chaser");
      const removed = brains.addBrain("Runner");
      await eventually(
        () => simx.project.size,
        (size) => size === 2,
        "both brains to reach the project"
      );
      const far = await dropSimx(simx, tab);

      brains.renameBrain(kept, "Hider");
      brains.removeBrain(removed);
      const added = brains.addBrain("Seeker");
      assert.deepEqual([...brains.getSnapshot().pending].sort(), [kept, removed, added].sort());
      const returned = scriptOn(far, simx.project);

      await brainsUntil(tab, (state) => state.pending.size === 0, "the pends to clear");
      assert.deepEqual([...returned.project.keys()].sort(), [kept, added].sort());
      assert.equal(returned.project.get(kept)?.name, "Hider");
      assert.ok(
        returned
          .requestsOf("makecode:brainsPush")
          .some((request) => request.type === "makecode:brainsPush" && request.payload.op === "remove")
      );
    });

    it("keeps brains and pends through a re-brokered port to the same project, then flushes them", async () => {
      const remote = projectBrain("Remote");
      const { tab, simx } = await pair(projectOf(remote));
      const { brains } = tab;
      const far = await dropSimx(simx, tab);
      const offline = brains.addBrain("Offline");
      brains.renameBrain(remote.id, "Renamed offline");

      const resumed = scriptOn(far, simx.project);
      await eventually(
        () => resumed.requestsOf("makecode:brainsList").length,
        (count) => count > 0,
        "the re-brokered handshake's list"
      );
      await brainsUntil(tab, (state) => state.pending.size === 0, "the pends to clear");

      assert.deepEqual([...brains.getSnapshot().brains.keys()], [remote.id, offline]);
      assert.equal(brains.getSnapshot().brains.get(remote.id)?.name, "Renamed offline");
      assert.equal(resumed.project.get(remote.id)?.name, "Renamed offline");
      assert.equal(resumed.project.has(offline), true);
    });

    it("recompiles a brain whose source was edited out of band and pushes the fresh pair", async () => {
      const original = projectBrain("Remote");
      const edited = { ...original, source: editedOutOfBand(original) };
      const { tab, simx } = await pair(projectOf(edited));

      const stored = await eventually(
        () => simx.project.get(edited.id),
        (brain) => brain?.compiled?.sourceHash === brainSourceHash(edited.source),
        "the recompiled pair to reach the project"
      );

      assert.equal(stored?.source, edited.source);
      const entry = tab.brains.getSnapshot().brains.get(edited.id);
      assert.equal(entry?.compiled?.sourceHash, brainSourceHash(edited.source));
      const bytes = new Uint8Array(Buffer.from(stored?.compiled?.bytecode ?? "", "base64"));
      const program = linkedBrainProgramFromBytes(stream.byteArrayFromUint8Array(bytes), {
        precision: MAKECODE_VM_PRECISION,
        typeRegistry: tab.brains.getSnapshot().environment.brainServices.runtime.types,
      });
      assert.equal(program.profileId, 2001);
    });

    it("lists a corrupt source as damaged without overwriting it, keeping the held copy for a re-push on request", async () => {
      const remote = projectBrain("Remote");
      const { tab, simx } = await pair(projectOf(remote));
      const { brains } = tab;
      const held = brains.getSnapshot().brains.get(remote.id);
      const far = await dropSimx(simx, tab);
      simx.project.set(remote.id, { ...remote, source: "not json {" });

      const returned = scriptOn(far, simx.project);
      const state = await brainsUntil(tab, (s) => s.damaged.size === 1, "the damage to be listed");

      assert.equal(state.damaged.get(remote.id)?.code, BRAIN_SOURCE_INVALID);
      assert.equal(state.brains.get(remote.id), held);
      await delay(50);
      assert.deepEqual(returned.requestsOf("makecode:brainsPush"), []);
      assert.equal(returned.project.get(remote.id)?.source, "not json {");

      brains.repushBrain(remote.id);
      await brainsUntil(tab, (s) => s.damaged.size === 0, "the re-push to clear the damage");
      assert.equal(returned.project.get(remote.id)?.source, held?.source);
    });

    it("lists a source whose embedded id differs from its address as damaged, pushing nothing", async () => {
      const addressed = projectBrain("Addressed");
      const mismatched = { ...addressed, source: projectBrain("Embedded").source };
      const tab = openTab();

      const simx = brokerScripted(tab, projectOf(mismatched));
      const state = await brainsUntil(tab, (s) => s.damaged.size === 1, "the damage to be listed");

      assert.equal(state.damaged.get(addressed.id)?.code, BRAIN_SOURCE_ID_MISMATCH);
      assert.equal(state.brains.size, 0);
      await delay(50);
      assert.deepEqual(simx.requestsOf("makecode:brainsPush"), []);
    });

    it("keeps an edit made while a pull is in flight over the pulled copy, and flushes it after", async () => {
      const remote = projectBrain("Remote");
      const { tab, simx } = await pair(projectOf(remote));
      const far = await dropSimx(simx, tab);
      simx.project.set(remote.id, { ...remote, source: editedOutOfBand(remote) });

      const returned = scriptOn(far, simx.project);
      returned.held = true;
      await eventually(
        () => returned.requestsOf("makecode:brainsList").length,
        (count) => count === 1,
        "the held list"
      );
      returned.release();
      returned.held = true;
      await eventually(
        () => returned.requestsOf("makecode:brainsPull").length,
        (count) => count === 1,
        "the held pull"
      );
      tab.brains.renameBrain(remote.id, "Local");
      returned.release();

      await brainsUntil(tab, (state) => state.pending.size === 0, "the local edit to flush");
      assert.equal(tab.brains.getSnapshot().brains.get(remote.id)?.name, "Local");
      assert.equal(returned.project.get(remote.id)?.name, "Local");
    });

    it("takes no action on the list of a column frame that reports no compiled forms, through handshake after handshake", async () => {
      const remote = projectBrain("Remote");
      const { tab, simx } = await pair(projectOf(remote));
      let far = await dropSimx(simx, tab);
      const { compiled: _compiled, ...sourceOnly } = remote;
      simx.project.set(remote.id, sourceOnly);

      for (let round = 0; round < 3; round++) {
        const returned = scriptOn(far, simx.project);
        await eventually(
          () => returned.requestsOf("makecode:brainsList").length,
          (count) => count > 0,
          "the returning column frame's list"
        );
        await brainsUntil(tab, (state) => state.reconciled, "the editor to reconcile");
        await delay(50);

        assert.deepEqual(returned.requestsOf("makecode:brainsPull"), []);
        assert.deepEqual(returned.requestsOf("makecode:brainsPush"), []);
        far = await dropSimx(returned, tab);
      }
      assert.equal(simx.project.get(remote.id), sourceOnly);
    });

    it("pulls and heals a brain whose compiled form a reporting column frame lists as missing, once", async () => {
      const remote = projectBrain("Remote");
      const { tab, simx } = await pair(projectOf(remote));
      const far = await dropSimx(simx, tab);
      const { compiled: _compiled, ...sourceOnly } = remote;
      simx.project.set(remote.id, sourceOnly);

      const returned = scriptOn(far, simx.project, true);
      const stored = await eventually(
        () => returned.project.get(remote.id),
        (brain) => brain?.compiled !== undefined,
        "the recompiled pair to reach the project"
      );

      assert.equal(returned.requestsOf("makecode:brainsPull").length, 1);
      assert.equal(returned.requestsOf("makecode:brainsPush").length, 1);
      assert.deepEqual(stored?.compiled, remote.compiled);
      await brainsUntil(tab, (state) => state.pending.size === 0, "nothing pending");
    });

    it("re-runs a reconciliation whose list the column frame refused while connected, then pushes edits as they are made", async () => {
      const remote = projectBrain("Remote");
      const tab = openTab();
      const { port1, port2 } = channel();
      const simx = scriptOn(port1, projectOf(remote));
      simx.failingLists = 1;

      tab.session.attachPort(messagePortSessionPort(port2));
      await eventually(
        () => simx.requestsOf("makecode:brainsList").length,
        (count) => count === 1,
        "the refused list"
      );
      const id = tab.brains.addBrain("Local");
      assert.equal(tab.brains.getSnapshot().reconciled, false);
      await brainsUntil(tab, (state) => state.reconciled && state.pending.size === 0, "the re-run to reconcile");

      assert.equal(simx.hellos, 1);
      assert.equal(simx.requestsOf("makecode:brainsList").length, 2);
      assert.equal(tab.brains.getSnapshot().brains.get(remote.id)?.source, remote.source);
      assert.equal(simx.project.has(id), true);
      tab.brains.renameBrain(id, "Renamed");
      await eventually(
        () => simx.project.get(id)?.name,
        (name) => name === "Renamed",
        "the later edit to reach the project"
      );
    });

    it("counts a push the column frame never answers as pending and in flight, and a re-brokered port's flush lands it", async () => {
      const { tab, simx } = await pair(projectOf());
      simx.dropsPushes = true;

      const id = tab.brains.addBrain("Chaser");
      await eventually(
        () => simx.requestsOf("makecode:brainsPush").length,
        (count) => count === 1,
        "the unanswered push"
      );
      await delay(50);
      assert.deepEqual([...tab.brains.getSnapshot().pending], [id]);
      assert.equal(tab.brains.getSnapshot().pushesInFlight, 1);
      assert.equal(simx.project.has(id), false);
      const far = await dropSimx(simx, tab);
      await brainsUntil(tab, (state) => state.pushesInFlight === 0, "the unanswered push to end with its handshake");

      const returned = scriptOn(far, simx.project);
      await brainsUntil(tab, (state) => state.reconciled && state.pending.size === 0, "the flush to land");
      assert.equal(returned.project.has(id), true);
    });

    it("ignores payload types it does not know and replies to no request of its own", async () => {
      const tab = openTab();
      const simx = brokerScripted(tab, projectOf());
      await eventually(
        () => simx.requestsOf("makecode:brainsList").length,
        (count) => count > 0,
        "the editor's list"
      );
      simx.send({ type: "makecode:catalog", payload: { content: CATALOG } });
      await storeUntil(tab, (state) => state.catalogText === CATALOG, "the catalog");

      simx.send({ type: "makecode:somethingNewer", payload: { content: "not a catalog" } });
      simx.send({ type: "makecode:brainsAck", id: "no-such-request" });
      const id = tab.brains.addBrain("Chaser");
      await eventually(
        () => simx.project.has(id),
        (held) => held,
        "the brain to reach the project"
      );

      assert.equal(tab.store.getSnapshot().catalogText, CATALOG);
      assert.equal(tab.brains.getSnapshot().pending.size, 0);
    });
  });

  describe("with the column frame over a MakeCode project", () => {
    let host: FakeProjfsHost;

    beforeEach(() => {
      host = new FakeProjfsHost();
    });

    /**
     * Pairs a new editor tab with a new column frame over the spec's project,
     * its program posting `catalog`, and resolves once the editor has
     * reconciled.
     */
    async function pairReal(catalog = CATALOG): Promise<{ tab: EditorTab; column: ColumnFrame }> {
      const column = startColumn(host, catalog);
      const tab = openTab();
      broker(column, tab);
      await brainsUntil(tab, (state) => state.reconciled, "the editor to reconcile");
      return { tab, column };
    }

    /**
     * Restarts the simulator for a fresh editor tab: `tab` closes, `column`
     * goes, and a new column frame over the same project, its program posting
     * `catalog`, is brokered to a new editor tab. Returns the new tab.
     */
    function reopenReal(tab: EditorTab, column: ColumnFrame, catalog = CATALOG): EditorTab {
      closeTab(tab);
      disposeColumn(column);
      const fresh = openTab();
      broker(startColumn(host, catalog), fresh);
      return fresh;
    }

    /** The project's brains module read back with the simx's own reader. */
    function registrations(): ReturnType<typeof readBrainsModule>["entries"] {
      const reading = readBrainsModule(host.file(BRAINS_MODULE_FILE) ?? "");
      assert.deepEqual(reading.problems, []);
      return reading.entries;
    }

    /** How many times the project's brains module has been written. */
    function moduleWrites(): number {
      return host.mutations.filter((mutation) => mutation === `write ${BRAINS_MODULE_FILE}`).length;
    }

    it("saves the program's pack vocabulary as ids.g.ts, which a fresh editor tab adopts without writing", async () => {
      const { tab, column } = await pairReal(CHIME_CATALOG);
      await eventually(
        () => host.file(IDS_MODULE_FILE),
        (text) => text !== undefined,
        "the ids module to be written"
      );
      const ringId = tab.brains.getSnapshot().environment.brainServices.runtime.actions.getByKey("actuator.chime.ring");
      assert.equal(ringId?.binding === "host" && ringId.id, 1024);
      assert.deepEqual(readIdsModule(host.file(IDS_MODULE_FILE) ?? ""), {
        manifest: {
          actions: [{ name: "actuator.chime.ring", id: 1024 }],
          operators: [],
          types: [],
          next: { action: 1025, operator: 1024, atom: 1024 },
        },
      });

      const fresh = reopenReal(tab, column, CHIME_CATALOG);
      await brainsUntil(fresh, (state) => state.reconciled, "the fresh editor to reconcile");
      const adopted = fresh.brains
        .getSnapshot()
        .environment.brainServices.runtime.actions.getByKey("actuator.chime.ring");

      assert.equal(adopted?.binding === "host" && adopted.id, 1024);
      assert.deepEqual(
        host.mutations.filter((mutation) => mutation === `write ${IDS_MODULE_FILE}`),
        [`write ${IDS_MODULE_FILE}`]
      );
    });

    it("heals an ids module damaged by hand at the next handshake, rewriting it from the allocation", async () => {
      const { tab, column } = await pairReal(CHIME_CATALOG);
      const written = await eventually(
        () => host.file(IDS_MODULE_FILE),
        (text) => text !== undefined,
        "the ids module to be written"
      );
      closeTab(tab);
      host.edit(IDS_MODULE_FILE, "// typed over by hand\n");
      disposeColumn(column);
      broker(startColumn(host, CHIME_CATALOG), openTab());

      await eventually(
        () => host.file(IDS_MODULE_FILE),
        (text) => text === written,
        "the ids module to be rewritten"
      );
    });

    it("saves an authored brain in both forms, and a fresh editor tab after a simulator restart pulls it back", async () => {
      const { tab, column } = await pairReal();

      const id = authorBrain(tab.brains, "Chaser");
      await saved(host, tab, "the brain to be saved");
      const stored = tab.brains.getSnapshot().brains.get(id);
      assert.ok(stored?.compiled);
      assert.equal(host.file(`brains/${id}.src.json`), stored.source);
      assert.deepEqual(registrations().get(id), {
        id,
        name: "Chaser",
        sourceHash: stored.sourceHash,
        bytecode: stored.compiled.bytecode,
      });

      const fresh = reopenReal(tab, column);
      const pulled = await brainsUntil(fresh, (state) => state.brains.has(id), "the fresh editor to pull the brain");

      assert.equal(pulled.brains.get(id)?.source, stored.source);
      assert.deepEqual(pulled.brains.get(id)?.compiled?.bytecode, stored.compiled.bytecode);
      assert.equal(pulled.pending.size, 0);
      assert.equal(pulled.damaged.size, 0);
    });

    it("saves a re-edit of a saved brain in both forms, and a fresh editor tab pulls the re-edit back", async () => {
      const { tab, column } = await pairReal();
      const id = authorBrain(tab.brains, "Chaser");
      await saved(host, tab, "the first version to be saved");
      const first = tab.brains.getSnapshot().brains.get(id);
      assert.ok(first?.compiled);

      reopenWithSecondRule(tab.brains, id);
      await saved(host, tab, "the re-edit to be saved");

      const second = tab.brains.getSnapshot().brains.get(id);
      assert.ok(second?.compiled);
      assert.notEqual(second.source, first.source);
      assert.equal(host.file(`brains/${id}.src.json`), second.source);
      assert.equal(registrations().get(id)?.sourceHash, second.sourceHash);
      assert.deepEqual(registrations().get(id)?.bytecode, second.compiled.bytecode);

      const fresh = reopenReal(tab, column);
      const pulled = await brainsUntil(
        fresh,
        (state) => state.reconciled && state.brains.has(id),
        "the fresh editor to pull the re-edit"
      );
      assert.equal(pulled.brains.get(id)?.source, second.source);
      assert.equal(pageRules(fresh.brains, id), 2);
      await delay(100);
      assert.equal(host.file(`brains/${id}.src.json`), second.source);
      assert.equal(registrations().get(id)?.sourceHash, second.sourceHash);
    });

    it("saves only the latest of two re-edits of a saved brain that reach one drain, acknowledging both", async () => {
      const { tab } = await pairReal();
      const id = authorBrain(tab.brains, "Chaser");
      await saved(host, tab, "the first version to be saved");
      const mutationsBefore = host.mutations.length;
      host.hold();

      reopenWithSecondRule(tab.brains, id);
      reopenWithSecondRule(tab.brains, id);
      const latest = tab.brains.getSnapshot().brains.get(id);
      assert.ok(latest?.compiled);
      host.release();
      await saved(host, tab, "the latest re-edit to be saved");

      assert.equal(host.file(`brains/${id}.src.json`), latest.source);
      assert.equal(pageRules(tab.brains, id), 3);
      assert.equal(registrations().get(id)?.sourceHash, latest.sourceHash);
      assert.deepEqual(host.mutations.slice(mutationsBefore), [
        `write ${BRAINS_MODULE_FILE}`,
        `write brains/${id}.src.json`,
      ]);
      await brainsUntil(tab, (state) => state.pending.size === 0, "both pushes to be acknowledged");
    });

    it("removes a saved brain whose re-edit and removal reach one drain, in both forms", async () => {
      const { tab } = await pairReal();
      const kept = authorBrain(tab.brains, "Kept");
      const id = authorBrain(tab.brains, "Chaser");
      await saved(host, tab, "both brains to be saved");
      host.hold();

      reopenWithSecondRule(tab.brains, id);
      tab.brains.removeBrain(id);
      host.release();
      await saved(host, tab, "the removal to be saved");

      assert.equal(host.file(`brains/${id}.src.json`), undefined);
      assert.deepEqual([...registrations().keys()], [kept]);
      await brainsUntil(tab, (state) => state.pending.size === 0, "both pushes to be acknowledged");
    });

    it("keeps re-edits of a brain whose files are open in MakeCode's text editor through file switches", async () => {
      const { tab } = await pairReal();
      const id = authorBrain(tab.brains, "Chaser");
      await saved(host, tab, "the first version to be saved");
      host.openInEditor(`brains/${id}.src.json`);

      reopenWithSecondRule(tab.brains, id);
      await saved(host, tab, "the re-edit to be saved");
      host.openInEditor(BRAINS_MODULE_FILE);

      const second = tab.brains.getSnapshot().brains.get(id);
      assert.ok(second);
      assert.equal(host.file(`brains/${id}.src.json`), second.source);

      reopenWithSecondRule(tab.brains, id);
      await saved(host, tab, "the second re-edit to be saved");
      host.closeEditor();

      const third = tab.brains.getSnapshot().brains.get(id);
      assert.ok(third);
      assert.equal(pageRules(tab.brains, id), 3);
      assert.equal(host.file(`brains/${id}.src.json`), third.source);
      assert.equal(registrations().get(id)?.sourceHash, third.sourceHash);
    });

    it("saves an open source file's old text over a re-edit on a file switch when MakeCode does not reload it", async () => {
      host.reloadsOpenFile = false;
      const { tab } = await pairReal();
      const id = authorBrain(tab.brains, "Chaser");
      await saved(host, tab, "the first version to be saved");
      const first = host.file(`brains/${id}.src.json`);
      host.openInEditor(`brains/${id}.src.json`);

      reopenWithSecondRule(tab.brains, id);
      await saved(host, tab, "the re-edit to be saved");
      host.closeEditor();

      assert.equal(host.file(`brains/${id}.src.json`), first);
    });

    it("recompiles a source edited by hand in MakeCode and saves the fresh pair", async () => {
      const { tab, column } = await pairReal();
      const id = authorBrain(tab.brains, "Chaser");
      await saved(host, tab, "the brain to be saved");
      const edited = editedOutOfBand({ source: host.file(`brains/${id}.src.json`) ?? "" });
      host.edit(`brains/${id}.src.json`, edited);

      restartColumn(column, tab);
      await eventually(
        () => registrations().get(id)?.sourceHash,
        (hash) => hash === brainSourceHash(edited),
        "the recompiled pair to be saved"
      );

      assert.equal(host.file(`brains/${id}.src.json`), edited);
      assert.equal(tab.brains.getSnapshot().brains.get(id)?.source, edited);
      const program = linkedBrainProgramFromBytes(
        stream.byteArrayFromUint8Array(registrations().get(id)?.bytecode ?? new Uint8Array()),
        {
          precision: MAKECODE_VM_PRECISION,
          typeRegistry: tab.brains.getSnapshot().environment.brainServices.runtime.types,
        }
      );
      assert.equal(program.profileId, 2001);
    });

    it("lists a source mangled in MakeCode as damaged, and a Restore saves the held copy over it", async () => {
      const { tab, column } = await pairReal();
      const id = authorBrain(tab.brains, "Chaser");
      await saved(host, tab, "the brain to be saved");
      const held = tab.brains.getSnapshot().brains.get(id)?.source;
      host.edit(`brains/${id}.src.json`, "not json {");

      restartColumn(column, tab);
      const damaged = await brainsUntil(
        tab,
        (state) => state.damaged.has(id) && state.reconciled,
        "the damage to be listed"
      );
      assert.equal(damaged.damaged.get(id)?.code, BRAIN_SOURCE_INVALID);
      assert.equal(damaged.damaged.get(id)?.name, "Chaser");
      assert.equal(host.file(`brains/${id}.src.json`), "not json {");
      tab.brains.repushBrain(id);

      await brainsUntil(tab, (state) => state.damaged.size === 0, "the restore to clear the damage");
      assert.equal(host.file(`brains/${id}.src.json`), held);
    });

    it("serves the brains of an unreadable brains.g.ts without compiled forms, which a fresh editor tab recompiles and saves", async () => {
      const { tab, column } = await pairReal();
      const first = authorBrain(tab.brains, "Chaser");
      const second = authorBrain(tab.brains, "Runner");
      await saved(host, tab, "both brains to be saved");
      host.edit(BRAINS_MODULE_FILE, "garbage");

      const fresh = reopenReal(tab, column);

      await eventually(
        () => readBrainsModule(host.file(BRAINS_MODULE_FILE) ?? "").entries.size,
        (size) => size === 2,
        "the brains module to register both brains again"
      );
      assert.deepEqual([...registrations().keys()].sort(), [first, second].sort());
      assert.equal(fresh.brains.getSnapshot().damaged.size, 0);
    });

    it("heals a brains.g.ts declaring its brains in a superseded namespace at a fresh editor tab, sources intact", async () => {
      const { tab, column } = await pairReal();
      const ids = [authorBrain(tab.brains, "Chaser"), authorBrain(tab.brains, "Runner")];
      await saved(host, tab, "both brains to be saved");
      const healthy = host.file(BRAINS_MODULE_FILE) ?? "";
      const sources = ids.map((id) => host.file(`brains/${id}.src.json`));
      host.edit(BRAINS_MODULE_FILE, healthy.replace("namespace wendooBrains {", "namespace wendooPrograms {"));

      const fresh = reopenReal(tab, column);

      await eventually(
        () => host.file(BRAINS_MODULE_FILE),
        (text) => text === healthy,
        "the brains module to be rewritten whole in the current namespace"
      );
      assert.deepEqual(
        ids.map((id) => host.file(`brains/${id}.src.json`)),
        sources
      );
      assert.equal(fresh.brains.getSnapshot().damaged.size, 0);
    });

    it("heals a deleted brains.g.ts at a fresh editor tab, registering every brain's recompiled form", async () => {
      const { tab, column } = await pairReal();
      const ids = [authorBrain(tab.brains, "Chaser"), authorBrain(tab.brains, "Runner")];
      await saved(host, tab, "both brains to be saved");
      host.remove(BRAINS_MODULE_FILE);

      const fresh = reopenReal(tab, column);
      await brainsUntil(fresh, (state) => state.reconciled && state.brains.size === 2, "the fresh editor");
      await saved(host, fresh, "brains.g.ts to be regenerated");

      for (const id of ids) {
        const entry = fresh.brains.getSnapshot().brains.get(id);
        assert.ok(entry?.compiled);
        assert.deepEqual(registrations().get(id), {
          id,
          name: entry.name,
          sourceHash: entry.sourceHash,
          bytecode: entry.compiled.bytecode,
        });
      }
    });

    it("heals a deleted brains.g.ts at the same editor's next handshake, registering every brain's recompiled form", async () => {
      const { tab, column } = await pairReal();
      const ids = [authorBrain(tab.brains, "Chaser"), authorBrain(tab.brains, "Runner")];
      await saved(host, tab, "both brains to be saved");
      host.remove(BRAINS_MODULE_FILE);

      restartColumn(column, tab);
      await saved(host, tab, "brains.g.ts to be regenerated");

      for (const id of ids) {
        const entry = tab.brains.getSnapshot().brains.get(id);
        assert.ok(entry?.compiled);
        assert.equal(entry.compiled.sourceHash, entry.sourceHash);
        assert.deepEqual(registrations().get(id), {
          id,
          name: entry.name,
          sourceHash: entry.sourceHash,
          bytecode: entry.compiled.bytecode,
        });
        const program = linkedBrainProgramFromBytes(stream.byteArrayFromUint8Array(entry.compiled.bytecode), {
          precision: MAKECODE_VM_PRECISION,
          typeRegistry: tab.brains.getSnapshot().environment.brainServices.runtime.types,
        });
        assert.equal(program.profileId, 2001);
      }
      await brainsUntil(tab, (state) => state.pending.size === 0, "nothing pending");
    });

    it("heals a malformed and a stale registration at the next handshake, leaving another brain's files untouched", async () => {
      const { tab, column } = await pairReal();
      const kept = authorBrain(tab.brains, "Kept");
      const malformed = authorBrain(tab.brains, "Malformed");
      const stale = authorBrain(tab.brains, "Stale");
      await saved(host, tab, "the brains to be saved");
      const keptRegistration = registrations().get(kept);
      const staleHash = tab.brains.getSnapshot().brains.get(stale)?.sourceHash;
      const text = host.file(BRAINS_MODULE_FILE) ?? "";
      host.edit(
        BRAINS_MODULE_FILE,
        text
          .replace(`"${malformed}", "Malformed", hex\``, `"${malformed}", Malformed, hex\``)
          .replace(`// source-hash ${staleHash}`, "// source-hash 00000000")
      );
      const mutationsBefore = host.mutations.length;

      restartColumn(column, tab);
      await saved(host, tab, "both damaged registrations to be healed");

      assert.deepEqual(registrations().get(kept), keptRegistration);
      assert.equal(registrations().get(stale)?.sourceHash, staleHash);
      assert.ok(!host.mutations.slice(mutationsBefore).includes(`write brains/${kept}.src.json`));
    });

    it("saves a burst of edits made while disconnected with fewer brains.g.ts writes than pushes", async () => {
      const { tab, column } = await pairReal();
      const far = await rebroker(tab);
      const ids = ["A", "B", "C", "D", "E"].map((name) => authorBrain(tab.brains, name));
      const writesBefore = moduleWrites();

      column.frame.brokerPort(far);
      await brainsUntil(tab, (state) => state.reconciled && state.pending.size === 0, "the burst to be pushed");
      await saved(host, tab, "the burst to be saved");

      assert.deepEqual([...registrations().keys()].sort(), [...ids].sort());
      for (const id of ids)
        assert.equal(host.file(`brains/${id}.src.json`), tab.brains.getSnapshot().brains.get(id)?.source);
      assert.ok(moduleWrites() - writesBefore < ids.length);
    });

    it("saves a burst of edits over MakeCode's write rate completely, with no push failing", async () => {
      const { tab, column } = await pairReal();
      const far = await rebroker(tab);
      const ids = Array.from({ length: PROJFS_RATE_LIMIT + 5 }, (_, index) => authorBrain(tab.brains, `B${index}`));

      column.frame.brokerPort(far);
      await eventually(
        () => host.mutations.length,
        (count) => count >= PROJFS_RATE_LIMIT,
        "MakeCode to apply the writes its rate allows"
      );
      await delay(100);
      assert.ok(tab.brains.getSnapshot().pending.size > 0);
      host.now += PROJFS_RATE_WINDOW_MS;
      await saved(host, tab, "the whole burst to be saved");
      await brainsUntil(tab, (state) => state.pending.size === 0, "every push to be acknowledged");

      assert.deepEqual([...registrations().keys()].sort(), [...ids].sort());
    });

    it("leaves part of the same burst pending when MakeCode refuses writes over its rate", async () => {
      host.defersOverRate = false;
      const { tab, column } = await pairReal();
      const far = await rebroker(tab);
      Array.from({ length: PROJFS_RATE_LIMIT + 5 }, (_, index) => authorBrain(tab.brains, `B${index}`));

      column.frame.brokerPort(far);
      await brainsUntil(tab, (state) => state.reconciled, "the editor to reconcile");
      await delay(200);

      assert.ok(tab.brains.getSnapshot().pending.size > 0);
      assert.ok(host.listed.filter((name) => name.endsWith(".src.json")).length < PROJFS_RATE_LIMIT + 5);
    });

    it("keeps an edit pending while MakeCode refuses the save, and saves it once a later handshake can", async () => {
      const { tab, column } = await pairReal();
      host.edit(FILLER, "x".repeat(PROJFS_SCOPE_QUOTA_BYTES));

      const id = authorBrain(tab.brains, "Chaser");
      await delay(100);
      assert.deepEqual([...tab.brains.getSnapshot().pending], [id]);
      assert.equal(host.file(`brains/${id}.src.json`), undefined);
      host.remove(FILLER);
      restartColumn(column, tab);

      await brainsUntil(tab, (state) => state.reconciled && state.pending.size === 0, "the pend to be pushed");
      await saved(host, tab, "the pend to be saved");
      assert.ok(registrations().has(id));
    });

    it("saves an edit MakeCode refused once the refusal has passed, by retrying over the same handshake", async () => {
      const { tab } = await pairReal();
      let handshakes = 0;
      tab.store.onBrainsChannel(() => {
        handshakes += 1;
      });
      host.edit(FILLER, "x".repeat(PROJFS_SCOPE_QUOTA_BYTES));

      const id = authorBrain(tab.brains, "Chaser");
      await delay(100);
      assert.deepEqual([...tab.brains.getSnapshot().pending], [id]);
      host.remove(FILLER);

      await brainsUntil(tab, (state) => state.pending.size === 0, "the retry to land");
      await saved(host, tab, "the refused edit to be saved");
      assert.ok(registrations().has(id));
      assert.equal(handshakes, 0);
    });

    it("re-runs a reconciliation MakeCode refused while no project was open, once one is, with no new handshake", async () => {
      host.open = false;
      const column = startColumn(host);
      const tab = openTab();
      let handshakes = 0;
      tab.store.onBrainsChannel(() => {
        handshakes += 1;
      });
      broker(column, tab);
      await eventually(
        () => handshakes,
        (count) => count === 1,
        "the handshake"
      );
      await delay(100);
      assert.equal(tab.brains.getSnapshot().reconciled, false);
      const id = authorBrain(tab.brains, "Chaser");

      host.open = true;
      await brainsUntil(tab, (state) => state.reconciled && state.pending.size === 0, "the re-run to reconcile");
      await saved(host, tab, "the edit to be saved");

      assert.equal(handshakes, 1);
      assert.ok(registrations().has(id));
    });

    it("counts a push MakeCode has not answered yet as pending and in flight until it is applied", async () => {
      const { tab } = await pairReal();
      const id = authorBrain(tab.brains, "Chaser");
      await brainsUntil(tab, (state) => state.pending.size === 0, "the new brain to be acknowledged");
      host.hold();

      tab.brains.renameBrain(id, "Runner");
      await delay(100);
      assert.deepEqual([...tab.brains.getSnapshot().pending], [id]);
      assert.equal(tab.brains.getSnapshot().pushesInFlight, 1);
      host.release();

      await brainsUntil(
        tab,
        (state) => state.pending.size === 0 && state.pushesInFlight === 0,
        "the push to be acknowledged"
      );
      await saved(host, tab, "the brain to be saved");
    });

    it("saves continuous edits as they are made, each flush two writes, and the close flushes the last at once", async () => {
      const { tab } = await pairReal();
      const { brains } = tab;
      const id = authorBrain(brains, "Chaser");
      await saved(host, tab, "the new brain to be saved");
      await brainsUntil(tab, (state) => state.pending.size === 0, "the new brain to be acknowledged");
      const editing = openBrainEditing(brains, id);
      const working = editing.srcBrainDef;
      assert.ok(working);
      const page = working.pages().get(0) as BrainPageDef;

      const mutationsBefore = host.mutations.length;
      page.appendNewRule();
      editing.change(() => working);
      await delay(FLUSH_DEBOUNCE_MS / 2);
      assert.equal(pageRules(brains, id), 1);
      await brainsUntil(
        tab,
        (state) => state.pending.size === 0 && pageRules(brains, id) === 2,
        "the first flush to be acknowledged"
      );
      await saved(host, tab, "the first flush to be saved");
      assert.equal(host.mutations.length - mutationsBefore, 2);

      page.appendNewRule();
      editing.change(() => working);
      editing.close();

      assert.equal(pageRules(brains, id), 3);
      await brainsUntil(tab, (state) => state.pending.size === 0, "the close flush to be acknowledged");
      await saved(host, tab, "the close flush to be saved");
    });

    it("keeps two brains apart through interleaved edits: a rename and a removal both land", async () => {
      const { tab } = await pairReal();
      const kept = authorBrain(tab.brains, "Kept");
      const removed = authorBrain(tab.brains, "Removed");
      await saved(host, tab, "both brains to be saved");

      tab.brains.renameBrain(kept, "Renamed");
      tab.brains.removeBrain(removed);
      await saved(host, tab, "both edits to be saved");

      assert.equal(host.file(`brains/${removed}.src.json`), undefined);
      assert.deepEqual([...registrations().keys()], [kept]);
      assert.equal(registrations().get(kept)?.name, "Renamed");
      assert.equal(JSON.parse(host.file(`brains/${kept}.src.json`) ?? "{}").name, "Renamed");
    });
  });
});
