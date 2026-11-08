import "./status-panel.css";
import { ProjassetsClient } from "../vendor/projassets.js";
import { getParentOrigin, getSimxChannel, getTargetId, ProjfsClient } from "../vendor/projfs.js";
import { getSimxApiLevel } from "../vendor/simxeditor.js";
import { connectEditorTabOpener } from "./editor-tab.js";
import { startSimxPortBridge } from "./simx-bridge.js";
import { mountBrandStrip } from "./status-panel.js";

// Project-file client for this frame; warns on the console about each request still unanswered after the slow-reply threshold.
const files = new ProjfsClient({
  onSlowReply: (request) => {
    const name = "name" in request ? ` ${request.name}` : "";
    console.warn(
      `Wendoo simulator extension: still waiting for MakeCode to answer the ${request.subtype}${name} request.`
    );
  },
});
// Project-asset client for this frame; warns on the console about each request still unanswered after the slow-reply threshold.
const assets = new ProjassetsClient({
  onSlowReply: (request) => {
    console.warn(
      `Wendoo simulator extension: still waiting for MakeCode to answer the ${request.subtype} assets request.`
    );
  },
});
// The channel and the MakeCode target of this frame, which MakeCode passes in the frame URL.
const channel = getSimxChannel();
const target = getTargetId();
// MakeCode names its own origin in the frame URL's `parentOrigin` parameter.
const parentOrigin = getParentOrigin() ?? "";
const root = document.body.appendChild(document.createElement("main"));

const bridge = startSimxPortBridge({ frame: window, parentOrigin, files, assets, log: console, channel, target });
const opener = connectEditorTabOpener(window, parentOrigin, console);
// The keys of the editor tabs MakeCode lists for this frame, asked for once at startup: an empty list on a refusal and
// on an editor below API level 2. The button opens the first key, or the frame's own tab when there is none.
const tabKeys: Promise<readonly string[]> = getSimxApiLevel() >= 2 ? opener.tabs() : Promise.resolve([]);
const unmount = mountBrandStrip(root, () => {
  void tabKeys.then((keys) => opener.open(keys[0]));
});
window.addEventListener(
  "pagehide",
  () => {
    unmount();
    opener.dispose();
    bridge.dispose();
    files.dispose();
    assets.dispose();
  },
  { once: true }
);
