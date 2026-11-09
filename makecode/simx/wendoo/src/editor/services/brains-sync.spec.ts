import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it, mock } from "node:test";
import type { WendooEnvironment } from "@wendoo/core/app";
import { BrainDef, CoreHostActions, LogLevel, logger, mkActuatorTileId, mkSensorTileId } from "@wendoo/core/app";
import type { BrainPageDef, BrainRuleDef } from "@wendoo/core/brain/model";
import type {
  MakeCodeBrainSummary,
  MakeCodeBrainsChannel,
  MakeCodeIdManifest,
  MakeCodeManifestReading,
  MakeCodeWireBrain,
  MakeCodeWireBrainPush,
  MakeCodeWireCompileOutcome,
} from "@wendoo/makecode-session";
import {
  brainSourceHash,
  MakeCodeBrainsError,
  MakeCodeBrainsErrorCode,
  MakeCodeManifestProblemCode,
} from "@wendoo/makecode-session";
import { buildAuthoringEnvironment, CATALOG_PACK_UNBOUND } from "../../authoring/authoring-environment.js";
import {
  BRAIN_SOURCE_ID_MISMATCH,
  BRAIN_SOURCE_INVALID,
  readBrainSource,
  serializeBrainSource,
} from "../../authoring/brain-source.js";
import { FrameProject, frameProjectOf } from "../test-support/frame-project.js";
import { seedBrain } from "../test-support/seed-brain.js";
import type { BrainEntry, BrainsSessionState } from "./brains-store.js";
import { BRAIN_TILE_UNRESOLVED, BrainsStore, MAKECODE_COMPILE_MISMATCH, PUSH_RETRY_DELAYS_MS } from "./brains-store.js";

/** A wait far past every retry delay: ten minutes. */
const LONG_WAIT_MS = 10 * 60_000;

/** The session readings a brains store follows, driven by the spec. */
class FakeSessionSource {
  state: BrainsSessionState = { status: "disconnected", catalogText: undefined, assets: undefined };
  private readonly _listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  };

  getSnapshot = (): BrainsSessionState => this.state;

  /** The session's connectivity changing to `status`, reported to its listeners. */
  setStatus(status: BrainsSessionState["status"]): void {
    this.state = { ...this.state, status };
    for (const listener of this._listeners) listener();
  }

  /** The session delivering the catalog `catalogText`, reported to its listeners. */
  setCatalog(catalogText: string | undefined): void {
    this.state = { ...this.state, catalogText };
    for (const listener of this._listeners) listener();
  }
}

/** One request a {@link FakeChannel} holds unanswered. */
type HeldRequest = () => void;

/**
 * One handshake's brains channel over a {@link FrameProject}, standing in for
 * the frame: it answers every request from its project in a later microtask,
 * or, while held, queues the answers until released. Closing it rejects every
 * unanswered request and every later one with `CLOSED`.
 */
class FakeChannel implements MakeCodeBrainsChannel {
  readonly project: FrameProject;
  /** Every push received, in order. */
  readonly pushes: MakeCodeWireBrainPush[] = [];
  /** Every pull received, as the ids it named. */
  readonly pulls: string[][] = [];
  /** The name of every create received, in order. */
  readonly creates: string[] = [];
  /** When set, pushes naming these ids are answered with `WRITE_FAILED`. */
  readonly failingWrites = new Set<string>();
  /** When set, pushes naming these ids are never answered; closing still rejects them with `CLOSED`. */
  readonly unansweredWrites = new Set<string>();
  /** How many of the next pulls are answered with `READ_FAILED`. */
  failingPulls = 0;
  /** How many of the next creates are answered with `WRITE_FAILED`. */
  failingCreates = 0;
  /** When set, replaces the outcome of every write it answers, standing for a frame compiling otherwise than the store. */
  outcomeOf: ((outcome: MakeCodeWireCompileOutcome) => MakeCodeWireCompileOutcome) | undefined;
  held = false;
  private readonly _queue: HeldRequest[] = [];
  private readonly _rejects = new Set<(error: Error) => void>();
  private _closed = false;

  constructor(project: FrameProject) {
    this.project = project;
  }

  listBrains(): Promise<MakeCodeBrainSummary[]> {
    return this.answer(() => this.project.summaries());
  }

  pullBrains(ids: readonly string[]): Promise<MakeCodeWireBrain[]> {
    this.pulls.push([...ids]);
    return this.answer(() => {
      if (this.failingPulls > 0) {
        this.failingPulls -= 1;
        throw new MakeCodeBrainsError(MakeCodeBrainsErrorCode.READ_FAILED, "unreadable");
      }
      return ids.flatMap((id) => this.project.get(id) ?? []);
    });
  }

  pushBrain(push: MakeCodeWireBrainPush): Promise<MakeCodeWireCompileOutcome | null> {
    this.pushes.push(push);
    const id = push.op === "write" ? push.brain.id : push.brainId;
    if (this.unansweredWrites.has(id)) return this.unanswered();
    return this.answer(() => {
      if (this.failingWrites.has(id)) {
        throw new MakeCodeBrainsError(MakeCodeBrainsErrorCode.WRITE_FAILED, "unwritable");
      }
      if (push.op === "remove") {
        this.project.remove(push.brainId);
        return null;
      }
      const outcome = this.project.write(push.brain.id, push.brain.name, push.brain.source);
      return this.outcomeOf === undefined ? outcome : this.outcomeOf(outcome);
    });
  }

  createBrain(name: string): Promise<MakeCodeBrainSummary> {
    this.creates.push(name);
    return this.answer(() => {
      if (this.failingCreates > 0) {
        this.failingCreates -= 1;
        throw new MakeCodeBrainsError(MakeCodeBrainsErrorCode.WRITE_FAILED, "unwritable");
      }
      return this.project.create(name);
    });
  }

  /** Answers every request held so far, in arrival order, and stops holding. */
  release(): void {
    this.held = false;
    for (const answer of this._queue.splice(0)) answer();
  }

  /** Answers the request at `position` among those held, out of arrival order, and keeps holding the rest. */
  releaseAt(position: number): void {
    const [answer] = this._queue.splice(position, 1);
    assert.ok(answer, `expected a held request at ${position}`);
    answer();
  }

  /** The handshake ending: every unanswered request and every later one rejects with `CLOSED`. */
  close(): void {
    this._closed = true;
    this._queue.length = 0;
    for (const reject of this._rejects) reject(new MakeCodeBrainsError(MakeCodeBrainsErrorCode.CLOSED, "closed"));
    this._rejects.clear();
  }

  /** A request the project never answers: it settles only by rejecting with `CLOSED` when the channel closes. */
  private unanswered(): Promise<never> {
    if (this._closed) return Promise.reject(new MakeCodeBrainsError(MakeCodeBrainsErrorCode.CLOSED, "closed"));
    return new Promise<never>((_resolve, reject) => {
      this._rejects.add(reject);
    });
  }

  private answer<T>(compute: () => T): Promise<T> {
    if (this._closed) return Promise.reject(new MakeCodeBrainsError(MakeCodeBrainsErrorCode.CLOSED, "closed"));
    return new Promise<T>((resolve, reject) => {
      this._rejects.add(reject);
      const run = () => {
        this._rejects.delete(reject);
        try {
          resolve(compute());
        } catch (error) {
          reject(error);
        }
      };
      if (this.held) this._queue.push(run);
      else queueMicrotask(run);
    });
  }
}

/**
 * The sync source a brains store follows, standing in for the MakeCode
 * side's frame: hands out the spec's channels, and publishes the frame's id
 * manifest and the project's brains on each handshake and on the spec's word.
 */
class FakeSync {
  private readonly _listeners = new Set<(channel: MakeCodeBrainsChannel) => void>();
  private readonly _manifestListeners = new Set<(reading: MakeCodeManifestReading) => void>();
  private readonly _brainsListeners = new Set<(brains: MakeCodeBrainSummary[]) => void>();

  onBrainsChannel = (listener: (channel: MakeCodeBrainsChannel) => void): (() => void) => {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  };

  onManifest = (listener: (reading: MakeCodeManifestReading) => void): (() => void) => {
    this._manifestListeners.add(listener);
    return () => {
      this._manifestListeners.delete(listener);
    };
  };

  onBrains = (listener: (brains: MakeCodeBrainSummary[]) => void): (() => void) => {
    this._brainsListeners.add(listener);
    return () => {
      this._brainsListeners.delete(listener);
    };
  };

  /**
   * A handshake completing over `project`, handing out its channel, then the
   * frame publishing `reading` as the handshake's first manifest, unless it
   * is `null`, and the project's brains, unless `publishes` is `false`.
   */
  open(
    project: FrameProject,
    held = false,
    reading: MakeCodeManifestReading | null = { manifest: null },
    publishes = true
  ): FakeChannel {
    const channel = new FakeChannel(project);
    channel.held = held;
    for (const listener of this._listeners) listener(channel);
    if (reading !== null) this.publish(reading);
    if (publishes) this.publishBrains(project);
    return channel;
  }

  /** The frame publishing the manifest `reading`. */
  publish(reading: MakeCodeManifestReading): void {
    for (const listener of this._manifestListeners) listener(structuredClone(reading));
  }

  /** The frame publishing `project`'s brains. */
  publishBrains(project: FrameProject): void {
    for (const listener of this._brainsListeners) listener(project.summaries());
  }
}

/** Resolves once every queued microtask and the answers they queue have run. */
function settle(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

/** The first rule of `definition`'s first page. */
function firstRule(definition: BrainDef): BrainRuleDef {
  const page = definition.pages().get(0) as BrainPageDef;
  return page.children().get(0) as BrainRuleDef;
}

/** Authors a rule that compiles into `definition`. */
function authorCompilingRule(environment: WendooEnvironment, definition: BrainDef): void {
  const rule = firstRule(definition);
  for (const catalog of environment.tileCatalogs()) {
    const when = catalog.get(mkSensorTileId(CoreHostActions.OnPageEntered.key));
    const act = catalog.get(mkActuatorTileId(CoreHostActions.RestartPage.key));
    if (when && act) {
      rule.when().appendTile(when);
      rule.do().appendTile(act);
      return;
    }
  }
  throw new Error("no core tiles");
}

/** Authors an actuator on `definition`'s first WHEN side: a placement the compiler rejects with an error. */
function authorMisplacedTile(environment: WendooEnvironment, definition: BrainDef): void {
  for (const catalog of environment.tileCatalogs()) {
    const tile = catalog.get(mkActuatorTileId(CoreHostActions.SwitchPage.key));
    if (tile) {
      firstRule(definition).when().appendTile(tile);
      return;
    }
  }
  throw new Error("no core tiles");
}

/** A brain document named `name`, `edit` authoring into it first, as a project holds it before the frame compiles it. */
function projectBrain(name: string, edit?: (environment: WendooEnvironment, definition: BrainDef) => void) {
  const { environment } = buildAuthoringEnvironment(undefined);
  const definition = BrainDef.emptyBrainDef(environment.brainServices, name);
  edit?.(environment, definition);
  return { id: definition.id(), name, source: serializeBrainSource(definition) };
}

/** A project holding `brains`, each written to it as the frame writes a push. */
const projectOf = frameProjectOf;

/** The entry `store` holds for `id`. Fails the spec when it holds none. */
function entryOf(store: BrainsStore, id: string): BrainEntry {
  const entry = store.getSnapshot().brains.get(id);
  assert.ok(entry, `expected the store to hold brain ${id}`);
  return entry;
}

/** The last push `channel` received, or `undefined` when it received none. */
function lastPush(channel: FakeChannel): MakeCodeWireBrainPush | undefined {
  return channel.pushes[channel.pushes.length - 1];
}

/** The ids of the brains `channel` received writes for, in order. */
function writtenIds(channel: FakeChannel): string[] {
  return channel.pushes.flatMap((push) => (push.op === "write" ? [push.brain.id] : []));
}

/** The codes `warnings` logged, in order. */
function warnedCodes(warnings: ReturnType<typeof mock.method>): unknown[] {
  return warnings.mock.calls.map((call) => call.arguments[0]);
}

describe("brains sync", () => {
  let session: FakeSessionSource;
  let sync: FakeSync;
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
    // Holds push retries until a spec advances the clock.
    mock.timers.enable({ apis: ["setTimeout"] });
    session = new FakeSessionSource();
    sync = new FakeSync();
  });

  afterEach(() => {
    mock.timers.reset();
  });

  /** A store following the spec's session and sync source. */
  function syncedStore(): BrainsStore {
    return new BrainsStore(session, sync);
  }

  /** Connects the session and opens a handshake over `project`, resolving once it has reconciled. */
  async function handshake(project: FrameProject): Promise<FakeChannel> {
    session.setStatus("connected");
    const channel = sync.open(project);
    await settle();
    return channel;
  }

  /** Advances the clock by `ms` and lets the answers it triggers run. */
  async function elapse(ms: number): Promise<void> {
    mock.timers.tick(ms);
    await settle();
  }

  /**
   * Advances the clock through {@link LONG_WAIT_MS} in one-second steps,
   * letting every timer each step fires, and every answer it triggers, run
   * before the next.
   */
  async function waitLong(): Promise<void> {
    for (let waited = 0; waited < LONG_WAIT_MS; waited += 1000) await elapse(1000);
  }

  /** Seeds `store` with a brain named `name`, letting its push land; returns its id. */
  async function seeded(store: BrainsStore, name: string): Promise<string> {
    const id = seedBrain(store, name);
    await settle();
    return id;
  }

  describe("push on apply", () => {
    it("pushes each brain applied while connected, its source alone, and shows the frame's outcome once it lands", async () => {
      const store = syncedStore();
      const channel = await handshake(projectOf());

      const id = seedBrain(store, "Chaser");
      const edited = store.getBrain(id);
      assert.ok(edited);
      authorCompilingRule(store.getSnapshot().environment, edited);
      store.applyBrain(edited);
      await settle();

      const entry = entryOf(store, id);
      assert.deepEqual(lastPush(channel), { op: "write", brain: { id, name: "Chaser", source: entry.source } });
      assert.equal(entry.compiledSourceHash, entry.sourceHash);
      assert.equal(channel.project.get(id)?.compiledSourceHash, entry.sourceHash);
      assert.equal(store.getSnapshot().pending.size, 0);
    });

    it("pushes a removal of a brain removed while connected", async () => {
      const store = syncedStore();
      const channel = await handshake(projectOf());
      const id = await seeded(store, "Chaser");

      store.removeBrain(id);
      await settle();

      assert.deepEqual(lastPush(channel), { op: "remove", brainId: id });
      assert.equal(channel.project.has(id), false);
      assert.equal(store.getSnapshot().pending.size, 0);
    });

    it("records an edit pending when its push fails, keeping it until a later push is answered", async () => {
      const store = syncedStore();
      const first = await handshake(projectOf());
      const id = seedBrain(store, "Chaser");
      first.failingWrites.add(id);
      store.renameBrain(id, "Runner");
      await settle();
      assert.deepEqual([...store.getSnapshot().pending], [id]);

      first.close();
      session.setStatus("disconnected");
      const second = await handshake(first.project);

      assert.equal(second.project.get(id)?.name, "Runner");
      assert.equal(store.getSnapshot().pending.size, 0);
    });
  });

  describe("compile outcomes", () => {
    let warnings: ReturnType<typeof mock.method>;

    beforeEach(() => {
      warnings = mock.method(logger, "warn", () => {});
    });

    afterEach(() => {
      warnings.mock.restore();
    });

    it("shows the store's own compile while a push is in flight, then the frame's outcome for the same source", async () => {
      const store = syncedStore();
      const channel = await handshake(projectOf());
      const id = await seeded(store, "Chaser");
      channel.held = true;
      channel.outcomeOf = (outcome) => ({ ...outcome, compiled: null });
      const broken = store.getBrain(id);
      assert.ok(broken);
      authorMisplacedTile(store.getSnapshot().environment, broken);

      store.applyBrain(broken);
      const local = entryOf(store, id);
      channel.release();
      await settle();

      assert.ok(local.diagnostics.some((diagnostic) => diagnostic.severity === "error"));
      assert.notEqual(local.compiledSourceHash, null);
      const shown = entryOf(store, id);
      assert.equal(shown.compiledSourceHash, null);
      assert.deepEqual(shown.diagnostics, local.diagnostics);
      assert.deepEqual(warnedCodes(warnings), []);
    });

    it("logs MAKECODE_COMPILE_MISMATCH once per brain per source when the frame's outcome differs, showing the frame's", async () => {
      const store = syncedStore();
      const channel = await handshake(projectOf());
      const id = await seeded(store, "Chaser");
      channel.outcomeOf = (outcome) => ({ ...outcome, diagnostics: [], unresolvedTiles: ["actuator.chime.ring"] });
      const broken = store.getBrain(id);
      assert.ok(broken);
      authorMisplacedTile(store.getSnapshot().environment, broken);

      store.applyBrain(broken);
      await settle();
      store.renameBrain(id, "Runner");
      await settle();
      store.renameBrain(id, "Chaser");
      await settle();

      const entry = entryOf(store, id);
      assert.deepEqual(entry.diagnostics, []);
      assert.deepEqual(
        entry.unresolvedTiles.map((tile) => [tile.code, tile.tileId]),
        [[BRAIN_TILE_UNRESOLVED, "actuator.chime.ring"]]
      );
      assert.deepEqual(warnedCodes(warnings), [MAKECODE_COMPILE_MISMATCH, MAKECODE_COMPILE_MISMATCH]);
      assert.deepEqual(
        warnings.mock.calls.map((call) => (call.arguments[1] as { brainId: string }).brainId),
        [id, id]
      );
    });

    it("logs MAKECODE_COMPILE_MISMATCH when the frame produced no program for a source the store compiles clean", async () => {
      const store = syncedStore();
      const channel = await handshake(projectOf());
      const id = await seeded(store, "Chaser");
      channel.outcomeOf = (outcome) => ({ ...outcome, compiled: null });

      store.renameBrain(id, "Runner");
      await settle();

      assert.deepEqual(warnedCodes(warnings), [MAKECODE_COMPILE_MISMATCH]);
      assert.equal(entryOf(store, id).compiledSourceHash, null);
    });

    it("logs nothing when the frame's outcome agrees with the store's own compile", async () => {
      const store = syncedStore();
      await handshake(projectOf());
      const id = await seeded(store, "Chaser");
      const broken = store.getBrain(id);
      assert.ok(broken);
      authorMisplacedTile(store.getSnapshot().environment, broken);

      store.applyBrain(broken);
      await settle();

      assert.deepEqual(warnedCodes(warnings), []);
    });

    it("leaves the newer edit's own compile shown when an outcome for an earlier source lands", async () => {
      const store = syncedStore();
      const channel = await handshake(projectOf());
      const id = await seeded(store, "Chaser");
      channel.held = true;
      channel.outcomeOf = (outcome) => ({ ...outcome, compiled: null, unresolvedTiles: ["actuator.chime.ring"] });
      store.renameBrain(id, "Older");
      store.renameBrain(id, "Newer");
      const newer = entryOf(store, id);

      channel.releaseAt(0);
      await settle();

      assert.equal(entryOf(store, id), newer);
      assert.deepEqual([...store.getSnapshot().pending], [id]);
    });
  });

  describe("reconnect flush", () => {
    it("flushes every pend on the next handshake, deletions included, clearing each on its answer", async () => {
      const store = syncedStore();
      const first = await handshake(projectOf());
      const kept = seedBrain(store, "Chaser");
      const removed = seedBrain(store, "Runner");
      await settle();
      first.close();
      session.setStatus("disconnected");

      store.renameBrain(kept, "Hider");
      store.removeBrain(removed);
      const added = seedBrain(store, "Seeker");
      assert.deepEqual([...store.getSnapshot().pending].sort(), [kept, removed, added].sort());
      const second = await handshake(first.project);

      assert.equal(store.getSnapshot().pending.size, 0);
      assert.deepEqual([...second.project.keys()].sort(), [kept, added].sort());
      assert.equal(second.project.get(kept)?.name, "Hider");
      assert.ok(second.pushes.some((push) => push.op === "remove" && push.brainId === removed));
    });

    it("keeps pends through a handshake that closes before reconciling, flushing them on the next", async () => {
      const store = syncedStore();
      const first = await handshake(projectOf(projectBrain("Remote")));
      first.close();
      session.setStatus("disconnected");
      const id = seedBrain(store, "Chaser");

      session.setStatus("connected");
      const stalled = sync.open(first.project, true);
      await settle();
      stalled.close();
      await settle();
      assert.deepEqual([...store.getSnapshot().pending], [id]);

      const third = sync.open(first.project);
      await settle();
      assert.equal(store.getSnapshot().pending.size, 0);
      assert.equal(third.project.has(id), true);
    });

    it("keeps an edit made while a pull is in flight over the pulled copy, and flushes it after", async () => {
      const store = syncedStore();
      const first = await handshake(projectOf());
      const id = await seeded(store, "Chaser");
      first.close();
      session.setStatus("disconnected");
      first.project.write(id, "Remote", renamedSource(store, id, "Remote"));

      session.setStatus("connected");
      const second = sync.open(first.project, true);
      await settle();
      assert.deepEqual(second.pulls, [[id]]);
      store.renameBrain(id, "Local");
      assert.deepEqual([...store.getSnapshot().pending], [id]);
      second.release();
      await settle();

      assert.equal(entryOf(store, id).name, "Local");
      assert.equal(second.project.get(id)?.name, "Local");
      assert.equal(store.getSnapshot().pending.size, 0);
    });
  });

  describe("handshake lifecycle", () => {
    it("merges on the first handshake: brains authored before it push to the project, and its brains are pulled", async () => {
      const store = syncedStore();
      const local = seedBrain(store, "Local");
      const remote = projectBrain("Remote");

      const channel = await handshake(projectOf(remote));

      assert.deepEqual([...store.getSnapshot().brains.keys()], [local, remote.id]);
      assert.equal(entryOf(store, remote.id).source, remote.source);
      assert.deepEqual(writtenIds(channel), [local]);
      assert.equal(store.getSnapshot().pending.size, 0);
    });

    it("keeps brains and pends through the next handshake", async () => {
      const store = syncedStore();
      const first = await handshake(projectOf(projectBrain("Remote")));
      const synced = [...store.getSnapshot().brains.keys()];
      first.close();
      session.setStatus("disconnected");
      const pending = seedBrain(store, "Offline");

      session.setStatus("connected");
      const second = sync.open(first.project, true);
      assert.deepEqual([...store.getSnapshot().brains.keys()], [...synced, pending]);
      assert.deepEqual([...store.getSnapshot().pending], [pending]);
      await settle();
      second.release();
      await settle();

      assert.deepEqual([...store.getSnapshot().brains.keys()], [...synced, pending]);
      assert.equal(store.getSnapshot().pending.size, 0);
    });

    it("waits for the handshake's first brains publication before reconciling", async () => {
      const store = syncedStore();
      const remote = projectBrain("Remote");
      session.setStatus("connected");

      const channel = sync.open(projectOf(remote), false, { manifest: null }, false);
      await settle();
      assert.deepEqual(channel.pulls, []);
      assert.equal(store.getSnapshot().reconciled, false);
      sync.publishBrains(channel.project);
      await settle();

      assert.deepEqual(channel.pulls, [[remote.id]]);
      assert.equal(store.getSnapshot().reconciled, true);
      assert.equal(entryOf(store, remote.id).source, remote.source);
    });

    it("removes a synced brain the project deletes between publishing and pulling it", async () => {
      const store = syncedStore();
      const remote = projectBrain("Remote");
      const first = await handshake(projectOf(remote));
      first.close();
      session.setStatus("disconnected");
      first.project.write(remote.id, remote.name, sourceWith(remote, authorCompilingRule));

      session.setStatus("connected");
      const second = sync.open(first.project, true);
      await settle();
      assert.deepEqual(second.pulls, [[remote.id]]);
      second.project.delete(remote.id);
      second.release();
      await settle();

      assert.equal(store.getSnapshot().brains.size, 0);
      assert.deepEqual(second.pushes, []);
    });

    it("removes a synced brain the project no longer holds, and keeps one pending", async () => {
      const store = syncedStore();
      const gone = projectBrain("Gone");
      const kept = projectBrain("Kept");
      const first = await handshake(projectOf(gone, kept));
      first.close();
      session.setStatus("disconnected");
      store.renameBrain(kept.id, "Renamed");
      first.project.clear();

      const second = await handshake(first.project);

      assert.deepEqual([...store.getSnapshot().brains.keys()], [kept.id]);
      assert.equal(second.project.get(kept.id)?.name, "Renamed");
    });

    it("adopts a pulled brain with the compiled source hash the project reports, pushing nothing", async () => {
      const store = syncedStore();
      const broken = projectBrain("Broken", authorMisplacedTile);

      const channel = await handshake(projectOf(broken));

      const entry = entryOf(store, broken.id);
      assert.equal(entry.source, broken.source);
      assert.equal(entry.compiledSourceHash, null);
      assert.ok(entry.diagnostics.some((diagnostic) => diagnostic.severity === "error"));
      assert.deepEqual(channel.pushes, []);
    });
  });

  describe("later publications", () => {
    it("adopts a brain a later publication carries that the store does not hold, as another tab created it", async () => {
      const store = syncedStore();
      const channel = await handshake(projectOf());
      const created = projectBrain("Elsewhere");
      channel.project.write(created.id, created.name, created.source);

      sync.publishBrains(channel.project);
      await settle();

      assert.equal(entryOf(store, created.id).source, created.source);
      assert.equal(entryOf(store, created.id).compiledSourceHash, brainSourceHash(created.source));
      assert.deepEqual(channel.pushes, []);
      assert.equal(store.getSnapshot().pending.size, 0);
    });

    it("adopts a later publication's changed source of a brain holding no pending edit, and pulls none holding one", async () => {
      const store = syncedStore();
      const synced = projectBrain("Synced");
      const pending = projectBrain("Pending");
      const channel = await handshake(projectOf(synced, pending));
      channel.unansweredWrites.add(pending.id);
      store.renameBrain(pending.id, "Local");
      channel.project.write(synced.id, "Renamed elsewhere", renamedSource(store, synced.id, "Renamed elsewhere"));
      channel.project.write(pending.id, "Renamed elsewhere", sourceWith(pending, authorCompilingRule));
      const pulls = channel.pulls.length;

      sync.publishBrains(channel.project);
      await settle();

      assert.deepEqual(channel.pulls.slice(pulls), [[synced.id]]);
      assert.equal(entryOf(store, synced.id).name, "Renamed elsewhere");
      assert.equal(entryOf(store, pending.id).name, "Local");
    });

    it("drops a brain a later publication no longer carries, unless it holds a pending edit", async () => {
      const store = syncedStore();
      const gone = projectBrain("Gone");
      const kept = projectBrain("Kept");
      const channel = await handshake(projectOf(gone, kept));
      channel.unansweredWrites.add(kept.id);
      store.renameBrain(kept.id, "Renamed");
      channel.project.clear();

      sync.publishBrains(channel.project);
      await settle();

      assert.deepEqual([...store.getSnapshot().brains.keys()], [kept.id]);
    });

    it("keeps a brain whose push lands while a publication lacking it reconciles", async () => {
      const store = syncedStore();
      const synced = projectBrain("Synced");
      const edited = projectBrain("Edited");
      const channel = await handshake(projectOf(synced, edited));
      channel.held = true;
      store.renameBrain(edited.id, "Local");
      channel.project.remove(edited.id);
      channel.project.write(synced.id, "Renamed elsewhere", renamedSource(store, synced.id, "Renamed elsewhere"));

      sync.publishBrains(channel.project);
      await settle();
      channel.releaseAt(0);
      await settle();
      assert.equal(store.getSnapshot().pending.size, 0);
      channel.release();
      await settle();

      assert.equal(entryOf(store, edited.id).name, "Local");
      assert.equal(entryOf(store, synced.id).name, "Renamed elsewhere");
    });

    it("takes a published compiled source hash for the source the store holds, pulling nothing", async () => {
      const store = syncedStore();
      const remote = projectBrain("Remote");
      const channel = await handshake(projectOf(remote));
      const pulls = channel.pulls.length;
      channel.project.set(remote.id, { ...remote, compiledSourceHash: "00000000" });

      sync.publishBrains(channel.project);
      await settle();

      assert.equal(entryOf(store, remote.id).compiledSourceHash, "00000000");
      assert.equal(channel.pulls.length, pulls);
    });

    it("re-pulls a damaged source only once the project holds another text", async () => {
      const store = syncedStore();
      const remote = { ...projectBrain("Remote"), source: "not json {" };
      const channel = await handshake(projectOf(remote));
      assert.equal(store.getSnapshot().damaged.has(remote.id), true);
      const pulls = channel.pulls.length;

      sync.publishBrains(channel.project);
      await settle();
      assert.equal(channel.pulls.length, pulls);
      const repaired = projectBrain("Repaired");
      channel.project.write(remote.id, "Repaired", repaired.source.replace(repaired.id, remote.id));
      sync.publishBrains(channel.project);
      await settle();

      assert.equal(channel.pulls.length, pulls + 1);
      assert.equal(store.getSnapshot().damaged.size, 0);
      assert.equal(entryOf(store, remote.id).name, "Repaired");
    });
  });

  describe("creates", () => {
    it("creates a brain through the frame, resolving with its id once the store holds it", async () => {
      const store = syncedStore();
      const channel = await handshake(projectOf());

      const id = await store.addBrain("Chaser");

      assert.deepEqual(channel.creates, ["Chaser"]);
      assert.equal(entryOf(store, id).name, "Chaser");
      assert.equal(entryOf(store, id).source, channel.project.get(id)?.source);
      assert.equal(entryOf(store, id).compiledSourceHash, entryOf(store, id).sourceHash);
      assert.equal(store.getSnapshot().pending.size, 0);
      assert.deepEqual(channel.pushes, []);
    });

    it("holds a create pending and in flight until the frame answers, and pending until the store holds the brain", async () => {
      const store = syncedStore();
      const channel = await handshake(projectOf());
      channel.held = true;
      let resolved: string | undefined;

      void store.addBrain("Chaser").then((id) => {
        resolved = id;
      });
      assert.equal(store.getSnapshot().pending.size, 1);
      assert.equal(store.getSnapshot().pushesInFlight, 1);
      assert.deepEqual(store.getSnapshot().brains, new Map());
      channel.releaseAt(0);
      await settle();
      assert.equal(store.getSnapshot().pushesInFlight, 0);
      assert.equal(store.getSnapshot().pending.size, 1);
      assert.equal(resolved, undefined);
      channel.release();
      await settle();

      assert.ok(resolved !== undefined);
      assert.equal(entryOf(store, resolved).name, "Chaser");
      assert.equal(store.getSnapshot().pending.size, 0);
    });

    it("resolves a create once a publication brings its brain, whether before or after the pull answers", async () => {
      const store = syncedStore();
      const channel = await handshake(projectOf());
      channel.held = true;
      let resolved: string | undefined;

      void store.addBrain("Chaser").then((id) => {
        resolved = id;
      });
      channel.releaseAt(0);
      await settle();
      sync.publishBrains(channel.project);
      await settle();
      channel.releaseAt(1);
      await settle();
      assert.ok(resolved !== undefined);
      channel.release();
      await settle();

      assert.deepEqual([...store.getSnapshot().brains.keys()], [resolved]);
      assert.equal(store.getSnapshot().pending.size, 0);
    });

    it("sends a create asked while disconnected once the next handshake reconciles", async () => {
      const store = syncedStore();
      const created = store.addBrain("Offline");
      await settle();
      assert.equal(store.getSnapshot().pending.size, 1);

      const channel = await handshake(projectOf());
      const id = await created;

      assert.deepEqual(channel.creates, ["Offline"]);
      assert.equal(entryOf(store, id).name, "Offline");
    });

    it("rejects a create whose handshake ends before its answer with CLOSED, dropping its pend", async () => {
      const store = syncedStore();
      const channel = await handshake(projectOf());
      channel.held = true;

      const created = store.addBrain("Chaser");
      channel.close();

      await assert.rejects(created, (error: unknown) => {
        assert.ok(error instanceof MakeCodeBrainsError);
        assert.equal(error.code, MakeCodeBrainsErrorCode.CLOSED);
        return true;
      });
      assert.equal(store.getSnapshot().pending.size, 0);
      assert.equal(store.getSnapshot().pushesInFlight, 0);
    });

    it("retries a create the frame refuses at the retry delays, resolving once one lands", async () => {
      const store = syncedStore();
      const channel = await handshake(projectOf());
      channel.failingCreates = 2;

      const created = store.addBrain("Chaser");
      await settle();
      assert.equal(channel.creates.length, 1);
      await elapse(PUSH_RETRY_DELAYS_MS[0] ?? 0);
      assert.equal(channel.creates.length, 2);
      await elapse(PUSH_RETRY_DELAYS_MS[1] ?? 0);
      const id = await created;

      assert.equal(channel.creates.length, 3);
      assert.equal(entryOf(store, id).name, "Chaser");
      assert.equal(store.getSnapshot().pending.size, 0);
    });
  });

  describe("damaged sources", () => {
    /** Reconciles over a project holding `remote`, then damages its source to `damaged` and reconnects. */
    async function damagedAfterSync(
      store: BrainsStore,
      remote: { id: string; name: string; source: string },
      damaged: string,
      beforeReconnect?: () => void
    ): Promise<FakeChannel> {
      const first = await handshake(projectOf(remote));
      first.close();
      session.setStatus("disconnected");
      beforeReconnect?.();
      first.project.set(remote.id, { ...remote, source: damaged, compiledSourceHash: null });
      return handshake(first.project);
    }

    it("lists a brain whose source is not a brain document as damaged, keeping the held copy and never pushing it", async () => {
      const store = syncedStore();
      const remote = projectBrain("Remote");
      let held: BrainEntry | undefined;

      const second = await damagedAfterSync(store, remote, "not json {", () => {
        held = entryOf(store, remote.id);
      });

      assert.equal(store.getSnapshot().damaged.get(remote.id)?.code, BRAIN_SOURCE_INVALID);
      assert.equal(entryOf(store, remote.id), held);
      assert.deepEqual(second.pushes, []);
      assert.equal(second.project.get(remote.id)?.source, "not json {");
    });

    it("holds an edit to a damaged brain pending rather than pushing over the damaged source", async () => {
      const store = syncedStore();
      const remote = projectBrain("Remote");
      const second = await damagedAfterSync(store, remote, '{"version":1}');

      store.renameBrain(remote.id, "Renamed");
      await settle();

      assert.deepEqual([...store.getSnapshot().pending], [remote.id]);
      assert.deepEqual(second.pushes, []);
    });

    it("holds a pending removal of a brain whose source is damaged rather than deleting the damaged source", async () => {
      const store = syncedStore();
      const remote = projectBrain("Remote");

      const second = await damagedAfterSync(store, remote, "not json {", () => {
        store.removeBrain(remote.id);
      });

      assert.equal(store.getSnapshot().damaged.get(remote.id)?.code, BRAIN_SOURCE_INVALID);
      assert.deepEqual([...store.getSnapshot().pending], [remote.id]);
      assert.deepEqual(second.pushes, []);
    });

    it("re-pushes the held copy over a damaged source on request, clearing the damage and the pend on the answer", async () => {
      const store = syncedStore();
      const remote = projectBrain("Remote");
      const second = await damagedAfterSync(store, remote, "not json {", () => {
        store.renameBrain(remote.id, "Renamed");
      });
      assert.equal(store.getSnapshot().damaged.has(remote.id), true);

      store.repushBrain(remote.id);
      await settle();

      assert.equal(store.getSnapshot().damaged.size, 0);
      assert.equal(store.getSnapshot().pending.size, 0);
      assert.equal(second.project.get(remote.id)?.source, entryOf(store, remote.id).source);
    });

    it("lists a damaged brain it holds no copy of under the name the project gives it, offering no re-push", async () => {
      const store = syncedStore();
      const remote = { ...projectBrain("Remote"), source: "[]" };

      const channel = await handshake(projectOf(remote));
      store.repushBrain(remote.id);
      await settle();

      assert.deepEqual(store.getSnapshot().damaged.get(remote.id), { code: BRAIN_SOURCE_INVALID, name: "Remote" });
      assert.equal(store.getSnapshot().brains.has(remote.id), false);
      assert.deepEqual(channel.pushes, []);
    });

    it("lists a brain whose embedded id differs from its address as damaged by id mismatch", async () => {
      const store = syncedStore();
      const addressed = projectBrain("Addressed");
      const embedded = projectBrain("Embedded");

      const channel = await handshake(projectOf({ ...addressed, source: embedded.source }));

      assert.equal(store.getSnapshot().damaged.get(addressed.id)?.code, BRAIN_SOURCE_ID_MISMATCH);
      assert.equal(store.getSnapshot().brains.size, 0);
      assert.deepEqual(channel.pushes, []);
    });

    it("clears the damage once the project no longer holds the damaged source", async () => {
      const store = syncedStore();
      const remote = { ...projectBrain("Remote"), source: "not json {" };
      const first = await handshake(projectOf(remote));
      assert.equal(store.getSnapshot().damaged.has(remote.id), true);
      first.close();
      session.setStatus("disconnected");
      first.project.delete(remote.id);

      await handshake(first.project);

      assert.equal(store.getSnapshot().damaged.size, 0);
      assert.equal(store.getSnapshot().brains.size, 0);
    });

    it("clears the damage once the project's source is repaired", async () => {
      const store = syncedStore();
      const remote = projectBrain("Remote");
      const first = await handshake(projectOf({ ...remote, source: "not json {" }));
      assert.equal(store.getSnapshot().damaged.has(remote.id), true);
      first.close();
      session.setStatus("disconnected");
      first.project.write(remote.id, remote.name, remote.source);

      await handshake(first.project);

      assert.equal(store.getSnapshot().damaged.size, 0);
      assert.equal(entryOf(store, remote.id).source, remote.source);
    });
  });

  describe("reconciled", () => {
    it("reports reconciled once a connected handshake has reconciled, and not while its requests are in flight", async () => {
      const store = syncedStore();
      assert.equal(store.getSnapshot().reconciled, false);
      session.setStatus("connected");

      const channel = sync.open(projectOf(projectBrain("Remote")), true);
      await settle();
      assert.equal(store.getSnapshot().reconciled, false);
      channel.release();
      await settle();

      assert.equal(store.getSnapshot().reconciled, true);
    });

    it("stops reporting reconciled when the session disconnects, until the next handshake reconciles", async () => {
      const store = syncedStore();
      const first = await handshake(projectOf());
      assert.equal(store.getSnapshot().reconciled, true);

      first.close();
      session.setStatus("disconnected");
      assert.equal(store.getSnapshot().reconciled, false);
      await handshake(first.project);

      assert.equal(store.getSnapshot().reconciled, true);
    });

    it("pushes nothing for a re-push asked while disconnected, keeping the damage", async () => {
      const store = syncedStore();
      const remote = projectBrain("Remote");
      const first = await handshake(projectOf(remote));
      first.close();
      session.setStatus("disconnected");
      first.project.set(remote.id, { ...remote, source: "not json {", compiledSourceHash: null });
      const second = await handshake(first.project);
      assert.equal(store.getSnapshot().damaged.has(remote.id), true);
      second.close();
      session.setStatus("disconnected");

      store.repushBrain(remote.id);
      await settle();

      assert.deepEqual(second.pushes, []);
      assert.equal(store.getSnapshot().damaged.has(remote.id), true);
      assert.equal(store.getSnapshot().pending.size, 0);
    });
  });

  describe("catalog pending", () => {
    /** A catalog declaring no packs. */
    const EMPTY_CATALOG = '{"packs":[]}';

    it("reports the catalog pending while no catalog is held, before any connection and while a handshake reconciles", async () => {
      const store = syncedStore();
      assert.equal(store.getSnapshot().catalogPending, true);
      session.setStatus("connected");

      const channel = sync.open(projectOf(projectBrain("Remote")), true);
      await settle();
      assert.equal(store.getSnapshot().reconciled, false);
      assert.equal(store.getSnapshot().catalogPending, true);
      channel.release();
      await settle();

      assert.equal(store.getSnapshot().reconciled, true);
      assert.equal(store.getSnapshot().catalogPending, true);
    });

    it("keeps reporting the catalog pending through a disconnection and the next handshake while no catalog is held", async () => {
      const store = syncedStore();
      const first = await handshake(projectOf());
      assert.equal(store.getSnapshot().catalogPending, true);

      first.close();
      session.setStatus("disconnected");
      assert.equal(store.getSnapshot().reconciled, false);
      assert.equal(store.getSnapshot().catalogPending, true);
      await handshake(first.project);

      assert.equal(store.getSnapshot().catalogPending, true);
    });

    it("does not report the catalog pending while reconciled with a catalog held before the handshake", async () => {
      session.setCatalog(EMPTY_CATALOG);
      const store = syncedStore();
      await handshake(projectOf());

      assert.equal(store.getSnapshot().reconciled, true);
      assert.equal(store.getSnapshot().catalogPending, false);
    });

    it("stops reporting the catalog pending once a catalog arrives", async () => {
      const store = syncedStore();
      await handshake(projectOf());
      assert.equal(store.getSnapshot().catalogPending, true);

      session.setCatalog(EMPTY_CATALOG);

      assert.equal(store.getSnapshot().reconciled, true);
      assert.equal(store.getSnapshot().catalogPending, false);
    });
  });

  describe("two brains", () => {
    it("flushes two pends independently: a failed write stays pending while the other clears", async () => {
      const store = syncedStore();
      const first = await handshake(projectOf());
      first.close();
      session.setStatus("disconnected");
      const failing = seedBrain(store, "Failing");
      const passing = seedBrain(store, "Passing");

      session.setStatus("connected");
      const second = sync.open(first.project, true);
      second.failingWrites.add(failing);
      second.release();
      await settle();

      assert.deepEqual([...store.getSnapshot().pending], [failing]);
      assert.equal(second.project.has(passing), true);
    });
  });

  describe("identical applies", () => {
    it("records no edit for an apply of the source the store holds: no push, no pend, no new snapshot", async () => {
      const store = syncedStore();
      const channel = await handshake(projectOf());
      const id = seedBrain(store, "Chaser");
      const edited = store.getBrain(id);
      assert.ok(edited);
      authorCompilingRule(store.getSnapshot().environment, edited);
      store.applyBrain(edited);
      await settle();
      const pushes = channel.pushes.length;
      const snapshot = store.getSnapshot();

      store.applyBrain(edited);
      const reread = store.getBrain(id);
      assert.ok(reread);
      store.applyBrain(reread);
      await settle();

      assert.equal(channel.pushes.length, pushes);
      assert.equal(store.getSnapshot(), snapshot);
    });

    it("records no pend for an identical apply made while disconnected, and the next handshake pushes nothing", async () => {
      const store = syncedStore();
      const first = await handshake(projectOf());
      const id = await seeded(store, "Chaser");
      first.close();
      session.setStatus("disconnected");

      const reread = store.getBrain(id);
      assert.ok(reread);
      store.applyBrain(reread);
      assert.equal(store.getSnapshot().pending.size, 0);
      const second = await handshake(first.project);

      assert.deepEqual(second.pushes, []);
    });

    it("keeps a failing brain's diagnostics and compiled source hash through an identical apply, pushing nothing", async () => {
      const store = syncedStore();
      const channel = await handshake(projectOf());
      const id = seedBrain(store, "Chaser");
      const broken = store.getBrain(id);
      assert.ok(broken);
      authorMisplacedTile(store.getSnapshot().environment, broken);
      store.applyBrain(broken);
      await settle();
      const failing = entryOf(store, id);
      assert.ok(failing.diagnostics.some((diagnostic) => diagnostic.severity === "error"));
      const pushes = channel.pushes.length;

      store.applyBrain(broken);
      await settle();

      assert.equal(entryOf(store, id), failing);
      assert.equal(channel.pushes.length, pushes);
      assert.equal(store.getSnapshot().pending.size, 0);
    });

    it("records no pend for an identical apply of a damaged brain, so a repaired project copy is adopted", async () => {
      const store = syncedStore();
      const remote = projectBrain("Remote");
      const first = await handshake(projectOf(remote));
      first.close();
      session.setStatus("disconnected");
      first.project.set(remote.id, { ...remote, source: "not json {", compiledSourceHash: null });
      const second = await handshake(first.project);
      assert.equal(store.getSnapshot().damaged.has(remote.id), true);

      const reread = store.getBrain(remote.id);
      assert.ok(reread);
      store.applyBrain(reread);
      assert.equal(store.getSnapshot().pending.size, 0);
      second.close();
      session.setStatus("disconnected");
      const repairedSource = renamedSource(store, remote.id, "Repaired");
      second.project.write(remote.id, "Repaired", repairedSource);
      const third = await handshake(second.project);

      assert.equal(entryOf(store, remote.id).source, repairedSource);
      assert.equal(store.getSnapshot().damaged.size, 0);
      assert.deepEqual(third.pushes, []);
    });

    it("pushes the next edit after an identical apply as usual", async () => {
      const store = syncedStore();
      const channel = await handshake(projectOf());
      const id = await seeded(store, "Chaser");
      const reread = store.getBrain(id);
      assert.ok(reread);
      store.applyBrain(reread);

      store.renameBrain(id, "Runner");
      await settle();

      assert.equal(channel.pushes.length, 2);
      assert.equal(channel.project.get(id)?.name, "Runner");
    });
  });

  describe("answer order", () => {
    it("keeps the pend of a newer edit whose push failed when an older push of the brain is answered after it", async () => {
      const store = syncedStore();
      const first = await handshake(projectOf());
      const id = await seeded(store, "Chaser");
      first.held = true;
      store.renameBrain(id, "Older");
      store.renameBrain(id, "Newer");

      first.failingWrites.add(id);
      first.releaseAt(1);
      await settle();
      first.failingWrites.delete(id);
      first.releaseAt(0);
      await settle();

      assert.equal(first.project.get(id)?.name, "Older");
      assert.deepEqual([...store.getSnapshot().pending], [id]);
      first.close();
      session.setStatus("disconnected");
      const second = await handshake(first.project);

      assert.equal(entryOf(store, id).name, "Newer");
      assert.equal(second.project.get(id)?.name, "Newer");
      assert.equal(store.getSnapshot().pending.size, 0);
    });

    it("keeps the pend when an older push carrying the same source as the failed newest edit is answered after it", async () => {
      const store = syncedStore();
      const channel = await handshake(projectOf());
      const id = await seeded(store, "Chaser");
      channel.held = true;
      store.renameBrain(id, "Runner");
      store.renameBrain(id, "Hider");
      store.renameBrain(id, "Runner");

      channel.releaseAt(1);
      channel.failingWrites.add(id);
      channel.releaseAt(1);
      await settle();
      channel.failingWrites.delete(id);
      channel.releaseAt(0);
      await settle();

      assert.deepEqual([...store.getSnapshot().pending], [id]);
    });
  });

  describe("push retries", () => {
    /** A store, reconciled over a handshake, holding one brain whose pushes `channel` fails until told otherwise. */
    async function failingBrain(): Promise<{ store: BrainsStore; channel: FakeChannel; id: string }> {
      const store = syncedStore();
      const channel = await handshake(projectOf());
      const id = await seeded(store, "Chaser");
      channel.failingWrites.add(id);
      store.renameBrain(id, "Runner");
      await settle();
      assert.deepEqual([...store.getSnapshot().pending], [id]);
      return { store, channel, id };
    }

    it("retries a failed push after the first backoff delay, clearing the pend once the retry lands", async () => {
      const { store, channel, id } = await failingBrain();
      const pushes = channel.pushes.length;
      channel.failingWrites.delete(id);

      await elapse((PUSH_RETRY_DELAYS_MS[0] ?? 0) - 1);
      assert.equal(channel.pushes.length, pushes);
      await elapse(1);

      assert.equal(channel.pushes.length, pushes + 1);
      assert.equal(channel.project.get(id)?.name, "Runner");
      assert.equal(store.getSnapshot().pending.size, 0);
    });

    it("backs off through every retry delay, then keeps retrying at the last delay until a retry lands", async () => {
      const { store, channel, id } = await failingBrain();
      const pushes = channel.pushes.length;
      const lastDelay = PUSH_RETRY_DELAYS_MS[PUSH_RETRY_DELAYS_MS.length - 1] ?? 0;

      for (const [attempt, delay] of PUSH_RETRY_DELAYS_MS.entries()) {
        await elapse(delay - 1);
        assert.equal(channel.pushes.length, pushes + attempt);
        await elapse(1);
        assert.equal(channel.pushes.length, pushes + attempt + 1);
      }
      for (let round = 1; round <= 3; round++) {
        await elapse(lastDelay - 1);
        assert.equal(channel.pushes.length, pushes + PUSH_RETRY_DELAYS_MS.length + round - 1);
        await elapse(1);
        assert.equal(channel.pushes.length, pushes + PUSH_RETRY_DELAYS_MS.length + round);
      }
      assert.deepEqual([...store.getSnapshot().pending], [id]);
      channel.failingWrites.delete(id);
      await elapse(lastDelay);

      assert.equal(channel.project.get(id)?.name, "Runner");
      assert.equal(store.getSnapshot().pending.size, 0);
      const settled = channel.pushes.length;
      await elapse(60_000);
      assert.equal(channel.pushes.length, settled);
    });

    it("stops the retries at the last delay once disconnected, leaving the pend to the next handshake", async () => {
      const { store, channel, id } = await failingBrain();
      for (const delay of PUSH_RETRY_DELAYS_MS) await elapse(delay);
      const pushes = channel.pushes.length;
      channel.close();
      session.setStatus("disconnected");

      await elapse(60_000);
      assert.equal(channel.pushes.length, pushes);
      const second = await handshake(channel.project);

      assert.equal(second.project.get(id)?.name, "Runner");
      assert.equal(store.getSnapshot().pending.size, 0);
    });

    it("keeps a push the project leaves unanswered in flight and pending, pushing it again never, however long it waits", async () => {
      const store = syncedStore();
      const channel = await handshake(projectOf());
      const id = await seeded(store, "Chaser");
      channel.unansweredWrites.add(id);
      store.renameBrain(id, "Runner");
      await settle();
      const pushes = channel.pushes.length;

      await waitLong();

      assert.equal(channel.pushes.length, pushes);
      assert.equal(store.getSnapshot().pushesInFlight, 1);
      assert.deepEqual([...store.getSnapshot().pending], [id]);
      assert.equal(channel.project.get(id)?.name, "Chaser");
    });

    it("clears the pend of a push the project answers late, however late, and schedules nothing after it", async () => {
      const store = syncedStore();
      const channel = await handshake(projectOf());
      const id = await seeded(store, "Chaser");
      channel.held = true;
      store.renameBrain(id, "Runner");
      await waitLong();
      assert.equal(store.getSnapshot().pushesInFlight, 1);
      assert.deepEqual([...store.getSnapshot().pending], [id]);
      const pushes = channel.pushes.length;

      channel.release();
      await settle();
      assert.equal(store.getSnapshot().pending.size, 0);
      assert.equal(store.getSnapshot().pushesInFlight, 0);
      await waitLong();

      assert.equal(channel.pushes.length, pushes);
      assert.equal(channel.project.get(id)?.name, "Runner");
      assert.equal(store.getSnapshot().pending.size, 0);
    });

    it("retries only the latest edit: a newer apply's push supersedes the scheduled retry", async () => {
      const { store, channel, id } = await failingBrain();
      channel.failingWrites.delete(id);
      store.renameBrain(id, "Hider");
      await settle();
      const pushes = channel.pushes.length;

      await elapse(60_000);

      assert.equal(channel.pushes.length, pushes);
      assert.equal(channel.project.get(id)?.name, "Hider");
      assert.equal(store.getSnapshot().pending.size, 0);
    });

    it("stops retrying while disconnected, leaving the pend to the next handshake", async () => {
      const { store, channel, id } = await failingBrain();
      const pushes = channel.pushes.length;
      channel.close();
      session.setStatus("disconnected");

      await elapse(60_000);
      assert.equal(channel.pushes.length, pushes);
      const second = await handshake(channel.project);
      await elapse(60_000);

      assert.deepEqual(writtenIds(second), [id]);
      assert.equal(second.project.get(id)?.name, "Runner");
      assert.equal(store.getSnapshot().pending.size, 0);
    });

    it("never retries a failed re-push of a damaged brain", async () => {
      const store = syncedStore();
      const remote = projectBrain("Remote");
      const first = await handshake(projectOf(remote));
      first.close();
      session.setStatus("disconnected");
      first.project.set(remote.id, { ...remote, source: "not json {", compiledSourceHash: null });
      const second = await handshake(first.project);
      second.failingWrites.add(remote.id);

      store.repushBrain(remote.id);
      await settle();
      second.failingWrites.delete(remote.id);
      await elapse(60_000);

      assert.equal(second.pushes.length, 1);
      assert.equal(store.getSnapshot().damaged.has(remote.id), true);
    });
  });

  describe("pushes in flight", () => {
    it("records a push pending from its departure, counting it in flight, until the project answers it", async () => {
      const store = syncedStore();
      const channel = await handshake(projectOf());
      channel.held = true;

      const id = seedBrain(store, "Chaser");
      assert.deepEqual([...store.getSnapshot().pending], [id]);
      assert.equal(store.getSnapshot().pushesInFlight, 1);
      channel.release();
      await settle();

      assert.equal(store.getSnapshot().pending.size, 0);
      assert.equal(store.getSnapshot().pushesInFlight, 0);
    });

    it("keeps a push the project never answers pending while the handshake stays open", async () => {
      const store = syncedStore();
      const channel = await handshake(projectOf());
      const id = await seeded(store, "Chaser");
      channel.unansweredWrites.add(id);

      store.renameBrain(id, "Runner");
      await settle();

      assert.deepEqual([...store.getSnapshot().pending], [id]);
      assert.equal(store.getSnapshot().pushesInFlight, 1);
      assert.equal(channel.project.get(id)?.name, "Chaser");
    });

    it("counts each unanswered push of a brain in flight, and keeps the pend until the newest is answered", async () => {
      const store = syncedStore();
      const channel = await handshake(projectOf());
      const id = await seeded(store, "Chaser");
      channel.held = true;
      store.renameBrain(id, "Older");
      store.renameBrain(id, "Newer");
      assert.equal(store.getSnapshot().pushesInFlight, 2);

      channel.releaseAt(0);
      await settle();
      assert.equal(store.getSnapshot().pushesInFlight, 1);
      assert.deepEqual([...store.getSnapshot().pending], [id]);
      channel.releaseAt(0);
      await settle();

      assert.equal(store.getSnapshot().pushesInFlight, 0);
      assert.equal(store.getSnapshot().pending.size, 0);
    });

    it("stops counting an unanswered push in flight when its handshake ends, retrying nothing on it, and the next handshake's flush lands it", async () => {
      const store = syncedStore();
      const channel = await handshake(projectOf());
      const id = await seeded(store, "Chaser");
      channel.unansweredWrites.add(id);
      store.renameBrain(id, "Runner");
      await settle();
      assert.equal(store.getSnapshot().pushesInFlight, 1);
      const pushes = channel.pushes.length;

      channel.close();
      session.setStatus("disconnected");
      await settle();
      assert.equal(store.getSnapshot().pushesInFlight, 0);
      assert.deepEqual([...store.getSnapshot().pending], [id]);
      await waitLong();
      assert.equal(channel.pushes.length, pushes);
      const second = await handshake(channel.project);

      assert.deepEqual(writtenIds(second), [id]);
      assert.equal(second.project.get(id)?.name, "Runner");
      assert.equal(store.getSnapshot().pushesInFlight, 0);
      assert.equal(store.getSnapshot().pending.size, 0);
    });
  });

  describe("pack vocabulary", () => {
    /** A catalog whose one pack declares the ring tile, with a private count slot. */
    const CHIME_CATALOG = JSON.stringify({
      packs: [
        {
          name: "chime",
          tiles: [
            {
              name: "actuator.chime.ring",
              kind: "actuator",
              args: [{ tileId: "times", type: "number", optional: true }],
            },
          ],
        },
      ],
    });

    /** {@link CHIME_CATALOG} with a second tile, as a pack update ships it. */
    const GROWN_CATALOG = JSON.stringify({
      packs: [
        {
          name: "chime",
          tiles: [
            {
              name: "actuator.chime.ring",
              kind: "actuator",
              args: [{ tileId: "times", type: "number", optional: true }],
            },
            { name: "actuator.chime.hush", kind: "actuator" },
          ],
        },
      ],
    });

    /** The allocation the frame makes of {@link CHIME_CATALOG} for a project holding no manifest. */
    const CHIME_IDS: MakeCodeIdManifest = {
      actions: [{ name: "actuator.chime.ring", id: 1024 }],
      operators: [],
      types: [],
      next: { action: 1025, operator: 1024, atom: 1024 },
    };

    /** {@link GROWN_CATALOG}'s allocation, grown from {@link CHIME_IDS}. */
    const GROWN_IDS: MakeCodeIdManifest = {
      actions: [
        { name: "actuator.chime.ring", id: 1024 },
        { name: "actuator.chime.hush", id: 1025 },
      ],
      operators: [],
      types: [],
      next: { action: 1026, operator: 1024, atom: 1024 },
    };

    const RING_TILE = mkActuatorTileId("actuator.chime.ring");

    /** The host-action id `store`'s environment registers the action `key` under, or `undefined`. */
    function actionId(store: BrainsStore, key: string): number | undefined {
      const action = store.getSnapshot().environment.brainServices.runtime.actions.getByKey(key);
      return action?.binding === "host" ? action.id : undefined;
    }

    /**
     * Connects and opens a handshake over `project`, the frame publishing
     * `reading` as its first manifest, resolving once it has reconciled.
     */
    async function handshakeWith(reading: MakeCodeManifestReading, project = projectOf()): Promise<FakeChannel> {
      session.setStatus("connected");
      const channel = sync.open(project, false, reading);
      await settle();
      return channel;
    }

    /** The program posting `catalog` mid-session: the session delivers it, then the frame publishes `reading`. */
    async function catalogArrives(catalog: string, reading: MakeCodeManifestReading): Promise<void> {
      session.setCatalog(catalog);
      sync.publish(reading);
      await settle();
    }

    /** A project brain whose rule places the ring tile, authored in an environment binding {@link CHIME_CATALOG}. */
    function ringingBrain() {
      const { environment } = buildAuthoringEnvironment(CHIME_CATALOG, CHIME_IDS);
      const definition = BrainDef.emptyBrainDef(environment.brainServices, "Ringer");
      for (const catalog of environment.tileCatalogs()) {
        const ring = catalog.get(RING_TILE);
        if (ring) firstRule(definition).do().appendTile(ring);
      }
      return { id: definition.id(), name: "Ringer", source: serializeBrainSource(definition) };
    }

    /** A project whose frame binds {@link CHIME_CATALOG} under {@link CHIME_IDS}, holding `brains` compiled in it. */
    function chimeProjectOf(...brains: { id: string; name: string; source: string }[]): FrameProject {
      const project = new FrameProject();
      project.engine.adoptCatalog(CHIME_CATALOG, { manifest: structuredClone(CHIME_IDS) });
      for (const brain of brains) project.write(brain.id, brain.name, brain.source);
      return project;
    }

    it("leaves the packs unbound until the frame publishes a manifest", () => {
      session.setCatalog(CHIME_CATALOG);
      const store = syncedStore();

      assert.deepEqual(store.getSnapshot().catalogDiagnostics, [{ code: CATALOG_PACK_UNBOUND, pack: "chime" }]);
      assert.equal(actionId(store, "actuator.chime.ring"), undefined);
    });

    it("binds the catalog's vocabulary under the ids the published manifest holds, as they are", async () => {
      session.setCatalog(CHIME_CATALOG);
      const store = syncedStore();
      const held: MakeCodeIdManifest = {
        ...CHIME_IDS,
        actions: [{ name: "actuator.chime.ring", id: 1100 }],
        next: { ...CHIME_IDS.next, action: 1101 },
      };

      const channel = await handshakeWith({ manifest: held });

      assert.deepEqual(store.getSnapshot().catalogDiagnostics, []);
      assert.equal(actionId(store, "actuator.chime.ring"), 1100);
      assert.deepEqual(channel.pushes, []);
    });

    it("leaves the packs unbound under a manifest of a newer format, reporting its code", async () => {
      session.setCatalog(CHIME_CATALOG);
      const store = syncedStore();

      await handshakeWith({ manifest: null, problem: MakeCodeManifestProblemCode.FORMAT_NEWER });

      assert.equal(store.getSnapshot().reconciled, true);
      assert.deepEqual(store.getSnapshot().catalogDiagnostics, [
        { code: CATALOG_PACK_UNBOUND, pack: "chime" },
        { code: MakeCodeManifestProblemCode.FORMAT_NEWER },
      ]);
    });

    it("holds a catalog arriving mid-session without rebuilding, and rebuilds once on the manifest that follows it", async () => {
      session.setCatalog(CHIME_CATALOG);
      const store = syncedStore();
      await handshakeWith({ manifest: CHIME_IDS });
      const before = store.getSnapshot().environment;
      const rebuilt: WendooEnvironment[] = [];
      store.subscribe(() => {
        const { environment } = store.getSnapshot();
        if (environment !== before && !rebuilt.includes(environment)) rebuilt.push(environment);
      });

      session.setCatalog(GROWN_CATALOG);
      await settle();
      assert.equal(store.getSnapshot().environment, before);
      assert.equal(actionId(store, "actuator.chime.hush"), undefined);
      sync.publish({ manifest: GROWN_IDS });
      await settle();

      assert.equal(rebuilt.length, 1);
      assert.equal(actionId(store, "actuator.chime.hush"), 1025);
      assert.equal(actionId(store, "actuator.chime.ring"), 1024);
    });

    it("keeps its environment when the frame publishes the allocation it holds after the catalog it was built from", async () => {
      session.setCatalog(CHIME_CATALOG);
      const store = syncedStore();
      await handshakeWith({ manifest: CHIME_IDS });
      const before = store.getSnapshot();

      sync.publish({ manifest: CHIME_IDS });
      await settle();

      assert.equal(store.getSnapshot(), before);
    });

    it("recompiles the held brains for their diagnostics when the environment rebuilds, pushing nothing", async () => {
      const store = syncedStore();
      const ringer = ringingBrain();
      const quiet = projectBrain("Quiet", authorCompilingRule);
      const channel = await handshakeWith({ manifest: null }, projectOf(ringer, quiet));
      const unbound = entryOf(store, ringer.id);
      assert.ok(unbound.diagnostics.length > 0, "the ring tile is missing while its pack is unbound");
      assert.equal(unbound.compiledSourceHash, null);
      const quietBefore = entryOf(store, quiet.id);

      await catalogArrives(CHIME_CATALOG, { manifest: CHIME_IDS });

      const resolved = entryOf(store, ringer.id);
      assert.deepEqual(resolved.diagnostics, []);
      assert.deepEqual(resolved.unresolvedTiles, []);
      assert.equal(resolved.compiledSourceHash, null);
      assert.equal(entryOf(store, quiet.id), quietBefore);
      assert.deepEqual(channel.pushes, []);
      assert.equal(store.getSnapshot().pending.size, 0);
    });

    describe("unresolved tiles", () => {
      const unboundCases: { what: string; catalog: string | undefined; reading?: MakeCodeManifestReading }[] = [
        { what: "no catalog", catalog: undefined },
        { what: "an unreadable catalog", catalog: "not a catalog" },
        { what: "a catalog without its pack", catalog: '{"packs":[]}' },
        {
          what: "a manifest of a newer format",
          catalog: CHIME_CATALOG,
          reading: { manifest: null, problem: MakeCodeManifestProblemCode.FORMAT_NEWER },
        },
      ];
      for (const { what, catalog, reading } of unboundCases) {
        it(`holds a pack-tile brain pulled under ${what} with the project's compiled source hash, recording its unresolved tile and pushing nothing`, async () => {
          session.setCatalog(catalog);
          const store = syncedStore();
          const ringer = ringingBrain();

          const channel = await handshakeWith(reading ?? { manifest: CHIME_IDS }, chimeProjectOf(ringer));

          const entry = entryOf(store, ringer.id);
          assert.equal(entry.compiledSourceHash, brainSourceHash(ringer.source));
          assert.deepEqual(entry.unresolvedTiles, [{ tileId: RING_TILE, code: BRAIN_TILE_UNRESOLVED }]);
          assert.ok(entry.diagnostics.length > 0);
          assert.deepEqual(channel.pushes, []);
          assert.equal(store.getSnapshot().pending.size, 0);
        });
      }

      it("resolves a pulled pack-tile brain once the catalog arrives, pushing nothing", async () => {
        const store = syncedStore();
        const ringer = ringingBrain();
        const channel = await handshakeWith({ manifest: CHIME_IDS }, chimeProjectOf(ringer));

        await catalogArrives(CHIME_CATALOG, { manifest: CHIME_IDS });

        const entry = entryOf(store, ringer.id);
        assert.equal(entry.compiledSourceHash, brainSourceHash(ringer.source));
        assert.deepEqual(entry.unresolvedTiles, []);
        assert.deepEqual(entry.diagnostics, []);
        assert.deepEqual(channel.pushes, []);
      });

      it("pushes an edit made while its tiles are unresolved, showing the frame's outcome for it", async () => {
        const store = syncedStore();
        const ringer = ringingBrain();
        const channel = await handshakeWith({ manifest: CHIME_IDS }, chimeProjectOf(ringer));

        store.renameBrain(ringer.id, "Bell");
        await settle();

        const edited = entryOf(store, ringer.id);
        assert.deepEqual(lastPush(channel), {
          op: "write",
          brain: { id: ringer.id, name: "Bell", source: edited.source },
        });
        assert.equal(edited.compiledSourceHash, edited.sourceHash);
        assert.deepEqual(edited.unresolvedTiles, []);
        assert.equal(store.getSnapshot().pending.size, 0);
      });

      it("keeps a held pack-tile brain's compiled source hash when a catalog without its pack arrives, pushing nothing", async () => {
        session.setCatalog(CHIME_CATALOG);
        const store = syncedStore();
        const ringer = ringingBrain();
        const channel = await handshakeWith({ manifest: CHIME_IDS }, chimeProjectOf(ringer));
        assert.deepEqual(entryOf(store, ringer.id).unresolvedTiles, []);

        await catalogArrives('{"packs":[]}', { manifest: CHIME_IDS });

        const entry = entryOf(store, ringer.id);
        assert.equal(entry.compiledSourceHash, brainSourceHash(ringer.source));
        assert.deepEqual(entry.unresolvedTiles, [{ tileId: RING_TILE, code: BRAIN_TILE_UNRESOLVED }]);
        assert.deepEqual(channel.pushes, []);
        assert.equal(store.getSnapshot().pending.size, 0);
      });
    });
  });

  describe("reconciliation re-runs", () => {
    it("re-runs a reconciliation whose pull failed while the session stays connected, then pushes edits as made", async () => {
      const store = syncedStore();
      const remote = projectBrain("Remote");
      const project = projectOf(remote);
      session.setStatus("connected");
      const opened = sync.open(project, false, { manifest: null }, false);
      opened.failingPulls = 1;
      sync.publishBrains(project);
      await settle();
      assert.equal(store.getSnapshot().reconciled, false);
      const id = seedBrain(store, "Local");
      assert.deepEqual([...store.getSnapshot().pending], [id]);

      await elapse(PUSH_RETRY_DELAYS_MS[0] ?? 0);

      assert.equal(store.getSnapshot().reconciled, true);
      assert.equal(entryOf(store, remote.id).source, remote.source);
      assert.equal(opened.project.has(id), true);
      assert.equal(store.getSnapshot().pending.size, 0);
      store.renameBrain(id, "Renamed");
      await settle();
      assert.equal(opened.project.get(id)?.name, "Renamed");
    });

    it("re-runs through every delay, then keeps re-running at the last delay until a pull succeeds", async () => {
      const store = syncedStore();
      session.setStatus("connected");
      const extraRounds = 3;
      const project = projectOf(projectBrain("Remote"));
      const channel = sync.open(project, false, { manifest: null }, false);
      channel.failingPulls = PUSH_RETRY_DELAYS_MS.length + extraRounds;
      sync.publishBrains(project);
      await settle();
      const pulls = () => channel.pulls.length;
      const lastDelay = PUSH_RETRY_DELAYS_MS[PUSH_RETRY_DELAYS_MS.length - 1] ?? 0;
      assert.equal(pulls(), 1);

      for (const [attempt, delay] of PUSH_RETRY_DELAYS_MS.entries()) {
        await elapse(delay - 1);
        assert.equal(pulls(), attempt + 1);
        await elapse(1);
        assert.equal(pulls(), attempt + 2);
      }
      for (let round = 1; round <= extraRounds; round++) {
        assert.equal(store.getSnapshot().reconciled, false);
        await elapse(lastDelay);
        assert.equal(pulls(), PUSH_RETRY_DELAYS_MS.length + 1 + round);
      }

      assert.equal(store.getSnapshot().reconciled, true);
      await elapse(60_000);
      assert.equal(pulls(), PUSH_RETRY_DELAYS_MS.length + 1 + extraRounds);
    });

    it("drops the scheduled re-run when a new handshake reconciles first", async () => {
      const store = syncedStore();
      session.setStatus("connected");
      const project = projectOf(projectBrain("Remote"));
      const first = sync.open(project, false, { manifest: null }, false);
      first.failingPulls = 1;
      sync.publishBrains(project);
      await settle();

      const second = sync.open(project);
      await settle();
      assert.equal(store.getSnapshot().reconciled, true);
      await elapse(60_000);

      assert.equal(first.pulls.length, 1);
      assert.equal(second.pulls.length, 1);
      assert.equal(store.getSnapshot().reconciled, true);
    });

    it("stops re-running once the session disconnects, leaving the next handshake to reconcile", async () => {
      const store = syncedStore();
      session.setStatus("connected");
      const project = projectOf(projectBrain("Remote"));
      const first = sync.open(project, false, { manifest: null }, false);
      first.failingPulls = 1;
      sync.publishBrains(project);
      await settle();
      first.close();
      session.setStatus("disconnected");

      await elapse(60_000);
      assert.equal(first.pulls.length, 1);
      await handshake(project);

      assert.equal(store.getSnapshot().reconciled, true);
    });
  });
});

/** The source of `brain` with its document edited by `edit`, as an out-of-band editor would save it. */
function sourceWith(
  brain: { source: string },
  edit: (environment: WendooEnvironment, definition: BrainDef) => void
): string {
  const { environment } = buildAuthoringEnvironment(undefined);
  const definition = readBrainSource(environment, brain.source);
  edit(environment, definition);
  return serializeBrainSource(definition);
}

/** The source of the brain `id` held by `store`, renamed to `name`. */
function renamedSource(store: BrainsStore, id: string, name: string): string {
  const definition = store.getBrain(id);
  assert.ok(definition);
  definition.setName(name);
  return serializeBrainSource(definition);
}
