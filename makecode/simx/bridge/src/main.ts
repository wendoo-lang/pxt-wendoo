import "./status-panel.css";
import { openBindingTokenStore } from "./binding-token-store.js";
import { bridgeUrlFor, editorUrlFor } from "./service-urls.js";
import { startSimxBridge } from "./simx-bridge.js";
import { SimxStatusModel } from "./status-model.js";
import { mountStatusPanel } from "./status-panel.js";
import { getProjectId, getSimxChannel, getTargetId, ProjfsClient } from "./vendor/projfs.js";

// Binding token store scoped to this browser tab and to the project MakeCode passes in the frame URL.
const tokens = openBindingTokenStore(() => window.sessionStorage, getProjectId());
if (!tokens.persistent) {
  console.warn("Wendoo bridge: session storage is unavailable; each reload of this frame starts a new pairing.");
}
const files = new ProjfsClient();
const bridge = startSimxBridge({
  frame: window,
  bridgeUrl: bridgeUrlFor(window.location.hostname),
  tokens,
  files,
  log: console,
  // The channel and the MakeCode target of this frame, which MakeCode passes in the frame URL.
  channel: getSimxChannel(),
  target: getTargetId(),
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
    files.dispose();
  },
  { once: true }
);
