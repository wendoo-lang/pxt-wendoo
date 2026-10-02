/*
 * Test-only vocabulary: `gen-selftest.js` writes this file into a generated
 * pack extension that the registration selftest project depends on. Nothing
 * here is product surface, and no id it is given outlives the selftest run.
 */

/**
 * The third pack the registration selftest composes: tiles whose argument
 * grammars use every call-spec construct and every argument option, a tile
 * one parameter tile fills twice, and tiles whose grammars contradict
 * themselves.
 *
 * Every registration is made from this file's top-level code, which pxt runs
 * at program start. The five well-formed tiles are registered and catalogued;
 * each of the rest breaks one rule a call spec is held to, and is expected to
 * be diagnosed and ignored.
 */
namespace grammar {
  /** A synchronous binding whose body returns void; the selftest never executes it. */
  class IdleBinding extends wendoo.HostActionBinding {
    constructor() {
      super(false);
    }

    execSync(ctx: wendoo.ExecutionContext, args: wendoo.Value[]): wendoo.Value {
      return wendoo.VOID_VALUE;
    }
  }

  /** Name this pack's registrations are diagnosed under. */
  export const PACK_NAME = "grammar";

  const pack = wendoo.pack(PACK_NAME);

  /** A modifier that may be left out. */
  function optionalModifier(name: string): wendoo.TileArgSpec {
    return wendoo.optional(wendoo.modifier(name));
  }

  /** Bind `name` as an actuator whose argument grammar is `args`. */
  function bindActuator(name: string, args: wendoo.TileArgSpec[]): void {
    pack.bind(name, new IdleBinding(), new wendoo.TileSpec(wendoo.TILE_KIND_ACTUATOR, args, ""));
  }

  /** A number slot filled by the `amount` tile, named `amount`. */
  function namedAmount(): wendoo.ArgSlotSpec {
    const slot = wendoo.arg("amount", wendoo.TYPE_NUMBER);
    slot.name = "amount";
    return slot;
  }

  /** A number slot filled by the `amount` tile, whose empty value is `amount`. */
  function amountWithDefault(amount: number): wendoo.ArgSlotSpec {
    const slot = wendoo.arg("amount", wendoo.TYPE_NUMBER);
    slot.defaultValue = wendoo.mkNumber(amount);
    return slot;
  }

  // A bag of optional modifiers: every item has a flat form.
  pack.bind(
    "sensor.grammar.pad",
    new IdleBinding(),
    new wendoo.TileSpec(
      wendoo.TILE_KIND_SENSOR,
      [optionalModifier("up"), optionalModifier("down"), optionalModifier("left"), optionalModifier("right")],
      wendoo.TYPE_NUMBER
    )
  );

  // A derived anonymous slot, and a choice of bounded repeats against a slot
  // carrying a default, a unit and a one-sided range; the tile consumes a
  // number WHEN result.
  const direction = wendoo.arg("direction", wendoo.TYPE_NUMBER);
  direction.anonymous = true;
  direction.derived = true;
  const speed = wendoo.arg("speed", wendoo.TYPE_NUMBER);
  speed.defaultValue = wendoo.mkNumber(100);
  speed.unit = "px/s";
  speed.range = wendoo.argRangeAtLeast(0, wendoo.ARG_ON_EXCEED_CLAMP);
  const moveSpec = new wendoo.TileSpec(
    wendoo.TILE_KIND_ACTUATOR,
    [
      wendoo.optional(direction),
      wendoo.optional(
        wendoo.choice([
          wendoo.repeatedUpTo(wendoo.modifier("slowly"), 1, 3),
          wendoo.repeatedUpTo(wendoo.modifier("quickly"), 1, 3),
          speed,
        ])
      ),
    ],
    ""
  );
  moveSpec.consumesWhenResult = wendoo.TYPE_NUMBER;
  pack.bind("actuator.grammar.move", new IdleBinding(), moveSpec);

  // A named sequence, a named choice, a conditional on that choice with an
  // else branch, both declared requirement states, a two-sided wrapping range,
  // and a range on a text slot that declares no default.
  const text = wendoo.arg("text", wendoo.TYPE_STRING);
  text.setRequired(true);
  const pitch = wendoo.arg("pitch", wendoo.TYPE_NUMBER);
  pitch.range = wendoo.argRange(-12, 12, wendoo.ARG_ON_EXCEED_WRAP);
  const words = wendoo.seq([text, wendoo.optional(pitch)]);
  words.name = "words";
  const volume = wendoo.choice([wendoo.modifier("loudly"), wendoo.modifier("softly")]);
  volume.name = "volume";
  const echo = wendoo.arg("echo", wendoo.TYPE_BOOLEAN);
  echo.setRequired(false);
  echo.defaultValue = wendoo.mkBoolean(true);
  const label = wendoo.arg("label", wendoo.TYPE_STRING);
  label.range = wendoo.argRangeAtMost(3, wendoo.ARG_ON_EXCEED_DROP);
  bindActuator("actuator.grammar.chant", [
    words,
    wendoo.optional(volume),
    wendoo.conditional("volume", echo, wendoo.repeated(wendoo.modifier("again"), 0)),
    wendoo.optional(label),
  ]);

  // One optional slot per kind of default value; every item has a flat form.
  const ratio = wendoo.arg("ratio", wendoo.TYPE_NUMBER);
  ratio.defaultValue = wendoo.mkNumber(0.25);
  ratio.range = wendoo.argRange(0, 1.5, wendoo.ARG_ON_EXCEED_CLAMP);
  const greeting = wendoo.arg("greeting", wendoo.TYPE_STRING);
  greeting.defaultValue = wendoo.mkString("caf\u00e9");
  const flag = wendoo.arg("flag", wendoo.TYPE_BOOLEAN);
  flag.defaultValue = wendoo.mkBoolean(false);
  const nothing = wendoo.arg("nothing", wendoo.TYPE_NIL);
  nothing.defaultValue = wendoo.NIL_VALUE;
  const mood = wendoo.arg("mood", "Mood");
  mood.defaultValue = wendoo.mkEnum("enum:<Mood>", "happy");
  const spot = wendoo.arg("spot", "Beacon");
  spot.defaultValue = wendoo.mkStruct(wendoo.structTypeId("Beacon"), [wendoo.mkNumber(1), wendoo.mkNumber(2)]);
  const steps = wendoo.arg("steps", wendoo.TYPE_ANY);
  steps.defaultValue = wendoo.mkList("list:<number>", [wendoo.mkNumber(1), wendoo.mkNumber(2)]);
  const pending = wendoo.arg("pending", wendoo.TYPE_ANY);
  pending.defaultValue = wendoo.mkHandle(7);
  pack.bind(
    "sensor.grammar.defaults",
    new IdleBinding(),
    new wendoo.TileSpec(
      wendoo.TILE_KIND_SENSOR,
      [
        wendoo.optional(ratio),
        wendoo.optional(greeting),
        wendoo.optional(flag),
        wendoo.optional(nothing),
        wendoo.optional(mood),
        wendoo.optional(spot),
        wendoo.optional(steps),
        wendoo.optional(pending),
      ],
      wendoo.TYPE_STRING
    )
  );

  // One shared parameter tile filling two slots, told apart by their names.
  const from = wendoo.arg("parameter.grammar.place", wendoo.TYPE_NUMBER);
  from.name = "from";
  const to = wendoo.arg("parameter.grammar.place", wendoo.TYPE_NUMBER);
  to.name = "to";
  bindActuator("actuator.grammar.travel", [wendoo.seq([from, to])]);

  // A slot declaring both a default and that the action derives its value.
  const defaultAndDerived = amountWithDefault(1);
  defaultAndDerived.derived = true;
  bindActuator("actuator.grammar.default-and-derived", [wendoo.optional(defaultAndDerived)]);

  // A required slot declaring a default.
  const requiredWithDefault = amountWithDefault(1);
  requiredWithDefault.setRequired(true);
  bindActuator("actuator.grammar.required-with-default", [requiredWithDefault]);

  // A required slot declaring that the action derives its value.
  const requiredWithDerived = wendoo.arg("amount", wendoo.TYPE_NUMBER);
  requiredWithDerived.setRequired(true);
  requiredWithDerived.derived = true;
  bindActuator("actuator.grammar.required-with-derived", [requiredWithDerived]);

  // A range carrying neither bound.
  const unbounded = wendoo.arg("amount", wendoo.TYPE_NUMBER);
  unbounded.range = new wendoo.ArgRange(false, 0, false, 0, wendoo.ARG_ON_EXCEED_CLAMP);
  bindActuator("actuator.grammar.range-unbounded", [unbounded]);

  // A range whose min is above its max.
  const inverted = wendoo.arg("amount", wendoo.TYPE_NUMBER);
  inverted.range = wendoo.argRange(5, 1, wendoo.ARG_ON_EXCEED_CLAMP);
  bindActuator("actuator.grammar.range-inverted", [inverted]);

  // A range on a slot whose default is text.
  const nonNumeric = wendoo.arg("amount", wendoo.TYPE_STRING);
  nonNumeric.defaultValue = wendoo.mkString("lots");
  nonNumeric.range = wendoo.argRangeAtLeast(0, wendoo.ARG_ON_EXCEED_CLAMP);
  bindActuator("actuator.grammar.range-non-numeric", [nonNumeric]);

  // A nested choice named like a slot elsewhere in the same grammar.
  const shadowing = wendoo.choice([wendoo.modifier("loudly"), wendoo.modifier("softly")]);
  shadowing.name = "amount";
  bindActuator("actuator.grammar.duplicate-name", [namedAmount(), wendoo.optional(shadowing)]);

  // A grammar breaking both a slot rule and the name rule: the name rule is checked first.
  const contradicted = amountWithDefault(1);
  contradicted.name = "amount";
  contradicted.derived = true;
  bindActuator("actuator.grammar.names-checked-first", [contradicted, namedAmount()]);
}
