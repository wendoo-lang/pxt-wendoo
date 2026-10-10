import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BrainBuildDiagnostic } from "@wendoo/core/brain";
import { ParseDiagCode, TypeDiagCode } from "@wendoo/core/brain/compiler";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { BrainEntry } from "../services/brains-store.js";
import {
  BrainDiagnosticsList,
  BrainErrorBadge,
  brainCompileState,
  listedDiagnostics,
  toggledBrainId,
} from "./BrainDiagnostics.js";

const ERROR: BrainBuildDiagnostic = { code: ParseDiagCode.ExpectedSensorOrActuator, severity: "error", message: "e" };
const WARNING: BrainBuildDiagnostic = { code: TypeDiagCode.TileNotFound, severity: "warning", message: "w" };
const INFO: BrainBuildDiagnostic = { code: TypeDiagCode.DataTypeConverted, severity: "info", message: "i" };

/** An entry for source hash `sourceHash` with `fields` layered over it. */
function entryWith(fields: Partial<BrainEntry>): BrainEntry {
  return {
    name: "Chaser",
    source: "{}",
    sourceHash: "aaaaaaaa",
    diagnostics: [],
    unresolvedTiles: [],
    compiled: undefined,
    ...fields,
  };
}

describe("brainCompileState", () => {
  it("is current when the latest compile produced bytecode for the entry's source", () => {
    const entry = entryWith({ compiled: { bytecode: new Uint8Array(), sourceHash: "aaaaaaaa" } });
    assert.equal(brainCompileState(entry), "current");
  });

  it("is stale when the last good compile was of an earlier source", () => {
    const entry = entryWith({ compiled: { bytecode: new Uint8Array(), sourceHash: "bbbbbbbb" } });
    assert.equal(brainCompileState(entry), "stale");
  });

  it("is none when no compile has produced bytecode", () => {
    assert.equal(brainCompileState(entryWith({})), "none");
  });
});

describe("listedDiagnostics", () => {
  it("lists errors and warnings in reported order, leaving informational diagnostics out", () => {
    assert.deepEqual(listedDiagnostics(entryWith({ diagnostics: [WARNING, INFO, ERROR] })), [WARNING, ERROR]);
  });
});

describe("BrainErrorBadge", () => {
  it("carries the count, the compile state and the collapsed state", () => {
    const markup = renderToStaticMarkup(
      createElement(BrainErrorBadge, {
        count: 3,
        compileState: "stale",
        expanded: false,
        onToggle: () => undefined,
        brainName: "Chaser",
      })
    );

    assert.match(markup, /data-testid="brain-error-badge"/);
    assert.match(markup, /data-compile="stale"/);
    assert.match(markup, /aria-expanded="false"/);
    assert.match(markup, /data-testid="brain-error-count"[^>]*>3</);
  });

  it("reflects the expanded state on the toggle control", () => {
    const markup = renderToStaticMarkup(
      createElement(BrainErrorBadge, {
        count: 1,
        compileState: "current",
        expanded: true,
        onToggle: () => undefined,
        brainName: "Chaser",
      })
    );

    assert.match(markup, /aria-expanded="true"/);
  });
});

describe("BrainDiagnosticsList", () => {
  it("renders one row per diagnostic, carrying its stable code and severity", () => {
    const markup = renderToStaticMarkup(createElement(BrainDiagnosticsList, { diagnostics: [ERROR, WARNING] }));

    assert.match(markup, /data-testid="brain-diagnostics"/);
    const rows = [...markup.matchAll(/data-testid="brain-diagnostic-row" data-code="(\d+)" data-severity="(\w+)"/g)];
    assert.deepEqual(
      rows.map((row) => [Number(row[1]), row[2]]),
      [
        [ERROR.code, "error"],
        [WARNING.code, "warning"],
      ]
    );
  });
});

describe("toggledBrainId", () => {
  it("expands an absent id and collapses a present one", () => {
    const expanded = toggledBrainId(new Set(), "b1");
    assert.deepEqual([...expanded], ["b1"]);
    assert.deepEqual([...toggledBrainId(expanded, "b1")], []);
  });

  it("toggles independently per brain", () => {
    const both = toggledBrainId(toggledBrainId(new Set(), "b1"), "b2");
    assert.deepEqual([...toggledBrainId(both, "b1")], ["b2"]);
  });
});
