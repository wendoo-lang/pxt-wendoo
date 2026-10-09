import type { BindingClaim, BindingClaims } from "../services/binding-claims.js";

/** One claim request, granted or waiting. */
interface Request {
  readonly grant: (granted: boolean) => void;
  released: boolean;
}

/** One tab's view of a {@link FakeBindingClaims}: the claims it takes, let go together by {@link close}. */
export interface FakeTab {
  /** The claims this tab takes. */
  readonly claims: BindingClaims;
  /** The tab closing: every claim it holds is let go, and every claim it waits for is dropped. */
  close(): void;
}

/**
 * Exclusive claims shared by the tabs a spec opens, in memory, granting a
 * waiting claim when the tab holding it lets it go, in request order.
 */
export class FakeBindingClaims {
  private readonly _holders = new Map<string, Request>();
  private readonly _waiting = new Map<string, Request[]>();

  /** Opens a tab whose claims share this origin's. */
  tab(): FakeTab {
    const requests = new Set<{ name: string; request: Request }>();
    return {
      claims: {
        claim: (name, wait) => this.claim(requests, name, wait),
        heldNames: async () => new Set(this._holders.keys()),
      },
      close: () => {
        for (const { name, request } of requests) this.release(name, request);
        requests.clear();
      },
    };
  }

  /** The names some tab holds now. */
  held(): string[] {
    return [...this._holders.keys()];
  }

  private claim(requests: Set<{ name: string; request: Request }>, name: string, wait: boolean): BindingClaim {
    let grant: (granted: boolean) => void = () => {};
    const granted = new Promise<boolean>((resolve) => {
      grant = resolve;
    });
    const request: Request = { grant, released: false };
    const record = { name, request };
    if (!this._holders.has(name)) {
      this._holders.set(name, request);
      requests.add(record);
      grant(true);
    } else if (wait) {
      const queue = this._waiting.get(name) ?? [];
      queue.push(request);
      this._waiting.set(name, queue);
      requests.add(record);
    } else {
      grant(false);
    }
    return {
      granted,
      release: () => {
        requests.delete(record);
        this.release(name, request);
      },
    };
  }

  private release(name: string, request: Request): void {
    if (request.released) return;
    request.released = true;
    if (this._holders.get(name) === request) {
      this._holders.delete(name);
      const queue = this._waiting.get(name) ?? [];
      const next = queue.shift();
      if (queue.length === 0) this._waiting.delete(name);
      if (next !== undefined) {
        this._holders.set(name, next);
        next.grant(true);
      }
      return;
    }
    const queue = this._waiting.get(name);
    if (queue === undefined) return;
    const index = queue.indexOf(request);
    if (index !== -1) queue.splice(index, 1);
    if (queue.length === 0) this._waiting.delete(name);
    request.grant(false);
  }
}
