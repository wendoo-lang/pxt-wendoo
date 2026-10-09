import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_MAKECODE_BRIDGE_URL } from "@wendoo/makecode-session";
import { bridgeUrlFor, editorUrlFor } from "./service-urls.js";

const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

const DEPLOYED_HOSTS = ["arcade.makecode.com", "makecode.microbit.org", "localhost.example.com"];

describe("service urls", () => {
  it("connects a frame on a loopback host to the local relay, and any other frame to the deployed service", () => {
    for (const hostname of LOOPBACK_HOSTS) assert.equal(bridgeUrlFor(hostname), "localhost:6465");
    for (const hostname of DEPLOYED_HOSTS) assert.equal(bridgeUrlFor(hostname), DEFAULT_MAKECODE_BRIDGE_URL);
  });

  it("links a frame on a loopback host to the dev editor, and any other frame to the deployed editor", () => {
    for (const hostname of LOOPBACK_HOSTS) assert.equal(editorUrlFor(hostname), "http://localhost:5175");
    for (const hostname of DEPLOYED_HOSTS) assert.equal(editorUrlFor(hostname), "https://makecode.playwendoo.com");
  });
});
