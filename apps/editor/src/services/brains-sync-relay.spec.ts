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
import type { MakeCodeBrainsRequestMessage, MakeCodeWireBrain } from "@wendoo/makecode-session";
import {
  brainSourceHash,
  MAKECODE_SESSION_PROTOCOL_VERSION,
  MAKECODE_SESSION_ROLE_PATHS,
} from "@wendoo/makecode-session";
import { openBindingTokenStore, type TokenStorage } from "../../../../makecode/simx/bridge/src/binding-token-store.js";
import { SIM_CHANNEL_VERSION, SIMX_CHANNEL, type SimxFrame } from "../../../../makecode/simx/bridge/src/sim-channel.js";
import { type SimxBridge, type SimxLog, startSimxBridge } from "../../../../makecode/simx/bridge/src/simx-bridge.js";
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

const NEWER_CATALOG = '{"packs":[{"name":"motion","tiles":[]}]}';

/** How long a wait in these specs lasts before it fails, in milliseconds. */
const WAIT_MS = 2000;

/** A brains request the scripted simx received. */
type ReceivedRequest = MakeCodeBrainsRequestMessage;

/**
 * A simx played by the spec over a raw relay connection: it opens a makecode
 * handshake on every welcome and answers the editor's brains requests from
 * its in-memory project -- or, while held, queues the answers until
 * released. It records every brains request it receives.
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
  private _running = true;

  private constructor(peer: ScriptedPeer, project: Map<string, MakeCodeWireBrain>) {
    this._peer = peer;
    this.project = project;
  }

  /**
   * Connects at the simx role path over `project`, presenting `bindingToken`
   * when given, and resolves with the simx and the join code the relay
   * answered with, if it answered with one.
   */
  static async open(
    relay: TestRelay,
    project: Map<string, MakeCodeWireBrain>,
    bindingToken?: string
  ): Promise<{ simx: ScriptedSimx; joinCode: string | undefined }> {
    const peer = await relay.connect(MAKECODE_SESSION_ROLE_PATHS.simx);
    const simx = new ScriptedSimx(peer, project);
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
            brains: [...this.project.values()].map((brain) => ({
              id: brain.id,
              name: brain.name,
              sourceHash: brainSourceHash(brain.source),
            })),
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

  /** Opens a scripted simx over `project`, stopped by the spec's cleanup. */
  async function openSimx(
    project: Map<string, MakeCodeWireBrain>,
    bindingToken?: string
  ): Promise<{ simx: ScriptedSimx; joinCode: string | undefined }> {
    const opened = await ScriptedSimx.open(relay, project, bindingToken);
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

  describe("with the landed simx module", () => {
    it("stays connected and keeps serving catalogs while the editor's brains requests go unanswered, keeping edits pending", async () => {
      const frame = new FakeFrame();
      const bridge = startSimxBridge({
        frame,
        bridgeUrl: relay.address,
        tokens: openBindingTokenStore(() => new MemoryStorage()),
        log: silentLog,
      });
      bridges.push(bridge);
      const joinCode = await eventually(
        () => bridge.joinCode,
        (code) => code !== undefined,
        "the simx's join code"
      );
      assert.ok(joinCode);
      frame.programPosts(CATALOG);
      const { session, brains } = editor();

      session.connect(joinCode);
      await sessionUntil(
        session,
        (state) => state.status === "connected" && state.catalogText === CATALOG,
        "the session to form and deliver the catalog"
      );
      const id = brains.addBrain("Chaser");
      frame.programPosts(NEWER_CATALOG);
      await sessionUntil(session, (state) => state.catalogText === NEWER_CATALOG, "the newer catalog");

      assert.equal(bridge.counterpartConnected, true);
      assert.equal(session.getSnapshot().status, "connected");
      assert.deepEqual([...brains.getSnapshot().pending], [id]);
    });
  });
});
