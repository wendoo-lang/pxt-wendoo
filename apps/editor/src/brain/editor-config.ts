import type { WendooEnvironment } from "@wendoo/core/app";
import type { BrainEditorConfig } from "@wendoo/ui";
import { BRAIN_SOURCE_NAMESPACE } from "@/services/brain-source";

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

/**
 * Builds the brain editor dialog's config from `environment`, the
 * environment the brains store edits and compiles in: its tile catalogs,
 * brain services and localizer, each registered type named by its registry
 * name, and brain files saved and loaded relative to
 * {@link BRAIN_SOURCE_NAMESPACE}. The config supplies no data-type icons and
 * no custom literal types. Build a new config whenever the environment is
 * rebuilt.
 *
 * @param environment - The brains store's current environment.
 */
export function buildBrainEditorConfig(environment: WendooEnvironment): BrainEditorConfig {
  return {
    dataTypeIcons: new Map(),
    dataTypeNames: registeredTypeNames(environment),
    customLiteralTypes: [],
    brainServices: environment.brainServices,
    localizer: environment.appServices.localizer,
    projectNamespace: BRAIN_SOURCE_NAMESPACE,
    tileCatalogs: environment.tileCatalogs(),
  };
}
