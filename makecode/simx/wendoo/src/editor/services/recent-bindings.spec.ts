import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { FakeBindingClaims } from "../test-support/fake-binding-claims.js";
import { MemoryStorage } from "../test-support/memory-storage.js";
import { BINDING_ENTRY_PREFIX, type BindingEntry, bindingEntryId, openTabBinding } from "./binding-entries.js";
import type { EditorSessionViewState } from "./editor-session-store.js";
import { RecentBindings } from "./recent-bindings.js";

/** A session store reporting the view the spec sets, and counting its resumes. */
class FakeStore {
  resumed = 0;
  private _state = { view: "connect" } as EditorSessionViewState;
  private readonly _listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  };

  getSnapshot = (): EditorSessionViewState => this._state;

  resume(): boolean {
    this.resumed += 1;
    return true;
  }

  /** The store's view changing to `view`. */
  show(view: EditorSessionViewState["view"]): void {
    this._state = { ...this._state, view };
    for (const listener of this._listeners) listener();
  }
}

/** A page's `addEventListener`, recording the storage listeners for the spec to fire. */
class FakePage {
  readonly listeners: ((event: { key: string | null }) => void)[] = [];

  addEventListener(_type: "storage", listener: (event: { key: string | null }) => void): void {
    this.listeners.push(listener);
  }

  /** Another tab changing the storage item `key`. */
  storage(key: string | null): void {
    for (const listener of this.listeners) listener({ key });
  }
}

/** Settles every pending read. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe("recent bindings", () => {
  let local: MemoryStorage;
  let claims: FakeBindingClaims;

  beforeEach(() => {
    local = new MemoryStorage();
    claims = new FakeBindingClaims();
  });

  /** Stores an entry for `token`, last seen `order` milliseconds after an hour ago. */
  function seed(token: string, order: number): string {
    const id = bindingEntryId(token);
    const lastSeen = Date.now() - 60 * 60 * 1000 + order;
    const entry: BindingEntry = { token, projectName: undefined, target: undefined, lastSeen };
    local.setItem(BINDING_ENTRY_PREFIX + id, JSON.stringify(entry));
    return id;
  }

  /** A tab's recent projects over its own binding and a fake store, read once. */
  async function openTab(): Promise<{ recent: RecentBindings; store: FakeStore; close(): void }> {
    const tab = claims.tab();
    const binding = await openTabBinding({ local, session: new MemoryStorage(), claims: tab.claims });
    const store = new FakeStore();
    const recent = new RecentBindings(binding, store);
    await settle();
    return { recent, store, close: tab.close };
  }

  /** The ids `recent` lists. */
  function ids(recent: RecentBindings): string[] {
    return recent.getSnapshot().map((binding) => binding.id);
  }

  it("lists nothing when no entry exists", async () => {
    const { recent } = await openTab();

    assert.deepEqual(ids(recent), []);
  });

  it("lists two entries at creation, most recently seen first", async () => {
    const x = seed("token-x", 1);
    const y = seed("token-y", 2);

    const { recent } = await openTab();

    assert.deepEqual(ids(recent), [y, x]);
  });

  it("opens a listed entry: the tab takes it and the store resumes, and another tab no longer lists it", async () => {
    const x = seed("token-x", 1);
    const y = seed("token-y", 2);
    const a = await openTab();
    const b = await openTab();

    await a.recent.open(x);

    assert.equal(a.store.resumed, 1);
    await b.recent.refresh();
    assert.deepEqual(ids(b.recent), [y]);
  });

  it("re-reads the list instead of resuming when another tab took the entry first", async () => {
    const x = seed("token-x", 1);
    const y = seed("token-y", 2);
    const a = await openTab();
    const b = await openTab();
    assert.deepEqual(ids(b.recent), [y, x]);

    await a.recent.open(x);
    await b.recent.open(x);

    assert.equal(b.store.resumed, 0);
    assert.deepEqual(ids(b.recent), [y]);
  });

  it("removes one entry, listing its sibling still", async () => {
    const x = seed("token-x", 1);
    const y = seed("token-y", 2);
    const { recent } = await openTab();

    await recent.remove(y);

    assert.deepEqual(ids(recent), [x]);
    assert.equal(local.getItem(BINDING_ENTRY_PREFIX + y), null);
  });

  it("re-reads the list when the store returns to the connect page", async () => {
    const x = seed("token-x", 1);
    const { recent, store } = await openTab();
    store.show("session");
    const y = seed("token-y", 2);

    store.show("connect");
    await settle();

    assert.deepEqual(ids(recent), [y, x]);
  });

  it("lists an entry again once the tab holding it closes and the list is re-read", async () => {
    const x = seed("token-x", 1);
    const a = await openTab();
    await a.recent.open(x);
    const b = await openTab();
    assert.deepEqual(ids(b.recent), []);

    a.close();
    await b.recent.refresh();

    assert.deepEqual(ids(b.recent), [x]);
  });

  it("re-reads the list when another tab changes an entry, and not for other storage", async () => {
    const { recent } = await openTab();
    const page = new FakePage();
    recent.followStorage(page);
    const x = seed("token-x", 1);

    page.storage("unrelated-key");
    await settle();
    assert.deepEqual(ids(recent), []);

    page.storage(BINDING_ENTRY_PREFIX + x);
    await settle();
    assert.deepEqual(ids(recent), [x]);
  });

  it("notifies subscribers each time the list is re-read", async () => {
    const { recent } = await openTab();
    let notified = 0;
    recent.subscribe(() => {
      notified += 1;
    });

    await recent.refresh();

    assert.equal(notified, 1);
  });
});
