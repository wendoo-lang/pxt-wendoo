import { DEFAULT_MAKECODE_BRIDGE_URL } from "@wendoo/makecode-session";
import { openBindingTokenStore } from "./binding-token-store.js";
import { startSimxBridge } from "./simx-bridge.js";

// Binding token store scoped to this browser tab.
const tokens = openBindingTokenStore(() => window.sessionStorage);
if (!tokens.persistent) {
  console.warn("Wendoo bridge: session storage is unavailable; each reload of this frame starts a new pairing.");
}
const bridge = startSimxBridge({ frame: window, bridgeUrl: DEFAULT_MAKECODE_BRIDGE_URL, tokens, log: console });
window.addEventListener(
  "pagehide",
  () => {
    bridge.dispose();
  },
  { once: true }
);
