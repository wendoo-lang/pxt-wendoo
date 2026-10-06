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
import { List, stream } from "@wendoo/core";
import {
  BrainDef,
  CoreOpId,
  CoreTypeIds,
  mkLiteralTileId,
  mkModifierTileId,
  mkOperatorTileId,
  mkSensorTileId,
} from "@wendoo/core/app";
import { isInlineTileDef, mkAccessorTileId, RuleSide } from "@wendoo/core/brain";
import {
  buildInsertionContext,
  collectRuleHierarchyOutputKeys,
  suggestTiles,
} from "@wendoo/core/brain/language-service";
import type { BrainPageDef, BrainRuleDef } from "@wendoo/core/brain/model";
import { BrainTileLiteralDef, BrainTilePageDef, type BrainTileSensorDef } from "@wendoo/core/brain/tiles";
import type { StructValue } from "@wendoo/core/runtime";
import {
  BrainRuntime,
  linkedBrainProgramFromBytes,
  mkActuatorTileId,
  mkOutputTileId,
  mkPrivateArgId,
  mkTypeId,
  NativeType,
} from "@wendoo/core/runtime";
import type { MakeCodeAsset, MakeCodeIdManifest } from "@wendoo/makecode-session";
import { brainSourceHash, MAKECODE_VM_PROFILE_ID } from "@wendoo/makecode-session";
import { writeBrainsModule } from "../../../../makecode/simx/bridge/src/brains-module.js";
import { enrichCatalogIcons } from "../../../../makecode/simx/bridge/src/catalog-icons.js";
import { writeIdsModule } from "../../../../makecode/simx/bridge/src/ids-module.js";
import { createTileVisualProvider } from "../brain/visual-provider.js";
import { buildAuthoringEnvironment, MAKECODE_VM_PRECISION } from "../services/authoring-environment.js";
import { compileBrainSource, readBrainSource, serializeBrainSource } from "../services/brain-source.js";
import type { CatalogArgNode, CatalogArgSlot } from "../services/catalog.js";
import { parseCatalog } from "../services/catalog.js";
import { allocateIds } from "../services/id-allocation.js";
import { CORE_TYPE_IDS, PAGE_FAMILY_TILE_ID } from "../services/pack-binding.js";
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
  "pealer.src.json",
  "flipper.src.json",
  "toller.src.json",
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

/**
 * The tiles the selftest project allocated after every other name its
 * catalog declares, in a later allocation: each holds an id above every
 * other tile's, wherever its pack declares it.
 */
const LATER_ALLOCATED_TILES = ["actuator.chime.toll"];

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
  "either-hero.src.json",
  "kin.src.json",
  "looker.src.json",
  "kinship.src.json",
  "perch.src.json",
  "pounce.src.json",
  "pounce-flipped.src.json",
  "heed.src.json",
  "spurn.src.json",
  "roam.src.json",
  "amble.src.json",
  "dart.src.json",
  "drawn.src.json",
  "twofold.src.json",
  "flock.src.json",
  "pursue.src.json",
  "convert.src.json",
  "jump.src.json",
  "rise.src.json",
  "dresser.src.json",
  "activate.src.json",
  "paint.src.json",
  "brand.src.json",
  "mirror.src.json",
  "unlike.src.json",
  "kindred.src.json",
  "loyal.src.json",
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

/**
 * The project allocation the arcade selftest's catalog is allocated against:
 * it holds an id for `actuator.arcade.look-like`, a tile the catalog does
 * not declare, which keeps that id, and a `Sprite` type with no fields.
 */
const ARCADE_PRIOR_IDS: MakeCodeIdManifest = {
  actions: [
    { name: "sensor.arcade.dpad", id: 1024 },
    { name: "actuator.arcade.move", id: 1025 },
    { name: "sensor.arcade.bump", id: 1026 },
    { name: "sensor.arcade.in-range", id: 1027 },
    { name: "sensor.arcade.out-of-range", id: 1028 },
    { name: "actuator.arcade.look-like", id: 1029 },
  ],
  operators: [],
  types: [
    { name: "Vector2", atom: 1024, fields: ["x", "y"] },
    { name: "Sprite", atom: 1025, fields: [] },
    { name: "Image", atom: 1026, fields: ["asset"] },
    { name: "Brain", atom: 1027, fields: ["id"] },
  ],
  next: { action: 1030, operator: 1024, atom: 1028 },
};

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
 * with every name the catalog declares appended, except
 * {@link UNALLOCATED_TILE}, the tiles in {@link LATER_ALLOCATED_TILES}
 * appended by a second allocation after every other name.
 */
function selftestIds(): MakeCodeIdManifest {
  const catalog = parseCatalog(selftestCatalog());
  const keeping = (keep: (name: string) => boolean) => ({
    ...catalog,
    packs: catalog.packs.map((pack) => ({ ...pack, tiles: pack.tiles.filter((tile) => keep(tile.name)) })),
  });
  const first = keeping((name) => name !== UNALLOCATED_TILE && !LATER_ALLOCATED_TILES.includes(name));
  const allocated = keeping((name) => name !== UNALLOCATED_TILE);
  return allocateIds(allocateIds(SELFTEST_PRIOR_IDS, first), allocated);
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

/** The editor's allocation for the arcade selftest's catalog, made in a project holding {@link ARCADE_PRIOR_IDS}. */
function arcadeIds(): MakeCodeIdManifest {
  return allocateIds(ARCADE_PRIOR_IDS, parseCatalog(arcadeCatalog()));
}

/** The environment binding the arcade selftest's catalog under its allocation. */
function arcadeEnvironment(): ReturnType<typeof buildAuthoringEnvironment>["environment"] {
  return buildAuthoringEnvironment(arcadeCatalog(), arcadeIds()).environment;
}

/**
 * The arcade selftest's programs: the registration selftest's ticker and
 * twins, the arcade selftest's own programs, each asset and brain literal
 * they place bound from its reference, the two programs the loader refuses, and the two
 * programs referencing ids the arcade selftest's allocation does not hold.
 */
function arcadePrograms(): SelftestProgram[] {
  const built = buildAuthoringEnvironment(arcadeCatalog(), arcadeIds());
  const paths = [
    ...ARCADE_SHARED_SOURCES.map((file) => `${SELFTEST_SOURCES_DIR}/${file}`),
    ...ARCADE_SOURCES.map((file) => `${ARCADE_SOURCES_DIR}/${file}`),
  ];
  for (const path of paths) {
    built.assetLiterals.bindSource(readRepoFile(path));
    built.brainLiterals.bindSource(readRepoFile(path));
  }
  return [
    ...paths.map((path) => compiledProgram(built.environment, path)),
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

/**
 * Whether the arcade selftest's catalog carries the tile named `tileName`
 * as an inline sensor: one reading as a value inside an expression.
 *
 * @param tileName - The tile's name, such as `sensor.arcade.myself`.
 */
export function arcadeCarriedTileInline(tileName: string): boolean {
  return (
    parseCatalog(arcadeCatalog())
      .packs.flatMap((pack) => pack.tiles)
      .find((entry) => entry.name === tileName)?.inline === true
  );
}

/**
 * Whether the environment binding the arcade selftest's catalog under its
 * allocation binds the sensor `tileName` as an inline sensor whose result a
 * brain may write a field through.
 *
 * @param tileName - The sensor's name, such as `sensor.arcade.myself`.
 */
export function arcadeBindsWritableInlineSensor(tileName: string): boolean {
  const tileId = mkSensorTileId(tileName);
  const sensor = arcadeEnvironment()
    .tileCatalogs()
    .map((catalog) => catalog.get(tileId))
    .find((found) => found !== undefined) as BrainTileSensorDef | undefined;
  return sensor !== undefined && isInlineTileDef(sensor) && sensor.writableResult;
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

/**
 * What reading, in the environment binding the arcade selftest's catalog, a
 * brain source of one rule doing the tile `tileId` alone produces: the kind
 * of tile the rule holds, the tile id its source carries once written back,
 * the stable codes compiling it reports, in the order reported, and whether
 * the compile still produced a program.
 *
 * @param tileId - The persisted tile id the rule's DO side holds, such as `tile.actuator->actuator.arcade.look-like`.
 */
export function arcadeReadOfTileReference(tileId: string): {
  kind: string;
  written: string;
  codes: number[];
  compiles: boolean;
} {
  const environment = arcadeEnvironment();
  const source = JSON.stringify({
    version: 1,
    id: "retiredTileRef01",
    name: "Retired",
    catalog: [{ version: 2, kind: "page", pageId: "fPg0retiredTile0", label: "Unnamed Page" }],
    pages: [
      {
        version: 2,
        pageId: "fPg0retiredTile0",
        name: "Unnamed Page",
        rules: [{ version: 1, when: [], do: [tileId], children: [], ruleId: "fRu0retiredTile0" }],
      },
    ],
  });
  const brain = readBrainSource(environment, source);
  const rule = (brain.pages().get(0) as BrainPageDef).children().get(0) as BrainRuleDef;
  const written = JSON.parse(serializeBrainSource(brain)) as { pages: { rules: { do: string[] }[] }[] };
  const compiled = compileBrainSource(environment, source);
  return {
    kind: rule.do().tiles().get(0)?.kind ?? "",
    written: written.pages[0]?.rules[0]?.do[0] ?? "",
    codes: compiled.diagnostics.map((diagnostic) => diagnostic.code),
    compiles: compiled.bytecode !== undefined,
  };
}

/** Asset id the image literal tile of {@link arcadeImageRuleDiagnosticCodes} carries. */
export const IMAGE_LITERAL_ASSET_ID = "image1";

/** The entry of {@link arcadeImageRuleDiagnosticCodes}'s sides standing for a literal tile holding an `Image` value. */
export const IMAGE_LITERAL = "<image literal>";

/** The entry of {@link arcadeImageRuleDiagnosticCodes}'s sides standing for a literal tile holding the number 40. */
export const NUMBER_LITERAL = "<number literal>";

/**
 * The prefix of an entry of {@link arcadeImageRuleDiagnosticCodes}'s sides
 * standing for the output tile of the `Sprite` output named by the rest of
 * the entry, such as `output:bumped`.
 */
export const OUTPUT_ENTRY_PREFIX = "output:";

/**
 * The prefix of an entry of {@link arcadeImageRuleDiagnosticCodes}'s sides
 * standing for the shared modifier tile the whole entry declares, such as
 * `modifier.position.above`.
 */
export const MODIFIER_ENTRY_PREFIX = "modifier.";

/**
 * The prefix of an entry of {@link arcadeImageRuleDiagnosticCodes}'s sides
 * standing for the accessor tile of the field the rest of the entry names as
 * `Type.field`, such as `accessor:Sprite.position`.
 */
export const ACCESSOR_ENTRY_PREFIX = "accessor:";

/**
 * The prefix of an entry of {@link arcadeImageRuleDiagnosticCodes}'s sides
 * standing for the sensor the rest of the entry names, on either side, such
 * as `sensor:sensor.arcade.myself`.
 */
export const SENSOR_ENTRY_PREFIX = "sensor:";

/**
 * The prefix of an entry of {@link arcadeImageRuleDiagnosticCodes}'s sides
 * standing for the tile of the core operator the rest of the entry names by
 * its operator id, such as `op:lt`.
 */
export const OPERATOR_ENTRY_PREFIX = "op:";

/** The entry of {@link arcadeImageRuleDiagnosticCodes}'s sides standing for the assignment operator's tile. */
export const ASSIGN = `${OPERATOR_ENTRY_PREFIX}${CoreOpId.Assign}`;

/** The tile id of the tile an entry of {@link arcadeImageRuleDiagnosticCodes}'s sides names, given how a bare tile name reads on its side. */
function entryTileId(entry: string, bareTileId: (name: string) => string, literalId: string, brainLiteralId: string) {
  if (entry.startsWith(OPERATOR_ENTRY_PREFIX)) return mkOperatorTileId(entry.slice(OPERATOR_ENTRY_PREFIX.length));
  if (entry === IMAGE_LITERAL) return literalId;
  if (entry === BRAIN_LITERAL) return brainLiteralId;
  if (entry.startsWith(MODIFIER_ENTRY_PREFIX)) return mkModifierTileId(entry);
  if (entry.startsWith(OUTPUT_ENTRY_PREFIX)) {
    return mkOutputTileId(mkTypeId(NativeType.Struct, "Sprite"), entry.slice(OUTPUT_ENTRY_PREFIX.length));
  }
  if (entry.startsWith(SENSOR_ENTRY_PREFIX)) return mkSensorTileId(entry.slice(SENSOR_ENTRY_PREFIX.length));
  if (entry.startsWith(ACCESSOR_ENTRY_PREFIX)) {
    const [type, field] = entry.slice(ACCESSOR_ENTRY_PREFIX.length).split(".");
    return mkAccessorTileId(mkTypeId(NativeType.Struct, type ?? ""), field ?? "");
  }
  return bareTileId(entry);
}

/** Document id of the brain the brain literal tile of {@link arcadeImageRuleDiagnosticCodes} names. */
export const BRAIN_LITERAL_ID = "kinBrainFilter01";

/** The entry of {@link arcadeImageRuleDiagnosticCodes}'s sides standing for a literal tile holding a `Brain` value. */
export const BRAIN_LITERAL = "<brain literal>";

/** The snapshot entry of the image {@link IMAGE_LITERAL} stands for. */
const IMAGE_ASSET: MakeCodeAsset = {
  kind: "image",
  id: IMAGE_LITERAL_ASSET_ID,
  name: "hero",
  width: 16,
  height: 16,
  previewUrl: "data:image/svg+xml;base64,aGVybw==",
};

/**
 * The one-rule brain in the environment binding the arcade selftest's
 * catalog, its asset literals minted from a snapshot holding the image
 * {@link IMAGE_LITERAL} stands for: its WHEN side the tiles `when` names, its
 * DO side the tiles `act` names, each entry the name of a sensor (on the WHEN
 * side) or an actuator (on the DO side), {@link IMAGE_LITERAL} for that
 * image's literal tile, {@link BRAIN_LITERAL} for the literal tile of the
 * brain {@link BRAIN_LITERAL_ID}, which the environment's brain literals
 * hold, {@link NUMBER_LITERAL} for a number literal held in the brain's own
 * catalog, an entry starting {@link OUTPUT_ENTRY_PREFIX} for a `Sprite`
 * output's tile, an entry starting {@link MODIFIER_ENTRY_PREFIX} for the
 * shared modifier tile it declares, an entry starting
 * {@link ACCESSOR_ENTRY_PREFIX} for an accessor tile, an entry starting
 * {@link SENSOR_ENTRY_PREFIX} for a sensor on either side, or an entry
 * starting {@link OPERATOR_ENTRY_PREFIX} for a core operator's tile, such
 * as {@link ASSIGN}. Given `child`, the rule holds one child rule, its WHEN side
 * and DO side the tiles `child.when` and `child.act` name. Returns the
 * brain, its rule, the environment it was authored in, and the tile ids of
 * the image's and the brain's literals.
 */
function arcadeImageRuleBrain(when: string[], act: string[], child?: { when: string[]; act: string[] }) {
  const built = buildAuthoringEnvironment(arcadeCatalog(), arcadeIds());
  built.assetLiterals.applySnapshot([IMAGE_ASSET]);
  built.brainLiterals.applyBrains(new Map([[BRAIN_LITERAL_ID, { name: "Kin" }]]));
  const { environment } = built;
  const brainDef = BrainDef.emptyBrainDef(environment.brainServices, "image-rule");
  const number = new BrainTileLiteralDef(CoreTypeIds.Number, 40, {}, environment.brainServices);
  brainDef.catalog().registerTileDef(number);
  const literalId = mkLiteralTileId(mkTypeId(NativeType.Struct, "Image"), IMAGE_LITERAL_ASSET_ID);
  const brainLiteralId = mkLiteralTileId(mkTypeId(NativeType.Struct, "Brain"), BRAIN_LITERAL_ID);
  const tileOf = (entry: string, tileId: (name: string) => string) => {
    if (entry === NUMBER_LITERAL) return number;
    const id = entryTileId(entry, tileId, literalId, brainLiteralId);
    const found = environment
      .tileCatalogs()
      .map((catalog) => catalog.get(id))
      .find((tile) => tile !== undefined);
    if (found === undefined) throw new Error(`no tile ${entry}`);
    return found;
  };
  const rule = (brainDef.pages().get(0) as BrainPageDef).children().get(0) as BrainRuleDef;
  for (const entry of when) rule.when().appendTile(tileOf(entry, mkSensorTileId));
  for (const entry of act) rule.do().appendTile(tileOf(entry, mkActuatorTileId));
  if (child !== undefined) {
    const childRule = rule.appendNewRule();
    for (const entry of child.when) childRule.when().appendTile(tileOf(entry, mkSensorTileId));
    for (const entry of child.act) childRule.do().appendTile(tileOf(entry, mkActuatorTileId));
  }
  return { environment, brainDef, rule, literalId, brainLiteralId };
}

/**
 * The one-rule program of {@link arcadeImageRuleBrain}: its source and the
 * environment it was authored in.
 */
function arcadeImageRule(when: string[], act: string[]) {
  const { environment, brainDef } = arcadeImageRuleBrain(when, act);
  return { environment, source: serializeBrainSource(brainDef) };
}

/**
 * Whether the candidate strip offers the tile `literal` -- {@link IMAGE_LITERAL},
 * {@link BRAIN_LITERAL}, or an output, modifier, accessor, sensor or
 * operator entry -- at the end of the WHEN
 * side holding the tiles `when` names or, given `act`, at the end of the DO
 * side holding the tiles `act` names, each as
 * {@link arcadeImageRuleDiagnosticCodes} names them, given the side's
 * typechecked expression and the outputs the rule's hierarchy provides, as
 * the brain editor gives them.
 *
 * @param literal - The entry looked for, named as {@link arcadeImageRuleDiagnosticCodes} names entries.
 * @param when - The WHEN side's entries, such as `["sensor.arcade.bump"]`.
 * @param act - The DO side's entries; omit to look at the end of the WHEN side.
 */
export function arcadeOffersLiteral(literal: string, when: string[], act?: string[]): boolean {
  const { environment, brainDef, rule, literalId, brainLiteralId } = arcadeImageRuleBrain(when, act ?? []);
  brainDef.typecheck();
  const wanted = entryTileId(literal, () => literalId, literalId, brainLiteralId);
  const side = act === undefined ? RuleSide.When : RuleSide.Do;
  const tileSet = side === RuleSide.When ? rule.when() : rule.do();
  const context = buildInsertionContext({
    side,
    expr: tileSet.expr(),
    ruleDef: rule,
    existingTiles: tileSet.tiles(),
    availableOutputKeys: collectRuleHierarchyOutputKeys(rule),
  });
  const result = suggestTiles(context, List.from(environment.tileCatalogs()), environment.brainServices);
  const has = (suggestions: typeof result.exact) =>
    suggestions.findIndex((suggestion) => suggestion.tileDef.tileId === wanted) !== -1;
  return has(result.exact) || has(result.withConversion);
}

/**
 * The stable codes of the diagnostics compiling a one-rule program in the
 * environment binding the arcade selftest's catalog, in the order reported:
 * its WHEN side the tiles `when` names, its DO side the tiles `act` names,
 * each entry the name of a sensor (on the WHEN side) or an actuator (on the
 * DO side), {@link IMAGE_LITERAL} for the literal tile the editor mints
 * for the image whose id is {@link IMAGE_LITERAL_ASSET_ID},
 * {@link BRAIN_LITERAL} for the literal tile of the brain
 * {@link BRAIN_LITERAL_ID}, {@link NUMBER_LITERAL} for a literal tile
 * holding the number 40, an entry starting {@link OUTPUT_ENTRY_PREFIX} for a
 * `Sprite` output's tile, an entry starting {@link MODIFIER_ENTRY_PREFIX}
 * for the shared modifier tile it names, an entry starting
 * {@link ACCESSOR_ENTRY_PREFIX} for an accessor tile, an entry starting
 * {@link SENSOR_ENTRY_PREFIX} for a sensor on either side, or an entry
 * starting {@link OPERATOR_ENTRY_PREFIX} for a core operator's tile, such
 * as {@link ASSIGN}.
 *
 * @param when - The WHEN side's entries, such as `["sensor.arcade.bump", IMAGE_LITERAL]`.
 * @param act - The DO side's entries, such as `["actuator.arcade.move", IMAGE_LITERAL]`.
 */
export function arcadeImageRuleDiagnosticCodes(when: string[], act: string[]): number[] {
  const { environment, source } = arcadeImageRule(when, act);
  return compileBrainSource(environment, source).diagnostics.map((diagnostic) => diagnostic.code);
}

/**
 * What compiling, in the environment binding the arcade selftest's catalog,
 * a brain of one rule holding one child rule produces: the stable codes of
 * its diagnostics in the order reported, and its program, `undefined` when
 * an error stopped the build. The rule's and the child's sides name their
 * tiles as {@link arcadeImageRuleDiagnosticCodes} names them.
 *
 * @param when - The rule's WHEN side's entries.
 * @param act - The rule's DO side's entries.
 * @param child - The child rule's WHEN and DO sides' entries.
 */
export function arcadeChainCompile(
  when: string[],
  act: string[],
  child: { when: string[]; act: string[] }
): { codes: number[]; bytecode: Uint8Array | undefined } {
  const { environment, brainDef } = arcadeImageRuleBrain(when, act, child);
  const compiled = compileBrainSource(environment, serializeBrainSource(brainDef));
  return { codes: compiled.diagnostics.map((diagnostic) => diagnostic.code), bytecode: compiled.bytecode };
}

/**
 * The label the environment binding the arcade selftest's catalog under its
 * allocation gives the output tile of the `Sprite` output named `name`, and
 * the label the arcade selftest's catalog carries on that output; either
 * `undefined` when there is none.
 *
 * @param name - The output's name, such as `bumped`.
 */
export function arcadeSpriteOutputLabels(name: string): { bound: string | undefined; carried: string | undefined } {
  const tileId = mkOutputTileId(mkTypeId(NativeType.Struct, "Sprite"), name);
  const bound = arcadeEnvironment()
    .tileCatalogs()
    .map((catalog) => catalog.get(tileId))
    .find((tile) => tile !== undefined)?.metadata?.label;
  const carried = parseCatalog(arcadeCatalog())
    .packs.flatMap((pack) => pack.tiles)
    .flatMap((tile) => tile.outputs)
    .find((output) => output.name === name && output.type === "Sprite")?.label;
  return { bound, carried };
}

/**
 * The programs the one-rule brain of {@link arcadeImageRuleDiagnosticCodes}
 * compiles to: `holding`, in the environment it was authored in, beside a
 * snapshot holding the image; and `lacking`, in a fresh environment beside a
 * snapshot lacking it, the literal bound from the brain's reference alone.
 * Throws when either does not compile clean.
 *
 * @param when - The WHEN side's entries.
 * @param act - The DO side's entries.
 */
export function arcadeImageRulePrograms(when: string[], act: string[]): { holding: Uint8Array; lacking: Uint8Array } {
  const { environment, source } = arcadeImageRule(when, act);
  const lacking = buildAuthoringEnvironment(arcadeCatalog(), arcadeIds());
  lacking.assetLiterals.applySnapshot([]);
  lacking.assetLiterals.bindSource(source);
  return { holding: compileCleanIn(environment, source), lacking: compileCleanIn(lacking.environment, source) };
}

/** The text values every struct constant of the arcade program `bytecode` holds, in pool order. */
export function arcadeStructTextConstants(bytecode: Uint8Array): string[] {
  const decoded = linkedBrainProgramFromBytes(stream.byteArrayFromUint8Array(bytecode), {
    precision: MAKECODE_VM_PRECISION,
    typeRegistry: arcadeEnvironment().brainServices.runtime.types,
  });
  const texts: string[] = [];
  decoded.program.program.constantPools.values.forEach((value) => {
    if (value.t !== NativeType.Struct) return;
    (value as StructValue).v?.forEach((field) => {
      if (field.t === NativeType.String) texts.push(field.v);
    });
  });
  return texts;
}

/** The MakeCode Arcade default palette, as the simx renders icons under it. */
const ARCADE_PALETTE = [
  "#000000",
  "#ffffff",
  "#ff2121",
  "#ff93c4",
  "#ff8135",
  "#fff609",
  "#249ca3",
  "#78dc52",
  "#003fad",
  "#87f2ff",
  "#8e2ec4",
  "#a4839f",
  "#5c406c",
  "#e5cdc4",
  "#91463d",
  "#000000",
];

/** One icon the rendered arcade catalog carries, and what the editor makes of it. */
export interface RenderedIcon {
  /** Id of the tile the icon belongs to: a sensor, an actuator, a modifier slot's tile, or a core tile; or the page family id. */
  readonly tileId: string;
  /** Whether the icon is one a pack gives a core tile. */
  readonly core: boolean;
  /** The icon's data URI, as the rendered catalog carries it. */
  readonly carried: string;
  /** The icon the bound tile's display metadata holds, or the page icon for the page family; `undefined` when none is held. */
  readonly bound: string | undefined;
  /** The icon the visual provider resolves the bound tile, or a page's own tile, to; `undefined` when it resolves none. */
  readonly resolved: string | undefined;
}

/**
 * Every icon the arcade selftest's pinned catalog carries on a tile, a
 * modifier slot or a core tile icon entry once the simx has rendered it under
 * the Arcade default palette, first declaration of a shared slot tile or of a
 * core tile winning, each beside what
 * the environment binding the rendered catalog under the arcade selftest's
 * allocation holds and resolves for its tile -- for the page family id, the
 * environment's page icon and what a page's own tile resolves to; and the
 * lines the simx's rendering logged as errors.
 */
export function arcadeRenderedIcons(): { icons: RenderedIcon[]; errors: string[] } {
  const errors: string[] = [];
  const rendered = enrichCatalogIcons(arcadeCatalog(), ARCADE_PALETTE, {
    info: () => {},
    error: (message) => {
      errors.push(message);
    },
  });
  const carried = new Map<string, string>();
  const coreTileIds = new Set<string>();
  for (const pack of parseCatalog(rendered).packs) {
    for (const tile of pack.tiles) {
      const tileId = tile.kind === "sensor" ? mkSensorTileId(tile.name) : mkActuatorTileId(tile.name);
      if (tile.iconUrl !== undefined && !carried.has(tileId)) carried.set(tileId, tile.iconUrl);
      for (const slot of slotsOf(tile.grammar ?? [])) {
        if (!slot.modifier || slot.iconUrl === undefined) continue;
        const fragment = slot.tileId.startsWith("modifier.")
          ? slot.tileId
          : mkPrivateArgId(pack.name, tile.name, slot.tileId);
        const slotTileId = mkModifierTileId(fragment);
        if (!carried.has(slotTileId)) carried.set(slotTileId, slot.iconUrl);
      }
    }
    for (const entry of pack.coreTileIcons) {
      if (!carried.has(entry.tileId)) {
        carried.set(entry.tileId, entry.iconUrl);
        coreTileIds.add(entry.tileId);
      }
    }
  }
  const built = buildAuthoringEnvironment(rendered, arcadeIds());
  const resolve = createTileVisualProvider(built.assetLiterals.view, built.pageIcon);
  const icons = [...carried].map(([tileId, url]) => {
    if (tileId === PAGE_FAMILY_TILE_ID) {
      return {
        tileId,
        core: true,
        carried: url,
        bound: built.pageIcon,
        resolved: resolve(new BrainTilePageDef("page-start", "start"))?.iconUrl,
      };
    }
    const tile = built.environment
      .tileCatalogs()
      .map((catalog) => catalog.get(tileId))
      .find((found) => found !== undefined);
    return {
      tileId,
      core: coreTileIds.has(tileId),
      carried: url,
      bound: tile?.metadata?.iconUrl,
      resolved: tile === undefined ? undefined : resolve(tile)?.iconUrl,
    };
  });
  return { icons, errors };
}

/**
 * Every icon a type entry or a core type icon entry of the arcade selftest's
 * pinned catalog carries once the simx has rendered it under the Arcade
 * default palette, keyed by type name, each beside the icon the environment
 * binding the rendered catalog under the arcade selftest's allocation binds
 * to the type.
 */
export function arcadeRenderedTypeIcons(): { name: string; carried: string; bound: string | undefined }[] {
  const rendered = enrichCatalogIcons(arcadeCatalog(), ARCADE_PALETTE, { info: () => {}, error: () => {} });
  const built = buildAuthoringEnvironment(rendered, arcadeIds());
  return parseCatalog(rendered).packs.flatMap((pack) => [
    ...pack.types.flatMap((type) =>
      type.iconUrl === undefined
        ? []
        : [
            {
              name: type.name,
              carried: type.iconUrl,
              bound: built.typeIcons.get(mkTypeId(NativeType.Struct, type.name)),
            },
          ]
    ),
    ...pack.coreTypeIcons.map((icon) => {
      const typeId = CORE_TYPE_IDS.get(icon.typeName);
      return {
        name: icon.typeName,
        carried: icon.iconUrl,
        bound: typeId === undefined ? undefined : built.typeIcons.get(typeId),
      };
    }),
  ]);
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
