import { DEFAULT_MAKECODE_BRIDGE_URL } from "@wendoo/makecode-session";

/** The host the Wendoo editor is deployed at. */
const EDITOR_HOST = "makecode.playwendoo.com";

/** Whether `hostname`, as `Location.hostname` reports it, names this machine. */
function isLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/**
 * The bridge service a frame served from `hostname` connects to, as a bare
 * host with an optional port: the local relay's dev address on a loopback
 * host, the deployed service otherwise.
 */
export function bridgeUrlFor(hostname: string): string {
  return isLoopback(hostname) ? "localhost:6465" : DEFAULT_MAKECODE_BRIDGE_URL;
}

/**
 * The Wendoo editor a frame served from `hostname` links to, as an origin
 * with no trailing slash: the dev editor at `http://localhost:5176` on a
 * loopback host, the deployed editor over https otherwise.
 */
export function editorUrlFor(hostname: string): string {
  return isLoopback(hostname) ? "http://localhost:5176" : `https://${EDITOR_HOST}`;
}
