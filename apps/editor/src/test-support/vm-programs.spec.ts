import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CompilationDiagCode, ParseDiagCode } from "@wendoo/core/brain/compiler";
import {
  ARCADE_REFUSED_SOURCE,
  arcadeBindingDiagnosticCodes,
  arcadeCompileDiagnosticCodes,
  checkedInText,
  renderVmPrograms,
} from "./vm-programs.js";

describe("the MakeCode VM extension's compiled programs", () => {
  for (const file of renderVmPrograms()) {
    it(`checks in ${file.path} as the compile path makes it today`, () => {
      assert.equal(checkedInText(file.path), file.text, "run `npm run gen:vm-programs` in apps/editor");
    });
  }

  it("binds the arcade catalog clean, dpad and move sharing the direction modifiers", () => {
    assert.deepEqual(arcadeBindingDiagnosticCodes(), []);
  });

  it("refuses a dpad given one direction modifier twice", (t) => {
    const warn = t.mock.method(console, "warn", () => {});
    const codes = arcadeCompileDiagnosticCodes(ARCADE_REFUSED_SOURCE);
    assert.ok(codes.includes(ParseDiagCode.UnexpectedExpressionAfterExpression));
    assert.ok(codes.includes(CompilationDiagCode.UncompilableExpressionDropped));
    assert.equal(warn.mock.callCount(), 1, "the compiler warns once of the expression it drops");
  });
});
