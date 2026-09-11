import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { MakeCodeSessionProvider } from "./contexts/makecode-session";
import { MakeCodeSession } from "./services/makecode-session";
import "./globals.css";

// Backstop for otherwise-silent floated promise rejections.
window.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled promise rejection", event.reason);
});

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element not found");
}

const session = new MakeCodeSession();
session.connect();
window.addEventListener("pagehide", () => session.disconnect(), { once: true });

createRoot(root).render(
  <StrictMode>
    <MakeCodeSessionProvider value={session}>
      <App />
    </MakeCodeSessionProvider>
  </StrictMode>
);
