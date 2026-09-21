/*
 * Test-only vocabulary: `gen-selftest.js` writes this file into a generated
 * pack extension that the registration selftest project depends on. Nothing
 * here is product surface, and no id it is given outlives the selftest run.
 */

/**
 * One of the two packs the registration selftest composes: a beacon that
 * reports its position and identifies the pack its reading tile came from.
 *
 * Every registration is made from this file's top-level code, which pxt runs
 * at program start, before the selftest constructs anything. The pack claims
 * the tile name `sensor.beacon.reading`, which the other pack claims too.
 */
namespace beacon {
  /** Position of the `Beacon` type's `x` field in its declaration, which indexes the binding's field ids. */
  const BEACON_FIELD_X = 0;

  /** Position of the `Beacon` type's `y` field in its declaration, which indexes the binding's field ids. */
  const BEACON_FIELD_Y = 1;

  /** `x` field value of the beacon this pack registers. */
  const BEACON_X = 3;

  /** `y` field value of the beacon this pack registers. */
  const BEACON_Y = 4;

  /** The host object every `Beacon` value reads through. */
  class BeaconPosition {
    /** Current `x` field value. */
    x: number;
    /** Current `y` field value. */
    y: number;

    constructor(x: number, y: number) {
      this.x = x;
      this.y = y;
    }
  }

  /** The one position every `Beacon` value of this pack reads. */
  const position = new BeaconPosition(BEACON_X, BEACON_Y);

  /**
   * The `Beacon` type: reads its fields from the host object behind the
   * value, and registers no field setter although its fields are writable.
   */
  class BeaconTypeBinding extends wendoo.StructTypeBinding {
    constructor() {
      super();
      this.hasFieldGetter = true;
    }

    fieldGetter(source: wendoo.Value, fieldId: number, ctx: wendoo.ExecutionContext): wendoo.Value {
      if (fieldId === this.fieldIds[BEACON_FIELD_X]) {
        return wendoo.mkNumber(position.x);
      }
      if (fieldId === this.fieldIds[BEACON_FIELD_Y]) {
        return wendoo.mkNumber(position.y);
      }
      return undefined;
    }
  }

  /** `sensor.beacon.reading`: the name of the pack whose registration of this tile stands. */
  class ReadingSensor extends wendoo.HostActionBinding {
    constructor() {
      super(false);
    }

    execSync(ctx: wendoo.ExecutionContext, args: wendoo.Value[]): wendoo.Value {
      return wendoo.mkString(PACK_NAME);
    }
  }

  /** `beacon.combine`: the sum of its two number operands; nil when an operand carries no number. */
  class CombineOperator extends wendoo.HostFunction {
    exec(ctx: wendoo.ExecutionContext, args: wendoo.Value[]): wendoo.Value {
      if (args.length < 2 || args[0].t !== wendoo.ValueTag.Number || args[1].t !== wendoo.ValueTag.Number) {
        return wendoo.NIL_VALUE;
      }
      return wendoo.mkNumber(args[0].num + args[1].num);
    }
  }

  /** Name this pack's registrations are diagnosed under, and the value its reading tile returns. */
  export const PACK_NAME = "beacon";

  const pack = wendoo.pack(PACK_NAME);
  pack.defineStruct("Beacon", ["x", "y"], new BeaconTypeBinding());
  pack.bind("sensor.beacon.reading", new ReadingSensor());
  pack.bindOperator("beacon.combine", new CombineOperator());
}
