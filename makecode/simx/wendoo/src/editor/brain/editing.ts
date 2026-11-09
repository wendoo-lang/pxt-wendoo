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
  /**
   * Subscribe to changes of {@link getDocument}. While anything is
   * subscribed, the editing follows the store: whenever the store's entry for
   * the brain carries another source hash than the one the editing last
   * opened, adopted or flushed, the brain is not pending in the store, and
   * the editing holds no unflushed edit, the store's version becomes the
   * document and every listener is called. Returns an unsubscribe function.
   * The `useSyncExternalStore` subscribe shape.
   */
  subscribe(listener: () => void): () => void;
  /**
   * The brain's document the dialog stands on: read from the store when the
   * editing opened, or the store's version it last adopted; `undefined` when
   * the store held no such brain. The same object until the next adoption.
   */
  getDocument(): BrainDef | undefined;
  /**
   * Records an edit. `snapshot` reads the edited document; the editing calls
   * the latest one it was handed, and stores what it returns,
   * {@link FLUSH_DEBOUNCE_MS} after the latest edit.
   */
  change(snapshot: () => IBrainDef): void;
  /** Flushes the latest edit at once when it has not been flushed yet, and cancels the pending flush. */
  flush(): void;
  /** Flushes as {@link flush} does, then stops following the store, dropping every listener. */
  close(): void;
}

/**
 * Opens brain `id` of `store` for editing in the brain editor dialog: stand
 * the dialog on `getDocument()`, read through `subscribe`, hand each edit it
 * reports to `change`, and call `close` as the dialog closes.
 *
 * A flush stores the edited document under the document id it carries, which
 * compiles it, and records the source hash the store then holds for it. A
 * flush that throws is logged under {@link BRAIN_FLUSH_FAILED} and keeps its
 * edit unflushed, so the next edit's flush, or `close`, tries again.
 *
 * @param store - The brains store holding the brain.
 * @param id - Document id of the brain.
 */
export function openBrainEditing(
  store: Pick<BrainsStore, "getBrain" | "applyBrain" | "getSnapshot" | "subscribe">,
  id: string
): BrainEditing {
  let unflushed: (() => IBrainDef) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let brainDef = store.getBrain(id);
  // the source hash the store held for the brain when the editing last opened, adopted or flushed it
  let sourceHash = store.getSnapshot().brains.get(id)?.sourceHash;
  const listeners = new Set<() => void>();
  let unfollow: (() => void) | undefined;

  const follow = (): void => {
    if (unflushed !== undefined) return;
    const { brains, pending } = store.getSnapshot();
    const entry = brains.get(id);
    if (entry === undefined || entry.sourceHash === sourceHash || pending.has(id)) return;
    sourceHash = entry.sourceHash;
    brainDef = store.getBrain(id);
    for (const listener of [...listeners]) listener();
  };

  const flush = (): void => {
    clearTimeout(timer);
    timer = undefined;
    const snapshot = unflushed;
    if (snapshot === undefined) return;
    try {
      store.applyBrain(snapshot());
      unflushed = undefined;
      sourceHash = store.getSnapshot().brains.get(id)?.sourceHash;
    } catch (error) {
      logger.error(BRAIN_FLUSH_FAILED, { brainId: id, error });
    }
  };

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      if (unfollow === undefined) {
        unfollow = store.subscribe(follow);
        follow();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size > 0) return;
        unfollow?.();
        unfollow = undefined;
      };
    },
    getDocument: () => brainDef,
    change: (snapshot) => {
      unflushed = snapshot;
      clearTimeout(timer);
      timer = setTimeout(flush, FLUSH_DEBOUNCE_MS);
    },
    flush,
    close: () => {
      flush();
      listeners.clear();
      unfollow?.();
      unfollow = undefined;
    },
  };
}

/** The brain editings open in one page, each tracked from its opening until its dialog goes. */
export class OpenEditings {
  private readonly _editings = new Set<Pick<BrainEditing, "flush">>();

  /** Tracks `editing` until the returned function is called. */
  track(editing: Pick<BrainEditing, "flush">): () => void {
    this._editings.add(editing);
    return () => {
      this._editings.delete(editing);
    };
  }

  /**
   * Flushes every tracked editing's latest edit at once, through its
   * `flush`, when it has not been flushed yet. The editings stay open and
   * tracked, and take later edits as before.
   */
  flushAll(): void {
    for (const editing of this._editings) editing.flush();
  }
}
