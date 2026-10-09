/**
 * The editor tab and the simulator extension's column frame composed over a
 * real MessageChannel, as MakeCode brokers it between the two frames: the
 * editor's session store and brains store over the port-backed session on
 * one end, the simulator extension's port bridge over an in-memory MakeCode
 * project on the other.
 */

import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { PeerSessionErrorCode } from "@wendoo/bridge-app";
import type { BrainDef, WendooEnvironment } from "@wendoo/core/app";
import { CoreHostActions, LogLevel, logger, mkActuatorTileId, mkSensorTileId } from "@wendoo/core/app";
import type { BrainPageDef, BrainRuleDef } from "@wendoo/core/brain/model";
import {
  createMakeCodePortEditorSession,
  MAKECODE_SESSION_PROTOCOL_VERSION,
  type MakeCodePortEditorSession,
  messagePortSessionPort,
} from "@wendoo/makecode-session";
import { BRAINS_MODULE_FILE, readBrainsModule } from "../../simx/brains-module.js";
import { type SimxLog, type SimxPortBridge, startSimxPortBridge } from "../../simx/simx-bridge.js";
import { FakeAssetProvider, listedImage } from "../../simx/test-support/asset-provider.js";
import { FakePortFrame } from "../../simx/test-support/port-frame.js";
import { postedProgramUpdates } from "../../simx/test-support/program-update-frame.js";
import { FakeProjfsHost } from "../../simx/test-support/projfs-host.js";
import type { ProjfsClient } from "../../vendor/projfs.js";
import { connectionStatus } from "../components/ConnectionStatus.js";
import type { BrainsViewState } from "./brains-store.js";
import { BrainsStore } from "./brains-store.js";
import { EditorSessionStore, type EditorSessionViewState } from "./editor-session-store.js";
import { tabBinding } from "./tab-binding.js";

const CATALOG = '{"packs":[]}';

/** How long a wait in these specs lasts before it fails, in milliseconds. */
const WAIT_MS = 2000;

/** A simx log keeping its lines out of the test output. */
const silentLog: SimxLog = { info() {}, error() {} };

/** Resolves with `read()` once `predicate` holds for it, polling until {@link WAIT_MS}. */
async function eventually<T>(read: () => T, predicate: (value: T) => boolean, what: string): Promise<T> {
  const deadline = Date.now() + WAIT_MS;
  for (;;) {
    const value = read();
    if (predicate(value)) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** Authors a rule that compiles into the first rule of the brain `definition`'s first page. */
function authorCompilingRule(environment: WendooEnvironment, definition: BrainDef): void {
  const rule = (definition.pages().get(0) as BrainPageDef).children().get(0) as BrainRuleDef;
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

/** The editor tab: its port-backed session, the session store over it, and the brains store over that. */
interface EditorTab {
  session: MakeCodePortEditorSession;
  store: EditorSessionStore;
  brains: BrainsStore;
}

/** The simulator extension's column frame: its window and its port bridge. */
interface ColumnFrame {
  frame: FakePortFrame;
  bridge: SimxPortBridge;
}

describe("brains sync between the editor tab and the column frame over a brokered port", () => {
  let tabs: EditorTab[];
  let columns: ColumnFrame[];
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
    clients = [];
    channels = [];
  });

  afterEach(() => {
    for (const tab of tabs) tab.store.stop();
    for (const column of columns) column.bridge.dispose();
    for (const client of clients) client.dispose();
    for (const channel of channels) {
      channel.port1.close();
      channel.port2.close();
    }
  });

  /** Opens an editor tab frame for `project`, as its boot does, before any port arrives. */
  function openTab(project: string): EditorTab {
    const session = createMakeCodePortEditorSession();
    const store = new EditorSessionStore({ persistence: tabBinding(project), createSession: () => session });
    const brains = new BrainsStore(store, store);
    assert.equal(store.resume(), true);
    const tab = { session, store, brains };
    tabs.push(tab);
    return tab;
  }

  /** Starts a column frame over `host`'s project, as MakeCode does on every spawn; the program posts the catalog. */
  function startColumn(host: FakeProjfsHost): ColumnFrame {
    const frame = new FakePortFrame();
    const files = host.client();
    clients.push(files);
    const assets = new FakeAssetProvider();
    assets.images = [listedImage("image1", [[1, 2]], "hero")];
    assets.answer();
    const bridge = startSimxPortBridge({
      frame,
      parentOrigin: "https://arcade.makecode.com",
      files,
      assets,
      log: silentLog,
      target: "arcade",
    });
    frame.programPosts(CATALOG);
    const column = { frame, bridge };
    columns.push(column);
    return column;
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
    const tab = openTab("project-a");
    assert.equal(tab.store.getSnapshot().view, "session");
    assert.equal(tab.store.getSnapshot().status, "disconnected");
    const column = startColumn(host);

    broker(column, tab);
    const state = await storeUntil(
      tab,
      (reading) => reading.projectName !== undefined && reading.assets !== undefined,
      "the project's publications"
    );

    assert.equal(state.status, "connected");
    assert.equal(state.view, "session");
    assert.equal(state.target, "arcade");
    assert.equal(state.catalogText, CATALOG);
    assert.deepEqual(
      state.assets?.map((asset) => [asset.kind, asset.id]),
      [["image", "image1"]]
    );
    assert.equal(state.joinCode, undefined);
    assert.equal(state.entry, undefined);
    assert.equal(connectionStatus(state), "connected");
    await brainsUntil(tab, (reading) => reading.reconciled, "the editor to reconcile");
  });

  it("saves a brain authored in the editor to the project in both forms, and posts its live program update to the running program", async () => {
    const host = new FakeProjfsHost();
    const tab = openTab("project-a");
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
    assert.equal(tab.brains.getSnapshot().pending.size, 0);
  });

  it("keeps brains and pends when the column frame respawns, reconciling over the fresh port's brains channel", async () => {
    const host = new FakeProjfsHost();
    const tab = openTab("project-a");
    const first = startColumn(host);
    broker(first, tab);
    await brainsUntil(tab, (state) => state.reconciled, "the editor to reconcile");
    const kept = authorBrain(tab.brains, "Chaser");
    await saved(host, tab, "the first brain to be saved");

    first.bridge.dispose();
    columns.splice(columns.indexOf(first), 1);
    const { port1, port2 } = channel();
    tab.session.attachPort(messagePortSessionPort(port2));
    await storeUntil(tab, (state) => state.status === "disconnected", "the editor to see its port replaced");
    const pended = authorBrain(tab.brains, "Runner");
    tab.brains.renameBrain(kept, "Chaser Two");
    const waiting = tab.brains.getSnapshot();
    assert.ok(waiting.pending.has(pended));
    assert.ok(waiting.pending.has(kept));

    const second = startColumn(host);
    second.frame.brokerPort(port1);
    await brainsUntil(tab, (state) => state.reconciled && state.pending.size === 0, "the pends to be saved");
    await saved(host, tab, "both brains to be saved");

    const { brains } = tab.brains.getSnapshot();
    assert.deepEqual([...brains.keys()].sort(), [kept, pended].sort());
    assert.equal(brains.get(kept)?.name, "Chaser Two");
    assert.equal(readBrainsModule(host.file(BRAINS_MODULE_FILE) ?? "").entries.get(kept)?.name, "Chaser Two");
    assert.equal(tab.store.getSnapshot().status, "connected");
  });

  it("keeps the brains of two tab and column pairs, for two projects, apart", async () => {
    const hostA = new FakeProjfsHost();
    const hostB = new FakeProjfsHost();
    const tabA = openTab("project-a");
    const tabB = openTab("project-b");
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
    const tab = openTab("project-a");
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
    assert.equal(rejected.view, "session");
    assert.equal(connectionStatus(rejected), "update");
    assert.equal(tab.brains.getSnapshot().reconciled, false);

    broker(startColumn(host), tab);
    const paired = await storeUntil(tab, (state) => state.status === "connected", "the re-brokered pairing");

    assert.equal(paired.errorCode, undefined);
    await brainsUntil(tab, (state) => state.reconciled, "the editor to reconcile");
  });
});
