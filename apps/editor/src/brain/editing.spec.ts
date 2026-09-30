import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import type { IBrainTileDef, WendooEnvironment } from "@wendoo/core/app";
import { CoreHostActions, mkActuatorTileId, mkSensorTileId } from "@wendoo/core/app";
import type { BrainPageDef, BrainRuleDef } from "@wendoo/core/brain/model";
import type { BrainsSessionState } from "../services/brains-store.js";
import { BrainsStore } from "../services/brains-store.js";
import { openBrainEditing } from "./editing.js";

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

describe("openBrainEditing", () => {
  let store: BrainsStore;

  beforeEach(() => {
    store = new BrainsStore(SESSION);
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

  it("submits an edited document to the store under the same id, compiling it", () => {
    const id = store.addBrain("Chaser");
    const other = store.addBrain("Runner");
    const before = store.getSnapshot().brains.get(id);
    const editing = openBrainEditing(store, id);
    const definition = editing.srcBrainDef;
    assert.ok(definition);
    const environment = store.getSnapshot().environment;
    const rule = (definition.pages().get(0) as BrainPageDef).children().get(0) as BrainRuleDef;
    rule.when().appendTile(tile(environment, mkSensorTileId(CoreHostActions.OnPageEntered.key)));
    rule.do().appendTile(tile(environment, mkActuatorTileId(CoreHostActions.RestartPage.key)));

    editing.submit(definition);

    const after = store.getSnapshot().brains.get(id);
    assert.ok(after);
    assert.deepEqual([...store.getSnapshot().brains.keys()], [id, other]);
    assert.notEqual(after.sourceHash, before?.sourceHash);
    assert.equal(after.compiled?.sourceHash, after.sourceHash);
    assert.deepEqual(after.diagnostics, []);
  });
});
