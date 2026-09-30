/**
 * The compiled programs the MakeCode VM extension and its harness carry,
 * rendered from their checked-in brain sources through the editor's own
 * compile path; each rendered file is checked in beside its sources.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { brainSourceHash } from "@wendoo/makecode-session";
import { buildAuthoringEnvironment } from "../services/authoring-environment.js";
import { compileBrainSource } from "../services/brain-source.js";

/** The repository root, as an absolute path ending in a separator. */
const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

/** Source of the empty program, relative to the repository root. */
const EMPTY_PROGRAM_SOURCE = "makecode/extensions/vm/empty.src.json";

/** The VM extension's empty-program module, relative to the repository root. */
export const EMPTY_PROGRAM_MODULE = "makecode/extensions/vm/empty.g.ts";

/** Directory of the registration selftest's program sources, relative to the repository root. */
const SELFTEST_SOURCES_DIR = "makecode/tests/vm-conformance/selftest/programs";

/** The registration selftest's compiled programs, relative to the repository root. */
export const SELFTEST_PROGRAMS_FILE = "makecode/tests/vm-conformance/selftest/programs.g.json";

/** The selftest's program sources, by file name, in the order the programs file lists them. */
const SELFTEST_SOURCES = [
  "ticker.src.json",
  "twin-a.src.json",
  "twin-b.src.json",
  "chaser.src.json",
  "unnamed.src.json",
];

/** Source the selftest's refused programs are compiled from. */
const REFUSED_PROGRAMS_SOURCE = "ticker.src.json";

/** Document id of the selftest program whose envelope carries a foreign device-profile id. */
const WRONG_PROFILE_ID = "wrongProfile0001";

/** Document id of the selftest program whose envelope declares a superseded format version. */
const WRONG_FORMAT_ID = "staleFormat00001";

/** Device-profile id the wrong-profile program carries: WODAL's micro:bit V2 world. */
const FOREIGN_PROFILE_ID = 1;

/** Format version the wrong-format program declares: the one before the codec's current format. */
const SUPERSEDED_FORMAT_VERSION = 3;

/** Byte offset of the format version in a program envelope, after the four-byte magic. */
const FORMAT_VERSION_OFFSET = 4;

/** Byte offset of the ULEB128 device-profile id in a program envelope, after the format version. */
const PROFILE_ID_OFFSET = 5;

/** One program of the selftest's programs file. */
export interface SelftestProgram {
  /** The program's document id. */
  readonly id: string;
  /** The program's display name. */
  readonly name: string;
  /** `brainSourceHash` of the source the program was compiled from. */
  readonly sourceHash: string;
  /** The compiled program, as lowercase hex. */
  readonly bytecode: string;
}

/** One file the compile path renders: its path relative to the repository root, and its text. */
export interface RenderedFile {
  readonly path: string;
  readonly text: string;
}

/** How many hex digits of a program each line of the empty-program module carries. */
const HEX_DIGITS_PER_LINE = 64;

/** The text of the checked-in file at `path`, relative to the repository root. */
function readRepoFile(path: string): string {
  return readFileSync(`${REPO_ROOT}${path}`, "utf8");
}

/** `bytes` as lowercase hex, two digits per byte. */
function hexOf(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

/** The document id and display name the brain source `source` declares. */
function identityOf(source: string): { id: string; name: string } {
  const document = JSON.parse(source) as { id: string; name: string };
  return { id: document.id, name: document.name };
}

/** The program the compile path makes of `source`. Throws when the source does not compile clean. */
function compileClean(source: string): Uint8Array {
  const { environment } = buildAuthoringEnvironment(undefined);
  const compiled = compileBrainSource(environment, source);
  if (compiled.bytecode === undefined || compiled.diagnostics.length > 0) {
    throw new Error(`source ${identityOf(source).id} does not compile clean`);
  }
  return compiled.bytecode;
}

/** `bytecode` with its envelope's device-profile id replaced by {@link FOREIGN_PROFILE_ID}. */
function withForeignProfile(bytecode: Uint8Array): Uint8Array {
  let end = PROFILE_ID_OFFSET;
  while ((bytecode[end] & 0x80) !== 0) end++;
  return Uint8Array.from([
    ...bytecode.subarray(0, PROFILE_ID_OFFSET),
    FOREIGN_PROFILE_ID,
    ...bytecode.subarray(end + 1),
  ]);
}

/** `bytecode` with its envelope declaring {@link SUPERSEDED_FORMAT_VERSION}. */
function withSupersededFormat(bytecode: Uint8Array): Uint8Array {
  const patched = Uint8Array.from(bytecode);
  patched[FORMAT_VERSION_OFFSET] = SUPERSEDED_FORMAT_VERSION;
  return patched;
}

/** The text of the VM extension's empty-program module for the program `bytecode`. */
function emptyProgramModule(bytecode: Uint8Array): string {
  const hex = hexOf(bytecode);
  const lines = [
    "// Generated by apps/editor/src/test-support/gen-vm-programs.ts from empty.src.json -- do not edit.",
    "// The empty program: one page holding no rule, so running it does nothing.",
    "",
    "namespace wendooPrograms {",
    '    //% fixedInstance block="none"',
    '    export const none = new wendoo.CompiledBrainRegistration("", "", hex`',
  ];
  for (let start = 0; start < hex.length; start += HEX_DIGITS_PER_LINE) {
    lines.push(`        ${hex.slice(start, start + HEX_DIGITS_PER_LINE)}`);
  }
  lines.push("    `);", "}", "");
  return lines.join("\n");
}

/**
 * The selftest's programs: each checked-in source compiled, then two
 * programs the loader refuses, both compiled from the ticker source -- one
 * whose envelope carries a foreign device-profile id, one whose envelope
 * declares a superseded format version.
 */
function selftestPrograms(): SelftestProgram[] {
  const programs: SelftestProgram[] = [];
  for (const file of SELFTEST_SOURCES) {
    const source = readRepoFile(`${SELFTEST_SOURCES_DIR}/${file}`);
    const { id, name } = identityOf(source);
    programs.push({ id, name, sourceHash: brainSourceHash(source), bytecode: hexOf(compileClean(source)) });
  }
  const refusedSource = readRepoFile(`${SELFTEST_SOURCES_DIR}/${REFUSED_PROGRAMS_SOURCE}`);
  const refused = compileClean(refusedSource);
  const sourceHash = brainSourceHash(refusedSource);
  programs.push({
    id: WRONG_PROFILE_ID,
    name: "Wrong profile",
    sourceHash,
    bytecode: hexOf(withForeignProfile(refused)),
  });
  programs.push({
    id: WRONG_FORMAT_ID,
    name: "Wrong format",
    sourceHash,
    bytecode: hexOf(withSupersededFormat(refused)),
  });
  return programs;
}

/** Every file the compile path renders, from the sources checked in today. */
export function renderVmPrograms(): RenderedFile[] {
  return [
    { path: EMPTY_PROGRAM_MODULE, text: emptyProgramModule(compileClean(readRepoFile(EMPTY_PROGRAM_SOURCE))) },
    { path: SELFTEST_PROGRAMS_FILE, text: `${JSON.stringify({ programs: selftestPrograms() }, null, 2)}\n` },
  ];
}

/** The checked-in text of the rendered file at `path`, relative to the repository root. */
export function checkedInText(path: string): string {
  return readRepoFile(path);
}

/** Absolute path of the rendered file at `path`, relative to the repository root. */
export function absolutePath(path: string): string {
  return `${REPO_ROOT}${path}`;
}
