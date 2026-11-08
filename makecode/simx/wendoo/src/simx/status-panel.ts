import type { SimxEditorTab } from "../vendor/simxeditor.js";

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
 * The markup of the open-editor control for `tabs`, the tabs MakeCode lists
 * for this frame: nothing for no tab; for one tab, a button carrying
 * `data-action="open-editor"` and the tab's key as `data-key`, captioned by
 * the tab's label; for several, a select carrying
 * `data-action="open-editor"` whose first option, valued `""`, is selected
 * and disabled, followed by one option per tab, in the order given, valued
 * by the tab's key and captioned by its label.
 */
function renderOpenEditor(tabs: readonly SimxEditorTab[]): string {
  if (tabs.length === 0) return "";
  if (tabs.length === 1) {
    const label = escapeHtml(tabs[0].label);
    return (
      `<button type="button" class="open-editor" aria-label="Open the ${label} editor" data-action="open-editor"` +
      ` data-key="${escapeHtml(tabs[0].key)}">Open ${label}</button>`
    );
  }
  const options = tabs.map((tab) => `<option value="${escapeHtml(tab.key)}">${escapeHtml(tab.label)}</option>`);
  return (
    '<select class="open-editor" aria-label="Open an editor" data-action="open-editor">' +
    `<option value="" selected disabled>Open editor...</option>${options.join("")}</select>`
  );
}

/**
 * The markup of the brand strip a simulator extension frame shows: a
 * section carrying `data-testid="simx-strip"` whose one row holds the
 * logotype, linking to the Wendoo homepage and carrying `data-link="home"`,
 * then the open-editor control for `tabs`, the tabs MakeCode lists for this
 * frame: none for no tab, a button opening the one tab, or a select
 * offering each of several.
 */
export function renderBrandStrip(tabs: readonly SimxEditorTab[]): string {
  return (
    '<section class="panel" data-testid="simx-strip">' +
    `<header class="head"><a class="mark" href="${HOMEPAGE_URL}" target="_blank" rel="noopener noreferrer"` +
    ` aria-label="Wendoo homepage" data-link="home">${LOGOTYPE}</a>` +
    `${renderOpenEditor(tabs)}</header></section>`
  );
}

/** A brand strip {@link mountBrandStrip} rendered into its root. */
export interface MountedBrandStrip {
  /** Replace the strip's open-editor control with the one for `tabs`, keeping the logotype as it is. */
  setTabs(tabs: readonly SimxEditorTab[]): void;
  /** Stop routing the strip's controls. */
  unmount(): void;
}

/**
 * Render the brand strip into `root`, with no open-editor control until
 * {@link MountedBrandStrip.setTabs} gives it tabs, and route its controls: a
 * click on the button calls `open` with the key it carries, a choice of a tab
 * in the select calls `open` with that tab's key and returns the select to
 * its first option, and the logotype link follows through
 * {@link followLink}, replaced by its URL, then selected, when the frame may
 * not open it. Returns the mounted strip.
 */
export function mountBrandStrip(root: HTMLElement, open: (key: string) => void): MountedBrandStrip {
  const click = (event: MouseEvent): void => {
    const link = (event.target as Element | null)?.closest<HTMLAnchorElement>("a[data-link]");
    if (link) {
      event.preventDefault();
      followInStrip(root, link);
      return;
    }
    const control = (event.target as Element | null)?.closest<HTMLElement>("[data-action]");
    const key = control?.dataset.key;
    if (control?.dataset.action === "open-editor" && key !== undefined) open(key);
  };
  const change = (event: Event): void => {
    const select = event.target as HTMLSelectElement | null;
    if (select?.dataset.action !== "open-editor" || select.value === "") return;
    const key = select.value;
    select.value = "";
    open(key);
  };
  root.addEventListener("click", click);
  root.addEventListener("change", change);
  root.innerHTML = renderBrandStrip([]);
  return {
    setTabs(tabs) {
      root.querySelector('[data-action="open-editor"]')?.remove();
      root.querySelector(".head")?.insertAdjacentHTML("beforeend", renderOpenEditor(tabs));
    },
    unmount() {
      root.removeEventListener("click", click);
      root.removeEventListener("change", change);
    },
  };
}
