/*
 * Test-only vocabulary: `gen-selftest.js` writes this file into a generated
 * pack extension that the registration selftest project depends on. Nothing
 * here is product surface, and no id it is given outlives the selftest run.
 */

/**
 * The second of the two packs the registration selftest composes: a chime
 * that can be rung.
 *
 * Every registration is made from this file's top-level code, which pxt runs
 * at program start, before the selftest constructs anything. Two of the three
 * registrations cannot be honoured: one claims the tile name the other pack
 * claims, and one claims a name the project's mapping records no id for.
 */
namespace chime {
  /** `actuator.chime.ring`: rings the chime, counting the rings. */
  class RingActuator extends wendoo.HostActionBinding {
    /** How many times the chime has been rung. */
    rings: number = 0;

    constructor() {
      super(false);
    }

    execSync(ctx: wendoo.ExecutionContext, args: wendoo.Value[]): wendoo.Value {
      this.rings++;
      return wendoo.VOID_VALUE;
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

  /** `sensor.chime.unmapped`: reads how loud the chime is. */
  class LoudnessSensor extends wendoo.HostActionBinding {
    constructor() {
      super(false);
    }

    execSync(ctx: wendoo.ExecutionContext, args: wendoo.Value[]): wendoo.Value {
      return wendoo.mkNumber(CHIME_LOUDNESS);
    }
  }

  /** Reading `sensor.chime.unmapped` answers. */
  const CHIME_LOUDNESS = 7;

  /** Name this pack's registrations are diagnosed under, and the value its reading tile returns. */
  export const PACK_NAME = "chime";

  const pack = wendoo.pack(PACK_NAME);
  pack.bind("actuator.chime.ring", new RingActuator());
  pack.bind("sensor.beacon.reading", new ReadingSensor());
  pack.bind("sensor.chime.unmapped", new LoudnessSensor());
}
