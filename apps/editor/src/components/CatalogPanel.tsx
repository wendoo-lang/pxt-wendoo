import { useMemo } from "react";
import { parseCatalog } from "@/services/catalog";

/**
 * The tile catalog of the connected MakeCode project: each pack with its
 * tiles, from the latest catalog text the session delivered. Shows a waiting
 * line before the first catalog, and the stable code of a text it cannot
 * read.
 */
export function CatalogPanel({ catalogText }: { catalogText: string | undefined }) {
  const catalog = useMemo(() => (catalogText === undefined ? undefined : parseCatalog(catalogText)), [catalogText]);

  return (
    <section data-testid="catalog-panel" className="w-full max-w-md space-y-3">
      <h2 className="text-base font-bold">Tiles</h2>
      {catalog === undefined && <p className="text-muted-foreground text-sm">Waiting for the project's tiles...</p>}
      {catalog?.errorCode !== undefined && (
        <p data-testid="catalog-error" data-code={catalog.errorCode} className="font-mono text-xs">
          {catalog.errorCode}: the project's catalog could not be read.
        </p>
      )}
      {catalog?.packs.map((pack) => (
        <section
          key={pack.name}
          data-testid="catalog-pack"
          data-name={pack.name}
          className="space-y-2 rounded-lg border p-3"
        >
          <h3 className="text-sm font-medium">{pack.name}</h3>
          <ul className="space-y-1">
            {pack.tiles.map((tile) => (
              <li
                key={tile.name}
                data-testid="catalog-tile"
                data-name={tile.name}
                className="flex items-center justify-between gap-2 rounded border px-2 py-1 text-sm"
              >
                <span className="font-mono">{tile.name}</span>
                {tile.kind !== undefined && (
                  <span data-testid="catalog-tile-kind" className="text-muted-foreground text-xs">
                    {tile.kind}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </section>
  );
}
