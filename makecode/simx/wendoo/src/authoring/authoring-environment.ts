import type { WendooEnvironment, WendooModule } from "@wendoo/core/app";
import {
  coreModule,
  createEntropySeededRng,
  createWendooEnvironment,
  mkLiteralTileId,
  mkVariableFactoryTileId,
} from "@wendoo/core/app";
import type { NumberPrecision, StructTypeDef, TypeId } from "@wendoo/core/runtime";
import { createProfileNumerics, mkTypeId, NativeType } from "@wendoo/core/runtime";
import type { MakeCodeIdManifest, MakeCodeManifestProblemCode } from "@wendoo/makecode-session";
import { ASSET_FIELD, AssetLiterals, type AssetType } from "./asset-literals";
import { BRAIN_FIELD, BrainLiterals, type BrainType } from "./brain-literals";
import { type CATALOG_UNREADABLE, type CatalogPack, type CatalogProblem, parseCatalog } from "./catalog";
import { allocateIds } from "./id-allocation";
import { CORE_TYPE_IDS, PackBindingCode, type PackBindingProblem, packModule, pageFamilyIcon } from "./pack-binding";

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

/** One literal a catalog type declares that the environment binds as a literal tile, as the UI reads it. */
export interface PackLiteral {
  /** The literal tile's id, derived from its type and its key. */
  readonly tileId: string;
  /** The id of the literal's type. */
  readonly typeId: TypeId;
  /** The literal's key: its identity among its type's literals. */
  readonly key: string;
  /** What the literal reads as: its label, else its key. */
  readonly label: string;
}

/**
 * The docs page of a catalog type no variable factory tile stands for: its
 * entry's id is the id the type's variable factory tile would hold, so a
 * type's page keeps one id whether or not a factory stands for it.
 */
export interface TypePage {
  /** The page's tile id: the id of the type's variable factory tile. */
  readonly tileId: string;
  /** What the page is listed as: the type's label, else its name. */
  readonly label: string;
  /** The type's icon, or absent when it carries none. */
  readonly iconUrl?: string;
  /** The type's docs markdown. */
  readonly docs: string;
}

/** An environment built from a session catalog, and what building it found. */
export interface AuthoringEnvironment {
  /** The environment brains are read, edited and compiled in. Carries the core vocabulary and every pack it could bind. */
  readonly environment: WendooEnvironment;
  /** Problems found in the catalog, in catalog order. Empty when there were none. */
  readonly diagnostics: readonly CatalogDiagnostic[];
  /**
   * The environment's asset literal tiles, one set per catalog asset type the
   * environment binds; none are minted until a snapshot is applied or a brain
   * source is bound.
   */
  readonly assetLiterals: AssetLiterals;
  /**
   * The environment's brain literal tiles, one set per catalog brain type the
   * environment binds; none are minted until the held brains are applied or
   * a brain source is bound.
   */
  readonly brainLiterals: BrainLiterals;
  /**
   * The literal tiles the environment binds for the literals catalog types
   * declare, keyed by tile id, in catalog order; the first literal declaring
   * a tile id standing. Empty while no id allocation is held.
   */
  readonly packLiterals: ReadonlyMap<string, PackLiteral>;
  /**
   * The docs page of each catalog type the environment binds that carries
   * docs and no variable factory tile stands for, in catalog order. Empty
   * while no id allocation is held.
   */
  readonly typePages: readonly TypePage[];
  /**
   * The icon of each catalog type the environment binds that carries one,
   * the first declaration of a type name standing, and of each core type a
   * pack gives one, the first icon given standing, keyed by type id. Empty
   * while no id allocation is held.
   */
  readonly typeIcons: ReadonlyMap<TypeId, string>;
  /**
   * The label of each catalog type the environment binds that carries one,
   * the first declaration of a type name standing, keyed by type id. Empty
   * while no id allocation is held.
   */
  readonly typeLabels: ReadonlyMap<TypeId, string>;
  /**
   * The icon every page's own tile wears: the one packs give the page family
   * id, the first given standing. `undefined` while no pack gives one or no
   * id allocation is held.
   */
  readonly pageIcon: string | undefined;
}

/**
 * The icons of `packs`' types that `environment` registers, keyed by type id,
 * the first declaration of a type name carrying an icon standing.
 */
function boundTypeIcons(environment: WendooEnvironment, packs: readonly CatalogPack[]): Map<TypeId, string> {
  const icons = new Map<TypeId, string>();
  for (const type of packs.flatMap((pack) => pack.types)) {
    const typeId = mkTypeId(NativeType.Struct, type.name);
    if (type.iconUrl === undefined || icons.has(typeId)) continue;
    if (environment.brainServices.runtime.types.get(typeId) === undefined) continue;
    icons.set(typeId, type.iconUrl);
  }
  return icons;
}

/**
 * The labels of `packs`' types that `environment` registers, keyed by type
 * id, the first declaration of a type name carrying a label standing.
 */
function boundTypeLabels(environment: WendooEnvironment, packs: readonly CatalogPack[]): Map<TypeId, string> {
  const labels = new Map<TypeId, string>();
  for (const type of packs.flatMap((pack) => pack.types)) {
    const typeId = mkTypeId(NativeType.Struct, type.name);
    if (type.label === undefined || labels.has(typeId)) continue;
    if (environment.brainServices.runtime.types.get(typeId) === undefined) continue;
    labels.set(typeId, type.label);
  }
  return labels;
}

/**
 * The icons `packs` give core types, keyed by type id, the first icon given a
 * core type, in catalog order, standing. An icon given a name that is no core
 * type is left out and passed to `report` under
 * {@link PackBindingCode.CORE_TYPE_UNKNOWN}.
 */
function boundCoreTypeIcons(
  packs: readonly CatalogPack[],
  report: (problem: PackBindingProblem) => void
): Map<TypeId, string> {
  const icons = new Map<TypeId, string>();
  for (const pack of packs) {
    for (const { typeName, iconUrl } of pack.coreTypeIcons) {
      const typeId = CORE_TYPE_IDS.get(typeName);
      if (typeId === undefined) {
        report({ code: PackBindingCode.CORE_TYPE_UNKNOWN, pack: pack.name, name: typeName });
        continue;
      }
      if (!icons.has(typeId)) icons.set(typeId, iconUrl);
    }
  }
  return icons;
}

/**
 * The asset types among `packs`' types that `environment` binds: each type
 * declaring an asset kind whose struct definition the environment registers
 * with an `asset` field.
 */
function boundAssetTypes(environment: WendooEnvironment, packs: readonly CatalogPack[]): AssetType[] {
  const types: AssetType[] = [];
  for (const type of packs.flatMap((pack) => pack.types)) {
    if (type.asset === undefined) continue;
    const typeId = mkTypeId(NativeType.Struct, type.name);
    const typeDef = environment.brainServices.runtime.types.get(typeId) as StructTypeDef | undefined;
    if (typeDef?.fieldIndexByName?.get(ASSET_FIELD) === undefined) continue;
    types.push({ typeId, kind: type.asset, typeDef });
  }
  return types;
}

/**
 * The brain types among `packs`' types that `environment` binds: each type
 * the catalog marks as a brain type whose struct definition the environment
 * registers with an `id` field, with the icon `typeIcons` binds to it.
 */
function boundBrainTypes(
  environment: WendooEnvironment,
  packs: readonly CatalogPack[],
  typeIcons: ReadonlyMap<TypeId, string>
): BrainType[] {
  const types: BrainType[] = [];
  for (const type of packs.flatMap((pack) => pack.types)) {
    if (type.brain !== true) continue;
    const typeId = mkTypeId(NativeType.Struct, type.name);
    const typeDef = environment.brainServices.runtime.types.get(typeId) as StructTypeDef | undefined;
    if (typeDef?.fieldIndexByName?.get(BRAIN_FIELD) === undefined) continue;
    const iconUrl = typeIcons.get(typeId);
    types.push({ typeId, typeDef, ...(iconUrl === undefined ? {} : { iconUrl }) });
  }
  return types;
}

/**
 * The literal tiles `environment` binds for the literals `packs`' types
 * declare, keyed by tile id: each literal of a type the environment
 * registers whose tile the environment holds, the first literal declaring a
 * tile id standing.
 */
function boundPackLiterals(environment: WendooEnvironment, packs: readonly CatalogPack[]): Map<string, PackLiteral> {
  const literals = new Map<string, PackLiteral>();
  for (const type of packs.flatMap((pack) => pack.types)) {
    const typeId = mkTypeId(NativeType.Struct, type.name);
    if (environment.brainServices.runtime.types.get(typeId) === undefined) continue;
    for (const { key, label } of type.literals) {
      const tileId = mkLiteralTileId(typeId, key);
      if (literals.has(tileId) || !environment.brainServices.edit.tiles.has(tileId)) continue;
      literals.set(tileId, { tileId, typeId, key, label: label ?? key });
    }
  }
  return literals;
}

/**
 * The docs pages of `packs`' types that `environment` registers, carry docs
 * and hold no variable factory tile in `environment`.
 */
function boundTypePages(environment: WendooEnvironment, packs: readonly CatalogPack[]): TypePage[] {
  const pages: TypePage[] = [];
  for (const type of packs.flatMap((pack) => pack.types)) {
    const typeId = mkTypeId(NativeType.Struct, type.name);
    const tileId = mkVariableFactoryTileId(typeId);
    if (type.docs === undefined || environment.brainServices.runtime.types.get(typeId) === undefined) continue;
    if (environment.brainServices.edit.tiles.has(tileId)) continue;
    pages.push({
      tileId,
      label: type.label ?? type.name,
      ...(type.iconUrl === undefined ? {} : { iconUrl: type.iconUrl }),
      docs: type.docs,
    });
  }
  return pages;
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
 * The result's asset literals cover every bound type the catalog declares an
 * asset kind for, and its brain literals every bound type the catalog marks
 * as a brain type, each brain literal wearing its type's icon; its pack
 * literals every literal tile bound for a literal a catalog type declares;
 * its type pages the page of every bound type carrying docs that no variable
 * factory tile stands for; its type labels every bound type's label; its type
 * icons hold every bound type's icon and every core type's icon a pack gives,
 * an icon given a name that is no core type reported under
 * {@link PackBindingCode.CORE_TYPE_UNKNOWN}; and its page icon is the icon a
 * pack gives the page family. Apply the session's asset snapshot and the
 * held brains to the literals, and bind each brain source to both before
 * reading or compiling it.
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
  const bound = ids !== undefined && catalog !== undefined;
  const assetTypes = bound ? boundAssetTypes(environment, catalog.packs) : [];
  const typeIcons = bound
    ? new Map([
        ...boundTypeIcons(environment, catalog.packs),
        ...boundCoreTypeIcons(catalog.packs, (problem) => {
          diagnostics.push(problem);
        }),
      ])
    : new Map<TypeId, string>();
  const brainTypes = bound ? boundBrainTypes(environment, catalog.packs, typeIcons) : [];
  const pageIcon = bound ? pageFamilyIcon(catalog.packs) : undefined;
  return {
    environment,
    diagnostics,
    assetLiterals: new AssetLiterals(environment.brainServices, assetTypes),
    brainLiterals: new BrainLiterals(environment.brainServices, brainTypes),
    packLiterals: bound ? boundPackLiterals(environment, catalog.packs) : new Map(),
    typePages: bound ? boundTypePages(environment, catalog.packs) : [],
    typeIcons,
    typeLabels: bound ? boundTypeLabels(environment, catalog.packs) : new Map(),
    pageIcon,
  };
}
