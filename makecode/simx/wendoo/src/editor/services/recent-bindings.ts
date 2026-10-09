import { BINDING_ENTRY_PREFIX, type RecentBinding, type TabBinding } from "./binding-entries";
import type { EditorSessionStore } from "./editor-session-store";

/**
 * The recent projects the connect page lists: the entries no tab holds, as
 * {@link TabBinding.recent} reads them, re-read whenever the page could show
 * a different set -- at creation, each time the session store returns to the
 * connect page, after each action here, and when another tab changes an
 * entry. Components read {@link getSnapshot} and subscribe with
 * {@link subscribe} (both `useSyncExternalStore`-shaped).
 */
export class RecentBindings {
  private readonly _binding: Pick<TabBinding, "recent" | "take" | "remove">;
  private readonly _store: Pick<EditorSessionStore, "resume" | "subscribe" | "getSnapshot">;
  private readonly _listeners = new Set<() => void>();
  private _bindings: readonly RecentBinding[] = [];
  /** Counts the reads begun, so only the latest one's result is kept. */
  private _reads = 0;

  /**
   * @param binding - This tab's binding, whose unclaimed entries are listed.
   * @param store - The session store an opened entry is resumed in.
   */
  constructor(
    binding: Pick<TabBinding, "recent" | "take" | "remove">,
    store: Pick<EditorSessionStore, "resume" | "subscribe" | "getSnapshot">
  ) {
    this._binding = binding;
    this._store = store;
    let view = store.getSnapshot().view;
    store.subscribe(() => {
      const next = store.getSnapshot().view;
      if (next === "connect" && view !== "connect") void this.refresh();
      view = next;
    });
    void this.refresh();
  }

  /** Subscribe to snapshot changes. Returns an unsubscribe function. */
  subscribe = (listener: () => void): (() => void) => {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  };

  /** The listed entries, most recently seen first. A new array each time the list changes. */
  getSnapshot = (): readonly RecentBinding[] => {
    return this._bindings;
  };

  /** Re-reads the list. Resolves once it is read. */
  async refresh(): Promise<void> {
    const read = ++this._reads;
    const bindings = await this._binding.recent();
    if (read !== this._reads) return;
    this._bindings = bindings;
    for (const listener of this._listeners) listener();
  }

  /**
   * Resumes the session of the entry with id `id` when this tab can take it;
   * when another tab took it first, or it is gone, re-reads the list instead.
   */
  async open(id: string): Promise<void> {
    if (await this._binding.take(id)) {
      this._store.resume();
      return;
    }
    await this.refresh();
  }

  /** Removes the entry with id `id`, then re-reads the list. */
  async remove(id: string): Promise<void> {
    this._binding.remove(id);
    await this.refresh();
  }

  /** Re-reads the list each time another tab of the page's origin changes an entry. */
  followStorage(page: {
    addEventListener(type: "storage", listener: (event: Pick<StorageEvent, "key">) => void): void;
  }): void {
    page.addEventListener("storage", (event) => {
      if (event.key === null || event.key.startsWith(BINDING_ENTRY_PREFIX)) void this.refresh();
    });
  }
}
