import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  brainSourceHash,
  type MakeCodeBrain,
  type MakeCodeBrainPush,
  type MakeCodeBrainSummary,
  type MakeCodeBrainsRequest,
} from "@wendoo/makecode-session";
import { BRAINS_MODULE_FILE, readBrainsModule, writeBrainsModule } from "./brains-module.js";
import { BrainsProject } from "./brains-project.js";
import type { SimxLog } from "./simx-bridge.js";
import { FakeProjfsHost, PROJFS_RATE_LIMIT, PROJFS_SCOPE_QUOTA_BYTES } from "./test-support/projfs-host.js";
import type { ProjfsClient } from "./vendor/projfs.js";

/** How one request was answered. */
type Answer<T> = { ok: true; value: T } | { ok: false; message: string };

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

/** The source text of a brain document `id` named `name`, as the editor pretty-prints it. */
function sourceOf(id: string, name: string): string {
  return JSON.stringify({ version: 1, id, name, pages: [] }, null, 2);
}

/** A brain as the editor pushes it: its source and a compiled form of that source. */
function brain(id: string, name: string, bytecode: Uint8Array = Uint8Array.from([1, 2, 3])): MakeCodeBrain {
  const source = sourceOf(id, name);
  return { id, name, source, compiled: { bytecode, sourceHash: brainSourceHash(source) } };
}

const CHASER = "chaserchaserchas";
const RUNNER = "runnerrunnerrunn";

describe("brains project", () => {
  let host: FakeProjfsHost;
  let client: ProjfsClient;
  let log: RecordingLog;
  let project: BrainsProject;

  beforeEach(() => {
    host = new FakeProjfsHost();
    client = host.client();
    log = new RecordingLog();
    project = new BrainsProject(client, log);
  });

  afterEach(() => {
    client.dispose();
  });

  /** Asks the project for its list and resolves with the answer. */
  function list(on: BrainsProject = project): Promise<Answer<MakeCodeBrainSummary[]>> {
    return new Promise((resolve) => {
      const request: MakeCodeBrainsRequest = {
        kind: "list",
        reply: (brains) => resolve({ ok: true, value: [...brains] }),
        fail: (message) => resolve({ ok: false, message }),
      };
      on.serve(request);
    });
  }

  /** Asks the project for the brains `ids` and resolves with the answer. */
  function pull(ids: string[], on: BrainsProject = project): Promise<Answer<MakeCodeBrain[]>> {
    return new Promise((resolve) => {
      on.serve({
        kind: "pull",
        ids,
        reply: (brains) => resolve({ ok: true, value: [...brains] }),
        fail: (message) => resolve({ ok: false, message }),
      });
    });
  }

  /** Asks the project to apply `change` and resolves with the answer. */
  function push(change: MakeCodeBrainPush): Promise<Answer<undefined>> {
    return new Promise((resolve) => {
      project.serve({
        kind: "push",
        push: change,
        ack: () => resolve({ ok: true, value: undefined }),
        fail: (message) => resolve({ ok: false, message }),
      });
    });
  }

  /** Pushes a write of `written` and asserts the project acknowledged it. */
  async function write(written: MakeCodeBrain): Promise<void> {
    assert.deepEqual(await push({ op: "write", brain: written }), { ok: true, value: undefined });
  }

  /** The entries the project's brains module registers, read with the module's own reader. */
  function registered(): ReturnType<typeof readBrainsModule>["entries"] {
    const text = host.file(BRAINS_MODULE_FILE);
    assert.ok(text !== undefined, "no brains module");
    const reading = readBrainsModule(text);
    assert.deepEqual(reading.problems, []);
    return reading.entries;
  }

  describe("push", () => {
    it("writes the source verbatim to brains/<id>.src.json and registers the compiled form in brains.g.ts, then acknowledges", async () => {
      const chaser = brain(
        CHASER,
        "Chaser",
        Uint8Array.from({ length: 256 }, (_, index) => index)
      );

      await write(chaser);

      assert.equal(host.file(`brains/${CHASER}.src.json`), chaser.source);
      assert.deepEqual(registered().get(CHASER), {
        id: CHASER,
        name: "Chaser",
        sourceHash: chaser.compiled?.sourceHash,
        bytecode: chaser.compiled?.bytecode,
      });
    });

    it("keeps every other brain's registration when it writes one", async () => {
      await write(brain(CHASER, "Chaser"));
      await write(brain(RUNNER, "Runner", Uint8Array.from([9])));
      await write(brain(CHASER, "Chaser renamed", Uint8Array.from([7, 7])));

      assert.deepEqual([...registered().keys()].sort(), [CHASER, RUNNER]);
      assert.equal(registered().get(CHASER)?.name, "Chaser renamed");
      assert.deepEqual(registered().get(RUNNER)?.bytecode, Uint8Array.from([9]));
    });

    it("drops a brain's registration when a write carries no compiled form", async () => {
      await write(brain(CHASER, "Chaser"));
      const { compiled: _, ...uncompiled } = brain(CHASER, "Chaser");

      await write(uncompiled);

      assert.equal(host.file(`brains/${CHASER}.src.json`), uncompiled.source);
      assert.equal(registered().has(CHASER), false);
    });

    it("removes a brain in both forms, and acknowledges removing one the project does not hold", async () => {
      await write(brain(CHASER, "Chaser"));
      await write(brain(RUNNER, "Runner"));

      assert.deepEqual(await push({ op: "remove", brainId: CHASER }), { ok: true, value: undefined });
      assert.deepEqual(await push({ op: "remove", brainId: "absentabsentabse" }), { ok: true, value: undefined });

      assert.equal(host.file(`brains/${CHASER}.src.json`), undefined);
      assert.deepEqual([...registered().keys()], [RUNNER]);
    });

    it("drops the registration of a brain whose source is gone from the project when it next writes", async () => {
      await write(brain(CHASER, "Chaser"));
      host.remove(`brains/${CHASER}.src.json`);

      await write(brain(RUNNER, "Runner"));

      assert.deepEqual([...registered().keys()], [RUNNER]);
    });

    it("writes artifacts only: no write or delete is flagged as a user edit", async () => {
      const posted: unknown[] = [];
      const recording = new BrainsProject(
        {
          list: () => client.list(),
          read: (name) => client.read(name),
          write: (name, content, options) => {
            posted.push(options);
            return client.write(name, content, options);
          },
          delete: (name, options) => {
            posted.push(options);
            return client.delete(name, options);
          },
        },
        log
      );
      await new Promise<void>((resolve) => {
        recording.serve({
          kind: "push",
          push: { op: "write", brain: brain(CHASER, "Chaser") },
          ack: () => resolve(),
          fail: () => resolve(),
        });
      });
      await new Promise<void>((resolve) => {
        recording.serve({
          kind: "push",
          push: { op: "remove", brainId: CHASER },
          ack: () => resolve(),
          fail: () => resolve(),
        });
      });

      assert.equal(posted.length, 4);
      assert.ok(posted.every((options) => options === undefined));
    });
  });

  describe("coalescing", () => {
    it("writes the brains module once for a burst of pushes, acknowledging each push", async () => {
      const brains = ["aaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbb", "cccccccccccccccc", "dddddddddddddddd"].map((id) =>
        brain(id, id)
      );

      const answers = await Promise.all(brains.map((pushed) => push({ op: "write", brain: pushed })));

      assert.ok(answers.every((answer) => answer.ok));
      assert.equal(host.mutations.filter((mutation) => mutation === `write ${BRAINS_MODULE_FILE}`).length, 1);
      assert.equal(host.mutations.length, brains.length + 1);
      assert.deepEqual([...registered().keys()].sort(), brains.map((pushed) => pushed.id).sort());
    });

    it("gathers the pushes that arrive while a drain reads the project into that drain", async () => {
      await write(brain(CHASER, "Chaser"));
      host.hold();
      const first = push({ op: "write", brain: brain(RUNNER, "Runner") });
      await delay(20);
      const later = [
        push({ op: "write", brain: brain("aaaaaaaaaaaaaaaa", "A") }),
        push({ op: "remove", brainId: CHASER }),
      ];
      host.release();

      for (const answer of await Promise.all([first, ...later])) assert.ok(answer.ok);
      assert.deepEqual([...registered().keys()].sort(), ["aaaaaaaaaaaaaaaa", RUNNER]);
      assert.equal(host.mutations.filter((mutation) => mutation === `write ${BRAINS_MODULE_FILE}`).length, 2);
    });

    it("writes the pushes that arrive while a drain writes in the next drain, writing the module once more", async () => {
      await write(brain(CHASER, "Chaser"));
      let open: () => void = () => {};
      const opened = new Promise<void>((resolve) => {
        open = resolve;
      });
      let gated = true;
      const gatedProject = new BrainsProject(
        {
          list: () => client.list(),
          read: (name) => client.read(name),
          write: async (name, content, options) => {
            if (gated) {
              gated = false;
              await opened;
            }
            return client.write(name, content, options);
          },
          delete: (name, options) => client.delete(name, options),
        },
        log
      );
      const answers: Promise<Answer<undefined>>[] = [];
      const pushTo = (change: MakeCodeBrainPush): void => {
        answers.push(
          new Promise((resolve) => {
            gatedProject.serve({
              kind: "push",
              push: change,
              ack: () => resolve({ ok: true, value: undefined }),
              fail: (message) => resolve({ ok: false, message }),
            });
          })
        );
      };
      pushTo({ op: "write", brain: brain(RUNNER, "Runner") });
      await delay(20);
      pushTo({ op: "write", brain: brain("aaaaaaaaaaaaaaaa", "A") });
      pushTo({ op: "remove", brainId: CHASER });
      open();

      for (const answer of await Promise.all(answers)) assert.ok(answer.ok);
      assert.deepEqual([...registered().keys()].sort(), ["aaaaaaaaaaaaaaaa", RUNNER]);
      assert.equal(host.mutations.filter((mutation) => mutation === `write ${BRAINS_MODULE_FILE}`).length, 3);
    });

    it("leaves the brains module unwritten when a drain changes no registration", async () => {
      const chaser = brain(CHASER, "Chaser");
      await write(chaser);
      const before = host.mutations.length;

      await write(chaser);

      assert.deepEqual(host.mutations.slice(before), [`write brains/${CHASER}.src.json`]);
    });

    it("writes one brain's source once for two pushes of it in one drain, the later winning, and acknowledges both", async () => {
      const answers = await Promise.all([
        push({ op: "write", brain: brain(CHASER, "First") }),
        push({ op: "write", brain: brain(CHASER, "Second") }),
      ]);

      assert.ok(answers.every((answer) => answer.ok));
      assert.equal(host.file(`brains/${CHASER}.src.json`), sourceOf(CHASER, "Second"));
      assert.equal(registered().get(CHASER)?.name, "Second");
      assert.deepEqual(host.mutations, [`write ${BRAINS_MODULE_FILE}`, `write brains/${CHASER}.src.json`]);
    });
  });

  describe("refusals", () => {
    it("fails every push of a drain whose brains module MakeCode rate-limits, carrying RATE_LIMITED, writing nothing", async () => {
      host.spendMutations(PROJFS_RATE_LIMIT);

      const answers = await Promise.all([
        push({ op: "write", brain: brain(CHASER, "Chaser") }),
        push({ op: "remove", brainId: RUNNER }),
      ]);

      for (const answer of answers) {
        assert.equal(answer.ok, false);
        assert.match(answer.ok ? "" : answer.message, /^RATE_LIMITED\b/);
      }
      assert.deepEqual(host.mutations, []);
      assert.ok(log.errors.some((line) => line.includes("RATE_LIMITED")));
    });

    it("acknowledges each push whose source landed and fails each one MakeCode rate-limited", async () => {
      host.spendMutations(PROJFS_RATE_LIMIT - 2);

      const answers = await Promise.all([
        push({ op: "write", brain: brain(CHASER, "Chaser") }),
        push({ op: "write", brain: brain(RUNNER, "Runner") }),
      ]);

      assert.equal(answers[0].ok, true);
      assert.equal(answers[1].ok, false);
      assert.match(answers[1].ok ? "" : answers[1].message, /^RATE_LIMITED\b/);
      assert.equal(host.file(`brains/${CHASER}.src.json`), sourceOf(CHASER, "Chaser"));
      assert.equal(host.file(`brains/${RUNNER}.src.json`), undefined);
    });

    it("fails a push whose brains module would exceed the folder's quota, carrying QUOTA_EXCEEDED, writing nothing", async () => {
      const oversized = brain(CHASER, "Chaser", new Uint8Array(PROJFS_SCOPE_QUOTA_BYTES / 2));

      const answer = await push({ op: "write", brain: oversized });

      assert.equal(answer.ok, false);
      assert.match(answer.ok ? "" : answer.message, /^QUOTA_EXCEEDED\b/);
      assert.deepEqual(host.mutations, []);
    });

    it("fails a list and a pull with the reason when MakeCode cannot serve them", async () => {
      host.open = false;

      const listed = await list();
      const pulled = await pull([CHASER]);

      assert.equal(listed.ok, false);
      assert.match(listed.ok ? "" : listed.message, /^FAILED\b/);
      assert.equal(pulled.ok, false);
    });
  });

  describe("list and pull", () => {
    it("lists each brain source in brains/ by id, with its name and the hash of its text, and nothing else", async () => {
      await write(brain(CHASER, "Chaser"));
      await write(brain(RUNNER, "Runner"));
      host.edit("notes.txt", "not a brain");
      host.edit("brains/nested/inner.src.json", sourceOf("inner", "Inner"));
      host.edit("brains/stray.json", "{}");

      const answer = await list();

      assert.ok(answer.ok);
      assert.deepEqual(
        answer.value.sort((a, b) => a.id.localeCompare(b.id)),
        [
          { id: CHASER, name: "Chaser", sourceHash: brainSourceHash(sourceOf(CHASER, "Chaser")) },
          { id: RUNNER, name: "Runner", sourceHash: brainSourceHash(sourceOf(RUNNER, "Runner")) },
        ]
      );
    });

    it("lists nothing for a project holding no brains", async () => {
      assert.deepEqual(await list(), { ok: true, value: [] });
    });

    it("pulls the requested brains in request order with their compiled forms, bytes intact, leaving out absent ids", async () => {
      const chaser = brain(
        CHASER,
        "Chaser",
        Uint8Array.from({ length: 256 }, (_, index) => 255 - index)
      );
      const runner = brain(RUNNER, "Runner");
      await write(chaser);
      await write(runner);

      const answer = await pull([RUNNER, "absentabsentabse", CHASER]);

      assert.deepEqual(answer, { ok: true, value: [runner, chaser] });
    });

    it("pulls a brain whose module registration is gone without a compiled form", async () => {
      const { compiled: _, ...uncompiled } = brain(CHASER, "Chaser");
      await write(uncompiled);

      assert.deepEqual(await pull([CHASER]), { ok: true, value: [uncompiled] });
    });

    it("serves the same brains to a fresh instance over the same project, holding nothing of its own", async () => {
      const chaser = brain(CHASER, "Chaser");
      await write(chaser);
      const restarted = new BrainsProject(client, log);

      assert.deepEqual(await list(restarted), {
        ok: true,
        value: [{ id: CHASER, name: "Chaser", sourceHash: chaser.compiled?.sourceHash }],
      });
      assert.deepEqual(await pull([CHASER], restarted), { ok: true, value: [chaser] });
    });
  });

  describe("damaged files", () => {
    it("lists and pulls a hand-mangled source verbatim, named from its registration", async () => {
      const chaser = brain(CHASER, "Chaser");
      await write(chaser);
      host.edit(`brains/${CHASER}.src.json`, "not json {");

      const listed = await list();
      const pulled = await pull([CHASER]);

      assert.deepEqual(listed, {
        ok: true,
        value: [{ id: CHASER, name: "Chaser", sourceHash: brainSourceHash("not json {") }],
      });
      assert.deepEqual(pulled, { ok: true, value: [{ ...chaser, source: "not json {" }] });
    });

    it("names a mangled source it holds no registration of with an empty name", async () => {
      host.edit(`brains/${CHASER}.src.json`, '{"name": 42');

      assert.deepEqual(await list(), {
        ok: true,
        value: [{ id: CHASER, name: "", sourceHash: brainSourceHash('{"name": 42') }],
      });
    });

    it("serves sources without compiled forms from an unreadable brains module, logging its code, and heals it on the next push", async () => {
      await write(brain(CHASER, "Chaser"));
      host.edit(BRAINS_MODULE_FILE, "garbage");
      const runner = brain(RUNNER, "Runner");

      const pulled = await pull([CHASER]);
      assert.deepEqual(pulled, {
        ok: true,
        value: [{ id: CHASER, name: "Chaser", source: sourceOf(CHASER, "Chaser") }],
      });
      assert.ok(log.errors.some((line) => line.startsWith("BRAINS_MODULE_UNREADABLE")));
      await write(runner);

      assert.deepEqual([...registered().keys()], [RUNNER]);
    });

    it("skips a damaged registration, serving every other brain's compiled form", async () => {
      const chaser = brain(CHASER, "Chaser");
      await write(chaser);
      await write(brain(RUNNER, "Runner"));
      const text = host.file(BRAINS_MODULE_FILE) ?? "";
      host.edit(BRAINS_MODULE_FILE, text.replace(`"${RUNNER}", "Runner", hex\``, `"${RUNNER}", Runner, hex\``));

      const pulled = await pull([CHASER, RUNNER]);

      assert.ok(pulled.ok);
      assert.deepEqual(pulled.value[0], chaser);
      assert.equal(pulled.value[1].compiled, undefined);
      assert.ok(log.errors.some((line) => line.startsWith("BRAINS_MODULE_ENTRY_MALFORMED")));
    });

    it("leaves a brains module of a newer format as it is, failing pushes and serving sources without compiled forms", async () => {
      await write(brain(CHASER, "Chaser"));
      const newer = (host.file(BRAINS_MODULE_FILE) ?? "").replace("wendoo-brains-format 1", "wendoo-brains-format 2");
      host.edit(BRAINS_MODULE_FILE, newer);
      const mutations = host.mutations.length;

      const pushed = await push({ op: "write", brain: brain(RUNNER, "Runner") });
      const pulled = await pull([CHASER]);

      assert.equal(pushed.ok, false);
      assert.match(pushed.ok ? "" : pushed.message, /^BRAINS_MODULE_FORMAT_NEWER\b/);
      assert.equal(host.file(BRAINS_MODULE_FILE), newer);
      assert.equal(host.mutations.length, mutations);
      assert.ok(pulled.ok);
      assert.equal(pulled.value[0].compiled, undefined);
    });
  });

  describe("interleaving", () => {
    it("answers a pull asked before a removal with the brain, and one asked after without it", async () => {
      const chaser = brain(CHASER, "Chaser");
      await write(chaser);
      host.hold();

      const before = pull([CHASER]);
      await delay(20);
      const removed = push({ op: "remove", brainId: CHASER });
      await delay(20);
      host.release();

      assert.deepEqual(await before, { ok: true, value: [chaser] });
      assert.ok((await removed).ok);
      assert.deepEqual(await pull([CHASER]), { ok: true, value: [] });
    });

    it("keeps two brains' pushes apart when they interleave with lists", async () => {
      const answers = await Promise.all([
        push({ op: "write", brain: brain(CHASER, "Chaser") }),
        list(),
        push({ op: "write", brain: brain(RUNNER, "Runner") }),
        push({ op: "write", brain: brain(CHASER, "Chaser 2") }),
      ]);

      assert.ok(answers.every((answer) => answer.ok));
      const listed = await list();
      assert.ok(listed.ok);
      assert.deepEqual(listed.value.map((summary) => [summary.id, summary.name]).sort(), [
        [CHASER, "Chaser 2"],
        [RUNNER, "Runner"],
      ]);
      assert.deepEqual(writeBrainsModule(registered().values()), host.file(BRAINS_MODULE_FILE));
    });
  });
});

/** Resolves after `ms` milliseconds. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
