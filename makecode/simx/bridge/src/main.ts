import { DEFAULT_MAKECODE_BRIDGE_URL } from "@wendoo/makecode-session";
import { openBindingTokenStore } from "./binding-token-store.js";
import { startSimxBridge } from "./simx-bridge.js";

/**
 * The bridge service this frame connects to: the local relay's dev address
 * when the frame itself is served from a loopback host, the deployed service
 * otherwise.
 */
function bridgeUrlFor(hostname: string): string {
  const loopback = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  return loopback ? "localhost:6465" : DEFAULT_MAKECODE_BRIDGE_URL;
}

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
window.addEventListener(
  "pagehide",
  () => {
    bridge.dispose();
  },
  { once: true }
);
