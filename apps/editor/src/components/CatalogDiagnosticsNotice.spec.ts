import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CatalogDiagnostic } from "../services/authoring-environment.js";
import { CATALOG_PACK_UNBOUND } from "../services/authoring-environment.js";
import { CATALOG_UNREADABLE } from "../services/catalog.js";
import { CatalogDiagnosticsNotice } from "./CatalogDiagnosticsNotice.js";

/** Renders the notice for `diagnostics`. */
function render(diagnostics: readonly CatalogDiagnostic[]): string {
  return renderToStaticMarkup(createElement(CatalogDiagnosticsNotice, { diagnostics }));
}

describe("CatalogDiagnosticsNotice", () => {
  it("renders nothing when the catalog has no diagnostics", () => {
    assert.equal(render([]), "");
  });

  it("renders an unreadable catalog by its stable code", () => {
    const markup = render([{ code: CATALOG_UNREADABLE }]);

    assert.match(markup, /data-testid="catalog-diagnostics"/);
    assert.match(markup, new RegExp(`data-testid="catalog-diagnostic" data-code="${CATALOG_UNREADABLE}"`));
  });

  it("renders each unbound pack by its stable code and pack name, in catalog order", () => {
    const markup = render([
      { code: CATALOG_PACK_UNBOUND, pack: "motion" },
      { code: CATALOG_PACK_UNBOUND, pack: "sound" },
    ]);

    const rows = [...markup.matchAll(/data-testid="catalog-diagnostic" data-code="(\w+)" data-pack="([^"]*)"/g)];
    assert.deepEqual(
      rows.map((row) => [row[1], row[2]]),
      [
        [CATALOG_PACK_UNBOUND, "motion"],
        [CATALOG_PACK_UNBOUND, "sound"],
      ]
    );
  });
});
