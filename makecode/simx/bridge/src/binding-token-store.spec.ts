import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BINDING_TOKEN_STORAGE_KEY, openBindingTokenStore, type TokenStorage } from "./binding-token-store.js";

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
});
