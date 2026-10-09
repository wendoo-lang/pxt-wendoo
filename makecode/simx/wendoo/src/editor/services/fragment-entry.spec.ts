import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { enterSession, type PageAddress, takeFragmentJoinCode } from "./fragment-entry.js";

/** A page address the spec reads, whose `replaceState` rewrites it the way a browser's history does. */
class FakePage implements PageAddress {
  readonly location: { pathname: string; search: string; hash: string };
  readonly history: { state: unknown; replaceState(state: unknown, unused: string, url: string): void };
  /** The URL of every `replaceState` call, in order. */
  readonly replaced: string[] = [];

  constructor(pathname: string, search: string, hash: string) {
    this.location = { pathname, search, hash };
    const replaced = this.replaced;
    const location = this.location;
    this.history = {
      state: { scroll: 1 },
      replaceState(state, _unused, url) {
        replaced.push(url);
        this.state = state;
        const parsed = new URL(url, "http://localhost:5176");
        location.pathname = parsed.pathname;
        location.search = parsed.search;
        location.hash = parsed.hash;
      },
    };
  }

  /** The page URL as the address bar shows it, without its origin. */
  get url(): string {
    return this.location.pathname + this.location.search + this.location.hash;
  }
}

describe("fragment join code", () => {
  it("takes the join code from a #code= fragment and scrubs the fragment from the URL", () => {
    const page = new FakePage("/", "?lang=en", "#code=ribbon-lemur-whistle");

    const code = takeFragmentJoinCode(page);

    assert.equal(code, "ribbon-lemur-whistle");
    assert.equal(page.url, "/?lang=en");
    assert.deepEqual(page.replaced, ["/?lang=en"]);
    assert.deepEqual(page.history.state, { scroll: 1 });
  });

  it("decodes the carried code and trims it", () => {
    assert.equal(
      takeFragmentJoinCode(new FakePage("/", "", "#code=%20ribbon%2Dlemur-whistle%20")),
      "ribbon-lemur-whistle"
    );
  });

  it("scrubs a fragment whose code is not valid encoded text, decoding what it can", () => {
    const page = new FakePage("/", "", "#code=ribbon%E0");

    assert.equal(takeFragmentJoinCode(page), `ribbon${String.fromCodePoint(0xfffd)}`);
    assert.equal(page.url, "/");
  });

  it("leaves a fragment that carries no code untouched", () => {
    for (const hash of ["", "#", "#section", "#codes=ribbon", "#other=1&code=ribbon", "#code=", "#code=%20"]) {
      const page = new FakePage("/", "", hash);

      assert.equal(takeFragmentJoinCode(page), undefined, `expected no code from "${hash}"`);
      assert.equal(page.location.hash, hash);
      assert.deepEqual(page.replaced, []);
    }
  });
});

describe("entering the session at boot", () => {
  /** A store recording how it was entered. */
  function recordingStore(): { calls: string[]; connect(code: string): void; resume(): boolean } {
    const calls: string[] = [];
    return {
      calls,
      connect(code) {
        calls.push(`connect:${code}`);
      },
      resume() {
        calls.push("resume");
        return true;
      },
    };
  }

  it("joins by a fragment's code, scrubbing it before the store sees it", () => {
    const page = new FakePage("/", "", "#code=ribbon-lemur-whistle");
    const store = recordingStore();
    const urlsSeen: string[] = [];
    const connect = store.connect;
    store.connect = (code) => {
      urlsSeen.push(page.url);
      connect(code);
    };

    enterSession(store, page);

    assert.deepEqual(store.calls, ["connect:ribbon-lemur-whistle"]);
    assert.deepEqual(urlsSeen, ["/"]);
  });

  it("resumes a persisted session when the page carries no code", () => {
    for (const hash of ["", "#section"]) {
      const store = recordingStore();

      enterSession(store, new FakePage("/", "", hash));

      assert.deepEqual(store.calls, ["resume"]);
    }
  });
});
