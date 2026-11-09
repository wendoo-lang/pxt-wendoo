import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkLiteralTileId } from "@wendoo/core/app";
import type {
  MakeCodeAsset,
  MakeCodeBrainSummary,
  MakeCodeBrainsChannel,
  MakeCodeManifestReading,
  MakeCodeWireBrain,
  MakeCodeWireBrainPush,
  MakeCodeWireCompileOutcome,
} from "@wendoo/makecode-session";
import { brainSourceHash } from "@wendoo/makecode-session";
import { buildAuthoringEnvironment } from "../../authoring/authoring-environment.js";
import {
  ASSET_CATALOG,
  assetCatalogIds,
  PICTURE_TYPE,
  picture,
  pictureBrainSource,
} from "../test-support/asset-catalog.js";
import type { BrainsSessionState } from "./brains-store.js";
import { BrainsStore } from "./brains-store.js";

/** Document id of the project's one brain. */
const BRAIN_ID = "galleryBrain0001";

/** The literal tile id of the asset `id`. */
function pictureTileId(id: string): string {
  return mkLiteralTileId(PICTURE_TYPE, id);
}

/** The session readings a brains store follows, driven by the spec. */
class FakeSessionSource {
  state: BrainsSessionState = { status: "connected", catalogText: ASSET_CATALOG, assets: undefined };
  private readonly _listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  };

  getSnapshot = (): BrainsSessionState => this.state;

  /** The session delivering the asset snapshot `assets`. */
  deliverAssets(assets: readonly MakeCodeAsset[] | undefined): void {
    this.state = { ...this.state, assets };
    for (const listener of this._listeners) listener();
  }
}

/**
 * One handshake's brains channel over a project holding `brains`, answering
 * at once: recording pushes and answering each with no compile outcome, and
 * creating nothing.
 */
class ProjectChannel implements MakeCodeBrainsChannel {
  readonly pushes: MakeCodeWireBrainPush[] = [];

  constructor(private readonly brains: Map<string, MakeCodeWireBrain>) {}

  listBrains(): Promise<MakeCodeBrainSummary[]> {
    return Promise.resolve(this.summaries());
  }

  pullBrains(ids: readonly string[]): Promise<MakeCodeWireBrain[]> {
    return Promise.resolve(ids.flatMap((id) => this.brains.get(id) ?? []));
  }

  pushBrain(push: MakeCodeWireBrainPush): Promise<MakeCodeWireCompileOutcome | null> {
    this.pushes.push(push);
    return Promise.resolve(null);
  }

  createBrain(): Promise<MakeCodeBrainSummary> {
    return Promise.reject(new Error("no brain is created over this channel"));
  }

  /** The project's brains, as its brains publication carries them. */
  summaries(): MakeCodeBrainSummary[] {
    return [...this.brains.values()].map((brain) => ({
      id: brain.id,
      name: brain.name,
      sourceHash: brainSourceHash(brain.source),
      compiledSourceHash: brain.compiledSourceHash,
      origin: brain.origin,
      originLabel: brain.originLabel,
    }));
  }
}

/** Waits until every queued answer and the work it starts has run. */
function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/**
 * The project's brain placing the picture `img1` on both sides, authored in
 * an environment binding the catalog under the allocation a project holding
 * no manifest gets, its registration compiled from its source.
 */
function projectBrain(): MakeCodeWireBrain {
  const built = buildAuthoringEnvironment(ASSET_CATALOG, assetCatalogIds());
  built.assetLiterals.applySnapshot([picture("img1", "hero")]);
  const source = pictureBrainSource(built.environment, pictureTileId("img1")).replace(
    /"id": "[^"]+"/,
    `"id": "${BRAIN_ID}"`
  );
  return {
    id: BRAIN_ID,
    name: "Gallery",
    source,
    compiledSourceHash: brainSourceHash(source),
    origin: null,
    originLabel: null,
  };
}

/**
 * A store over a session that has delivered `assets`, reconciled with a
 * project holding {@link projectBrain}, whose manifest allocates
 * {@link ASSET_CATALOG}; `publishManifest` publishes that manifest again.
 */
async function reconciledStore(assets: readonly MakeCodeAsset[] | undefined) {
  const session = new FakeSessionSource();
  session.deliverAssets(assets);
  const brain = projectBrain();
  const channel = new ProjectChannel(new Map([[BRAIN_ID, brain]]));
  let handshake: ((channel: MakeCodeBrainsChannel) => void) | undefined;
  let manifest: ((reading: MakeCodeManifestReading) => void) | undefined;
  let published: ((brains: MakeCodeBrainSummary[]) => void) | undefined;
  const store = new BrainsStore(session, {
    onBrainsChannel: (listener) => {
      handshake = listener;
      return () => {};
    },
    onManifest: (listener) => {
      manifest = listener;
      return () => {};
    },
    onBrains: (listener) => {
      published = listener;
      return () => {};
    },
  });
  assert.ok(handshake);
  assert.ok(manifest);
  assert.ok(published);
  const publish = manifest;
  const publishManifest = (): void => {
    publish({ manifest: assetCatalogIds() });
  };
  handshake(channel);
  publishManifest();
  published(channel.summaries());
  await settle();
  assert.ok(store.getSnapshot().reconciled);
  return { session, store, channel, brain, publishManifest };
}

describe("brains store asset literals", () => {
  it("compiles a pulled brain clean before any snapshot, pushing nothing", async () => {
    const { store, channel, brain } = await reconciledStore(undefined);

    const entry = store.getSnapshot().brains.get(BRAIN_ID);
    assert.deepEqual(entry?.diagnostics, []);
    assert.deepEqual(entry?.unresolvedTiles, []);
    assert.equal(entry?.compiledSourceHash, brain.compiledSourceHash);
    assert.deepEqual(channel.pushes, []);
    assert.deepEqual(store.getSnapshot().unresolvedAssets, new Map());
  });

  it("takes a snapshot arriving after a cold start without recompiling or pushing", async () => {
    const { session, store, channel } = await reconciledStore(undefined);
    const before = store.getSnapshot();

    session.deliverAssets([picture("img1", "hero")]);
    await settle();

    const after = store.getSnapshot();
    assert.equal(after.environment, before.environment);
    assert.equal(after.brains.get(BRAIN_ID), before.brains.get(BRAIN_ID));
    assert.equal(after.assetLiterals.get(pictureTileId("img1"))?.resolved, true);
    assert.deepEqual(channel.pushes, []);
  });

  it("relabels a renamed asset and repaints a redrawn one with no recompile and no push", async () => {
    const { session, store, channel } = await reconciledStore([picture("img1", "hero", "data:,old")]);
    const before = store.getSnapshot();

    session.deliverAssets([picture("img1", "villain", "data:,old")]);
    session.deliverAssets([picture("img1", "villain", "data:,new")]);
    await settle();

    const after = store.getSnapshot();
    assert.notEqual(after, before);
    assert.equal(after.environment, before.environment);
    assert.equal(after.brains.get(BRAIN_ID), before.brains.get(BRAIN_ID));
    assert.deepEqual(after.assetLiterals.get(pictureTileId("img1")), {
      tileId: pictureTileId("img1"),
      typeId: PICTURE_TYPE,
      kind: "image",
      id: "img1",
      label: "villain",
      previewUrl: "data:,new",
      resolved: true,
    });
    assert.deepEqual(channel.pushes, []);
  });

  it("flags a brain whose asset was deleted, keeping its entry and pushing nothing", async () => {
    const { session, store, channel } = await reconciledStore([picture("img1", "hero")]);
    const before = store.getSnapshot();

    session.deliverAssets([picture("img2", "other")]);
    await settle();

    const after = store.getSnapshot();
    assert.equal(after.environment, before.environment);
    assert.equal(after.brains.get(BRAIN_ID), before.brains.get(BRAIN_ID));
    assert.deepEqual(
      after.unresolvedAssets.get(BRAIN_ID)?.map((literal) => literal.id),
      ["img1"]
    );
    assert.equal(after.assetLiterals.get(pictureTileId("img1"))?.resolved, false);
    assert.equal(after.assetLiterals.get(pictureTileId("img1"))?.previewUrl, undefined);
    assert.deepEqual(channel.pushes, []);
  });

  it("flags a brain whose asset the first snapshot after a cold start lacks", async () => {
    const { session, store, channel } = await reconciledStore(undefined);

    session.deliverAssets([]);

    assert.deepEqual(
      store
        .getSnapshot()
        .unresolvedAssets.get(BRAIN_ID)
        ?.map((literal) => literal.id),
      ["img1"]
    );
    assert.deepEqual(channel.pushes, []);
  });

  it("resolves an asset recreated under the same id again, with no recompile and no push", async () => {
    const { session, store, channel } = await reconciledStore([picture("img1", "hero")]);
    session.deliverAssets([]);
    const deleted = store.getSnapshot();

    session.deliverAssets([picture("img1", "hero")]);
    await settle();

    const after = store.getSnapshot();
    assert.equal(after.environment, deleted.environment);
    assert.equal(after.brains.get(BRAIN_ID), deleted.brains.get(BRAIN_ID));
    assert.equal(after.unresolvedAssets.has(BRAIN_ID), false);
    assert.equal(after.assetLiterals.get(pictureTileId("img1"))?.resolved, true);
    assert.deepEqual(channel.pushes, []);
  });

  it("mints a literal for an asset added to the snapshot, with no rebuild", async () => {
    const { session, store } = await reconciledStore([picture("img1", "hero")]);
    const before = store.getSnapshot();

    session.deliverAssets([picture("img1", "hero"), picture("img2", "sidekick")]);

    const after = store.getSnapshot();
    assert.equal(after.environment, before.environment);
    assert.equal(after.assetLiterals.get(pictureTileId("img2"))?.label, "sidekick");
    assert.ok(after.environment.tileCatalogs().some((catalog) => catalog.has(pictureTileId("img2"))));
  });

  it("binds the literals every held brain references in an environment rebuilt for a new catalog", async () => {
    const { session, store, publishManifest } = await reconciledStore(undefined);

    session.state = { ...session.state, catalogText: `${ASSET_CATALOG} ` };
    session.deliverAssets(undefined);
    publishManifest();
    await settle();

    const entry = store.getSnapshot().brains.get(BRAIN_ID);
    assert.deepEqual(entry?.diagnostics, []);
    assert.deepEqual(entry?.unresolvedTiles, []);
  });
});
