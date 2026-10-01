import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it, mock } from "node:test";
import type { WendooEnvironment } from "@wendoo/core/app";
import { BrainDef, CoreHostActions, LogLevel, logger, mkActuatorTileId, mkSensorTileId } from "@wendoo/core/app";
import type { BrainPageDef, BrainRuleDef } from "@wendoo/core/brain/model";
import type { MakeCodeBrain, MakeCodeBrainPush, MakeCodeBrainSummary } from "@wendoo/makecode-session";
import { brainSourceHash, MakeCodeBrainsError, MakeCodeBrainsErrorCode } from "@wendoo/makecode-session";
import { buildAuthoringEnvironment } from "./authoring-environment.js";
import {
  BRAIN_SOURCE_ID_MISMATCH,
  BRAIN_SOURCE_INVALID,
  compileBrainSource,
  readBrainSource,
  serializeBrainSource,
} from "./brain-source.js";
import type { BrainEntry, BrainsSessionState } from "./brains-store.js";
import { BrainsStore, PUSH_RETRY_DELAYS_MS } from "./brains-store.js";
import type { EditorBrainsChannel } from "./editor-session-store.js";

/** The session readings a brains store follows, driven by the spec. */
class FakeSessionSource {
  state: BrainsSessionState = { status: "none", catalogText: undefined };
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
}

/** One request a {@link FakeChannel} holds unanswered. */
type HeldRequest = () => void;

/**
 * One handshake's brains channel over an in-memory project. It answers every
 * request from its project in a later microtask, or, while held, queues the
 * answers until released. Closing it rejects every unanswered request and
 * every later one with `CLOSED`.
 */
class FakeChannel implements EditorBrainsChannel {
  readonly binding: string | undefined;
  readonly project: Map<string, MakeCodeBrain>;
  /** Every push received, in order. */
  readonly pushes: MakeCodeBrainPush[] = [];
  /** Every pull received, as the ids it named. */
  readonly pulls: string[][] = [];
  /** When set, pushes naming these ids are answered with `WRITE_FAILED`. */
  readonly failingWrites = new Set<string>();
  /**
   * Whether the list reports each brain's compiled source hash: the hash its
   * compiled form carries, or `null` when it has none. When `false`, the list
   * carries no such field, as a peer predating it answers.
   */
  reportsCompiled = true;
  held = false;
  private readonly _queue: HeldRequest[] = [];
  private readonly _rejects = new Set<(error: MakeCodeBrainsError) => void>();
  private _closed = false;

  constructor(binding: string | undefined, project: Map<string, MakeCodeBrain>) {
    this.binding = binding;
    this.project = project;
  }

  listBrains(): Promise<MakeCodeBrainSummary[]> {
    return this.answer(() =>
      [...this.project.values()].map((brain) => {
        const summary: MakeCodeBrainSummary = {
          id: brain.id,
          name: brain.name,
          sourceHash: brainSourceHash(brain.source),
        };
        if (this.reportsCompiled) summary.compiledSourceHash = brain.compiled?.sourceHash ?? null;
        return summary;
      })
    );
  }

  pullBrains(ids: readonly string[]): Promise<MakeCodeBrain[]> {
    this.pulls.push([...ids]);
    return this.answer(() => ids.flatMap((id) => this.project.get(id) ?? []));
  }

  pushBrain(push: MakeCodeBrainPush): Promise<void> {
    this.pushes.push(push);
    return this.answer(() => {
      const id = push.op === "write" ? push.brain.id : push.brainId;
      if (this.failingWrites.has(id)) {
        throw new MakeCodeBrainsError(MakeCodeBrainsErrorCode.WRITE_FAILED, "unwritable");
      }
      if (push.op === "write") this.project.set(push.brain.id, push.brain);
      else this.project.delete(push.brainId);
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

/** The sync source a brains store follows: hands out the spec's channels. */
class FakeSync {
  private readonly _listeners = new Set<(channel: EditorBrainsChannel) => void>();

  onBrainsChannel = (listener: (channel: EditorBrainsChannel) => void): (() => void) => {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  };

  /**
   * A handshake of `binding` completing over `project`, handing out its
   * channel; `reportsCompiled` set as {@link FakeChannel.reportsCompiled}.
   */
  open(
    binding: string | undefined,
    project: Map<string, MakeCodeBrain>,
    held = false,
    reportsCompiled = true
  ): FakeChannel {
    const channel = new FakeChannel(binding, project);
    channel.held = held;
    channel.reportsCompiled = reportsCompiled;
    for (const listener of this._listeners) listener(channel);
    return channel;
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

/**
 * A brain as a project holds it after an editor pushed it: its source, and
 * the compiled form of that source. `edit` authors into the document first.
 */
function projectBrain(
  name: string,
  edit?: (environment: WendooEnvironment, definition: BrainDef) => void
): MakeCodeBrain {
  const { environment } = buildAuthoringEnvironment(undefined);
  const definition = BrainDef.emptyBrainDef(environment.brainServices, name);
  edit?.(environment, definition);
  const source = serializeBrainSource(definition);
  const { bytecode } = compileBrainSource(environment, source);
  return {
    id: definition.id(),
    name,
    source,
    compiled: bytecode === undefined ? undefined : { bytecode, sourceHash: brainSourceHash(source) },
  };
}

/** A project holding `brains`, keyed by id. */
function projectOf(...brains: MakeCodeBrain[]): Map<string, MakeCodeBrain> {
  return new Map(brains.map((brain) => [brain.id, brain]));
}

/** The entry `store` holds for `id`. Fails the spec when it holds none. */
function entryOf(store: BrainsStore, id: string): BrainEntry {
  const entry = store.getSnapshot().brains.get(id);
  assert.ok(entry, `expected the store to hold brain ${id}`);
  return entry;
}

/** The last push `channel` received, or `undefined` when it received none. */
function lastPush(channel: FakeChannel): MakeCodeBrainPush | undefined {
  return channel.pushes[channel.pushes.length - 1];
}

/** The ids of the brains `channel` received writes for, in order. */
function writtenIds(channel: FakeChannel): string[] {
  return channel.pushes.flatMap((push) => (push.op === "write" ? [push.brain.id] : []));
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

  /** Connects the session and opens a handshake of `binding` over `project`, resolving once it has reconciled. */
  async function handshake(binding: string, project: Map<string, MakeCodeBrain>): Promise<FakeChannel> {
    session.setStatus("connected");
    const channel = sync.open(binding, project);
    await settle();
    return channel;
  }

  describe("push on apply", () => {
    it("pushes each brain applied while connected: the source, compiled form and hash of one compile", async () => {
      const store = syncedStore();
      const channel = await handshake("token-1", projectOf());

      const id = store.addBrain("Chaser");
      const edited = store.getBrain(id);
      assert.ok(edited);
      authorCompilingRule(store.getSnapshot().environment, edited);
      store.applyBrain(edited);
      await settle();

      const entry = entryOf(store, id);
      const last = lastPush(channel);
      assert.ok(last?.op === "write");
      assert.deepEqual(last.brain, { id, name: "Chaser", source: entry.source, compiled: entry.compiled });
      assert.equal(last.brain.compiled?.sourceHash, entry.sourceHash);
      assert.equal(store.getSnapshot().pending.size, 0);
      assert.equal(channel.project.get(id)?.source, entry.source);
    });

    it("pushes a removal of a brain removed while connected", async () => {
      const store = syncedStore();
      const channel = await handshake("token-1", projectOf());
      const id = store.addBrain("Chaser");
      await settle();

      store.removeBrain(id);
      await settle();

      assert.deepEqual(lastPush(channel), { op: "remove", brainId: id });
      assert.equal(channel.project.has(id), false);
      assert.equal(store.getSnapshot().pending.size, 0);
    });

    it("records an edit pending when its push fails, keeping it until a later push is acknowledged", async () => {
      const store = syncedStore();
      const first = await handshake("token-1", projectOf());
      const id = store.addBrain("Chaser");
      first.failingWrites.add(id);
      store.renameBrain(id, "Runner");
      await settle();
      assert.deepEqual([...store.getSnapshot().pending], [id]);

      first.close();
      session.setStatus("disconnected");
      const second = await handshake("token-1", first.project);

      assert.equal(second.project.get(id)?.name, "Runner");
      assert.equal(store.getSnapshot().pending.size, 0);
    });
  });

  describe("reconnect flush", () => {
    it("flushes every pend on the next handshake of the binding, deletions included, clearing each on its ack", async () => {
      const store = syncedStore();
      const first = await handshake("token-1", projectOf());
      const kept = store.addBrain("Chaser");
      const removed = store.addBrain("Runner");
      await settle();
      first.close();
      session.setStatus("disconnected");

      store.renameBrain(kept, "Hider");
      store.removeBrain(removed);
      const added = store.addBrain("Seeker");
      assert.deepEqual([...store.getSnapshot().pending].sort(), [kept, removed, added].sort());
      const second = await handshake("token-1", first.project);

      assert.equal(store.getSnapshot().pending.size, 0);
      assert.deepEqual([...second.project.keys()].sort(), [kept, added].sort());
      assert.equal(second.project.get(kept)?.name, "Hider");
      assert.ok(second.pushes.some((push) => push.op === "remove" && push.brainId === removed));
    });

    it("keeps pends through a handshake that closes before reconciling, flushing them on the next", async () => {
      const store = syncedStore();
      const first = await handshake("token-1", projectOf());
      first.close();
      session.setStatus("disconnected");
      const id = store.addBrain("Chaser");

      session.setStatus("connected");
      const stalled = sync.open("token-1", first.project, true);
      await settle();
      stalled.close();
      await settle();
      assert.deepEqual([...store.getSnapshot().pending], [id]);

      const third = sync.open("token-1", first.project);
      await settle();
      assert.equal(store.getSnapshot().pending.size, 0);
      assert.equal(third.project.has(id), true);
    });

    it("keeps an edit made while a pull is in flight over the pulled copy, and flushes it after", async () => {
      const store = syncedStore();
      const first = await handshake("token-1", projectOf());
      const id = store.addBrain("Chaser");
      await settle();
      first.close();
      session.setStatus("disconnected");
      const synced = first.project.get(id);
      assert.ok(synced);
      first.project.set(id, { ...synced, name: "Remote", source: renamedSource(store, id, "Remote") });

      session.setStatus("connected");
      const second = sync.open("token-1", first.project, true);
      second.release();
      second.held = true;
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

  describe("binding lifecycle", () => {
    it("merges on the first binding: brains authored with no binding push to it, and its brains are pulled", async () => {
      const store = syncedStore();
      const local = store.addBrain("Local");
      const remote = projectBrain("Remote");

      const channel = await handshake("token-1", projectOf(remote));

      assert.deepEqual([...store.getSnapshot().brains.keys()], [local, remote.id]);
      assert.equal(entryOf(store, remote.id).source, remote.source);
      assert.deepEqual(writtenIds(channel), [local]);
      assert.equal(store.getSnapshot().pending.size, 0);
    });

    it("keeps brains and pends through the same binding's next handshake", async () => {
      const store = syncedStore();
      const first = await handshake("token-1", projectOf(projectBrain("Remote")));
      const synced = [...store.getSnapshot().brains.keys()];
      first.close();
      session.setStatus("disconnected");
      const pending = store.addBrain("Offline");

      const second = sync.open("token-1", first.project, true);
      session.setStatus("connected");
      assert.deepEqual([...store.getSnapshot().brains.keys()], [...synced, pending]);
      assert.deepEqual([...store.getSnapshot().pending], [pending]);
      second.release();
      await settle();

      assert.deepEqual([...store.getSnapshot().brains.keys()], [...synced, pending]);
      assert.equal(store.getSnapshot().pending.size, 0);
    });

    it("replaces brains with a different binding's set, discarding locals and pends, and pushing none of them", async () => {
      const store = syncedStore();
      const first = await handshake("token-1", projectOf(projectBrain("First project")));
      first.close();
      session.setStatus("none");
      const orphan = store.addBrain("Offline");
      const other = projectBrain("Other project");

      const second = await handshake("token-2", projectOf(other));

      assert.deepEqual([...store.getSnapshot().brains.keys()], [other.id]);
      assert.equal(store.getSnapshot().pending.size, 0);
      assert.deepEqual(second.pushes, []);
      assert.equal(second.project.has(orphan), false);
    });

    it("discards an edit whose push the earlier binding's handshake failed when a different binding replaces the brains", async () => {
      const store = syncedStore();
      const first = await handshake("token-1", projectOf());
      first.held = true;
      store.addBrain("Chaser");
      first.close();
      session.setStatus("disconnected");
      await settle();
      assert.equal(store.getSnapshot().pending.size, 1);

      const second = await handshake("token-2", projectOf());

      assert.equal(store.getSnapshot().brains.size, 0);
      assert.equal(store.getSnapshot().pending.size, 0);
      assert.deepEqual(second.pushes, []);
    });

    it("removes a synced brain the project deletes between listing and pulling it", async () => {
      const store = syncedStore();
      const remote = projectBrain("Remote");
      const first = await handshake("token-1", projectOf(remote));
      first.close();
      session.setStatus("disconnected");
      first.project.set(remote.id, { ...remote, source: sourceWith(remote, authorCompilingRule) });

      session.setStatus("connected");
      const second = sync.open("token-1", first.project, true);
      second.release();
      second.held = true;
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
      const first = await handshake("token-1", projectOf(gone, kept));
      first.close();
      session.setStatus("disconnected");
      store.renameBrain(kept.id, "Renamed");
      first.project.clear();

      const second = await handshake("token-1", first.project);

      assert.deepEqual([...store.getSnapshot().brains.keys()], [kept.id]);
      assert.equal(second.project.get(kept.id)?.name, "Renamed");
    });
  });

  describe("staleness", () => {
    it("adopts a pulled brain whose compiled form matches its source, pushing nothing", async () => {
      const store = syncedStore();
      const remote = projectBrain("Remote", authorCompilingRule);

      const channel = await handshake("token-1", projectOf(remote));

      const entry = entryOf(store, remote.id);
      assert.equal(entry.source, remote.source);
      assert.equal(entry.compiled?.sourceHash, entry.sourceHash);
      assert.deepEqual(channel.pushes, []);
    });

    it("recompiles a pulled brain whose source was edited out of band and pushes the fresh pair", async () => {
      const store = syncedStore();
      const original = projectBrain("Remote");
      const edited = { ...original, source: sourceWith(original, authorCompilingRule) };

      const channel = await handshake("token-1", projectOf(edited));

      const entry = entryOf(store, edited.id);
      assert.equal(entry.source, edited.source);
      assert.equal(entry.compiled?.sourceHash, brainSourceHash(edited.source));
      const pushed = lastPush(channel);
      assert.ok(pushed?.op === "write");
      assert.deepEqual(pushed.brain, {
        id: edited.id,
        name: "Remote",
        source: edited.source,
        compiled: entry.compiled,
      });
    });

    it("recompiles and pushes a pulled brain with no compiled form", async () => {
      const store = syncedStore();
      const { compiled: _compiled, ...sourceOnly } = projectBrain("Remote");

      const channel = await handshake("token-1", projectOf(sourceOnly));

      assert.equal(entryOf(store, sourceOnly.id).compiled?.sourceHash, brainSourceHash(sourceOnly.source));
      assert.deepEqual(writtenIds(channel), [sourceOnly.id]);
    });

    it("holds a pulled edit that fails to compile beside the project's compiled form, pushing nothing", async () => {
      const store = syncedStore();
      const original = projectBrain("Remote");
      const broken = { ...original, source: sourceWith(original, authorMisplacedTile) };

      const channel = await handshake("token-1", projectOf(broken));

      const entry = entryOf(store, broken.id);
      assert.equal(entry.source, broken.source);
      assert.ok(entry.diagnostics.some((diagnostic) => diagnostic.severity === "error"));
      assert.deepEqual(entry.compiled, original.compiled);
      assert.deepEqual(channel.pushes, []);
    });

    it("pulls a held brain whose project copy lists no compiled form, recompiling it and pushing the fresh pair", async () => {
      const store = syncedStore();
      const remote = projectBrain("Remote", authorCompilingRule);
      const first = await handshake("token-1", projectOf(remote));
      first.close();
      session.setStatus("disconnected");
      const { compiled: _compiled, ...sourceOnly } = remote;
      first.project.set(remote.id, sourceOnly);

      const second = await handshake("token-1", first.project);

      assert.deepEqual(second.pulls, [[remote.id]]);
      const pushed = lastPush(second);
      assert.ok(pushed?.op === "write");
      assert.deepEqual(pushed.brain.compiled, entryOf(store, remote.id).compiled);
      assert.equal(second.project.get(remote.id)?.compiled?.sourceHash, brainSourceHash(remote.source));
      assert.equal(store.getSnapshot().pending.size, 0);
    });

    it("pulls a held brain whose project copy lists a compiled form of other source, and pushes the fresh pair", async () => {
      const store = syncedStore();
      const remote = projectBrain("Remote", authorCompilingRule);
      const first = await handshake("token-1", projectOf(remote));
      first.close();
      session.setStatus("disconnected");
      const other = projectBrain("Other");
      first.project.set(remote.id, { ...remote, compiled: other.compiled });

      const second = await handshake("token-1", first.project);

      assert.deepEqual(second.pulls, [[remote.id]]);
      assert.deepEqual(writtenIds(second), [remote.id]);
      assert.deepEqual(second.project.get(remote.id)?.compiled, entryOf(store, remote.id).compiled);
      assert.equal(entryOf(store, remote.id).compiled?.sourceHash, brainSourceHash(remote.source));
    });

    it("pulls only the held brains whose compiled form the project lists as stale or missing", async () => {
      const store = syncedStore();
      const healthy = projectBrain("Healthy", authorCompilingRule);
      const missing = projectBrain("Missing", authorCompilingRule);
      const first = await handshake("token-1", projectOf(healthy, missing));
      first.close();
      session.setStatus("disconnected");
      const { compiled: _compiled, ...sourceOnly } = missing;
      first.project.set(missing.id, sourceOnly);

      const second = await handshake("token-1", first.project);

      assert.deepEqual(second.pulls, [[missing.id]]);
      assert.deepEqual(writtenIds(second), [missing.id]);
      assert.equal(second.project.get(healthy.id), healthy);
      assert.equal(store.getSnapshot().brains.size, 2);
    });

    it("takes no action on a list that carries no compiled source hashes, however many handshakes reconcile", async () => {
      const store = syncedStore();
      const remote = projectBrain("Remote", authorCompilingRule);
      const first = await handshake("token-1", projectOf(remote));
      const { compiled: _compiled, ...sourceOnly } = remote;
      first.project.set(remote.id, sourceOnly);

      for (let round = 0; round < 3; round++) {
        first.close();
        session.setStatus("disconnected");
        session.setStatus("connected");
        const legacy = sync.open("token-1", first.project, false, false);
        await settle();

        assert.equal(store.getSnapshot().reconciled, true);
        assert.deepEqual(legacy.pulls, []);
        assert.deepEqual(legacy.pushes, []);
        legacy.close();
      }
      assert.equal(first.project.get(remote.id), sourceOnly);
    });

    it("pulls a brain that fails to compile once per handshake while its compiled form lists stale, pushing nothing", async () => {
      const store = syncedStore();
      const original = projectBrain("Remote");
      const broken = { ...original, source: sourceWith(original, authorMisplacedTile) };
      const first = await handshake("token-1", projectOf(broken));
      first.close();
      session.setStatus("disconnected");

      const second = await handshake("token-1", first.project);

      assert.deepEqual(second.pulls, [[broken.id]]);
      assert.deepEqual(second.pushes, []);
      assert.equal(store.getSnapshot().pending.size, 0);
    });
  });

  describe("damaged sources", () => {
    it("lists a brain whose source is not a brain document as damaged, keeping the held copy and never pushing it", async () => {
      const store = syncedStore();
      const remote = projectBrain("Remote");
      const first = await handshake("token-1", projectOf(remote));
      const held = entryOf(store, remote.id);
      first.close();
      session.setStatus("disconnected");
      first.project.set(remote.id, { ...remote, source: "not json {" });

      const second = await handshake("token-1", first.project);

      assert.equal(store.getSnapshot().damaged.get(remote.id)?.code, BRAIN_SOURCE_INVALID);
      assert.equal(entryOf(store, remote.id), held);
      assert.deepEqual(second.pushes, []);
      assert.equal(second.project.get(remote.id)?.source, "not json {");
    });

    it("holds an edit to a damaged brain pending rather than pushing over the damaged source", async () => {
      const store = syncedStore();
      const remote = projectBrain("Remote");
      const first = await handshake("token-1", projectOf(remote));
      first.close();
      session.setStatus("disconnected");
      first.project.set(remote.id, { ...remote, source: '{"version":1}' });
      const second = await handshake("token-1", first.project);

      store.renameBrain(remote.id, "Renamed");
      await settle();

      assert.deepEqual([...store.getSnapshot().pending], [remote.id]);
      assert.deepEqual(second.pushes, []);
    });

    it("holds a pending removal of a brain whose source is damaged rather than deleting the damaged source", async () => {
      const store = syncedStore();
      const remote = projectBrain("Remote");
      const first = await handshake("token-1", projectOf(remote));
      first.close();
      session.setStatus("disconnected");
      store.removeBrain(remote.id);
      first.project.set(remote.id, { ...remote, source: "not json {" });

      const second = await handshake("token-1", first.project);

      assert.equal(store.getSnapshot().damaged.get(remote.id)?.code, BRAIN_SOURCE_INVALID);
      assert.deepEqual([...store.getSnapshot().pending], [remote.id]);
      assert.deepEqual(second.pushes, []);
    });

    it("re-pushes the held copy over a damaged source on request, clearing the damage and the pend on the ack", async () => {
      const store = syncedStore();
      const remote = projectBrain("Remote");
      const first = await handshake("token-1", projectOf(remote));
      first.close();
      session.setStatus("disconnected");
      store.renameBrain(remote.id, "Renamed");
      first.project.set(remote.id, { ...remote, source: "not json {" });
      const second = await handshake("token-1", first.project);
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

      const channel = await handshake("token-1", projectOf(remote));
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
      const mismatched = { ...addressed, source: embedded.source };

      const channel = await handshake("token-1", projectOf(mismatched));

      assert.equal(store.getSnapshot().damaged.get(addressed.id)?.code, BRAIN_SOURCE_ID_MISMATCH);
      assert.equal(store.getSnapshot().brains.size, 0);
      assert.deepEqual(channel.pushes, []);
    });

    it("clears the damage once the project no longer holds the damaged source", async () => {
      const store = syncedStore();
      const remote = { ...projectBrain("Remote"), source: "not json {" };
      const first = await handshake("token-1", projectOf(remote));
      assert.equal(store.getSnapshot().damaged.has(remote.id), true);
      first.close();
      session.setStatus("disconnected");
      first.project.delete(remote.id);

      await handshake("token-1", first.project);

      assert.equal(store.getSnapshot().damaged.size, 0);
      assert.equal(store.getSnapshot().brains.size, 0);
    });

    it("clears the damage once the project's source is repaired", async () => {
      const store = syncedStore();
      const remote = projectBrain("Remote");
      const first = await handshake("token-1", projectOf({ ...remote, source: "not json {" }));
      assert.equal(store.getSnapshot().damaged.has(remote.id), true);
      first.close();
      session.setStatus("disconnected");
      first.project.set(remote.id, remote);

      await handshake("token-1", first.project);

      assert.equal(store.getSnapshot().damaged.size, 0);
      assert.equal(entryOf(store, remote.id).source, remote.source);
    });
  });

  describe("reconciled", () => {
    it("reports reconciled once a connected handshake has reconciled, and not while its requests are in flight", async () => {
      const store = syncedStore();
      assert.equal(store.getSnapshot().reconciled, false);
      session.setStatus("connected");

      const channel = sync.open("token-1", projectOf(projectBrain("Remote")), true);
      await settle();
      assert.equal(store.getSnapshot().reconciled, false);
      channel.release();
      await settle();

      assert.equal(store.getSnapshot().reconciled, true);
    });

    it("stops reporting reconciled when the session disconnects, until the next handshake reconciles", async () => {
      const store = syncedStore();
      const first = await handshake("token-1", projectOf());
      assert.equal(store.getSnapshot().reconciled, true);

      first.close();
      session.setStatus("disconnected");
      assert.equal(store.getSnapshot().reconciled, false);
      await handshake("token-1", first.project);

      assert.equal(store.getSnapshot().reconciled, true);
    });

    it("pushes nothing for a re-push asked while disconnected, keeping the damage", async () => {
      const store = syncedStore();
      const remote = projectBrain("Remote");
      const first = await handshake("token-1", projectOf(remote));
      first.close();
      session.setStatus("disconnected");
      first.project.set(remote.id, { ...remote, source: "not json {" });
      const second = await handshake("token-1", first.project);
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

  describe("two brains", () => {
    it("flushes two pends independently: a failed write stays pending while the other clears", async () => {
      const store = syncedStore();
      const first = await handshake("token-1", projectOf());
      first.close();
      session.setStatus("disconnected");
      const failing = store.addBrain("Failing");
      const passing = store.addBrain("Passing");

      session.setStatus("connected");
      const second = sync.open("token-1", first.project, true);
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
      const channel = await handshake("token-1", projectOf());
      const id = store.addBrain("Chaser");
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
      const first = await handshake("token-1", projectOf());
      const id = store.addBrain("Chaser");
      await settle();
      first.close();
      session.setStatus("disconnected");

      const reread = store.getBrain(id);
      assert.ok(reread);
      store.applyBrain(reread);
      assert.equal(store.getSnapshot().pending.size, 0);
      const second = await handshake("token-1", first.project);

      assert.deepEqual(second.pushes, []);
    });

    it("keeps a failing brain's diagnostics and last good compile through an identical apply, pushing nothing", async () => {
      const store = syncedStore();
      const channel = await handshake("token-1", projectOf());
      const id = store.addBrain("Chaser");
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
      const first = await handshake("token-1", projectOf(remote));
      first.close();
      session.setStatus("disconnected");
      first.project.set(remote.id, { ...remote, source: "not json {" });
      const second = await handshake("token-1", first.project);
      assert.equal(store.getSnapshot().damaged.has(remote.id), true);

      const reread = store.getBrain(remote.id);
      assert.ok(reread);
      store.applyBrain(reread);
      assert.equal(store.getSnapshot().pending.size, 0);
      second.close();
      session.setStatus("disconnected");
      const repairedSource = renamedSource(store, remote.id, "Repaired");
      const { bytecode } = compileBrainSource(buildAuthoringEnvironment(undefined).environment, repairedSource);
      assert.ok(bytecode);
      const repaired: MakeCodeBrain = {
        id: remote.id,
        name: "Repaired",
        source: repairedSource,
        compiled: { bytecode, sourceHash: brainSourceHash(repairedSource) },
      };
      second.project.set(remote.id, repaired);
      const third = await handshake("token-1", second.project);

      assert.equal(entryOf(store, remote.id).source, repaired.source);
      assert.equal(store.getSnapshot().damaged.size, 0);
      assert.deepEqual(third.pushes, []);
    });

    it("pushes the next edit after an identical apply as usual", async () => {
      const store = syncedStore();
      const channel = await handshake("token-1", projectOf());
      const id = store.addBrain("Chaser");
      await settle();
      const reread = store.getBrain(id);
      assert.ok(reread);
      store.applyBrain(reread);

      store.renameBrain(id, "Runner");
      await settle();

      assert.equal(channel.pushes.length, 2);
      assert.equal(channel.project.get(id)?.name, "Runner");
    });
  });

  describe("acknowledgment order", () => {
    it("keeps the pend of a newer edit whose push failed when an older push of the brain is acknowledged after it", async () => {
      const store = syncedStore();
      const first = await handshake("token-1", projectOf());
      const id = store.addBrain("Chaser");
      await settle();
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
      const second = await handshake("token-1", first.project);

      assert.equal(entryOf(store, id).name, "Newer");
      assert.equal(second.project.get(id)?.name, "Newer");
      assert.equal(store.getSnapshot().pending.size, 0);
    });

    it("keeps the pend when an older push carrying the same source as the failed newest edit is acknowledged after it", async () => {
      const store = syncedStore();
      const channel = await handshake("token-1", projectOf());
      const id = store.addBrain("Chaser");
      await settle();
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
      const channel = await handshake("token-1", projectOf());
      const id = store.addBrain("Chaser");
      await settle();
      channel.failingWrites.add(id);
      store.renameBrain(id, "Runner");
      await settle();
      assert.deepEqual([...store.getSnapshot().pending], [id]);
      return { store, channel, id };
    }

    /** Advances the clock by `ms` and lets the answers it triggers run. */
    async function elapse(ms: number): Promise<void> {
      mock.timers.tick(ms);
      await settle();
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

    it("backs off through every retry delay, then stops, leaving the pend for the next handshake to push", async () => {
      const { store, channel, id } = await failingBrain();
      const pushes = channel.pushes.length;

      for (const [attempt, delay] of PUSH_RETRY_DELAYS_MS.entries()) {
        await elapse(delay - 1);
        assert.equal(channel.pushes.length, pushes + attempt);
        await elapse(1);
        assert.equal(channel.pushes.length, pushes + attempt + 1);
      }
      await elapse(60_000);

      assert.equal(channel.pushes.length, pushes + PUSH_RETRY_DELAYS_MS.length);
      assert.deepEqual([...store.getSnapshot().pending], [id]);
      channel.close();
      session.setStatus("disconnected");
      const second = await handshake("token-1", channel.project);
      assert.equal(second.project.get(id)?.name, "Runner");
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
      const second = await handshake("token-1", channel.project);
      await elapse(60_000);

      assert.deepEqual(writtenIds(second), [id]);
      assert.equal(second.project.get(id)?.name, "Runner");
      assert.equal(store.getSnapshot().pending.size, 0);
    });

    it("never retries a failed re-push of a damaged brain", async () => {
      const store = syncedStore();
      const remote = projectBrain("Remote");
      const first = await handshake("token-1", projectOf(remote));
      first.close();
      session.setStatus("disconnected");
      first.project.set(remote.id, { ...remote, source: "not json {" });
      const second = await handshake("token-1", first.project);
      second.failingWrites.add(remote.id);

      store.repushBrain(remote.id);
      await settle();
      second.failingWrites.delete(remote.id);
      await elapse(60_000);

      assert.equal(second.pushes.length, 1);
      assert.equal(store.getSnapshot().damaged.has(remote.id), true);
    });
  });
});

/** The source of `brain` with its document edited by `edit`, as an out-of-band editor would save it. */
function sourceWith(
  brain: MakeCodeBrain,
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
