/**
 * One tab's claim on a binding: exclusive across every tab of the origin
 * while held. A held claim is let go by {@link release}, and by the tab
 * closing or reloading.
 */
export interface BindingClaim {
  /**
   * Resolves `true` once this tab holds the claim, and `false` when it never
   * will: an immediate claim another tab holds, or a claim released before
   * it was granted.
   */
  readonly granted: Promise<boolean>;
  /** Lets the claim go, held or still waiting. Idempotent. */
  release(): void;
}

/** Exclusive per-binding claims shared by every tab of the origin. */
export interface BindingClaims {
  /**
   * Claims `name`. With `wait` false the claim is granted only when no tab
   * holds it now; with `wait` true it waits for the tab holding it to let it
   * go.
   */
  claim(name: string, wait: boolean): BindingClaim;
  /** The names of every claim some tab holds at this moment; none when they cannot be read. */
  heldNames(): Promise<ReadonlySet<string>>;
}

/**
 * Claims over the Web Locks API: each claim is an exclusive lock of its
 * name, held until released or until the holding page goes away.
 *
 * @param locks - The page's lock manager, `navigator.locks`.
 */
export function webLockBindingClaims(locks: LockManager): BindingClaims {
  return {
    claim(name, wait) {
      const controller = new AbortController();
      let released = false;
      let letGo: () => void = () => {};
      const granted = new Promise<boolean>((resolveGranted) => {
        const options: LockOptions = wait ? { signal: controller.signal } : { ifAvailable: true };
        locks
          .request(name, options, (lock) => {
            if (lock === null || released) {
              resolveGranted(false);
              return undefined;
            }
            resolveGranted(true);
            return new Promise<void>((resolve) => {
              letGo = resolve;
            });
          })
          .catch(() => {
            // Aborted while waiting: released before it was granted.
            resolveGranted(false);
          });
      });
      return {
        granted,
        release() {
          released = true;
          controller.abort();
          letGo();
        },
      };
    },
    async heldNames() {
      const names = new Set<string>();
      const snapshot = await locks.query().catch(() => undefined);
      for (const lock of snapshot?.held ?? []) {
        if (lock.name !== undefined) names.add(lock.name);
      }
      return names;
    },
  };
}

/**
 * Claims that exclude nothing: every claim is granted at once and none is
 * reported held, so each tab behaves as if it were the only one.
 */
export function unsharedBindingClaims(): BindingClaims {
  return {
    claim() {
      return { granted: Promise.resolve(true), release() {} };
    },
    async heldNames() {
      return new Set();
    },
  };
}

/**
 * The page's binding claims: Web Locks where the page has them, otherwise
 * {@link unsharedBindingClaims}, saying so in the console. Pages outside a
 * secure context have no Web Locks.
 *
 * @param locks - The page's lock manager, `navigator.locks`, or `undefined` when it has none.
 */
export function bindingClaimsFor(locks: LockManager | undefined): BindingClaims {
  if (locks !== undefined) return webLockBindingClaims(locks);
  console.warn("Web Locks are unavailable: editor tabs do not exclude each other from a binding");
  return unsharedBindingClaims();
}
