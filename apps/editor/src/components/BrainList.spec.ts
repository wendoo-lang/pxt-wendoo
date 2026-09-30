import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import type { IBrainTileDef, WendooEnvironment } from "@wendoo/core/app";
import { BrainDef, CoreHostActions, LogLevel, logger, mkActuatorTileId, mkSensorTileId } from "@wendoo/core/app";
import type { BrainPageDef, BrainRuleDef } from "@wendoo/core/brain/model";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BrainsProvider } from "../contexts/brains.js";
import type { BrainsSessionState } from "../services/brains-store.js";
import { BrainsStore } from "../services/brains-store.js";
import { listedDiagnostics } from "./BrainDiagnostics.js";
import { BrainList } from "./BrainList.js";

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
  const page = definition.pages().get(0) as BrainPageDef;
  return page.children().get(0) as BrainRuleDef;
}

/** Stores the brain `id` with its first rule reading `WHEN on page entered DO restart page`: a rule that compiles. */
function applyCompilingBrain(store: BrainsStore, id: string): void {
  const definition = store.getBrain(id) as BrainDef;
  const environment = store.getSnapshot().environment;
  const rule = firstRule(definition);
  rule.when().appendTile(tile(environment, mkSensorTileId(CoreHostActions.OnPageEntered.key)));
  rule.do().appendTile(tile(environment, mkActuatorTileId(CoreHostActions.RestartPage.key)));
  store.applyBrain(definition);
}

/** Stores the brain `id` with an actuator on its first WHEN side: a placement the compiler rejects with an error. */
function applyFailingBrain(store: BrainsStore, id: string): void {
  const definition = store.getBrain(id) as BrainDef;
  const environment = store.getSnapshot().environment;
  firstRule(definition)
    .when()
    .appendTile(tile(environment, mkActuatorTileId(CoreHostActions.SwitchPage.key)));
  store.applyBrain(definition);
}

/** Renders the brain list over `store`. */
function render(store: BrainsStore): string {
  return renderToStaticMarkup(createElement(BrainsProvider, { value: store }, createElement(BrainList)));
}

/** The listed rows, in order, as [document id, name] pairs. */
function rows(markup: string): [string, string][] {
  return [...markup.matchAll(/data-testid="brain-item" data-brain-id="([^"]+)" data-brain-name="([^"]*)"/g)].map(
    (match) => [match[1] as string, match[2] as string]
  );
}

/** The markup of the row for `id`: from its opening tag to the next row's, or the end. */
function rowMarkup(markup: string, id: string): string {
  const start = markup.indexOf(`data-testid="brain-item" data-brain-id="${id}"`);
  assert.ok(start >= 0, `expected a row for ${id}`);
  const next = markup.indexOf('data-testid="brain-item"', start + 1);
  return markup.slice(start, next < 0 ? undefined : next);
}

describe("BrainList", () => {
  let store: BrainsStore;
  let loggedLevel: LogLevel;

  // Silences the compiler's warning log for the tiles a failing brain drops.
  before(() => {
    loggedLevel = logger.level;
    logger.level = LogLevel.ERROR;
  });

  after(() => {
    logger.level = loggedLevel;
  });

  beforeEach(() => {
    store = new BrainsStore(SESSION);
  });

  it("shows the empty state with an add affordance while the store holds no brains", () => {
    const markup = render(store);

    assert.match(markup, /data-testid="brain-list-empty"/);
    assert.match(markup, /data-testid="add-brain-button"/);
    assert.deepEqual(rows(markup), []);
  });

  it("lists the store's brains in store order, one row per document id, with edit and actions controls", () => {
    const first = store.addBrain("Chaser");
    const second = store.addBrain("Runner");

    const markup = render(store);

    assert.doesNotMatch(markup, /data-testid="brain-list-empty"/);
    assert.deepEqual(rows(markup), [
      [first, "Chaser"],
      [second, "Runner"],
    ]);
    assert.match(rowMarkup(markup, first), new RegExp(`data-testid="brain-edit" data-brain-id="${first}"`));
    assert.match(rowMarkup(markup, first), new RegExp(`data-testid="brain-actions" data-brain-id="${first}"`));
  });

  it("renames a row in place: same document id, same position, the new name", () => {
    const first = store.addBrain("Chaser");
    const second = store.addBrain("Runner");

    store.renameBrain(first, "Hunter");

    assert.deepEqual(rows(render(store)), [
      [first, "Hunter"],
      [second, "Runner"],
    ]);
  });

  it("drops the row of a removed brain, leaving the others", () => {
    const first = store.addBrain("Chaser");
    const second = store.addBrain("Runner");

    store.removeBrain(first);

    assert.deepEqual(rows(render(store)), [[second, "Runner"]]);
  });

  it("renders brains with duplicate names as separate rows under their own ids", () => {
    const first = store.addBrain("Chaser");
    const second = store.addBrain("Chaser");

    assert.deepEqual(rows(render(store)), [
      [first, "Chaser"],
      [second, "Chaser"],
    ]);
  });

  it("badges a brain's listed diagnostics with their count and the brain's compile state", () => {
    const failing = store.addBrain("Chaser");
    const clean = store.addBrain("Runner");
    applyFailingBrain(store, failing);
    const entry = store.getSnapshot().brains.get(failing);
    assert.ok(entry);
    const count = listedDiagnostics(entry).length;
    assert.ok(count > 0);

    const markup = render(store);

    const failingRow = rowMarkup(markup, failing);
    assert.match(failingRow, /data-testid="brain-error-badge"[^>]*data-compile="stale"/);
    assert.match(failingRow, new RegExp(`data-testid="brain-error-count"[^>]*>${count}<`));
    assert.doesNotMatch(rowMarkup(markup, clean), /data-testid="brain-error-badge"/);
  });

  it("shows no badge while the latest apply compiled clean, and a stale badge once a later apply fails", () => {
    const id = store.addBrain("Chaser");
    applyCompilingBrain(store, id);
    assert.doesNotMatch(rowMarkup(render(store), id), /data-testid="brain-error-badge"/);

    applyFailingBrain(store, id);
    assert.match(rowMarkup(render(store), id), /data-testid="brain-error-badge"[^>]*data-compile="stale"/);
  });

  it("badges a brain that has never compiled with the none compile state", () => {
    const environment = store.getSnapshot().environment;
    const definition = BrainDef.emptyBrainDef(environment.brainServices, "Chaser");
    firstRule(definition)
      .when()
      .appendTile(tile(environment, mkActuatorTileId(CoreHostActions.SwitchPage.key)));
    store.applyBrain(definition);

    const markup = rowMarkup(render(store), definition.id());

    assert.match(markup, /data-testid="brain-error-badge"[^>]*data-compile="none"/);
  });
});
