import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CompilationDiagCode, ParseDiagCode } from "@wendoo/core/brain/compiler";
import {
  ARCADE_REFUSED_SOURCE,
  arcadeBindingDiagnosticCodes,
  arcadeCarriedSlotLabel,
  arcadeCarriedTileLabel,
  arcadeCarriedTileLanguage,
  arcadeCompileDiagnosticCodes,
  arcadeHoldsModifier,
  arcadeImageRuleDiagnosticCodes,
  arcadeImageRulePrograms,
  arcadeLoneSensorSentence,
  arcadeModifierLabel,
  arcadeRenderedIcons,
  arcadeSensorLabel,
  arcadeSensorNames,
  arcadeStructTextConstants,
  checkedInText,
  IMAGE_LITERAL,
  IMAGE_LITERAL_ASSET_ID,
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

  it("binds the move's toward and away as shared modifier tiles", () => {
    assert.ok(arcadeHoldsModifier("modifier.movement.toward"));
    assert.ok(arcadeHoldsModifier("modifier.movement.away"));
  });

  it("shows the move's away modifier by the label its slot carries", () => {
    const carried = arcadeCarriedSlotLabel("actuator.arcade.move", "modifier.movement.away");

    assert.notEqual(carried, undefined, "the arcade base pack declares a label on the away slot");
    assert.equal(arcadeModifierLabel("modifier.movement.away"), carried);
  });

  for (const tileName of ["sensor.arcade.in-range", "sensor.arcade.out-of-range"]) {
    it(`binds ${tileName} by its id, shown by the label its catalog entry carries`, () => {
      const carried = arcadeCarriedTileLabel(tileName);

      assert.notEqual(carried, undefined, "the arcade base pack declares a label on the tile");
      assert.equal(arcadeSensorLabel(tileName), carried);
    });
  }

  for (const tileName of arcadeSensorNames()) {
    it(`projects ${tileName} heading a WHEN side alone with the sentence words its catalog entry carries`, () => {
      const carried = arcadeCarriedTileLanguage(tileName);
      const { frame, words } = arcadeLoneSensorSentence(tileName);

      assert.equal(frame, carried?.frame ?? "verb");
      assert.deepEqual(words[0], { text: carried?.form ?? arcadeCarriedTileLabel(tileName), sourceTileIndex: 0 });
      if (carried?.bare !== undefined) {
        assert.deepEqual(words.slice(1), [{ text: carried.bare, sourceTileIndex: 0 }]);
      }
    });
  }

  it("compiles look like given an image, and refuses it given nothing", () => {
    const lookLike = "actuator.arcade.look-like";
    assert.deepEqual(arcadeImageRuleDiagnosticCodes([], [lookLike, IMAGE_LITERAL]), []);
    assert.ok(arcadeImageRuleDiagnosticCodes([], [lookLike]).includes(ParseDiagCode.ActionCallParseFailure));
  });

  it("compiles bump given an image, and given none", () => {
    const move = "actuator.arcade.move";
    assert.deepEqual(arcadeImageRuleDiagnosticCodes(["sensor.arcade.bump", IMAGE_LITERAL], [move]), []);
    assert.deepEqual(arcadeImageRuleDiagnosticCodes(["sensor.arcade.bump"], [move]), []);
  });

  it("compiles a minted image literal into the program as the image struct naming the asset's id", () => {
    const { holding } = arcadeImageRulePrograms(["sensor.arcade.bump", IMAGE_LITERAL], ["actuator.arcade.move"]);

    assert.deepEqual(arcadeStructTextConstants(holding), [IMAGE_LITERAL_ASSET_ID]);
  });

  for (const [consumer, when, act] of [
    ["bump's image filter", ["sensor.arcade.bump", IMAGE_LITERAL], ["actuator.arcade.move"]],
    ["look like's image", [], ["actuator.arcade.look-like", IMAGE_LITERAL]],
  ] as const) {
    it(`compiles ${consumer} to the same bytes whether the snapshot holds the image or lacks it`, () => {
      const { holding, lacking } = arcadeImageRulePrograms([...when], [...act]);

      assert.deepEqual(lacking, holding);
    });
  }

  it("binds every icon the pinned arcade catalog carries once the simx renders it, through to the visual provider", () => {
    const { icons, errors } = arcadeRenderedIcons();

    assert.deepEqual(errors, []);
    assert.ok(icons.length > 0, "the arcade base pack declares icons");
    for (const icon of icons) {
      assert.match(icon.carried, /^data:image\/svg\+xml/, icon.tileId);
      assert.equal(icon.bound, icon.carried, icon.tileId);
      assert.equal(icon.resolved, icon.carried, icon.tileId);
    }
  });

  it("refuses a dpad given one direction modifier twice", (t) => {
    const warn = t.mock.method(console, "warn", () => {});
    const codes = arcadeCompileDiagnosticCodes(ARCADE_REFUSED_SOURCE);
    assert.ok(codes.includes(ParseDiagCode.UnexpectedExpressionAfterExpression));
    assert.ok(codes.includes(CompilationDiagCode.UncompilableExpressionDropped));
    assert.equal(warn.mock.callCount(), 1, "the compiler warns once of the expression it drops");
  });
});
