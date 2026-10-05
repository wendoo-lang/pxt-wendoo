import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BrainDef } from "@wendoo/core/app";
import type {
  MakeCodeBrain,
  MakeCodeBrainPush,
  MakeCodeBrainSummary,
  MakeCodeManifestReading,
} from "@wendoo/makecode-session";
import { brainSourceHash } from "@wendoo/makecode-session";
import { BRAIN_CATALOG, brainCatalogIds, kinBrainSource, kinTileId } from "../test-support/brain-catalog.js";
import { buildAuthoringEnvironment } from "./authoring-environment.js";
import { BRAIN_REFERENCE_UNRESOLVED } from "./brain-literals.js";
import { compileBrainSource, serializeBrainSource } from "./brain-source.js";
import type { BrainsSessionState } from "./brains-store.js";
import { BrainsStore } from "./brains-store.js";
import type { EditorBrainsChannel } from "./editor-session-store.js";

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

/** One handshake's brains channel over a project holding `brains` and no manifest, answering at once and recording pushes. */
class ProjectChannel implements EditorBrainsChannel {
  readonly binding = "binding-1";
  readonly pushes: MakeCodeBrainPush[] = [];

  constructor(private readonly brains: Map<string, MakeCodeBrain>) {}

  readManifest(): Promise<MakeCodeManifestReading> {
    return Promise.resolve({ manifest: null });
  }

  writeManifest(): Promise<void> {
    return Promise.resolve();
  }

  listBrains(): Promise<MakeCodeBrainSummary[]> {
    return Promise.resolve(
      [...this.brains.values()].map((brain) => ({
        id: brain.id,
        name: brain.name,
        sourceHash: brainSourceHash(brain.source),
        compiledSourceHash: brain.compiled?.sourceHash ?? null,
      }))
    );
  }

  pullBrains(ids: readonly string[]): Promise<MakeCodeBrain[]> {
    return Promise.resolve(ids.flatMap((id) => this.brains.get(id) ?? []));
  }

  pushBrain(push: MakeCodeBrainPush): Promise<void> {
    this.pushes.push(push);
    return Promise.resolve();
  }
}

/** Waits until every queued answer and the work it starts has run. */
function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/** The project brain `id` named `name` holding `source`, with the compiled form of it. */
function projectBrain(id: string, name: string, source: string): MakeCodeBrain {
  const built = buildAuthoringEnvironment(BRAIN_CATALOG, brainCatalogIds());
  built.brainLiterals.bindSource(source);
  const compiled = compileBrainSource(built.environment, source);
  assert.ok(compiled.bytecode);
  return { id, name, source, compiled: { bytecode: compiled.bytecode, sourceHash: brainSourceHash(source) } };
}

/** The project's two brains: the chaser, holding no rule, and the seeker, whose rule seeks the chaser. */
function projectBrains(): Map<string, MakeCodeBrain> {
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

/** A store reconciled with a project holding {@link projectBrains}. */
async function reconciledStore() {
  const session = new FakeSessionSource();
  const brains = projectBrains();
  const channel = new ProjectChannel(brains);
  let handshake: ((channel: EditorBrainsChannel) => void) | undefined;
  const store = new BrainsStore(session, {
    onBrainsChannel: (listener) => {
      handshake = listener;
      return () => {};
    },
  });
  assert.ok(handshake);
  handshake(channel);
  await settle();
  assert.ok(store.getSnapshot().reconciled);
  return { session, store, channel, brains };
}

describe("brains store brain literals", () => {
  it("mints a literal per held brain, labelled by the brain's name, and compiles a brain naming another to its pushed bytes", async () => {
    const { store, channel, brains } = await reconciledStore();

    const snapshot = store.getSnapshot();
    assert.equal(snapshot.brainLiterals.get(kinTileId(CHASER_ID))?.label, "Chaser");
    assert.equal(snapshot.brainLiterals.get(kinTileId(SEEKER_ID))?.label, "Seeker");
    assert.equal(snapshot.brainLiterals.get(kinTileId(CHASER_ID))?.resolved, true);
    assert.deepEqual(snapshot.brains.get(SEEKER_ID)?.diagnostics, []);
    assert.deepEqual(snapshot.brains.get(SEEKER_ID)?.compiled?.bytecode, brains.get(SEEKER_ID)?.compiled?.bytecode);
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

  it("flags a brain naming a removed brain under its stable code, keeping its bytes", async () => {
    const { store, brains } = await reconciledStore();

    store.removeBrain(CHASER_ID);

    const after = store.getSnapshot();
    assert.deepEqual(after.brains.get(SEEKER_ID)?.compiled?.bytecode, brains.get(SEEKER_ID)?.compiled?.bytecode);
    assert.deepEqual(
      after.unresolvedBrains.get(SEEKER_ID)?.map((literal) => [literal.code, literal.id]),
      [[BRAIN_REFERENCE_UNRESOLVED, CHASER_ID]]
    );
    assert.equal(after.brainLiterals.get(kinTileId(CHASER_ID))?.resolved, false);
  });

  it("binds a removed brain's literal from the references in an environment rebuilt for a new catalog", async () => {
    const { session, store, brains } = await reconciledStore();
    store.removeBrain(CHASER_ID);

    session.deliverCatalog(`${BRAIN_CATALOG} `);
    await settle();

    const entry = store.getSnapshot().brains.get(SEEKER_ID);
    assert.deepEqual(entry?.diagnostics, []);
    assert.deepEqual(entry?.compiled?.bytecode, brains.get(SEEKER_ID)?.compiled?.bytecode);
  });

  it("binds the literals every held brain references in an environment rebuilt for a new catalog", async () => {
    const { session, store, brains } = await reconciledStore();

    session.deliverCatalog(`${BRAIN_CATALOG} `);
    await settle();

    const entry = store.getSnapshot().brains.get(SEEKER_ID);
    assert.deepEqual(entry?.diagnostics, []);
    assert.deepEqual(entry?.compiled?.bytecode, brains.get(SEEKER_ID)?.compiled?.bytecode);
    assert.equal(store.getSnapshot().brainLiterals.get(kinTileId(CHASER_ID))?.label, "Chaser");
  });
});
