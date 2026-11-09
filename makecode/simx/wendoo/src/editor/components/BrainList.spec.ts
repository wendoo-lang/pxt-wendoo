import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it, mock } from "node:test";
import type { IBrainTileDef, WendooEnvironment } from "@wendoo/core/app";
import { BrainDef, CoreHostActions, LogLevel, logger, mkActuatorTileId, mkSensorTileId } from "@wendoo/core/app";
import type { BrainPageDef, BrainRuleDef } from "@wendoo/core/brain/model";
import type { MakeCodeBrainSummary, MakeCodeBrainsChannel } from "@wendoo/makecode-session";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BRAIN_ASSET_UNRESOLVED } from "../../authoring/asset-literals.js";
import { buildAuthoringEnvironment } from "../../authoring/authoring-environment.js";
import { BRAIN_SOURCE_ID_MISMATCH, BRAIN_SOURCE_INVALID } from "../../authoring/brain-source.js";
import { parseCatalog } from "../../authoring/catalog.js";
import { allocateIds, emptyIdManifest } from "../../authoring/id-allocation.js";
import { BrainsProvider } from "../contexts/brains.js";
import { EditorRequestsProvider } from "../contexts/editor-requests.js";
import type { BrainsSessionState, BrainsViewState } from "../services/brains-store.js";
import { BRAIN_TILE_UNRESOLVED, BrainsStore } from "../services/brains-store.js";
import { EditorRequests, forwardBrainOpens } from "../services/editor-requests.js";
import { elementByTestId, elementsIn } from "../test-support/element-tree.js";
import { FrameProject } from "../test-support/frame-project.js";
import { seedBrain } from "../test-support/seed-brain.js";
import { listedDiagnostics } from "./BrainDiagnostics.js";
import {
  answerCreatedBrain,
  answerCreateRequest,
  answerEditorRequest,
  answerOpenRequest,
  BrainDamageNotice,
  type BrainDialog,
  BrainList,
  EDITOR_OPEN_UNKNOWN_BRAIN,
  OpenInOriginAction,
  type OpenRequestView,
} from "./BrainList.js";

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

/**
 * A store over the spec's session with tab key `tabKey` when one is given,
 * reconciled over a channel serving `project`.
 */
async function reconciledStore(project: FrameProject, tabKey?: string): Promise<BrainsStore> {
  let published: ((brains: MakeCodeBrainSummary[]) => void) | undefined;
  let handshake: ((channel: MakeCodeBrainsChannel) => void) | undefined;
  const synced = new BrainsStore(SESSION, {
    onBrainsChannel: (listener) => {
      handshake = listener;
      return () => {};
    },
    onManifest: () => () => {},
    onBrains: (listener) => {
      published = listener;
      return () => {};
    },
  });
  if (tabKey !== undefined) synced.setTabKey(tabKey);
  handshake?.({
    listBrains: () => Promise.resolve(project.summaries()),
    pullBrains: (ids) => Promise.resolve(ids.flatMap((id) => project.get(id) ?? [])),
    pushBrain: (push) =>
      Promise.resolve(push.op === "write" ? project.write(push.brain.id, push.brain.name, push.brain.source) : null),
    createBrain: (name) => Promise.resolve(project.create(name)),
    openBrain: () => Promise.resolve(),
  });
  published?.(project.summaries());
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(synced.getSnapshot().reconciled);
  return synced;
}

/** Renders the brain list over `store`, under editor requests holding none. */
function render(store: BrainsStore): string {
  return renderToStaticMarkup(
    createElement(
      BrainsProvider,
      { value: store },
      createElement(EditorRequestsProvider, { value: new EditorRequests() }, createElement(BrainList))
    )
  );
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
    const first = seedBrain(store, "Chaser");
    const second = seedBrain(store, "Runner");

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
    const first = seedBrain(store, "Chaser");
    const second = seedBrain(store, "Runner");

    store.renameBrain(first, "Hunter");

    assert.deepEqual(rows(render(store)), [
      [first, "Hunter"],
      [second, "Runner"],
    ]);
  });

  it("drops the row of a removed brain, leaving the others", () => {
    const first = seedBrain(store, "Chaser");
    const second = seedBrain(store, "Runner");

    store.removeBrain(first);

    assert.deepEqual(rows(render(store)), [[second, "Runner"]]);
  });

  it("renders brains with duplicate names as separate rows under their own ids", () => {
    const first = seedBrain(store, "Chaser");
    const second = seedBrain(store, "Chaser");

    assert.deepEqual(rows(render(store)), [
      [first, "Chaser"],
      [second, "Chaser"],
    ]);
  });

  it("badges a brain's listed diagnostics with their count and the brain's compile state", () => {
    const failing = seedBrain(store, "Chaser");
    const clean = seedBrain(store, "Runner");
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
    const id = seedBrain(store, "Chaser");
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
      const damaged = seedBrain(store, "Chaser");
      const intact = seedBrain(store, "Runner");

      const markup = renderDamaged(new Map([[damaged, { code: BRAIN_SOURCE_INVALID, name: "Chaser" }]]));

      const row = rowMarkup(markup, damaged);
      assert.match(row, new RegExp(`data-testid="brain-damaged-notice" data-code="${BRAIN_SOURCE_INVALID}"`));
      assert.match(row, new RegExp(`data-testid="brain-restore" data-brain-id="${damaged}"`));
      assert.match(row, new RegExp(`data-testid="brain-edit" data-brain-id="${damaged}"`));
      assert.doesNotMatch(rowMarkup(markup, intact), /data-testid="brain-damaged-notice"/);
    });

    it("disables Restore, keeping the notice, while the store is not reconciled with the project", () => {
      const damaged = seedBrain(store, "Chaser");
      const damage = new Map([[damaged, { code: BRAIN_SOURCE_INVALID, name: "Chaser" }] as const]);

      const unreconciled = rowMarkup(renderDamaged(damage, [], false), damaged);
      const reconciled = rowMarkup(renderDamaged(damage, [], true), damaged);

      assert.match(unreconciled, /<button[^>]*data-testid="brain-restore"[^>]*disabled=""/);
      assert.doesNotMatch(reconciled, /<button[^>]*data-testid="brain-restore"[^>]*disabled=""/);
      assert.match(reconciled, /data-testid="brain-restore"/);
    });

    it("lists a damaged brain it holds no copy of under the project's name, with the notice alone", () => {
      const held = seedBrain(store, "Runner");

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
      const id = seedBrain(store, "Chaser");
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
      const using = seedBrain(store, "Chaser");
      const other = seedBrain(store, "Runner");
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
      const failing = seedBrain(store, "Chaser");
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

  describe("brains made in another tab", () => {
    /** The registration key of the tab the list renders in. */
    const OWN_TAB = "wendoo-lang/pxt-wendoo/makecode/extensions/arcade";

    /** The registration key of another tab talking to the same frame. */
    const OTHER_TAB = "wendoo-lang/pxt-daydream";

    /** The label MakeCode lists {@link OTHER_TAB} by. */
    const OTHER_LABEL = "Daydream";

    /** Holds an empty brain named `name` in `project`, made in the tab keyed `origin` and listed by `originLabel`. Returns its id. */
    function made(project: FrameProject, name: string, origin: string | null, originLabel: string | null): string {
      const { id } = project.create(name);
      const brain = project.get(id);
      assert.ok(brain);
      project.set(id, { ...brain, origin, originLabel });
      return id;
    }

    /** How many times `pattern` occurs in `markup`. */
    function occurrences(markup: string, pattern: RegExp): number {
      return [...markup.matchAll(new RegExp(pattern, "g"))].length;
    }

    it("gives a brain of another tab listed by MakeCode one open-origin action carrying its id, and no edit or actions controls", async () => {
      const project = new FrameProject();
      const id = made(project, "Dreamer", OTHER_TAB, OTHER_LABEL);
      const synced = await reconciledStore(project, OWN_TAB);

      const row = rowMarkup(render(synced), id);

      assert.equal(occurrences(row, /data-action="open-origin"/), 1);
      assert.match(row, new RegExp(`data-action="open-origin" data-key="${id}"`));
      assert.match(row, new RegExp(`${OTHER_LABEL}</button>`));
      assert.doesNotMatch(row, /data-testid="brain-edit"/);
      assert.doesNotMatch(row, /data-testid="brain-actions"/);
      assert.equal(occurrences(row, /<button/), 1);
    });

    it("gives a brain of another tab MakeCode does not list no action at all", async () => {
      const project = new FrameProject();
      const id = made(project, "Dreamer", OTHER_TAB, null);
      const synced = await reconciledStore(project, OWN_TAB);

      const row = rowMarkup(render(synced), id);

      assert.deepEqual(rows(render(synced)), [[id, "Dreamer"]]);
      assert.doesNotMatch(row, /data-action="open-origin"/);
      assert.doesNotMatch(row, /data-testid="brain-edit"/);
      assert.doesNotMatch(row, /data-testid="brain-actions"/);
      assert.equal(occurrences(row, /<button/), 0);
    });

    it("keeps today's controls on a brain of this tab and a brain with no origin", async () => {
      const project = new FrameProject();
      const own = made(project, "Chaser", OWN_TAB, "Wendoo");
      const bare = made(project, "Runner", null, null);
      const synced = await reconciledStore(project, OWN_TAB);

      const markup = render(synced);

      for (const id of [own, bare]) {
        const row = rowMarkup(markup, id);
        assert.match(row, new RegExp(`data-testid="brain-edit" data-brain-id="${id}"`));
        assert.match(row, new RegExp(`data-testid="brain-actions" data-brain-id="${id}"`));
        assert.doesNotMatch(row, /data-action="open-origin"/);
      }
    });

    it("offers no Restore on a damaged brain of another tab it holds a copy of, keeping its open-origin action", async () => {
      const project = new FrameProject();
      const id = made(project, "Dreamer", OTHER_TAB, OTHER_LABEL);
      const synced = await reconciledStore(project, OWN_TAB);
      const reporting = {
        subscribe: synced.subscribe,
        getSnapshot: () => ({
          ...synced.getSnapshot(),
          damaged: new Map([[id, { code: BRAIN_SOURCE_INVALID, name: "Dreamer" }]]),
        }),
      } as unknown as BrainsStore;

      const row = rowMarkup(render(reporting), id);

      assert.match(row, new RegExp(`data-testid="brain-damaged-notice" data-code="${BRAIN_SOURCE_INVALID}"`));
      assert.doesNotMatch(row, /data-testid="brain-restore"/);
      assert.equal(occurrences(row, /data-action="open-origin"/), 1);
    });

    it("keeps the compile badge on a brain of another tab", async () => {
      const project = new FrameProject();
      const id = made(project, "Dreamer", OTHER_TAB, OTHER_LABEL);
      const synced = await reconciledStore(project, OWN_TAB);
      applyFailingBrain(synced, id);

      const row = rowMarkup(render(synced), id);

      assert.match(row, /data-testid="brain-error-badge"/);
      assert.match(row, /data-action="open-origin"/);
    });
  });
});

describe("OpenInOriginAction", () => {
  it("asks the brains store to open its brain in its origin when chosen", () => {
    const asked: string[] = [];
    const tree = OpenInOriginAction({
      brainId: "abcdabcdabcdabcd",
      brainName: "Dreamer",
      originLabel: "Daydream",
      brains: {
        openBrainInOrigin: (id) => {
          asked.push(id);
          return Promise.resolve();
        },
      },
    });

    const [action] = elementsIn(tree).filter((element) => element.props["data-action"] === "open-origin");
    assert.ok(action);
    assert.equal(action.props["data-key"], "abcdabcdabcdabcd");
    (action.props.onClick as () => void)();

    assert.deepEqual(asked, ["abcdabcdabcdabcd"]);
  });

  it("renders nothing while the origin tab's label is unknown", () => {
    const tree = OpenInOriginAction({
      brainId: "abcdabcdabcdabcd",
      brainName: "Dreamer",
      originLabel: null,
      brains: { openBrainInOrigin: () => Promise.resolve() },
    });

    assert.equal(tree, null);
  });
});

describe("answerCreateRequest", () => {
  /** A brain list's state, recording each change a create request makes, standing on brain `editingBrainId`. */
  function view(editingBrainId: string | null) {
    const changes: string[] = [];
    const state: { editingBrainId: string | null; dialog: BrainDialog } = { editingBrainId, dialog: null };
    return {
      changes,
      state,
      setEditingBrainId: (id: string | null) => {
        changes.push(`editor:${id}`);
        state.editingBrainId = id;
      },
      setDialog: (dialog: BrainDialog) => {
        changes.push(`dialog:${dialog?.kind ?? null}`);
        state.dialog = dialog;
      },
    };
  }

  it("opens the add dialog on the list", () => {
    const list = view(null);

    answerCreateRequest(list);

    assert.deepEqual(list.state, { editingBrainId: null, dialog: { kind: "add" } });
  });

  it("closes the open brain editor before opening the add dialog", () => {
    const list = view("abcdabcdabcdabcd");

    answerCreateRequest(list);

    assert.deepEqual(list.changes, ["editor:null", "dialog:add"]);
    assert.deepEqual(list.state, { editingBrainId: null, dialog: { kind: "add" } });
  });
});

describe("open requests", () => {
  /** A brain list's state over `store`'s brains, recording each change a request makes, standing on brain `editingBrainId` and `dialog`. */
  function view(
    store: BrainsStore,
    editingBrainId: string | null,
    dialog: BrainDialog = null,
    reconciled = true
  ): OpenRequestView & {
    changes: string[];
    state: { editingBrainId: string | null; dialog: BrainDialog; held: string | null };
  } {
    const changes: string[] = [];
    const state: { editingBrainId: string | null; dialog: BrainDialog; held: string | null } = {
      editingBrainId,
      dialog,
      held: null,
    };
    return {
      changes,
      state,
      brains: store.getSnapshot().brains,
      reconciled,
      setEditingBrainId: (id) => {
        changes.push(`editor:${id}`);
        state.editingBrainId = id;
      },
      setDialog: (next) => {
        changes.push(`dialog:${next?.kind ?? null}`);
        state.dialog = next;
      },
      holdOpen: (brainId) => {
        changes.push(`hold:${brainId}`);
        state.held = brainId;
      },
      focusEditButton: (brainId) => {
        changes.push(`focus:${brainId}`);
      },
    };
  }

  /** Warn-level log codes logged since the spec began. */
  function warnedCodes(warnings: ReturnType<typeof mock.method>): unknown[] {
    return warnings.mock.calls.map((call) => call.arguments[0]);
  }

  let store: BrainsStore;
  let warnings: ReturnType<typeof mock.method>;

  beforeEach(() => {
    store = new BrainsStore(SESSION);
    warnings = mock.method(logger, "warn", () => {});
  });

  afterEach(() => {
    mock.restoreAll();
  });

  describe("answerCreatedBrain", () => {
    it("puts the keyboard on the created brain's Edit button, then opens the editor on it, once the store holds it", async () => {
      const synced = await reconciledStore(new FrameProject());

      const id = await synced.addBrain("Chaser");
      const list = view(synced, null);

      assert.equal(answerCreatedBrain(list, id), true);
      assert.deepEqual(list.changes, [`focus:${id}`, `editor:${id}`]);
    });

    it("changes nothing for a created brain the store does not hold yet", () => {
      const list = view(store, null);

      assert.equal(answerCreatedBrain(list, "createdcreatedcr"), false);
      assert.deepEqual(list.changes, []);
    });
  });

  describe("answerOpenRequest", () => {
    it("opens the editor on the named brain the store holds, the keyboard put on its Edit button first", () => {
      seedBrain(store, "Chaser");
      const hero = seedBrain(store, "Hero");
      const list = view(store, null);

      answerOpenRequest(list, hero);

      assert.deepEqual(list.state, { editingBrainId: hero, dialog: null, held: null });
      assert.deepEqual(list.changes, ["dialog:null", `focus:${hero}`, `editor:${hero}`]);
      assert.deepEqual(warnedCodes(warnings), []);
    });

    it("switches an editor open on another brain to the named brain", () => {
      const chaser = seedBrain(store, "Chaser");
      const hero = seedBrain(store, "Hero");
      const list = view(store, chaser);

      answerOpenRequest(list, hero);

      assert.equal(list.state.editingBrainId, hero);
    });

    it("leaves an editor open on the named brain open on it", () => {
      const hero = seedBrain(store, "Hero");
      const list = view(store, hero);

      answerOpenRequest(list, hero);

      assert.equal(list.state.editingBrainId, hero);
      assert.ok(!list.changes.includes("editor:null"));
    });

    it("closes an open add dialog before opening the editor", () => {
      const hero = seedBrain(store, "Hero");
      const list = view(store, null, { kind: "add" });

      answerOpenRequest(list, hero);

      assert.deepEqual(list.state, { editingBrainId: hero, dialog: null, held: null });
      assert.ok(list.changes.indexOf("dialog:null") < list.changes.indexOf(`editor:${hero}`));
    });

    it("leaves the list as it is for a brain the store does not hold, logging its stable code", () => {
      const chaser = seedBrain(store, "Chaser");
      const list = view(store, chaser, { kind: "rename", id: chaser, name: "Chaser" });

      answerOpenRequest(list, "abcdabcdabcdabcd");

      assert.deepEqual(list.changes, []);
      assert.deepEqual(warnedCodes(warnings), [EDITOR_OPEN_UNKNOWN_BRAIN]);
    });

    it("holds the brain, changing nothing else, while the store is not reconciled", () => {
      const list = view(store, null, null, false);

      answerOpenRequest(list, "abcdabcdabcdabcd");

      assert.deepEqual(list.changes, ["hold:abcdabcdabcdabcd"]);
      assert.deepEqual(warnedCodes(warnings), []);
    });
  });

  describe("answerEditorRequest", () => {
    it("opens the editor on the brain an open request's instance name denotes", () => {
      const hero = seedBrain(store, "Hero");
      const list = view(store, null);

      answerEditorRequest(list, { kind: "open", qName: `wendooBrains.p_${hero}` });

      assert.equal(list.state.editingBrainId, hero);
    });

    it("answers a create request by opening the add dialog, dropping a held open request", () => {
      const list = view(store, null, null, false);
      list.state.held = "abcdabcdabcdabcd";

      answerEditorRequest(list, { kind: "create", qName: "wendoo.CompiledBrainRegistration" });

      assert.deepEqual(list.state, { editingBrainId: null, dialog: { kind: "add" }, held: null });
    });

    it("holds only the latest open request made before the store reconciled", () => {
      const list = view(store, null, null, false);

      answerEditorRequest(list, { kind: "open", qName: "wendooBrains.p_abcdabcdabcdabcd" });
      answerEditorRequest(list, { kind: "open", qName: "wendooBrains.p_0000111122223333" });

      assert.equal(list.state.held, "0000111122223333");
    });

    it("opens the editor on the brain an open request names by document id", () => {
      const hero = seedBrain(store, "Hero");
      const list = view(store, null);

      answerEditorRequest(list, { kind: "open", brainId: hero });

      assert.deepEqual(list.changes, ["hold:null", "dialog:null", `focus:${hero}`, `editor:${hero}`]);
    });

    it("opens the editor on a brain the session asks the tab to open, as it does for an Edit request", () => {
      const hero = seedBrain(store, "Hero");
      const requests = new EditorRequests();
      let deliver: ((id: string) => void) | undefined;
      forwardBrainOpens(
        {
          onBrainOpen: (listener) => {
            deliver = listener;
            return () => {};
          },
        },
        requests
      );
      const opened = view(store, null);
      const edited = view(store, null);
      requests.take((request) => answerEditorRequest(opened, request));

      deliver?.(hero);
      answerEditorRequest(edited, { kind: "open", qName: `wendooBrains.p_${hero}` });

      assert.equal(opened.state.editingBrainId, hero);
      assert.deepEqual(opened.changes, edited.changes);
    });

    it("leaves the list as it is for an instance name denoting no brain, logging the stable code", () => {
      seedBrain(store, "Hero");
      const list = view(store, null);

      answerEditorRequest(list, { kind: "open", qName: "wendooPrograms.p_abcdabcdabcdabcd" });

      assert.deepEqual(list.changes, ["hold:null"]);
      assert.deepEqual(warnedCodes(warnings), [EDITOR_OPEN_UNKNOWN_BRAIN]);
    });
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
