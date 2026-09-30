import type { CatalogDiagnostic } from "@/services/authoring-environment";
import { CATALOG_PACK_UNBOUND } from "@/services/authoring-environment";

/** What one catalog diagnostic means for authoring, after its stable code. */
function consequence(diagnostic: CatalogDiagnostic): string {
  return diagnostic.code === CATALOG_PACK_UNBOUND
    ? `The ${diagnostic.pack} tiles can't be used in brains yet.`
    : "The project's tiles could not be read. Brains can still use the built-in tiles.";
}

/**
 * The problems found building the authoring environment from the session
 * catalog, one line each in catalog order: the stable code, then what it
 * means for authoring. Each line carries its code as `data-code`, and an
 * unbound pack's line its pack name as `data-pack`. Informational only;
 * renders nothing when there are none.
 */
export function CatalogDiagnosticsNotice({ diagnostics }: { diagnostics: readonly CatalogDiagnostic[] }) {
  if (diagnostics.length === 0) return null;
  return (
    <section data-testid="catalog-diagnostics" className="w-full max-w-md rounded-lg border border-border p-3 text-xs">
      <ul className="space-y-1">
        {diagnostics.map((diagnostic) => (
          <li
            key={diagnostic.code === CATALOG_PACK_UNBOUND ? `${diagnostic.code}:${diagnostic.pack}` : diagnostic.code}
            data-testid="catalog-diagnostic"
            data-code={diagnostic.code}
            data-pack={diagnostic.code === CATALOG_PACK_UNBOUND ? diagnostic.pack : undefined}
          >
            <span className="font-mono">{diagnostic.code}</span>: {consequence(diagnostic)}
          </li>
        ))}
      </ul>
    </section>
  );
}
