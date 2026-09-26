/** Key the binding token is stored under. */
export const BINDING_TOKEN_STORAGE_KEY = "wendoo-simx-bridge:bindingToken";

/** The part of the Web Storage API a {@link BindingTokenStore} writes through to. */
export type TokenStorage = Pick<Storage, "getItem" | "setItem">;

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
}

/**
 * Open a binding token store over the storage `openStorage` returns, stored
 * under {@link BINDING_TOKEN_STORAGE_KEY}. Never throws.
 *
 * When `openStorage` or the first read throws, the store is not persistent:
 * it holds tokens in this frame's memory only, so they are lost when the
 * frame reloads. A persistent store whose storage later fails keeps working
 * from memory for the rest of the frame.
 */
export function openBindingTokenStore(openStorage: () => TokenStorage): BindingTokenStore {
  let storage: TokenStorage | undefined;
  let saved: string | undefined;
  try {
    storage = openStorage();
    saved = storage.getItem(BINDING_TOKEN_STORAGE_KEY) ?? undefined;
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
        storage?.setItem(BINDING_TOKEN_STORAGE_KEY, token);
      } catch {
        // The token stays in memory for the rest of the frame.
      }
    },
  };
}
