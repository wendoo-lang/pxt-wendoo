import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { MakeCodeIdManifest, MakeCodeManifestReading } from "@wendoo/makecode-session";
import { MakeCodeManifestProblemCode } from "@wendoo/makecode-session";
import { IDS_MODULE_FILE, IDS_MODULE_FORMAT, readIdsModule, writeIdsModule } from "./ids-module.js";
import { ManifestProject } from "./manifest-project.js";
import type { SimxLog } from "./simx-bridge.js";
import { FakeProjfsHost } from "./test-support/projfs-host.js";
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

const MANIFEST: MakeCodeIdManifest = {
  actions: [{ name: "actuator.chime.ring", id: 1024 }],
  operators: [],
  types: [{ name: "Beacon", atom: 1024, fields: ["x", "y"] }],
  next: { action: 1025, operator: 1024, atom: 1025 },
};

describe("manifest project", () => {
  let host: FakeProjfsHost;
  let client: ProjfsClient;
  let log: RecordingLog;
  let project: ManifestProject;

  beforeEach(() => {
    host = new FakeProjfsHost();
    client = host.client();
    log = new RecordingLog();
    project = new ManifestProject(client, log);
  });

  afterEach(() => {
    client.dispose();
  });

  /** Asks the project for its manifest and resolves with the answer. */
  function read(): Promise<Answer<MakeCodeManifestReading>> {
    return new Promise((resolve) => {
      project.serve({
        kind: "read",
        reply: (reading) => resolve({ ok: true, value: reading }),
        fail: (message) => resolve({ ok: false, message }),
      });
    });
  }

  /** Asks the project to write `manifest` and resolves with the answer. */
  function write(manifest: MakeCodeIdManifest): Promise<Answer<undefined>> {
    return new Promise((resolve) => {
      project.serve({
        kind: "write",
        manifest,
        ack: () => resolve({ ok: true, value: undefined }),
        fail: (message) => resolve({ ok: false, message }),
      });
    });
  }

  it("reads a project holding no ids module as holding no manifest", async () => {
    assert.deepEqual(await read(), { ok: true, value: { manifest: null } });
  });

  it("writes the manifest to ids.g.ts as an artifact, and reads back what it wrote", async () => {
    assert.deepEqual(await write(MANIFEST), { ok: true, value: undefined });

    assert.equal(host.file(IDS_MODULE_FILE), writeIdsModule(MANIFEST));
    assert.deepEqual(host.mutations, [`write ${IDS_MODULE_FILE}`]);
    assert.deepEqual(await read(), { ok: true, value: { manifest: MANIFEST } });
  });

  it("skips a write that would not change the module, acknowledging it", async () => {
    await write(MANIFEST);

    assert.deepEqual(await write(MANIFEST), { ok: true, value: undefined });
    assert.deepEqual(host.mutations, [`write ${IDS_MODULE_FILE}`]);
  });

  it("reads an unreadable module as no manifest under UNREADABLE, logs its code, and a write replaces it", async () => {
    host.edit(IDS_MODULE_FILE, "garbage typed by hand");

    assert.deepEqual(await read(), {
      ok: true,
      value: { manifest: null, problem: MakeCodeManifestProblemCode.UNREADABLE },
    });
    assert.match(log.errors[0] ?? "", new RegExp(`^${MakeCodeManifestProblemCode.UNREADABLE}: ${IDS_MODULE_FILE}`));
    assert.deepEqual(await write(MANIFEST), { ok: true, value: undefined });
    assert.deepEqual(readIdsModule(host.file(IDS_MODULE_FILE) ?? ""), { manifest: MANIFEST });
  });

  it("reads a module with a damaged entry as the rest under ENTRY_MALFORMED, and a write heals it", async () => {
    host.edit(IDS_MODULE_FILE, writeIdsModule(MANIFEST).replace('"actuator.chime.ring"', "actuator.chime.ring"));

    const answer = await read();

    assert.deepEqual(answer, {
      ok: true,
      value: { manifest: { ...MANIFEST, actions: [] }, problem: MakeCodeManifestProblemCode.ENTRY_MALFORMED },
    });
    await write(MANIFEST);
    assert.equal(host.file(IDS_MODULE_FILE), writeIdsModule(MANIFEST));
  });

  it("reads a module of a newer format as no manifest under FORMAT_NEWER, and refuses every write, keeping it", async () => {
    const newer = writeIdsModule(MANIFEST).replace(
      `wendoo-ids-format ${IDS_MODULE_FORMAT}`,
      `wendoo-ids-format ${IDS_MODULE_FORMAT + 1}`
    );
    host.edit(IDS_MODULE_FILE, newer);

    assert.deepEqual(await read(), {
      ok: true,
      value: { manifest: null, problem: MakeCodeManifestProblemCode.FORMAT_NEWER },
    });
    const answer = await write(MANIFEST);

    assert.equal(answer.ok, false);
    assert.match(answer.ok ? "" : answer.message, new RegExp(`^${MakeCodeManifestProblemCode.FORMAT_NEWER}\\b`));
    assert.equal(host.file(IDS_MODULE_FILE), newer);
    assert.deepEqual(host.mutations, []);
  });

  it("fails a read and a write with the reason when no project is open in MakeCode", async () => {
    host.open = false;

    const read1 = await read();
    const written = await write(MANIFEST);

    assert.match(read1.ok ? "" : read1.message, /^PROJECT_CLOSED\b/);
    assert.match(written.ok ? "" : written.message, /^PROJECT_CLOSED\b/);
  });

  it("fails a write carrying no manifest the module can declare, and answers later requests as usual", async () => {
    const garbled = {
      ...MANIFEST,
      types: [{ name: "Beacon", atom: 1024, fields: 7 }],
    } as unknown as MakeCodeIdManifest;

    const answer = await write(garbled);

    assert.equal(answer.ok, false);
    assert.deepEqual(host.mutations, []);
    assert.deepEqual(await read(), { ok: true, value: { manifest: null } });
  });
});
