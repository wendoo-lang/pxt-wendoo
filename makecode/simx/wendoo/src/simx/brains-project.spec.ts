import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { stream } from "@wendoo/core";
import type { WendooEnvironment } from "@wendoo/core/app";
import { BrainDef, CoreHostActions, mkActuatorTileId, mkSensorTileId } from "@wendoo/core/app";
import { ParseDiagCode } from "@wendoo/core/brain/compiler";
import type { BrainPageDef, BrainRuleDef } from "@wendoo/core/brain/model";
import { linkedBrainProgramFromBytes } from "@wendoo/core/runtime";
import {
  brainSourceHash,
  type MakeCodeBrainSummary,
  MakeCodeBrainsErrorCode,
  type MakeCodeBrainsOpenRefusalCode,
  type MakeCodeIdManifest,
  type MakeCodeManifestReading,
  type MakeCodeWireBrain,
  type MakeCodeWireBrainPush,
  type MakeCodeWireCompileOutcome,
} from "@wendoo/makecode-session";
import { buildAuthoringEnvironment, MAKECODE_VM_PRECISION } from "../authoring/authoring-environment.js";
import { serializeBrainSource } from "../authoring/brain-source.js";
import { type ProjfsClient, ProjfsError } from "../vendor/projfs.js";
import { BrainEngine } from "./brain-engine.js";
import {
  BRAINS_MODULE_FILE,
  BRAINS_MODULE_FORMAT,
  type CompiledBrainEntry,
  readBrainsModule,
  writeBrainsModule,
} from "./brains-module.js";
import { type BrainOpening, BrainsProject, BrainsProjectProblemCode, brainSourceFile } from "./brains-project.js";
import { LivePrograms } from "./live-programs.js";
import type { ProjectFiles } from "./project-files.js";
import type { ProgramUpdate } from "./sim-channel.js";
import type { SimxLog } from "./simx-bridge.js";
import {
  FakeProjfsHost,
  PROJFS_RATE_LIMIT,
  PROJFS_RATE_WINDOW_MS,
  PROJFS_SCOPE_QUOTA_BYTES,
} from "./test-support/projfs-host.js";

/** How one request was answered: replied, failed, or refused because the requesting tab is not the brain's origin. */
type Answer<T> = { ok: true; value: T } | { ok: false; message: string; refused?: true };

/** A log recording every line written to it, by level. */
class RecordingLog implements SimxLog {
  readonly infos: string[] = [];
  readonly errors: string[] = [];

  info(message: string): void {
    this.infos.push(message);
  }

  error(message: string): void {
    this.errors.push(message);
  }
}

/** Resolves once `condition` holds, polling every millisecond. */
async function until(condition: () => boolean): Promise<void> {
  while (!condition()) await delay(1);
}

/** Resolves after `ms` milliseconds. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The source text of an empty brain document `id` named `name`, as the editor pretty-prints it. */
function sourceOf(id: string, name: string): string {
  return JSON.stringify({ version: 1, id, name, pages: [] }, null, 2);
}

/** A write of the empty brain `id` named `name`. */
function writeOf(id: string, name: string, source = sourceOf(id, name)): MakeCodeWireBrainPush {
  return { op: "write", brain: { id, name, source } };
}

/** The first rule of `definition`'s first page. */
function firstRule(definition: BrainDef): BrainRuleDef {
  return (definition.pages().get(0) as BrainPageDef).children().get(0) as BrainRuleDef;
}

/** The tile `tileId` from `environment`'s catalogs. Throws when none holds it. */
function tile(environment: WendooEnvironment, tileId: string) {
  for (const catalog of environment.tileCatalogs()) {
    const found = catalog.get(tileId);
    if (found) return found;
  }
  throw new Error(`no tile ${tileId}`);
}

/**
 * The source of the brain `id` named `name`, authored by `author` in an
 * environment binding `catalog` under `ids`, core-only when omitted.
 */
function authored(
  id: string,
  name: string,
  author: (environment: WendooEnvironment, rule: BrainRuleDef) => void,
  catalog?: string,
  ids?: MakeCodeIdManifest
): string {
  const { environment } = buildAuthoringEnvironment(catalog, ids);
  const definition = BrainDef.emptyBrainDef(environment.brainServices, name);
  author(environment, firstRule(definition));
  return serializeBrainSource(definition).replace(/"id": "[^"]+"/, `"id": "${id}"`);
}

/** The source of the brain `id` whose rule reads `WHEN on page entered DO restart page`. */
function restartingSource(id: string, name: string): string {
  return authored(id, name, (environment, rule) => {
    rule.when().appendTile(tile(environment, mkSensorTileId(CoreHostActions.OnPageEntered.key)));
    rule.do().appendTile(tile(environment, mkActuatorTileId(CoreHostActions.RestartPage.key)));
  });
}

/** The source of the brain `id` placing an actuator on its WHEN side: a placement the compiler rejects. */
function misplacedSource(id: string, name: string): string {
  return authored(id, name, (environment, rule) => {
    rule.when().appendTile(tile(environment, mkActuatorTileId(CoreHostActions.SwitchPage.key)));
  });
}

/** A catalog whose one pack declares the ring tile. */
const CHIME_CATALOG = JSON.stringify({
  packs: [{ name: "chime", tiles: [{ name: "actuator.chime.ring", kind: "actuator" }] }],
});

/** The ring tile's id. */
const RING_TILE = mkActuatorTileId("actuator.chime.ring");

/** The allocation of {@link CHIME_CATALOG} in a project holding no manifest. */
const CHIME_IDS: MakeCodeIdManifest = {
  actions: [{ name: "actuator.chime.ring", id: 1024 }],
  operators: [],
  types: [],
  next: { action: 1025, operator: 1024, atom: 1024 },
};

/** {@link CHIME_IDS} with the ring tile allocated another id. */
const RENUMBERED_IDS: MakeCodeIdManifest = {
  actions: [{ name: "actuator.chime.ring", id: 1030 }],
  operators: [],
  types: [],
  next: { action: 1031, operator: 1024, atom: 1024 },
};

/** The source of the brain `id` whose rule reads `WHEN on page entered DO ring`, authored binding {@link CHIME_CATALOG}. */
function ringingSource(id: string, name: string): string {
  return authored(
    id,
    name,
    (environment, rule) => {
      rule.when().appendTile(tile(environment, mkSensorTileId(CoreHostActions.OnPageEntered.key)));
      rule.do().appendTile(tile(environment, RING_TILE));
    },
    CHIME_CATALOG,
    CHIME_IDS
  );
}

/** The manifest reading holding `ids`. */
function readingOf(ids: MakeCodeIdManifest): MakeCodeManifestReading {
  return { manifest: structuredClone(ids) };
}

const CHASER = "chaserchaserchas";
const RUNNER = "runnerrunnerrunn";

/** The key of the tab the spec's requests come from unless one names another. */
const TAB = "wendoo-lang/pxt-wendoo/makecode/extensions/arcade";

/** The key of a second tab talking to the frame. */
const OTHER_TAB = "wendoo-lang/pxt-daydream";

/** The origin fields of a brain {@link TAB} created, while the frame knows no tab's label. */
const ORIGIN_OF_TAB = { origin: TAB, originLabel: null };

describe("brains project", () => {
  let host: FakeProjfsHost;
  let client: ProjfsClient;
  let log: RecordingLog;
  let posted: ProgramUpdate[];
  let project: BrainsProject;
  let projects: BrainsProject[];

  /** A new project over `files`, posting live into {@link posted}, disposed by the spec's cleanup. */
  function open(files: ProjectFiles = client, timings = { retryDelayMs: 5, maxRetryDelayMs: 20 }): BrainsProject {
    const opened = new BrainsProject(
      files,
      log,
      new LivePrograms((update) => {
        posted.push(update);
      }),
      timings
    );
    projects.push(opened);
    return opened;
  }

  beforeEach(() => {
    host = new FakeProjfsHost();
    client = host.client();
    log = new RecordingLog();
    posted = [];
    projects = [];
    project = open();
  });

  afterEach(() => {
    for (const opened of projects) opened.dispose();
    client.dispose();
  });

  /** Asks `on` for its list and resolves with the answer. */
  function list(on: BrainsProject = project): Promise<Answer<MakeCodeBrainSummary[]>> {
    return new Promise((resolve) => {
      on.serve(TAB, {
        kind: "list",
        reply: (brains) => resolve({ ok: true, value: [...brains] }),
        fail: (message) => resolve({ ok: false, message }),
      });
    });
  }

  /** Asks `on` for the brains `ids` and resolves with the answer. */
  function pull(ids: string[], on: BrainsProject = project): Promise<Answer<MakeCodeWireBrain[]>> {
    return new Promise((resolve) => {
      on.serve(TAB, {
        kind: "pull",
        ids,
        reply: (brains) => resolve({ ok: true, value: [...brains] }),
        fail: (message) => resolve({ ok: false, message }),
      });
    });
  }

  /** Asks `on` to apply `change` from the tab `peer`, `null` for a port naming none, and resolves with the answer. */
  function push(
    change: MakeCodeWireBrainPush,
    on: BrainsProject = project,
    peer: string | null = TAB
  ): Promise<Answer<MakeCodeWireCompileOutcome | null>> {
    return new Promise((resolve) => {
      on.serve(peer, {
        kind: "push",
        push: change,
        reply: (outcome) => resolve({ ok: true, value: outcome }),
        fail: (message) => resolve({ ok: false, message }),
        refuse: (message) => resolve({ ok: false, message, refused: true }),
      });
    });
  }

  /** Asks `on` to create a brain named `name` from the tab `peer`, `null` for a port naming none, and resolves with the answer. */
  function create(
    name: string,
    on: BrainsProject = project,
    peer: string | null = TAB
  ): Promise<Answer<MakeCodeBrainSummary>> {
    return new Promise((resolve) => {
      on.serve(peer, {
        kind: "create",
        name,
        reply: (brain) => resolve({ ok: true, value: brain }),
        fail: (message) => resolve({ ok: false, message }),
      });
    });
  }

  /** Pushes `change`, asserts the project applied it, and resolves with its outcome. */
  async function applied(change: MakeCodeWireBrainPush): Promise<MakeCodeWireCompileOutcome | null> {
    const answer = await push(change);
    assert.ok(answer.ok, answer.ok ? "" : answer.message);
    return answer.value;
  }

  /** The entries the project's brains module registers, read with the module's own reader. */
  function registered(): ReturnType<typeof readBrainsModule>["entries"] {
    const text = host.file(BRAINS_MODULE_FILE);
    assert.ok(text !== undefined, "no brains module");
    const reading = readBrainsModule(text);
    assert.deepEqual(reading.problems, []);
    return reading.entries;
  }

  /** How many times the brains module was written. */
  function moduleWrites(): number {
    return host.mutations.filter((mutation) => mutation === `write ${BRAINS_MODULE_FILE}`).length;
  }

  /** Resolves once every drain `on` has queued has landed. */
  async function drained(on: BrainsProject = project): Promise<void> {
    await on.current();
    await delay(5);
    await host.settled();
    await delay(5);
  }

  describe("push", () => {
    it("compiles a pushed source, writes it verbatim and registers its program, then replies with the outcome", async () => {
      const source = restartingSource(CHASER, "Chaser");

      const outcome = await applied(writeOf(CHASER, "Chaser", source));

      assert.deepEqual(outcome, {
        sourceHash: brainSourceHash(source),
        compiled: { sourceHash: brainSourceHash(source) },
        diagnostics: [],
        unresolvedTiles: [],
      });
      assert.equal(host.file(`brains/${CHASER}.src.json`), source);
      const entry = registered().get(CHASER);
      assert.equal(entry?.name, "Chaser");
      assert.equal(entry?.sourceHash, brainSourceHash(source));
      const decoded = linkedBrainProgramFromBytes(stream.byteArrayFromUint8Array(entry?.bytecode ?? new Uint8Array()), {
        precision: MAKECODE_VM_PRECISION,
        typeRegistry: buildAuthoringEnvironment(undefined).environment.brainServices.runtime.types,
      });
      assert.equal(decoded.profileId, 2001);
    });

    it("replies to a source that fails to compile with its error codes, keeping the brain's last good registration", async () => {
      const good = restartingSource(CHASER, "Chaser");
      await applied(writeOf(CHASER, "Chaser", good));
      const lastGood = registered().get(CHASER);
      const broken = misplacedSource(CHASER, "Chaser");

      const outcome = await applied(writeOf(CHASER, "Chaser", broken));

      assert.equal(outcome?.sourceHash, brainSourceHash(broken));
      assert.deepEqual(outcome?.compiled, { sourceHash: brainSourceHash(good) });
      assert.ok(outcome?.diagnostics.some((diagnostic) => diagnostic.code === ParseDiagCode.TilePlacementSideMismatch));
      assert.equal(host.file(`brains/${CHASER}.src.json`), broken);
      assert.deepEqual(registered().get(CHASER), lastGood);
    });

    it("replies to a first source that fails to compile with no registration, registering nothing", async () => {
      const broken = misplacedSource(CHASER, "Chaser");

      const outcome = await applied(writeOf(CHASER, "Chaser", broken));

      assert.equal(outcome?.compiled, null);
      assert.equal(registered().has(CHASER), false);
      assert.deepEqual(await list(), {
        ok: true,
        value: [
          {
            id: CHASER,
            name: "Chaser",
            sourceHash: brainSourceHash(broken),
            compiledSourceHash: null,
            ...ORIGIN_OF_TAB,
          },
        ],
      });
    });

    it("replies to a source placing tiles no catalog binds with its unresolved tiles, keeping the last good registration", async () => {
      const good = sourceOf(CHASER, "Ringer");
      await applied(writeOf(CHASER, "Ringer", good));
      const ringing = ringingSource(CHASER, "Ringer");

      const outcome = await applied(writeOf(CHASER, "Ringer", ringing));

      assert.deepEqual(outcome?.unresolvedTiles, [RING_TILE]);
      assert.deepEqual(outcome?.compiled, { sourceHash: brainSourceHash(good) });
      assert.equal(registered().get(CHASER)?.sourceHash, brainSourceHash(good));
    });

    it("keeps every other brain's registration when it writes one", async () => {
      await applied(writeOf(CHASER, "Chaser"));
      await applied(writeOf(RUNNER, "Runner"));
      await applied(writeOf(CHASER, "Chaser renamed"));

      assert.deepEqual([...registered().keys()].sort(), [CHASER, RUNNER]);
      assert.equal(registered().get(CHASER)?.name, "Chaser renamed");
      assert.equal(registered().get(RUNNER)?.name, "Runner");
    });

    it("removes a brain in both forms, replying null, and replies null removing one the project does not hold", async () => {
      await applied(writeOf(CHASER, "Chaser"));
      await applied(writeOf(RUNNER, "Runner"));

      assert.equal(await applied({ op: "remove", brainId: CHASER }), null);
      assert.equal(await applied({ op: "remove", brainId: "absentabsentabse" }), null);

      assert.equal(host.file(`brains/${CHASER}.src.json`), undefined);
      assert.deepEqual([...registered().keys()], [RUNNER]);
    });

    it("stores a pushed text that is not a brain document, replying with no diagnostic and keeping its registration", async () => {
      await applied(writeOf(CHASER, "Chaser"));
      const lastGood = registered().get(CHASER);

      const outcome = await applied(writeOf(CHASER, "Chaser", "not json {"));

      assert.deepEqual(outcome, {
        sourceHash: brainSourceHash("not json {"),
        compiled: { sourceHash: brainSourceHash(sourceOf(CHASER, "Chaser")) },
        diagnostics: [],
        unresolvedTiles: [],
      });
      assert.equal(host.file(`brains/${CHASER}.src.json`), "not json {");
      assert.deepEqual(registered().get(CHASER), lastGood);
    });

    it("keeps the registration of a brain whose compile throws, logging its code once per source", async () => {
      await applied(writeOf(CHASER, "Chaser"));
      const lastGood = registered().get(CHASER);
      const throwing = mock.method(BrainEngine.prototype, "compile", () => {
        throw new Error("encoder failed");
      });
      try {
        const outcome = await applied(writeOf(CHASER, "Renamed"));
        await applied(writeOf(CHASER, "Renamed"));

        assert.deepEqual(outcome, {
          sourceHash: brainSourceHash(sourceOf(CHASER, "Renamed")),
          compiled: { sourceHash: lastGood?.sourceHash },
          diagnostics: [],
          unresolvedTiles: [],
        });
      } finally {
        throwing.mock.restore();
      }

      assert.equal(registered().get(CHASER)?.bytecode.length, lastGood?.bytecode.length);
      assert.equal(registered().get(CHASER)?.sourceHash, lastGood?.sourceHash);
      assert.equal(log.errors.filter((line) => line.startsWith(BrainsProjectProblemCode.COMPILE_THREW)).length, 1);
      assert.equal(host.file(`brains/${CHASER}.src.json`), sourceOf(CHASER, "Renamed"));
    });

    it("writes artifacts only: no write or delete is flagged as a user edit", async () => {
      const options: unknown[] = [];
      const recording = open({
        list: () => client.list(),
        read: (name) => client.read(name),
        write: (name, content, writeOptions) => {
          options.push(writeOptions);
          return client.write(name, content, writeOptions);
        },
        delete: (name, deleteOptions) => {
          options.push(deleteOptions);
          return client.delete(name, deleteOptions);
        },
        subscribe: (onChange) => client.subscribe(onChange),
      });

      await push(writeOf(CHASER, "Chaser"), recording);
      await push({ op: "remove", brainId: CHASER }, recording);

      assert.equal(options.length, 4);
      assert.ok(options.every((written) => written === undefined));
    });
  });

  describe("create", () => {
    it("creates an empty brain under a minted id, writing its source and registration, and replies with its summary", async () => {
      const answer = await create("Chaser");

      assert.ok(answer.ok);
      const { id, name, sourceHash, compiledSourceHash } = answer.value;
      assert.equal(id.length, 16);
      assert.equal(name, "Chaser");
      const source = host.file(`brains/${id}.src.json`);
      assert.ok(source !== undefined);
      assert.equal(JSON.parse(source).id, id);
      assert.equal(JSON.parse(source).name, "Chaser");
      assert.equal(JSON.parse(source).pages.length, 1);
      assert.equal(sourceHash, brainSourceHash(source));
      assert.equal(compiledSourceHash, sourceHash);
      assert.equal(registered().get(id)?.sourceHash, sourceHash);
    });

    it("mints a distinct id for each create, two of one name included", async () => {
      const answers = await Promise.all([create("Chaser"), create("Chaser")]);

      const ids = answers.map((answer) => (answer.ok ? answer.value.id : ""));
      assert.equal(new Set(ids).size, 2);
      assert.deepEqual([...registered().keys()].sort(), [...ids].sort());
      assert.equal(moduleWrites(), 1);
    });

    it("fails a create whose source the project refuses, the refusal's code leading the message", async () => {
      await project.current();
      host.edit("filler.bin", "x".repeat(PROJFS_SCOPE_QUOTA_BYTES));

      const answer = await create("Chaser");

      assert.equal(answer.ok, false);
      assert.match(answer.ok ? "" : answer.message, /^QUOTA_EXCEEDED\b/);
    });
  });

  describe("rebuild", () => {
    it("registers a pack brain once a catalog binding its pack arrives, writing the module once and posting it live", async () => {
      const ringing = ringingSource(CHASER, "Ringer");
      const outcome = await applied(writeOf(CHASER, "Ringer", ringing));
      assert.equal(outcome?.compiled, null);
      const writes = moduleWrites();

      project.adoptCatalog(CHIME_CATALOG, readingOf(CHIME_IDS));
      await drained();

      assert.equal(registered().get(CHASER)?.sourceHash, brainSourceHash(ringing));
      assert.equal(moduleWrites(), writes + 1);
      assert.deepEqual(
        posted.map((update) => [update.documentId, update.sourceHash]),
        [[CHASER, brainSourceHash(ringing)]]
      );
    });

    it("rewrites the module with a pack brain's new program when the manifest renumbers its tile", async () => {
      project.adoptCatalog(CHIME_CATALOG, readingOf(CHIME_IDS));
      await applied(writeOf(CHASER, "Ringer", ringingSource(CHASER, "Ringer")));
      const before = registered().get(CHASER);

      project.adoptManifest(readingOf(RENUMBERED_IDS));
      await drained();

      const after = registered().get(CHASER);
      assert.equal(after?.sourceHash, before?.sourceHash);
      assert.notDeepEqual(after?.bytecode, before?.bytecode);
      assert.equal(posted.length, 2);
    });

    it("recompiles on a new asset snapshot, writing nothing when no registration changes", async () => {
      await applied(writeOf(CHASER, "Chaser", restartingSource(CHASER, "Chaser")));
      const mutations = host.mutations.length;

      project.adoptAssets([{ kind: "image", id: "img1" }]);
      await drained();

      assert.equal(host.mutations.length, mutations);
      assert.equal(posted.length, 1);
    });

    it("keeps a pack brain's last good registration when a catalog without its pack arrives", async () => {
      project.adoptCatalog(CHIME_CATALOG, readingOf(CHIME_IDS));
      await applied(writeOf(CHASER, "Ringer", ringingSource(CHASER, "Ringer")));
      const before = registered().get(CHASER);
      const writes = moduleWrites();

      project.adoptCatalog('{"packs":[]}', readingOf(CHIME_IDS));
      await drained();

      assert.deepEqual(registered().get(CHASER), before);
      assert.equal(moduleWrites(), writes);
    });

    it("recompiles a queued push in the rebuilt environment before writing it", async () => {
      await project.current();
      const ringing = ringingSource(CHASER, "Ringer");
      host.hold();
      const answer = push(writeOf(CHASER, "Ringer", ringing));
      await delay(5);
      project.adoptCatalog(CHIME_CATALOG, readingOf(CHIME_IDS));
      host.release();

      assert.ok((await answer).ok);
      await drained();
      assert.equal(registered().get(CHASER)?.sourceHash, brainSourceHash(ringing));
    });
  });

  describe("healing at start", () => {
    /** The registration a compile of `source`, the brain `id` named `name`, makes in a core-only environment. */
    function registrationOf(id: string, name: string, source: string): Promise<CompiledBrainEntry> {
      const scratch = new FakeProjfsHost();
      const scratchClient = scratch.client();
      const scratchProject = new BrainsProject(scratchClient, new RecordingLog(), new LivePrograms(() => {}));
      return new Promise((resolve, reject) => {
        scratchProject.serve(TAB, {
          kind: "push",
          push: writeOf(id, name, source),
          reply: () => {
            const entry = readBrainsModule(scratch.file(BRAINS_MODULE_FILE) ?? "").entries.get(id);
            scratchProject.dispose();
            scratchClient.dispose();
            if (entry === undefined) reject(new Error(`no registration of ${id}`));
            else resolve(entry);
          },
          fail: (message) => reject(new Error(message)),
          refuse: (message) => reject(new Error(message)),
        });
      });
    }

    /** Seeds the project with the sources `brains` holds and the module `module`, then opens a fresh project over it. */
    async function reopened(brains: Record<string, string>, module?: string): Promise<BrainsProject> {
      for (const [id, source] of Object.entries(brains)) host.edit(`brains/${id}.src.json`, source);
      if (module !== undefined) host.edit(BRAINS_MODULE_FILE, module);
      const mutations = host.mutations.length;
      const fresh = open();
      await drained(fresh);
      host.mutations.splice(0, mutations);
      return fresh;
    }

    it("registers a brain whose registration is missing, rewriting the module and posting it live", async () => {
      const runner = await registrationOf(RUNNER, "Runner", sourceOf(RUNNER, "Runner"));
      await reopened(
        { [CHASER]: sourceOf(CHASER, "Chaser"), [RUNNER]: sourceOf(RUNNER, "Runner") },
        writeBrainsModule([runner])
      );

      assert.deepEqual([...registered().keys()].sort(), [CHASER, RUNNER]);
      assert.deepEqual(
        posted.map((update) => update.documentId),
        [CHASER]
      );
    });

    it("registers every brain of a deleted brains module", async () => {
      await reopened({ [CHASER]: sourceOf(CHASER, "Chaser"), [RUNNER]: sourceOf(RUNNER, "Runner") });

      assert.deepEqual([...registered().keys()].sort(), [CHASER, RUNNER]);
      assert.equal(moduleWrites(), 1);
    });

    it("re-registers a brain whose registration was compiled from another source", async () => {
      const stale = await registrationOf(CHASER, "Chaser", sourceOf(CHASER, "Chaser"));
      const edited = restartingSource(CHASER, "Chaser");

      await reopened({ [CHASER]: edited }, writeBrainsModule([stale]));

      assert.equal(registered().get(CHASER)?.sourceHash, brainSourceHash(edited));
    });

    it("heals a malformed registration, logging its code and leaving another brain's source untouched", async () => {
      const chaser = await registrationOf(CHASER, "Chaser", sourceOf(CHASER, "Chaser"));
      const runner = await registrationOf(RUNNER, "Runner", sourceOf(RUNNER, "Runner"));
      const text = writeBrainsModule([chaser, runner]);

      await reopened(
        { [CHASER]: sourceOf(CHASER, "Chaser"), [RUNNER]: sourceOf(RUNNER, "Runner") },
        text.replace(`"${RUNNER}", "Runner", hex\``, `"${RUNNER}", Runner, hex\``)
      );

      assert.deepEqual(registered().get(RUNNER), { ...runner, origin: null });
      assert.deepEqual(registered().get(CHASER), chaser);
      assert.ok(log.errors.some((line) => line.startsWith("BRAINS_MODULE_ENTRY_MALFORMED")));
      assert.ok(!host.mutations.includes(`write brains/${CHASER}.src.json`));
    });

    it("rewrites an unreadable brains module from the brain sources, logging its code", async () => {
      await reopened({ [CHASER]: sourceOf(CHASER, "Chaser") }, "garbage");

      assert.deepEqual([...registered().keys()], [CHASER]);
      assert.ok(log.errors.some((line) => line.startsWith("BRAINS_MODULE_UNREADABLE")));
    });

    it("drops the registration of a brain whose source is gone", async () => {
      const chaser = await registrationOf(CHASER, "Chaser", sourceOf(CHASER, "Chaser"));
      const runner = await registrationOf(RUNNER, "Runner", sourceOf(RUNNER, "Runner"));

      await reopened({ [RUNNER]: sourceOf(RUNNER, "Runner") }, writeBrainsModule([chaser, runner]));

      assert.deepEqual([...registered().keys()], [RUNNER]);
    });

    it("writes nothing for a project whose registrations are current, posting nothing", async () => {
      const chaser = await registrationOf(CHASER, "Chaser", sourceOf(CHASER, "Chaser"));

      await reopened({ [CHASER]: sourceOf(CHASER, "Chaser") }, writeBrainsModule([chaser]));

      assert.deepEqual(host.mutations, []);
      assert.deepEqual(posted, []);
    });

    it("leaves a pack brain unregistered until a catalog binding its pack arrives", async () => {
      const fresh = await reopened({ [CHASER]: ringingSource(CHASER, "Ringer") });
      assert.equal(host.file(BRAINS_MODULE_FILE), undefined);

      fresh.adoptCatalog(CHIME_CATALOG, readingOf(CHIME_IDS));
      await drained(fresh);

      assert.deepEqual([...registered().keys()], [CHASER]);
    });

    it("retries a refused heal write at the retry waits until it lands", async () => {
      host.edit("filler.bin", "x".repeat(PROJFS_SCOPE_QUOTA_BYTES));
      await reopened({ [CHASER]: sourceOf(CHASER, "Chaser") });
      assert.ok(log.errors.some((line) => line.startsWith("QUOTA_EXCEEDED")));
      assert.equal(host.file(BRAINS_MODULE_FILE), undefined);

      host.remove("filler.bin");
      await until(() => host.file(BRAINS_MODULE_FILE) !== undefined);

      assert.deepEqual([...registered().keys()], [CHASER]);
    });
  });

  describe("a brains module of a newer format", () => {
    it("is left as it is: sources served with no registration, pushes and creates failing by its code", async () => {
      const newer = writeBrainsModule([]).replace(
        `wendoo-brains-format ${BRAINS_MODULE_FORMAT}`,
        `wendoo-brains-format ${BRAINS_MODULE_FORMAT + 1}`
      );
      host.edit(BRAINS_MODULE_FILE, newer);
      host.edit(`brains/${CHASER}.src.json`, sourceOf(CHASER, "Chaser"));
      const fresh = open();

      const listed = await list(fresh);
      const pushed = await push(writeOf(CHASER, "Chaser"), fresh);
      const created = await create("Runner", fresh);

      assert.deepEqual(listed.ok && listed.value.map((brain) => brain.compiledSourceHash), [null]);
      for (const answer of [pushed, created]) {
        assert.equal(answer.ok, false);
        assert.match(answer.ok ? "" : answer.message, /^BRAINS_MODULE_FORMAT_NEWER\b/);
      }
      assert.equal(host.file(BRAINS_MODULE_FILE), newer);
      assert.ok(log.errors.some((line) => line.startsWith("BRAINS_MODULE_FORMAT_NEWER")));
      assert.deepEqual(posted, []);
    });
  });

  describe("coalescing", () => {
    it("writes the brains module once for a burst of pushes, replying to each push", async () => {
      await project.current();
      const ids = ["aaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbb", "cccccccccccccccc", "dddddddddddddddd"];

      const answers = await Promise.all(ids.map((id) => push(writeOf(id, id))));

      assert.ok(answers.every((answer) => answer.ok));
      assert.equal(moduleWrites(), 1);
      assert.equal(host.mutations.length, ids.length + 1);
      assert.deepEqual([...registered().keys()].sort(), ids);
    });

    it("writes the pushes that arrive while a drain writes in the next drain, writing the module once more", async () => {
      let release: () => void = () => {};
      const released = new Promise<void>((resolve) => {
        release = resolve;
      });
      let gated = true;
      const gatedProject = open({
        list: () => client.list(),
        read: (name) => client.read(name),
        write: async (name, content, options) => {
          if (gated) {
            gated = false;
            await released;
          }
          return client.write(name, content, options);
        },
        delete: (name, options) => client.delete(name, options),
        subscribe: (onChange) => client.subscribe(onChange),
      });
      const answers = [push(writeOf(CHASER, "Chaser"), gatedProject)];
      await until(() => !gated);
      answers.push(
        push(writeOf(RUNNER, "Runner"), gatedProject),
        push({ op: "remove", brainId: CHASER }, gatedProject)
      );
      release();

      for (const answer of await Promise.all(answers)) assert.ok(answer.ok);
      assert.deepEqual([...registered().keys()], [RUNNER]);
      assert.equal(moduleWrites(), 2);
    });

    it("leaves the brains module unwritten when a drain changes no registration", async () => {
      await applied(writeOf(CHASER, "Chaser"));
      const before = host.mutations.length;

      await applied(writeOf(CHASER, "Chaser"));

      assert.deepEqual(host.mutations.slice(before), [`write brains/${CHASER}.src.json`]);
    });

    it("writes one brain's source once for two pushes of it in one drain, the later winning, and replies to both", async () => {
      await project.current();

      const answers = await Promise.all([push(writeOf(CHASER, "First")), push(writeOf(CHASER, "Second"))]);

      assert.ok(answers.every((answer) => answer.ok));
      assert.equal(host.file(`brains/${CHASER}.src.json`), sourceOf(CHASER, "Second"));
      assert.equal(registered().get(CHASER)?.name, "Second");
      assert.deepEqual(host.mutations, [`write ${BRAINS_MODULE_FILE}`, `write brains/${CHASER}.src.json`]);
    });

    it("announces the brains after each drain that lands anything", async () => {
      const announced: MakeCodeBrainSummary[][] = [];
      project.onChange((brains) => {
        announced.push(brains);
      });

      await applied(writeOf(CHASER, "Chaser"));
      await drained();
      await applied(writeOf(RUNNER, "Runner"));
      await drained();
      await applied({ op: "remove", brainId: CHASER });
      await drained();

      assert.deepEqual(
        announced.map((brains) => brains.map((brain) => brain.id)),
        [[CHASER], [CHASER, RUNNER], [RUNNER]]
      );
    });
  });

  describe("refusals", () => {
    it("fails a push whose brains module the folder's quota refuses, carrying QUOTA_EXCEEDED, writing nothing", async () => {
      await project.current();
      host.edit("filler.bin", "x".repeat(PROJFS_SCOPE_QUOTA_BYTES));
      const mutations = host.mutations.length;

      const answer = await push(writeOf(CHASER, "Chaser"));

      assert.equal(answer.ok, false);
      assert.match(answer.ok ? "" : answer.message, /^QUOTA_EXCEEDED\b/);
      assert.equal(host.mutations.length, mutations);
    });

    it("retries reading the project while no project is open in MakeCode, serving once one is", async () => {
      host.open = false;
      const fresh = open();
      const listed = list(fresh);
      await until(() => log.errors.some((line) => line.startsWith("PROJECT_CLOSED")));

      host.open = true;

      assert.deepEqual(await listed, { ok: true, value: [] });
    });
  });

  describe("MakeCode's rate", () => {
    /** Writes of empty brains with distinct ids, `count` of them. */
    function writes(count: number): MakeCodeWireBrainPush[] {
      return Array.from({ length: count }, (_, index) =>
        writeOf(`brain${String(index).padStart(11, "0")}`, `B${index}`)
      );
    }

    it("saves a drain of the brains module and more sources than the rate allows completely, replying to every push", async () => {
      await project.current();
      const pushed = writes(PROJFS_RATE_LIMIT + 5);
      let answered = 0;
      const answers = pushed.map((change) =>
        push(change).then((answer) => {
          answered += 1;
          return answer;
        })
      );
      await until(() => host.mutations.length === PROJFS_RATE_LIMIT && answered === PROJFS_RATE_LIMIT - 1);
      assert.equal(host.heldOnWindow, 1);

      host.now += PROJFS_RATE_WINDOW_MS;

      for (const answer of await Promise.all(answers)) assert.ok(answer.ok);
      assert.equal(host.mutations.length, pushed.length + 1);
      assert.equal(registered().size, pushed.length);
      assert.deepEqual(log.errors, []);
    });

    it("loses the pushes over the rate when MakeCode refuses writes over it", async () => {
      await project.current();
      host.defersOverRate = false;

      const answers = await Promise.all(writes(PROJFS_RATE_LIMIT + 5).map((change) => push(change)));

      const refused = answers.filter((answer) => !answer.ok);
      assert.equal(refused.length, 6);
      for (const answer of refused) assert.match(answer.ok ? "" : answer.message, /^RATE_LIMITED\b/);
    });

    it("replies to a push only once its own source has landed when the rate holds part of a drain", async () => {
      await project.current();
      host.spendMutations(PROJFS_RATE_LIMIT - 2);

      const chaser = push(writeOf(CHASER, "Chaser"));
      const runner = push(writeOf(RUNNER, "Runner"));
      let runnerAnswered = false;
      void runner.then(() => {
        runnerAnswered = true;
      });
      assert.ok((await chaser).ok);
      await until(() => host.heldOnWindow === 1);
      assert.equal(host.file(`brains/${RUNNER}.src.json`), undefined);
      assert.equal(runnerAnswered, false);
      host.now += PROJFS_RATE_WINDOW_MS;

      assert.ok((await runner).ok);
      assert.equal(host.file(`brains/${RUNNER}.src.json`), sourceOf(RUNNER, "Runner"));
    });
  });

  describe("project switches", () => {
    it("fails the pushes of a drain MakeCode holds when another project opens, writing nothing into it", async () => {
      await project.current();
      host.spendMutations(PROJFS_RATE_LIMIT);
      const answers = Promise.all([push(writeOf(CHASER, "Chaser")), push(writeOf(RUNNER, "Runner"))]);
      await until(() => host.heldOnWindow === 1);

      host.switchProject();
      host.now += PROJFS_RATE_WINDOW_MS;

      for (const answer of await answers) {
        assert.equal(answer.ok, false);
        assert.match(answer.ok ? "" : answer.message, /^PROJECT_CLOSED\b/);
      }
      assert.deepEqual([...host.stored.keys()], []);
      assert.deepEqual(host.mutations, []);
    });

    it("writes a held drain into the next project when MakeCode applies requests to whichever project is open", async () => {
      await project.current();
      host.bindsRequestsToProject = false;
      host.spendMutations(PROJFS_RATE_LIMIT);
      const answer = push(writeOf(CHASER, "Chaser"));
      await until(() => host.heldOnWindow === 1);

      host.switchProject();
      host.now += PROJFS_RATE_WINDOW_MS;

      assert.ok((await answer).ok);
      assert.equal(host.file(`brains/${CHASER}.src.json`), sourceOf(CHASER, "Chaser"));
    });
  });

  describe("unregistered frames", () => {
    it("serves nothing to a frame MakeCode does not serve, logging UNREGISTERED and asking no more", async () => {
      host.registered = false;
      let answered = false;

      void push(writeOf(CHASER, "Chaser")).then(() => {
        answered = true;
      });
      await until(() => log.errors.some((line) => line.startsWith("UNREGISTERED")));
      const logged = log.errors.length;
      await delay(50);

      assert.equal(answered, false);
      assert.equal(log.errors.length, logged);
    });

    it("leaves every request unanswered when MakeCode drops an unserved frame's requests", async () => {
      host.registered = false;
      host.answersUnregistered = false;
      const fresh = open();
      let answered = false;

      void list(fresh).then(() => {
        answered = true;
      });
      await delay(50);

      assert.equal(answered, false);
    });
  });

  describe("late replies", () => {
    it("replies to a push whose writes MakeCode answers long after the client reports them slow", async () => {
      const slow: string[] = [];
      const slowClient = host.client({ slowReplyMs: 5, onSlowReply: (request) => slow.push(request.subtype) });
      host.hold();
      const fresh = open(slowClient);
      let answered = false;
      const answer = push(writeOf(CHASER, "Chaser"), fresh).then((result) => {
        answered = true;
        return result;
      });
      await delay(40);
      assert.equal(answered, false);
      assert.deepEqual(slow, ["list"]);

      host.release();

      assert.ok((await answer).ok);
      assert.equal(host.file(`brains/${CHASER}.src.json`), sourceOf(CHASER, "Chaser"));
      assert.deepEqual(log.errors, []);
      slowClient.dispose();
    });
  });

  describe("MakeCode's text editor showing a source", () => {
    it("keeps a saved push over typing made in the source just before it", async () => {
      await applied(writeOf(CHASER, "Chaser"));
      host.openInEditor(`brains/${CHASER}.src.json`);
      host.reloadDelayMs = 40;

      host.typeInEditor("typed before the push", 20);
      await applied(writeOf(CHASER, "Renamed"));
      await delay(60);

      assert.equal(host.file(`brains/${CHASER}.src.json`), sourceOf(CHASER, "Renamed"));
    });

    it("loses the push to the typing when MakeCode answers before its editor reloads and saves typing meanwhile", async () => {
      host.holdsSavesDuringReload = false;
      await applied(writeOf(CHASER, "Chaser"));
      host.openInEditor(`brains/${CHASER}.src.json`);
      host.reloadDelayMs = 40;

      host.typeInEditor("typed before the push", 20);
      await applied(writeOf(CHASER, "Renamed"));
      await delay(60);

      assert.equal(host.file(`brains/${CHASER}.src.json`), "typed before the push");
    });

    it("saves typing made after the editor reloads a push, over the push", async () => {
      await applied(writeOf(CHASER, "Chaser"));
      host.openInEditor(`brains/${CHASER}.src.json`);
      host.reloadDelayMs = 20;

      await applied(writeOf(CHASER, "Renamed"));
      host.typeInEditor("typed after the push", 10);
      await delay(30);

      assert.equal(host.file(`brains/${CHASER}.src.json`), "typed after the push");
    });
  });

  describe("origin", () => {
    /** The text of the brains module's annotation line for the brain `id`, its indent removed. */
    function annotation(id: string): string | undefined {
      const lines = (host.file(BRAINS_MODULE_FILE) ?? "").split("\n");
      const declaration = lines.findIndex((line) => line.includes(`registerCompiledBrain("${id}"`));
      return declaration > 0 ? lines[declaration - 1].trim() : undefined;
    }

    /** The NOT_ORIGIN lines the log holds. */
    function refusals(): string[] {
      return log.errors.filter((line) => line.startsWith(MakeCodeBrainsErrorCode.NOT_ORIGIN));
    }

    it("stamps a created brain with the requesting tab's key, in its summary and its registration", async () => {
      const created = await create("Runner", project, OTHER_TAB);
      assert.ok(created.ok);
      await drained();

      assert.equal(created.value.origin, OTHER_TAB);
      assert.equal(registered().get(created.value.id)?.origin, OTHER_TAB);
      assert.ok(annotation(created.value.id)?.endsWith(` editor="simx:${OTHER_TAB}"`));
      const listed = await list();
      assert.deepEqual(listed.ok && listed.value.map((brain) => brain.origin), [OTHER_TAB]);
    });

    it("applies a write, a rename and a removal from the brain's origin tab", async () => {
      const created = await create("Runner", project, OTHER_TAB);
      assert.ok(created.ok);
      const { id } = created.value;

      const written = await push(writeOf(id, "Runner", restartingSource(id, "Runner")), project, OTHER_TAB);
      const renamed = await push(writeOf(id, "Sprinter"), project, OTHER_TAB);
      await drained();
      const origin = registered().get(id)?.origin;
      const removed = await push({ op: "remove", brainId: id }, project, OTHER_TAB);

      assert.deepEqual([written.ok, renamed.ok, removed.ok], [true, true, true]);
      assert.equal(origin, OTHER_TAB);
      assert.deepEqual(refusals(), []);
    });

    it("refuses a write, a rename and a removal from another tab with NOT_ORIGIN, logged once per brain and tab", async () => {
      const created = await create("Runner", project, OTHER_TAB);
      assert.ok(created.ok);
      const { id } = created.value;
      await drained();
      const mutations = host.mutations.length;
      const module = host.file(BRAINS_MODULE_FILE);

      const answers = [
        await push(writeOf(id, "Runner", restartingSource(id, "Runner"))),
        await push(writeOf(id, "Renamed")),
        await push({ op: "remove", brainId: id }),
      ];
      const created2 = await create("Chaser", project, OTHER_TAB);
      assert.ok(created2.ok);
      const other = await push({ op: "remove", brainId: created2.value.id });
      await drained();

      assert.deepEqual(
        [...answers, other].map((answer) => !answer.ok && answer.refused === true),
        [true, true, true, true]
      );
      for (const answer of answers) assert.match(answer.ok ? "" : answer.message, /^MAKECODE_BRAINS_NOT_ORIGIN\b/);
      assert.equal(refusals().length, 2);
      assert.ok(refusals()[0].includes(id));
      assert.ok(refusals()[1].includes(created2.value.id));
      assert.equal(host.file(`brains/${id}.src.json`) !== undefined, true);
      assert.ok(!host.mutations.slice(mutations).includes(`write brains/${id}.src.json`));
      assert.ok(module !== undefined && host.file(BRAINS_MODULE_FILE)?.includes(`registerCompiledBrain("${id}"`));
      assert.deepEqual(
        posted.filter((update) => update.documentId === id && update.bytecode.length === 0),
        []
      );
    });

    it("refuses a write of a brain whose create from another tab is queued behind a landing drain", async () => {
      const release = host.holdReply(`write ${BRAINS_MODULE_FILE}`);
      const landing = push(writeOf(RUNNER, "Runner"));
      await until(() => host.mutations.includes(`write ${BRAINS_MODULE_FILE}`));
      const before = new Set(posted.map((update) => update.documentId));
      const creating = create("Chaser", project, OTHER_TAB);
      await until(() => posted.some((update) => !before.has(update.documentId) && update.documentId !== RUNNER));
      const id = posted.find((update) => !before.has(update.documentId) && update.documentId !== RUNNER)?.documentId;
      assert.ok(id !== undefined);

      const refused = await push(writeOf(id, "Chaser"));
      release();
      assert.ok((await landing).ok);
      assert.ok((await creating).ok);
      await drained();

      assert.equal(!refused.ok && refused.refused, true);
      assert.equal(registered().get(id)?.origin, OTHER_TAB);
    });

    it("refuses another tab's write while the origin's removal is queued, the removal landing", async () => {
      const created = await create("Runner", project, OTHER_TAB);
      assert.ok(created.ok);
      const { id } = created.value;
      await drained();
      const release = host.holdReply(`write ${BRAINS_MODULE_FILE}`);
      const landing = push(writeOf(RUNNER, "Runner"));
      await until(() => host.mutations.includes(`write ${BRAINS_MODULE_FILE}`));

      const removing = push({ op: "remove", brainId: id }, project, OTHER_TAB);
      const refused = await push(writeOf(id, "Taken"));
      release();
      const removed = await removing;
      assert.ok((await landing).ok);
      await drained();

      assert.equal(!refused.ok && refused.refused, true);
      assert.ok(removed.ok);
      assert.equal(host.file(brainSourceFile(id)), undefined);
      assert.equal(registered().has(id), false);
    });

    it("refuses another tab's write while the origin's removal lands, and lets it make the brain anew once deleted", async () => {
      const created = await create("Runner", project, OTHER_TAB);
      assert.ok(created.ok);
      const { id } = created.value;
      await drained();
      const release = host.holdReply(`delete ${brainSourceFile(id)}`);

      const removing = push({ op: "remove", brainId: id }, project, OTHER_TAB);
      await until(() => host.mutations.includes(`delete ${brainSourceFile(id)}`));
      const refused = await push(writeOf(id, "Taken"));
      release();
      assert.ok((await removing).ok);
      const remade = await push(writeOf(id, "Taken"));
      await drained();

      assert.equal(!refused.ok && refused.refused, true);
      assert.ok(remade.ok);
      assert.equal(registered().get(id)?.origin, TAB);
    });

    it("claims a brain with no origin for the first of two tabs pushing it in one drain, refusing the second", async () => {
      host.edit(`brains/${CHASER}.src.json`, sourceOf(CHASER, "Chaser"));
      const fresh = open();
      await drained(fresh);

      const [first, second] = await Promise.all([
        push(writeOf(CHASER, "First"), fresh, TAB),
        push(writeOf(CHASER, "Second"), fresh, OTHER_TAB),
      ]);
      await drained(fresh);

      assert.ok(first.ok);
      assert.equal(!second.ok && second.refused, true);
      assert.equal(registered().get(CHASER)?.origin, TAB);
      assert.equal(registered().get(CHASER)?.name, "First");
    });

    it("adopts the origin a module hand edit names, refusing the old origin's push and taking the new one's", async () => {
      await applied(writeOf(CHASER, "Chaser"));
      await drained();
      const edited = (host.file(BRAINS_MODULE_FILE) ?? "").replace(
        `editor="simx:${TAB}"`,
        `editor="simx:${OTHER_TAB}"`
      );
      host.edit(BRAINS_MODULE_FILE, edited);

      project.reported([BRAINS_MODULE_FILE]);
      await drained();
      const listed = await list();
      const old = await push(writeOf(CHASER, "Chaser", restartingSource(CHASER, "Chaser")));
      const taken = await push(writeOf(CHASER, "Chaser", restartingSource(CHASER, "Chaser")), project, OTHER_TAB);

      assert.deepEqual(listed.ok && listed.value.map((brain) => brain.origin), [OTHER_TAB]);
      assert.equal(!old.ok && old.refused, true);
      assert.ok(taken.ok);
    });

    it("keeps the origin a module hand edit names when a source hand edit read with it queues a recompile", async () => {
      await applied(writeOf(CHASER, "Chaser"));
      await drained();
      const recompiled = restartingSource(CHASER, "Chaser");
      host.edit(`brains/${CHASER}.src.json`, recompiled);
      host.edit(
        BRAINS_MODULE_FILE,
        (host.file(BRAINS_MODULE_FILE) ?? "").replace(`editor="simx:${TAB}"`, `editor="simx:${OTHER_TAB}"`)
      );

      project.rescan();
      await until(() => registered().get(CHASER)?.sourceHash === brainSourceHash(recompiled));
      await drained();

      assert.equal(registered().get(CHASER)?.origin, OTHER_TAB);
      const listed = await list();
      assert.deepEqual(listed.ok && listed.value.map((brain) => brain.origin), [OTHER_TAB]);
    });

    it("takes the origin the module records for a source added by hand with it, recompiling it under that origin", async () => {
      const created = await create("Runner", project, OTHER_TAB);
      assert.ok(created.ok);
      const { id } = created.value;
      await drained();
      const module = host.file(BRAINS_MODULE_FILE) ?? "";
      const source = host.file(brainSourceFile(id)) ?? "";
      await push({ op: "remove", brainId: id }, project, OTHER_TAB);
      await drained();
      host.edit(brainSourceFile(id), source.replace('"Runner"', '"Renamed"'));
      host.edit(BRAINS_MODULE_FILE, module);

      project.rescan();
      await until(() => registered().get(id)?.name === "Renamed");
      await drained();

      assert.equal(registered().get(id)?.origin, OTHER_TAB);
      const listed = await list();
      assert.deepEqual(listed.ok && listed.value.map((brain) => brain.origin), [OTHER_TAB]);
    });

    it("stamps no origin for a session whose port named no key, and refuses it nothing", async () => {
      const unnamed = await create("Runner", project, null);
      assert.ok(unnamed.ok);
      const owned = await create("Chaser", project, OTHER_TAB);
      assert.ok(owned.ok);
      await drained();

      const written = await push(
        writeOf(owned.value.id, "Chaser", restartingSource(owned.value.id, "Chaser")),
        project,
        null
      );
      const legacy = await push(writeOf(unnamed.value.id, "Runner"), project, null);
      await drained();

      assert.equal(unnamed.value.origin, null);
      assert.ok(written.ok);
      assert.ok(legacy.ok);
      assert.equal(registered().get(owned.value.id)?.origin, OTHER_TAB);
      assert.equal(registered().get(unnamed.value.id)?.origin, null);
      assert.deepEqual(refusals(), []);
    });

    it("refuses a write of a brain whose create from another tab is still landing", async () => {
      const release = host.holdReply(`write ${BRAINS_MODULE_FILE}`);
      const creating = create("Runner", project, OTHER_TAB);
      await until(() => host.mutations.includes(`write ${BRAINS_MODULE_FILE}`));
      const id = [...readBrainsModule(host.file(BRAINS_MODULE_FILE) ?? "").entries.keys()][0];

      const refused = await push(writeOf(id, "Runner"));
      release();
      assert.ok((await creating).ok);

      assert.equal(!refused.ok && refused.refused, true);
    });

    it("stamps a brain made before origins were recorded with its first pusher's key, then refuses another tab", async () => {
      host.edit(`brains/${CHASER}.src.json`, sourceOf(CHASER, "Chaser"));
      const fresh = open();
      await drained(fresh);
      const before = await list(fresh);

      const claimed = await push(writeOf(CHASER, "Chaser"), fresh, OTHER_TAB);
      await drained(fresh);
      const refused = await push(writeOf(CHASER, "Chaser", restartingSource(CHASER, "Chaser")), fresh);

      assert.deepEqual(before.ok && before.value.map((brain) => brain.origin), [null]);
      assert.ok(claimed.ok);
      assert.equal(registered().get(CHASER)?.origin, OTHER_TAB);
      assert.equal(!refused.ok && refused.refused, true);
      const listed = await list(fresh);
      assert.deepEqual(listed.ok && listed.value.map((brain) => brain.origin), [OTHER_TAB]);
    });

    it("rewrites a format 1 module at format 2 on its next write, its brains read with no origin", async () => {
      const chaser = sourceOf(CHASER, "Chaser");
      await applied(writeOf(CHASER, "Chaser", chaser));
      await drained();
      const legacy = writeBrainsModule([...registered().values()].map((entry) => ({ ...entry, origin: null }))).replace(
        `wendoo-brains-format ${BRAINS_MODULE_FORMAT}`,
        "wendoo-brains-format 1"
      );
      host.edit(BRAINS_MODULE_FILE, legacy);
      const fresh = open();
      await drained(fresh);
      const listed = await list(fresh);

      await push(writeOf(RUNNER, "Runner"), fresh);
      await drained(fresh);

      assert.deepEqual(listed.ok && listed.value.map((brain) => brain.origin), [null]);
      assert.equal(readBrainsModule(host.file(BRAINS_MODULE_FILE) ?? "").format, BRAINS_MODULE_FORMAT);
      assert.deepEqual(
        [...registered().values()].map((entry) => [entry.id, entry.origin]),
        [
          [CHASER, null],
          [RUNNER, TAB],
        ]
      );
    });

    it("serves a fresh instance over the same project each brain's origin as the last one wrote it", async () => {
      const created = await create("Runner", project, OTHER_TAB);
      assert.ok(created.ok);
      await applied(writeOf(CHASER, "Chaser"));
      await drained();

      const fresh = open();
      const listed = await list(fresh);
      const pulled = await pull([CHASER, created.value.id], fresh);

      assert.deepEqual(listed.ok && Object.fromEntries(listed.value.map((brain) => [brain.id, brain.origin])), {
        [CHASER]: TAB,
        [created.value.id]: OTHER_TAB,
      });
      assert.deepEqual(pulled.ok && pulled.value.map((brain) => brain.origin), [TAB, OTHER_TAB]);
    });

    it("labels each origin by the tab MakeCode lists for its key, null until the tabs arrive or for a key not listed", async () => {
      await applied(writeOf(CHASER, "Chaser"));
      const created = await create("Runner", project, OTHER_TAB);
      assert.ok(created.ok);
      await drained();
      const before = await list();
      const announced: MakeCodeBrainSummary[][] = [];
      project.onChange((brains) => {
        announced.push(brains);
      });

      project.adoptTabs([{ key: TAB, label: "Wendoo" }]);
      project.adoptTabs([{ key: TAB, label: "Wendoo" }]);
      const pulled = await pull([CHASER, created.value.id]);
      project.adoptTabs([
        { key: TAB, label: "Wendoo" },
        { key: OTHER_TAB, label: "Daydream" },
      ]);

      const labels = (brains: readonly { id: string; originLabel: string | null }[]) =>
        Object.fromEntries(brains.map((brain) => [brain.id, brain.originLabel]));
      assert.deepEqual(before.ok && labels(before.value), { [CHASER]: null, [created.value.id]: null });
      assert.deepEqual(
        announced.map((brains) => labels(brains)),
        [
          { [CHASER]: "Wendoo", [created.value.id]: null },
          { [CHASER]: "Wendoo", [created.value.id]: "Daydream" },
        ]
      );
      assert.deepEqual(pulled.ok && labels(pulled.value), { [CHASER]: "Wendoo", [created.value.id]: null });
    });

    it("announces nothing for the tabs before the project's brains are read", async () => {
      const fresh = open();
      const announced: MakeCodeBrainSummary[][] = [];
      fresh.onChange((brains) => {
        announced.push(brains);
      });

      fresh.adoptTabs([{ key: TAB, label: "Wendoo" }]);
      await drained(fresh);

      assert.deepEqual(announced, []);
    });
  });

  describe("open", () => {
    /** Asks `on` to open the brain `id` from the tab `peer`, `null` for a port naming none, and resolves with the answer. */
    function opened(
      id: string,
      peer: string | null = TAB,
      on: BrainsProject = project
    ): Promise<{ ok: true } | { ok: false; code: MakeCodeBrainsOpenRefusalCode }> {
      return new Promise((resolve) => {
        on.serve(peer, {
          kind: "open",
          id,
          reply: () => resolve({ ok: true }),
          refuseUnknown: () => resolve({ ok: false, code: MakeCodeBrainsErrorCode.UNKNOWN_BRAIN }),
          refuseAbsent: () => resolve({ ok: false, code: MakeCodeBrainsErrorCode.ORIGIN_ABSENT }),
        });
      });
    }

    /** The openings `on` announces from now on, in order. */
    function openings(on: BrainsProject = project): BrainOpening[] {
      const announced: BrainOpening[] = [];
      on.onOpen((opening) => {
        announced.push(opening);
      });
      return announced;
    }

    it("acknowledges an open of a brain whose origin MakeCode lists, announcing it for the origin's tab", async () => {
      const created = await create("Runner", project, OTHER_TAB);
      assert.ok(created.ok);
      await drained();
      project.adoptTabs([
        { key: TAB, label: "Wendoo" },
        { key: OTHER_TAB, label: "Daydream" },
      ]);
      const announced = openings();

      const answer = await opened(created.value.id, TAB);

      assert.deepEqual(answer, { ok: true });
      assert.deepEqual(announced, [{ id: created.value.id, origin: OTHER_TAB, peer: TAB }]);
      assert.deepEqual(log.errors, []);
    });

    it("announces an open of a brain with no origin for the requesting tab, whatever tabs MakeCode lists", async () => {
      const created = await create("Runner", project, null);
      assert.ok(created.ok);
      await drained();
      const announced = openings();

      const answer = await opened(created.value.id, OTHER_TAB);

      assert.deepEqual(answer, { ok: true });
      assert.deepEqual(announced, [{ id: created.value.id, origin: null, peer: OTHER_TAB }]);
    });

    it("refuses an open of a brain whose origin MakeCode does not list with ORIGIN_ABSENT, logged by its code", async () => {
      const created = await create("Runner", project, OTHER_TAB);
      assert.ok(created.ok);
      await drained();
      const announced = openings();

      const unlisted = await opened(created.value.id, TAB);
      project.adoptTabs([{ key: TAB, label: "Wendoo" }]);
      const absent = await opened(created.value.id, TAB);

      assert.deepEqual(unlisted, { ok: false, code: MakeCodeBrainsErrorCode.ORIGIN_ABSENT });
      assert.deepEqual(absent, { ok: false, code: MakeCodeBrainsErrorCode.ORIGIN_ABSENT });
      assert.deepEqual(announced, []);
      assert.equal(log.errors.filter((line) => line.startsWith(MakeCodeBrainsErrorCode.ORIGIN_ABSENT)).length, 2);
    });

    it("refuses an open of a brain the project does not hold with UNKNOWN_BRAIN, logged by its code", async () => {
      await applied(writeOf(CHASER, "Chaser"));
      await drained();
      await applied({ op: "remove", brainId: CHASER });
      await drained();
      const announced = openings();

      const removed = await opened(CHASER);
      const never = await opened(RUNNER);

      assert.deepEqual(removed, { ok: false, code: MakeCodeBrainsErrorCode.UNKNOWN_BRAIN });
      assert.deepEqual(never, { ok: false, code: MakeCodeBrainsErrorCode.UNKNOWN_BRAIN });
      assert.deepEqual(announced, []);
      assert.equal(log.errors.filter((line) => line.startsWith(MakeCodeBrainsErrorCode.UNKNOWN_BRAIN)).length, 2);
    });
  });

  describe("list and pull", () => {
    it("lists each brain source in brains/ read at start by id, with its name, its hash and its registration's", async () => {
      host.edit(`brains/${CHASER}.src.json`, sourceOf(CHASER, "Chaser"));
      host.edit("notes.txt", "not a brain");
      host.edit("brains/nested/inner.src.json", sourceOf("inner", "Inner"));
      host.edit("brains/stray.json", "{}");
      const fresh = open();
      await drained(fresh);

      const listed = await list(fresh);

      const hash = brainSourceHash(sourceOf(CHASER, "Chaser"));
      assert.deepEqual(listed, {
        ok: true,
        value: [
          { id: CHASER, name: "Chaser", sourceHash: hash, compiledSourceHash: hash, origin: null, originLabel: null },
        ],
      });
    });

    it("lists nothing for a project holding no brains", async () => {
      assert.deepEqual(await list(), { ok: true, value: [] });
    });

    it("pulls the requested brains in request order with their compiled source hashes, leaving out absent ids", async () => {
      const broken = misplacedSource(RUNNER, "Runner");
      await applied(writeOf(CHASER, "Chaser"));
      await applied(writeOf(RUNNER, "Runner", broken));

      const pulled = await pull([RUNNER, "absentabsentabse", CHASER]);

      assert.deepEqual(pulled, {
        ok: true,
        value: [
          { id: RUNNER, name: "Runner", source: broken, compiledSourceHash: null, ...ORIGIN_OF_TAB },
          {
            id: CHASER,
            name: "Chaser",
            source: sourceOf(CHASER, "Chaser"),
            compiledSourceHash: brainSourceHash(sourceOf(CHASER, "Chaser")),
            ...ORIGIN_OF_TAB,
          },
        ],
      });
    });

    it("serves a fresh instance over the same project exactly what the last one wrote", async () => {
      await applied(writeOf(CHASER, "Chaser"));
      await applied(writeOf(RUNNER, "Runner"));
      const written = await list();

      const fresh = open();

      assert.deepEqual(await list(fresh), written);
      assert.deepEqual(await pull([CHASER], fresh), await pull([CHASER]));
    });

    it("lists and pulls a hand-mangled source verbatim, named from its registration, keeping the registration", async () => {
      await applied(writeOf(CHASER, "Chaser"));
      const registration = registered().get(CHASER);
      host.edit(`brains/${CHASER}.src.json`, "not json {");
      const fresh = open();

      const listed = await list(fresh);
      const pulled = await pull([CHASER], fresh);

      assert.deepEqual(listed.ok && listed.value.map((brain) => [brain.name, brain.sourceHash]), [
        ["Chaser", brainSourceHash("not json {")],
      ]);
      assert.deepEqual(pulled.ok && pulled.value.map((brain) => brain.source), ["not json {"]);
      await drained(fresh);
      assert.deepEqual(registered().get(CHASER), registration);
    });

    it("names a mangled source it holds no registration of with an empty name", async () => {
      host.edit(`brains/${CHASER}.src.json`, '{"name": 42');
      const fresh = open();

      const listed = await list(fresh);

      assert.deepEqual(listed.ok && listed.value.map((brain) => [brain.name, brain.compiledSourceHash]), [["", null]]);
    });

    it("answers a pull asked before a removal lands with the brain, and one asked after without it", async () => {
      await applied(writeOf(CHASER, "Chaser"));

      const before = pull([CHASER]);
      await applied({ op: "remove", brainId: CHASER });
      const after = pull([CHASER]);

      const pulledBefore = await before;
      assert.deepEqual(pulledBefore.ok && pulledBefore.value.map((brain) => brain.id), [CHASER]);
      assert.deepEqual(await after, { ok: true, value: [] });
    });
  });

  describe("change reports", () => {
    /** Routes the change notifications MakeCode sends the spec's client straight to `on`; resolves once subscribed. */
    function watch(on: BrainsProject = project): Promise<void> {
      return client.subscribe((names) => {
        on.reported(names);
      });
    }

    /** The brains `on` announces from now on, each announcement in order. */
    function announcements(on: BrainsProject = project): MakeCodeBrainSummary[][] {
      const announced: MakeCodeBrainSummary[][] = [];
      on.onChange((brains) => {
        announced.push(brains);
      });
      return announced;
    }

    /**
     * The summary of the brain `id` named `name` holding `source`, registered
     * from the source hashed `compiled`, of origin `origin`.
     */
    function summary(
      id: string,
      name: string,
      source: string,
      compiled: string | null,
      origin: string | null = TAB
    ): MakeCodeBrainSummary {
      return { id, name, sourceHash: brainSourceHash(source), compiledSourceHash: compiled, origin, originLabel: null };
    }

    it("adopts a source edited by hand: recompiled, the module rewritten, the program posted live, the brains announced", async () => {
      await watch();
      await applied(writeOf(CHASER, "Chaser"));
      const announced = announcements();
      const mutations = host.mutations.length;
      posted.length = 0;
      const edited = restartingSource(CHASER, "Chaser");

      host.edit(`brains/${CHASER}.src.json`, edited, { notify: true });
      await until(() => registered().get(CHASER)?.sourceHash === brainSourceHash(edited));
      await drained();

      assert.deepEqual(host.mutations.slice(mutations), [`write ${BRAINS_MODULE_FILE}`]);
      assert.deepEqual(
        posted.map((update) => [update.documentId, update.sourceHash]),
        [[CHASER, brainSourceHash(edited)]]
      );
      const current = summary(CHASER, "Chaser", edited, brainSourceHash(edited));
      assert.deepEqual(announced.at(-1), [current]);
      assert.deepEqual(await list(), { ok: true, value: [current] });
      assert.deepEqual(await pull([CHASER]), {
        ok: true,
        value: [
          { id: CHASER, name: "Chaser", source: edited, compiledSourceHash: brainSourceHash(edited), ...ORIGIN_OF_TAB },
        ],
      });
    });

    it("ignores the report of its own writes: the source and module read back as written change nothing", async () => {
      await watch();
      await applied(writeOf(CHASER, "Chaser"));
      await drained();
      const announced = announcements();
      const mutations = host.mutations.length;
      const reads = host.reads.length;
      posted.length = 0;

      host.notify([`brains/${CHASER}.src.json`, BRAINS_MODULE_FILE]);
      await until(() => host.reads.length === reads + 2);
      await drained();

      assert.deepEqual(host.reads.slice(reads).sort(), [BRAINS_MODULE_FILE, `brains/${CHASER}.src.json`]);
      assert.equal(host.mutations.length, mutations);
      assert.deepEqual(posted, []);
      assert.deepEqual(announced, []);
    });

    it("skips a report for a brain whose push is queued, and the push lands over the hand edit", async () => {
      await watch();
      await applied(writeOf(CHASER, "Chaser"));
      await applied(writeOf(RUNNER, "Runner"));
      const release = host.holdReply(`write brains/${RUNNER}.src.json`);
      const landing = push(writeOf(RUNNER, "Runner renamed"));
      await until(() => host.file(`brains/${RUNNER}.src.json`) === sourceOf(RUNNER, "Runner renamed"));
      const queued = push(writeOf(CHASER, "Chaser pushed"));
      await delay(5);
      const reads = host.reads.length;

      host.edit(`brains/${CHASER}.src.json`, sourceOf(CHASER, "Chaser by hand"), { notify: true });
      await delay(5);
      release();
      assert.ok((await landing).ok);
      assert.ok((await queued).ok);
      await drained();

      assert.ok(!host.reads.slice(reads).includes(`brains/${CHASER}.src.json`));
      assert.equal(host.file(`brains/${CHASER}.src.json`), sourceOf(CHASER, "Chaser pushed"));
      assert.equal(registered().get(CHASER)?.name, "Chaser pushed");
      const listed = await list();
      assert.deepEqual(listed.ok && listed.value.map((brain) => [brain.id, brain.sourceHash]), [
        [CHASER, brainSourceHash(sourceOf(CHASER, "Chaser pushed"))],
        [RUNNER, brainSourceHash(sourceOf(RUNNER, "Runner renamed"))],
      ]);
    });

    it("removes a brain whose source is deleted by hand, rewriting the module without it and posting its removal", async () => {
      await watch();
      await applied(writeOf(CHASER, "Chaser"));
      await applied(writeOf(RUNNER, "Runner"));
      const announced = announcements();
      posted.length = 0;

      host.remove(`brains/${CHASER}.src.json`, { notify: true });
      await until(() => !registered().has(CHASER));
      await drained();

      assert.deepEqual([...registered().keys()], [RUNNER]);
      assert.deepEqual(posted, [{ documentId: CHASER, name: "", sourceHash: "", bytecode: new Uint8Array(0) }]);
      const runner = summary(RUNNER, "Runner", sourceOf(RUNNER, "Runner"), brainSourceHash(sourceOf(RUNNER, "Runner")));
      assert.deepEqual(announced.at(-1), [runner]);
      assert.deepEqual(await list(), { ok: true, value: [runner] });
      assert.ok(!host.mutations.includes(`delete brains/${CHASER}.src.json`));
    });

    it("adds a source written by hand under an id it did not hold, registering it", async () => {
      await watch();
      await applied(writeOf(CHASER, "Chaser"));
      const added = sourceOf(RUNNER, "Runner");

      host.edit(`brains/${RUNNER}.src.json`, added, { notify: true });
      await until(() => registered().has(RUNNER));
      await drained();

      assert.deepEqual(await list(), {
        ok: true,
        value: [
          summary(CHASER, "Chaser", sourceOf(CHASER, "Chaser"), brainSourceHash(sourceOf(CHASER, "Chaser"))),
          summary(RUNNER, "Runner", added, brainSourceHash(added), null),
        ],
      });
    });

    it("heals a brains module damaged by hand once MakeCode reports it, writing it once and logging its code", async () => {
      await watch();
      await applied(writeOf(CHASER, "Chaser"));
      await applied(writeOf(RUNNER, "Runner"));
      const kept = registered();
      const writes = moduleWrites();

      host.edit(BRAINS_MODULE_FILE, "garbage", { notify: true });
      await until(() => readBrainsModule(host.file(BRAINS_MODULE_FILE) ?? "").entries.size === 2);
      await drained();

      assert.deepEqual(registered(), kept);
      assert.equal(moduleWrites(), writes + 1);
      assert.ok(log.errors.some((line) => line.startsWith("BRAINS_MODULE_UNREADABLE")));
    });

    it("holds a brains module made newer-format by hand as it is: nothing written, pushes failing by its code", async () => {
      await watch();
      await applied(writeOf(CHASER, "Chaser"));
      const newer = writeBrainsModule([]).replace(
        `wendoo-brains-format ${BRAINS_MODULE_FORMAT}`,
        `wendoo-brains-format ${BRAINS_MODULE_FORMAT + 1}`
      );

      host.edit(BRAINS_MODULE_FILE, newer, { notify: true });
      await until(() => log.errors.some((line) => line.startsWith("BRAINS_MODULE_FORMAT_NEWER")));
      const pushed = await push(writeOf(CHASER, "Renamed"));
      await drained();

      assert.equal(pushed.ok, false);
      assert.match(pushed.ok ? "" : pushed.message, /^BRAINS_MODULE_FORMAT_NEWER\b/);
      assert.equal(host.file(BRAINS_MODULE_FILE), newer);
      assert.equal(host.file(`brains/${CHASER}.src.json`), sourceOf(CHASER, "Chaser"));
    });

    it("retries a re-read the project fails, adopting the hand edit once the read lands", async () => {
      await watch();
      await applied(writeOf(CHASER, "Chaser"));
      const edited = restartingSource(CHASER, "Chaser");
      host.edit(`brains/${CHASER}.src.json`, edited);
      host.open = false;

      host.notify([`brains/${CHASER}.src.json`]);
      await until(() => log.errors.filter((line) => line.startsWith("PROJECT_CLOSED: ")).length >= 2);
      host.open = true;
      await until(() => registered().get(CHASER)?.sourceHash === brainSourceHash(edited));

      const listed = await list();
      assert.deepEqual(listed.ok && listed.value.map((brain) => brain.sourceHash), [brainSourceHash(edited)]);
    });

    it("re-reads every brain file on a rescan, adopting a source edited by hand that no report named", async () => {
      await applied(writeOf(CHASER, "Chaser"));
      const edited = restartingSource(CHASER, "Chaser");
      host.edit(`brains/${CHASER}.src.json`, edited);

      project.rescan();
      await until(() => registered().get(CHASER)?.sourceHash === brainSourceHash(edited));

      const listed = await list();
      assert.deepEqual(listed.ok && listed.value.map((brain) => brain.sourceHash), [brainSourceHash(edited)]);
    });

    it("ignores the report of its own write of a brain whose write was landing when the report arrived", async () => {
      await watch();
      await applied(writeOf(CHASER, "Chaser"));
      await drained();
      const announced = announcements();
      const second = restartingSource(CHASER, "Chaser");
      const release = host.holdReply(`write brains/${CHASER}.src.json`);
      const pushed = push(writeOf(CHASER, "Chaser", second));
      await until(() => host.file(`brains/${CHASER}.src.json`) === second);
      const mutations = host.mutations.length;
      const reads = host.reads.length;
      posted.length = 0;

      host.notify([`brains/${CHASER}.src.json`]);
      await delay(5);
      release();
      assert.ok((await pushed).ok);
      await until(() => host.reads.length === reads + 1);
      await drained();

      assert.deepEqual(host.reads.slice(reads), [`brains/${CHASER}.src.json`]);
      assert.equal(host.mutations.length, mutations);
      assert.deepEqual(posted, []);
      assert.equal(announced.length, 1);
      assert.deepEqual(announced[0], [summary(CHASER, "Chaser", second, brainSourceHash(second))]);
    });

    it("adopts a hand edit of a brain whose only queued change is a recompile, registering the hand edit", async () => {
      host.edit(`brains/${CHASER}.src.json`, sourceOf(CHASER, "Chaser"));
      host.edit("filler.bin", "x".repeat(PROJFS_SCOPE_QUOTA_BYTES));
      const fresh = open();
      await watch(fresh);
      await until(() => log.errors.some((line) => line.startsWith("QUOTA_EXCEEDED")));
      const reads = host.reads.length;
      const edited = restartingSource(CHASER, "Chaser");

      host.edit(`brains/${CHASER}.src.json`, edited, { notify: true });
      await until(() => host.reads.length > reads);
      host.remove("filler.bin");
      await until(() => host.file(BRAINS_MODULE_FILE) !== undefined);
      await drained(fresh);

      assert.ok(host.reads.slice(reads).includes(`brains/${CHASER}.src.json`));
      assert.deepEqual([...registered().keys()], [CHASER]);
      assert.equal(registered().get(CHASER)?.sourceHash, brainSourceHash(edited));
      assert.ok(!host.mutations.includes(`write brains/${CHASER}.src.json`));
      const listed = await list(fresh);
      assert.deepEqual(listed.ok && listed.value, [summary(CHASER, "Chaser", edited, brainSourceHash(edited), null)]);
    });

    it("holds a source mangled by hand verbatim as it holds one at start, keeping the brain's registration", async () => {
      await watch();
      await applied(writeOf(CHASER, "Chaser"));
      await drained();
      const lastGood = registered().get(CHASER);
      const announced = announcements();
      const mutations = host.mutations.length;
      posted.length = 0;

      host.edit(`brains/${CHASER}.src.json`, "not json {", { notify: true });
      await until(() => announced.length > 0);
      await drained();

      assert.deepEqual(registered().get(CHASER), lastGood);
      assert.equal(host.mutations.length, mutations);
      assert.deepEqual(posted, []);
      const held = summary(CHASER, "Chaser", "not json {", lastGood?.sourceHash ?? null);
      assert.deepEqual(announced, [[held]]);
      assert.deepEqual(await pull([CHASER]), {
        ok: true,
        value: [
          {
            id: CHASER,
            name: "Chaser",
            source: "not json {",
            compiledSourceHash: lastGood?.sourceHash ?? null,
            ...ORIGIN_OF_TAB,
          },
        ],
      });
    });

    it("re-reads a source whose skipped push MakeCode refuses, adopting the hand edit the push would have replaced", async () => {
      let refuse = false;
      const refusing = open({
        list: () => client.list(),
        read: (name) => client.read(name),
        write: (name, content, options) =>
          refuse && name === `brains/${CHASER}.src.json`
            ? Promise.reject(new ProjfsError("FAILED", "write refused"))
            : client.write(name, content, options),
        delete: (name, options) => client.delete(name, options),
        subscribe: (onChange) => client.subscribe(onChange),
      });
      await watch(refusing);
      await push(writeOf(CHASER, "Chaser"), refusing);
      await push(writeOf(RUNNER, "Runner"), refusing);
      const release = host.holdReply(`write brains/${RUNNER}.src.json`);
      const landing = push(writeOf(RUNNER, "Runner renamed"), refusing);
      await until(() => host.file(`brains/${RUNNER}.src.json`) === sourceOf(RUNNER, "Runner renamed"));
      const queued = push(writeOf(CHASER, "Chaser pushed"), refusing);
      await delay(5);
      const edited = sourceOf(CHASER, "Chaser by hand");

      host.edit(`brains/${CHASER}.src.json`, edited, { notify: true });
      await delay(5);
      refuse = true;
      release();
      assert.ok((await landing).ok);
      const answer = await queued;
      await drained(refusing);
      const listed = await list(refusing);

      assert.equal(answer.ok, false);
      assert.match(answer.ok ? "" : answer.message, /^FAILED\b/);
      assert.equal(host.file(`brains/${CHASER}.src.json`), edited);
      assert.deepEqual(listed.ok && listed.value.map((brain) => [brain.id, brain.name, brain.sourceHash]), [
        [CHASER, "Chaser by hand", brainSourceHash(edited)],
        [RUNNER, "Runner renamed", brainSourceHash(sourceOf(RUNNER, "Runner renamed"))],
      ]);
    });

    it("re-reads a source whose skipped push fails with its drain's module write, adopting the hand edit", async () => {
      await watch();
      await applied(writeOf(CHASER, "Chaser"));
      await applied(writeOf(RUNNER, "Runner"));
      const release = host.holdReply(`write brains/${RUNNER}.src.json`);
      const landing = push(writeOf(RUNNER, "Runner renamed"));
      await until(() => host.file(`brains/${RUNNER}.src.json`) === sourceOf(RUNNER, "Runner renamed"));
      const queued = push(writeOf(CHASER, "Chaser pushed"));
      await delay(5);
      const edited = sourceOf(CHASER, "Chaser by hand");

      host.edit(`brains/${CHASER}.src.json`, edited, { notify: true });
      host.edit("filler.bin", "x".repeat(PROJFS_SCOPE_QUOTA_BYTES));
      await delay(5);
      release();
      assert.ok((await landing).ok);
      const answer = await queued;
      await drained();
      const listed = await list();

      assert.equal(answer.ok, false);
      assert.match(answer.ok ? "" : answer.message, /^QUOTA_EXCEEDED\b/);
      assert.equal(host.file(`brains/${CHASER}.src.json`), edited);
      assert.deepEqual(listed.ok && listed.value.map((brain) => [brain.id, brain.name, brain.sourceHash]), [
        [CHASER, "Chaser by hand", brainSourceHash(edited)],
        [RUNNER, "Runner renamed", brainSourceHash(sourceOf(RUNNER, "Runner renamed"))],
      ]);
    });
  });

  describe("the view served while a drain lands", () => {
    it("pairs a listed and pulled registration with the source it was compiled from until that source lands", async () => {
      const first = sourceOf(CHASER, "Chaser");
      await applied(writeOf(CHASER, "Chaser", first));
      const second = restartingSource(CHASER, "Chaser");
      const release = host.holdReply(`write brains/${CHASER}.src.json`);

      const pushed = push(writeOf(CHASER, "Chaser", second));
      await until(() => host.file(`brains/${CHASER}.src.json`) === second);
      const listedMidDrain = await list();
      const pulledMidDrain = await pull([CHASER]);
      release();
      assert.ok((await pushed).ok);

      assert.equal(registered().get(CHASER)?.sourceHash, brainSourceHash(second));
      assert.deepEqual(listedMidDrain, {
        ok: true,
        value: [
          {
            id: CHASER,
            name: "Chaser",
            sourceHash: brainSourceHash(first),
            compiledSourceHash: brainSourceHash(first),
            ...ORIGIN_OF_TAB,
          },
        ],
      });
      assert.deepEqual(pulledMidDrain, {
        ok: true,
        value: [
          { id: CHASER, name: "Chaser", source: first, compiledSourceHash: brainSourceHash(first), ...ORIGIN_OF_TAB },
        ],
      });
      assert.deepEqual(await list(), {
        ok: true,
        value: [
          {
            id: CHASER,
            name: "Chaser",
            sourceHash: brainSourceHash(second),
            compiledSourceHash: brainSourceHash(second),
            ...ORIGIN_OF_TAB,
          },
        ],
      });
    });

    it("keeps a removed brain listed with its registration until its delete lands", async () => {
      const source = sourceOf(CHASER, "Chaser");
      await applied(writeOf(CHASER, "Chaser", source));
      const release = host.holdReply(`delete brains/${CHASER}.src.json`);

      const removed = push({ op: "remove", brainId: CHASER });
      await until(() => host.file(`brains/${CHASER}.src.json`) === undefined);
      const listedMidDrain = await list();
      release();
      assert.ok((await removed).ok);

      assert.equal(registered().has(CHASER), false);
      assert.deepEqual(listedMidDrain, {
        ok: true,
        value: [
          {
            id: CHASER,
            name: "Chaser",
            sourceHash: brainSourceHash(source),
            compiledSourceHash: brainSourceHash(source),
            ...ORIGIN_OF_TAB,
          },
        ],
      });
      assert.deepEqual(await list(), { ok: true, value: [] });
    });
  });

  describe("live updates", () => {
    it("posts a pushed program to the running program as it is compiled, before the project's write lands", async () => {
      await project.current();
      host.hold();
      const source = restartingSource(CHASER, "Chaser");

      const answer = push(writeOf(CHASER, "Chaser", source));
      await until(() => posted.length === 1);

      assert.equal(host.file(`brains/${CHASER}.src.json`), undefined);
      assert.deepEqual(
        [posted[0].documentId, posted[0].name, posted[0].sourceHash],
        [CHASER, "Chaser", brainSourceHash(source)]
      );
      host.release();
      assert.ok((await answer).ok);
    });

    it("posts nothing for a push whose compile keeps the registration", async () => {
      await applied(writeOf(CHASER, "Chaser"));

      await applied(writeOf(CHASER, "Chaser", misplacedSource(CHASER, "Chaser")));
      await applied(writeOf(CHASER, "Chaser", ringingSource(CHASER, "Chaser")));

      assert.equal(posted.length, 1);
    });

    it("posts a removal to the running program as an update carrying no program", async () => {
      await applied(writeOf(CHASER, "Chaser"));

      await applied({ op: "remove", brainId: CHASER });

      assert.deepEqual(posted.at(-1), { documentId: CHASER, name: "", sourceHash: "", bytecode: new Uint8Array(0) });
    });

    it("posts the program a create registers", async () => {
      const answer = await create("Chaser");

      assert.ok(answer.ok);
      assert.deepEqual(
        posted.map((update) => [update.documentId, update.sourceHash]),
        [[answer.value.id, answer.value.sourceHash]]
      );
    });
  });
});
