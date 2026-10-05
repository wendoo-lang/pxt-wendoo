import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CoreOpId } from "@wendoo/core/app";
import { CompilationDiagCode, ParseDiagCode, TypeDiagCode } from "@wendoo/core/brain/compiler";
import {
  ACCESSOR_ENTRY_PREFIX,
  ARCADE_REFUSED_SOURCE,
  ASSIGN,
  arcadeBindingDiagnosticCodes,
  arcadeBindsWritableInlineSensor,
  arcadeCarriedSlotLabel,
  arcadeCarriedTileInline,
  arcadeCarriedTileLabel,
  arcadeCarriedTileLanguage,
  arcadeChainCompile,
  arcadeCompileDiagnosticCodes,
  arcadeHoldsModifier,
  arcadeImageRuleDiagnosticCodes,
  arcadeImageRulePrograms,
  arcadeLoneSensorSentence,
  arcadeModifierLabel,
  arcadeOffersLiteral,
  arcadeReadOfTileReference,
  arcadeRenderedIcons,
  arcadeRenderedTypeIcons,
  arcadeSensorLabel,
  arcadeSensorNames,
  arcadeSpriteOutputLabels,
  arcadeStructTextConstants,
  BRAIN_LITERAL,
  checkedInText,
  IMAGE_LITERAL,
  IMAGE_LITERAL_ASSET_ID,
  MODIFIER_ENTRY_PREFIX,
  NUMBER_LITERAL,
  OPERATOR_ENTRY_PREFIX,
  OUTPUT_ENTRY_PREFIX,
  type RenderedFile,
  renderVmPrograms,
  SENSOR_ENTRY_PREFIX,
} from "./vm-programs.js";

describe("the MakeCode VM extension's compiled programs", () => {
  let rendered: RenderedFile[] = [];
  let renderFailure: unknown;
  try {
    rendered = renderVmPrograms();
  } catch (error) {
    renderFailure = error;
  }

  it("renders every compiled program from the sources checked in today", () => {
    if (renderFailure !== undefined) throw renderFailure;
  });

  for (const file of rendered) {
    it(`checks in ${file.path} as the compile path makes it today`, () => {
      assert.equal(checkedInText(file.path), file.text, "run `npm run gen:vm-programs` in apps/editor");
    });
  }

  const myself = `${SENSOR_ENTRY_PREFIX}sensor.arcade.myself`;
  const imageOf = `${ACCESSOR_ENTRY_PREFIX}Sprite.image`;
  const setMyImage = [myself, imageOf, ASSIGN];

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

      assert.equal(frame, arcadeCarriedTileInline(tileName) ? undefined : (carried?.frame ?? "verb"));
      assert.deepEqual(words[0], { text: carried?.form ?? arcadeCarriedTileLabel(tileName), sourceTileIndex: 0 });
      if (carried?.bare !== undefined) {
        assert.deepEqual(words.slice(1), [{ text: carried.bare, sourceTileIndex: 0 }]);
      }
    });
  }

  it("compiles myself's image set to an image, and refuses the assignment given nothing", (t) => {
    t.mock.method(console, "warn", () => {});
    assert.deepEqual(arcadeImageRuleDiagnosticCodes([], [...setMyImage, IMAGE_LITERAL]), []);
    assert.deepEqual(arcadeImageRuleDiagnosticCodes([], setMyImage), [
      ParseDiagCode.ExpectedExpressionInSubExpr,
      CompilationDiagCode.UncompilableExpressionDropped,
    ]);
  });

  it("reads a brain placing the retired look-like tile as a missing tile keeping its id, dropped from a program still built", (t) => {
    t.mock.method(console, "warn", () => {});
    const lookLike = "tile.actuator->actuator.arcade.look-like";
    const read = arcadeReadOfTileReference(lookLike);

    assert.equal(read.kind, "missing");
    assert.equal(read.written, lookLike);
    assert.deepEqual(read.codes, [
      ParseDiagCode.UnexpectedTokenKindInExpression,
      CompilationDiagCode.UncompilableExpressionDropped,
    ]);
    assert.ok(read.compiles);
  });

  const proximitySensors = ["sensor.arcade.bump", "sensor.arcade.in-range", "sensor.arcade.out-of-range"];

  for (const sensor of proximitySensors) {
    it(`compiles ${sensor} given an image filter, and given none`, () => {
      const move = "actuator.arcade.move";
      assert.deepEqual(arcadeImageRuleDiagnosticCodes([sensor, IMAGE_LITERAL], [move]), []);
      assert.deepEqual(arcadeImageRuleDiagnosticCodes([sensor], [move]), []);
    });

    it(`offers an image literal at ${sensor}'s filter, and none once the filter holds one`, () => {
      assert.ok(arcadeOffersLiteral(IMAGE_LITERAL, [sensor]));
      assert.equal(arcadeOffersLiteral(IMAGE_LITERAL, [sensor, IMAGE_LITERAL]), false);
    });
  }

  for (const sensor of proximitySensors) {
    it(`compiles ${sensor} given a brain filter`, () => {
      assert.deepEqual(arcadeImageRuleDiagnosticCodes([sensor, BRAIN_LITERAL], ["actuator.arcade.move"]), []);
    });

    it(`offers a brain literal at ${sensor}'s filter, and none once the filter holds a value`, () => {
      assert.ok(arcadeOffersLiteral(BRAIN_LITERAL, [sensor]));
      assert.equal(arcadeOffersLiteral(BRAIN_LITERAL, [sensor, BRAIN_LITERAL]), false);
      assert.equal(arcadeOffersLiteral(BRAIN_LITERAL, [sensor, IMAGE_LITERAL]), false);
    });
  }

  it("offers a brain literal at no slot but a brain filter's and a brain assignment's", () => {
    assert.equal(arcadeOffersLiteral(BRAIN_LITERAL, [], setMyImage), false);
    assert.equal(arcadeOffersLiteral(BRAIN_LITERAL, [], ["actuator.arcade.move"]), false);
    assert.ok(arcadeOffersLiteral(IMAGE_LITERAL, [], setMyImage));
  });

  for (const sensor of ["sensor.arcade.in-range", "sensor.arcade.out-of-range"]) {
    it(`compiles ${sensor} given a brain filter and a range, in either order`, () => {
      const move = "actuator.arcade.move";
      assert.deepEqual(arcadeImageRuleDiagnosticCodes([sensor, BRAIN_LITERAL, NUMBER_LITERAL], [move]), []);
      assert.deepEqual(arcadeImageRuleDiagnosticCodes([sensor, NUMBER_LITERAL, BRAIN_LITERAL], [move]), []);
    });

    it(`compiles ${sensor} given an image filter and a range, in either order`, () => {
      const move = "actuator.arcade.move";
      assert.deepEqual(arcadeImageRuleDiagnosticCodes([sensor, IMAGE_LITERAL, NUMBER_LITERAL], [move]), []);
      assert.deepEqual(arcadeImageRuleDiagnosticCodes([sensor, NUMBER_LITERAL, IMAGE_LITERAL], [move]), []);
    });

    it(`offers an image literal at ${sensor}'s filter once its range is given`, () => {
      assert.ok(arcadeOffersLiteral(IMAGE_LITERAL, [sensor, NUMBER_LITERAL]));
    });
  }

  const sensorOutputs = [
    ["sensor.arcade.bump", "bumped"],
    ["sensor.arcade.in-range", "inRange"],
    ["sensor.arcade.out-of-range", "outOfRange"],
  ] as const;

  for (const [sensor, output] of sensorOutputs) {
    it(`binds ${sensor}'s ${output} output as an output tile shown by the label its catalog entry carries`, () => {
      const { bound, carried } = arcadeSpriteOutputLabels(output);

      assert.notEqual(carried, undefined, "the arcade base pack declares a label on the output");
      assert.equal(bound, carried);
    });

    it(`compiles myself's image set to ${sensor}'s output's image on its DO side, the program reading the output's key`, () => {
      const dress = [...setMyImage, `${OUTPUT_ENTRY_PREFIX}${output}`, imageOf];
      assert.deepEqual(arcadeImageRuleDiagnosticCodes([sensor], dress), []);
      const { holding } = arcadeImageRulePrograms([sensor], dress);
      assert.ok(new TextDecoder().decode(holding).includes(`__out.struct:<Sprite>.${output}`));
    });

    it(`offers ${sensor}'s output after myself's image assignment on the DO side of its rule, and not without the sensor`, () => {
      const outputEntry = `${OUTPUT_ENTRY_PREFIX}${output}`;
      assert.ok(arcadeOffersLiteral(outputEntry, [sensor], setMyImage));
      assert.equal(arcadeOffersLiteral(outputEntry, ["sensor.arcade.dpad"], setMyImage), false);
    });
  }

  it("compiles a child rule filtering bump by its parent's in-range output and setting myself's image to its image", () => {
    const { codes, bytecode } = arcadeChainCompile(["sensor.arcade.in-range"], [], {
      when: ["sensor.arcade.bump", `${OUTPUT_ENTRY_PREFIX}inRange`],
      act: [...setMyImage, `${OUTPUT_ENTRY_PREFIX}inRange`, imageOf],
    });

    assert.deepEqual(codes, []);
    assert.ok(bytecode && new TextDecoder().decode(bytecode).includes("__out.struct:<Sprite>.inRange"));
  });

  const above = `${MODIFIER_ENTRY_PREFIX}position.above`;
  const below = `${MODIFIER_ENTRY_PREFIX}position.below`;
  const left = `${MODIFIER_ENTRY_PREFIX}position.left`;
  const right = `${MODIFIER_ENTRY_PREFIX}position.right`;

  for (const sensor of proximitySensors) {
    it(`compiles ${sensor} given each positional modifier, a quadrant, and a quadrant beside a filter`, () => {
      const move = "actuator.arcade.move";
      for (const modifier of [above, below, left, right]) {
        assert.deepEqual(arcadeImageRuleDiagnosticCodes([sensor, modifier], [move]), [], modifier);
      }
      assert.deepEqual(arcadeImageRuleDiagnosticCodes([sensor, above, right], [move]), []);
      assert.deepEqual(arcadeImageRuleDiagnosticCodes([sensor, left, below, IMAGE_LITERAL], [move]), []);
    });

    it(`refuses ${sensor} given both modifiers of one axis`, (t) => {
      t.mock.method(console, "warn", () => {});
      const move = "actuator.arcade.move";
      assert.ok(arcadeImageRuleDiagnosticCodes([sensor, above, below], [move]).length > 0);
      assert.ok(arcadeImageRuleDiagnosticCodes([sensor, right, left], [move]).length > 0);
    });

    it(`offers ${sensor}'s positional modifiers one per axis: none of an axis once its modifier is placed`, () => {
      for (const modifier of [above, below, left, right]) assert.ok(arcadeOffersLiteral(modifier, [sensor]), modifier);
      assert.equal(arcadeOffersLiteral(below, [sensor, above]), false);
      assert.equal(arcadeOffersLiteral(above, [sensor, above]), false);
      assert.ok(arcadeOffersLiteral(left, [sensor, above]));
      assert.ok(arcadeOffersLiteral(right, [sensor, above]));
      for (const modifier of [above, below, left, right]) {
        assert.equal(arcadeOffersLiteral(modifier, [sensor, above, left]), false, modifier);
      }
    });
  }

  it("compiles a minted image literal into the program as the image struct naming the asset's id", () => {
    const { holding } = arcadeImageRulePrograms(["sensor.arcade.bump", IMAGE_LITERAL], ["actuator.arcade.move"]);

    assert.deepEqual(arcadeStructTextConstants(holding), [IMAGE_LITERAL_ASSET_ID]);
  });

  for (const [consumer, when, act] of [
    ["bump's image filter", ["sensor.arcade.bump", IMAGE_LITERAL], ["actuator.arcade.move"]],
    ["in range's image filter", ["sensor.arcade.in-range", IMAGE_LITERAL, NUMBER_LITERAL], ["actuator.arcade.move"]],
    ["out of range's image filter", ["sensor.arcade.out-of-range", IMAGE_LITERAL], ["actuator.arcade.move"]],
    ["myself's image set to an image", [], [...setMyImage, IMAGE_LITERAL]],
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

  it("binds each core tile icon the pinned arcade catalog carries onto a core tile the environment holds, through to the visual provider", () => {
    const core = arcadeRenderedIcons().icons.filter((icon) => icon.core);

    assert.ok(core.length > 0, "the arcade base pack gives core tiles icons");
    for (const icon of core) {
      assert.match(icon.carried, /^data:image\/svg\+xml/, icon.tileId);
      assert.equal(icon.bound, icon.carried, icon.tileId);
      assert.equal(icon.resolved, icon.carried, icon.tileId);
    }
  });

  it("binds each type icon and core type icon the pinned arcade catalog carries once the simx renders it to its type", () => {
    const icons = arcadeRenderedTypeIcons();

    assert.deepEqual(icons.map((icon) => icon.name).sort(), [
      "Brain",
      "Sprite",
      "Vector2",
      "boolean",
      "number",
      "string",
    ]);
    for (const icon of icons) {
      assert.match(icon.carried, /^data:image\/svg\+xml/, icon.name);
      assert.equal(icon.bound, icon.carried, icon.name);
    }
  });

  const move = "actuator.arcade.move";
  const toward = `${MODIFIER_ENTRY_PREFIX}movement.toward`;
  const away = `${MODIFIER_ENTRY_PREFIX}movement.away`;
  const wander = `${MODIFIER_ENTRY_PREFIX}movement.wander`;
  const quickly = `${MODIFIER_ENTRY_PREFIX}quickly`;
  const slowly = `${MODIFIER_ENTRY_PREFIX}slowly`;
  const up = `${MODIFIER_ENTRY_PREFIX}direction.up`;
  const spriteInRange = `${OUTPUT_ENTRY_PREFIX}inRange`;
  const position = `${ACCESSOR_ENTRY_PREFIX}Sprite.position`;
  const inRange = ["sensor.arcade.in-range"];

  for (const act of [
    [move, toward, quickly, spriteInRange],
    [move, quickly, toward, spriteInRange],
    [move, toward, spriteInRange, quickly],
    [move, toward, up, spriteInRange, slowly],
    [move, away, spriteInRange],
    [move, away, quickly, spriteInRange],
  ]) {
    it(`compiles ${act.join(" ")} under in range, the program reading the sprite in range as the move's target`, () => {
      assert.deepEqual(arcadeImageRuleDiagnosticCodes(inRange, act), []);
      const { holding } = arcadeImageRulePrograms(inRange, act);
      assert.ok(new TextDecoder().decode(holding).includes("__out.struct:<Sprite>.inRange"));
    });
  }

  for (const act of [
    [move, toward, spriteInRange, away],
    [move, away, spriteInRange, toward],
    [move, toward, away, spriteInRange],
  ]) {
    it(`compiles ${act.join(" ")} under in range, toward and away sharing the one target`, () => {
      assert.deepEqual(arcadeImageRuleDiagnosticCodes(inRange, act), []);
    });
  }

  it("refuses a move target placed before toward or away, or given twice", () => {
    for (const act of [
      [move, spriteInRange],
      [move, spriteInRange, toward],
      [move, toward, spriteInRange, spriteInRange],
    ]) {
      assert.ok(arcadeImageRuleDiagnosticCodes(inRange, act).includes(TypeDiagCode.DataTypeMismatch), act.join(" "));
    }
  });

  it("offers the sprite in range as the move's target once toward or away is placed", () => {
    assert.ok(arcadeOffersLiteral(spriteInRange, inRange, [move, toward]));
    assert.ok(arcadeOffersLiteral(spriteInRange, inRange, [move, away]));
    assert.ok(arcadeOffersLiteral(spriteInRange, inRange, [move, toward, quickly]));
    assert.ok(arcadeOffersLiteral(spriteInRange, inRange, [move, toward, away]));
  });

  it("offers the sprite in range at a move's direction slot too, to read a Vector2 through its position", () => {
    for (const act of [[move], [move, quickly], [move, up, slowly], [move, toward, spriteInRange]]) {
      assert.ok(arcadeOffersLiteral(spriteInRange, inRange, act), act.join(" "));
    }
    assert.ok(arcadeOffersLiteral(position, inRange, [move, spriteInRange]));
    assert.deepEqual(arcadeImageRuleDiagnosticCodes(inRange, [move, spriteInRange, position]), []);
  });

  it("offers the move's other tiles after its target", () => {
    for (const modifier of [quickly, up, away, wander]) {
      assert.ok(arcadeOffersLiteral(modifier, inRange, [move, toward, spriteInRange]), modifier);
    }
  });

  it("binds the move's wander as a shared modifier tile, shown by the label its slot carries", () => {
    const carried = arcadeCarriedSlotLabel(move, "modifier.movement.wander");

    assert.ok(arcadeHoldsModifier("modifier.movement.wander"));
    assert.notEqual(carried, undefined, "the arcade base pack declares a label on the wander slot");
    assert.equal(arcadeModifierLabel("modifier.movement.wander"), carried);
  });

  it("offers wander at move until it is placed", () => {
    assert.ok(arcadeOffersLiteral(wander, [], [move]));
    assert.ok(arcadeOffersLiteral(wander, [], [move, toward, slowly]));
    assert.equal(arcadeOffersLiteral(wander, [], [move, wander]), false);
  });

  for (const act of [
    [move, wander],
    [move, wander, slowly],
    [move, quickly, wander],
    [move, toward, wander],
    [move, wander, up],
  ]) {
    it(`compiles ${act.join(" ")}`, () => {
      assert.deepEqual(arcadeImageRuleDiagnosticCodes(inRange, act), []);
    });
  }

  it("compiles toward given the sprite in range beside wander", () => {
    assert.deepEqual(arcadeImageRuleDiagnosticCodes(inRange, [move, wander, toward, spriteInRange]), []);
  });

  const brainOf = `${ACCESSOR_ENTRY_PREFIX}Sprite.brain`;
  const yOf = `${ACCESSOR_ENTRY_PREFIX}Vector2.y`;
  const bumped = `${OUTPUT_ENTRY_PREFIX}bumped`;
  const bump = "sensor.arcade.bump";

  it("binds myself as an inline sensor whose result a brain may write a field through", () => {
    assert.ok(arcadeBindsWritableInlineSensor("sensor.arcade.myself"));
  });

  it("offers myself wherever a sprite goes: a proximity filter, a move's target, and the head of a DO side", () => {
    assert.ok(arcadeOffersLiteral(myself, [bump]));
    assert.ok(arcadeOffersLiteral(myself, ["sensor.arcade.in-range"]));
    assert.ok(arcadeOffersLiteral(myself, inRange, [move, toward]));
    assert.ok(arcadeOffersLiteral(myself, [], []));
  });

  it("offers each Sprite accessor after myself, and the assignment after a writable one", () => {
    for (const accessor of [position, brainOf, imageOf]) {
      assert.ok(arcadeOffersLiteral(accessor, [], [myself]), accessor);
    }
    assert.ok(arcadeOffersLiteral(ASSIGN, [], [myself, imageOf]));
  });

  for (const [sentence, when, act] of [
    ["in range given myself's brain, moving toward", ["sensor.arcade.in-range", myself, brainOf], [move, toward]],
    ["a move toward the bumped sprite's position", [bump], [move, toward, bumped, position]],
    ["myself's image set to the bumped sprite's", [bump], [myself, imageOf, ASSIGN, bumped, imageOf]],
    ["myself's image set to an image asset", [bump], [myself, imageOf, ASSIGN, IMAGE_LITERAL]],
    ["myself's position set to the bumped sprite's", [bump], [myself, position, ASSIGN, bumped, position]],
    ["myself's brain set to a brain", [bump], [myself, brainOf, ASSIGN, BRAIN_LITERAL]],
  ] as const) {
    it(`compiles ${sentence}`, () => {
      assert.deepEqual(arcadeImageRuleDiagnosticCodes([...when], [...act]), []);
    });
  }

  it("compiles a child comparing the y of the sprite in range with its own sprite's", () => {
    const { codes } = arcadeChainCompile(inRange, [], {
      when: [spriteInRange, position, yOf, `${OPERATOR_ENTRY_PREFIX}${CoreOpId.LessThan}`, myself, position, yOf],
      act: [move, up],
    });

    assert.deepEqual(codes, []);
  });

  it("refuses an assignment through an output tile's field, and to a Vector2's x or y", () => {
    assert.ok(
      arcadeImageRuleDiagnosticCodes([bump], [bumped, brainOf, ASSIGN, BRAIN_LITERAL]).includes(
        ParseDiagCode.ReadOnlyResultFieldAssignment
      )
    );
    assert.ok(
      arcadeImageRuleDiagnosticCodes([], [myself, position, yOf, ASSIGN, NUMBER_LITERAL]).includes(
        ParseDiagCode.ReadOnlyFieldAssignment
      )
    );
  });

  it("refuses a dpad given one direction modifier twice", (t) => {
    const warn = t.mock.method(console, "warn", () => {});
    const codes = arcadeCompileDiagnosticCodes(ARCADE_REFUSED_SOURCE);
    assert.ok(codes.includes(ParseDiagCode.UnexpectedExpressionAfterExpression));
    assert.ok(codes.includes(CompilationDiagCode.UncompilableExpressionDropped));
    assert.equal(warn.mock.callCount(), 1, "the compiler warns once of the expression it drops");
  });
});
