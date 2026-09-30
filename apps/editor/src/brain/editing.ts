import type { BrainDef, IBrainDef } from "@wendoo/core/app";
import type { BrainsStore } from "@/services/brains-store";

/** One opening of the brain editor dialog on a stored brain: what it edits, and where its result goes. */
export interface BrainEditing {
  /** The brain's document, read from the store when the editing opened; `undefined` when the store held no such brain. */
  readonly srcBrainDef: BrainDef | undefined;
  /** Stores the edited document under the document id it carries, compiling it. */
  submit(definition: IBrainDef): void;
}

/**
 * Opens brain `id` of `store` for editing in the brain editor dialog: pass
 * `srcBrainDef` to the dialog, and hand its submitted document to `submit`.
 *
 * @param store - The brains store holding the brain.
 * @param id - Document id of the brain.
 */
export function openBrainEditing(store: Pick<BrainsStore, "getBrain" | "applyBrain">, id: string): BrainEditing {
  return {
    srcBrainDef: store.getBrain(id),
    submit: (definition) => {
      store.applyBrain(definition);
    },
  };
}
