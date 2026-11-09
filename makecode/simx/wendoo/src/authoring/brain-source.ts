import { stream } from "@wendoo/core";
import type { BrainDef, IBrainDef, IBrainRuleDef, WendooEnvironment } from "@wendoo/core/app";
import { encodePersistedBrainJson } from "@wendoo/core/app";
import type { BrainBuildDiagnostic } from "@wendoo/core/brain";
import { linkedBrainProgramToBytes } from "@wendoo/core/runtime";
import type { MakeCodeWireDiagnostic } from "@wendoo/makecode-session";
import { MAKECODE_VM_PROFILE_ID } from "@wendoo/makecode-session";
import { MAKECODE_VM_PRECISION } from "./authoring-environment";

/** Stable code of a brain source that is not a brain document: it does not parse as JSON, or does not read as a brain. */
export const BRAIN_SOURCE_INVALID = "BRAIN_SOURCE_INVALID";

/** Stable code of a brain source that reads as a brain document whose embedded id differs from the id it is addressed by. */
export const BRAIN_SOURCE_ID_MISMATCH = "BRAIN_SOURCE_ID_MISMATCH";

/**
 * Project namespace brain sources are persisted relative to: identifiers
 * qualified by it are stored with the namespace absent, and read back
 * qualified by it.
 */
export const BRAIN_SOURCE_NAMESPACE = "project";

/**
 * The source text of `definition`: its upstream persisted brain JSON
 * relative to {@link BRAIN_SOURCE_NAMESPACE}, indented by two spaces.
 *
 * @param definition - The brain document to serialize.
 */
export function serializeBrainSource(definition: IBrainDef): string {
  return JSON.stringify(encodePersistedBrainJson(definition, BRAIN_SOURCE_NAMESPACE), null, 2);
}

/**
 * The brain document `source` holds, read in `environment`: tile references
 * resolve against its catalogs, and a reference none of them holds reads as a
 * missing-tile placeholder that keeps its persisted identity. Throws when
 * `source` is not a brain document.
 *
 * @param environment - The environment to read the document in.
 * @param source - Source text, as {@link serializeBrainSource} produces it.
 */
export function readBrainSource(environment: WendooEnvironment, source: string): BrainDef {
  return environment.deserializeBrainJsonFromPlain(JSON.parse(source), BRAIN_SOURCE_NAMESPACE) as BrainDef;
}

/** What checking one brain source found: its compile's diagnostics and unresolved tiles, and whether it links. */
export interface BrainSourceCheck {
  /** The compiler's and linker's diagnostics, in the order they were reported. */
  readonly diagnostics: readonly BrainBuildDiagnostic[];
  /** Whether the build produced a program: no error-severity diagnostic stopped it. */
  readonly linked: boolean;
  /**
   * Ids of the tiles the source places that the environment it was checked
   * in holds no tile for, each read as a missing-tile placeholder: each id
   * once, in the order first placed, page by page and rule by rule. Empty
   * when every tile resolved.
   */
  readonly unresolvedTiles: readonly string[];
}

/** What compiling one brain source produced. */
export interface BrainSourceCompile {
  /** The compiler's and linker's diagnostics, in the order they were reported. */
  readonly diagnostics: readonly BrainBuildDiagnostic[];
  /**
   * The compiled program in the binary form the MakeCode Wendoo VM loads, or
   * `undefined` when an error-severity diagnostic stopped the build.
   */
  readonly bytecode: Uint8Array | undefined;
  /**
   * Ids of the tiles the source places that the environment it was compiled
   * in holds no tile for, each read as a missing-tile placeholder: each id
   * once, in the order first placed, page by page and rule by rule. Empty
   * when every tile resolved.
   */
  readonly unresolvedTiles: readonly string[];
}

/** Ids of the missing-tile placeholders `definition`'s rules place, each once, in the order first placed. */
function missingTileIds(definition: IBrainDef): string[] {
  const found = new Set<string>();
  const visit = (rule: IBrainRuleDef): void => {
    for (const side of [rule.when(), rule.do()]) {
      side.tiles().forEach((tile) => {
        if (tile.kind === "missing") found.add(tile.tileId);
      });
    }
    rule.children().forEach(visit);
  };
  definition.pages().forEach((page) => {
    page.children().forEach(visit);
  });
  return [...found];
}

/** The diagnostics, linked program and unresolved tiles of one compile and link of a brain source. */
interface LinkedBrainSource {
  readonly diagnostics: readonly BrainBuildDiagnostic[];
  /** The linked program, or `undefined` when an error-severity diagnostic stopped the build. */
  readonly program: ReturnType<WendooEnvironment["linkBrain"]>["program"];
  readonly unresolvedTiles: readonly string[];
}

/**
 * Reads the brain `source` holds in `environment`, then compiles and links
 * it, reporting the tiles it places that `environment` holds no tile for.
 * Throws when `source` is not a brain document.
 */
function linkBrainSource(environment: WendooEnvironment, source: string): LinkedBrainSource {
  const definition = readBrainSource(environment, source);
  const unresolvedTiles = missingTileIds(definition);
  const result = environment.linkBrain(definition);
  return { diagnostics: result.diagnostics.toArray(), program: result.program, unresolvedTiles };
}

/**
 * Compiles and links the brain `source` holds in `environment`, reporting
 * its diagnostics, whether it linked, and the tiles the source places that
 * `environment` holds no tile for; encodes no program. Throws when `source`
 * is not a brain document.
 *
 * @param environment - The environment to check in.
 * @param source - Source text, as {@link serializeBrainSource} produces it.
 */
export function checkBrainSource(environment: WendooEnvironment, source: string): BrainSourceCheck {
  const { diagnostics, program, unresolvedTiles } = linkBrainSource(environment, source);
  return { diagnostics, linked: program !== undefined, unresolvedTiles };
}

/**
 * Compiles and links the brain `source` holds in `environment`, and encodes
 * the linked program for the MakeCode Wendoo VM: profile
 * {@link MAKECODE_VM_PROFILE_ID}, numbers at {@link MAKECODE_VM_PRECISION}.
 * A build stopped by an error-severity diagnostic returns its diagnostics and
 * no bytecode. Reports the tiles the source places that `environment` holds
 * no tile for. Throws when `source` is not a brain document.
 *
 * @param environment - The environment to compile in.
 * @param source - Source text, as {@link serializeBrainSource} produces it.
 */
export function compileBrainSource(environment: WendooEnvironment, source: string): BrainSourceCompile {
  const { diagnostics, program, unresolvedTiles } = linkBrainSource(environment, source);
  if (program === undefined) {
    return { diagnostics, bytecode: undefined, unresolvedTiles };
  }
  const bytes = linkedBrainProgramToBytes(program, {
    profileId: MAKECODE_VM_PROFILE_ID,
    precision: MAKECODE_VM_PRECISION,
    typeRegistry: environment.brainServices.runtime.types,
  });
  return { diagnostics, bytecode: stream.byteArrayToUint8Array(bytes) as Uint8Array, unresolvedTiles };
}

/**
 * `diagnostics` in their wire form: each one's code, severity and message,
 * and the params its message interpolates -- each a text, a number, or a
 * list of texts -- when it carries any.
 *
 * @param diagnostics - A compile's diagnostics, in reported order.
 */
export function wireDiagnostics(diagnostics: readonly BrainBuildDiagnostic[]): MakeCodeWireDiagnostic[] {
  return diagnostics.map(({ code, severity, message, params }) => {
    const wire: MakeCodeWireDiagnostic = { code, severity, message };
    if (params !== undefined) {
      const values: Record<string, string | number | string[]> = {};
      for (const [name, value] of Object.entries(params) as [string, unknown][]) {
        if (typeof value === "string" || typeof value === "number") values[name] = value;
        else if (typeof value === "object" && value !== null && "toArray" in value) {
          values[name] = (value as { toArray(): string[] }).toArray();
        }
      }
      wire.params = values;
    }
    return wire;
  });
}
