import type { BrainsViewState } from "@/services/brains-store";

/** The brains store's facts a {@link SaveStatus} shows. */
export type SaveFacts = Pick<BrainsViewState, "pending" | "pushesInFlight" | "reconciled">;

/**
 * Whether the brains are saved to the MakeCode project, as the save status
 * shows it:
 *
 * - `saved` -- the project holds every edit;
 * - `saving` -- an edit is not in the project yet and a push is on its way;
 * - `unsaved` -- an edit is not in the project yet and no push is on its way.
 */
export type SaveState = "saved" | "saving" | "unsaved";

/** The {@link SaveState} for a reading of the brains store. */
export function saveState(facts: Pick<SaveFacts, "pending" | "pushesInFlight">): SaveState {
  if (facts.pending.size === 0) return "saved";
  return facts.pushesInFlight > 0 ? "saving" : "unsaved";
}

/** The themeable token the dot of each shown state is painted in, as its Tailwind classes. */
const DOT_TOKENS: Record<Exclude<SaveState, "saved">, string> = {
  saving: "bg-primary motion-safe:animate-pulse",
  unsaved: "bg-warning",
};

/** The lowercase words the save status shows for each shown state. */
const SAVE_WORDS: Record<Exclude<SaveState, "saved">, string> = {
  saving: "saving",
  unsaved: "not saved yet",
};

/**
 * Whether the brains are saved to the MakeCode project: a dot and lowercase
 * words while `saving` or `unsaved`, and nothing shown while `saved`. The
 * element carries the {@link SaveState} as `data-save-state`, the pend count
 * as `data-pending`, the pushes in flight as `data-in-flight`, and the
 * reconciled flag as `data-reconciled`. From the `sm` breakpoint up it is
 * drawn above the brain editor's backdrop, so it stays readable while the
 * editor is open.
 */
export function SaveStatus({ facts }: { facts: SaveFacts }) {
  const state = saveState(facts);
  return (
    <output
      data-testid="save-status"
      data-save-state={state}
      data-pending={facts.pending.size}
      data-in-flight={facts.pushesInFlight}
      data-reconciled={facts.reconciled}
      className="flex items-center gap-1.5 text-muted-foreground text-xs sm:relative sm:z-[51]"
    >
      {state !== "saved" && (
        <span className="flex items-center gap-1.5 rounded-full bg-background px-2 py-0.5">
          <span
            data-testid="save-dot"
            data-save-state={state}
            aria-hidden="true"
            className={`size-2 shrink-0 rounded-full ${DOT_TOKENS[state]}`}
          />
          {SAVE_WORDS[state]}
        </span>
      )}
    </output>
  );
}
