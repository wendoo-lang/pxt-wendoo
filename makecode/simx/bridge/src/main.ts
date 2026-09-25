import { DEFAULT_MAKECODE_BRIDGE_URL, startSimxBridge } from "./simx-bridge.js";

const bridge = startSimxBridge({ frame: window, bridgeUrl: DEFAULT_MAKECODE_BRIDGE_URL });
window.addEventListener(
  "pagehide",
  () => {
    bridge.dispose();
  },
  { once: true }
);
