import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MakeCodeManifestProblemCode } from "@wendoo/makecode-session";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CatalogDiagnostic } from "../services/authoring-environment.js";
import { CATALOG_PACK_UNBOUND, PackBindingCode } from "../services/authoring-environment.js";
import { CATALOG_UNREADABLE, CatalogProblemCode } from "../services/catalog.js";
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

  it("renders each entry problem by its stable code, pack, entry and token", () => {
    const markup = render([
      { code: CatalogProblemCode.TILE_KIND_UNKNOWN, pack: "motion", name: "move", token: "actutor" },
      { code: PackBindingCode.TYPE_UNKNOWN, pack: "motion", name: "aim", token: "Vec" },
      { code: PackBindingCode.DEFAULT_UNREADABLE, pack: "motion", name: "go" },
    ]);

    const rows = [
      ...markup.matchAll(
        /data-testid="catalog-diagnostic" data-code="(\w+)" data-pack="([^"]*)" data-name="([^"]*)"(?: data-token="([^"]*)")?/g
      ),
    ];
    assert.deepEqual(
      rows.map((row) => [row[1], row[2], row[3], row[4]]),
      [
        [CatalogProblemCode.TILE_KIND_UNKNOWN, "motion", "move", "actutor"],
        [PackBindingCode.TYPE_UNKNOWN, "motion", "aim", "Vec"],
        [PackBindingCode.DEFAULT_UNREADABLE, "motion", "go", undefined],
      ]
    );
  });

  it("renders a manifest of a newer format by its stable code", () => {
    const markup = render([{ code: MakeCodeManifestProblemCode.FORMAT_NEWER }]);

    assert.match(
      markup,
      new RegExp(`data-testid="catalog-diagnostic" data-code="${MakeCodeManifestProblemCode.FORMAT_NEWER}"`)
    );
  });
});
