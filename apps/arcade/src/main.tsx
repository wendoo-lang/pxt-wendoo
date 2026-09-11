import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ArcadeSessionProvider } from "./contexts/arcade-session";
import { ArcadeSession } from "./services/arcade-session";
import "./globals.css";

// Backstop for otherwise-silent floated promise rejections.
window.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled promise rejection", event.reason);
});

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element not found");
}

const session = new ArcadeSession();
session.connect();
window.addEventListener("pagehide", () => session.disconnect(), { once: true });

createRoot(root).render(
  <StrictMode>
    <ArcadeSessionProvider value={session}>
      <App />
    </ArcadeSessionProvider>
  </StrictMode>
);
