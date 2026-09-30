import type { WendooEnvironment } from "@wendoo/core/app";
import { coreModule, createEntropySeededRng, createWendooEnvironment } from "@wendoo/core/app";
import type { NumberPrecision } from "@wendoo/core/runtime";
import { createProfileNumerics } from "@wendoo/core/runtime";
import { type CATALOG_UNREADABLE, parseCatalog } from "./catalog";

/** Stable code reported for a catalog pack whose types, tiles and operators are not in the environment's vocabulary. */
export const CATALOG_PACK_UNBOUND = "CATALOG_PACK_UNBOUND";

/**
 * Numeric precision the MakeCode Wendoo VM computes at. Authoring
 * environments compute at it, and compiled brains encode their numbers at it.
 */
export const MAKECODE_VM_PRECISION: NumberPrecision = "f64";

/** One problem found in a session catalog while building an environment from it. */
export type CatalogDiagnostic =
  | {
      /** The catalog text could not be read as a catalog document. */
      readonly code: typeof CATALOG_UNREADABLE;
    }
  | {
      /** A pack's vocabulary is not in the environment. */
      readonly code: typeof CATALOG_PACK_UNBOUND;
      /** Name of the pack, as the catalog declares it. */
      readonly pack: string;
    };

/** An environment built from a session catalog, and what building it found. */
export interface AuthoringEnvironment {
  /** The environment brains are read, edited and compiled in. Carries the core vocabulary. */
  readonly environment: WendooEnvironment;
  /** Problems found in the catalog, in catalog order. Empty when there were none. */
  readonly diagnostics: readonly CatalogDiagnostic[];
}

/**
 * Builds a fresh environment for the session catalog `catalogText`: the core
 * module installed, numbers computed at {@link MAKECODE_VM_PRECISION}, and
 * document ids minted from an entropy-seeded stream. Each catalog pack is
 * reported under {@link CATALOG_PACK_UNBOUND}; text that is not a catalog
 * document is reported under {@link CATALOG_UNREADABLE} and yields the same
 * core environment. Never throws on catalog content.
 *
 * @param catalogText - The session catalog's serialized text, or `undefined` while none has arrived.
 */
export function buildAuthoringEnvironment(catalogText: string | undefined): AuthoringEnvironment {
  const environment = createWendooEnvironment({
    modules: [coreModule()],
    rng: createEntropySeededRng(),
    numerics: createProfileNumerics(MAKECODE_VM_PRECISION),
  });
  if (catalogText === undefined) {
    return { environment, diagnostics: [] };
  }
  const catalog = parseCatalog(catalogText);
  if (catalog.errorCode !== undefined) {
    return { environment, diagnostics: [{ code: catalog.errorCode }] };
  }
  return {
    environment,
    diagnostics: catalog.packs.map((pack) => ({ code: CATALOG_PACK_UNBOUND, pack: pack.name })),
  };
}
