/**
 * Pins that the App mounts the session's docs sidebar with standalone docs
 * page links turned off.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const appSource = readFileSync(fileURLToPath(new URL("./App.tsx", import.meta.url)), "utf8");

describe("App", () => {
  it("mounts its docs sidebar provider with standalone docs page links turned off", () => {
    assert.match(appSource, /<DocsSidebarProvider\b[^>]*\bshowDocsPageLinks=\{false\}[^>]*>/);
  });
});
