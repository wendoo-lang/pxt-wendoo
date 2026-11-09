import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { MakeCodeIdManifest, MakeCodeManifestReading } from "@wendoo/makecode-session";
import { MakeCodeManifestProblemCode } from "@wendoo/makecode-session";
import type { ProjfsClient } from "../vendor/projfs.js";
import { IDS_MODULE_FILE, IDS_MODULE_FORMAT, readIdsModule, writeIdsModule } from "./ids-module.js";
import { ManifestProject } from "./manifest-project.js";
import type { SimxLog } from "./simx-bridge.js";
import { FakeProjfsHost, PROJFS_SCOPE_QUOTA_BYTES } from "./test-support/projfs-host.js";

/** Retry timings short enough for several retries to fit in a spec. */
const TIMINGS = { retryDelayMs: 2, maxRetryDelayMs: 8 };

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

const MANIFEST: MakeCodeIdManifest = {
  actions: [{ name: "actuator.chime.ring", id: 1024 }],
  operators: [],
  types: [{ name: "Beacon", atom: 1024, fields: ["x", "y"] }],
  next: { action: 1025, operator: 1024, atom: 1025 },
};

/** A catalog of one pack declaring `tiles`, by name, and the type `Beacon` with the fields `fields`. */
function catalog(tiles: readonly string[], fields: readonly string[] = ["x", "y"]): string {
  return JSON.stringify({
    packs: [
      {
        name: "beacon",
        types: [{ name: "Beacon", fields: fields.map((name) => ({ name, type: "number" })) }],
        tiles: tiles.map((name) => ({ name, kind: "actuator" })),
      },
    ],
  });
}

/** Resolves after `ms` milliseconds. */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Whether `promise` settles within `ms` milliseconds. */
async function settlesWithin(promise: Promise<unknown>, ms: number): Promise<boolean> {
  return Promise.race([promise.then(() => true), wait(ms).then(() => false)]);
}

describe("manifest project", () => {
  let host: FakeProjfsHost;
  let client: ProjfsClient;
  let log: RecordingLog;
  let projects: ManifestProject[];

  beforeEach(() => {
    host = new FakeProjfsHost();
    client = host.client();
    log = new RecordingLog();
    projects = [];
  });

  afterEach(() => {
    for (const project of projects) project.dispose();
    client.dispose();
  });

  /** A project over the spec's files, reading the ids module now. */
  function open(): ManifestProject {
    const project = new ManifestProject(client, log, TIMINGS);
    projects.push(project);
    return project;
  }

  describe("read at construction", () => {
    it("reads a project holding no ids module as holding no manifest, and writes nothing for a catalog allocating nothing", async () => {
      const project = open();

      assert.deepEqual(await project.current(), { manifest: null });
      assert.deepEqual(await project.adopt('{"packs":[]}'), { manifest: null });
      assert.deepEqual(host.mutations, []);
    });

    it("reads a valid module as its manifest", async () => {
      host.edit(IDS_MODULE_FILE, writeIdsModule(MANIFEST));

      assert.deepEqual(await open().current(), { manifest: MANIFEST });
      assert.deepEqual(log.errors, []);
    });

    it("reads the module at construction, and not again while no change is reported", async () => {
      host.edit(IDS_MODULE_FILE, writeIdsModule(MANIFEST));
      const project = open();
      await project.current();

      host.edit(IDS_MODULE_FILE, writeIdsModule({ ...MANIFEST, actions: [] }));

      assert.deepEqual(await project.current(), { manifest: MANIFEST });
    });

    it("holds an unreadable module as no manifest, logs its code, and replaces it at the next allocation", async () => {
      host.edit(IDS_MODULE_FILE, "garbage typed by hand");
      const project = open();

      assert.deepEqual(await project.current(), { manifest: null });
      assert.equal(log.errors.length, 1);
      assert.ok(log.errors[0].startsWith(`${MakeCodeManifestProblemCode.UNREADABLE}: ${IDS_MODULE_FILE}`));
      const reading = await project.adopt('{"packs":[]}');

      assert.deepEqual(reading, { manifest: null });
      assert.deepEqual(readIdsModule(host.file(IDS_MODULE_FILE) ?? ""), {
        manifest: { actions: [], operators: [], types: [], next: { action: 1024, operator: 1024, atom: 1024 } },
      });
    });

    it("holds a module with a damaged line as its readable entries, logs its code, and heals it at the next allocation", async () => {
      host.edit(IDS_MODULE_FILE, writeIdsModule(MANIFEST).replace('"actuator.chime.ring"', "actuator.chime.ring"));
      const project = open();

      assert.deepEqual(await project.current(), { manifest: { ...MANIFEST, actions: [] } });
      assert.ok(log.errors[0].startsWith(`${MakeCodeManifestProblemCode.ENTRY_MALFORMED}: ${IDS_MODULE_FILE}`));
      await project.adopt(catalog([]));

      assert.deepEqual(readIdsModule(host.file(IDS_MODULE_FILE) ?? ""), { manifest: { ...MANIFEST, actions: [] } });
    });

    it("holds a module of a newer format under FORMAT_NEWER, never allocating over it or writing it", async () => {
      const newer = writeIdsModule(MANIFEST).replace(
        `wendoo-ids-format ${IDS_MODULE_FORMAT}`,
        `wendoo-ids-format ${IDS_MODULE_FORMAT + 1}`
      );
      host.edit(IDS_MODULE_FILE, newer);
      const project = open();

      assert.deepEqual(await project.current(), { manifest: null, problem: MakeCodeManifestProblemCode.FORMAT_NEWER });
      assert.deepEqual(await project.adopt(catalog(["actuator.beacon.flash"])), {
        manifest: null,
        problem: MakeCodeManifestProblemCode.FORMAT_NEWER,
      });
      assert.equal(host.file(IDS_MODULE_FILE), newer);
      assert.deepEqual(host.mutations, []);
      assert.ok(log.errors[0].startsWith(`${MakeCodeManifestProblemCode.FORMAT_NEWER}: ${IDS_MODULE_FILE}`));
    });

    it("retries a read the project fails, logging its code, and answers once the read lands", async () => {
      host.edit(IDS_MODULE_FILE, writeIdsModule(MANIFEST));
      host.open = false;
      const project = open();
      const current = project.current();

      assert.equal(await settlesWithin(current, 20), false);
      assert.ok(log.errors.length >= 2);
      assert.ok(log.errors.every((line) => line.startsWith("PROJECT_CLOSED: ")));
      host.open = true;

      assert.deepEqual(await current, { manifest: MANIFEST });
    });
  });

  describe("allocation", () => {
    it("allocates a new tile and a new field above the watermarks, keeping every id held, and writes the module", async () => {
      host.edit(IDS_MODULE_FILE, writeIdsModule({ ...MANIFEST, next: { action: 1030, operator: 1024, atom: 1025 } }));
      const project = open();

      const reading = await project.adopt(catalog(["actuator.chime.ring", "actuator.beacon.flash"], ["z", "x"]));

      const expected: MakeCodeIdManifest = {
        actions: [
          { name: "actuator.chime.ring", id: 1024 },
          { name: "actuator.beacon.flash", id: 1030 },
        ],
        operators: [],
        types: [{ name: "Beacon", atom: 1024, fields: ["x", "y", "z"] }],
        next: { action: 1031, operator: 1024, atom: 1025 },
      };
      assert.deepEqual(reading, { manifest: expected });
      assert.deepEqual(await project.current(), { manifest: expected });
      assert.equal(host.file(IDS_MODULE_FILE), writeIdsModule(expected));
      assert.deepEqual(host.mutations, [`write ${IDS_MODULE_FILE}`]);
    });

    it("keeps the id of a name a later catalog no longer declares, and writes only when the allocation changes", async () => {
      const project = open();
      const first = await project.adopt(catalog(["actuator.chime.ring"]));
      const again = await project.adopt(catalog(["actuator.chime.ring"]));
      const without = await project.adopt(catalog([]));

      assert.deepEqual(again, first);
      assert.deepEqual(without, first);
      assert.deepEqual(first.manifest?.actions, [{ name: "actuator.chime.ring", id: 1024 }]);
      assert.deepEqual(host.mutations, [`write ${IDS_MODULE_FILE}`]);
    });

    it("asks no further write once the project refuses one for good, logging the refusal once", async () => {
      const project = open();
      await project.current();
      host.registered = false;

      const first = await project.adopt(catalog(["actuator.chime.ring"]));
      const grown = await project.adopt(catalog(["actuator.chime.ring", "actuator.beacon.flash"]));
      await wait(30);

      assert.deepEqual(first.manifest?.actions, [{ name: "actuator.chime.ring", id: 1024 }]);
      assert.equal(grown.manifest?.actions.length, 2);
      assert.equal(log.errors.length, 1);
      assert.ok(log.errors[0].startsWith("UNREGISTERED: "));
      assert.equal(host.file(IDS_MODULE_FILE), undefined);
    });

    it("answers with the allocation when the project refuses its write, and writes it once the project accepts it", async () => {
      host.edit("filler.bin", "x".repeat(PROJFS_SCOPE_QUOTA_BYTES));
      const project = open();

      const reading = await project.adopt(catalog(["actuator.chime.ring"]));

      assert.deepEqual(reading.manifest?.actions, [{ name: "actuator.chime.ring", id: 1024 }]);
      assert.equal(host.file(IDS_MODULE_FILE), undefined);
      assert.ok(log.errors[0].startsWith("QUOTA_EXCEEDED: "));
      host.remove("filler.bin");
      await wait(30);

      assert.equal(host.file(IDS_MODULE_FILE), writeIdsModule(reading.manifest ?? MANIFEST));
    });
  });

  describe("change reports", () => {
    /** Opens a project over the spec's files routing MakeCode's change notifications to it, and the readings it announces. */
    async function watched(): Promise<{ project: ManifestProject; announced: MakeCodeManifestReading[] }> {
      const project = open();
      const announced: MakeCodeManifestReading[] = [];
      project.onChange((reading) => {
        announced.push(reading);
      });
      await client.subscribe(() => {
        project.reported();
      });
      return { project, announced };
    }

    it("adopts a module edited by hand, allocating the last catalog over what it declares without renumbering it", async () => {
      const { project, announced } = await watched();
      await project.adopt(catalog(["actuator.chime.ring"]));
      const edited: MakeCodeIdManifest = {
        actions: [{ name: "actuator.chime.ring", id: 1040 }],
        operators: [],
        types: [{ name: "Beacon", atom: 1030, fields: ["y", "x"] }],
        next: { action: 1041, operator: 1024, atom: 1031 },
      };

      host.edit(IDS_MODULE_FILE, writeIdsModule(edited), { notify: true });
      while (announced.length === 0) await wait(1);

      assert.deepEqual(announced, [{ manifest: edited }]);
      assert.deepEqual(await project.current(), { manifest: edited });
      assert.equal(host.file(IDS_MODULE_FILE), writeIdsModule(edited));
      assert.deepEqual(host.mutations, [`write ${IDS_MODULE_FILE}`]);
    });

    it("allocates over an edited module the names it lacks, writing the result", async () => {
      const { project, announced } = await watched();
      await project.adopt(catalog(["actuator.chime.ring", "actuator.beacon.flash"]));
      const edited: MakeCodeIdManifest = {
        actions: [{ name: "actuator.chime.ring", id: 1040 }],
        operators: [],
        types: [{ name: "Beacon", atom: 1024, fields: ["x", "y"] }],
        next: { action: 1041, operator: 1024, atom: 1025 },
      };

      host.edit(IDS_MODULE_FILE, writeIdsModule(edited), { notify: true });
      while (announced.length === 0) await wait(1);
      await project.current();

      const grown: MakeCodeIdManifest = {
        ...edited,
        actions: [...edited.actions, { name: "actuator.beacon.flash", id: 1041 }],
        next: { action: 1042, operator: 1024, atom: 1025 },
      };
      assert.deepEqual(announced, [{ manifest: grown }]);
      assert.equal(host.file(IDS_MODULE_FILE), writeIdsModule(grown));
    });

    it("ignores the report of its own write: the module read back as written changes nothing", async () => {
      const { project, announced } = await watched();
      await project.adopt(catalog(["actuator.chime.ring"]));
      const reads = host.reads.length;

      host.notify([IDS_MODULE_FILE]);
      while (host.reads.length === reads) await wait(1);
      await project.current();

      assert.deepEqual(announced, []);
      assert.deepEqual(host.mutations, [`write ${IDS_MODULE_FILE}`]);
    });

    /**
     * Allocates a catalog of one tile, then a catalog of two others, in a
     * watched project -- the first tile keeping its id though the last catalog
     * no longer declares it -- then puts `change` to the ids module by hand,
     * notified; resolves once the project has written the module back, with
     * the allocation it held and the readings it announced.
     */
    async function restoredAfter(change: () => void): Promise<{
      held: MakeCodeManifestReading;
      announced: MakeCodeManifestReading[];
      project: ManifestProject;
    }> {
      const { project, announced } = await watched();
      await project.adopt(catalog(["actuator.beacon.old"]));
      const held = await project.adopt(catalog(["actuator.chime.ring", "actuator.beacon.flash"]));
      assert.equal(held.manifest?.actions.length, 3);
      change();
      while (host.mutations.length < 3) await wait(1);
      await project.current();
      return { held, announced, project };
    }

    it("restores a module damaged by hand from the allocation it holds, changing no id and logging the code once", async () => {
      const { held, announced, project } = await restoredAfter(() => {
        const text = host.file(IDS_MODULE_FILE) ?? "";
        host.edit(IDS_MODULE_FILE, text.replace('"actuator.chime.ring"', "actuator.chime.ring"), { notify: true });
      });

      assert.equal(host.file(IDS_MODULE_FILE), writeIdsModule(held.manifest ?? MANIFEST));
      assert.deepEqual(await project.current(), held);
      assert.deepEqual(announced, []);
      assert.deepEqual(host.mutations, [
        `write ${IDS_MODULE_FILE}`,
        `write ${IDS_MODULE_FILE}`,
        `write ${IDS_MODULE_FILE}`,
      ]);
      assert.equal(
        log.errors.filter((line) => line.startsWith(`${MakeCodeManifestProblemCode.ENTRY_MALFORMED}: `)).length,
        1
      );
    });

    it("restores an unreadable module from the allocation it holds", async () => {
      const { held, announced } = await restoredAfter(() => {
        host.edit(IDS_MODULE_FILE, "garbage typed by hand", { notify: true });
      });

      assert.equal(host.file(IDS_MODULE_FILE), writeIdsModule(held.manifest ?? MANIFEST));
      assert.deepEqual(announced, []);
      assert.equal(
        log.errors.filter((line) => line.startsWith(`${MakeCodeManifestProblemCode.UNREADABLE}: `)).length,
        1
      );
    });

    it("restores a module deleted by hand from the allocation it holds", async () => {
      const { held, announced, project } = await restoredAfter(() => {
        host.remove(IDS_MODULE_FILE, { notify: true });
      });

      assert.equal(host.file(IDS_MODULE_FILE), writeIdsModule(held.manifest ?? MANIFEST));
      assert.deepEqual(await project.current(), held);
      assert.deepEqual(announced, []);
      assert.deepEqual(log.errors, []);
    });

    it("holds a module made newer-format by hand under FORMAT_NEWER, never writing it", async () => {
      const { project, announced } = await watched();
      const allocated = await project.adopt(catalog(["actuator.chime.ring"]));
      const newer = writeIdsModule(allocated.manifest ?? MANIFEST).replace(
        `wendoo-ids-format ${IDS_MODULE_FORMAT}`,
        `wendoo-ids-format ${IDS_MODULE_FORMAT + 1}`
      );

      host.edit(IDS_MODULE_FILE, newer, { notify: true });
      while (announced.length === 0) await wait(1);
      await project.adopt(catalog(["actuator.chime.ring", "actuator.beacon.flash"]));
      await wait(20);

      assert.deepEqual(announced, [{ manifest: null, problem: MakeCodeManifestProblemCode.FORMAT_NEWER }]);
      assert.equal(host.file(IDS_MODULE_FILE), newer);
      assert.deepEqual(host.mutations, [`write ${IDS_MODULE_FILE}`]);
    });
  });
});
