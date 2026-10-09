import type { CatalogDiagnostic } from "@/services/authoring-environment";
import { CATALOG_PACK_UNBOUND } from "@/services/authoring-environment";
import { CATALOG_UNREADABLE } from "@/services/catalog";

/** What one catalog diagnostic means for authoring, after its stable code. */
function consequence(diagnostic: CatalogDiagnostic): string {
  if (diagnostic.code === CATALOG_PACK_UNBOUND) return `The ${diagnostic.pack} tiles can't be used in brains yet.`;
  if (diagnostic.code === CATALOG_UNREADABLE) {
    return "The project's tiles could not be read. Brains can still use the built-in tiles.";
  }
  if ("pack" in diagnostic) return `${diagnostic.name} from ${diagnostic.pack} can't be used in brains.`;
  return "The project's tile ids were saved by a newer Wendoo editor. Reload the editor to use the project's tiles.";
}

/** The entry fields a diagnostic carries as data, absent on a diagnostic about no entry. */
function entryOf(diagnostic: CatalogDiagnostic): { name?: string; token?: string } {
  return "name" in diagnostic ? { name: diagnostic.name, token: diagnostic.token } : {};
}

/**
 * The problems found building the authoring environment from the session
 * catalog, one line each in catalog order: the stable code, then what it
 * means for authoring. Each line carries its code as `data-code`, the pack
 * it is about as `data-pack`, the entry as `data-name`, and the offending
 * token as `data-token`, each when the diagnostic names one. Informational
 * only; renders nothing when there are none.
 */
export function CatalogDiagnosticsNotice({ diagnostics }: { diagnostics: readonly CatalogDiagnostic[] }) {
  if (diagnostics.length === 0) return null;
  return (
    <section data-testid="catalog-diagnostics" className="w-full max-w-md rounded-lg border border-border p-3 text-xs">
      <ul className="space-y-1">
        {diagnostics.map((diagnostic, index) => {
          const pack = "pack" in diagnostic ? diagnostic.pack : undefined;
          const { name, token } = entryOf(diagnostic);
          return (
            <li
              key={`${index}:${diagnostic.code}`}
              data-testid="catalog-diagnostic"
              data-code={diagnostic.code}
              data-pack={pack}
              data-name={name}
              data-token={token}
            >
              <span className="font-mono">{diagnostic.code}</span>: {consequence(diagnostic)}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
