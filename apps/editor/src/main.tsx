import { DEFAULT_MAKECODE_BRIDGE_URL } from "@wendoo/makecode-session";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { EditorSessionProvider } from "./contexts/editor-session";
import {
  clearBindingToken,
  hasBindingToken,
  loadBindingToken,
  saveBindingToken,
} from "./services/binding-token-persistence";
import { EditorSessionStore } from "./services/editor-session-store";
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

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element not found");
}

const store = new EditorSessionStore({
  bridgeUrl: bridgeUrlFor(window.location.hostname),
  persistence: {
    load: loadBindingToken,
    save: saveBindingToken,
    clear: clearBindingToken,
    has: hasBindingToken,
  },
});
store.resume();
window.addEventListener(
  "pagehide",
  () => {
    store.stop();
  },
  { once: true }
);

createRoot(root).render(
  <StrictMode>
    <EditorSessionProvider value={store}>
      <App />
    </EditorSessionProvider>
  </StrictMode>
);
