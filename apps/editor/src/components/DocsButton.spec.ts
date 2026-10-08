import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { elementByTestId } from "../test-support/element-tree.js";
import { DocsButton } from "./DocsButton.js";

/** The rendered `<button>` tag of a Docs toggle whose sidebar is open exactly when `isOpen`. */
function buttonTag(isOpen: boolean): string {
  const markup = renderToStaticMarkup(createElement(DocsButton, { isOpen, onToggle: () => {} }));
  const tag = /<button [^>]*data-testid="docs-button"[^>]*>/.exec(markup)?.[0];
  assert.ok(tag, "expected the docs button");
  return tag;
}

describe("DocsButton", () => {
  it("is a button controlling the docs sidebar", () => {
    assert.match(buttonTag(false), /aria-controls="docs-sidebar"/);
  });

  it("is expanded exactly while the sidebar is open", () => {
    assert.match(buttonTag(false), /aria-expanded="false"/);
    assert.match(buttonTag(true), /aria-expanded="true"/);
  });

  it("toggles the sidebar on a click", () => {
    let toggles = 0;
    const tree = DocsButton({
      isOpen: false,
      onToggle: () => {
        toggles += 1;
      },
    });

    (elementByTestId(tree, "docs-button").props.onClick as () => void)();

    assert.equal(toggles, 1);
  });
});
