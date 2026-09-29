import type { EditorSessionStore } from "./editor-session-store";

/** The part of a page -- `window` in the browser -- that carries its URL: the location to read and the history to rewrite it through. */
export interface PageAddress {
  readonly location: Pick<Location, "pathname" | "search" | "hash">;
  readonly history: Pick<History, "state" | "replaceState">;
}

/** The start of a fragment carrying a join code, as the simx's editor link writes it. */
const CODE_FRAGMENT = "#code=";

/**
 * Takes the join code a link carried in the page's fragment, written
 * `#code=<code>` with the code percent-encoded. When the fragment carries a
 * non-empty code, rewrites the URL without the fragment -- keeping the path,
 * the query, and the history state -- before returning the decoded, trimmed
 * code. Any other fragment, and a code empty once trimmed, is left in the
 * URL untouched, and `undefined` is returned.
 */
export function takeFragmentJoinCode(page: PageAddress): string | undefined {
  const { hash, pathname, search } = page.location;
  if (!hash.startsWith(CODE_FRAGMENT)) return undefined;
  const code = new URLSearchParams(hash.slice(1)).get("code")?.trim();
  if (!code) return undefined;
  page.history.replaceState(page.history.state, "", pathname + search);
  return code;
}

/**
 * Opens the page's session at boot: joins by the join code the page's
 * fragment carries, through {@link takeFragmentJoinCode} and `connect`,
 * when it carries one; otherwise resumes the session a persisted token
 * names, if any.
 */
export function enterSession(store: Pick<EditorSessionStore, "connect" | "resume">, page: PageAddress): void {
  const code = takeFragmentJoinCode(page);
  if (code === undefined) {
    store.resume();
    return;
  }
  store.connect(code);
}
