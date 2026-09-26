import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CATALOG_UNREADABLE } from "../services/catalog.js";
import { CatalogPanel } from "./CatalogPanel.js";

function render(catalogText: string | undefined): string {
  return renderToStaticMarkup(createElement(CatalogPanel, { catalogText }));
}

describe("CatalogPanel", () => {
  it("lists each pack and its tiles by name, with declared kinds", () => {
    const markup = render(
      '{"packs":[{"name":"motion","tiles":[{"name":"move","kind":"actuator"},{"name":"heading"}]},{"name":"sound"}]}'
    );

    assert.match(markup, /data-testid="catalog-pack" data-name="motion"/);
    assert.match(markup, /data-testid="catalog-pack" data-name="sound"/);
    assert.match(markup, /data-testid="catalog-tile" data-name="move"/);
    assert.match(markup, /data-testid="catalog-tile" data-name="heading"/);
    assert.match(markup, /data-testid="catalog-tile-kind"[^>]*>actuator</);
  });

  it("renders the panel with no tiles before the first catalog arrives", () => {
    const markup = render(undefined);

    assert.match(markup, /data-testid="catalog-panel"/);
    assert.doesNotMatch(markup, /data-testid="catalog-tile"/);
    assert.doesNotMatch(markup, /data-testid="catalog-error"/);
  });

  it("reports an unreadable catalog by its stable code and soldiers on", () => {
    const markup = render("not a catalog");

    assert.match(markup, /data-testid="catalog-error"/);
    assert.ok(markup.includes(`data-code="${CATALOG_UNREADABLE}"`));
  });
});
