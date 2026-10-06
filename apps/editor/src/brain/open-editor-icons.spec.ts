/**
 * Specs for an open brain editor following a repainted catalog: the brains
 * store receives a catalog of the same vocabulary whose icons were rendered
 * under another palette, and the dialog standing open on a brain -- its
 * working copy stood up from the store when it opened, as the dialog stands
 * one -- draws every tile in the new icons under the config the store's new
 * state builds, with no new working copy; an edit not yet flushed survives the
 * repaint and flushes into the store.
 *
 * Icons are asserted by their data URIs and tiles by their ids; never labels
 * or pixels.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { List } from "@wendoo/core";
import type { IBrainTileDef } from "@wendoo/core/app";
import { mkSensorTileId } from "@wendoo/core/app";
import type { ITileCatalog } from "@wendoo/core/brain";
import { mkAccessorTileId, RuleSide } from "@wendoo/core/brain";
import type { BrainDef, BrainPageDef, BrainRuleDef } from "@wendoo/core/brain/model";
import { BrainCommandHistory } from "@wendoo/core/brain/model";
import { mkTypeId, NativeType } from "@wendoo/core/runtime";
import type {
  MakeCodeBrain,
  MakeCodeBrainPush,
  MakeCodeBrainSummary,
  MakeCodeManifestReading,
} from "@wendoo/makecode-session";
import type { BrainEditorConfig } from "@wendoo/ui";
import { BrainEditorProvider, BrainRuleEditor, BrainTile } from "@wendoo/ui";
import { type ArmedTargetController, ArmedTargetProvider } from "@wendoo/ui/brain-editor/ArmedTargetContext";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { BrainsSessionState } from "../services/brains-store.js";
import { BrainsStore } from "../services/brains-store.js";
import type { EditorBrainsChannel } from "../services/editor-session-store.js";
import { catalogTile } from "../test-support/asset-catalog.js";
import { openBrainEditing } from "./editing.js";
import { buildBrainEditorConfig } from "./editor-config.js";

/** Name of the pack's sensor reading nothing. */
const SPOT = "sensor.paint.spot";

/** Name of the pack's inline sensor reading a `Swatch`. */
const SWATCH = "sensor.paint.swatch";

/** Type id of the pack's `Swatch` type, whose `tint` field carries an accessor. */
const SWATCH_TYPE = mkTypeId(NativeType.Struct, "Swatch");

/** Type id of the pack's `Tint` type, the `tint` field's type, which carries an icon. */
const TINT_TYPE = mkTypeId(NativeType.Struct, "Tint");

/** Tile id of the `spot` sensor. */
const SPOT_ID = mkSensorTileId(SPOT);

/** Tile id of the `swatch` sensor. */
const SWATCH_ID = mkSensorTileId(SWATCH);

/** Tile id of the `Swatch.tint` accessor. */
const TINT_ACCESSOR_ID = mkAccessorTileId(SWATCH_TYPE, "tint");

/** The icon named `name` as the simx renders it under the palette `palette`: a data URI unique to the pair. */
function icon(name: string, palette: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(`${name}@${palette}`).toString("base64")}`;
}

/**
 * The catalog the simx publishes with its icons rendered under `palette`: one
 * pack declaring a `Swatch` type whose `tint` field, of the `Tint` type, carries
 * an accessor with an icon; a `Tint` type carrying an icon; an inline sensor
 * reading a `Swatch`; and a sensor reading nothing. Every palette yields the
 * same vocabulary, each icon differing.
 */
function paintCatalog(palette: string): string {
  return JSON.stringify({
    packs: [
      {
        name: "paint",
        types: [
          {
            name: "Swatch",
            fields: [{ name: "tint", type: "Tint", accessor: { label: "tint", iconUrl: icon("tint", palette) } }],
          },
          {
            name: "Tint",
            fields: [{ name: "id", type: "number", readOnly: true }],
            iconUrl: icon("Tint", palette),
          },
        ],
        tiles: [
          {
            name: SWATCH,
            kind: "sensor",
            inline: true,
            returns: "Swatch",
            label: "swatch",
            iconUrl: icon("swatch", palette),
          },
          { name: SPOT, kind: "sensor", returns: "boolean", label: "spot", iconUrl: icon("spot", palette) },
        ],
      },
    ],
  });
}

/** The session readings a brains store follows: connected, carrying the catalog last delivered. */
class FakeSessionSource {
  state: BrainsSessionState;
  private readonly _listeners = new Set<() => void>();

  constructor(catalogText: string) {
    this.state = { status: "connected", catalogText, assets: undefined };
  }

  subscribe = (listener: () => void): (() => void) => {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  };

  getSnapshot = (): BrainsSessionState => this.state;

  /** The session delivering a catalog of the text `catalogText`. */
  deliverCatalog(catalogText: string): void {
    this.state = { ...this.state, catalogText };
    for (const listener of this._listeners) listener();
  }
}

/** One handshake's brains channel over a project holding no brain and no manifest, answering every request at once. */
class EmptyProjectChannel implements EditorBrainsChannel {
  readonly binding = "binding-1";

  readManifest(): Promise<MakeCodeManifestReading> {
    return Promise.resolve({ manifest: null });
  }

  writeManifest(): Promise<void> {
    return Promise.resolve();
  }

  listBrains(): Promise<MakeCodeBrainSummary[]> {
    return Promise.resolve([]);
  }

  pullBrains(): Promise<MakeCodeBrain[]> {
    return Promise.resolve([]);
  }

  pushBrain(_push: MakeCodeBrainPush): Promise<void> {
    return Promise.resolve();
  }
}

/** Waits until every queued answer and the work it starts has run. */
function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/** The first rule of `brain`'s first page. */
function firstRule(brain: BrainDef): BrainRuleDef {
  return (brain.pages().get(0) as BrainPageDef).children().get(0) as BrainRuleDef;
}

/** The dialog's config as the brain editor builds it from `store`'s current state. */
function currentConfig(store: BrainsStore): BrainEditorConfig {
  const { environment, assetLiterals, brainLiterals, typeIcons, pageIcon } = store.getSnapshot();
  return buildBrainEditorConfig(environment, assetLiterals, brainLiterals, typeIcons, pageIcon);
}

/**
 * A store reconciled with an empty project over {@link paintCatalog} under the
 * palette `"before"`, holding one brain whose rule reads `WHEN [spot] DO
 * [swatch] [tint]`, and the brain editor opened on that brain: its editing,
 * and the working copy the dialog stands from the editing's document under the
 * config at open.
 */
async function openEditor() {
  const session = new FakeSessionSource(paintCatalog("before"));
  let handshake: ((channel: EditorBrainsChannel) => void) | undefined;
  const store = new BrainsStore(session, {
    onBrainsChannel: (listener) => {
      handshake = listener;
      return () => {};
    },
  });
  assert.ok(handshake);
  handshake(new EmptyProjectChannel());
  await settle();
  assert.ok(store.getSnapshot().reconciled);

  const id = store.addBrain("Painter");
  const authored = store.getBrain(id);
  assert.ok(authored);
  const environment = store.getSnapshot().environment;
  const rule = firstRule(authored);
  rule.when().appendTile(catalogTile(environment, SPOT_ID));
  rule.do().appendTile(catalogTile(environment, SWATCH_ID));
  rule.do().appendTile(catalogTile(environment, TINT_ACCESSOR_ID));
  store.applyBrain(authored);

  const editing = openBrainEditing(store, id);
  assert.ok(editing.srcBrainDef);
  const openConfig = currentConfig(store);
  const tileCatalogs = openConfig.tileCatalogs;
  assert.ok(tileCatalogs);
  const workingCopy = editing.srcBrainDef.workingCopy(List.from<ITileCatalog>(tileCatalogs));
  return { session, store, id, editing, openConfig, workingCopy };
}

/** The markup of `tileDef` drawn as a placed tile under `config`. */
function placed(config: BrainEditorConfig, tileDef: IBrainTileDef): string {
  return renderToStaticMarkup(
    createElement(BrainEditorProvider, { config }, createElement(BrainTile, { tileDef, side: RuleSide.Do }))
  );
}

/** The face icon a placed tile's markup draws: the source of its image. */
function faceOf(markup: string): string | undefined {
  return markup.match(/<img src="([^"]*)"/)?.[1];
}

/** The corner icon a placed tile's markup draws: the image its corner masks with. */
function cornerOf(markup: string): string | undefined {
  return markup.match(/mask-image:url\(([^)]*)\)/)?.[1];
}

/** The tile with id `tileId` among the tiles `side` of `rule` holds. Throws when it holds none. */
function placedTile(rule: BrainRuleDef, side: RuleSide, tileId: string): IBrainTileDef {
  const found = rule
    .side(side)
    .tiles()
    .toArray()
    .find((tileDef) => tileDef.tileId === tileId);
  assert.ok(found, `no placed ${tileId}`);
  return found;
}

/**
 * The icon the candidate chip keyed `key` draws in the offering of `rule`'s
 * card, rendered under `config` while the tray arms a replacement of the WHEN
 * side's first tile; `undefined` when no such chip is drawn.
 */
function chipIcon(config: BrainEditorConfig, rule: BrainRuleDef, key: string): string | undefined {
  const controller: ArmedTargetController = {
    target: {
      ruleDef: rule,
      side: RuleSide.When,
      mode: "replace",
      tileIndex: 0,
      anchorTileIndex: 0,
      entry: "tray",
      onTileSelected: () => true,
    },
    arm: () => {},
    disarm: () => {},
    mode: null,
    reportMode: () => {},
  };
  const markup = renderToStaticMarkup(
    createElement(
      BrainEditorProvider,
      { config },
      createElement(
        ArmedTargetProvider,
        { value: controller },
        createElement(BrainRuleEditor, {
          ruleDef: rule,
          lineNumber: 1,
          ruleCount: 1,
          revision: "",
          commandHistory: new BrainCommandHistory(),
        })
      )
    )
  );
  const start = markup.indexOf(`data-candidate-key="${key.replace(/>/g, "&gt;")}"`);
  if (start < 0) return undefined;
  return markup.slice(start, markup.indexOf("</button>", start)).match(/<img src="([^"]*)"/)?.[1];
}

describe("an open brain editor over a repainted catalog", () => {
  it("draws its placed tiles, an accessor's face and corner included, in the new icons, on the working copy it opened with", async () => {
    const { session, store, openConfig, workingCopy } = await openEditor();
    const rule = firstRule(workingCopy);
    const spot = placedTile(rule, RuleSide.When, SPOT_ID);
    const swatch = placedTile(rule, RuleSide.Do, SWATCH_ID);
    const tint = placedTile(rule, RuleSide.Do, TINT_ACCESSOR_ID);
    assert.equal(faceOf(placed(openConfig, spot)), icon("spot", "before"));
    assert.equal(faceOf(placed(openConfig, tint)), icon("tint", "before"));
    assert.equal(cornerOf(placed(openConfig, tint)), icon("Tint", "before"));

    session.deliverCatalog(paintCatalog("after"));
    const config = currentConfig(store);

    assert.equal(faceOf(placed(config, spot)), icon("spot", "after"));
    assert.equal(faceOf(placed(config, swatch)), icon("swatch", "after"));
    assert.equal(faceOf(placed(config, tint)), icon("tint", "after"));
    assert.equal(cornerOf(placed(config, tint)), icon("Tint", "after"));
    assert.equal(store.getSnapshot().typeIcons.get(TINT_TYPE), icon("Tint", "after"));
  });

  it("draws the candidates it offers on the working copy it opened with in the new icons", async () => {
    const { session, store, openConfig, workingCopy } = await openEditor();
    const rule = firstRule(workingCopy);
    assert.equal(chipIcon(openConfig, rule, SPOT_ID), icon("spot", "before"));

    session.deliverCatalog(paintCatalog("after"));

    assert.equal(chipIcon(currentConfig(store), rule, SPOT_ID), icon("spot", "after"));
  });

  it("keeps an edit not yet flushed across the repaint, drawing it in the new icons, and flushes it into the store", async () => {
    const { session, store, id, editing, workingCopy } = await openEditor();
    const page = workingCopy.pages().get(0) as BrainPageDef;
    const added = page.appendNewRule();
    added.when().appendTile(catalogTile(store.getSnapshot().environment, SPOT_ID));
    editing.change(() => workingCopy.workingCopy());
    const storedBefore = store.getSnapshot().brains.get(id)?.source;

    session.deliverCatalog(paintCatalog("after"));

    assert.equal(store.getSnapshot().brains.get(id)?.source, storedBefore);
    assert.equal(page.children().size(), 2);
    assert.equal(
      faceOf(placed(currentConfig(store), placedTile(added, RuleSide.When, SPOT_ID))),
      icon("spot", "after")
    );

    editing.close();

    const stored = store.getBrain(id);
    assert.ok(stored);
    const storedPage = stored.pages().get(0) as BrainPageDef;
    assert.equal(storedPage.children().size(), 2);
    placedTile(storedPage.children().get(1) as BrainRuleDef, RuleSide.When, SPOT_ID);
    assert.deepEqual(store.getSnapshot().brains.get(id)?.diagnostics, []);
  });
});
