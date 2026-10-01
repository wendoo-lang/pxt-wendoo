import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BINDING_TOKEN_STORAGE_KEY,
  bindingTokenStorageKey,
  openBindingTokenStore,
  type TokenStorage,
} from "./binding-token-store.js";

/** Web storage holding its items in memory, whose writes throw once `failWrites` is set. */
class MemoryStorage implements TokenStorage {
  readonly items = new Map<string, string>();
  failWrites = false;

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) throw new Error("storage write refused");
    this.items.set(key, value);
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }
}

describe("binding token store", () => {
  it("writes tokens through to the storage, where a store opened later finds them", () => {
    const storage = new MemoryStorage();
    const store = openBindingTokenStore(() => storage);
    assert.equal(store.persistent, true);
    assert.equal(store.load(), undefined);

    store.save("token-1");

    assert.equal(storage.items.get(BINDING_TOKEN_STORAGE_KEY), "token-1");
    assert.equal(openBindingTokenStore(() => storage).load(), "token-1");
  });

  it("clears the saved token from memory and the storage, where a store opened later finds none", () => {
    const storage = new MemoryStorage();
    const store = openBindingTokenStore(() => storage);
    store.save("token-1");

    store.clear();

    assert.equal(store.load(), undefined);
    assert.equal(storage.items.has(BINDING_TOKEN_STORAGE_KEY), false);
    assert.equal(openBindingTokenStore(() => storage).load(), undefined);
  });

  it("holds tokens in memory, not persistent, when the storage cannot be opened", () => {
    const store = openBindingTokenStore(() => {
      throw new Error("storage denied to this frame");
    });
    assert.equal(store.persistent, false);

    store.save("token-1");

    assert.equal(store.load(), "token-1");
  });

  it("keeps a token it could not write for the rest of the frame", () => {
    const storage = new MemoryStorage();
    const store = openBindingTokenStore(() => storage);
    storage.failWrites = true;

    store.save("token-1");

    assert.equal(store.load(), "token-1");
    assert.equal(storage.items.size, 0);
  });

  it("stores the token of a frame serving a project under that project's key", () => {
    const storage = new MemoryStorage();

    openBindingTokenStore(() => storage, "project-a").save("token-a");

    assert.deepEqual([...storage.items], [[bindingTokenStorageKey("project-a"), "token-a"]]);
    assert.notEqual(bindingTokenStorageKey("project-a"), BINDING_TOKEN_STORAGE_KEY);
    assert.equal(bindingTokenStorageKey(undefined), BINDING_TOKEN_STORAGE_KEY);
  });

  it("finds no token for another project, and each project's own token when it returns", () => {
    const storage = new MemoryStorage();
    openBindingTokenStore(() => storage, "project-a").save("token-a");

    const switched = openBindingTokenStore(() => storage, "project-b");
    assert.equal(switched.load(), undefined);
    switched.save("token-b");
    const returned = openBindingTokenStore(() => storage, "project-a");

    assert.equal(returned.load(), "token-a");
    assert.equal(openBindingTokenStore(() => storage, "project-b").load(), "token-b");
  });

  it("keeps a frame serving no known project on the unscoped key, apart from every project's", () => {
    const storage = new MemoryStorage();
    openBindingTokenStore(() => storage, "project-a").save("token-a");

    const unscoped = openBindingTokenStore(() => storage);
    unscoped.save("token-tab");

    assert.equal(storage.items.get(BINDING_TOKEN_STORAGE_KEY), "token-tab");
    assert.equal(openBindingTokenStore(() => storage, "project-a").load(), "token-a");
  });

  it("hands a project's token to a store a newly opened tab opens over the same storage, and none of another project's", () => {
    const storage = new MemoryStorage();
    const closedTab = openBindingTokenStore(() => storage, "project-a");
    closedTab.save("token-a");
    openBindingTokenStore(() => storage, "project-b").save("token-b");

    const newTab = openBindingTokenStore(() => storage, "project-a");

    assert.equal(newTab.load(), "token-a");
    newTab.clear();
    assert.equal(openBindingTokenStore(() => storage, "project-a").load(), undefined);
    assert.equal(openBindingTokenStore(() => storage, "project-b").load(), "token-b");
  });

  it("clears only its own project's token", () => {
    const storage = new MemoryStorage();
    openBindingTokenStore(() => storage, "project-a").save("token-a");
    const other = openBindingTokenStore(() => storage, "project-b");
    other.save("token-b");

    other.clear();

    assert.equal(openBindingTokenStore(() => storage, "project-a").load(), "token-a");
    assert.equal(openBindingTokenStore(() => storage, "project-b").load(), undefined);
  });
});
