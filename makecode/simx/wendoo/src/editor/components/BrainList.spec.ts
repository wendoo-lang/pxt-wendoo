import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import type { IBrainTileDef, WendooEnvironment } from "@wendoo/core/app";
import { BrainDef, CoreHostActions, LogLevel, logger, mkActuatorTileId, mkSensorTileId } from "@wendoo/core/app";
import type { BrainPageDef, BrainRuleDef } from "@wendoo/core/brain/model";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BrainsProvider } from "../contexts/brains.js";
import { BRAIN_ASSET_UNRESOLVED } from "../services/asset-literals.js";
import { buildAuthoringEnvironment } from "../services/authoring-environment.js";
import { BRAIN_SOURCE_ID_MISMATCH, BRAIN_SOURCE_INVALID } from "../services/brain-source.js";
import type { BrainsSessionState, BrainsViewState } from "../services/brains-store.js";
import { BRAIN_TILE_UNRESOLVED, BrainsStore } from "../services/brains-store.js";
import { parseCatalog } from "../services/catalog.js";
import { allocateIds, emptyIdManifest } from "../services/id-allocation.js";
import { elementByTestId, elementsIn } from "../test-support/element-tree.js";
import { listedDiagnostics } from "./BrainDiagnostics.js";
import { BrainDamageNotice, BrainList } from "./BrainList.js";

/** A connected session with no catalog, as a brains store follows it. */
const SESSION = {
  subscribe: () => () => {},
  getSnapshot: (): BrainsSessionState => ({ status: "connected", catalogText: undefined, assets: undefined }),
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

/** A catalog whose one pack declares the ring actuator. */
const CHIME_CATALOG = JSON.stringify({
  packs: [{ name: "chime", tiles: [{ name: "actuator.chime.ring", kind: "actuator" }] }],
});

/** The ring actuator's tile id. */
const RING_TILE = mkActuatorTileId("actuator.chime.ring");

/**
 * Stores a brain named `name` whose first rule places the ring actuator,
 * authored in an environment binding {@link CHIME_CATALOG}. Returns its
 * document id.
 */
function applyRingingBrain(store: BrainsStore, name: string): string {
  const { environment } = buildAuthoringEnvironment(
    CHIME_CATALOG,
    allocateIds(emptyIdManifest(), parseCatalog(CHIME_CATALOG))
  );
  const definition = BrainDef.emptyBrainDef(environment.brainServices, name);
  firstRule(definition).do().appendTile(tile(environment, RING_TILE));
  store.applyBrain(definition);
  return definition.id();
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
    const count = listedDiagnostics(entry, store.getSnapshot().catalogPending).length;
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

  describe("damaged brains", () => {
    /**
     * Renders the brain list over `store`, reporting `damaged` as the
     * damaged brains and recording each re-push asked of it in `repushed`.
     */
    function renderDamaged(damaged: BrainsViewState["damaged"], repushed: string[] = [], reconciled = true): string {
      const reporting = {
        subscribe: store.subscribe,
        getSnapshot: () => ({ ...store.getSnapshot(), damaged, reconciled }),
        repushBrain: (id: string) => {
          repushed.push(id);
        },
      } as unknown as BrainsStore;
      return render(reporting);
    }

    it("marks a damaged brain it holds a copy of with the coded notice and a Restore for that brain", () => {
      const damaged = store.addBrain("Chaser");
      const intact = store.addBrain("Runner");

      const markup = renderDamaged(new Map([[damaged, { code: BRAIN_SOURCE_INVALID, name: "Chaser" }]]));

      const row = rowMarkup(markup, damaged);
      assert.match(row, new RegExp(`data-testid="brain-damaged-notice" data-code="${BRAIN_SOURCE_INVALID}"`));
      assert.match(row, new RegExp(`data-testid="brain-restore" data-brain-id="${damaged}"`));
      assert.match(row, new RegExp(`data-testid="brain-edit" data-brain-id="${damaged}"`));
      assert.doesNotMatch(rowMarkup(markup, intact), /data-testid="brain-damaged-notice"/);
    });

    it("disables Restore, keeping the notice, while the store is not reconciled with the project", () => {
      const damaged = store.addBrain("Chaser");
      const damage = new Map([[damaged, { code: BRAIN_SOURCE_INVALID, name: "Chaser" }] as const]);

      const unreconciled = rowMarkup(renderDamaged(damage, [], false), damaged);
      const reconciled = rowMarkup(renderDamaged(damage, [], true), damaged);

      assert.match(unreconciled, /<button[^>]*data-testid="brain-restore"[^>]*disabled=""/);
      assert.doesNotMatch(reconciled, /<button[^>]*data-testid="brain-restore"[^>]*disabled=""/);
      assert.match(reconciled, /data-testid="brain-restore"/);
    });

    it("lists a damaged brain it holds no copy of under the project's name, with the notice alone", () => {
      const held = store.addBrain("Runner");

      const markup = renderDamaged(new Map([["abcdabcdabcdabcd", { code: BRAIN_SOURCE_ID_MISMATCH, name: "Chaser" }]]));

      assert.deepEqual(rows(markup), [
        [held, "Runner"],
        ["abcdabcdabcdabcd", "Chaser"],
      ]);
      const row = rowMarkup(markup, "abcdabcdabcdabcd");
      assert.match(row, new RegExp(`data-testid="brain-damaged-notice" data-code="${BRAIN_SOURCE_ID_MISMATCH}"`));
      assert.doesNotMatch(row, /data-testid="brain-restore"/);
      assert.doesNotMatch(row, /data-testid="brain-edit"/);
      assert.doesNotMatch(row, /data-testid="brain-actions"/);
    });

    it("shows a damaged brain it holds no copy of in place of the empty state", () => {
      const markup = renderDamaged(new Map([["abcdabcdabcdabcd", { code: BRAIN_SOURCE_INVALID, name: "Chaser" }]]));

      assert.doesNotMatch(markup, /data-testid="brain-list-empty"/);
      assert.deepEqual(rows(markup), [["abcdabcdabcdabcd", "Chaser"]]);
    });

    it("drops the notice once the damage clears", () => {
      const id = store.addBrain("Chaser");
      assert.match(
        renderDamaged(new Map([[id, { code: BRAIN_SOURCE_INVALID, name: "Chaser" }]])),
        /data-testid="brain-damaged-notice"/
      );

      const markup = renderDamaged(new Map());

      assert.deepEqual(rows(markup), [[id, "Chaser"]]);
      assert.doesNotMatch(markup, /data-testid="brain-damaged-notice"/);
    });
  });

  describe("brains using deleted assets", () => {
    /** Renders the brain list over `store`, reporting `unresolvedAssets` as the brains' unresolved asset literals. */
    function renderUnresolved(unresolvedAssets: BrainsViewState["unresolvedAssets"]): string {
      const reporting = {
        subscribe: store.subscribe,
        getSnapshot: () => ({ ...store.getSnapshot(), unresolvedAssets }),
      } as unknown as BrainsStore;
      return render(reporting);
    }

    it("marks a brain using an asset the project no longer holds with the coded notice, and no other brain", () => {
      const using = store.addBrain("Chaser");
      const other = store.addBrain("Runner");
      const literal = {
        tileId: "tile.literal->struct:<Picture>->img1",
        typeId: "struct:<Picture>",
        kind: "image",
        id: "img1",
        label: "hero",
        previewUrl: undefined,
        resolved: false,
      };

      const markup = renderUnresolved(new Map([[using, [literal]]]));

      assert.match(
        rowMarkup(markup, using),
        new RegExp(`data-testid="brain-asset-notice" data-code="${BRAIN_ASSET_UNRESOLVED}"`)
      );
      assert.doesNotMatch(rowMarkup(markup, other), /data-testid="brain-asset-notice"/);
      assert.doesNotMatch(renderUnresolved(new Map()), /data-testid="brain-asset-notice"/);
    });
  });

  describe("pending catalog", () => {
    it("shows no badge on a brain placing unresolved tiles while no catalog is held, keeping its diagnostics in the store", () => {
      const ringer = applyRingingBrain(store, "Ringer");
      const failing = store.addBrain("Chaser");
      applyFailingBrain(store, failing);
      assert.equal(store.getSnapshot().catalogPending, true);
      const entry = store.getSnapshot().brains.get(ringer);
      assert.deepEqual(entry?.unresolvedTiles, [{ tileId: RING_TILE, code: BRAIN_TILE_UNRESOLVED }]);
      assert.ok((entry?.diagnostics.length ?? 0) > 0);

      const markup = render(store);

      assert.doesNotMatch(rowMarkup(markup, ringer), /data-testid="brain-error-badge"/);
      assert.match(rowMarkup(markup, failing), /data-testid="brain-error-badge"/);
    });

    it("badges a brain placing a tile the held catalog does not declare", () => {
      const held = new BrainsStore({
        subscribe: () => () => {},
        getSnapshot: (): BrainsSessionState => ({
          status: "connected",
          catalogText: '{"packs":[]}',
          assets: undefined,
        }),
      });
      const ringer = applyRingingBrain(held, "Ringer");
      assert.equal(held.getSnapshot().catalogPending, false);
      assert.equal(held.getSnapshot().brains.get(ringer)?.unresolvedTiles.length, 1);

      assert.match(rowMarkup(render(held), ringer), /data-testid="brain-error-badge"/);
    });
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

describe("BrainDamageNotice", () => {
  it("restores its own brain from the held copy when Restore is chosen", () => {
    const repushed: string[] = [];
    const tree = BrainDamageNotice({
      brainId: "abcdabcdabcdabcd",
      code: BRAIN_SOURCE_INVALID,
      restorable: true,
      reconciled: true,
      brains: {
        repushBrain: (id) => {
          repushed.push(id);
        },
      },
    });

    (elementByTestId(tree, "brain-restore").props.onClick as () => void)();

    assert.deepEqual(repushed, ["abcdabcdabcdabcd"]);
  });

  it("offers no Restore when no held copy exists", () => {
    const tree = BrainDamageNotice({
      brainId: "abcdabcdabcdabcd",
      code: BRAIN_SOURCE_INVALID,
      restorable: false,
      reconciled: true,
      brains: { repushBrain: () => {} },
    });

    assert.equal(elementByTestId(tree, "brain-damaged-notice").props["data-code"], BRAIN_SOURCE_INVALID);
    assert.equal(
      elementsIn(tree).some((element) => element.props["data-testid"] === "brain-restore"),
      false
    );
  });

  it("offers Restore disabled while not reconciled", () => {
    const tree = BrainDamageNotice({
      brainId: "abcdabcdabcdabcd",
      code: BRAIN_SOURCE_INVALID,
      restorable: true,
      reconciled: false,
      brains: { repushBrain: () => {} },
    });

    assert.equal(elementByTestId(tree, "brain-restore").props.disabled, true);
  });
});
