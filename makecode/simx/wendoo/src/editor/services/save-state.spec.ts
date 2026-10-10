import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { saveState } from "./save-state.js";

describe("saveState", () => {
  it("is saved while nothing is pending, whatever is in flight", () => {
    assert.equal(saveState({ pending: new Set(), pushesInFlight: 0 }), "saved");
    assert.equal(saveState({ pending: new Set(), pushesInFlight: 1 }), "saved");
  });

  it("is saving while something is pending and a push is in flight", () => {
    assert.equal(saveState({ pending: new Set(["a"]), pushesInFlight: 1 }), "saving");
  });

  it("is unsaved while something is pending and no push is in flight", () => {
    assert.equal(saveState({ pending: new Set(["a"]), pushesInFlight: 0 }), "unsaved");
    assert.equal(saveState({ pending: new Set(["a", "b"]), pushesInFlight: 0 }), "unsaved");
  });
});
