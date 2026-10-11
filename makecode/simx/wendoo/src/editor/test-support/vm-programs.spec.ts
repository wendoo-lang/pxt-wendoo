import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CoreOpId, CoreTypeIds } from "@wendoo/core/app";
import { CompilationDiagCode, ParseDiagCode, TypeDiagCode } from "@wendoo/core/brain/compiler";
import { mkNumberValue, mkTypeId, NativeType } from "@wendoo/core/runtime";
import {
  ACCESSOR_ENTRY_PREFIX,
  ARCADE_REFUSED_SOURCE,
  ASSIGN,
  arcadeBindingDiagnosticCodes,
  arcadeBindsWritableInlineSensor,
  arcadeCarriedSlotLabel,
  arcadeCarriedSlotLanguage,
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
  arcadeOperatorResultType,
  arcadeReadOfTileReference,
  arcadeRenderedIcons,
  arcadeRenderedTypeIcons,
  arcadeRuleSentence,
  arcadeSensorLabel,
  arcadeSensorNames,
  arcadeSpriteOutputLabels,
  arcadeStructTextConstants,
  arcadeTypeNames,
  arcadeVariableFaces,
  arcadeVariableFactories,
  arcadeVariableRun,
  arcadeVariableSource,
  BRAIN_LITERAL,
  CLOSE_PAREN,
  checkedInText,
  FACTORY_ENTRY_PREFIX,
  IMAGE_LITERAL,
  IMAGE_LITERAL_ASSET_ID,
  LITERAL_ENTRY_PREFIX,
  MODIFIER_ENTRY_PREFIX,
  NIL_LITERAL,
  NUMBER_LITERAL,
  OPEN_PAREN,
  OPERATOR_ENTRY_PREFIX,
  OUTPUT_ENTRY_PREFIX,
  PARAMETER_ENTRY_PREFIX,
  type RenderedFile,
  renderVmPrograms,
  SENSOR_ENTRY_PREFIX,
  TEXT_LITERAL,
  VARIABLE_ENTRY_PREFIX,
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
      assert.equal(checkedInText(file.path), file.text, "run `npm run gen:vm-programs` in makecode/simx/wendoo");
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
      "Effect",
      "Image",
      "ParticleEffect",
      "Player",
      "Sound",
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

  const smoothingOf = `${ACCESSOR_ENTRY_PREFIX}Sprite.moveSmoothing`;

  it("offers each Sprite accessor after myself, and the assignment after a writable one", () => {
    for (const accessor of [position, brainOf, imageOf, smoothingOf]) {
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

  const spriteOutOfRange = `${OUTPUT_ENTRY_PREFIX}outOfRange`;

  for (const [sentence, when, act] of [
    ["the bumped sprite's brain set to a brain", [bump], [bumped, brainOf, ASSIGN, BRAIN_LITERAL]],
    ["the bumped sprite's brain set to myself's", [bump], [bumped, brainOf, ASSIGN, myself, brainOf]],
    ["the bumped sprite's position set to myself's", [bump], [bumped, position, ASSIGN, myself, position]],
    ["the sprite in range's image set to myself's", inRange, [spriteInRange, imageOf, ASSIGN, myself, imageOf]],
    [
      "the sprite out of range's image set to an image asset",
      ["sensor.arcade.out-of-range"],
      [spriteOutOfRange, imageOf, ASSIGN, IMAGE_LITERAL],
    ],
  ] as const) {
    it(`compiles an assignment through a proximity sensor's output: ${sentence}`, () => {
      assert.deepEqual(arcadeImageRuleDiagnosticCodes([...when], [...act]), []);
    });
  }

  it("offers move smoothing after myself and after the bumped sprite, and the assignment after either", () => {
    assert.ok(arcadeOffersLiteral(smoothingOf, [bump], [bumped]));
    assert.ok(arcadeOffersLiteral(ASSIGN, [], [myself, smoothingOf]));
    assert.ok(arcadeOffersLiteral(ASSIGN, [bump], [bumped, smoothingOf]));
  });

  for (const [sentence, when, act] of [
    ["myself's move smoothing set to a number", [], [myself, smoothingOf, ASSIGN, NUMBER_LITERAL]],
    ["the bumped sprite's move smoothing set to a number", [bump], [bumped, smoothingOf, ASSIGN, NUMBER_LITERAL]],
    ["myself's move smoothing set to the bumped sprite's", [bump], [myself, smoothingOf, ASSIGN, bumped, smoothingOf]],
  ] as const) {
    it(`compiles ${sentence}`, () => {
      assert.deepEqual(arcadeImageRuleDiagnosticCodes([...when], [...act]), []);
    });
  }

  it("neither offers nil for move smoothing nor takes it without a type mismatch", () => {
    assert.equal(arcadeOffersLiteral(NIL_LITERAL, [], [myself, smoothingOf, ASSIGN]), false);
    assert.ok(
      arcadeImageRuleDiagnosticCodes([], [myself, smoothingOf, ASSIGN, NIL_LITERAL]).includes(
        TypeDiagCode.DataTypeMismatch
      )
    );
  });

  it("offers the assignment after a writable field of each proximity sensor's output", () => {
    assert.ok(arcadeOffersLiteral(ASSIGN, [bump], [bumped, brainOf]));
    assert.ok(arcadeOffersLiteral(ASSIGN, inRange, [spriteInRange, imageOf]));
    assert.ok(arcadeOffersLiteral(ASSIGN, ["sensor.arcade.out-of-range"], [spriteOutOfRange, position]));
  });

  it("offers and takes an assignment to a sprite's position's y, through an output tile as through myself", () => {
    assert.ok(arcadeOffersLiteral(ASSIGN, [bump], [bumped, position, yOf]));
    assert.ok(arcadeOffersLiteral(ASSIGN, [], [myself, position, yOf]));
    assert.deepEqual(arcadeImageRuleDiagnosticCodes([bump], [bumped, position, yOf, ASSIGN, NUMBER_LITERAL]), []);
    assert.deepEqual(arcadeImageRuleDiagnosticCodes([], [myself, position, yOf, ASSIGN, NUMBER_LITERAL]), []);
  });

  const equalTo = `${OPERATOR_ENTRY_PREFIX}${CoreOpId.EqualTo}`;
  const notEqualTo = `${OPERATOR_ENTRY_PREFIX}${CoreOpId.NotEqualTo}`;

  it("offers equality and inequality after myself's image", () => {
    assert.ok(arcadeOffersLiteral(equalTo, [myself, imageOf]));
    assert.ok(arcadeOffersLiteral(notEqualTo, [myself, imageOf]));
  });

  it("offers equality and inequality after a sprite and after a brain", () => {
    for (const when of [[myself], [myself, brainOf]]) {
      assert.ok(arcadeOffersLiteral(equalTo, when));
      assert.ok(arcadeOffersLiteral(notEqualTo, when));
    }
  });

  for (const [sentence, when] of [
    ["myself's image equal to an image asset", [myself, imageOf, equalTo, IMAGE_LITERAL]],
    ["myself's image unequal to an image asset", [myself, imageOf, notEqualTo, IMAGE_LITERAL]],
    ["myself's brain equal to a brain", [myself, brainOf, equalTo, BRAIN_LITERAL]],
    ["myself equal to myself", [myself, equalTo, myself]],
  ] as const) {
    it(`compiles a WHEN comparing ${sentence}`, () => {
      assert.deepEqual(arcadeImageRuleDiagnosticCodes([...when], [move]), []);
    });
  }

  it("compiles a child comparing the bumped sprite's brain with its own sprite's", () => {
    const { codes } = arcadeChainCompile([bump], [], {
      when: [bumped, brainOf, equalTo, myself, brainOf],
      act: [move],
    });

    assert.deepEqual(codes, []);
  });

  const add = `${OPERATOR_ENTRY_PREFIX}${CoreOpId.Add}`;
  const subtract = `${OPERATOR_ENTRY_PREFIX}${CoreOpId.Subtract}`;
  const multiply = `${OPERATOR_ENTRY_PREFIX}${CoreOpId.Multiply}`;

  it("offers addition, subtraction, multiplication, equality and inequality after a position", () => {
    for (const operator of [add, subtract, multiply, equalTo, notEqualTo]) {
      assert.ok(arcadeOffersLiteral(operator, [myself, position]), operator);
    }
  });

  it("binds multiply over a position and a number on its right alone, and no division over a position", () => {
    const vector2 = mkTypeId(NativeType.Struct, "Vector2");
    assert.equal(arcadeOperatorResultType(CoreOpId.Multiply, [vector2, CoreTypeIds.Number]), vector2);
    assert.equal(arcadeOperatorResultType(CoreOpId.Multiply, [CoreTypeIds.Number, vector2]), undefined);
    assert.equal(arcadeOperatorResultType(CoreOpId.Multiply, [vector2, vector2]), undefined);
    assert.equal(arcadeOperatorResultType(CoreOpId.Divide, [vector2, CoreTypeIds.Number]), undefined);
  });

  it("compiles the bumped sprite's position set to itself plus its distance from myself's", () => {
    const shove = [bumped, position, ASSIGN, bumped, position, add, OPEN_PAREN, bumped, position, subtract];
    assert.deepEqual(arcadeImageRuleDiagnosticCodes([bump], [...shove, myself, position, CLOSE_PAREN]), []);
  });

  for (const [sentence, act] of [
    [
      "myself's position set to itself times a number",
      [myself, position, ASSIGN, myself, position, multiply, NUMBER_LITERAL],
    ],
    [
      "a move toward the bumped sprite's position minus myself's",
      [move, toward, bumped, position, subtract, myself, position],
    ],
  ] as const) {
    it(`compiles ${sentence}`, () => {
      assert.deepEqual(arcadeImageRuleDiagnosticCodes([bump], [...act]), []);
    });
  }

  it("compiles a child comparing myself's position with the bumped sprite's", () => {
    const { codes } = arcadeChainCompile([bump], [], {
      when: [myself, position, equalTo, bumped, position],
      act: [myself, imageOf, ASSIGN, IMAGE_LITERAL],
    });

    assert.deepEqual(codes, []);
  });

  it("refuses a number times a position: no multiplication overload takes a number first", () => {
    assert.deepEqual(
      arcadeImageRuleDiagnosticCodes([], [myself, position, ASSIGN, NUMBER_LITERAL, multiply, myself, position]),
      [TypeDiagCode.NoOverloadForBinaryOp]
    );
  });

  it("refuses a dpad given one direction modifier twice", (t) => {
    const warn = t.mock.method(console, "warn", () => {});
    const codes = arcadeCompileDiagnosticCodes(ARCADE_REFUSED_SOURCE);
    assert.ok(codes.includes(ParseDiagCode.UnexpectedExpressionAfterExpression));
    assert.ok(codes.includes(CompilationDiagCode.UncompilableExpressionDropped));
    assert.equal(warn.mock.callCount(), 1, "the compiler warns once of the expression it drops");
  });

  const home = `${VARIABLE_ENTRY_PREFIX}Vector2.home`;
  const held = `${VARIABLE_ENTRY_PREFIX}Sprite.held`;
  const xOf = `${ACCESSOR_ENTRY_PREFIX}Vector2.x`;

  it("binds a variable factory for Sprite, Vector2 and Player alone, each producing its own type", () => {
    assert.deepEqual(arcadeVariableFactories(), [
      { name: "Vector2", produces: mkTypeId(NativeType.Struct, "Vector2") },
      { name: "Sprite", produces: mkTypeId(NativeType.Struct, "Sprite") },
      { name: "Image", produces: undefined },
      { name: "Brain", produces: undefined },
      { name: "Player", produces: mkTypeId(NativeType.Struct, "Player") },
      { name: "Effect", produces: undefined },
      { name: "Sound", produces: undefined },
      { name: "ParticleEffect", produces: undefined },
    ]);
  });

  it("offers the sprite and position variable factories at the head of a DO side and as the move's target once toward is placed", () => {
    for (const factory of [`${FACTORY_ENTRY_PREFIX}Sprite`, `${FACTORY_ENTRY_PREFIX}Vector2`]) {
      assert.ok(arcadeOffersLiteral(factory, [], []), `${factory} at the head of a DO side`);
      assert.ok(arcadeOffersLiteral(factory, [], [move, toward]), `${factory} as the move's target`);
    }
    assert.ok(!arcadeOffersLiteral(`${FACTORY_ENTRY_PREFIX}Image`, [], []));
  });

  it("shows each variable factory and each variable it mints with its type's icon as their face", () => {
    const faces = arcadeVariableFaces();

    assert.deepEqual(
      faces.map((face) => face.name),
      ["Vector2", "Sprite", "Player"]
    );
    for (const face of faces) {
      assert.notEqual(face.typeIcon, undefined, face.name);
      assert.equal(face.factoryFace, face.typeIcon, face.name);
      assert.equal(face.variableFace, face.typeIcon, face.name);
    }
  });

  it("names each labelled type by the label its catalog entry carries in the editor's config, and on its factory where it has one", () => {
    const names = arcadeTypeNames();

    assert.deepEqual(
      names.map((entry) => [entry.name, entry.variableFactory]),
      [
        ["Vector2", true],
        ["Sprite", true],
        ["Image", false],
        ["Player", true],
        ["Effect", false],
        ["Sound", false],
        ["ParticleEffect", false],
      ]
    );
    for (const entry of names) {
      assert.equal(entry.factoryLabel, entry.variableFactory ? entry.carried : undefined, entry.name);
      assert.equal(entry.named, entry.carried, entry.name);
    }
  });

  for (const [sentence, act] of [
    ["$home = myself's position", [home, ASSIGN, myself, position]],
    ["move toward $home", [move, toward, home]],
    ["$held = myself", [held, ASSIGN, myself]],
    ["move toward $held", [move, toward, held]],
    ["$held's image = myself's image", [held, imageOf, ASSIGN, myself, imageOf]],
    ["$home = $home plus myself's position", [home, ASSIGN, home, add, myself, position]],
    ["$home's x = a number", [home, xOf, ASSIGN, NUMBER_LITERAL]],
    ["$held's position's x = a number", [held, position, xOf, ASSIGN, NUMBER_LITERAL]],
  ] as const) {
    it(`compiles ${sentence}`, () => {
      assert.deepEqual(arcadeImageRuleDiagnosticCodes([], [...act]), []);
    });
  }

  it("compiles a WHEN reading x through $held's position", () => {
    const { codes, bytecode } = arcadeChainCompile([held, position, xOf], [move, toward, held], { when: [], act: [] });

    assert.deepEqual(codes, []);
    assert.notEqual(bytecode, undefined);
  });

  it("reads a position variable nothing wrote as origin, its own copy, through accessor chains, without a fault", () => {
    const { values, faults } = arcadeVariableRun(
      [
        { when: [], act: [`${VARIABLE_ENTRY_PREFIX}number.x`, ASSIGN, home, xOf] },
        { when: [], act: [`${VARIABLE_ENTRY_PREFIX}number.y`, ASSIGN, home, yOf] },
        { when: [home], act: [`${VARIABLE_ENTRY_PREFIX}number.fired`, ASSIGN, NUMBER_LITERAL] },
      ],
      ["x", "y", "fired", "home"],
      2
    );
    const [x, y, fired, start] = values;

    assert.equal(faults, 0);
    assert.deepEqual([x, y], [mkNumberValue(0), mkNumberValue(0)]);
    assert.deepEqual(fired, mkNumberValue(40), "a WHEN holding the position variable fires from the first think");
    assert.equal(start?.t, NativeType.Struct);
  });

  it("reads a sprite variable nothing wrote as nil, through accessor chains and a WHEN, without a fault", () => {
    const { values, faults } = arcadeVariableRun(
      [
        { when: [], act: [`${VARIABLE_ENTRY_PREFIX}Vector2.copy`, ASSIGN, held, position] },
        { when: [held, position, xOf], act: [`${VARIABLE_ENTRY_PREFIX}number.fired`, ASSIGN, NUMBER_LITERAL] },
      ],
      ["copy", "fired", "held"],
      2
    );
    const [copy, fired, unheld] = values;

    assert.equal(faults, 0);
    assert.equal(copy?.t, NativeType.Nil);
    assert.deepEqual(fired, mkNumberValue(0), "the gated rule never wrote its number variable past its starting 0");
    assert.equal(unheld, undefined);
  });

  it("offers the assignment after a position variable's x", () => {
    assert.ok(arcadeOffersLiteral(ASSIGN, [], [home, xOf]));
  });

  it("writes the x of a position variable nothing wrote, from origin, with no assignment first", () => {
    const { values, faults } = arcadeVariableRun(
      [
        { when: [], act: [home, xOf, ASSIGN, NUMBER_LITERAL] },
        { when: [], act: [`${VARIABLE_ENTRY_PREFIX}number.homeX`, ASSIGN, home, xOf] },
        { when: [], act: [`${VARIABLE_ENTRY_PREFIX}number.homeY`, ASSIGN, home, yOf] },
      ],
      ["homeX", "homeY"],
      2
    );

    assert.equal(faults, 0);
    assert.deepEqual(values, [mkNumberValue(40), mkNumberValue(0)]);
  });

  const origin = `${LITERAL_ENTRY_PREFIX}Vector2.origin`;

  it("offers origin as a move's target and as a position variable's whole new position", () => {
    assert.ok(arcadeOffersLiteral(origin, [], [move, toward]));
    assert.ok(arcadeOffersLiteral(origin, [], [home, ASSIGN]));
  });

  it("starts a position variable from origin, its writes leaving origin itself at 0 on every later think", () => {
    const { values, faults } = arcadeVariableRun(
      [
        { when: [], act: [home, ASSIGN, origin] },
        { when: [], act: [home, xOf, ASSIGN, NUMBER_LITERAL] },
        { when: [], act: [`${VARIABLE_ENTRY_PREFIX}number.originX`, ASSIGN, origin, xOf] },
        { when: [], act: [`${VARIABLE_ENTRY_PREFIX}number.homeX`, ASSIGN, home, xOf] },
        { when: [], act: [`${VARIABLE_ENTRY_PREFIX}number.homeY`, ASSIGN, home, yOf] },
      ],
      ["originX", "homeX", "homeY"],
      2
    );

    assert.equal(faults, 0);
    assert.deepEqual(values, [mkNumberValue(0), mkNumberValue(40), mkNumberValue(0)]);
  });

  it("neither offers nor takes an assignment to origin's x, its root a literal and its field plain", (t) => {
    t.mock.method(console, "warn", () => {});
    assert.equal(arcadeOffersLiteral(ASSIGN, [], [origin, xOf]), false);
    assert.ok(
      arcadeImageRuleDiagnosticCodes([], [origin, xOf, ASSIGN, NUMBER_LITERAL]).includes(
        ParseDiagCode.ReadOnlyResultFieldAssignment
      )
    );
  });

  it("writes a created variable into the brain's own source by name and type, and reads it back alike", () => {
    const { written, read } = arcadeVariableSource([home, ASSIGN, myself, position]);

    assert.equal(written.length, 1);
    assert.deepEqual(Object.keys(written[0] ?? {}), ["version", "kind", "varName", "varType", "uniqueId"]);
    assert.equal(written[0]?.varName, "home");
    assert.equal(written[0]?.varType, mkTypeId(NativeType.Struct, "Vector2"));
    assert.deepEqual(read, [{ varName: "home", varType: mkTypeId(NativeType.Struct, "Vector2") }]);
  });

  const playerOne = `${LITERAL_ENTRY_PREFIX}Player.1`;
  const playerTwo = `${LITERAL_ENTRY_PREFIX}Player.2`;
  const scoreOf = `${ACCESSOR_ENTRY_PREFIX}Player.score`;
  const addScore = "actuator.arcade.add-score";
  const dpad = "sensor.arcade.dpad";
  const greaterThan = `${OPERATOR_ENTRY_PREFIX}${CoreOpId.GreaterThan}`;

  it("offers a player at the dpad and at add score, and score after a player", () => {
    assert.ok(arcadeOffersLiteral(playerTwo, [dpad]));
    assert.ok(arcadeOffersLiteral(playerTwo, [], [addScore]));
    assert.ok(arcadeOffersLiteral(scoreOf, [], [playerOne]));
  });

  for (const [sentence, when, act] of [
    ["a WHEN reading player one's score", [playerOne, scoreOf, greaterThan, NUMBER_LITERAL], [move]],
    ["a bare add score", [], [addScore]],
    ["add score given a number, then a player", [], [addScore, NUMBER_LITERAL, playerTwo]],
    ["add score given a player, then a number", [], [addScore, playerTwo, NUMBER_LITERAL]],
    ["add score given player one's score as its amount", [], [addScore, playerOne, scoreOf]],
    [
      "a dpad given player two among its direction modifiers",
      [dpad, up, playerTwo, `${MODIFIER_ENTRY_PREFIX}direction.left`],
      [move],
    ],
  ] as const) {
    it(`compiles ${sentence}`, () => {
      assert.deepEqual(arcadeImageRuleDiagnosticCodes([...when], [...act]), []);
    });
  }

  it("refuses add score given two numbers or two players", (t) => {
    t.mock.method(console, "warn", () => {});
    for (const act of [
      [addScore, NUMBER_LITERAL, NUMBER_LITERAL],
      [addScore, playerTwo, playerOne],
    ]) {
      assert.ok(
        arcadeImageRuleDiagnosticCodes([], act).includes(ParseDiagCode.UnexpectedExpressionAfterExpression),
        act.join(" ")
      );
    }
  });

  const playerVariable = `${VARIABLE_ENTRY_PREFIX}Player.player`;

  it("offers a player variable at the dpad, and equality and inequality after one", () => {
    assert.ok(arcadeOffersLiteral(`${FACTORY_ENTRY_PREFIX}Player`, [dpad]));
    assert.ok(arcadeOffersLiteral(equalTo, [playerVariable]));
    assert.ok(arcadeOffersLiteral(notEqualTo, [playerVariable]));
  });

  for (const [sentence, when, act] of [
    ["a dpad given a player variable", [dpad, playerVariable], [move]],
    ["a WHEN comparing a player variable equal to player one", [playerVariable, equalTo, playerOne], [move]],
    ["a WHEN comparing a player variable unequal to player one", [playerVariable, notEqualTo, playerOne], [move]],
    ["a WHEN comparing player two equal to player one", [playerTwo, equalTo, playerOne], [move]],
  ] as const) {
    it(`compiles ${sentence}`, () => {
      assert.deepEqual(arcadeImageRuleDiagnosticCodes([...when], [...act]), []);
    });
  }

  it("offers and takes an assignment to a player's score, its field routed though its player is a literal", () => {
    assert.equal(arcadeOffersLiteral(ASSIGN, [], [playerOne, scoreOf]), true);
    assert.deepEqual(arcadeImageRuleDiagnosticCodes([], [playerOne, scoreOf, ASSIGN, NUMBER_LITERAL]), []);
  });

  const gameOver = "actuator.arcade.game-over";
  const win = `${MODIFIER_ENTRY_PREFIX}outcome.win`;
  const lose = `${MODIFIER_ENTRY_PREFIX}outcome.lose`;
  const confetti = `${LITERAL_ENTRY_PREFIX}Effect.confetti`;
  const hearts = `${LITERAL_ENTRY_PREFIX}Effect.hearts`;
  const powerUp = `${LITERAL_ENTRY_PREFIX}Sound.powerUp`;
  const jumpUp = `${LITERAL_ENTRY_PREFIX}Sound.jumpUp`;

  it("offers an effect, a sound and a player at game over, and a sound after an effect and win", () => {
    assert.ok(arcadeOffersLiteral(confetti, [], [gameOver]));
    assert.ok(arcadeOffersLiteral(powerUp, [], [gameOver]));
    assert.ok(arcadeOffersLiteral(playerTwo, [], [gameOver]));
    assert.ok(arcadeOffersLiteral(powerUp, [], [gameOver, confetti, win]));
  });

  for (const [sentence, act] of [
    ["a bare game over", [gameOver]],
    ["game over given win", [gameOver, win]],
    ["game over given lose, a player, an effect and a sound", [gameOver, lose, playerTwo, confetti, powerUp]],
    ["game over given a sound, win, then an effect", [gameOver, powerUp, win, confetti]],
    ["game over given an effect, a player, then lose", [gameOver, confetti, playerTwo, lose]],
  ] as const) {
    it(`compiles ${sentence}`, () => {
      assert.deepEqual(arcadeImageRuleDiagnosticCodes([], [...act]), []);
    });
  }

  it("refuses game over given both win and lose, two effects, two sounds or two players", (t) => {
    t.mock.method(console, "warn", () => {});
    for (const act of [
      [gameOver, win, lose],
      [gameOver, confetti, hearts],
      [gameOver, powerUp, jumpUp],
      [gameOver, playerTwo, playerOne],
    ]) {
      assert.ok(
        arcadeImageRuleDiagnosticCodes([], act).includes(ParseDiagCode.UnexpectedExpressionAfterExpression),
        act.join(" ")
      );
    }
  });

  const destroy = "actuator.arcade.destroy";
  const duration = `${PARAMETER_ENTRY_PREFIX}duration`;
  const confettiBurst = `${LITERAL_ENTRY_PREFIX}ParticleEffect.confetti`;
  const fireBurst = `${LITERAL_ENTRY_PREFIX}ParticleEffect.fire`;

  it("offers a sprite, a particle effect and the duration at destroy, and no game-over effect", () => {
    assert.ok(arcadeOffersLiteral(bumped, [bump], [destroy]));
    assert.ok(arcadeOffersLiteral(confettiBurst, [], [destroy]));
    assert.ok(arcadeOffersLiteral(duration, [], [destroy, confettiBurst]));
    assert.equal(arcadeOffersLiteral(confetti, [], [destroy]), false);
  });

  for (const [sentence, act] of [
    ["a bare destroy", [destroy]],
    ["destroy given the bumped sprite", [destroy, bumped]],
    ["destroy given a particle effect and a duration", [destroy, confettiBurst, duration, NUMBER_LITERAL]],
    [
      "destroy given a duration, the bumped sprite, then a particle effect",
      [destroy, duration, NUMBER_LITERAL, bumped, fireBurst],
    ],
  ] as const) {
    it(`compiles ${sentence}`, () => {
      assert.deepEqual(arcadeImageRuleDiagnosticCodes([bump], [...act]), []);
    });
  }

  it("projects destroy given the bumped sprite, a particle effect and a duration with the words its catalog entries carry, the duration read by its slot's form", () => {
    const wordOf = (tileName: string) => arcadeCarriedTileLanguage(tileName)?.form ?? arcadeCarriedTileLabel(tileName);
    const durationWords = arcadeCarriedSlotLanguage(destroy, "parameter.duration");
    const { words } = arcadeRuleSentence([bump], [destroy, bumped, confettiBurst, duration, NUMBER_LITERAL]);

    assert.notEqual(durationWords?.form, undefined, "the arcade base pack declares a form on the duration slot");
    assert.deepEqual(
      words.map((word) => word.text),
      [
        wordOf(bump),
        arcadeCarriedTileLanguage(bump)?.bare,
        wordOf(destroy),
        arcadeSpriteOutputLabels("bumped").carried,
        confettiBurst.slice(confettiBurst.lastIndexOf(".") + 1),
        durationWords?.form,
        "40",
      ]
    );
  });

  it("refuses destroy given two sprites, two particle effects or a game-over effect", (t) => {
    t.mock.method(console, "warn", () => {});
    for (const act of [
      [destroy, bumped, `${SENSOR_ENTRY_PREFIX}sensor.arcade.myself`],
      [destroy, confettiBurst, fireBurst],
      [destroy, confetti],
    ]) {
      assert.notDeepEqual(arcadeImageRuleDiagnosticCodes([bump], act), [], act.join(" "));
    }
  });

  const say = "actuator.arcade.say";

  it("offers the duration at say", () => {
    assert.ok(arcadeOffersLiteral(duration, [], [say]));
    assert.ok(arcadeOffersLiteral(duration, [], [say, TEXT_LITERAL]));
  });

  for (const [sentence, when, act] of [
    ["a bare say under bump", [bump], [say]],
    ["a bare say under player one's score", [playerOne, scoreOf], [say]],
    ["say given a text", [bump], [say, TEXT_LITERAL]],
    ["say given a text and a duration", [bump], [say, TEXT_LITERAL, duration, NUMBER_LITERAL]],
    ["say given a duration, then a text", [bump], [say, duration, NUMBER_LITERAL, TEXT_LITERAL]],
    ["say given a text variable", [], [say, `${VARIABLE_ENTRY_PREFIX}string.motto`]],
  ] as const) {
    it(`compiles ${sentence}`, () => {
      assert.deepEqual(arcadeImageRuleDiagnosticCodes([...when], [...act]), []);
    });
  }

  it("declares say's duration as destroy's: the shared duration tile, one label and one set of words", () => {
    assert.deepEqual(arcadeBindingDiagnosticCodes(), []);
    assert.equal(
      arcadeCarriedSlotLabel(say, "parameter.duration"),
      arcadeCarriedSlotLabel(destroy, "parameter.duration")
    );
    assert.deepEqual(
      arcadeCarriedSlotLanguage(say, "parameter.duration"),
      arcadeCarriedSlotLanguage(destroy, "parameter.duration")
    );
  });

  it("projects say bare, given a text, and given a text and a duration with the words its catalog entries carry", () => {
    const sayWord = arcadeCarriedTileLanguage(say)?.form ?? arcadeCarriedTileLabel(say);
    const durationWords = arcadeCarriedSlotLanguage(say, "parameter.duration");
    const textOf = (act: string[]) => arcadeRuleSentence([], act).words.map((word) => word.text);

    const said = textOf([say, TEXT_LITERAL]);
    const timed = textOf([say, TEXT_LITERAL, duration, NUMBER_LITERAL]);

    assert.deepEqual(textOf([say]), [sayWord]);
    assert.equal(said.length, 2);
    assert.equal(said[0], sayWord);
    assert.ok(said[1]?.includes("ouch"), "the text literal's word carries its text");
    assert.deepEqual(timed, [sayWord, said[1], durationWords?.form, "40"]);
  });

  it("refuses say given two texts, two durations or a sprite", (t) => {
    t.mock.method(console, "warn", () => {});
    for (const act of [
      [say, TEXT_LITERAL, TEXT_LITERAL],
      [say, duration, NUMBER_LITERAL, duration, NUMBER_LITERAL],
      [say, bumped],
    ]) {
      assert.notDeepEqual(arcadeImageRuleDiagnosticCodes([bump], act), [], act.join(" "));
    }
  });
});
