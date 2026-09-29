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
  update: "update needed",
};

const COPY_ICON =
  '<svg class="icon-copy" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15V5a2 2 0 0 1 2-2h10"></path></svg>';

const CHECK_ICON =
  '<svg class="icon-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"></path></svg>';

/** The character reference each character HTML gives meaning to is written as. */
const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** `text` with the characters HTML gives meaning to replaced by their character references. */
function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
}

/** The body of the panel for `view`. */
function renderBody(view: SimxStatusView): string {
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
        '</div><span class="note">Type this code in the Wendoo editor to connect</span></div>'
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
 * `copy`, `end`, `confirm-end`, `cancel-end`, or `start-new`.
 */
export function renderStatusPanel(view: SimxStatusView): string {
  const tone = view.state === "confirm" ? (view.endFrom ?? "connected") : view.state;
  const retrying = view.state === "connecting" && view.retrying ? ' data-retrying="true"' : "";
  return (
    `<section class="panel" data-testid="simx-status" data-state="${view.state}"${retrying}>` +
    `<header class="head"><span class="mark">Wendoo</span><span class="status" data-tone="${tone}">` +
    `<span class="dot"></span><span class="word">${STATUS_WORDS[tone]}</span></span></header>` +
    `${renderBody(view)}</section>`
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

/**
 * Render `model` into `root`, again at each change of its view, and route
 * the panel's controls to the model's actions. The copy control writes the
 * join code to `clipboard` and briefly shows it was copied; when nothing
 * was copied it selects the code's text instead, for the person to copy.
 * Returns a function that stops rendering and routing.
 */
export function mountStatusPanel(
  root: HTMLElement,
  model: SimxStatusModel,
  clipboard: Pick<Clipboard, "writeText"> | undefined
): () => void {
  let copyTimer: ReturnType<typeof setTimeout> | undefined;
  const render = (): void => {
    clearTimeout(copyTimer);
    root.innerHTML = renderStatusPanel(model.getSnapshot());
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
