import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import type { BrainDef, IBrainDef, IBrainTileDef, WendooEnvironment } from "@wendoo/core/app";
import { CoreHostActions, logger, mkActuatorTileId, mkSensorTileId } from "@wendoo/core/app";
import type { BrainPageDef, BrainRuleDef } from "@wendoo/core/brain/model";
import { brainSourceHash } from "@wendoo/makecode-session";
import { serializeBrainSource } from "../../authoring/brain-source.js";
import type { BrainsSessionState } from "../services/brains-store.js";
import { BrainsStore } from "../services/brains-store.js";
import { seedBrain } from "../test-support/seed-brain.js";
import { BRAIN_FLUSH_FAILED, FLUSH_DEBOUNCE_MS, OpenEditings, openBrainEditing } from "./editing.js";

/** A connected session with no catalog, as a brains store follows it. */
const SESSION = {
  subscribe: () => () => {},
  getSnapshot: (): BrainsSessionState => ({ status: "connected", catalogText: undefined, assets: undefined }),
};

/** A disconnected session with no catalog: a store following it pends every edit. */
const DISCONNECTED = {
  subscribe: () => () => {},
  getSnapshot: (): BrainsSessionState => ({ status: "disconnected", catalogText: undefined, assets: undefined }),
};

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
  return (definition.pages().get(0) as BrainPageDef).children().get(0) as BrainRuleDef;
}

/** Appends a compiling rule's tiles to `definition`'s first rule, as an edit in the brain editor does. */
function authorRule(environment: WendooEnvironment, definition: BrainDef): void {
  const rule = firstRule(definition);
  rule.when().appendTile(tile(environment, mkSensorTileId(CoreHostActions.OnPageEntered.key)));
  rule.do().appendTile(tile(environment, mkActuatorTileId(CoreHostActions.RestartPage.key)));
}

/** A snapshot reader handing out `definition` as the dialog's `onChange` hands one out, counting its reads. */
function snapshotOf(definition: IBrainDef): { read: () => IBrainDef; reads: () => number } {
  let reads = 0;
  return {
    read: () => {
      reads += 1;
      return definition;
    },
    reads: () => reads,
  };
}

describe("openBrainEditing", () => {
  let store: BrainsStore;

  beforeEach(() => {
    mock.timers.enable({ apis: ["setTimeout"] });
    store = new BrainsStore(SESSION);
  });

  afterEach(() => {
    mock.timers.reset();
    mock.restoreAll();
  });

  it("opens with the stored document of the brain, carrying its document id and name", () => {
    const id = seedBrain(store, "Chaser");

    const editing = openBrainEditing(store, id);

    assert.equal(editing.getDocument()?.id(), id);
    assert.equal(editing.getDocument()?.name(), "Chaser");
  });

  it("opens with no document for an id the store does not hold", () => {
    assert.equal(openBrainEditing(store, "no-such-brain").getDocument(), undefined);
  });

  it("applies an edit to the store once the debounce has passed after it, compiling it, and not before", () => {
    const id = seedBrain(store, "Chaser");
    const other = seedBrain(store, "Runner");
    const before = store.getSnapshot().brains.get(id);
    const editing = openBrainEditing(store, id);
    const definition = editing.getDocument();
    assert.ok(definition);
    authorRule(store.getSnapshot().environment, definition);

    editing.change(() => definition);
    mock.timers.tick(FLUSH_DEBOUNCE_MS - 1);
    assert.equal(store.getSnapshot().brains.get(id), before);
    mock.timers.tick(1);

    const after = store.getSnapshot().brains.get(id);
    assert.ok(after);
    assert.deepEqual([...store.getSnapshot().brains.keys()], [id, other]);
    assert.notEqual(after.sourceHash, before?.sourceHash);
    assert.equal(after.compiledSourceHash, after.sourceHash);
    assert.deepEqual(after.diagnostics, []);
  });

  it("flushes a run of edits once, the debounce after the latest, reading only the latest snapshot", () => {
    const id = seedBrain(store, "Chaser");
    const editing = openBrainEditing(store, id);
    const definition = editing.getDocument();
    assert.ok(definition);
    const earlier = snapshotOf(definition);
    const latest = snapshotOf(definition);
    let published = 0;
    store.subscribe(() => {
      published += 1;
    });

    editing.change(earlier.read);
    mock.timers.tick(FLUSH_DEBOUNCE_MS - 1);
    authorRule(store.getSnapshot().environment, definition);
    editing.change(latest.read);
    mock.timers.tick(FLUSH_DEBOUNCE_MS - 1);
    assert.equal(published, 0);
    mock.timers.tick(1);

    assert.equal(earlier.reads(), 0);
    assert.equal(latest.reads(), 1);
    assert.equal(published, 1);
    assert.equal(store.getSnapshot().brains.get(id)?.diagnostics.length, 0);
  });

  it("flushes the unflushed edit at once on close, and nothing more when the debounce would have passed", () => {
    const id = seedBrain(store, "Chaser");
    const editing = openBrainEditing(store, id);
    const definition = editing.getDocument();
    assert.ok(definition);
    authorRule(store.getSnapshot().environment, definition);
    const snapshot = snapshotOf(definition);
    editing.change(snapshot.read);

    editing.close();
    const closed = store.getSnapshot().brains.get(id);
    mock.timers.tick(FLUSH_DEBOUNCE_MS);

    assert.equal(snapshot.reads(), 1);
    assert.equal(closed?.compiledSourceHash, closed?.sourceHash);
    assert.equal(store.getSnapshot().brains.get(id), closed);
  });

  it("changes nothing on close when every edit has been flushed", () => {
    const id = seedBrain(store, "Chaser");
    const editing = openBrainEditing(store, id);
    const definition = editing.getDocument();
    assert.ok(definition);
    authorRule(store.getSnapshot().environment, definition);
    const snapshot = snapshotOf(definition);
    editing.change(snapshot.read);
    mock.timers.tick(FLUSH_DEBOUNCE_MS);
    const flushed = store.getSnapshot();

    editing.close();

    assert.equal(snapshot.reads(), 1);
    assert.equal(store.getSnapshot(), flushed);
  });

  it("logs a flush whose snapshot throws by its stable code, and lands the next edit's flush", () => {
    const errors = mock.method(logger, "error", () => {});
    const id = seedBrain(store, "Chaser");
    const editing = openBrainEditing(store, id);
    const definition = editing.getDocument();
    assert.ok(definition);
    const before = store.getSnapshot();

    editing.change(() => {
      throw new Error("unserializable");
    });
    assert.doesNotThrow(() => mock.timers.tick(FLUSH_DEBOUNCE_MS));
    assert.equal(store.getSnapshot(), before);
    assert.deepEqual(
      errors.mock.calls.map((call) => call.arguments[0]),
      [BRAIN_FLUSH_FAILED]
    );

    authorRule(store.getSnapshot().environment, definition);
    editing.change(() => definition);
    mock.timers.tick(FLUSH_DEBOUNCE_MS);

    const after = store.getSnapshot().brains.get(id);
    assert.equal(after?.compiledSourceHash, after?.sourceHash);
    assert.notEqual(after, before.brains.get(id));
  });

  it("contains a flush the store's apply throws on, retrying it on close", () => {
    const errors = mock.method(logger, "error", () => {});
    const id = seedBrain(store, "Chaser");
    let applies = 0;
    const throwing = {
      getBrain: (brainId: string) => store.getBrain(brainId),
      getSnapshot: () => store.getSnapshot(),
      subscribe: (listener: () => void) => store.subscribe(listener),
      applyBrain: () => {
        applies += 1;
        throw new Error("uncompilable");
      },
    };
    const editing = openBrainEditing(throwing, id);
    const definition = editing.getDocument();
    assert.ok(definition);

    editing.change(() => definition);
    assert.doesNotThrow(() => mock.timers.tick(FLUSH_DEBOUNCE_MS));
    assert.doesNotThrow(() => editing.close());

    assert.equal(applies, 2);
    assert.deepEqual(
      errors.mock.calls.map((call) => call.arguments[0]),
      [BRAIN_FLUSH_FAILED, BRAIN_FLUSH_FAILED]
    );
  });

  it("keeps the document it opened with through every flush of its own, adopting none of them", () => {
    const id = seedBrain(store, "Chaser");
    const editing = openBrainEditing(store, id);
    const opened = editing.getDocument();
    assert.ok(opened);
    let notified = 0;
    editing.subscribe(() => {
      notified += 1;
    });
    authorRule(store.getSnapshot().environment, opened);

    editing.change(() => opened);
    mock.timers.tick(FLUSH_DEBOUNCE_MS);
    editing.close();

    assert.equal(store.getSnapshot().brains.get(id)?.sourceHash, brainSourceHash(serializeBrainSource(opened)));
    assert.equal(editing.getDocument(), opened);
    assert.equal(notified, 0);
  });

  it("adopts the store's newer version of its brain while it holds no unflushed edit, notifying its listeners", () => {
    const id = seedBrain(store, "Chaser");
    const editing = openBrainEditing(store, id);
    const opened = editing.getDocument();
    let notified = 0;
    editing.subscribe(() => {
      notified += 1;
    });
    const newer = store.getBrain(id);
    assert.ok(newer);
    authorRule(store.getSnapshot().environment, newer);

    store.applyBrain(newer);

    const adopted = editing.getDocument();
    assert.ok(adopted);
    assert.notEqual(adopted, opened);
    assert.equal(adopted.id(), id);
    assert.equal(brainSourceHash(serializeBrainSource(adopted)), store.getSnapshot().brains.get(id)?.sourceHash);
    assert.equal(notified, 1);
    assert.equal(editing.getDocument(), adopted);
  });

  it("holds its document while it holds an unflushed edit, and its flush wins over the store's newer version", () => {
    const id = seedBrain(store, "Chaser");
    const editing = openBrainEditing(store, id);
    const opened = editing.getDocument();
    assert.ok(opened);
    let notified = 0;
    editing.subscribe(() => {
      notified += 1;
    });
    authorRule(store.getSnapshot().environment, opened);
    editing.change(() => opened);

    store.renameBrain(id, "Runner");
    assert.equal(editing.getDocument(), opened);
    mock.timers.tick(FLUSH_DEBOUNCE_MS);

    assert.equal(store.getSnapshot().brains.get(id)?.sourceHash, brainSourceHash(serializeBrainSource(opened)));
    assert.equal(store.getSnapshot().brains.get(id)?.name, "Chaser");
    assert.equal(editing.getDocument(), opened);
    assert.equal(notified, 0);
  });

  it("adopts nothing while the store holds the brain pending", () => {
    const pendingStore = new BrainsStore(DISCONNECTED);
    const id = seedBrain(pendingStore, "Chaser");
    const editing = openBrainEditing(pendingStore, id);
    const opened = editing.getDocument();
    editing.subscribe(() => {});

    pendingStore.renameBrain(id, "Runner");

    assert.ok(pendingStore.getSnapshot().pending.has(id));
    assert.equal(editing.getDocument(), opened);
  });

  it("adopts on subscribing a newer version stored while nothing was subscribed, and stops following once closed", () => {
    const id = seedBrain(store, "Chaser");
    const editing = openBrainEditing(store, id);
    const opened = editing.getDocument();
    store.renameBrain(id, "Runner");
    assert.equal(editing.getDocument(), opened);

    let notified = 0;
    editing.subscribe(() => {
      notified += 1;
    });
    const adopted = editing.getDocument();
    editing.close();
    store.renameBrain(id, "Sleeper");

    assert.notEqual(adopted, opened);
    assert.equal(adopted?.name(), "Runner");
    assert.equal(editing.getDocument(), adopted);
    assert.equal(notified, 1);
  });
});

describe("OpenEditings", () => {
  let store: BrainsStore;

  beforeEach(() => {
    mock.timers.enable({ apis: ["setTimeout"] });
    store = new BrainsStore(SESSION);
  });

  afterEach(() => {
    mock.timers.reset();
  });

  /** Opens brain `id` for editing and records an unflushed edit authoring a rule into it; returns the editing and its snapshot reader. */
  function editWithUnflushed(id: string): {
    editing: ReturnType<typeof openBrainEditing>;
    snapshot: ReturnType<typeof snapshotOf>;
  } {
    const editing = openBrainEditing(store, id);
    const definition = editing.getDocument();
    assert.ok(definition);
    authorRule(store.getSnapshot().environment, definition);
    const snapshot = snapshotOf(definition);
    editing.change(snapshot.read);
    return { editing, snapshot };
  }

  it("flushes the unflushed edit of every tracked editing at once, and none of an untracked one", () => {
    const editings = new OpenEditings();
    const first = editWithUnflushed(seedBrain(store, "Chaser"));
    const second = editWithUnflushed(seedBrain(store, "Runner"));
    const untracked = editWithUnflushed(seedBrain(store, "Sleeper"));
    editings.track(first.editing);
    const untrack = editings.track(second.editing);
    editings.track(untracked.editing)();

    editings.flushAll();

    assert.equal(first.snapshot.reads(), 1);
    assert.equal(second.snapshot.reads(), 1);
    assert.equal(untracked.snapshot.reads(), 0);
    untrack();
  });

  it("keeps a flushed editing tracked and taking edits, flushing its next unflushed edit again", () => {
    const editings = new OpenEditings();
    const { editing, snapshot } = editWithUnflushed(seedBrain(store, "Chaser"));
    editings.track(editing);
    editings.flushAll();

    editing.change(snapshot.read);
    editings.flushAll();
    editings.flushAll();

    assert.equal(snapshot.reads(), 2);
  });
});
