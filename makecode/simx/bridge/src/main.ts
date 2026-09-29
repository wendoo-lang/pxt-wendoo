import "./status-panel.css";
import { openBindingTokenStore } from "./binding-token-store.js";
import { bridgeUrlFor, editorUrlFor } from "./service-urls.js";
import { startSimxBridge } from "./simx-bridge.js";
import { SimxStatusModel } from "./status-model.js";
import { mountStatusPanel } from "./status-panel.js";

// Binding token store scoped to this browser tab.
const tokens = openBindingTokenStore(() => window.sessionStorage);
if (!tokens.persistent) {
  console.warn("Wendoo bridge: session storage is unavailable; each reload of this frame starts a new pairing.");
}
const bridge = startSimxBridge({
  frame: window,
  bridgeUrl: bridgeUrlFor(window.location.hostname),
  tokens,
  log: console,
  // The id of the MakeCode target hosting this frame, which MakeCode passes in the frame URL.
  target: new URLSearchParams(window.location.search).get("target") || undefined,
});
const status = new SimxStatusModel(bridge);
const unmount = mountStatusPanel(
  document.body.appendChild(document.createElement("main")),
  status,
  navigator.clipboard,
  editorUrlFor(window.location.hostname)
);
window.addEventListener(
  "pagehide",
  () => {
    unmount();
    status.dispose();
    bridge.dispose();
  },
  { once: true }
);
