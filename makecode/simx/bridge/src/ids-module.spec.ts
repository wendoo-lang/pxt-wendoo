import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { MakeCodeIdManifest } from "@wendoo/makecode-session";
import { MakeCodeManifestProblemCode } from "@wendoo/makecode-session";
import { IDS_MODULE_FORMAT, readIdsModule, writeIdsModule } from "./ids-module.js";

/**
 * The id manifest the VM extension's registration selftest compiles in a real
 * project, which must be exactly what the writer makes of the allocation
 * checked in beside it.
 */
const SELFTEST_MODULE_PATH = new URL(
  "../../../tests/vm-conformance/selftest/wendoo-lang/pxt-wendoo/ids.g.ts",
  import.meta.url
);

/** The allocation the editor made of the selftest's catalog, checked in beside the module. */
const SELFTEST_IDS_PATH = new URL("../../../tests/vm-conformance/selftest/ids.g.json", import.meta.url);

/** A manifest exercising every id space, a field list with a retired field, and names needing escapes. */
const MANIFEST: MakeCodeIdManifest = {
  actions: [
    { name: "actuator.chime.ring", id: 1024 },
    { name: 'sensor.say "hi" \\ café 😀', id: 1030 },
  ],
  operators: [{ name: "beacon.combine", id: 1024 }],
  types: [
    { name: "Beacon", atom: 1024, fields: ["x", "retired", "y"] },
    { name: "Empty", atom: 1025, fields: [] },
  ],
  next: { action: 1031, operator: 1025, atom: 1026 },
};

describe("ids module", () => {
  it("reads back exactly the manifest it wrote: every entry in order, every field list and every watermark", () => {
    assert.deepEqual(readIdsModule(writeIdsModule(MANIFEST)), { manifest: MANIFEST });
  });

  it("writes ASCII text only, whatever the names hold", () => {
    assert.match(writeIdsModule(MANIFEST), /^[\x20-\x7e\n]*$/);
  });

  it("declares its format, its watermarks, and one call per allocation inside one namespace", () => {
    const lines = writeIdsModule(MANIFEST).split("\n");

    assert.ok(lines.includes(`// wendoo-ids-format ${IDS_MODULE_FORMAT}`));
    assert.ok(lines.includes("// next-ids action 1031 operator 1025 atom 1026"));
    assert.ok(lines.includes("namespace wendooIds {"));
    assert.ok(lines.includes('    wendoo.mapActionId("actuator.chime.ring", 1024);'));
    assert.ok(lines.includes('    wendoo.mapOperatorId("beacon.combine", 1024);'));
    assert.ok(lines.includes('    wendoo.mapTypeIds("Beacon", 1024, ["x", "retired", "y"]);'));
    assert.ok(lines.includes('    wendoo.mapTypeIds("Empty", 1025, []);'));
  });

  it("writes the module the VM extension's registration selftest compiles in a real project", () => {
    const ids = JSON.parse(readFileSync(SELFTEST_IDS_PATH, "utf8")) as MakeCodeIdManifest;

    assert.equal(writeIdsModule(ids), readFileSync(SELFTEST_MODULE_PATH, "utf8"));
  });

  it("reads a module whose line ends became CRLF", () => {
    assert.deepEqual(readIdsModule(writeIdsModule(MANIFEST).replace(/\n/g, "\r\n")), { manifest: MANIFEST });
  });

  it("reads nothing from text declaring no format, reporting it UNREADABLE", () => {
    for (const text of ["", "not a module {", writeIdsModule(MANIFEST).replace("wendoo-ids-format", "x")]) {
      assert.deepEqual(readIdsModule(text), { manifest: null, problem: MakeCodeManifestProblemCode.UNREADABLE });
    }
  });

  it("reads nothing from a module declaring a newer format, reporting FORMAT_NEWER", () => {
    const text = writeIdsModule(MANIFEST).replace(
      `wendoo-ids-format ${IDS_MODULE_FORMAT}`,
      `wendoo-ids-format ${IDS_MODULE_FORMAT + 1}`
    );

    assert.deepEqual(readIdsModule(text), { manifest: null, problem: MakeCodeManifestProblemCode.FORMAT_NEWER });
  });

  it("skips each damaged entry with ENTRY_MALFORMED and reads the rest", () => {
    const text = writeIdsModule(MANIFEST)
      .replace('wendoo.mapOperatorId("beacon.combine", 1024);', "wendoo.mapOperatorId(beacon.combine, 1024);")
      .replace('["x", "retired", "y"]', '["x", 7, "y"]');

    assert.deepEqual(readIdsModule(text), {
      manifest: { ...MANIFEST, operators: [], types: [MANIFEST.types[1]] },
      problem: MakeCodeManifestProblemCode.ENTRY_MALFORMED,
    });
  });

  it("keeps the first of two entries naming one registration, reporting ENTRY_MALFORMED", () => {
    const text = writeIdsModule(MANIFEST).replace(
      '    wendoo.mapOperatorId("beacon.combine", 1024);',
      '    wendoo.mapOperatorId("beacon.combine", 1024);\n    wendoo.mapOperatorId("beacon.combine", 1027);'
    );

    assert.deepEqual(readIdsModule(text), { manifest: MANIFEST, problem: MakeCodeManifestProblemCode.ENTRY_MALFORMED });
  });

  it("derives the watermarks from the entries when their line is damaged, reporting ENTRY_MALFORMED", () => {
    const text = writeIdsModule(MANIFEST).replace("// next-ids action 1031 operator 1025 atom 1026", "// next-ids ?");

    assert.deepEqual(readIdsModule(text), {
      manifest: { ...MANIFEST, next: { action: 1031, operator: 1025, atom: 1026 } },
      problem: MakeCodeManifestProblemCode.ENTRY_MALFORMED,
    });
  });
});
