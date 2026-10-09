import "./status-panel.css";
import { ProjassetsClient } from "../vendor/projassets.js";
import { getProjectId, getSimxChannel, getTargetId, ProjfsClient } from "../vendor/projfs.js";
import { hasEditorTab } from "../vendor/simxeditor.js";
import { openBindingTokenStore } from "./binding-token-store.js";
import { connectEditorTabOpener } from "./editor-tab.js";
import { bridgeUrlFor, editorUrlFor } from "./service-urls.js";
import { startSimxBridge, startSimxPortBridge } from "./simx-bridge.js";
import { SimxStatusModel } from "./status-model.js";
import { mountBrandStrip, mountStatusPanel } from "./status-panel.js";

// Project-file client for this frame; warns on the console about each request still unanswered after the slow-reply threshold.
const files = new ProjfsClient({
  onSlowReply: (request) => {
    const name = "name" in request ? ` ${request.name}` : "";
    console.warn(`Wendoo bridge: still waiting for MakeCode to answer the ${request.subtype}${name} request.`);
  },
});
// Project-asset client for this frame; warns on the console about each request still unanswered after the slow-reply threshold.
const assets = new ProjassetsClient({
  onSlowReply: (request) => {
    console.warn(`Wendoo bridge: still waiting for MakeCode to answer the ${request.subtype} assets request.`);
  },
});
// The channel and the MakeCode target of this frame, which MakeCode passes in the frame URL.
const channel = getSimxChannel();
const target = getTargetId();
const root = document.body.appendChild(document.createElement("main"));

/** Stops what the frame started, as the frame is hidden for good. */
let stop: () => void;
if (hasEditorTab()) {
  // MakeCode offers the editor tab, and names its own origin in the frame URL's `parentOrigin` parameter.
  const parentOrigin = new URLSearchParams(window.location.search).get("parentOrigin") ?? "";
  const bridge = startSimxPortBridge({ frame: window, parentOrigin, files, assets, log: console, channel, target });
  const opener = connectEditorTabOpener(window, parentOrigin, console);
  const unmount = mountBrandStrip(root, () => {
    void opener.open();
  });
  stop = () => {
    unmount();
    opener.dispose();
    bridge.dispose();
  };
} else {
  // Binding token store kept in the browser's local storage, shared by every tab of this origin, scoped to the project MakeCode passes in the frame URL.
  const tokens = openBindingTokenStore(() => window.localStorage, getProjectId());
  if (!tokens.persistent) {
    console.warn("Wendoo bridge: local storage is unavailable; each reload of this frame starts a new pairing.");
  }
  const bridge = startSimxBridge({
    frame: window,
    bridgeUrl: bridgeUrlFor(window.location.hostname),
    tokens,
    files,
    assets,
    log: console,
    channel,
    target,
  });
  const status = new SimxStatusModel(bridge);
  const unmount = mountStatusPanel(root, status, navigator.clipboard, editorUrlFor(window.location.hostname));
  stop = () => {
    unmount();
    status.dispose();
    bridge.dispose();
  };
}
window.addEventListener(
  "pagehide",
  () => {
    stop();
    files.dispose();
    assets.dispose();
  },
  { once: true }
);
