/** Key the binding token of a frame serving no known project is stored under. */
export const BINDING_TOKEN_STORAGE_KEY = "wendoo-simx-bridge:bindingToken";

/**
 * The key the binding token of a frame serving the project `projectId` is
 * stored under: {@link BINDING_TOKEN_STORAGE_KEY} followed by `:` and the
 * project id, or {@link BINDING_TOKEN_STORAGE_KEY} alone when `projectId` is
 * `undefined`.
 *
 * @param projectId - The editor's id for the project the frame serves, as MakeCode passes it in the frame URL.
 */
export function bindingTokenStorageKey(projectId: string | undefined): string {
  return projectId === undefined ? BINDING_TOKEN_STORAGE_KEY : `${BINDING_TOKEN_STORAGE_KEY}:${projectId}`;
}

/** The part of the Web Storage API a {@link BindingTokenStore} writes through to. */
export type TokenStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Keeps the binding token of this simulator extension's bridge session. */
export interface BindingTokenStore {
  /**
   * `true` when saved tokens are written through to the storage and outlive
   * this frame; `false` when the storage could not be opened and tokens are
   * held in this frame's memory only.
   */
  readonly persistent: boolean;
  /** The token saved last, or `undefined` when none has been. */
  load(): string | undefined;
  /** Save `token`, replacing any saved before. */
  save(token: string): void;
  /** Remove the saved token, so {@link load} returns `undefined`. */
  clear(): void;
}

/**
 * Open a binding token store over the storage `openStorage` returns, stored
 * under the key {@link bindingTokenStorageKey} gives for `projectId`, so each
 * project keeps its own token and a store opened for another project finds
 * none. Never throws.
 *
 * When `openStorage` or the first read throws, the store is not persistent:
 * it holds tokens in this frame's memory only, so they are lost when the
 * frame reloads. A persistent store whose storage later fails keeps working
 * from memory for the rest of the frame.
 */
export function openBindingTokenStore(openStorage: () => TokenStorage, projectId?: string): BindingTokenStore {
  const key = bindingTokenStorageKey(projectId);
  let storage: TokenStorage | undefined;
  let saved: string | undefined;
  try {
    storage = openStorage();
    saved = storage.getItem(key) ?? undefined;
  } catch {
    storage = undefined;
  }
  return {
    persistent: storage !== undefined,
    load() {
      return saved;
    },
    save(token) {
      saved = token;
      try {
        storage?.setItem(key, token);
      } catch {
        // The token stays in memory for the rest of the frame.
      }
    },
    clear() {
      saved = undefined;
      try {
        storage?.removeItem(key);
      } catch {
        // The token is gone from memory; the storage keeps it until it next accepts a write.
      }
    },
  };
}
