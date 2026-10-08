import { DEFAULT_MAKECODE_BRIDGE_URL } from "@wendoo/makecode-session";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { BrainsProvider } from "./contexts/brains";
import { EditorSessionProvider } from "./contexts/editor-session";
import { DocsPage } from "./DocsPage";
import {
  clearBindingToken,
  hasBindingToken,
  loadBindingToken,
  saveBindingToken,
} from "./services/binding-token-persistence";
import { BrainsStore } from "./services/brains-store";
import { EditorSessionStore } from "./services/editor-session-store";
import { enterSession } from "./services/fragment-entry";
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
 * Opens the page's session and renders the editor over it into `mount`:
 * the session store, the brains store over it, the target theme bound to the
 * document, and the session stopped as the page is hidden for good.
 */
function mountEditor(mount: HTMLElement): void {
  const store = new EditorSessionStore({
    bridgeUrl: bridgeUrlFor(window.location.hostname),
    persistence: {
      load: loadBindingToken,
      save: saveBindingToken,
      clear: clearBindingToken,
      has: hasBindingToken,
    },
  });
  const brains = new BrainsStore(store, store);
  bindTargetTheme(store, document.documentElement);
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
        <BrainsProvider value={brains}>
          <App />
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
  mountEditor(root);
}
