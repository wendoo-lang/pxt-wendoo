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
 * the tile name `sensor.beacon.reading`, which the other pack claims too, and
 * gives the core AND tile and the core number type icons, which the other
 * pack does too.
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

  /** Catalog metadata of the `Beacon` type, sample values the catalog assertions pin. */
  const beaconMeta = new wendoo.CatalogMeta();
  beaconMeta.label = "Beacon";
  beaconMeta.docs = "# Beacon\n\nA beacon at a fixed position, read through its field hooks.";
  beaconMeta.icon = "beacon";

  /** The `x` field, its accessor tile carrying sample metadata the catalog assertions pin. */
  const xField = wendoo.withAccessor(wendoo.field("x", wendoo.TYPE_NUMBER), "beacon x", "beacon-x");
  xField.accessor.docs = "# Beacon x";

  /** The `y` field, its accessor tile carrying an icon the selftest's encoder refuses to render. */
  const yField = wendoo.withAccessor(wendoo.field("y", wendoo.TYPE_NUMBER), undefined, "unencodable");

  pack.defineStruct("Beacon", [xField, yField], new BeaconTypeBinding(), beaconMeta);

  /**
   * Declared shape of the reading tile, with a named output, sample metadata,
   * sentence words included, and both sensor flags, the catalog assertions
   * pin.
   */
  const readingSpec = new wendoo.TileSpec(wendoo.TILE_KIND_SENSOR, [], wendoo.TYPE_STRING);
  readingSpec.inline = true;
  readingSpec.writableResult = true;
  readingSpec.outputs = [wendoo.output("position", "Beacon")];
  readingSpec.label = "beacon reading";
  readingSpec.group = "Beacons";
  readingSpec.docs = '# Beacon reading\n\nReads the name of the pack whose "reading" tile stands.';
  readingSpec.icon = "beacon-reading";
  readingSpec.language = wendoo.tileLanguage("near", wendoo.SENTENCE_FRAME_STATE, "a beacon");
  pack.bind("sensor.beacon.reading", new ReadingSensor(), readingSpec);

  pack.bindOperator(
    "beacon.combine",
    new CombineOperator(),
    new wendoo.OperatorSpec([wendoo.TYPE_NUMBER, wendoo.TYPE_NUMBER], wendoo.TYPE_NUMBER)
  );

  /** A sample icon for the core AND tile, which the catalog assertions pin. */
  pack.defineCoreTileIcon("tile.op->and", "beacon-and");

  /** A sample icon for the core number type, which the catalog assertions pin. */
  pack.defineCoreTypeIcon("number", "beacon-number");
}
