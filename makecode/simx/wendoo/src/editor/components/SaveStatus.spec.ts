import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { type SaveFacts, SaveStatus, saveState } from "./SaveStatus.js";

/** Save facts with `fields` layered over a store holding nothing unsaved, reconciled. */
function factsWith(fields: Partial<SaveFacts>): SaveFacts {
  return { pending: new Set(), pushesInFlight: 0, reconciled: true, ...fields };
}

describe("saveState", () => {
  it("is saved while nothing is pending, whatever is in flight", () => {
    assert.equal(saveState(factsWith({})), "saved");
    assert.equal(saveState(factsWith({ pushesInFlight: 1 })), "saved");
  });

  it("is saving while something is pending and a push is in flight", () => {
    assert.equal(saveState(factsWith({ pending: new Set(["a"]), pushesInFlight: 1 })), "saving");
  });

  it("is unsaved while something is pending and no push is in flight, reconciled or not", () => {
    assert.equal(saveState(factsWith({ pending: new Set(["a"]) })), "unsaved");
    assert.equal(saveState(factsWith({ pending: new Set(["a", "b"]), reconciled: false })), "unsaved");
  });
});

describe("SaveStatus", () => {
  /** Renders the status over `facts`. */
  function render(facts: SaveFacts): string {
    return renderToStaticMarkup(createElement(SaveStatus, { facts }));
  }

  it("carries its state and the store's counts and reconciled flag as data", () => {
    const markup = render(factsWith({ pending: new Set(["a", "b"]), pushesInFlight: 1, reconciled: true }));

    assert.match(
      markup,
      /data-testid="save-status" data-save-state="saving" data-pending="2" data-in-flight="1" data-reconciled="true"/
    );
  });

  it("shows a dot for its state while saving or unsaved", () => {
    for (const [facts, state] of [
      [factsWith({ pending: new Set(["a"]), pushesInFlight: 1 }), "saving"],
      [factsWith({ pending: new Set(["a"]), reconciled: false }), "unsaved"],
    ] as const) {
      const markup = render(facts);
      assert.match(markup, new RegExp(`data-save-state="${state}"`));
      assert.match(markup, new RegExp(`data-testid="save-dot" data-save-state="${state}"`));
    }
  });

  it("stays quiet while saved: its element carries the state, with nothing shown inside", () => {
    const markup = render(factsWith({ reconciled: false }));

    assert.match(markup, /data-save-state="saved" data-pending="0" data-in-flight="0" data-reconciled="false"/);
    assert.match(markup, /<output[^>]*><\/output>/);
  });
});
