/**
 * The compiled programs the MakeCode VM extension and its harness carry,
 * rendered from their checked-in brain sources through the editor's own
 * compile path; each rendered file is checked in beside its sources. For
 * the registration selftest that includes the editor's id allocation for the
 * selftest's catalog, the ids module and brains module the Wendoo simulator
 * extension writes of it, and the reference VM's trace of the program placing
 * a pack tile; for the arcade selftest, the ids module and brains module of
 * its programs, compiled against the arcade base pack's catalog under the
 * editor's allocation for it.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ObservableTraceWriter, observableTraceVmEvents } from "@wendoo/conformance";
import { stream } from "@wendoo/core";
import { BrainDef, mkModifierTileId, mkSensorTileId } from "@wendoo/core/app";
import type { BrainPageDef, BrainRuleDef } from "@wendoo/core/brain/model";
import { BrainRuntime, linkedBrainProgramFromBytes } from "@wendoo/core/runtime";
import type { MakeCodeIdManifest } from "@wendoo/makecode-session";
import { brainSourceHash, MAKECODE_VM_PROFILE_ID } from "@wendoo/makecode-session";
import { writeBrainsModule } from "../../../../makecode/simx/bridge/src/brains-module.js";
import { writeIdsModule } from "../../../../makecode/simx/bridge/src/ids-module.js";
import { buildAuthoringEnvironment, MAKECODE_VM_PRECISION } from "../services/authoring-environment.js";
import { compileBrainSource } from "../services/brain-source.js";
import type { CatalogArgNode, CatalogArgSlot } from "../services/catalog.js";
import { parseCatalog } from "../services/catalog.js";
import { allocateIds } from "../services/id-allocation.js";
import { type ProjectedSentence, projectedSentence } from "./sentence-projection.js";

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
  "ringer.src.json",
];

/** The catalog the registration selftest's packs serialize, which the selftest pins byte for byte. */
const SELFTEST_CATALOG = "makecode/tests/vm-conformance/selftest/catalog.json";

/** The editor's id allocation for the selftest's catalog, relative to the repository root. */
export const SELFTEST_IDS_FILE = "makecode/tests/vm-conformance/selftest/ids.g.json";

/** The ids module the selftest project carries, as the simulator extension writes it. */
export const SELFTEST_IDS_MODULE = "makecode/tests/vm-conformance/selftest/wendoo-lang/pxt-wendoo/ids.g.ts";

/** The brains module the selftest project carries, as the simulator extension writes it. */
export const SELFTEST_BRAINS_MODULE = "makecode/tests/vm-conformance/selftest/wendoo-lang/pxt-wendoo/brains.g.ts";

/** The reference VM's trace of the program placing a pack tile, relative to the repository root. */
export const SELFTEST_TRACE_FILE = "makecode/tests/vm-conformance/selftest/ringer.trace";

/** Source of the program placing the chime pack's ring tile. */
const RINGER_SOURCE = "ringer.src.json";

/** Milliseconds of scheduled time each think of the traced run advances, one think per entry; the selftest runs the same schedule. */
const RINGER_SCHEDULE = [20, 20, 20];

/**
 * The allocation the selftest project held before its catalog's current
 * vocabulary: an earlier beacon pack declared `y` and a field it has since
 * retired. Its fields keep their ids, so the beacon type's layout is the
 * allocation's and not its declaration order.
 */
const SELFTEST_PRIOR_IDS: MakeCodeIdManifest = {
  actions: [],
  operators: [],
  types: [{ name: "Beacon", atom: 1024, fields: ["y", "retired"] }],
  next: { action: 1024, operator: 1024, atom: 1025 },
};

/** The chime pack's tile the allocation predates, which the selftest's drain finds unmapped. */
const UNALLOCATED_TILE = "sensor.chime.unmapped";

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

/**
 * The catalog the arcade selftest's game serializes -- the arcade base
 * pack's vocabulary -- which the arcade selftest pins byte for byte.
 */
const ARCADE_CATALOG = "makecode/tests/vm-conformance/selftest/arcade/catalog.json";

/** Directory of the arcade selftest's own program sources, relative to the repository root. */
const ARCADE_SOURCES_DIR = "makecode/tests/vm-conformance/selftest/arcade/programs";

/** The registration selftest's program sources the arcade selftest also runs, by file name. */
const ARCADE_SHARED_SOURCES = ["ticker.src.json", "twin-a.src.json", "twin-b.src.json"];

/** The arcade selftest's own program sources, by file name: each places the arcade base pack's tiles. */
const ARCADE_SOURCES = [
  "follow.src.json",
  "rails.src.json",
  "corner.src.json",
  "corner-flipped.src.json",
  "drift.src.json",
  "counted.src.json",
  "dash.src.json",
  "creep.src.json",
  "paced.src.json",
  "blend.src.json",
  "climb.src.json",
  "sink.src.json",
  "retreat.src.json",
  "advance.src.json",
  "veer.src.json",
  "veer-flipped.src.json",
  "stall.src.json",
  "steer.src.json",
  "sprint.src.json",
  "sprint-flipped.src.json",
  "swerve.src.json",
  "guard.src.json",
  "nudge.src.json",
  "flee.src.json",
  "chase.src.json",
  "shy.src.json",
  "waver.src.json",
  "waver-flipped.src.json",
  "stalk.src.json",
  "stalk-flipped.src.json",
  "dodge.src.json",
  "lunge.src.json",
  "skulk.src.json",
  "tether.src.json",
  "homing.src.json",
  "skittish.src.json",
  "near.src.json",
  "far.src.json",
  "either.src.json",
  "either-40.src.json",
  "either-negative.src.json",
  "leash.src.json",
  "keep-away.src.json",
  "standoff.src.json",
  "leash-quickly.src.json",
  "keep-away-slowly.src.json",
];

/** The arcade selftest's program source the compile path must refuse: a dpad given the same direction modifier twice. */
export const ARCADE_REFUSED_SOURCE = "doubled-up.src.json";

/** The ids module the arcade selftest project carries, as the simulator extension writes it. */
export const ARCADE_IDS_MODULE = "makecode/tests/vm-conformance/selftest/arcade/wendoo-lang/pxt-wendoo/ids.g.ts";

/** The brains module the arcade selftest project carries, as the simulator extension writes it. */
export const ARCADE_BRAINS_MODULE = "makecode/tests/vm-conformance/selftest/arcade/wendoo-lang/pxt-wendoo/brains.g.ts";

/**
 * Document id of the arcade selftest program placing the move tile under an
 * action id the arcade selftest's allocation does not hold: the drift source
 * compiled under an allocation whose action ids start at
 * {@link UNMAPPED_ID_BASE}.
 */
const UNMAPPED_ACTION_PROGRAM_ID = "unmappedMove0001";

/**
 * Document id of the arcade selftest program typed by a Vector2 atom the
 * arcade selftest's allocation does not hold: the dash source compiled under
 * an allocation whose type atoms start at {@link UNMAPPED_ID_BASE}.
 */
const UNMAPPED_ATOM_PROGRAM_ID = "unmappedType0001";

/** First id the allocations of the unmapped-id programs hand out: beyond every id the arcade selftest's allocation holds. */
const UNMAPPED_ID_BASE = 1100;

/** The allocation an arcade project holds before its first catalog: none. */
const EMPTY_IDS: MakeCodeIdManifest = {
  actions: [],
  operators: [],
  types: [],
  next: { action: 1024, operator: 1024, atom: 1024 },
};

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

/** The selftest's catalog as the session delivers it: the payload text the selftest's packs serialize. */
function selftestCatalog(): string {
  return JSON.stringify(JSON.parse(readRepoFile(SELFTEST_CATALOG)));
}

/**
 * The editor's allocation for the selftest's catalog: the prior allocation
 * with every name the catalog declares appended, but for the one tile that
 * arrived after it was made.
 */
function selftestIds(): MakeCodeIdManifest {
  const catalog = parseCatalog(selftestCatalog());
  const allocated = {
    ...catalog,
    packs: catalog.packs.map((pack) => ({
      ...pack,
      tiles: pack.tiles.filter((tile) => tile.name !== UNALLOCATED_TILE),
    })),
  };
  return allocateIds(SELFTEST_PRIOR_IDS, allocated);
}

/** The program the compile path makes of `source` in the core environment. Throws when the source does not compile clean. */
function compileClean(source: string): Uint8Array {
  return compileCleanIn(buildAuthoringEnvironment(undefined).environment, source);
}

/** The program the compile path makes of `source` in `environment`. Throws when the source does not compile clean. */
function compileCleanIn(
  environment: ReturnType<typeof buildAuthoringEnvironment>["environment"],
  source: string
): Uint8Array {
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
    "namespace wendooBrains {",
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
  const { environment } = buildAuthoringEnvironment(selftestCatalog(), selftestIds());
  return [
    ...SELFTEST_SOURCES.map((file) => compiledProgram(environment, `${SELFTEST_SOURCES_DIR}/${file}`)),
    ...refusedPrograms(),
  ];
}

/** The program `environment` compiles from the source at `path`, relative to the repository root. Throws when it does not compile clean. */
function compiledProgram(
  environment: ReturnType<typeof buildAuthoringEnvironment>["environment"],
  path: string
): SelftestProgram {
  const source = readRepoFile(path);
  const { id, name } = identityOf(source);
  return { id, name, sourceHash: brainSourceHash(source), bytecode: hexOf(compileCleanIn(environment, source)) };
}

/**
 * The two programs the loader refuses, both compiled from the ticker source:
 * one whose envelope carries a foreign device-profile id, one whose envelope
 * declares a superseded format version.
 */
function refusedPrograms(): SelftestProgram[] {
  const refusedSource = readRepoFile(`${SELFTEST_SOURCES_DIR}/${REFUSED_PROGRAMS_SOURCE}`);
  const refused = compileClean(refusedSource);
  const sourceHash = brainSourceHash(refusedSource);
  return [
    { id: WRONG_PROFILE_ID, name: "Wrong profile", sourceHash, bytecode: hexOf(withForeignProfile(refused)) },
    { id: WRONG_FORMAT_ID, name: "Wrong format", sourceHash, bytecode: hexOf(withSupersededFormat(refused)) },
  ];
}

/** The arcade selftest's catalog as the session delivers it: the payload text the arcade base pack serializes. */
function arcadeCatalog(): string {
  return JSON.stringify(JSON.parse(readRepoFile(ARCADE_CATALOG)));
}

/** The editor's allocation for the arcade selftest's catalog, made in a project holding none. */
function arcadeIds(): MakeCodeIdManifest {
  return allocateIds(EMPTY_IDS, parseCatalog(arcadeCatalog()));
}

/** The environment binding the arcade selftest's catalog under its allocation. */
function arcadeEnvironment(): ReturnType<typeof buildAuthoringEnvironment>["environment"] {
  return buildAuthoringEnvironment(arcadeCatalog(), arcadeIds()).environment;
}

/**
 * The arcade selftest's programs: the registration selftest's ticker and
 * twins, the arcade selftest's own programs, the two programs the loader
 * refuses, and the two programs referencing ids the arcade selftest's
 * allocation does not hold.
 */
function arcadePrograms(): SelftestProgram[] {
  const environment = arcadeEnvironment();
  return [
    ...ARCADE_SHARED_SOURCES.map((file) => compiledProgram(environment, `${SELFTEST_SOURCES_DIR}/${file}`)),
    ...ARCADE_SOURCES.map((file) => compiledProgram(environment, `${ARCADE_SOURCES_DIR}/${file}`)),
    ...refusedPrograms(),
    ...unmappedIdPrograms(),
  ];
}

/**
 * The two arcade selftest programs referencing ids the arcade selftest's
 * allocation does not hold, as a program compiled after the allocation grew
 * does: the drift source compiled with every action id from
 * {@link UNMAPPED_ID_BASE}, and the dash source compiled with every type atom
 * from it.
 */
function unmappedIdPrograms(): SelftestProgram[] {
  return [
    unmappedIdProgram({ action: UNMAPPED_ID_BASE }, "drift.src.json", UNMAPPED_ACTION_PROGRAM_ID, "Unmapped move"),
    unmappedIdProgram({ atom: UNMAPPED_ID_BASE }, "dash.src.json", UNMAPPED_ATOM_PROGRAM_ID, "Unmapped type"),
  ];
}

/**
 * The program `id`, named `name`, compiled from the arcade selftest's
 * program source `file` in the environment binding the arcade selftest's
 * catalog under an allocation made in a project holding none, its next ids
 * replaced by `next`. Throws when the source does not compile clean.
 */
function unmappedIdProgram(
  next: Partial<MakeCodeIdManifest["next"]>,
  file: string,
  id: string,
  name: string
): SelftestProgram {
  const ids = allocateIds({ ...EMPTY_IDS, next: { ...EMPTY_IDS.next, ...next } }, parseCatalog(arcadeCatalog()));
  const { environment } = buildAuthoringEnvironment(arcadeCatalog(), ids);
  const source = readRepoFile(`${ARCADE_SOURCES_DIR}/${file}`);
  return { id, name, sourceHash: brainSourceHash(source), bytecode: hexOf(compileCleanIn(environment, source)) };
}

/** The stable codes of the problems binding the arcade selftest's catalog under its allocation reports, in the order reported. */
export function arcadeBindingDiagnosticCodes(): string[] {
  return buildAuthoringEnvironment(arcadeCatalog(), arcadeIds()).diagnostics.map((diagnostic) => diagnostic.code);
}

/**
 * Whether the environment binding the arcade selftest's catalog under its
 * allocation holds the shared modifier tile declared as `modifierId`.
 *
 * @param modifierId - The modifier's declared fragment, such as `modifier.direction.up`.
 */
export function arcadeHoldsModifier(modifierId: string): boolean {
  const tileId = mkModifierTileId(modifierId);
  return arcadeEnvironment()
    .tileCatalogs()
    .some((catalog) => catalog.has(tileId));
}

/**
 * The label the environment binding the arcade selftest's catalog under its
 * allocation gives the shared modifier tile declared as `modifierId`: what
 * the tile picker displays for it. `undefined` when no catalog holds it.
 *
 * @param modifierId - The modifier's declared fragment, such as `modifier.direction.up`.
 */
export function arcadeModifierLabel(modifierId: string): string | undefined {
  const tileId = mkModifierTileId(modifierId);
  for (const catalog of arcadeEnvironment().tileCatalogs()) {
    const found = catalog.get(tileId);
    if (found !== undefined) return found.metadata?.label;
  }
  return undefined;
}

/**
 * The label the environment binding the arcade selftest's catalog under its
 * allocation gives the sensor tile named `tileName`: what the tile picker
 * displays for it. `undefined` when no catalog holds it.
 *
 * @param tileName - The sensor's name, such as `sensor.arcade.bump`.
 */
export function arcadeSensorLabel(tileName: string): string | undefined {
  const tileId = mkSensorTileId(tileName);
  for (const catalog of arcadeEnvironment().tileCatalogs()) {
    const found = catalog.get(tileId);
    if (found !== undefined) return found.metadata?.label;
  }
  return undefined;
}

/**
 * The label the arcade selftest's catalog carries on the tile named
 * `tileName`, or `undefined` when it carries none or holds no such tile.
 *
 * @param tileName - The tile's name, such as `sensor.arcade.bump`.
 */
export function arcadeCarriedTileLabel(tileName: string): string | undefined {
  return parseCatalog(arcadeCatalog())
    .packs.flatMap((pack) => pack.tiles)
    .find((entry) => entry.name === tileName)?.label;
}

/** Sentence words a catalog entry carries, each field absent when undeclared. */
export interface CarriedLanguage {
  readonly form?: string;
  readonly frame?: string;
  readonly bare?: string;
}

/** The names of the sensors the arcade selftest's catalog declares, in catalog order. */
export function arcadeSensorNames(): string[] {
  return parseCatalog(arcadeCatalog())
    .packs.flatMap((pack) => pack.tiles)
    .filter((entry) => entry.kind === "sensor")
    .map((entry) => entry.name);
}

/**
 * The sentence words the arcade selftest's catalog document carries on the
 * tile named `tileName`, read from the document's JSON itself, or
 * `undefined` when it carries none or holds no such tile.
 *
 * @param tileName - The tile's name, such as `sensor.arcade.bump`.
 */
export function arcadeCarriedTileLanguage(tileName: string): CarriedLanguage | undefined {
  const document = JSON.parse(arcadeCatalog()) as {
    packs: { tiles?: { name: string; language?: CarriedLanguage }[] }[];
  };
  return document.packs.flatMap((pack) => pack.tiles ?? []).find((entry) => entry.name === tileName)?.language;
}

/**
 * The projected sentence, read as data, of a rule whose WHEN side is the
 * sensor named `tileName` alone and whose DO side is empty, in the
 * environment binding the arcade selftest's catalog under its allocation.
 *
 * @param tileName - The sensor's name, such as `sensor.arcade.bump`.
 */
export function arcadeLoneSensorSentence(tileName: string): ProjectedSentence {
  const environment = arcadeEnvironment();
  const tileId = mkSensorTileId(tileName);
  const sensor = environment
    .tileCatalogs()
    .map((catalog) => catalog.get(tileId))
    .find((found) => found !== undefined);
  if (sensor === undefined) throw new Error(`no sensor ${tileName}`);
  const brainDef = BrainDef.emptyBrainDef(environment.brainServices, "lone-sensor");
  const rule = (brainDef.pages().get(0) as BrainPageDef).children().get(0) as BrainRuleDef;
  rule.when().appendTile(sensor);
  return projectedSentence(rule);
}

/** The grammar nodes directly below `node`, in declaration order; empty for a slot. */
function childNodes(node: CatalogArgNode): readonly CatalogArgNode[] {
  switch (node.kind) {
    case "arg":
      return [];
    case "seq":
    case "bag":
      return node.items;
    case "choice":
      return node.options;
    case "optional":
    case "repeat":
      return [node.item];
    case "conditional":
      return node.else === undefined ? [node.then] : [node.then, node.else];
  }
}

/** Every slot in the grammar nodes `nodes` and the nodes under them, in declaration order. */
function slotsOf(nodes: readonly CatalogArgNode[]): CatalogArgSlot[] {
  return nodes.flatMap((node) => (node.kind === "arg" ? [node] : slotsOf(childNodes(node))));
}

/**
 * The label the arcade selftest's catalog carries on the slot of the tile
 * `tileName` that `slotTileId` fills, or `undefined` when that slot carries
 * none or the tile has no such slot.
 *
 * @param tileName - The tile's name, such as `actuator.arcade.move`.
 * @param slotTileId - The slot's declared fragment.
 */
export function arcadeCarriedSlotLabel(tileName: string, slotTileId: string): string | undefined {
  const tile = parseCatalog(arcadeCatalog())
    .packs.flatMap((pack) => pack.tiles)
    .find((entry) => entry.name === tileName);
  return slotsOf(tile?.grammar ?? []).find((slot) => slot.tileId === slotTileId)?.label;
}

/**
 * The stable codes of the diagnostics compiling the arcade selftest's
 * program source `file` reports in the environment binding the arcade
 * selftest's catalog, in the order reported.
 *
 * @param file - File name of the source, in the arcade selftest's program sources.
 */
export function arcadeCompileDiagnosticCodes(file: string): number[] {
  const compiled = compileBrainSource(arcadeEnvironment(), readRepoFile(`${ARCADE_SOURCES_DIR}/${file}`));
  return compiled.diagnostics.map((diagnostic) => diagnostic.code);
}

/** The bytes the lowercase hex `hex` spells. */
function bytesOfHex(hex: string): Uint8Array {
  return Uint8Array.from({ length: hex.length / 2 }, (_, index) =>
    Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16)
  );
}

/**
 * The reference VM's observable trace of `bytecode` run over
 * {@link RINGER_SCHEDULE} in the environment binding the selftest's catalog
 * under its allocation: a tick line before each think, then the actions the
 * think dispatches.
 */
function referenceTrace(bytecode: Uint8Array): string {
  const { environment } = buildAuthoringEnvironment(selftestCatalog(), selftestIds());
  const services = environment.brainServices;
  const decoded = linkedBrainProgramFromBytes(stream.byteArrayFromUint8Array(bytecode), {
    precision: MAKECODE_VM_PRECISION,
    typeRegistry: services.runtime.types,
  });
  const writer = new ObservableTraceWriter({ profileId: MAKECODE_VM_PROFILE_ID, precision: MAKECODE_VM_PRECISION });
  const runtime = new BrainRuntime(
    decoded.program.program,
    decoded.program.pages,
    { runtime: services.runtime, shared: services.shared, app: services.app },
    undefined,
    undefined,
    observableTraceVmEvents(writer)
  );
  runtime.startup();
  let time = 0;
  for (const [index, advance] of RINGER_SCHEDULE.entries()) {
    const next = time + advance;
    writer.tick(index + 1, next, time === 0 ? 0 : next - time);
    runtime.think(next);
    time = next;
  }
  return writer.render();
}

/** Every file the compile path renders, from the sources checked in today. */
export function renderVmPrograms(): RenderedFile[] {
  const programs = selftestPrograms();
  const ids = selftestIds();
  const ringer = programs.find(
    (program) => program.id === identityOf(readRepoFile(`${SELFTEST_SOURCES_DIR}/${RINGER_SOURCE}`)).id
  );
  if (ringer === undefined) throw new Error("no ringer program");
  return [
    { path: EMPTY_PROGRAM_MODULE, text: emptyProgramModule(compileClean(readRepoFile(EMPTY_PROGRAM_SOURCE))) },
    { path: SELFTEST_PROGRAMS_FILE, text: `${JSON.stringify({ programs }, null, 2)}\n` },
    { path: SELFTEST_IDS_FILE, text: `${JSON.stringify(ids, null, 2)}\n` },
    { path: SELFTEST_IDS_MODULE, text: writeIdsModule(ids) },
    { path: SELFTEST_BRAINS_MODULE, text: brainsModuleOf(programs) },
    { path: SELFTEST_TRACE_FILE, text: referenceTrace(bytesOfHex(ringer.bytecode)) },
    { path: ARCADE_IDS_MODULE, text: writeIdsModule(arcadeIds()) },
    { path: ARCADE_BRAINS_MODULE, text: brainsModuleOf(arcadePrograms()) },
  ];
}

/** The text of the brains module the simulator extension writes for `programs`. */
function brainsModuleOf(programs: readonly SelftestProgram[]): string {
  return writeBrainsModule(
    programs.map((program) => ({
      id: program.id,
      name: program.name,
      sourceHash: program.sourceHash,
      bytecode: bytesOfHex(program.bytecode),
    }))
  );
}

/** The checked-in text of the rendered file at `path`, relative to the repository root. */
export function checkedInText(path: string): string {
  return readRepoFile(path);
}

/** Absolute path of the rendered file at `path`, relative to the repository root. */
export function absolutePath(path: string): string {
  return `${REPO_ROOT}${path}`;
}
