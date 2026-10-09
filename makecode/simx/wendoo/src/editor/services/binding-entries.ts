import type { BindingClaim, BindingClaims } from "./binding-claims";
import type { BindingTokenPersistence, EditorSessionStore } from "./editor-session-store";

/** The namespace of every storage key and binding claim name below. */
const appName = "@wendoo/editor";

/**
 * The editor's known bindings and the one this tab holds.
 *
 * `localStorage` keeps one ENTRY per binding the editor has joined, each
 * under its own key, `<app>:binding:<id>`, where the id is
 * {@link bindingEntryId} of the binding's token. `sessionStorage` records
 * the id of the binding this tab holds, so a reload resumes the same
 * binding. A tab holds a binding only under its exclusive claim (see
 * `binding-claims.ts`), so no two tabs present the same token.
 *
 * At boot, {@link openTabBinding} moves a token stored under the editor's
 * former single key into an entry, prunes, and resumes the binding this tab
 * recorded, when its entry exists and its claim is free. While another tab
 * holds the claim -- a duplicated tab's twin -- the tab holds no binding,
 * and keeps its record for its next boot. A tab that recorded none holds no
 * binding: the connect page offers the unclaimed entries
 * ({@link TabBinding.recent}) beside its join code.
 *
 * Pruning removes every unclaimed entry not seen for
 * {@link BINDING_ENTRY_TTL_MS}, then the oldest-seen unclaimed entries
 * beyond {@link BINDING_ENTRY_CAP}. A pruned entry's project is joined again
 * by its join code.
 */

/** How long an unclaimed entry lasts without being seen, in milliseconds: thirty days. */
export const BINDING_ENTRY_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** How many entries pruning keeps at most, evicting the oldest-seen unclaimed entries first. */
export const BINDING_ENTRY_CAP = 16;

/** The prefix of every entry's `localStorage` key, and of every binding claim's name. */
export const BINDING_ENTRY_PREFIX = `${appName}:binding:`;

/** The `localStorage` key of the editor's former single binding token, migrated at boot. */
export const LEGACY_BINDING_TOKEN_KEY = `${appName}:makecode-binding-token`;

/** The `sessionStorage` key recording the id of the binding this tab holds. */
export const TAB_BINDING_KEY = `${appName}:tab-binding`;

/** The part of a `Storage` the entries are kept through. */
export type BindingStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

/**
 * A {@link BindingStorage} reading the storage `read` returns at each use,
 * so a page whose storage is unavailable -- `read` throwing -- reads as one
 * holding nothing.
 *
 * @param read - Returns the storage, as `() => localStorage` does.
 */
export function deferredStorage(read: () => BindingStorage): BindingStorage {
  return {
    get length() {
      return read().length;
    },
    key: (index) => read().key(index),
    getItem: (key) => read().getItem(key),
    setItem: (key, value) => read().setItem(key, value),
    removeItem: (key) => read().removeItem(key),
  };
}

/** One known binding, as its entry stores it. */
export interface BindingEntry {
  /** The binding token; a credential, never to be shown, logged or sent. */
  readonly token: string;
  /** The project name the MakeCode side last published, or `undefined` before the first. */
  readonly projectName: string | undefined;
  /** The MakeCode target id the MakeCode side last declared, or `undefined` before the first. */
  readonly target: string | undefined;
  /** When a tab last joined, resumed, or connected over the binding, in epoch milliseconds. */
  readonly lastSeen: number;
}

/**
 * The id an entry is kept under for `token`: 64-bit FNV-1a over its UTF-16
 * code units, as sixteen lowercase hex digits. Every connection of one
 * binding yields the same id.
 */
export function bindingEntryId(token: string): string {
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < token.length; i++) {
    hash ^= BigInt(token.charCodeAt(i));
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, "0");
}

/** The `localStorage` key, and the claim name, of the entry with id `id`. */
function entryKey(id: string): string {
  return BINDING_ENTRY_PREFIX + id;
}

/** Reads `key`, or `null` when storage is unavailable. */
function getItem(storage: BindingStorage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

/** Writes `key`. No-ops when storage is full or unavailable. */
function setItem(storage: BindingStorage, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    // storage full or unavailable
  }
}

/** Removes `key`. No-ops when storage is unavailable. */
function removeItem(storage: BindingStorage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // storage unavailable
  }
}

/** Every key in `storage` starting with {@link BINDING_ENTRY_PREFIX}; none when storage is unavailable. */
function entryKeys(storage: BindingStorage): string[] {
  const keys: string[] = [];
  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith(BINDING_ENTRY_PREFIX)) keys.push(key);
    }
  } catch {
    return [];
  }
  return keys;
}

/** Parses an entry's stored text, or returns `undefined` when it is not an entry. */
function parseEntry(text: string | null): BindingEntry | undefined {
  if (text === null) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof value !== "object" || value === null) return undefined;
  const { token, projectName, target, lastSeen } = value as Record<string, unknown>;
  if (typeof token !== "string" || typeof lastSeen !== "number") return undefined;
  return {
    token,
    projectName: typeof projectName === "string" ? projectName : undefined,
    target: typeof target === "string" ? target : undefined,
    lastSeen,
  };
}

/** Stores `entry` under `id`. */
function writeEntry(storage: BindingStorage, id: string, entry: BindingEntry): void {
  setItem(storage, entryKey(id), JSON.stringify(entry));
}

/**
 * Every readable entry in `storage`, by id. Keys under the entry prefix
 * holding no readable entry are left out.
 */
export function readBindingEntries(storage: BindingStorage): Map<string, BindingEntry> {
  const entries = new Map<string, BindingEntry>();
  for (const key of entryKeys(storage)) {
    const entry = parseEntry(getItem(storage, key));
    if (entry !== undefined) entries.set(key.slice(BINDING_ENTRY_PREFIX.length), entry);
  }
  return entries;
}

/** Options for {@link openTabBinding}. */
export interface TabBindingOptions {
  /** Storage shared by every tab of the origin: `localStorage`. */
  readonly local: BindingStorage;
  /** This tab's own storage: `sessionStorage`. */
  readonly session: BindingStorage;
  /** The origin's binding claims. */
  readonly claims: BindingClaims;
  /** The current time in epoch milliseconds. Defaults to `Date.now`. */
  readonly now?: () => number;
}

/** Moves a token stored under {@link LEGACY_BINDING_TOKEN_KEY} into an entry seen at `now`, and removes the key. */
function migrateLegacyToken(local: BindingStorage, now: number): void {
  const token = getItem(local, LEGACY_BINDING_TOKEN_KEY);
  if (token === null) return;
  const id = bindingEntryId(token);
  if (parseEntry(getItem(local, entryKey(id))) === undefined) {
    writeEntry(local, id, { token, projectName: undefined, target: undefined, lastSeen: now });
  }
  removeItem(local, LEGACY_BINDING_TOKEN_KEY);
}

/**
 * Removes every key under the entry prefix holding no readable entry, every
 * unclaimed entry not seen within {@link BINDING_ENTRY_TTL_MS} of `now`,
 * then the oldest-seen unclaimed entries while more than
 * {@link BINDING_ENTRY_CAP} remain.
 */
function pruneEntries(local: BindingStorage, held: ReadonlySet<string>, now: number): void {
  const kept: { key: string; lastSeen: number }[] = [];
  for (const key of entryKeys(local)) {
    const entry = parseEntry(getItem(local, key));
    if (entry === undefined) {
      removeItem(local, key);
    } else if (!held.has(key) && now - entry.lastSeen > BINDING_ENTRY_TTL_MS) {
      removeItem(local, key);
    } else {
      kept.push({ key, lastSeen: entry.lastSeen });
    }
  }
  const evictable = kept.filter(({ key }) => !held.has(key)).sort((a, b) => a.lastSeen - b.lastSeen);
  let count = kept.length;
  for (const { key } of evictable) {
    if (count <= BINDING_ENTRY_CAP) break;
    removeItem(local, key);
    count--;
  }
}

/** One unclaimed entry, as the connect page offers it. */
export interface RecentBinding {
  /** The entry's id, which {@link TabBinding.take} and {@link TabBinding.remove} take. */
  readonly id: string;
  /** The project name the entry carries, or `undefined` when it carries none. */
  readonly projectName: string | undefined;
  /** The MakeCode target id the entry carries, or `undefined` when it carries none. */
  readonly target: string | undefined;
  /** When a tab last joined, resumed, or connected over the binding, in epoch milliseconds. */
  readonly lastSeen: number;
}

/**
 * Opens this tab's binding at boot: migrates the former single token,
 * prunes, then claims the binding the tab recorded (see the module
 * documentation). Resolves once the claim is settled; the binding it
 * returns holds a token only when the claim was granted.
 */
export async function openTabBinding(options: TabBindingOptions): Promise<TabBinding> {
  const { local, session, claims } = options;
  const now = options.now ?? Date.now;
  migrateLegacyToken(local, now());
  const held = await claims.heldNames();
  pruneEntries(local, held, now());
  const entries = readBindingEntries(local);
  const tab = new TabBinding(local, session, claims, now);

  const recorded = getItem(session, TAB_BINDING_KEY);
  const recordedEntry = recorded === null ? undefined : entries.get(recorded);
  if (recorded !== null && recordedEntry !== undefined) {
    const claim = claims.claim(entryKey(recorded), false);
    if (await claim.granted) tab.hold(recorded, recordedEntry, claim);
    return tab;
  }
  if (recorded !== null) removeItem(session, TAB_BINDING_KEY);
  return tab;
}

/**
 * The binding this tab holds, as the session store's token persistence:
 * {@link load} and {@link has} report its token, {@link save} makes a newly
 * joined binding this tab's, and {@link clear} removes this tab's entry
 * alone. Created by {@link openTabBinding}.
 */
export class TabBinding implements BindingTokenPersistence {
  private readonly _local: BindingStorage;
  private readonly _session: BindingStorage;
  private readonly _claims: BindingClaims;
  private readonly _now: () => number;
  /** The id of the binding this tab holds, or `undefined` while it holds none. */
  private _id: string | undefined;
  /** The held binding's entry as this tab last wrote it. */
  private _entry: BindingEntry | undefined;
  private _claim: BindingClaim | undefined;

  /** Use {@link openTabBinding}. */
  constructor(local: BindingStorage, session: BindingStorage, claims: BindingClaims, now: () => number) {
    this._local = local;
    this._session = session;
    this._claims = claims;
    this._now = now;
  }

  /** Every entry no tab holds, most recently seen first. */
  async recent(): Promise<RecentBinding[]> {
    const held = await this._claims.heldNames();
    return [...readBindingEntries(this._local)]
      .filter(([id]) => !held.has(entryKey(id)))
      .map(([id, entry]) => ({ id, projectName: entry.projectName, target: entry.target, lastSeen: entry.lastSeen }))
      .sort((a, b) => b.lastSeen - a.lastSeen);
  }

  /**
   * Makes the entry with id `id` this tab's binding, under its claim taken
   * only when no tab holds it, recorded and seen now; any binding held before
   * is let go. Resolves whether the tab now holds it: `false` when another
   * tab holds the claim or the entry is gone.
   */
  async take(id: string): Promise<boolean> {
    const claim = this._claims.claim(entryKey(id), false);
    const entry = (await claim.granted) ? parseEntry(getItem(this._local, entryKey(id))) : undefined;
    if (entry === undefined) {
      claim.release();
      return false;
    }
    if (this._id !== id) this._claim?.release();
    this.hold(id, entry, claim);
    return true;
  }

  /** Removes the entry with id `id`, unless it is this tab's own binding. */
  remove(id: string): void {
    if (id !== this._id) removeItem(this._local, entryKey(id));
  }

  /** Takes `entry`, under its granted `claim`, as this tab's binding, recorded and seen now. */
  hold(id: string, entry: BindingEntry, claim: BindingClaim): void {
    this._id = id;
    this._claim = claim;
    setItem(this._session, TAB_BINDING_KEY, id);
    this.write({ ...entry, lastSeen: this._now() });
  }

  load(): string | undefined {
    return this._entry?.token;
  }

  has(): boolean {
    return this._entry !== undefined;
  }

  /**
   * Upserts the entry of the binding `token` names, seen now. A token of
   * another binding than the one held makes that binding this tab's: the
   * held claim is let go, the new binding's claim is taken -- waiting for
   * any tab holding it -- and recorded, and the entry left behind stays for
   * other tabs.
   */
  save(token: string): void {
    const id = bindingEntryId(token);
    if (id === this._id && this._entry !== undefined) {
      this.write({ ...this._entry, token, lastSeen: this._now() });
      return;
    }
    this._claim?.release();
    this._id = id;
    this._claim = this._claims.claim(entryKey(id), true);
    setItem(this._session, TAB_BINDING_KEY, id);
    this.write({ token, projectName: undefined, target: undefined, lastSeen: this._now() });
  }

  /** Removes this tab's entry and record and lets its claim go; every other entry is kept. */
  clear(): void {
    if (this._id !== undefined) removeItem(this._local, entryKey(this._id));
    removeItem(this._session, TAB_BINDING_KEY);
    this._claim?.release();
    this._id = undefined;
    this._entry = undefined;
    this._claim = undefined;
  }

  /**
   * Follows `store` for as long as the page lives: each time its status
   * becomes `connected` the held entry is seen anew, and the project name
   * and target it reports are written to the held entry.
   */
  track(store: Pick<EditorSessionStore, "subscribe" | "getSnapshot">): void {
    let wasConnected = store.getSnapshot().status === "connected";
    store.subscribe(() => {
      const state = store.getSnapshot();
      const connected = state.status === "connected";
      const entry = this._entry;
      if (entry !== undefined) {
        const projectName = state.projectName ?? entry.projectName;
        const target = state.target ?? entry.target;
        const seen = connected && !wasConnected;
        if (seen || projectName !== entry.projectName || target !== entry.target) {
          this.write({ ...entry, projectName, target, lastSeen: seen ? this._now() : entry.lastSeen });
        }
      }
      wasConnected = connected;
    });
  }

  /** Stores `entry` as the held binding's. */
  private write(entry: BindingEntry): void {
    this._entry = entry;
    if (this._id !== undefined) writeEntry(this._local, this._id, entry);
  }
}
