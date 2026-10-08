import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { FakeBindingClaims, type FakeTab } from "../test-support/fake-binding-claims.js";
import { MemoryStorage } from "../test-support/memory-storage.js";
import {
  BINDING_ENTRY_CAP,
  BINDING_ENTRY_PREFIX,
  BINDING_ENTRY_TTL_MS,
  type BindingEntry,
  bindingEntryId,
  LEGACY_BINDING_TOKEN_KEY,
  openTabBinding,
  readBindingEntries,
  TAB_BINDING_KEY,
  type TabBinding,
} from "./binding-entries.js";
import type { EditorSessionViewState } from "./editor-session-store.js";

/** One booted editor tab: its claims, its own storage, and the binding it opened. */
interface Tab {
  readonly claims: FakeTab;
  readonly session: MemoryStorage;
  readonly binding: TabBinding;
}

const DAY_MS = 24 * 60 * 60 * 1000;

describe("binding entries", () => {
  let local: MemoryStorage;
  let claims: FakeBindingClaims;
  let clock: number;

  beforeEach(() => {
    local = new MemoryStorage();
    claims = new FakeBindingClaims();
    clock = 100 * DAY_MS;
  });

  /** Boots a tab over the shared storage and claims, with `session` as its own storage. */
  async function boot(session = new MemoryStorage()): Promise<Tab> {
    const tab = claims.tab();
    const binding = await openTabBinding({ local, session, claims: tab.claims, now: () => clock });
    return { claims: tab, session, binding };
  }

  /** Boots a tab and takes the entry of `token` as its binding. */
  async function holding(token: string): Promise<Tab> {
    const tab = await boot();
    assert.equal(await tab.binding.take(bindingEntryId(token)), true);
    return tab;
  }

  /** Stores an entry for `token`, last seen `ageMs` ago, carrying `projectName`. */
  function seed(token: string, ageMs = 0, projectName?: string): string {
    const id = bindingEntryId(token);
    const entry: BindingEntry = { token, projectName, target: undefined, lastSeen: clock - ageMs };
    local.setItem(BINDING_ENTRY_PREFIX + id, JSON.stringify(entry));
    return id;
  }

  /** The tokens of every stored entry, sorted. */
  function storedTokens(): string[] {
    return [...readBindingEntries(local).values()].map((entry) => entry.token).sort();
  }

  /** A store reporting the states the spec sets, `useSyncExternalStore`-shaped. */
  function fakeStore(): {
    store: { subscribe(listener: () => void): () => void; getSnapshot(): EditorSessionViewState };
    set(fields: Partial<EditorSessionViewState>): void;
  } {
    let state = { status: "disconnected", projectName: undefined, target: undefined } as EditorSessionViewState;
    const listeners = new Set<() => void>();
    return {
      store: {
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        getSnapshot: () => state,
      },
      set(fields) {
        state = { ...state, ...fields };
        for (const listener of listeners) listener();
      },
    };
  }

  it("keys each binding by a digest of its token: equal tokens share an id, different tokens do not", () => {
    assert.equal(bindingEntryId("binding-a.0011"), bindingEntryId("binding-a.0011"));
    assert.notEqual(bindingEntryId("binding-a.0011"), bindingEntryId("binding-b.0011"));
    assert.match(bindingEntryId("binding-a.0011"), /^[0-9a-f]{16}$/);
  });

  describe("cold start", () => {
    it("holds no binding when no entry exists", async () => {
      const tab = await boot();

      assert.equal(tab.binding.has(), false);
      assert.equal(tab.binding.load(), undefined);
      assert.deepEqual(await tab.binding.recent(), []);
    });

    it("holds no binding over one entry or two, claiming none and keeping both", async () => {
      seed("token-x");
      const one = await boot();
      assert.equal(one.binding.has(), false);

      seed("token-y");
      const two = await boot();
      assert.equal(two.binding.has(), false);
      assert.equal(two.session.getItem(TAB_BINDING_KEY), null);
      assert.deepEqual(claims.held(), []);
      assert.deepEqual(storedTokens(), ["token-x", "token-y"]);
    });

    it("drops a recorded binding whose entry is gone, holding none", async () => {
      const session = new MemoryStorage();
      session.setItem(TAB_BINDING_KEY, bindingEntryId("token-gone"));
      seed("token-x");

      const tab = await boot(session);

      assert.equal(tab.binding.has(), false);
      assert.equal(session.getItem(TAB_BINDING_KEY), null);
    });
  });

  describe("recent entries", () => {
    it("lists every unclaimed entry, most recently seen first, without its token", async () => {
      const older = seed("token-x", 2 * DAY_MS, "Maze");
      const newer = seed("token-y", DAY_MS, "Space Chase");
      const tab = await boot();

      const recent = await tab.binding.recent();

      assert.deepEqual(
        recent.map((binding) => binding.id),
        [newer, older]
      );
      assert.equal(recent[0].projectName, "Space Chase");
      assert.ok(recent.every((binding) => !("token" in binding)));
    });

    it("leaves out an entry another tab holds", async () => {
      seed("token-x");
      const y = seed("token-y");
      await holding("token-x");

      const other = await boot();

      assert.deepEqual(
        (await other.binding.recent()).map((binding) => binding.id),
        [y]
      );
    });

    it("takes a listed entry as the tab's binding, claiming and recording it, and seeing it now", async () => {
      const x = seed("token-x", 3 * DAY_MS);
      seed("token-y");
      const tab = await boot();

      assert.equal(await tab.binding.take(x), true);

      assert.equal(tab.binding.load(), "token-x");
      assert.equal(tab.session.getItem(TAB_BINDING_KEY), x);
      assert.deepEqual(claims.held(), [BINDING_ENTRY_PREFIX + x]);
      assert.equal(readBindingEntries(local).get(x)?.lastSeen, clock);
    });

    it("refuses to take an entry another tab took first, or one that is gone", async () => {
      const x = seed("token-x");
      await holding("token-x");
      const late = await boot();

      assert.equal(await late.binding.take(x), false);
      assert.equal(await late.binding.take(bindingEntryId("token-gone")), false);
      assert.equal(late.binding.has(), false);
      assert.deepEqual(claims.held(), [BINDING_ENTRY_PREFIX + x]);
    });

    it("lets only one of two tabs taking the same entry together have it", async () => {
      const x = seed("token-x");
      const [first, second] = await Promise.all([boot(), boot()]);

      const taken = await Promise.all([first.binding.take(x), second.binding.take(x)]);

      assert.deepEqual(taken.sort(), [false, true]);
    });

    it("removes one entry, leaving its sibling", async () => {
      const x = seed("token-x");
      seed("token-y");
      const tab = await boot();

      tab.binding.remove(x);

      assert.deepEqual(storedTokens(), ["token-y"]);
    });

    it("never removes the tab's own binding", async () => {
      const x = seed("token-x");
      const tab = await holding("token-x");

      tab.binding.remove(x);

      assert.deepEqual(storedTokens(), ["token-x"]);
    });
  });

  describe("tab ownership", () => {
    it("resumes each tab's own binding, two tabs over two entries", async () => {
      const x = seed("token-x");
      const y = seed("token-y");
      const sessionA = new MemoryStorage();
      sessionA.setItem(TAB_BINDING_KEY, x);
      const sessionB = new MemoryStorage();
      sessionB.setItem(TAB_BINDING_KEY, y);

      const a = await boot(sessionA);
      const b = await boot(sessionB);

      assert.equal(a.binding.load(), "token-x");
      assert.equal(b.binding.load(), "token-y");
      assert.deepEqual(claims.held().sort(), [BINDING_ENTRY_PREFIX + x, BINDING_ENTRY_PREFIX + y].sort());
    });

    it("resumes its own binding on reload, once the closing page has let its claim go", async () => {
      seed("token-x");
      const a = await boot();
      a.binding.save("token-z");
      a.claims.close();

      const reloaded = await boot(a.session);

      assert.equal(reloaded.binding.load(), "token-z");
    });

    it("keeps a duplicated tab out of its twin's binding, keeping the record for when the twin is gone", async () => {
      seed("token-x");
      const twin = await holding("token-x");

      const duplicate = await boot(twin.session.copy());
      assert.equal(duplicate.binding.has(), false);
      assert.deepEqual(await duplicate.binding.recent(), []);
      assert.equal(duplicate.session.getItem(TAB_BINDING_KEY), bindingEntryId("token-x"));

      twin.claims.close();
      const reloaded = await boot(duplicate.session);
      assert.equal(reloaded.binding.load(), "token-x");
    });
  });

  describe("joining and leaving", () => {
    it("upserts a joined binding's entry beside a sibling's, claiming and recording it", async () => {
      const x = seed("token-x");
      const sibling = await holding("token-x");
      const joiner = await boot();

      joiner.binding.save("token-y");

      const y = bindingEntryId("token-y");
      assert.deepEqual(storedTokens(), ["token-x", "token-y"]);
      assert.equal(joiner.binding.load(), "token-y");
      assert.equal(joiner.session.getItem(TAB_BINDING_KEY), y);
      assert.equal(sibling.binding.load(), "token-x");
      assert.deepEqual(claims.held().sort(), [BINDING_ENTRY_PREFIX + x, BINDING_ENTRY_PREFIX + y].sort());
    });

    it("moves to a newly joined binding, leaving the earlier entry unclaimed for other tabs", async () => {
      const x = seed("token-x");
      const tab = await holding("token-x");

      tab.binding.save("token-y");

      assert.deepEqual(storedTokens(), ["token-x", "token-y"]);
      const other = await boot();
      assert.deepEqual(
        (await other.binding.recent()).map((binding) => binding.id),
        [x]
      );
    });

    it("waits for the claim of a joined binding another tab holds, and takes it once that tab closes", async () => {
      const x = seed("token-x");
      const holder = await holding("token-x");
      const joiner = await boot();

      joiner.binding.save("token-x");
      assert.equal(joiner.binding.load(), "token-x");

      holder.claims.close();
      await Promise.resolve();
      assert.deepEqual(claims.held(), [BINDING_ENTRY_PREFIX + x]);
      const third = await boot();
      assert.deepEqual(await third.binding.recent(), []);
    });

    it("clears only its own entry, record and claim, leaving a sibling's entry and claim", async () => {
      const x = seed("token-x");
      const a = await holding("token-x");
      const b = await boot();
      b.binding.save("token-y");

      a.binding.clear();

      assert.equal(a.binding.has(), false);
      assert.equal(a.session.getItem(TAB_BINDING_KEY), null);
      assert.deepEqual(storedTokens(), ["token-y"]);
      assert.deepEqual(claims.held(), [BINDING_ENTRY_PREFIX + bindingEntryId("token-y")]);
      assert.equal(local.getItem(BINDING_ENTRY_PREFIX + x), null);
      assert.equal(b.binding.load(), "token-y");
    });
  });

  describe("migration", () => {
    it("moves the former single token into an entry once, removing the old key, and lists it", async () => {
      local.setItem(LEGACY_BINDING_TOKEN_KEY, "token-legacy");

      const tab = await boot();

      assert.equal(local.getItem(LEGACY_BINDING_TOKEN_KEY), null);
      assert.deepEqual(storedTokens(), ["token-legacy"]);
      assert.equal(tab.binding.has(), false);
      assert.deepEqual(
        (await tab.binding.recent()).map((binding) => binding.id),
        [bindingEntryId("token-legacy")]
      );
    });

    it("keeps the existing entry when the former token already has one", async () => {
      const id = seed("token-legacy", 2 * DAY_MS, "Maze");
      local.setItem(LEGACY_BINDING_TOKEN_KEY, "token-legacy");
      seed("token-y");

      await boot();

      assert.equal(local.getItem(LEGACY_BINDING_TOKEN_KEY), null);
      assert.deepEqual(storedTokens(), ["token-legacy", "token-y"]);
      assert.equal(readBindingEntries(local).get(id)?.projectName, "Maze");
    });
  });

  describe("pruning", () => {
    it("prunes unclaimed entries not seen within the lifetime at boot, keeping fresher ones", async () => {
      seed("token-stale", BINDING_ENTRY_TTL_MS + 1);
      seed("token-fresh", BINDING_ENTRY_TTL_MS - 1);
      seed("token-new");

      await boot();

      assert.deepEqual(storedTokens(), ["token-fresh", "token-new"]);
    });

    it("never prunes an entry a live tab holds, however long unseen", async () => {
      seed("token-x");
      const holder = await holding("token-x");
      clock += BINDING_ENTRY_TTL_MS + DAY_MS;

      await boot();

      assert.deepEqual(storedTokens(), ["token-x"]);
      assert.equal(holder.binding.load(), "token-x");
    });

    it("evicts the oldest-seen unclaimed entries beyond the cap, never a claimed one", async () => {
      seed("token-held", 6 * DAY_MS);
      const holder = await holding("token-held");
      const tokens: string[] = [];
      for (let i = 0; i < BINDING_ENTRY_CAP + 1; i++) {
        const token = `token-${String(i).padStart(2, "0")}`;
        tokens.push(token);
        seed(token, (i + 1) * 60_000);
      }

      await boot();

      const kept = storedTokens();
      assert.equal(kept.length, BINDING_ENTRY_CAP);
      assert.ok(kept.includes("token-held"));
      assert.ok(!kept.includes(tokens[BINDING_ENTRY_CAP]));
      assert.ok(!kept.includes(tokens[BINDING_ENTRY_CAP - 1]));
      assert.ok(kept.includes(tokens[0]));
      assert.equal(holder.binding.load(), "token-held");
    });

    it("removes a stored item under the entry prefix that holds no entry", async () => {
      local.setItem(`${BINDING_ENTRY_PREFIX}garbled`, "{not json");
      local.setItem(`${BINDING_ENTRY_PREFIX}shapeless`, '{"token":7}');
      seed("token-x");

      await boot();

      assert.equal(local.length, 1);
      assert.deepEqual(storedTokens(), ["token-x"]);
    });
  });

  describe("last seen", () => {
    it("refreshes the entry it resumes at boot", async () => {
      const id = seed("token-x", 3 * DAY_MS);
      const session = new MemoryStorage();
      session.setItem(TAB_BINDING_KEY, id);

      await boot(session);

      assert.equal(readBindingEntries(local).get(id)?.lastSeen, clock);
    });

    it("refreshes the held entry each time the store connects, and records the project it reports", async () => {
      const id = seed("token-x", 3 * DAY_MS);
      const tab = await holding("token-x");
      const { store, set } = fakeStore();
      tab.binding.track(store);

      clock += DAY_MS;
      set({ status: "connected", projectName: "Space Chase", target: "arcade" });
      let entry = readBindingEntries(local).get(id);
      assert.equal(entry?.lastSeen, clock);
      assert.equal(entry?.projectName, "Space Chase");
      assert.equal(entry?.target, "arcade");

      const connectedAt = clock;
      clock += DAY_MS;
      set({ status: "disconnected", projectName: undefined, target: undefined });
      entry = readBindingEntries(local).get(id);
      assert.equal(entry?.lastSeen, connectedAt);
      assert.equal(entry?.projectName, "Space Chase");

      set({ status: "connected" });
      assert.equal(readBindingEntries(local).get(id)?.lastSeen, clock);
    });

    it("writes nothing while the tab holds no binding", async () => {
      seed("token-x");
      seed("token-y");
      const tab = await boot();
      const { store, set } = fakeStore();
      tab.binding.track(store);

      set({ status: "connected", projectName: "Space Chase" });

      assert.deepEqual(
        [...readBindingEntries(local).values()].map((entry) => entry.projectName),
        [undefined, undefined]
      );
      assert.equal(tab.session.getItem(TAB_BINDING_KEY), null);
    });
  });
});
