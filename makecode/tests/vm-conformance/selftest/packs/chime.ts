/*
 * Test-only vocabulary: `gen-selftest.js` writes this file into a generated
 * pack extension that the registration selftest project depends on. Nothing
 * here is product surface, and no id it is given outlives the selftest run.
 */

/**
 * The second of the two packs the registration selftest composes: a chime
 * that can be rung, and tolled asynchronously.
 *
 * Every registration is made from this file's top-level code, which pxt runs
 * at program start, before the selftest constructs anything. Two of its tile
 * registrations cannot be honoured: one claims the tile name the other pack
 * claims, and one claims a name the project's mapping records no id for. The
 * pack also declares an asset type, the tunes a chime can play, and gives
 * core tiles icons: the AND tile, which the other pack gives one too, and the
 * OR tile, an icon the selftest's encoder refuses to render. It gives core
 * types icons the same way: the number type, which the other pack gives one
 * too, and the boolean type, an icon the encoder refuses to render.
 */
namespace chime {
  /** {@link ringFailure}: the ring tile rings. */
  export const RING_RINGS = 0;

  /** {@link ringFailure}: the ring tile's body raises a `HostError` fault and does not ring. */
  export const RING_FAULTS = 1;

  /** {@link ringFailure}: the ring tile's body raises a `HostError` fault, then throws, and does not ring. */
  export const RING_THROWS = 2;

  /** {@link ringFailure}: the ring tile's page-activation hook raises a `HostError` fault, then throws; its body rings. */
  export const RING_HOOK_THROWS = 3;

  /**
   * How the ring tile fails: one of the `RING_*` modes, read every time its
   * body or its page-activation hook runs; {@link RING_RINGS} until a check
   * sets another.
   */
  // biome-ignore lint/style/useConst: the selftest assigns it.
  export let ringFailure = RING_RINGS;

  /** Diagnostic message of the fault the ring tile's body raises under {@link RING_FAULTS}. */
  export const CRACKED_MESSAGE = "the chime is cracked";

  /** `actuator.chime.ring`: rings the chime, counting the rings, or fails as {@link ringFailure} says. */
  class RingActuator extends wendoo.HostActionBinding {
    /** How many times the chime has been rung. */
    rings: number = 0;

    constructor() {
      super(false);
    }

    execSync(ctx: wendoo.ExecutionContext, args: wendoo.Value[]): wendoo.Value {
      if (ringFailure === RING_FAULTS) {
        ctx.raise(wendoo.ErrorCode.HostError, CRACKED_MESSAGE);
        return wendoo.VOID_VALUE;
      }
      if (ringFailure === RING_THROWS) {
        ctx.raise(wendoo.ErrorCode.HostError, CRACKED_MESSAGE);
        throw "the chime fell";
      }
      this.rings++;
      return wendoo.VOID_VALUE;
    }

    onPageEntered(ctx: wendoo.ExecutionContext): void {
      if (ringFailure === RING_HOOK_THROWS) {
        ctx.raise(wendoo.ErrorCode.HostError, CRACKED_MESSAGE);
        throw "the chime is missing";
      }
    }
  }

  /** The ring tile's body, whose rings a check counts. */
  export const ringActuator = new RingActuator();

  /** {@link tollFailure}: the toll tile settles its handle at once and tolls. */
  export const TOLL_TOLLS = 0;

  /** {@link tollFailure}: the toll tile's asynchronous body throws before it settles its handle, and does not toll. */
  export const TOLL_THROWS = 1;

  /**
   * How the toll tile fails: one of the `TOLL_*` modes, read every time its
   * asynchronous body starts; {@link TOLL_TOLLS} until a check sets another.
   */
  // biome-ignore lint/style/useConst: the selftest assigns it.
  export let tollFailure = TOLL_TOLLS;

  /**
   * `actuator.chime.toll`: tolls the chime asynchronously, settling its
   * handle at once and counting the tolls, or fails as {@link tollFailure}
   * says; counts every start of its asynchronous body and every run of its
   * page-activation hook.
   */
  class TollActuator extends wendoo.HostActionBinding {
    /** How many times the chime has been tolled. */
    tolls: number = 0;
    /** How many times the asynchronous body has started, whether or not it tolled. */
    starts: number = 0;
    /** How many times the page-activation hook has run. */
    pageEntries: number = 0;

    constructor() {
      super(true);
    }

    execAsync(ctx: wendoo.ExecutionContext, args: wendoo.Value[], handle: wendoo.AsyncHandle): void {
      this.starts++;
      if (tollFailure === TOLL_THROWS) {
        throw "the bell rope snapped";
      }
      this.tolls++;
      handle.resolve(wendoo.VOID_VALUE);
    }

    onPageEntered(ctx: wendoo.ExecutionContext): void {
      this.pageEntries++;
    }
  }

  /** The toll tile's body, whose tolls, starts and page entries a check counts. */
  export const tollActuator = new TollActuator();

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

  /** Type name of the chime's tune asset type. */
  export const TUNE_TYPE = "Tune";

  /** Asset kind of the project assets a tune value names. */
  export const TUNE_ASSET_KIND = "tune";

  /** The tune asset type's binding: each value names one of the project's tunes by its asset id. */
  export const tuneBinding = new wendoo.AssetTypeBinding(TUNE_ASSET_KIND);

  const pack = wendoo.pack(PACK_NAME);

  pack.defineAssetType(TUNE_TYPE, tuneBinding);

  /**
   * The ring tile's count slot: a labeled parameter slot declaring a
   * sentence form, and an icon the selftest's encoder refuses to render.
   */
  const timesSlot = wendoo.arg("times", wendoo.TYPE_NUMBER, "times to ring");
  timesSlot.language = wendoo.tileLanguage("this many times");
  timesSlot.icon = "unencodable";

  /** The ring tile's loudness slot: a labeled modifier slot declaring a sentence form and an icon. */
  const loudlySlot = wendoo.modifier("loudly", "nice and loud", wendoo.tileLanguage("loudly"));
  loudlySlot.icon = "loudly";

  /**
   * Declared shape of the ring tile: an optional count and an optional
   * modifier, and sample metadata, a sentence form included, the catalog
   * assertions pin.
   */
  const ringSpec = new wendoo.TileSpec(
    wendoo.TILE_KIND_ACTUATOR,
    [wendoo.optional(timesSlot), wendoo.optional(loudlySlot)],
    ""
  );
  ringSpec.label = "ring the chime";
  ringSpec.group = "Chimes";
  ringSpec.docs = "# Ring the chime\n\nRings the chime once, or `times` times, louder with `loudly`.";
  ringSpec.icon = "chime";
  ringSpec.language = wendoo.tileLanguage("ring");
  pack.bind("actuator.chime.ring", ringActuator, ringSpec);

  pack.bind("sensor.beacon.reading", new ReadingSensor());

  /** Declared shape of the loudness tile, whose icon the selftest's encoder refuses to render. */
  const loudnessSpec = new wendoo.TileSpec(wendoo.TILE_KIND_SENSOR, [], wendoo.TYPE_NUMBER);
  loudnessSpec.label = "chime loudness";
  loudnessSpec.icon = "unencodable";
  pack.bind("sensor.chime.unmapped", new LoudnessSensor(), loudnessSpec);

  /** Declared shape of the toll tile: no argument. */
  const tollSpec = new wendoo.TileSpec(wendoo.TILE_KIND_ACTUATOR, [], "");
  tollSpec.label = "toll the chime";
  pack.bind("actuator.chime.toll", tollActuator, tollSpec);

  pack.defineCoreTileIcon("tile.op->and", "chime-and");
  pack.defineCoreTileIcon("tile.op->or", "unencodable");

  pack.defineCoreTypeIcon("number", "chime-number");
  pack.defineCoreTypeIcon("boolean", "unencodable");
}
