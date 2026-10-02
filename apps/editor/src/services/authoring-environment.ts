import type { WendooEnvironment, WendooModule } from "@wendoo/core/app";
import { coreModule, createEntropySeededRng, createWendooEnvironment } from "@wendoo/core/app";
import type { NumberPrecision } from "@wendoo/core/runtime";
import { createProfileNumerics } from "@wendoo/core/runtime";
import type { MakeCodeIdManifest, MakeCodeManifestProblemCode } from "@wendoo/makecode-session";
import { type CATALOG_UNREADABLE, type CatalogProblem, parseCatalog } from "./catalog";
import { allocateIds } from "./id-allocation";
import { type PackBindingProblem, packModule } from "./pack-binding";

export { PackBindingCode } from "./pack-binding";

/** Stable code reported for a catalog pack none of whose vocabulary the environment holds, as no id allocation is held. */
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
    }
  | {
      /**
       * The project's id manifest is of a newer format than this editor
       * reads, so no pack is bound. Reported by the brains store, beside the
       * environment's own diagnostics.
       */
      readonly code: typeof MakeCodeManifestProblemCode.FORMAT_NEWER;
    }
  | CatalogProblem
  | PackBindingProblem;

/** An environment built from a session catalog, and what building it found. */
export interface AuthoringEnvironment {
  /** The environment brains are read, edited and compiled in. Carries the core vocabulary and every pack it could bind. */
  readonly environment: WendooEnvironment;
  /** Problems found in the catalog, in catalog order. Empty when there were none. */
  readonly diagnostics: readonly CatalogDiagnostic[];
}

/**
 * Builds a fresh environment for the session catalog `catalogText`: the core
 * module installed, numbers computed at {@link MAKECODE_VM_PRECISION}, and
 * document ids minted from an entropy-seeded stream.
 *
 * With an id allocation, every pack the catalog declares is bound -- each
 * struct type, tile and operator, under the id `ids` allocates it, a name
 * `ids` lacks taking the id {@link allocateIds} would give it -- and each
 * entry the catalog or the language model refuses is reported by stable code
 * and left out. Without one, each pack is reported under
 * {@link CATALOG_PACK_UNBOUND}. The catalog's problems are reported either
 * way; text that is not a catalog document is reported under
 * `CATALOG_UNREADABLE` and yields the core environment. Never throws on
 * catalog content.
 *
 * @param catalogText - The session catalog's serialized text, or `undefined` while none has arrived.
 * @param ids - The project's id allocation the editor holds; omit it while the editor holds none.
 */
export function buildAuthoringEnvironment(
  catalogText: string | undefined,
  ids?: MakeCodeIdManifest
): AuthoringEnvironment {
  const catalog = catalogText === undefined ? undefined : parseCatalog(catalogText);
  const diagnostics: CatalogDiagnostic[] = [];
  const modules: WendooModule[] = [coreModule()];
  if (catalog !== undefined) {
    if (catalog.errorCode !== undefined) {
      diagnostics.push({ code: catalog.errorCode });
    } else {
      diagnostics.push(...catalog.problems);
      if (ids === undefined) {
        diagnostics.push(...catalog.packs.map((pack) => ({ code: CATALOG_PACK_UNBOUND, pack: pack.name }) as const));
      } else {
        modules.push(
          packModule(catalog.packs, allocateIds(ids, catalog), (problem) => {
            diagnostics.push(problem);
          })
        );
      }
    }
  }
  const environment = createWendooEnvironment({
    modules,
    rng: createEntropySeededRng(),
    numerics: createProfileNumerics(MAKECODE_VM_PRECISION),
  });
  return { environment, diagnostics };
}
