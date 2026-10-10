import type { BrainsViewState } from "./brains-store";

/**
 * Whether the brains are saved to the MakeCode project:
 *
 * - `saved` -- the project holds every edit;
 * - `saving` -- an edit is not in the project yet and a push is on its way;
 * - `unsaved` -- an edit is not in the project yet and no push is on its way.
 */
export type SaveState = "saved" | "saving" | "unsaved";

/** The {@link SaveState} for a reading of the brains store. */
export function saveState(facts: Pick<BrainsViewState, "pending" | "pushesInFlight">): SaveState {
  if (facts.pending.size === 0) return "saved";
  return facts.pushesInFlight > 0 ? "saving" : "unsaved";
}
