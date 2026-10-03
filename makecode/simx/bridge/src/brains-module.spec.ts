import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { brainSourceHash } from "@wendoo/makecode-session";
import {
  BRAINS_MODULE_FORMAT,
  BrainsModuleProblemCode,
  type CompiledBrainEntry,
  readBrainsModule,
  writeBrainsModule,
} from "./brains-module.js";

/**
 * The brains module the VM extension's registration selftest compiles in a
 * real project, which must be exactly what the writer makes of
 * {@link SELFTEST_ENTRIES}.
 */
const SELFTEST_MODULE_PATH = new URL(
  "../../../tests/vm-conformance/selftest/wendoo-lang/pxt-wendoo/brains.g.ts",
  import.meta.url
);

/** The selftest's programs, compiled by the editor from the brain sources checked in beside them. */
const SELFTEST_PROGRAMS_PATH = new URL("../../../tests/vm-conformance/selftest/programs.g.json", import.meta.url);

/** One program of the selftest's programs file. */
interface SelftestProgram {
  id: string;
  name: string;
  sourceHash: string;
  bytecode: string;
}

/** The bytes the lowercase hex `hex` spells. */
function bytesOfHex(hex: string): Uint8Array {
  return Uint8Array.from({ length: hex.length / 2 }, (_, index) =>
    Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16)
  );
}

/**
 * The entries of the selftest's brains module: the selftest's programs,
 * among them two sharing a name, one whose name exercises quotes, a
 * backslash, non-ASCII code units and a surrogate pair, and one with an
 * empty name.
 */
const SELFTEST_ENTRIES: CompiledBrainEntry[] = (
  JSON.parse(readFileSync(SELFTEST_PROGRAMS_PATH, "utf8")) as { programs: SelftestProgram[] }
).programs.map((program) => ({
  id: program.id,
  name: program.name,
  sourceHash: program.sourceHash,
  bytecode: bytesOfHex(program.bytecode),
}));

/**
 * Entries exercising the format's edges: a name exercising quotes, a
 * backslash, non-ASCII code units and a surrogate pair, an empty name, and a
 * program covering every byte value across several hex lines.
 */
const EDGE_ENTRIES: CompiledBrainEntry[] = [
  {
    id: "abcdabcdabcdabcd",
    name: 'Chaser "one" \\ caf\u00e9 \ud83d\ude00',
    sourceHash: brainSourceHash("chaser source"),
    bytecode: Uint8Array.from([0x57, 0x44, 0x4f]),
  },
  {
    id: "0000111122223333",
    name: "",
    sourceHash: brainSourceHash("runner source"),
    bytecode: Uint8Array.from({ length: 256 }, (_, index) => index),
  },
];

/** Every problem code `reading` reports, in order. */
function codes(reading: ReturnType<typeof readBrainsModule>): string[] {
  return reading.problems.map((problem) => problem.code);
}

describe("brains module", () => {
  it("reads back exactly the entries it wrote: ids, names, source hashes and every byte", () => {
    const text = writeBrainsModule(EDGE_ENTRIES);

    const reading = readBrainsModule(text);

    assert.equal(reading.format, BRAINS_MODULE_FORMAT);
    assert.deepEqual(reading.problems, []);
    assert.deepEqual([...reading.entries.keys()], ["0000111122223333", "abcdabcdabcdabcd"]);
    for (const entry of EDGE_ENTRIES) assert.deepEqual(reading.entries.get(entry.id), entry);
  });

  it("round-trips names carrying line breaks, line and paragraph separators, and control characters", () => {
    const entry: CompiledBrainEntry = {
      id: "abcdabcdabcdabcd",
      name: "one\ntwo\r\u2028\u2029\u0000\t`$\u007bx}`*/",
      sourceHash: "00000000",
      bytecode: new Uint8Array([1]),
    };

    assert.deepEqual(readBrainsModule(writeBrainsModule([entry])).entries.get(entry.id), entry);
  });

  it("writes ASCII text only, whatever the names hold", () => {
    const text = writeBrainsModule(EDGE_ENTRIES);

    assert.match(text, /^[\x20-\x7e\n]*$/);
  });

  it("writes the same text for the same entries in any order", () => {
    assert.equal(writeBrainsModule(EDGE_ENTRIES), writeBrainsModule([...EDGE_ENTRIES].reverse()));
  });

  it("writes a module registering no brain when given none, which reads back empty", () => {
    const reading = readBrainsModule(writeBrainsModule([]));

    assert.equal(reading.format, BRAINS_MODULE_FORMAT);
    assert.equal(reading.entries.size, 0);
    assert.deepEqual(reading.problems, []);
  });

  it("writes the module the VM extension's registration selftest compiles in a real project", () => {
    assert.equal(writeBrainsModule(SELFTEST_ENTRIES), readFileSync(SELFTEST_MODULE_PATH, "utf8"));
  });

  it("declares each brain as a fixed instance labelled by its name, bound by its document id", () => {
    const text = writeBrainsModule(EDGE_ENTRIES);

    assert.ok(text.includes("namespace wendooBrains {\n"));
    const declaration = text.split("\n").findIndex((line) => line.includes("p_abcdabcdabcdabcd"));
    assert.equal(
      text.split("\n")[declaration],
      '    export const p_abcdabcdabcdabcd = wendoo.registerCompiledBrain("abcdabcdabcdabcd", ' +
        '"Chaser \\"one\\" \\\\ caf\\u00e9 \\ud83d\\ude00", hex`'
    );
    assert.equal(
      text.split("\n")[declaration - 1],
      '    //% fixedInstance block="Chaser \\u0022one\\u0022 \\\\ caf\\u00e9 \\ud83d\\ude00"'
    );
  });

  it("labels a brain with an empty name by its document id", () => {
    const lines = writeBrainsModule(EDGE_ENTRIES).split("\n");
    const declaration = lines.findIndex((line) => line.includes("p_0000111122223333"));

    assert.equal(lines[declaration - 1], '    //% fixedInstance block="0000111122223333"');
  });

  it("names each declaration for its document id, escaping what an identifier cannot carry", () => {
    const lines = writeBrainsModule([{ ...EDGE_ENTRIES[0], id: "a-b_c" }]).split("\n");

    assert.ok(
      lines.includes(
        '    export const p_a_002db_005fc = wendoo.registerCompiledBrain("a-b_c", ' +
          '"Chaser \\"one\\" \\\\ caf\\u00e9 \\ud83d\\ude00", hex`'
      )
    );
    assert.deepEqual([...readBrainsModule(lines.join("\n")).entries.keys()], ["a-b_c"]);
  });

  it("writes block labels that read back through pxt's attribute grammar as the name", () => {
    const names = ['say "hi"', "back\\slash", "tab\there", "caf\u00e9 \ud83d\ude00", "50% off $x"];
    for (const name of names) {
      const text = writeBrainsModule([{ ...EDGE_ENTRIES[0], name }]);
      const label = /\/\/% fixedInstance block=("[^"\n]*")$/m.exec(text);

      assert.ok(label, name);
      assert.equal(JSON.parse(label[1]), name);
    }
  });

  it("reads a module whose line ends became CRLF", () => {
    const text = writeBrainsModule(EDGE_ENTRIES).replace(/\n/g, "\r\n");

    assert.equal(readBrainsModule(text).entries.size, 2);
  });

  it("reads nothing from text declaring no format, reporting it UNREADABLE", () => {
    for (const text of ["", "not a module {", writeBrainsModule(EDGE_ENTRIES).replace("wendoo-brains-format", "x")]) {
      const reading = readBrainsModule(text);

      assert.equal(reading.entries.size, 0);
      assert.deepEqual(codes(reading), [BrainsModuleProblemCode.UNREADABLE]);
    }
  });

  it("reads nothing from a module declaring its entries in another namespace, reporting it UNREADABLE", () => {
    const text = writeBrainsModule(EDGE_ENTRIES).replace("namespace wendooBrains {", "namespace wendooPrograms {");

    const reading = readBrainsModule(text);

    assert.equal(reading.entries.size, 0);
    assert.deepEqual(codes(reading), [BrainsModuleProblemCode.UNREADABLE]);
  });

  it("reads nothing from a module declaring a newer format, reporting FORMAT_NEWER", () => {
    const text = writeBrainsModule(EDGE_ENTRIES).replace(
      `wendoo-brains-format ${BRAINS_MODULE_FORMAT}`,
      `wendoo-brains-format ${BRAINS_MODULE_FORMAT + 1}`
    );

    const reading = readBrainsModule(text);

    assert.equal(reading.format, BRAINS_MODULE_FORMAT + 1);
    assert.equal(reading.entries.size, 0);
    assert.deepEqual(codes(reading), [BrainsModuleProblemCode.FORMAT_NEWER]);
  });

  it("skips each damaged entry with ENTRY_MALFORMED on its line and reads the rest", () => {
    const damages: [string, (text: string) => string][] = [
      [
        "a hash line gone",
        (text) => text.replace(/ {4}\/\/ source-hash [0-9a-f]{8}\n( {4}\/\/% fixedInstance block="Chaser)/, "$1"),
      ],
      [
        "a hash that is not eight hex digits",
        (text) => text.replace(/source-hash [0-9a-f]{8}(\n {4}\/\/% fixedInstance block="Chaser)/, "source-hash xyz$1"),
      ],
      ["a block label gone", (text) => text.replace(/ {4}\/\/% fixedInstance block="Chaser[^\n]*\n/, "")],
      ["a block label other than the name", (text) => text.replace('block="Chaser', 'block="Chased')],
      ["a declaration named for another id", (text) => text.replace("p_abcdabcdabcdabcd", "p_abcdabcdabcdabce")],
      ["a name literal broken", (text) => text.replace('"Chaser \\"one', '"Chaser "one')],
      ["a stray character among the hex", (text) => text.replace(/(\n {8})57/, "$1g7")],
      ["an odd number of hex digits", (text) => text.replace(/(\n {8})57/, "$15")],
      ["the closing line gone", (text) => text.replace(/ {4}`\);\n\}\n$/, "}\n")],
    ];
    const text = writeBrainsModule(EDGE_ENTRIES);

    for (const [what, damage] of damages) {
      const damaged = damage(text);
      assert.notEqual(damaged, text, what);
      const callLine = damaged.split("\n").findIndex((line) => line.includes('"abcdabcdabcdabcd"')) + 1;

      const reading = readBrainsModule(damaged);

      assert.deepEqual([...reading.entries.keys()], ["0000111122223333"], what);
      assert.deepEqual(reading.problems, [{ code: BrainsModuleProblemCode.ENTRY_MALFORMED, line: callLine }], what);
    }
  });

  it("keeps the first of two entries under one id", () => {
    const [chaser] = EDGE_ENTRIES;
    const first = writeBrainsModule([chaser]);
    const second = writeBrainsModule([{ ...chaser, name: "Second" }]);
    const text = `${first}${second.slice(second.indexOf("\n\n"))}`;

    const reading = readBrainsModule(text);

    assert.deepEqual(reading.problems, []);
    assert.equal(reading.entries.get(chaser.id)?.name, chaser.name);
  });
});
