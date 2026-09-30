import { stream } from "@wendoo/core";
import type { BrainDef, IBrainDef, WendooEnvironment } from "@wendoo/core/app";
import { encodePersistedBrainJson } from "@wendoo/core/app";
import type { BrainBuildDiagnostic } from "@wendoo/core/brain";
import { linkedBrainProgramToBytes } from "@wendoo/core/runtime";
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

/** What compiling one brain source produced. */
export interface BrainSourceCompile {
  /** The compiler's and linker's diagnostics, in the order they were reported. */
  readonly diagnostics: readonly BrainBuildDiagnostic[];
  /**
   * The compiled program in the binary form the MakeCode Wendoo VM loads, or
   * `undefined` when an error-severity diagnostic stopped the build.
   */
  readonly bytecode: Uint8Array | undefined;
}

/**
 * Compiles and links the brain `source` holds in `environment`, and encodes
 * the linked program for the MakeCode Wendoo VM: profile
 * {@link MAKECODE_VM_PROFILE_ID}, numbers at {@link MAKECODE_VM_PRECISION}.
 * A build stopped by an error-severity diagnostic returns its diagnostics and
 * no bytecode. Throws when `source` is not a brain document.
 *
 * @param environment - The environment to compile in.
 * @param source - Source text, as {@link serializeBrainSource} produces it.
 */
export function compileBrainSource(environment: WendooEnvironment, source: string): BrainSourceCompile {
  const result = environment.linkBrain(readBrainSource(environment, source));
  const diagnostics = result.diagnostics.toArray();
  if (result.program === undefined) {
    return { diagnostics, bytecode: undefined };
  }
  const bytes = linkedBrainProgramToBytes(result.program, {
    profileId: MAKECODE_VM_PROFILE_ID,
    precision: MAKECODE_VM_PRECISION,
    typeRegistry: environment.brainServices.runtime.types,
  });
  return { diagnostics, bytecode: stream.byteArrayToUint8Array(bytes) as Uint8Array };
}
