import type { WendooEnvironment } from "@wendoo/core/app";
import { mkVariableFactoryTileId } from "@wendoo/core/app";
import type { Localizer } from "@wendoo/core/localization";
import type { TypeId } from "@wendoo/core/runtime";
import type { BrainEditorConfig } from "@wendoo/ui";
import type { AssetLiteral } from "@/services/asset-literals";
import type { PackLiteral } from "@/services/authoring-environment";
import type { BrainLiteral } from "@/services/brain-literals";
import { BRAIN_SOURCE_NAMESPACE } from "@/services/brain-source";
import type { TileKindColors } from "@/services/target-theme";
import {
  createAssetLiteralTypes,
  createBrainLiteralTypes,
  createPackLiteralTypes,
  createTileVisualProvider,
} from "./visual-provider";

/**
 * The display name of each type `environment` registers, keyed by type id:
 * the label of the type's variable factory where the environment holds one;
 * else the label `typeLabels` holds for the type; else the type's registry
 * name with any `module::` qualifier dropped.
 *
 * @param environment - The environment whose types are named.
 * @param typeLabels - The environment's type labels, keyed by type id, as the brains store reports them.
 */
export function registeredTypeNames(
  environment: WendooEnvironment,
  typeLabels: ReadonlyMap<TypeId, string>
): ReadonlyMap<string, string> {
  const names = new Map<string, string>();
  const tiles = environment.brainServices.edit.tiles;
  for (const [typeId, typeDef] of environment.brainServices.runtime.types.entries()) {
    const label = tiles.get(mkVariableFactoryTileId(typeId))?.metadata?.label ?? typeLabels.get(typeId);
    const separator = typeDef.name.lastIndexOf("::");
    names.set(typeId, label ?? (separator < 0 ? typeDef.name : typeDef.name.slice(separator + 2)));
  }
  return names;
}

/** A localizer rendering exactly as `base` does, its identity distinct from `base` and from every other view of it. */
function localizerView(base: Localizer): Localizer {
  return {
    locale: () => base.locale(),
    tr: (source, params, context) => base.tr(source, params, context),
    list: (items, kind) => base.list(items, kind),
    compare: (a, b) => base.compare(a, b),
    foldForSearch: (text) => base.foldForSearch(text),
    sentenceCase: (text) => base.sentenceCase(text),
  };
}

/**
 * Builds the brain editor dialog's config from `environment`, the
 * environment the brains store edits and compiles in: its tile catalogs and
 * brain services, its localizer under a fresh identity per config -- so a new
 * config re-reads every rule sentence, words of literals relabelled in place
 * included -- each registered type named as {@link registeredTypeNames} names
 * it from `typeLabels`, tiles shown through
 * the visual provider over the environment's tile catalogs, `assetLiterals`
 * and `typeIcons` -- so a brain read in an earlier environment shows each tile
 * as this one binds it -- a display-only literal
 * type per asset type those literals hold, per brain type `brainLiterals`
 * hold and per type `packLiterals` hold literals of, each type's data-type icon as `typeIcons` holds it, every page's own
 * tile wearing `pageIcon`, every tile filled in the pair `tileColors` holds
 * for its kind where they are given, and brain files saved and loaded
 * relative to {@link BRAIN_SOURCE_NAMESPACE}. Build a new config whenever the
 * environment is rebuilt or the asset, brain or pack literals or the tile
 * colors change.
 *
 * @param environment - The brains store's current environment.
 * @param assetLiterals - The environment's asset literals, as the brains store reports them.
 * @param brainLiterals - The environment's brain literals, as the brains store reports them.
 * @param packLiterals - The environment's pack literals, keyed by tile id, as the brains store reports them.
 * @param typeIcons - The environment's type icons, keyed by type id, as the brains store reports them.
 * @param typeLabels - The environment's type labels, keyed by type id, as the brains store reports them.
 * @param pageIcon - The environment's page icon, as the brains store reports it; omit it while none is bound.
 * @param tileColors - The declared target's tile fills, keyed by tile kind; omit them while it gives none.
 */
export function buildBrainEditorConfig(
  environment: WendooEnvironment,
  assetLiterals: ReadonlyMap<string, AssetLiteral>,
  brainLiterals: ReadonlyMap<string, BrainLiteral>,
  packLiterals: ReadonlyMap<string, PackLiteral>,
  typeIcons: ReadonlyMap<TypeId, string>,
  typeLabels: ReadonlyMap<TypeId, string>,
  pageIcon?: string,
  tileColors?: TileKindColors
): BrainEditorConfig {
  const tileCatalogs = environment.tileCatalogs();
  return {
    dataTypeIcons: typeIcons,
    dataTypeNames: registeredTypeNames(environment, typeLabels),
    customLiteralTypes: [
      ...createAssetLiteralTypes(environment.brainServices.runtime.types, assetLiterals),
      ...createBrainLiteralTypes(environment.brainServices.runtime.types, brainLiterals),
      ...createPackLiteralTypes(packLiterals),
    ],
    resolveTileVisual: createTileVisualProvider(tileCatalogs, assetLiterals, typeIcons, pageIcon, tileColors),
    brainServices: environment.brainServices,
    localizer: localizerView(environment.appServices.localizer),
    projectNamespace: BRAIN_SOURCE_NAMESPACE,
    tileCatalogs,
  };
}
