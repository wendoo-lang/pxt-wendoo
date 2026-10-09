import type { BindingTokenPersistence } from "./editor-session-store";

/**
 * Returns the project MakeCode opened the editor tab frame for, as the frame
 * URL's `project` parameter names it, or `undefined` when it names none.
 *
 * @param search - The frame URL's query string.
 */
export function readTabProject(search: string): string | undefined {
  return new URLSearchParams(search).get("project") || undefined;
}

/**
 * The binding of an editor tab frame, as the session store's token
 * persistence: one binding for the life of the frame, named by `project`,
 * the project MakeCode opened the frame for, and written nowhere. It always
 * reports a binding held, so the store's `resume()` opens the session, and
 * every brains channel carries `project` as its binding. Saving and clearing
 * change nothing.
 *
 * @param project - The project the frame was opened for; `undefined` names the frame's one binding all the same.
 */
export function tabBinding(project: string | undefined): BindingTokenPersistence {
  return {
    load: () => project,
    save() {},
    clear() {},
    has: () => true,
  };
}
