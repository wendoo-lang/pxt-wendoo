/**
 * Seeds a brains store with an empty brain, applied as an edit of a brain
 * the store did not hold.
 */
import { BrainDef } from "@wendoo/core/app";
import type { BrainsStore } from "../services/brains-store.js";

/**
 * Applies an empty one-page brain named `name`, minted through the store's
 * environment, to `store`, as an edit of a brain the store did not hold.
 * Returns its document id.
 *
 * @param store - The store to seed.
 * @param name - Display name of the brain; any text, including empty.
 */
export function seedBrain(store: BrainsStore, name: string): string {
  const definition = BrainDef.emptyBrainDef(store.getSnapshot().environment.brainServices, name);
  store.applyBrain(definition);
  return definition.id();
}
