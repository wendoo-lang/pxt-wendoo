import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { stream } from "@wendoo/core";
import type { BrainDef, IBrainTileDef, WendooEnvironment } from "@wendoo/core/app";
import { CoreHostActions, LogLevel, logger, mkActuatorTileId, mkSensorTileId } from "@wendoo/core/app";
import { ParseDiagCode } from "@wendoo/core/brain/compiler";
import type { BrainPageDef, BrainRuleDef } from "@wendoo/core/brain/model";
import { linkedBrainProgramFromBytes } from "@wendoo/core/runtime";
import type {
  MakeCodeBrainsChannel,
  MakeCodeEditorSession,
  MakeCodeEditorSessionOptions,
  MakeCodeEditorSessionState,
  MakeCodeEditorSessionStatus,
} from "@wendoo/makecode-session";
import { brainSourceHash } from "@wendoo/makecode-session";
import { CATALOG_PACK_UNBOUND, MAKECODE_VM_PRECISION } from "./authoring-environment.js";
import { serializeBrainSource } from "./brain-source.js";
import type { BrainEntry, BrainsSessionState } from "./brains-store.js";
import { BrainsStore } from "./brains-store.js";
import { CATALOG_UNREADABLE } from "./catalog.js";
import { EditorSessionStore } from "./editor-session-store.js";

const MOTION_CATALOG = '{"packs":[{"name":"motion","tiles":[{"name":"move","kind":"actuator"}]}]}';
const SOUND_CATALOG = '{"packs":[{"name":"sound","tiles":[{"name":"beep","kind":"actuator"}]}]}';

/** The session readings a brains store follows, driven by the spec. */
class FakeSessionSource {
  state: BrainsSessionState = { status: "connected", catalogText: undefined };
  private readonly _listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  };

  getSnapshot = (): BrainsSessionState => this.state;

  /** The session reading changing by `fields`, reported to its listeners. */
  set(fields: Partial<BrainsSessionState>): void {
    this.state = { ...this.state, ...fields };
    for (const listener of this._listeners) listener();
  }
}

/** The tile `tileId` from `environment`'s catalogs. Throws when none holds it. */
function tile(environment: WendooEnvironment, tileId: string): IBrainTileDef {
  for (const catalog of environment.tileCatalogs()) {
    const found = catalog.get(tileId);
    if (found) return found;
  }
  throw new Error(`no tile ${tileId}`);
}

/** The first rule of `definition`'s first page. */
function firstRule(definition: BrainDef): BrainRuleDef {
  const page = definition.pages().get(0) as BrainPageDef;
  return page.children().get(0) as BrainRuleDef;
}

/** Authors `WHEN on page entered DO restart page` into `definition`'s first rule: a rule that compiles. */
function authorCompilingRule(environment: WendooEnvironment, definition: BrainDef): void {
  const rule = firstRule(definition);
  rule.when().appendTile(tile(environment, mkSensorTileId(CoreHostActions.OnPageEntered.key)));
  rule.do().appendTile(tile(environment, mkActuatorTileId(CoreHostActions.RestartPage.key)));
}

/** Authors an actuator on `definition`'s first WHEN side: a placement the compiler rejects with an error. */
function authorMisplacedTile(environment: WendooEnvironment, definition: BrainDef): void {
  firstRule(definition)
    .when()
    .appendTile(tile(environment, mkActuatorTileId(CoreHostActions.SwitchPage.key)));
}

/** The entry `store` holds for `id`. Fails the spec when it holds none. */
function entryOf(store: BrainsStore, id: string): BrainEntry {
  const entry = store.getSnapshot().brains.get(id);
  assert.ok(entry, `expected the store to hold brain ${id}`);
  return entry;
}

/** The brain `id` read back from `store` for editing. Fails the spec when it holds none. */
function definitionOf(store: BrainsStore, id: string): BrainDef {
  const definition = store.getBrain(id);
  assert.ok(definition, `expected the store to read brain ${id}`);
  return definition;
}

describe("brains store", () => {
  let session: FakeSessionSource;

  beforeEach(() => {
    session = new FakeSessionSource();
  });

  describe("keying", () => {
    it("adds a brain keyed by the id the upstream document machinery minted", () => {
      const store = new BrainsStore(session);

      const id = store.addBrain("Chaser");

      const entry = entryOf(store, id);
      assert.equal(JSON.parse(entry.source).id, id);
      assert.equal(id.length, 16);
      assert.deepEqual([...store.getSnapshot().brains.keys()], [id]);
    });

    it("keeps a brain's id and key through a rename, recompiling it under the renamed source", () => {
      const store = new BrainsStore(session);
      const id = store.addBrain("Chaser");
      const before = entryOf(store, id);

      store.renameBrain(id, "Runner");

      const after = entryOf(store, id);
      assert.deepEqual([...store.getSnapshot().brains.keys()], [id]);
      assert.equal(after.name, "Runner");
      assert.equal(JSON.parse(after.source).id, id);
      assert.notEqual(after.sourceHash, before.sourceHash);
      assert.equal(after.compiled?.sourceHash, after.sourceHash);
    });

    it("holds brains with empty names as distinct brains, and keeps the key when renamed to empty", () => {
      const store = new BrainsStore(session);
      const first = store.addBrain("");
      const second = store.addBrain("");
      const third = store.addBrain("Chaser");

      store.renameBrain(third, "");

      assert.equal(new Set([first, second, third]).size, 3);
      assert.deepEqual([...store.getSnapshot().brains.keys()], [first, second, third]);
      assert.equal(JSON.parse(entryOf(store, third).source).id, third);
      assert.equal(entryOf(store, third).compiled?.sourceHash, entryOf(store, third).sourceHash);
    });

    it("holds brains with duplicate names apart: a rename or removal of one leaves the other untouched", () => {
      const store = new BrainsStore(session);
      const first = store.addBrain("Chaser");
      const second = store.addBrain("Chaser");
      const secondBefore = entryOf(store, second);

      store.renameBrain(first, "Runner");
      assert.equal(entryOf(store, first).name, "Runner");
      assert.equal(entryOf(store, second), secondBefore);

      store.removeBrain(first);
      assert.deepEqual([...store.getSnapshot().brains.keys()], [second]);
      assert.equal(entryOf(store, second), secondBefore);
    });

    it("removes a brain by id, and ignores ids it does not hold", () => {
      const store = new BrainsStore(session);
      const id = store.addBrain("Chaser");
      const snapshot = store.getSnapshot();

      store.removeBrain("no-such-brain");
      store.renameBrain("no-such-brain", "Runner");
      assert.equal(store.getSnapshot(), snapshot);

      store.removeBrain(id);
      assert.equal(store.getSnapshot().brains.size, 0);
      assert.equal(store.getBrain(id), undefined);
    });

    it("stores an applied document under the id it carries", () => {
      const store = new BrainsStore(session);
      const id = store.addBrain("Chaser");
      const edited = definitionOf(store, id);
      authorCompilingRule(store.getSnapshot().environment, edited);

      store.applyBrain(edited);

      assert.deepEqual([...store.getSnapshot().brains.keys()], [id]);
    });
  });

  describe("compile on apply", () => {
    let loggedLevel: LogLevel;

    // Silences the compiler's warning log for the tiles a failing brain drops.
    before(() => {
      loggedLevel = logger.level;
      logger.level = LogLevel.ERROR;
    });

    after(() => {
      logger.level = loggedLevel;
    });

    it("compiles an applied brain to bytecode bound by hash to the exact source applied", () => {
      const store = new BrainsStore(session);
      const id = store.addBrain("Chaser");
      const edited = definitionOf(store, id);
      authorCompilingRule(store.getSnapshot().environment, edited);

      store.applyBrain(edited);

      const entry = entryOf(store, id);
      assert.equal(entry.source, serializeBrainSource(edited));
      assert.deepEqual(JSON.parse(entry.source).pages[0].rules[0].do, [
        mkActuatorTileId(CoreHostActions.RestartPage.key),
      ]);
      assert.equal(entry.sourceHash, brainSourceHash(entry.source));
      assert.deepEqual(entry.diagnostics, []);
      assert.ok(entry.compiled);
      assert.equal(entry.compiled.sourceHash, entry.sourceHash);
      const decoded = linkedBrainProgramFromBytes(stream.byteArrayFromUint8Array(entry.compiled.bytecode), {
        precision: MAKECODE_VM_PRECISION,
        typeRegistry: store.getSnapshot().environment.brainServices.runtime.types,
      });
      assert.equal(decoded.profileId, 2001);
    });

    it("keeps a failed brain's document and coded diagnostics, beside its last good compile", () => {
      const store = new BrainsStore(session);
      const id = store.addBrain("Chaser");
      const good = definitionOf(store, id);
      authorCompilingRule(store.getSnapshot().environment, good);
      store.applyBrain(good);
      const lastGood = entryOf(store, id).compiled;
      assert.ok(lastGood);

      const broken = definitionOf(store, id);
      authorMisplacedTile(store.getSnapshot().environment, broken);
      store.applyBrain(broken);

      const entry = entryOf(store, id);
      assert.equal(entry.source, serializeBrainSource(broken));
      assert.equal(entry.sourceHash, brainSourceHash(entry.source));
      assert.deepEqual(
        entry.diagnostics.filter((diagnostic) => diagnostic.severity === "error").map((diagnostic) => diagnostic.code),
        [ParseDiagCode.TilePlacementSideMismatch]
      );
      assert.equal(entry.compiled, lastGood);
      assert.notEqual(entry.compiled?.sourceHash, entry.sourceHash);
    });

    it("holds a brain whose first compile fails with its diagnostics and no compiled form", () => {
      const store = new BrainsStore(session);
      const id = store.addBrain("Chaser");
      const broken = definitionOf(store, id);
      authorMisplacedTile(store.getSnapshot().environment, broken);

      store.removeBrain(id);
      store.applyBrain(broken);

      const entry = entryOf(store, id);
      assert.equal(entry.compiled, undefined);
      assert.ok(entry.diagnostics.some((diagnostic) => diagnostic.code === ParseDiagCode.TilePlacementSideMismatch));
    });

    it("compiles each brain on its own: one brain's failure leaves another's compile in place", () => {
      const store = new BrainsStore(session);
      const healthy = store.addBrain("Chaser");
      const failing = store.addBrain("Chaser");
      const healthyDefinition = definitionOf(store, healthy);
      authorCompilingRule(store.getSnapshot().environment, healthyDefinition);
      store.applyBrain(healthyDefinition);
      const healthyEntry = entryOf(store, healthy);

      const broken = definitionOf(store, failing);
      authorMisplacedTile(store.getSnapshot().environment, broken);
      store.applyBrain(broken);

      assert.equal(entryOf(store, healthy), healthyEntry);
      assert.equal(healthyEntry.compiled?.sourceHash, healthyEntry.sourceHash);
      assert.notEqual(entryOf(store, failing).compiled?.sourceHash, entryOf(store, failing).sourceHash);
    });
  });

  describe("environment", () => {
    it("builds its environment from the session's catalog and rebuilds it when a new catalog arrives", () => {
      session.set({ catalogText: MOTION_CATALOG });
      const store = new BrainsStore(session);
      const first = store.getSnapshot();
      assert.deepEqual(first.catalogDiagnostics, [{ code: CATALOG_PACK_UNBOUND, pack: "motion" }]);

      session.set({ catalogText: SOUND_CATALOG });

      const second = store.getSnapshot();
      assert.notEqual(second.environment, first.environment);
      assert.deepEqual(second.catalogDiagnostics, [{ code: CATALOG_PACK_UNBOUND, pack: "sound" }]);
    });

    it("keeps its environment when the session republishes the same catalog", () => {
      session.set({ catalogText: MOTION_CATALOG });
      const store = new BrainsStore(session);
      const snapshot = store.getSnapshot();

      session.set({ catalogText: MOTION_CATALOG, status: "connected" });

      assert.equal(store.getSnapshot(), snapshot);
    });

    it("reads brains for editing in the current environment and compiles in it after a rebuild", () => {
      session.set({ catalogText: MOTION_CATALOG });
      const store = new BrainsStore(session);
      const id = store.addBrain("Chaser");
      const authoredBeforeRebuild = definitionOf(store, id);
      authorCompilingRule(store.getSnapshot().environment, authoredBeforeRebuild);

      session.set({ catalogText: SOUND_CATALOG });
      const rebuilt = store.getSnapshot().environment;
      store.applyBrain(authoredBeforeRebuild);

      const entry = entryOf(store, id);
      assert.equal(entry.compiled?.sourceHash, entry.sourceHash);
      assert.equal(definitionOf(store, id).servicesTypeRegistry(), rebuilt.brainServices.runtime.types);
    });

    it("keeps authoring and compiling through an unreadable catalog, reporting it by its stable code", () => {
      session.set({ catalogText: "not a catalog" });
      const store = new BrainsStore(session);

      const id = store.addBrain("Chaser");
      const edited = definitionOf(store, id);
      authorCompilingRule(store.getSnapshot().environment, edited);
      store.applyBrain(edited);

      assert.deepEqual(store.getSnapshot().catalogDiagnostics, [{ code: CATALOG_UNREADABLE }]);
      assert.equal(entryOf(store, id).compiled?.sourceHash, entryOf(store, id).sourceHash);
    });
  });

  describe("pends", () => {
    it("records brains added, applied, renamed or removed while disconnected as pending", () => {
      session.set({ status: "disconnected" });
      const store = new BrainsStore(session);

      const added = store.addBrain("Chaser");
      const applied = store.addBrain("Runner");
      const renamed = store.addBrain("Hider");
      const removed = store.addBrain("Seeker");
      session.set({ status: "connected" });
      const connectedSnapshot = store.getSnapshot();
      assert.deepEqual([...connectedSnapshot.pending], [added, applied, renamed, removed]);

      session.set({ status: "disconnected" });
      store.applyBrain(definitionOf(store, applied));
      store.renameBrain(renamed, "Finder");
      store.removeBrain(removed);

      assert.deepEqual([...store.getSnapshot().pending].sort(), [added, applied, renamed, removed].sort());
      assert.equal(store.getSnapshot().brains.has(removed), false);
    });

    it("records no pend for edits made while connected", () => {
      const store = new BrainsStore(session);

      const id = store.addBrain("Chaser");
      store.renameBrain(id, "Runner");
      store.applyBrain(definitionOf(store, id));
      store.removeBrain(store.addBrain("Seeker"));

      assert.equal(store.getSnapshot().pending.size, 0);
    });

    it("records only the brain edited while disconnected when two brains are edited across a disconnection", () => {
      const store = new BrainsStore(session);
      const editedConnected = store.addBrain("Chaser");
      const editedDisconnected = store.addBrain("Chaser");

      store.renameBrain(editedConnected, "Runner");
      session.set({ status: "disconnected" });
      store.renameBrain(editedDisconnected, "Hider");

      assert.deepEqual([...store.getSnapshot().pending], [editedDisconnected]);
    });

    it("records edits made with no session as pending", () => {
      session.set({ status: "none" });
      const store = new BrainsStore(session);

      const id = store.addBrain("Chaser");

      assert.deepEqual([...store.getSnapshot().pending], [id]);
    });
  });

  describe("snapshots", () => {
    it("publishes a new snapshot to subscribers on each change, and stops after unsubscribing", () => {
      const store = new BrainsStore(session);
      let published = 0;
      const unsubscribe = store.subscribe(() => {
        published += 1;
      });
      const before = store.getSnapshot();

      store.addBrain("Chaser");
      assert.equal(published, 1);
      assert.notEqual(store.getSnapshot(), before);

      unsubscribe();
      store.addBrain("Runner");
      assert.equal(published, 1);
    });
  });

  describe("over the editor session store", () => {
    /** An editor session reporting a live connection and delivering catalogs on the spec's word. */
    class LiveSession implements MakeCodeEditorSession {
      state: MakeCodeEditorSessionState = {
        status: "none",
        entry: undefined,
        joinCode: undefined,
        errorCode: undefined,
        target: undefined,
      };
      private readonly _stateListeners = new Set<(state: MakeCodeEditorSessionState) => void>();
      private readonly _catalogListeners = new Set<(content: string) => void>();

      onStateChange(listener: (state: MakeCodeEditorSessionState) => void): () => void {
        this._stateListeners.add(listener);
        return () => {
          this._stateListeners.delete(listener);
        };
      }

      onCatalog(listener: (content: string) => void): () => void {
        this._catalogListeners.add(listener);
        return () => {
          this._catalogListeners.delete(listener);
        };
      }

      onBrainsChannel(_listener: (channel: MakeCodeBrainsChannel) => void): () => void {
        return () => {};
      }

      start(): void {}

      stop(): void {}

      forget(): void {}

      /** The session's connectivity changing to `status`. */
      setStatus(status: MakeCodeEditorSessionStatus): void {
        this.state = { ...this.state, status };
        for (const listener of this._stateListeners) listener(this.state);
      }

      /** A catalog arriving from the MakeCode side. */
      deliver(content: string): void {
        for (const listener of this._catalogListeners) listener(content);
      }
    }

    it("follows the live session's catalog and connectivity", () => {
      const live = new LiveSession();
      const sessionStore = new EditorSessionStore({
        persistence: { load: () => undefined, save: () => {}, clear: () => {}, has: () => false },
        createSession: (_options: MakeCodeEditorSessionOptions) => live,
      });
      sessionStore.connect("ABCD");
      live.setStatus("connected");
      const store = new BrainsStore(sessionStore);

      live.deliver(MOTION_CATALOG);
      const id = store.addBrain("Chaser");
      live.setStatus("disconnected");
      store.renameBrain(id, "Runner");

      assert.deepEqual(store.getSnapshot().catalogDiagnostics, [{ code: CATALOG_PACK_UNBOUND, pack: "motion" }]);
      assert.deepEqual([...store.getSnapshot().pending], [id]);
    });
  });
});
