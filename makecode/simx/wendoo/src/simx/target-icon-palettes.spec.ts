import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { targetIconPalette } from "./target-icon-palettes.js";

describe("target icon palettes", () => {
  it("gives the arcade target a palette of sixteen #rrggbb colors", () => {
    const palette = targetIconPalette("arcade");
    assert.ok(palette);
    assert.equal(palette.length, 16);
    assert.equal(
      palette.every((color) => /^#[0-9a-f]{6}$/.test(color)),
      true
    );
  });

  it("gives no palette to a target it does not know, nor while no target is declared", () => {
    assert.equal(targetIconPalette("microbit"), undefined);
    assert.equal(targetIconPalette(""), undefined);
    assert.equal(targetIconPalette(undefined), undefined);
  });
});
