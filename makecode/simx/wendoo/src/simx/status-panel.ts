/** The tile-native "wendoo" logotype as inline SVG, 78 x 19 units, drawn in `currentColor`. */
const LOGOTYPE =
  '<svg class="logotype" viewBox="0 0 78 19" fill="none" aria-hidden="true">' +
  '<g stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M3 8V14.2a1.8 1.8 0 0 0 1.8 1.8h2.4a1.8 1.8 0 0 0 1.8-1.8V11V14.2a1.8 1.8 0 0 0 1.8 1.8h2.4a1.8 1.8 0 0 0 1.8-1.8V8"></path>' +
  '<path d="M26 16h-5.2a1.8 1.8 0 0 1-1.8-1.8v-4.4a1.8 1.8 0 0 1 1.8-1.8h4.4a1.8 1.8 0 0 1 1.8 1.8V12H19"></path>' +
  '<path d="M31 16V9.8a1.8 1.8 0 0 1 1.8-1.8h4.4a1.8 1.8 0 0 1 1.8 1.8V16"></path>' +
  '<path d="M51 3V14.2a1.8 1.8 0 0 1-1.8 1.8h-4.4a1.8 1.8 0 0 1-1.8-1.8v-4.4a1.8 1.8 0 0 1 1.8-1.8H51"></path>' +
  "</g>" +
  '<rect x="55" y="8" width="8" height="8" rx="1.8" stroke="currentColor" stroke-width="2"></rect>' +
  '<circle cx="59.55" cy="11.6" r="1.9" fill="currentColor"></circle>' +
  '<path fill-rule="evenodd" fill="currentColor" d="M68.8 7h4.4a2.8 2.8 0 0 1 2.8 2.8v4.4a2.8 2.8 0 0 1-2.8 2.8h-4.4a2.8 2.8 0 0 1-2.8-2.8v-4.4a2.8 2.8 0 0 1 2.8-2.8ZM73.45 11.6a1.9 1.9 0 1 1-3.8 0a1.9 1.9 0 1 1 3.8 0Z"></path>' +
  "</svg>";

/** The Wendoo homepage the logotype links to. */
const HOMEPAGE_URL = "https://wendoo.com";

/** The character reference each character HTML gives meaning to is written as. */
const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** `text` with the characters HTML gives meaning to replaced by their character references. */
function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
}

/** The part of a newly opened browsing context {@link followLink} drives. */
export interface OpenedTab {
  opener: unknown;
  location: { href: string };
}

/**
 * Opens a new browsing context the way `window.open(url, target)` does,
 * returning `null` when the browser refuses to open one.
 */
export type OpenTab = (url: string, target: string) => OpenedTab | null;

/** The part of a strip link {@link followLink} reads and replaces. */
export type FollowedLink = Pick<HTMLAnchorElement, "href" | "outerHTML"> & { readonly dataset: { link?: string } };

/**
 * Follow `link` in a new tab opened through `open`, cutting the tab's
 * `opener` before it navigates to the link's URL. When the browser refuses
 * the tab, as a sandboxed frame without popup permission does, replaces the
 * link in place with its URL as selectable text: a span carrying
 * `data-testid="link-url"` and the link's `data-link`. Returns whether a
 * tab was opened.
 */
export function followLink(link: FollowedLink, open: OpenTab): boolean {
  const url = link.href;
  const tab = open("", "_blank");
  if (tab === null) {
    link.outerHTML = `<span class="link-url" data-testid="link-url" data-link="${escapeHtml(link.dataset.link ?? "")}">${escapeHtml(url)}</span>`;
    return false;
  }
  tab.opener = null;
  tab.location.href = url;
  return true;
}

/**
 * Follow `link`, a link of the strip rendered into `root`, through
 * {@link followLink}; when the frame may not open it, selects the URL that
 * replaced it, for the person to copy.
 */
function followInStrip(root: HTMLElement, link: HTMLAnchorElement): void {
  const open: OpenTab = (url, target) => root.ownerDocument.defaultView?.open(url, target) ?? null;
  if (followLink(link, open)) return;
  const revealed = root.querySelector<HTMLElement>(`[data-testid="link-url"][data-link="${link.dataset.link}"]`);
  if (revealed !== null) root.ownerDocument.getSelection()?.selectAllChildren(revealed);
}

/**
 * The markup of the brand strip a simulator extension frame shows: a
 * section carrying `data-testid="simx-strip"` whose one row holds the
 * logotype, linking to the Wendoo homepage and carrying `data-link="home"`,
 * and the button carrying `data-action="open-editor"`.
 */
export function renderBrandStrip(): string {
  return (
    '<section class="panel" data-testid="simx-strip">' +
    `<header class="head"><a class="mark" href="${HOMEPAGE_URL}" target="_blank" rel="noopener noreferrer"` +
    ` aria-label="Wendoo homepage" data-link="home">${LOGOTYPE}</a>` +
    '<button type="button" class="open-editor" aria-label="Open the Wendoo editor" data-action="open-editor">' +
    "Open editor</button></header></section>"
  );
}

/**
 * Render the brand strip into `root` and route its controls: the button
 * calls `openEditor`, and the logotype link follows through
 * {@link followLink}, replaced by its URL, then selected, when the frame may
 * not open it. Returns a function that stops routing.
 */
export function mountBrandStrip(root: HTMLElement, openEditor: () => void): () => void {
  const click = (event: MouseEvent): void => {
    const link = (event.target as Element | null)?.closest<HTMLAnchorElement>("a[data-link]");
    if (link) {
      event.preventDefault();
      followInStrip(root, link);
      return;
    }
    const control = (event.target as Element | null)?.closest<HTMLElement>("[data-action]");
    if (control?.dataset.action === "open-editor") openEditor();
  };
  root.addEventListener("click", click);
  root.innerHTML = renderBrandStrip();
  return () => {
    root.removeEventListener("click", click);
  };
}
