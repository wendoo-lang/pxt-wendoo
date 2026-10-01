import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import type { BrainDef, IBrainDef, IBrainTileDef, WendooEnvironment } from "@wendoo/core/app";
import { CoreHostActions, logger, mkActuatorTileId, mkSensorTileId } from "@wendoo/core/app";
import type { BrainPageDef, BrainRuleDef } from "@wendoo/core/brain/model";
import type { BrainsSessionState } from "../services/brains-store.js";
import { BrainsStore } from "../services/brains-store.js";
import { BRAIN_FLUSH_FAILED, FLUSH_DEBOUNCE_MS, openBrainEditing } from "./editing.js";

/** A connected session with no catalog, as a brains store follows it. */
const SESSION = {
  subscribe: () => () => {},
  getSnapshot: (): BrainsSessionState => ({ status: "connected", catalogText: undefined }),
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
    const id = store.addBrain("Chaser");

    const editing = openBrainEditing(store, id);

    assert.equal(editing.srcBrainDef?.id(), id);
    assert.equal(editing.srcBrainDef?.name(), "Chaser");
  });

  it("opens with no document for an id the store does not hold", () => {
    assert.equal(openBrainEditing(store, "no-such-brain").srcBrainDef, undefined);
  });

  it("applies an edit to the store once the debounce has passed after it, compiling it, and not before", () => {
    const id = store.addBrain("Chaser");
    const other = store.addBrain("Runner");
    const before = store.getSnapshot().brains.get(id);
    const editing = openBrainEditing(store, id);
    const definition = editing.srcBrainDef;
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
    assert.equal(after.compiled?.sourceHash, after.sourceHash);
    assert.deepEqual(after.diagnostics, []);
  });

  it("flushes a run of edits once, the debounce after the latest, reading only the latest snapshot", () => {
    const id = store.addBrain("Chaser");
    const editing = openBrainEditing(store, id);
    const definition = editing.srcBrainDef;
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
    const id = store.addBrain("Chaser");
    const editing = openBrainEditing(store, id);
    const definition = editing.srcBrainDef;
    assert.ok(definition);
    authorRule(store.getSnapshot().environment, definition);
    const snapshot = snapshotOf(definition);
    editing.change(snapshot.read);

    editing.close();
    const closed = store.getSnapshot().brains.get(id);
    mock.timers.tick(FLUSH_DEBOUNCE_MS);

    assert.equal(snapshot.reads(), 1);
    assert.equal(closed?.compiled?.sourceHash, closed?.sourceHash);
    assert.equal(store.getSnapshot().brains.get(id), closed);
  });

  it("changes nothing on close when every edit has been flushed", () => {
    const id = store.addBrain("Chaser");
    const editing = openBrainEditing(store, id);
    const definition = editing.srcBrainDef;
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
    const id = store.addBrain("Chaser");
    const editing = openBrainEditing(store, id);
    const definition = editing.srcBrainDef;
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
    assert.equal(after?.compiled?.sourceHash, after?.sourceHash);
    assert.notEqual(after, before.brains.get(id));
  });

  it("contains a flush the store's apply throws on, retrying it on close", () => {
    const errors = mock.method(logger, "error", () => {});
    const id = store.addBrain("Chaser");
    let applies = 0;
    const throwing = {
      getBrain: (brainId: string) => store.getBrain(brainId),
      applyBrain: () => {
        applies += 1;
        throw new Error("uncompilable");
      },
    };
    const editing = openBrainEditing(throwing, id);
    const definition = editing.srcBrainDef;
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

  it("keeps the document it opened with through every flush", () => {
    const id = store.addBrain("Chaser");
    const editing = openBrainEditing(store, id);
    const opened = editing.srcBrainDef;
    assert.ok(opened);
    authorRule(store.getSnapshot().environment, opened);

    editing.change(() => opened);
    mock.timers.tick(FLUSH_DEBOUNCE_MS);
    editing.close();

    assert.equal(editing.srcBrainDef, opened);
  });
});
