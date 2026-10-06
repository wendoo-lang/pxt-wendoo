import type { WendooEnvironment } from "@wendoo/core/app";
import type { Localizer } from "@wendoo/core/localization";
import type { TypeId } from "@wendoo/core/runtime";
import type { BrainEditorConfig } from "@wendoo/ui";
import type { AssetLiteral } from "@/services/asset-literals";
import type { BrainLiteral } from "@/services/brain-literals";
import { BRAIN_SOURCE_NAMESPACE } from "@/services/brain-source";
import { createAssetLiteralTypes, createBrainLiteralTypes, createTileVisualProvider } from "./visual-provider";

/**
 * The display name of each type `environment` registers, keyed by type id:
 * the type's registry name with any `module::` qualifier dropped.
 */
function registeredTypeNames(environment: WendooEnvironment): ReadonlyMap<string, string> {
  const names = new Map<string, string>();
  for (const [typeId, typeDef] of environment.brainServices.runtime.types.entries()) {
    const separator = typeDef.name.lastIndexOf("::");
    names.set(typeId, separator < 0 ? typeDef.name : typeDef.name.slice(separator + 2));
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
 * included -- each registered type named by its registry name, tiles shown
 * through the visual provider over `assetLiterals`, a display-only literal
 * type per asset type those literals hold and per brain type `brainLiterals`
 * hold, each type's data-type icon as `typeIcons` holds it, every page's own
 * tile wearing `pageIcon`, and brain files saved and loaded relative to
 * {@link BRAIN_SOURCE_NAMESPACE}. Build a new config whenever the environment
 * is rebuilt or the asset or brain literals change.
 *
 * @param environment - The brains store's current environment.
 * @param assetLiterals - The environment's asset literals, as the brains store reports them.
 * @param brainLiterals - The environment's brain literals, as the brains store reports them.
 * @param typeIcons - The environment's type icons, keyed by type id, as the brains store reports them.
 * @param pageIcon - The environment's page icon, as the brains store reports it; omit it while none is bound.
 */
export function buildBrainEditorConfig(
  environment: WendooEnvironment,
  assetLiterals: ReadonlyMap<string, AssetLiteral>,
  brainLiterals: ReadonlyMap<string, BrainLiteral>,
  typeIcons: ReadonlyMap<TypeId, string>,
  pageIcon?: string
): BrainEditorConfig {
  return {
    dataTypeIcons: typeIcons,
    dataTypeNames: registeredTypeNames(environment),
    customLiteralTypes: [
      ...createAssetLiteralTypes(environment.brainServices.runtime.types, assetLiterals),
      ...createBrainLiteralTypes(environment.brainServices.runtime.types, brainLiterals),
    ],
    resolveTileVisual: createTileVisualProvider(assetLiterals, pageIcon),
    brainServices: environment.brainServices,
    localizer: localizerView(environment.appServices.localizer),
    projectNamespace: BRAIN_SOURCE_NAMESPACE,
    tileCatalogs: environment.tileCatalogs(),
  };
}
