/**
 * Pins that the view the page mounts renders the shared toast region, so a
 * toast the shared components raise is shown.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

/** The source of the App module, beside this spec. */
const appSource = readFileSync(fileURLToPath(new URL("./App.tsx", import.meta.url)), "utf8");

describe("the toast region", () => {
  it("is rendered by App.tsx, from @wendoo/ui", () => {
    assert.match(appSource, /import \{[^}]*\bToaster\b[^}]*\} from "@wendoo\/ui";/);
    assert.match(appSource, /<Toaster \/>/);
  });
});
