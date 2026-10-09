import type { BrainDef, IBrainDef } from "@wendoo/core/app";
import { logger } from "@wendoo/core/app";
import type { BrainsStore } from "@/services/brains-store";

/**
 * How long, in milliseconds, an editing waits after the latest edit before
 * flushing it to the store. Must stay at least 667: each flush that changes a
 * brain makes two MakeCode project-file writes, and MakeCode accepts at most
 * 30 writes per 10 seconds.
 */
export const FLUSH_DEBOUNCE_MS = 700;

/** Stable code logged when a flush fails: reading the edited document or storing it threw. */
export const BRAIN_FLUSH_FAILED = "BRAIN_FLUSH_FAILED";

/** One opening of the brain editor dialog on a stored brain: what it edits, and where its edits go. */
export interface BrainEditing {
  /** The brain's document, read from the store when the editing opened; `undefined` when the store held no such brain. */
  readonly srcBrainDef: BrainDef | undefined;
  /**
   * Records an edit. `snapshot` reads the edited document; the editing calls
   * the latest one it was handed, and stores what it returns,
   * {@link FLUSH_DEBOUNCE_MS} after the latest edit.
   */
  change(snapshot: () => IBrainDef): void;
  /** Flushes the latest edit at once when it has not been flushed yet, and cancels the pending flush. */
  close(): void;
}

/**
 * Opens brain `id` of `store` for editing in the brain editor dialog: pass
 * `srcBrainDef` to the dialog, hand each edit it reports to `change`, and
 * call `close` as the dialog closes.
 *
 * A flush stores the edited document under the document id it carries, which
 * compiles it. A flush that throws is logged under {@link BRAIN_FLUSH_FAILED}
 * and keeps its edit unflushed, so the next edit's flush, or `close`, tries
 * again.
 *
 * @param store - The brains store holding the brain.
 * @param id - Document id of the brain.
 */
export function openBrainEditing(store: Pick<BrainsStore, "getBrain" | "applyBrain">, id: string): BrainEditing {
  let unflushed: (() => IBrainDef) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = (): void => {
    clearTimeout(timer);
    timer = undefined;
    const snapshot = unflushed;
    if (snapshot === undefined) return;
    try {
      store.applyBrain(snapshot());
      unflushed = undefined;
    } catch (error) {
      logger.error(BRAIN_FLUSH_FAILED, { brainId: id, error });
    }
  };

  return {
    srcBrainDef: store.getBrain(id),
    change: (snapshot) => {
      unflushed = snapshot;
      clearTimeout(timer);
      timer = setTimeout(flush, FLUSH_DEBOUNCE_MS);
    },
    close: flush,
  };
}

/** The brain editings open in one page, each tracked from its opening until its dialog goes. */
export class OpenEditings {
  private readonly _editings = new Set<Pick<BrainEditing, "close">>();

  /** Tracks `editing` until the returned function is called. */
  track(editing: Pick<BrainEditing, "close">): () => void {
    this._editings.add(editing);
    return () => {
      this._editings.delete(editing);
    };
  }

  /**
   * Flushes every tracked editing's latest edit at once, through its
   * `close`, when it has not been flushed yet. The editings stay open and
   * tracked, and take later edits as before.
   */
  flushAll(): void {
    for (const editing of this._editings) editing.close();
  }
}
