import { logger } from "@wendoo/core/app";
import { createMakeCodePortEditorSession, messagePortSessionPort } from "@wendoo/makecode-session";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { OpenEditings } from "./brain/editing";
import { BrainsProvider } from "./contexts/brains";
import { EditorSessionProvider } from "./contexts/editor-session";
import { OpenEditingsProvider } from "./contexts/open-editings";
import { DocsPage } from "./DocsPage";
import { BrainsStore } from "./services/brains-store";
import { bindDocumentTitle } from "./services/document-title";
import { EditorSessionStore } from "./services/editor-session-store";
import { connectSimxEditorClient, readParentOrigin, TAB_PARENT_ORIGIN_INVALID } from "./services/simx-editor-client";
import { readTabProject, tabBinding } from "./services/tab-binding";
import { bindTargetTheme } from "./services/target-theme";
import "./globals.css";

// Backstop for otherwise-silent floated promise rejections.
window.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled promise rejection", event.reason);
});

/**
 * Renders the editor tab into `mount` over a session with the MakeCode
 * project carried by the ports MakeCode brokers: the session store over a
 * port-backed session bound to the project the frame URL names, the brains
 * store over it, the target theme and the document title bound to it. Once
 * listening, tells MakeCode the tab is ready; every port MakeCode brokers
 * from `parentOrigin` replaces the session's port. MakeCode closing the tab,
 * and the page being hidden for good, flush every open brain editor's
 * unflushed edit; the page being hidden for good also stops the session.
 * With no valid `parentOrigin`, logs {@link TAB_PARENT_ORIGIN_INVALID} and
 * hears nothing from MakeCode.
 */
function mountEditorTab(mount: HTMLElement, parentOrigin: string | undefined): void {
  const session = createMakeCodePortEditorSession();
  const store = new EditorSessionStore({
    persistence: tabBinding(readTabProject(window.location.search)),
    createSession: () => session,
  });
  const brains = new BrainsStore(store, store);
  const editings = new OpenEditings();
  bindTargetTheme(store, document.documentElement);
  bindDocumentTitle(store, document);
  store.resume();

  if (parentOrigin === undefined) {
    logger.error(TAB_PARENT_ORIGIN_INVALID, { search: window.location.search });
  } else {
    const client = connectSimxEditorClient(window, parentOrigin);
    client.onPort((port) => {
      session.attachPort(messagePortSessionPort(port));
    });
    client.onEvent((event) => {
      if (event.event === "closing") editings.flushAll();
    });
    client.ready();
  }
  window.addEventListener(
    "pagehide",
    () => {
      editings.flushAll();
      store.stop();
    },
    { once: true }
  );

  createRoot(mount).render(
    <StrictMode>
      <EditorSessionProvider value={store}>
        <BrainsProvider value={brains}>
          <OpenEditingsProvider value={editings}>
            <App />
          </OpenEditingsProvider>
        </BrainsProvider>
      </EditorSessionProvider>
    </StrictMode>
  );
}

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element not found");
}

if (window.location.pathname.startsWith("/docs")) {
  createRoot(root).render(
    <StrictMode>
      <DocsPage />
    </StrictMode>
  );
} else {
  mountEditorTab(root, readParentOrigin(window.location.search));
}
