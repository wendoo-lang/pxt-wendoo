import type { SimxStatusModel, SimxStatusState, SimxStatusView } from "./status-model.js";

/** How long the copy control shows that the join code was copied, in milliseconds. */
const COPY_CONFIRM_MS = 1500;

/** The header's status word for each view whose status the header shows. */
const STATUS_WORDS: Record<Exclude<SimxStatusState, "confirm">, string> = {
  connecting: "connecting",
  code: "waiting for editor",
  connected: "connected",
  away: "reconnecting",
  ended: "ended",
  replaced: "in another tab",
  update: "update needed",
};

const COPY_ICON =
  '<svg class="icon-copy" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15V5a2 2 0 0 1 2-2h10"></path></svg>';

/**
 * The tile-native "wendoo" logotype as inline SVG, 78 x 19 units, drawn in
 * `currentColor`. The geometry is the editor's `WendooLogotype`
 * (`src/editor/components/WendooLogo.tsx`); keep the two in step.
 */
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

const CHECK_ICON =
  '<svg class="icon-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"></path></svg>';

/** The character reference each character HTML gives meaning to is written as. */
const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** `text` with the characters HTML gives meaning to replaced by their character references. */
function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
}

/** The body of the panel for `view`, linking to the editor at `editorUrl`. */
function renderBody(view: SimxStatusView, editorUrl: string): string {
  switch (view.state) {
    case "connecting":
      return `<div class="body"><span class="title">Connecting to Wendoo...</span><span class="note">${
        view.retrying ? "Can't reach Wendoo -- retrying..." : "Starting the session"
      }</span></div>`;
    case "code":
      return (
        '<div class="code-body"><span class="label">JOIN CODE</span><div class="code-row">' +
        `<span class="code" data-testid="join-code">${escapeHtml(view.joinCode ?? "")}</span>` +
        `<button type="button" class="copy" aria-label="Copy join code" data-action="copy">${COPY_ICON}${CHECK_ICON}</button>` +
        '</div><span class="note">Type this code in the Wendoo editor to connect, ' +
        `<a class="editor-link" href="${escapeHtml(`${editorUrl}/#code=${encodeURIComponent(view.joinCode ?? "")}`)}"` +
        ' target="_blank" rel="noopener noreferrer" data-link="editor">or open the editor</a></span></div>'
      );
    case "connected":
      return (
        '<div class="body"><span class="title title-connected">Connected to the Wendoo editor</span>' +
        '<span class="note">Brains you save show up in this game</span>' +
        '<button type="button" class="end" aria-label="End session" data-action="end">End session</button></div>'
      );
    case "away":
      return (
        '<div class="body"><span class="title title-away">Editor connection dropped</span>' +
        '<span class="note">Waiting for it to come back -- or end the session to get a new join code</span>' +
        '<button type="button" class="end" aria-label="End session" data-action="end">End session</button></div>'
      );
    case "confirm":
      return (
        '<div class="body body-confirm"><span class="question">End this session and disconnect the editor?</span>' +
        '<div class="choices"><button type="button" class="confirm-end" aria-label="Confirm end session" data-action="confirm-end">End session</button>' +
        '<button type="button" class="cancel" aria-label="Cancel" data-action="cancel-end">Cancel</button></div></div>'
      );
    case "ended":
      return (
        '<div class="body"><span class="title">Session ended</span>' +
        '<button type="button" class="start-new" aria-label="Start a new session" data-action="start-new">Start a new session</button></div>'
      );
    case "replaced":
      return (
        '<div class="body"><span class="title">Wendoo moved to another tab</span>' +
        '<span class="note">This game is connected in another tab now. Reload this page to connect here instead</span></div>'
      );
    case "update":
      return (
        '<div class="body"><span class="title title-update">Can\'t connect</span>' +
        '<span class="note">Reload the page to get the latest Wendoo update</span></div>'
      );
  }
}

/**
 * The markup of the status panel for `view`: a section carrying the view's
 * state as `data-state` (and `data-retrying="true"` while a connecting view
 * is retrying), a header whose status carries `data-tone` -- the state, or
 * for `confirm` the view the confirmation is shown over -- and the state's
 * body. Every control is a button carrying its action as `data-action`:
 * `copy`, `end`, `confirm-end`, `cancel-end`, or `start-new`. Every link
 * opens in a new tab and carries its kind as `data-link`: `home`, the
 * header's logotype linking to the Wendoo homepage, and, while the view
 * shows a join code, `editor`, linking to `editorUrl` -- the editor's
 * origin -- with the code in the fragment as `#code=<code>`.
 */
export function renderStatusPanel(view: SimxStatusView, editorUrl: string): string {
  const tone = view.state === "confirm" ? (view.endFrom ?? "connected") : view.state;
  const retrying = view.state === "connecting" && view.retrying ? ' data-retrying="true"' : "";
  return (
    `<section class="panel" data-testid="simx-status" data-state="${view.state}"${retrying}>` +
    `<header class="head"><a class="mark" href="${HOMEPAGE_URL}" target="_blank" rel="noopener noreferrer"` +
    ` aria-label="Wendoo homepage" data-link="home">${LOGOTYPE}</a><span class="status" data-tone="${tone}">` +
    `<span class="dot"></span><span class="word">${STATUS_WORDS[tone]}</span></span></header>` +
    `${renderBody(view, editorUrl)}</section>`
  );
}

/**
 * Write `text` to `clipboard`. Resolves `true` once it is written, and
 * `false` when there is no clipboard or it refuses the write, as a
 * cross-origin frame without clipboard access does. Never rejects.
 */
export async function copyText(text: string, clipboard: Pick<Clipboard, "writeText"> | undefined): Promise<boolean> {
  if (clipboard === undefined) return false;
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
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

/** The part of a panel link {@link followLink} reads and replaces. */
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
 * Follow `link`, a link of the panel rendered into `root`, through
 * {@link followLink}; when the frame may not open it, selects the URL that
 * replaced it, for the person to copy.
 */
function followInPanel(root: HTMLElement, link: HTMLAnchorElement): void {
  const open: OpenTab = (url, target) => root.ownerDocument.defaultView?.open(url, target) ?? null;
  if (followLink(link, open)) return;
  const revealed = root.querySelector<HTMLElement>(`[data-testid="link-url"][data-link="${link.dataset.link}"]`);
  if (revealed !== null) root.ownerDocument.getSelection()?.selectAllChildren(revealed);
}

/**
 * Render `model` into `root`, again at each change of its view, and route
 * the panel's controls to the model's actions. The copy control writes the
 * join code to `clipboard` and briefly shows it was copied; when nothing
 * was copied it selects the code's text instead, for the person to copy.
 * The editor link points at `editorUrl`, the editor's origin. Links follow
 * through {@link followLink}; a link the frame may not open is replaced by
 * its URL, which is then selected for the person to copy. Returns a
 * function that stops rendering and routing.
 */
export function mountStatusPanel(
  root: HTMLElement,
  model: SimxStatusModel,
  clipboard: Pick<Clipboard, "writeText"> | undefined,
  editorUrl: string
): () => void {
  let copyTimer: ReturnType<typeof setTimeout> | undefined;
  const render = (): void => {
    clearTimeout(copyTimer);
    root.innerHTML = renderStatusPanel(model.getSnapshot(), editorUrl);
  };
  const copy = async (button: HTMLElement): Promise<void> => {
    const code = root.querySelector<HTMLElement>('[data-testid="join-code"]');
    if (code === null) return;
    if (await copyText(code.textContent ?? "", clipboard)) {
      button.dataset.copied = "true";
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => {
        delete button.dataset.copied;
      }, COPY_CONFIRM_MS);
      return;
    }
    root.ownerDocument.getSelection()?.selectAllChildren(code);
  };
  const click = (event: MouseEvent): void => {
    const link = (event.target as Element | null)?.closest<HTMLAnchorElement>("a[data-link]");
    if (link) {
      event.preventDefault();
      followInPanel(root, link);
      return;
    }
    const control = (event.target as Element | null)?.closest<HTMLElement>("[data-action]");
    switch (control?.dataset.action) {
      case "copy":
        void copy(control);
        return;
      case "end":
        model.requestEnd();
        return;
      case "confirm-end":
        model.confirmEnd();
        return;
      case "cancel-end":
        model.cancelEnd();
        return;
      case "start-new":
        model.startNewSession();
        return;
    }
  };
  root.addEventListener("click", click);
  const unsubscribe = model.subscribe(render);
  render();
  return () => {
    unsubscribe();
    clearTimeout(copyTimer);
    root.removeEventListener("click", click);
  };
}

/**
 * The markup of the brand strip a simulator extension frame shows while
 * MakeCode offers its editor tab: a section carrying
 * `data-testid="simx-strip"` whose one row holds the logotype, linking to
 * the Wendoo homepage and carrying `data-link="home"`, and the button
 * carrying `data-action="open-editor"`.
 */
export function renderBrandStrip(): string {
  return (
    '<section class="panel strip" data-testid="simx-strip">' +
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
      followInPanel(root, link);
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
