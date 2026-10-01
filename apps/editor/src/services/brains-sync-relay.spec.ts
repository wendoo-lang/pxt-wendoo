import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import {
  assertJoinCode,
  delay,
  type ScriptedPeer,
  startTestRelay,
  type TestRelay,
} from "@wendoo/bridge-session/testing";
import { stream } from "@wendoo/core";
import type { WendooEnvironment } from "@wendoo/core/app";
import { BrainDef, CoreHostActions, LogLevel, logger, mkActuatorTileId, mkSensorTileId } from "@wendoo/core/app";
import type { BrainPageDef, BrainRuleDef } from "@wendoo/core/brain/model";
import { linkedBrainProgramFromBytes } from "@wendoo/core/runtime";
import type { MakeCodeBrainSummary, MakeCodeBrainsRequestMessage, MakeCodeWireBrain } from "@wendoo/makecode-session";
import {
  brainSourceHash,
  MAKECODE_SESSION_PROTOCOL_VERSION,
  MAKECODE_SESSION_ROLE_PATHS,
} from "@wendoo/makecode-session";
import {
  type BindingTokenStore,
  openBindingTokenStore,
  type TokenStorage,
} from "../../../../makecode/simx/bridge/src/binding-token-store.js";
import { BRAINS_MODULE_FILE, readBrainsModule } from "../../../../makecode/simx/bridge/src/brains-module.js";
import { SIM_CHANNEL_VERSION, SIMX_CHANNEL, type SimxFrame } from "../../../../makecode/simx/bridge/src/sim-channel.js";
import { type SimxBridge, type SimxLog, startSimxBridge } from "../../../../makecode/simx/bridge/src/simx-bridge.js";
import {
  FakeProjfsHost,
  PROJFS_RATE_LIMIT,
  PROJFS_RATE_WINDOW_MS,
  PROJFS_SCOPE_QUOTA_BYTES,
} from "../../../../makecode/simx/bridge/src/test-support/projfs-host.js";
import type { ProjfsClient } from "../../../../makecode/simx/bridge/src/vendor/projfs.js";
import { buildAuthoringEnvironment, MAKECODE_VM_PRECISION } from "./authoring-environment.js";
import {
  BRAIN_SOURCE_ID_MISMATCH,
  BRAIN_SOURCE_INVALID,
  compileBrainSource,
  readBrainSource,
  serializeBrainSource,
} from "./brain-source.js";
import type { BrainsViewState } from "./brains-store.js";
import { BrainsStore } from "./brains-store.js";
import type { BindingTokenPersistence, EditorSessionViewState } from "./editor-session-store.js";
import { EditorSessionStore } from "./editor-session-store.js";

const CATALOG = '{"packs":[]}';

/** How long a wait in these specs lasts before it fails, in milliseconds. */
const WAIT_MS = 2000;

/** A file outside the brains that fills the simulator extension's folder to its quota, so MakeCode refuses every brain write. */
const FILLER = "filler.bin";

/** A brains request the scripted simx received. */
type ReceivedRequest = MakeCodeBrainsRequestMessage;

/**
 * A simx played by the spec over a raw relay connection: it opens a makecode
 * handshake on every welcome and answers the editor's brains requests from
 * its in-memory project -- or, while held, queues the answers until
 * released. It records every brains request it receives. Its list carries
 * each brain's compiled source hash only when opened to report it; otherwise
 * it answers as a simx predating that field does.
 */
class ScriptedSimx {
  /** The brains the project holds, by document id, in the wire form. */
  readonly project: Map<string, MakeCodeWireBrain>;
  /** Every brains request received, in order. */
  readonly requests: ReceivedRequest[] = [];
  /** The binding token of the latest welcome. */
  bindingToken: string | undefined;
  /** How many welcomes arrived. */
  welcomes = 0;
  held = false;
  private readonly _queue: (() => void)[] = [];
  private readonly _peer: ScriptedPeer;
  private readonly _reportsCompiled: boolean;
  private _running = true;

  private constructor(peer: ScriptedPeer, project: Map<string, MakeCodeWireBrain>, reportsCompiled: boolean) {
    this._peer = peer;
    this.project = project;
    this._reportsCompiled = reportsCompiled;
  }

  /**
   * Connects at the simx role path over `project`, presenting `bindingToken`
   * when given, and resolves with the simx and the join code the relay
   * answered with, if it answered with one. With `reportsCompiled`, its list
   * carries each brain's compiled source hash, `null` for a brain with no
   * compiled form.
   */
  static async open(
    relay: TestRelay,
    project: Map<string, MakeCodeWireBrain>,
    bindingToken?: string,
    reportsCompiled = false
  ): Promise<{ simx: ScriptedSimx; joinCode: string | undefined }> {
    const peer = await relay.connect(MAKECODE_SESSION_ROLE_PATHS.simx);
    const simx = new ScriptedSimx(peer, project, reportsCompiled);
    const answer = await peer.hello(bindingToken === undefined ? {} : { bindingToken });
    const joinCode = answer.type === "session:joinCode" ? assertJoinCode(answer) : undefined;
    simx.handle(answer as unknown as Record<string, unknown>);
    void simx.pump();
    return { simx, joinCode };
  }

  /** Sends `message` to the editor as it is. */
  send(message: object): void {
    this._peer.send(message);
  }

  /** Answers every request held so far, in arrival order, and stops holding. */
  release(): void {
    this.held = false;
    for (const answer of this._queue.splice(0)) answer();
  }

  /** The requests of `type` received so far. */
  requestsOf(type: ReceivedRequest["type"]): ReceivedRequest[] {
    return this.requests.filter((request) => request.type === type);
  }

  /** Closes the connection. */
  async close(): Promise<void> {
    this._running = false;
    await this._peer.close();
  }

  private async pump(): Promise<void> {
    while (this._running) {
      let frame: string;
      try {
        frame = await Promise.race([this._peer.next(), this._peer.closed.then(() => "")]);
      } catch {
        continue;
      }
      if (frame === "") return;
      this.handle(JSON.parse(frame) as Record<string, unknown>);
    }
  }

  private handle(message: Record<string, unknown>): void {
    switch (message.type) {
      case "session:welcome":
        this.welcomes += 1;
        this.bindingToken = (message.payload as { bindingToken: string }).bindingToken;
        this.send({ type: "makecode:hello", payload: { protocolVersion: MAKECODE_SESSION_PROTOCOL_VERSION } });
        return;
      case "makecode:brainsList":
      case "makecode:brainsPull":
      case "makecode:brainsPush": {
        const request = message as unknown as ReceivedRequest;
        this.requests.push(request);
        const answer = () => {
          this.send(this.answer(request));
        };
        if (this.held) this._queue.push(answer);
        else answer();
        return;
      }
      default:
        return;
    }
  }

  private answer(request: ReceivedRequest): object {
    switch (request.type) {
      case "makecode:brainsList":
        return {
          type: "makecode:brainsListReply",
          id: request.id,
          payload: {
            brains: [...this.project.values()].map((brain) => {
              const summary: MakeCodeBrainSummary = {
                id: brain.id,
                name: brain.name,
                sourceHash: brainSourceHash(brain.source),
              };
              if (this._reportsCompiled) summary.compiledSourceHash = brain.compiled?.sourceHash ?? null;
              return summary;
            }),
          },
        };
      case "makecode:brainsPull":
        return {
          type: "makecode:brainsPullReply",
          id: request.id,
          payload: { brains: request.payload.ids.flatMap((id) => this.project.get(id) ?? []) },
        };
      case "makecode:brainsPush":
        if (request.payload.op === "write") this.project.set(request.payload.brain.id, request.payload.brain);
        else this.project.delete(request.payload.brainId);
        return { type: "makecode:brainsAck", id: request.id };
    }
  }
}

/** The window of a simulator extension frame, driven by the spec in place of MakeCode. */
class FakeFrame implements SimxFrame {
  private readonly _listeners = new Set<(event: { data: unknown }) => void>();
  readonly parent = {
    postMessage: () => {},
  };

  addEventListener(_type: "message", listener: (event: { data: unknown }) => void): void {
    this._listeners.add(listener);
  }

  removeEventListener(_type: "message", listener: (event: { data: unknown }) => void): void {
    this._listeners.delete(listener);
  }

  /** MakeCode delivering `catalog` as the running program posts it, framed under the current channel version. */
  programPosts(catalog: string): void {
    const packet = {
      type: "messagepacket",
      channel: SIMX_CHANNEL,
      data: new TextEncoder().encode(`${SIM_CHANNEL_VERSION}\n${catalog}`),
    };
    for (const listener of this._listeners) {
      listener({ data: packet });
    }
  }
}

/** Web storage holding its items in memory. */
class MemoryStorage implements TokenStorage {
  private readonly _items = new Map<string, string>();

  getItem(key: string): string | null {
    return this._items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this._items.set(key, value);
  }

  removeItem(key: string): void {
    this._items.delete(key);
  }
}

/** A simx log keeping its lines out of the test output. */
const silentLog: SimxLog = { info() {}, error() {} };

/** Resolves with `read()` once `predicate` holds for it, polling until {@link WAIT_MS}. */
async function eventually<T>(read: () => T, predicate: (value: T) => boolean, what: string): Promise<T> {
  const deadline = Date.now() + WAIT_MS;
  for (;;) {
    const value = read();
    if (predicate(value)) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await delay(10);
  }
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

/**
 * Reopens the brain `id` of `brains` as the brain editor does, appends a
 * second compiling rule to its first page, and applies the result.
 */
function reopenWithSecondRule(brains: BrainsStore, id: string): void {
  const reopened = brains.getBrain(id);
  assert.ok(reopened);
  const page = reopened.pages().get(0) as BrainPageDef;
  const rule = page.appendNewRule();
  const environment = brains.getSnapshot().environment;
  for (const catalog of environment.tileCatalogs()) {
    const when = catalog.get(mkSensorTileId(CoreHostActions.OnPageEntered.key));
    const act = catalog.get(mkActuatorTileId(CoreHostActions.RestartPage.key));
    if (when && act) {
      rule.when().appendTile(when);
      rule.do().appendTile(act);
      brains.applyBrain(reopened);
      return;
    }
  }
  throw new Error("no core tiles");
}

/** How many rules the first page of the brain `id` of `brains` holds. */
function pageRules(brains: BrainsStore, id: string): number {
  const held = brains.getBrain(id);
  assert.ok(held);
  return (held.pages().get(0) as BrainPageDef).children().size();
}

/** A brain as a project holds it after an editor pushed it, in the wire form: its source and that source's compiled form. */
function projectBrain(name: string): MakeCodeWireBrain {
  const { environment } = buildAuthoringEnvironment(undefined);
  const definition = BrainDef.emptyBrainDef(environment.brainServices, name);
  const source = serializeBrainSource(definition);
  const { bytecode } = compileBrainSource(environment, source);
  assert.ok(bytecode);
  return {
    id: definition.id(),
    name,
    source,
    compiled: { bytecode: Buffer.from(bytecode).toString("base64"), sourceHash: brainSourceHash(source) },
  };
}

/** The source of `brain` with a compiling rule authored into it, as an out-of-band editor would save it. */
function editedOutOfBand(brain: MakeCodeWireBrain): string {
  const { environment } = buildAuthoringEnvironment(undefined);
  const definition = readBrainSource(environment, brain.source);
  authorCompilingRule(environment, definition);
  return serializeBrainSource(definition);
}

/** A project holding `brains`, keyed by id. */
function projectOf(...brains: MakeCodeWireBrain[]): Map<string, MakeCodeWireBrain> {
  return new Map(brains.map((brain) => [brain.id, brain]));
}

describe("brains sync with a scripted simx on the relay", () => {
  let relay: TestRelay;
  let tokens: Map<string, string>;
  let persistence: BindingTokenPersistence;
  let sessions: EditorSessionStore[];
  let simxs: ScriptedSimx[];
  let bridges: SimxBridge[];
  let loggedLevel: LogLevel;

  before(async () => {
    loggedLevel = logger.level;
    logger.level = LogLevel.ERROR;
    relay = await startTestRelay({ bindingSecret: "spec-secret" });
  });

  beforeEach(() => {
    tokens = new Map();
    persistence = {
      load: () => tokens.get("token"),
      save: (token) => {
        tokens.set("token", token);
      },
      clear: () => {
        tokens.delete("token");
      },
      has: () => tokens.has("token"),
    };
    sessions = [];
    simxs = [];
    bridges = [];
  });

  afterEach(async () => {
    for (const session of sessions) session.stop();
    for (const bridge of bridges) bridge.dispose();
    for (const simx of simxs) await simx.close();
    await relay.closePeers();
  });

  after(async () => {
    await relay.close();
    logger.level = loggedLevel;
  });

  /** An editor: a session store over the spec's persistence, and a brains store synced over it. */
  function editor(): { session: EditorSessionStore; brains: BrainsStore } {
    const session = new EditorSessionStore({ bridgeUrl: relay.address, persistence });
    sessions.push(session);
    return { session, brains: new BrainsStore(session, session) };
  }

  /** Opens a scripted simx over `project`, stopped by the spec's cleanup; `reportsCompiled` as {@link ScriptedSimx.open} takes it. */
  async function openSimx(
    project: Map<string, MakeCodeWireBrain>,
    bindingToken?: string,
    reportsCompiled = false
  ): Promise<{ simx: ScriptedSimx; joinCode: string | undefined }> {
    const opened = await ScriptedSimx.open(relay, project, bindingToken, reportsCompiled);
    simxs.push(opened.simx);
    return opened;
  }

  /** Resolves with the brains store's state once `predicate` holds for it. */
  function brainsUntil(
    brains: BrainsStore,
    predicate: (state: BrainsViewState) => boolean,
    what: string
  ): Promise<BrainsViewState> {
    return eventually(() => brains.getSnapshot(), predicate, what);
  }

  /** Resolves with the session store's state once `predicate` holds for it. */
  function sessionUntil(
    session: EditorSessionStore,
    predicate: (state: EditorSessionViewState) => boolean,
    what: string
  ): Promise<EditorSessionViewState> {
    return eventually(() => session.getSnapshot(), predicate, what);
  }

  /**
   * Pairs a new editor with a new scripted simx over `project` and resolves
   * once the editor has reconciled -- the simx answered its list and every
   * pull it needed.
   */
  async function pair(
    project: Map<string, MakeCodeWireBrain>
  ): Promise<{ session: EditorSessionStore; brains: BrainsStore; simx: ScriptedSimx }> {
    const { simx, joinCode } = await openSimx(project);
    assert.ok(joinCode);
    const { session, brains } = editor();
    session.connect(joinCode);
    await eventually(
      () => simx.requestsOf("makecode:brainsList").length,
      (count) => count > 0,
      "the editor's list"
    );
    await brainsUntil(brains, (state) => state.brains.size === project.size, "the editor to reconcile");
    return { session, brains, simx };
  }

  /** Closes `simx` and resolves once the editor reports the session disconnected. */
  async function dropSimx(simx: ScriptedSimx, session: EditorSessionStore): Promise<void> {
    await simx.close();
    await sessionUntil(session, (state) => state.status === "disconnected", "the editor to see the simx leave");
  }

  it("pushes an authored brain to the project, source and compiled form of one compile, and holds nothing pending", async () => {
    const { brains, simx } = await pair(projectOf());

    const id = brains.addBrain("Chaser");
    const edited = brains.getBrain(id);
    assert.ok(edited);
    authorCompilingRule(brains.getSnapshot().environment, edited);
    brains.applyBrain(edited);
    const entry = brains.getSnapshot().brains.get(id);
    assert.ok(entry?.compiled);
    const stored = await eventually(
      () => simx.project.get(id),
      (brain) => brain?.source === entry.source,
      "the applied brain to reach the project"
    );

    assert.deepEqual(stored, {
      id,
      name: "Chaser",
      source: entry.source,
      compiled: { bytecode: Buffer.from(entry.compiled.bytecode).toString("base64"), sourceHash: entry.sourceHash },
    });
    await brainsUntil(brains, (state) => state.pending.size === 0, "nothing pending");
  });

  it("flushes the pends of a disconnection when the simx returns by its token, deletions included, clearing them on the acks", async () => {
    const { session, brains, simx } = await pair(projectOf());
    const kept = brains.addBrain("Chaser");
    const removed = brains.addBrain("Runner");
    await eventually(
      () => simx.project.size,
      (size) => size === 2,
      "both brains to reach the project"
    );
    await dropSimx(simx, session);

    brains.renameBrain(kept, "Hider");
    brains.removeBrain(removed);
    const added = brains.addBrain("Seeker");
    assert.deepEqual([...brains.getSnapshot().pending].sort(), [kept, removed, added].sort());
    const { simx: returned } = await openSimx(simx.project, simx.bindingToken);

    await brainsUntil(brains, (state) => state.pending.size === 0, "the pends to clear");
    assert.deepEqual([...returned.project.keys()].sort(), [kept, added].sort());
    assert.equal(returned.project.get(kept)?.name, "Hider");
    assert.ok(
      returned
        .requestsOf("makecode:brainsPush")
        .some((request) => request.type === "makecode:brainsPush" && request.payload.op === "remove")
    );
  });

  it("keeps brains and pends through its own reconnection to the same binding, then flushes them", async () => {
    const remote = projectBrain("Remote");
    const { session, brains, simx } = await pair(projectOf(remote));
    session.stop();
    await sessionUntil(session, (state) => state.status === "disconnected", "the editor to disconnect");
    const offline = brains.addBrain("Offline");
    brains.renameBrain(remote.id, "Renamed offline");
    const listsBefore = simx.requestsOf("makecode:brainsList").length;

    session.reconnect();
    await eventually(
      () => simx.requestsOf("makecode:brainsList").length,
      (count) => count > listsBefore,
      "the resumed handshake's list"
    );
    await brainsUntil(brains, (state) => state.pending.size === 0, "the pends to clear");

    assert.deepEqual([...brains.getSnapshot().brains.keys()], [remote.id, offline]);
    assert.equal(brains.getSnapshot().brains.get(remote.id)?.name, "Renamed offline");
    assert.equal(simx.project.get(remote.id)?.name, "Renamed offline");
    assert.equal(simx.project.has(offline), true);
  });

  it("replaces the brains with a different binding's project, discarding local brains and pends", async () => {
    const { session, brains, simx } = await pair(projectOf(projectBrain("First project")));
    session.forget();
    await simx.close();
    const orphan = brains.addBrain("Offline");
    const other = projectBrain("Other project");
    const { simx: second, joinCode } = await openSimx(projectOf(other));
    assert.ok(joinCode);

    session.connect(joinCode);
    await eventually(
      () => second.requestsOf("makecode:brainsList").length,
      (count) => count > 0,
      "the new list"
    );
    const state = await brainsUntil(
      brains,
      (s) => s.brains.size === 1 && s.brains.has(other.id),
      "the new binding's brains"
    );

    assert.equal(state.pending.size, 0);
    assert.deepEqual(second.requestsOf("makecode:brainsPush"), []);
    assert.equal(second.project.has(orphan), false);
  });

  it("recompiles a brain whose source was edited out of band and pushes the fresh pair", async () => {
    const original = projectBrain("Remote");
    const edited = { ...original, source: editedOutOfBand(original) };
    const { brains, simx } = await pair(projectOf(edited));

    const stored = await eventually(
      () => simx.project.get(edited.id),
      (brain) => brain?.compiled?.sourceHash === brainSourceHash(edited.source),
      "the recompiled pair to reach the project"
    );

    assert.equal(stored?.source, edited.source);
    const entry = brains.getSnapshot().brains.get(edited.id);
    assert.equal(entry?.compiled?.sourceHash, brainSourceHash(edited.source));
    const bytes = new Uint8Array(Buffer.from(stored?.compiled?.bytecode ?? "", "base64"));
    const program = linkedBrainProgramFromBytes(stream.byteArrayFromUint8Array(bytes), {
      precision: MAKECODE_VM_PRECISION,
      typeRegistry: brains.getSnapshot().environment.brainServices.runtime.types,
    });
    assert.equal(program.profileId, 2001);
  });

  it("lists a corrupt source as damaged without overwriting it, keeping the held copy for a re-push on request", async () => {
    const remote = projectBrain("Remote");
    const { session, brains, simx } = await pair(projectOf(remote));
    const held = brains.getSnapshot().brains.get(remote.id);
    await dropSimx(simx, session);
    simx.project.set(remote.id, { ...remote, source: "not json {" });

    const { simx: returned } = await openSimx(simx.project, simx.bindingToken);
    const state = await brainsUntil(brains, (s) => s.damaged.size === 1, "the damage to be listed");

    assert.equal(state.damaged.get(remote.id)?.code, BRAIN_SOURCE_INVALID);
    assert.equal(state.brains.get(remote.id), held);
    await delay(50);
    assert.deepEqual(returned.requestsOf("makecode:brainsPush"), []);
    assert.equal(returned.project.get(remote.id)?.source, "not json {");

    brains.repushBrain(remote.id);
    await brainsUntil(brains, (s) => s.damaged.size === 0, "the re-push to clear the damage");
    assert.equal(returned.project.get(remote.id)?.source, held?.source);
  });

  it("lists a source whose embedded id differs from its address as damaged, pushing nothing", async () => {
    const addressed = projectBrain("Addressed");
    const mismatched = { ...addressed, source: projectBrain("Embedded").source };
    const { simx, joinCode } = await openSimx(projectOf(mismatched));
    assert.ok(joinCode);
    const { session, brains } = editor();

    session.connect(joinCode);
    const state = await brainsUntil(brains, (s) => s.damaged.size === 1, "the damage to be listed");

    assert.equal(state.damaged.get(addressed.id)?.code, BRAIN_SOURCE_ID_MISMATCH);
    assert.equal(state.brains.size, 0);
    await delay(50);
    assert.deepEqual(simx.requestsOf("makecode:brainsPush"), []);
  });

  it("keeps an edit made while a pull is in flight over the pulled copy, and flushes it after", async () => {
    const remote = projectBrain("Remote");
    const { session, brains, simx } = await pair(projectOf(remote));
    await dropSimx(simx, session);
    simx.project.set(remote.id, { ...remote, source: editedOutOfBand(remote) });

    const { simx: returned } = await openSimx(simx.project, simx.bindingToken);
    returned.held = true;
    await eventually(
      () => returned.requests.length,
      (count) => count === 1,
      "the held list"
    );
    returned.release();
    returned.held = true;
    await eventually(
      () => returned.requestsOf("makecode:brainsPull").length,
      (count) => count === 1,
      "the held pull"
    );
    brains.renameBrain(remote.id, "Local");
    returned.release();

    await brainsUntil(brains, (state) => state.pending.size === 0, "the local edit to flush");
    assert.equal(brains.getSnapshot().brains.get(remote.id)?.name, "Local");
    assert.equal(returned.project.get(remote.id)?.name, "Local");
  });

  it("takes no action on the list of a simx that reports no compiled forms, through handshake after handshake", async () => {
    const remote = projectBrain("Remote");
    const { session, brains, simx } = await pair(projectOf(remote));
    await dropSimx(simx, session);
    const { compiled: _compiled, ...sourceOnly } = remote;
    simx.project.set(remote.id, sourceOnly);

    let token = simx.bindingToken;
    for (let round = 0; round < 3; round++) {
      const { simx: returned } = await openSimx(simx.project, token);
      await eventually(
        () => returned.requestsOf("makecode:brainsList").length,
        (count) => count > 0,
        "the returning simx's list"
      );
      await brainsUntil(brains, (state) => state.reconciled, "the editor to reconcile");
      await delay(50);

      assert.deepEqual(returned.requestsOf("makecode:brainsPull"), []);
      assert.deepEqual(returned.requestsOf("makecode:brainsPush"), []);
      token = returned.bindingToken;
      await dropSimx(returned, session);
    }
    assert.equal(simx.project.get(remote.id), sourceOnly);
  });

  it("pulls and heals a brain whose compiled form a reporting simx lists as missing, once", async () => {
    const remote = projectBrain("Remote");
    const { session, brains, simx } = await pair(projectOf(remote));
    await dropSimx(simx, session);
    const { compiled: _compiled, ...sourceOnly } = remote;
    simx.project.set(remote.id, sourceOnly);

    const { simx: returned } = await openSimx(simx.project, simx.bindingToken, true);
    const stored = await eventually(
      () => returned.project.get(remote.id),
      (brain) => brain?.compiled !== undefined,
      "the recompiled pair to reach the project"
    );

    assert.equal(returned.requestsOf("makecode:brainsPull").length, 1);
    assert.equal(returned.requestsOf("makecode:brainsPush").length, 1);
    assert.deepEqual(stored?.compiled, remote.compiled);
    await brainsUntil(brains, (state) => state.pending.size === 0, "nothing pending");
  });

  it("ignores payload types it does not know and replies to no request of its own", async () => {
    const { simx, joinCode } = await openSimx(projectOf());
    assert.ok(joinCode);
    const { session, brains } = editor();
    session.connect(joinCode);
    await eventually(
      () => simx.requestsOf("makecode:brainsList").length,
      (count) => count > 0,
      "the editor's list"
    );
    simx.send({ type: "makecode:catalog", payload: { content: CATALOG } });
    await sessionUntil(session, (state) => state.catalogText === CATALOG, "the catalog");

    simx.send({ type: "makecode:somethingNewer", payload: { content: "not a catalog" } });
    simx.send({ type: "makecode:brainsAck", id: "no-such-request" });
    const id = brains.addBrain("Chaser");
    await eventually(
      () => simx.project.has(id),
      (held) => held,
      "the brain to reach the project"
    );

    assert.equal(session.getSnapshot().catalogText, CATALOG);
    assert.equal(brains.getSnapshot().pending.size, 0);
  });

  describe("with the real simx module over a MakeCode project", () => {
    let host: FakeProjfsHost;
    let clients: ProjfsClient[];

    beforeEach(() => {
      host = new FakeProjfsHost();
      clients = [];
    });

    afterEach(() => {
      for (const client of clients) client.dispose();
    });

    /**
     * Starts the real simx module in a fresh frame over `project`'s files,
     * keeping its binding token in `tokens`, as MakeCode does on every
     * simulator start; the program posts the catalog.
     */
    function startSimx(tokens: BindingTokenStore, project: FakeProjfsHost = host): SimxBridge {
      const frame = new FakeFrame();
      const files = project.client();
      clients.push(files);
      const bridge = startSimxBridge({ frame, bridgeUrl: relay.address, tokens, log: silentLog, files });
      bridges.push(bridge);
      frame.programPosts(CATALOG);
      return bridge;
    }

    /** Restarts the simulator: the running simx module goes, and a new one starts over the same project and tokens. */
    function restartSimx(running: SimxBridge, tokens: BindingTokenStore): SimxBridge {
      running.dispose();
      return startSimx(tokens);
    }

    /**
     * Pairs a new editor with a new simx module over the spec's project and
     * resolves once the editor has reconciled, with the simx's token store.
     */
    async function pairReal(): Promise<{
      session: EditorSessionStore;
      brains: BrainsStore;
      bridge: SimxBridge;
      simxTokens: BindingTokenStore;
    }> {
      const simxTokens = openBindingTokenStore(() => new MemoryStorage());
      const bridge = startSimx(simxTokens);
      const joinCode = await eventually(
        () => bridge.joinCode,
        (code) => code !== undefined,
        "the simx's join code"
      );
      assert.ok(joinCode);
      const { session, brains } = editor();
      session.connect(joinCode);
      await brainsUntil(brains, (state) => state.reconciled, "the editor to reconcile");
      return { session, brains, bridge, simxTokens };
    }

    /** The project's brains module read back with the simx's own reader. */
    function registrations(): ReturnType<typeof readBrainsModule>["entries"] {
      const reading = readBrainsModule(host.file(BRAINS_MODULE_FILE) ?? "");
      assert.deepEqual(reading.problems, []);
      return reading.entries;
    }

    /** How many times the project's brains module has been written. */
    function moduleWrites(): number {
      return host.mutations.filter((mutation) => mutation === `write ${BRAINS_MODULE_FILE}`).length;
    }

    /** Adds a brain named `name` with a compiling rule to `brains`, returning its id. */
    function authorBrain(brains: BrainsStore, name: string): string {
      const id = brains.addBrain(name);
      const edited = brains.getBrain(id);
      assert.ok(edited);
      authorCompilingRule(brains.getSnapshot().environment, edited);
      brains.applyBrain(edited);
      return id;
    }

    /**
     * Resolves once the project holds every brain `brains` holds, in both
     * forms as the store holds them, and no source of a brain it does not.
     */
    async function saved(brains: BrainsStore, what: string): Promise<void> {
      await eventually(
        () => {
          const { brains: held } = brains.getSnapshot();
          const reading = readBrainsModule(host.file(BRAINS_MODULE_FILE) ?? "");
          const sources = host.listed.filter((name) => name.endsWith(".src.json")).length;
          return (
            sources === held.size &&
            [...held].every(
              ([id, entry]) =>
                host.file(`brains/${id}.src.json`) === entry.source &&
                reading.entries.get(id)?.sourceHash === entry.compiled?.sourceHash
            )
          );
        },
        (done) => done,
        what
      );
    }

    it("saves an authored brain in both forms, and a fresh editor session after a simulator restart pulls it back", async () => {
      const { session, brains, bridge, simxTokens } = await pairReal();

      const id = authorBrain(brains, "Chaser");
      await saved(brains, "the brain to be saved");
      const stored = brains.getSnapshot().brains.get(id);
      assert.ok(stored?.compiled);
      assert.equal(host.file(`brains/${id}.src.json`), stored.source);
      assert.deepEqual(registrations().get(id), {
        id,
        name: "Chaser",
        sourceHash: stored.sourceHash,
        bytecode: stored.compiled.bytecode,
      });
      session.stop();
      restartSimx(bridge, simxTokens);
      const fresh = editor();

      assert.equal(fresh.session.resume(), true);
      const pulled = await brainsUntil(
        fresh.brains,
        (state) => state.brains.has(id),
        "the fresh editor to pull the brain"
      );

      assert.equal(pulled.brains.get(id)?.source, stored.source);
      assert.deepEqual(pulled.brains.get(id)?.compiled?.bytecode, stored.compiled.bytecode);
      assert.equal(pulled.pending.size, 0);
      assert.equal(pulled.damaged.size, 0);
    });

    it("saves a re-edit of a saved brain in both forms, and a fresh editor session pulls the re-edit back", async () => {
      const { session, brains, bridge, simxTokens } = await pairReal();
      const id = authorBrain(brains, "Chaser");
      await saved(brains, "the first version to be saved");
      const first = brains.getSnapshot().brains.get(id);
      assert.ok(first?.compiled);

      reopenWithSecondRule(brains, id);
      await saved(brains, "the re-edit to be saved");

      const second = brains.getSnapshot().brains.get(id);
      assert.ok(second?.compiled);
      assert.notEqual(second.source, first.source);
      assert.equal(host.file(`brains/${id}.src.json`), second.source);
      assert.equal(registrations().get(id)?.sourceHash, second.sourceHash);
      assert.deepEqual(registrations().get(id)?.bytecode, second.compiled.bytecode);
      session.stop();
      restartSimx(bridge, simxTokens);
      const fresh = editor();

      assert.equal(fresh.session.resume(), true);
      const pulled = await brainsUntil(
        fresh.brains,
        (state) => state.reconciled && state.brains.has(id),
        "the fresh editor to pull the re-edit"
      );
      assert.equal(pulled.brains.get(id)?.source, second.source);
      assert.equal(pageRules(fresh.brains, id), 2);
      await delay(100);
      assert.equal(host.file(`brains/${id}.src.json`), second.source);
      assert.equal(registrations().get(id)?.sourceHash, second.sourceHash);
    });

    it("saves only the latest of two re-edits of a saved brain that reach one drain, acknowledging both", async () => {
      const { brains } = await pairReal();
      const id = authorBrain(brains, "Chaser");
      await saved(brains, "the first version to be saved");
      const mutationsBefore = host.mutations.length;
      host.hold();

      reopenWithSecondRule(brains, id);
      reopenWithSecondRule(brains, id);
      const latest = brains.getSnapshot().brains.get(id);
      assert.ok(latest?.compiled);
      host.release();
      await saved(brains, "the latest re-edit to be saved");

      assert.equal(host.file(`brains/${id}.src.json`), latest.source);
      assert.equal(pageRules(brains, id), 3);
      assert.equal(registrations().get(id)?.sourceHash, latest.sourceHash);
      assert.deepEqual(host.mutations.slice(mutationsBefore), [
        `write ${BRAINS_MODULE_FILE}`,
        `write brains/${id}.src.json`,
      ]);
      await brainsUntil(brains, (state) => state.pending.size === 0, "both pushes to be acknowledged");
    });

    it("removes a saved brain whose re-edit and removal reach one drain, in both forms", async () => {
      const { brains } = await pairReal();
      const kept = authorBrain(brains, "Kept");
      const id = authorBrain(brains, "Chaser");
      await saved(brains, "both brains to be saved");
      host.hold();

      reopenWithSecondRule(brains, id);
      brains.removeBrain(id);
      host.release();
      await saved(brains, "the removal to be saved");

      assert.equal(host.file(`brains/${id}.src.json`), undefined);
      assert.deepEqual([...registrations().keys()], [kept]);
      await brainsUntil(brains, (state) => state.pending.size === 0, "both pushes to be acknowledged");
    });

    it("keeps re-edits of a brain whose files are open in MakeCode's text editor through file switches", async () => {
      const { brains } = await pairReal();
      const id = authorBrain(brains, "Chaser");
      await saved(brains, "the first version to be saved");
      host.openInEditor(`brains/${id}.src.json`);

      reopenWithSecondRule(brains, id);
      await saved(brains, "the re-edit to be saved");
      host.openInEditor(BRAINS_MODULE_FILE);

      const second = brains.getSnapshot().brains.get(id);
      assert.ok(second);
      assert.equal(host.file(`brains/${id}.src.json`), second.source);

      reopenWithSecondRule(brains, id);
      await saved(brains, "the second re-edit to be saved");
      host.closeEditor();

      const third = brains.getSnapshot().brains.get(id);
      assert.ok(third);
      assert.equal(pageRules(brains, id), 3);
      assert.equal(host.file(`brains/${id}.src.json`), third.source);
      assert.equal(registrations().get(id)?.sourceHash, third.sourceHash);
    });

    it("saves an open source file's old text over a re-edit on a file switch when MakeCode does not reload it", async () => {
      host.reloadsOpenFile = false;
      const { brains } = await pairReal();
      const id = authorBrain(brains, "Chaser");
      await saved(brains, "the first version to be saved");
      const first = host.file(`brains/${id}.src.json`);
      host.openInEditor(`brains/${id}.src.json`);

      reopenWithSecondRule(brains, id);
      await saved(brains, "the re-edit to be saved");
      host.closeEditor();

      assert.equal(host.file(`brains/${id}.src.json`), first);
    });

    it("recompiles a source edited by hand in MakeCode and saves the fresh pair", async () => {
      const { brains, bridge, simxTokens } = await pairReal();
      const id = authorBrain(brains, "Chaser");
      await saved(brains, "the brain to be saved");
      const edited = editedOutOfBand({ id, name: "Chaser", source: host.file(`brains/${id}.src.json`) ?? "" });
      host.edit(`brains/${id}.src.json`, edited);

      restartSimx(bridge, simxTokens);
      await eventually(
        () => registrations().get(id)?.sourceHash,
        (hash) => hash === brainSourceHash(edited),
        "the recompiled pair to be saved"
      );

      assert.equal(host.file(`brains/${id}.src.json`), edited);
      assert.equal(brains.getSnapshot().brains.get(id)?.source, edited);
      const program = linkedBrainProgramFromBytes(
        stream.byteArrayFromUint8Array(registrations().get(id)?.bytecode ?? new Uint8Array()),
        {
          precision: MAKECODE_VM_PRECISION,
          typeRegistry: brains.getSnapshot().environment.brainServices.runtime.types,
        }
      );
      assert.equal(program.profileId, 2001);
    });

    it("lists a source mangled in MakeCode as damaged, and a Restore saves the held copy over it", async () => {
      const { brains, bridge, simxTokens } = await pairReal();
      const id = authorBrain(brains, "Chaser");
      await saved(brains, "the brain to be saved");
      const held = brains.getSnapshot().brains.get(id)?.source;
      host.edit(`brains/${id}.src.json`, "not json {");

      restartSimx(bridge, simxTokens);
      const damaged = await brainsUntil(
        brains,
        (state) => state.damaged.has(id) && state.reconciled,
        "the damage to be listed"
      );
      assert.equal(damaged.damaged.get(id)?.code, BRAIN_SOURCE_INVALID);
      assert.equal(damaged.damaged.get(id)?.name, "Chaser");
      assert.equal(host.file(`brains/${id}.src.json`), "not json {");
      brains.repushBrain(id);

      await brainsUntil(brains, (state) => state.damaged.size === 0, "the restore to clear the damage");
      assert.equal(host.file(`brains/${id}.src.json`), held);
    });

    it("serves the brains of an unreadable brains.g.ts without compiled forms, which a fresh editor session recompiles and saves", async () => {
      const { session, brains, bridge, simxTokens } = await pairReal();
      const first = authorBrain(brains, "Chaser");
      const second = authorBrain(brains, "Runner");
      await saved(brains, "both brains to be saved");
      host.edit(BRAINS_MODULE_FILE, "garbage");
      session.stop();

      restartSimx(bridge, simxTokens);
      const fresh = editor();
      assert.equal(fresh.session.resume(), true);

      await eventually(
        () => readBrainsModule(host.file(BRAINS_MODULE_FILE) ?? "").entries.size,
        (size) => size === 2,
        "the brains module to register both brains again"
      );
      assert.deepEqual([...registrations().keys()].sort(), [first, second].sort());
      assert.equal(fresh.brains.getSnapshot().damaged.size, 0);
    });

    it("heals a deleted brains.g.ts at a fresh editor session, registering every brain's recompiled form", async () => {
      const { session, brains, bridge, simxTokens } = await pairReal();
      const ids = [authorBrain(brains, "Chaser"), authorBrain(brains, "Runner")];
      await saved(brains, "both brains to be saved");
      host.remove(BRAINS_MODULE_FILE);
      session.stop();

      restartSimx(bridge, simxTokens);
      const fresh = editor();
      assert.equal(fresh.session.resume(), true);
      await brainsUntil(fresh.brains, (state) => state.reconciled && state.brains.size === 2, "the fresh editor");
      await saved(fresh.brains, "brains.g.ts to be regenerated");

      for (const id of ids) {
        const entry = fresh.brains.getSnapshot().brains.get(id);
        assert.ok(entry?.compiled);
        assert.deepEqual(registrations().get(id), {
          id,
          name: entry.name,
          sourceHash: entry.sourceHash,
          bytecode: entry.compiled.bytecode,
        });
      }
    });

    it("heals a deleted brains.g.ts at the same editor's next handshake, registering every brain's recompiled form", async () => {
      const { brains, bridge, simxTokens } = await pairReal();
      const ids = [authorBrain(brains, "Chaser"), authorBrain(brains, "Runner")];
      await saved(brains, "both brains to be saved");
      host.remove(BRAINS_MODULE_FILE);

      restartSimx(bridge, simxTokens);
      await saved(brains, "brains.g.ts to be regenerated");

      for (const id of ids) {
        const entry = brains.getSnapshot().brains.get(id);
        assert.ok(entry?.compiled);
        assert.equal(entry.compiled.sourceHash, entry.sourceHash);
        assert.deepEqual(registrations().get(id), {
          id,
          name: entry.name,
          sourceHash: entry.sourceHash,
          bytecode: entry.compiled.bytecode,
        });
        const program = linkedBrainProgramFromBytes(stream.byteArrayFromUint8Array(entry.compiled.bytecode), {
          precision: MAKECODE_VM_PRECISION,
          typeRegistry: brains.getSnapshot().environment.brainServices.runtime.types,
        });
        assert.equal(program.profileId, 2001);
      }
      await brainsUntil(brains, (state) => state.pending.size === 0, "nothing pending");
    });

    it("heals a malformed and a stale registration at the next handshake, leaving another brain's files untouched", async () => {
      const { brains, bridge, simxTokens } = await pairReal();
      const kept = authorBrain(brains, "Kept");
      const malformed = authorBrain(brains, "Malformed");
      const stale = authorBrain(brains, "Stale");
      await saved(brains, "the brains to be saved");
      const keptRegistration = registrations().get(kept);
      const staleHash = brains.getSnapshot().brains.get(stale)?.sourceHash;
      const text = host.file(BRAINS_MODULE_FILE) ?? "";
      host.edit(
        BRAINS_MODULE_FILE,
        text
          .replace(`"${malformed}", "Malformed", hex\``, `"${malformed}", Malformed, hex\``)
          .replace(`// source-hash ${staleHash}`, "// source-hash 00000000")
      );
      const mutationsBefore = host.mutations.length;

      restartSimx(bridge, simxTokens);
      await saved(brains, "both damaged registrations to be healed");

      assert.deepEqual(registrations().get(kept), keptRegistration);
      assert.equal(registrations().get(stale)?.sourceHash, staleHash);
      assert.ok(!host.mutations.slice(mutationsBefore).includes(`write brains/${kept}.src.json`));
    });

    it("saves a burst of edits made while disconnected with fewer brains.g.ts writes than pushes", async () => {
      const { session, brains } = await pairReal();
      session.stop();
      await sessionUntil(session, (state) => state.status === "disconnected", "the editor to disconnect");
      const ids = ["A", "B", "C", "D", "E"].map((name) => authorBrain(brains, name));
      const writesBefore = moduleWrites();

      session.reconnect();
      await brainsUntil(brains, (state) => state.reconciled && state.pending.size === 0, "the burst to be pushed");
      await saved(brains, "the burst to be saved");

      assert.deepEqual([...registrations().keys()].sort(), [...ids].sort());
      for (const id of ids)
        assert.equal(host.file(`brains/${id}.src.json`), brains.getSnapshot().brains.get(id)?.source);
      assert.ok(moduleWrites() - writesBefore < ids.length);
    });

    it("saves a burst of edits over MakeCode's write rate completely, with no push failing", async () => {
      const { session, brains } = await pairReal();
      session.stop();
      await sessionUntil(session, (state) => state.status === "disconnected", "the editor to disconnect");
      const ids = Array.from({ length: PROJFS_RATE_LIMIT + 5 }, (_, index) => authorBrain(brains, `B${index}`));

      session.reconnect();
      await eventually(
        () => host.mutations.length,
        (count) => count >= PROJFS_RATE_LIMIT,
        "MakeCode to apply the writes its rate allows"
      );
      await delay(100);
      assert.ok(brains.getSnapshot().pending.size > 0);
      host.now += PROJFS_RATE_WINDOW_MS;
      await saved(brains, "the whole burst to be saved");
      await brainsUntil(brains, (state) => state.pending.size === 0, "every push to be acknowledged");

      assert.deepEqual([...registrations().keys()].sort(), [...ids].sort());
    });

    it("leaves part of the same burst pending when MakeCode refuses writes over its rate", async () => {
      host.defersOverRate = false;
      const { session, brains } = await pairReal();
      session.stop();
      await sessionUntil(session, (state) => state.status === "disconnected", "the editor to disconnect");
      Array.from({ length: PROJFS_RATE_LIMIT + 5 }, (_, index) => authorBrain(brains, `B${index}`));

      session.reconnect();
      await brainsUntil(brains, (state) => state.reconciled, "the editor to reconcile");
      await delay(200);

      assert.ok(brains.getSnapshot().pending.size > 0);
      assert.ok(host.listed.filter((name) => name.endsWith(".src.json")).length < PROJFS_RATE_LIMIT + 5);
    });

    it("keeps an edit pending while MakeCode refuses the save, and saves it once a later handshake can", async () => {
      const { brains, bridge, simxTokens } = await pairReal();
      host.edit(FILLER, "x".repeat(PROJFS_SCOPE_QUOTA_BYTES));

      const id = authorBrain(brains, "Chaser");
      await delay(100);
      assert.deepEqual([...brains.getSnapshot().pending], [id]);
      assert.equal(host.file(`brains/${id}.src.json`), undefined);
      host.remove(FILLER);
      restartSimx(bridge, simxTokens);

      await brainsUntil(brains, (state) => state.reconciled && state.pending.size === 0, "the pend to be pushed");
      await saved(brains, "the pend to be saved");
      assert.ok(registrations().has(id));
    });

    it("saves an edit MakeCode refused once the refusal has passed, by retrying over the same handshake", async () => {
      const { session, brains } = await pairReal();
      let handshakes = 0;
      session.onBrainsChannel(() => {
        handshakes += 1;
      });
      host.edit(FILLER, "x".repeat(PROJFS_SCOPE_QUOTA_BYTES));

      const id = authorBrain(brains, "Chaser");
      await delay(100);
      assert.deepEqual([...brains.getSnapshot().pending], [id]);
      host.remove(FILLER);

      await brainsUntil(brains, (state) => state.pending.size === 0, "the retry to land");
      await saved(brains, "the refused edit to be saved");
      assert.ok(registrations().has(id));
      assert.equal(handshakes, 0);
    });

    it("keeps two brains apart through interleaved edits: a rename and a removal both land", async () => {
      const { brains } = await pairReal();
      const kept = authorBrain(brains, "Kept");
      const removed = authorBrain(brains, "Removed");
      await saved(brains, "both brains to be saved");

      brains.renameBrain(kept, "Renamed");
      brains.removeBrain(removed);
      await saved(brains, "both edits to be saved");

      assert.equal(host.file(`brains/${removed}.src.json`), undefined);
      assert.deepEqual([...registrations().keys()], [kept]);
      assert.equal(registrations().get(kept)?.name, "Renamed");
      assert.equal(JSON.parse(host.file(`brains/${kept}.src.json`) ?? "{}").name, "Renamed");
    });

    it("pairs afresh when the MakeCode tab opens another project, never carrying the first project's brains into it", async () => {
      const storage = new MemoryStorage();
      const firstTokens = openBindingTokenStore(() => storage, "project-a");
      const firstSimx = startSimx(firstTokens);
      const joinCode = await eventually(
        () => firstSimx.joinCode,
        (code) => code !== undefined,
        "the first project's join code"
      );
      assert.ok(joinCode);
      const { session, brains } = editor();
      session.connect(joinCode);
      await brainsUntil(brains, (state) => state.reconciled, "the editor to reconcile");
      authorBrain(brains, "Chaser");
      await saved(brains, "the brain to be saved");
      const other = new FakeProjfsHost();

      firstSimx.dispose();
      const otherSimx = startSimx(
        openBindingTokenStore(() => storage, "project-b"),
        other
      );
      await eventually(
        () => otherSimx.joinCode,
        (code) => code !== undefined,
        "the other project's own join code"
      );
      await delay(100);

      assert.equal(otherSimx.bound, false);
      assert.equal(session.getSnapshot().status, "disconnected");
      assert.deepEqual(other.mutations, []);
    });
  });
});
