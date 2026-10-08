import { DEFAULT_MAKECODE_BRIDGE_URL } from "@wendoo/makecode-session";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { BrainsProvider } from "./contexts/brains";
import { EditorSessionProvider } from "./contexts/editor-session";
import { RecentBindingsProvider } from "./contexts/recent-bindings";
import { DocsPage } from "./DocsPage";
import { bindingClaimsFor } from "./services/binding-claims";
import { deferredStorage, openTabBinding, type TabBinding } from "./services/binding-entries";
import { BrainsStore } from "./services/brains-store";
import { bindDocumentTitle } from "./services/document-title";
import { EditorSessionStore } from "./services/editor-session-store";
import { enterSession } from "./services/fragment-entry";
import { RecentBindings } from "./services/recent-bindings";
import { bindTargetTheme } from "./services/target-theme";
import "./globals.css";

// Backstop for otherwise-silent floated promise rejections.
window.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled promise rejection", event.reason);
});

/**
 * The bridge service this page connects to: the local relay's dev address
 * when the page itself is served from a loopback host, the deployed service
 * otherwise.
 */
function bridgeUrlFor(hostname: string): string {
  const loopback = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  return loopback ? "localhost:6465" : DEFAULT_MAKECODE_BRIDGE_URL;
}

/**
 * Opens the page's session over `binding`, the binding this tab holds, and
 * renders the editor over it into `mount`: the session store, the recent
 * projects the connect page lists, the brains store over the session store,
 * the target theme bound to the document, and the session stopped as the
 * page is hidden for good.
 */
function mountEditor(mount: HTMLElement, binding: TabBinding): void {
  const store = new EditorSessionStore({
    bridgeUrl: bridgeUrlFor(window.location.hostname),
    persistence: binding,
  });
  binding.track(store);
  const recent = new RecentBindings(binding, store);
  recent.followStorage(window);
  const brains = new BrainsStore(store, store);
  bindTargetTheme(store, document.documentElement);
  bindDocumentTitle(store, document);
  enterSession(store, window);
  window.addEventListener(
    "pagehide",
    () => {
      store.stop();
    },
    { once: true }
  );

  createRoot(mount).render(
    <StrictMode>
      <EditorSessionProvider value={store}>
        <RecentBindingsProvider value={recent}>
          <BrainsProvider value={brains}>
            <App />
          </BrainsProvider>
        </RecentBindingsProvider>
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
  void openTabBinding({
    local: deferredStorage(() => localStorage),
    session: deferredStorage(() => sessionStorage),
    claims: bindingClaimsFor("locks" in navigator ? navigator.locks : undefined),
  }).then((binding) => {
    mountEditor(root, binding);
  });
}
