import { CATALOG_PENDING } from "@/services/brains-store";

/**
 * The notice shown while the brains store's catalog is pending: one sentence
 * worded for the person authoring, telling them to run their game so its
 * tiles load, carrying {@link CATALOG_PENDING} as `data-code`. Renders
 * nothing while `pending` is `false`.
 *
 * @param pending - The brains store's `catalogPending`.
 */
export function CatalogPendingNotice({ pending }: { pending: boolean }) {
  if (!pending) return null;
  return (
    <section
      data-testid="catalog-pending-notice"
      data-code={CATALOG_PENDING}
      className="w-full max-w-md rounded-lg border border-border p-3 text-xs"
    >
      <p>Run your game once to load its tiles.</p>
    </section>
  );
}
