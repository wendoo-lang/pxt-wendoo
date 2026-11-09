import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BrainDef } from "@wendoo/core/app";
import type {
  MakeCodeBrainSummary,
  MakeCodeBrainsChannel,
  MakeCodeManifestReading,
  MakeCodeWireBrain,
} from "@wendoo/makecode-session";
import { brainSourceHash } from "@wendoo/makecode-session";
import { buildAuthoringEnvironment } from "../../authoring/authoring-environment.js";
import { BRAIN_REFERENCE_UNRESOLVED } from "../../authoring/brain-literals.js";
import { serializeBrainSource } from "../../authoring/brain-source.js";
import { BRAIN_CATALOG, brainCatalogIds, kinBrainSource, kinTileId } from "../test-support/brain-catalog.js";
import { FakeBrainsChannel, FrameProject } from "../test-support/frame-project.js";
import type { BrainsSessionState } from "./brains-store.js";
import { BrainsStore } from "./brains-store.js";

/** Document id of the project's brain the other one names. */
const CHASER_ID = "chaserBrain00001";

/** Document id of the project's brain naming the chaser in a rule. */
const SEEKER_ID = "seekerBrain00001";

/** The session readings a brains store follows: connected, carrying {@link BRAIN_CATALOG}. */
class FakeSessionSource {
  state: BrainsSessionState = { status: "connected", catalogText: BRAIN_CATALOG, assets: undefined };
  private readonly _listeners = new Set<() => void>();

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

/** Waits until every queued answer and the work it starts has run. */
function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/** The project brain `id` named `name` holding `source`, its registration compiled from it. */
function projectBrain(id: string, name: string, source: string): MakeCodeWireBrain {
  return { id, name, source, compiledSourceHash: brainSourceHash(source), origin: null, originLabel: null };
}

/** The project's two brains: the chaser, holding no rule, and the seeker, whose rule seeks the chaser. */
function projectBrains(): Map<string, MakeCodeWireBrain> {
  const built = buildAuthoringEnvironment(BRAIN_CATALOG, brainCatalogIds());
  const chaser = serializeBrainSource(BrainDef.emptyBrainDef(built.environment.brainServices, "Chaser")).replace(
    /"id": "[^"]+"/,
    `"id": "${CHASER_ID}"`
  );
  built.brainLiterals.applyBrains(new Map([[CHASER_ID, { name: "Chaser" }]]));
  const seeker = kinBrainSource(built.environment, kinTileId(CHASER_ID), SEEKER_ID);
  return new Map([
    [CHASER_ID, projectBrain(CHASER_ID, "Chaser", chaser)],
    [SEEKER_ID, projectBrain(SEEKER_ID, "Seeker", seeker)],
  ]);
}

/**
 * A store reconciled with a project holding {@link projectBrains}, whose
 * manifest allocates {@link BRAIN_CATALOG}; `publishManifest` publishes that
 * manifest again.
 */
async function reconciledStore() {
  const session = new FakeSessionSource();
  const brains = new FrameProject(projectBrains());
  const channel = new FakeBrainsChannel(brains, { applyPushes: false });
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
    publish({ manifest: brainCatalogIds() });
  };
  handshake(channel);
  publishManifest();
  published(brains.summaries());
  await settle();
  assert.ok(store.getSnapshot().reconciled);
  return { session, store, channel, brains, publishManifest };
}

describe("brains store brain literals", () => {
  it("mints a literal per held brain, labelled by the brain's name, and compiles a brain naming another clean", async () => {
    const { store, channel } = await reconciledStore();

    const snapshot = store.getSnapshot();
    assert.equal(snapshot.brainLiterals.get(kinTileId(CHASER_ID))?.label, "Chaser");
    assert.equal(snapshot.brainLiterals.get(kinTileId(SEEKER_ID))?.label, "Seeker");
    assert.equal(snapshot.brainLiterals.get(kinTileId(CHASER_ID))?.resolved, true);
    assert.deepEqual(snapshot.brains.get(SEEKER_ID)?.diagnostics, []);
    assert.deepEqual(snapshot.brains.get(SEEKER_ID)?.unresolvedTiles, []);
    assert.deepEqual(snapshot.unresolvedBrains, new Map());
    assert.deepEqual(channel.pushes, []);
  });

  it("relabels a renamed brain's literal in place with no rebuild and no recompile of the brains naming it", async () => {
    const { store } = await reconciledStore();
    const before = store.getSnapshot();

    store.renameBrain(CHASER_ID, "Hunter");

    const after = store.getSnapshot();
    assert.equal(after.environment, before.environment);
    assert.equal(after.brains.get(SEEKER_ID), before.brains.get(SEEKER_ID));
    assert.equal(after.brainLiterals.get(kinTileId(CHASER_ID))?.label, "Hunter");
  });

  it("flags a brain naming a removed brain under its stable code, keeping its entry", async () => {
    const { store } = await reconciledStore();
    const before = store.getSnapshot();

    store.removeBrain(CHASER_ID);

    const after = store.getSnapshot();
    assert.equal(after.brains.get(SEEKER_ID), before.brains.get(SEEKER_ID));
    assert.deepEqual(
      after.unresolvedBrains.get(SEEKER_ID)?.map((literal) => [literal.code, literal.id]),
      [[BRAIN_REFERENCE_UNRESOLVED, CHASER_ID]]
    );
    assert.equal(after.brainLiterals.get(kinTileId(CHASER_ID))?.resolved, false);
  });

  it("binds a removed brain's literal from the references in an environment rebuilt for a new catalog", async () => {
    const { session, store, publishManifest } = await reconciledStore();
    store.removeBrain(CHASER_ID);
    const before = store.getSnapshot().environment;

    session.deliverCatalog(`${BRAIN_CATALOG} `);
    publishManifest();
    await settle();

    assert.notEqual(store.getSnapshot().environment, before);

    const entry = store.getSnapshot().brains.get(SEEKER_ID);
    assert.deepEqual(entry?.diagnostics, []);
    assert.deepEqual(entry?.unresolvedTiles, []);
  });

  it("binds the literals every held brain references in an environment rebuilt for a new catalog", async () => {
    const { session, store, publishManifest } = await reconciledStore();
    const before = store.getSnapshot().environment;

    session.deliverCatalog(`${BRAIN_CATALOG} `);
    publishManifest();
    await settle();

    assert.notEqual(store.getSnapshot().environment, before);

    const entry = store.getSnapshot().brains.get(SEEKER_ID);
    assert.deepEqual(entry?.diagnostics, []);
    assert.deepEqual(entry?.unresolvedTiles, []);
    assert.equal(store.getSnapshot().brainLiterals.get(kinTileId(CHASER_ID))?.label, "Chaser");
  });
});
