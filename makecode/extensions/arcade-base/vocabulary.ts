/**
 * The arcade base pack's vocabulary: the `Vector2` direction type, the
 * `Sprite` type, the `Image` asset type, the `dpad`, `bump`, `in range` and
 * `out of range` sensors, and the `move` and `look like` actuators, each tile
 * with its icon, registered from this file's top-level code at program start.
 *
 * - `WHEN [dpad]` reads player one's dpad as a `Vector2`, or nil while it
 *   points nowhere. Its direction modifiers mask the reading: each admits
 *   its own direction's component, none admits every component, and a
 *   reading masked to nothing is nil.
 * - `WHEN [bump]` reads the sprite the program's sprite touches as a
 *   `Sprite`, or nil while it touches none; when it touches several, the
 *   one {@link bumpedSprite} picks. Given an image, it reads only a touched
 *   sprite whose image has the same pixels as the image {@link imageOf}
 *   finds, whatever image object it wears, and nil while none does or when
 *   no image is found.
 * - `WHEN [in range]` and `WHEN [out of range]` read the sprite nearest the
 *   program's sprite, as {@link nearestSprite} picks it, as a `Sprite`: in
 *   range while its center lies within the range of the program's sprite's
 *   center, out of range while it lies beyond, and nil otherwise. The range
 *   is the number the tile is given, in pixels, held at 0 or above, or
 *   {@link DEFAULT_SENSE_RANGE}. Given the same range, exactly one of the
 *   pair reads it whenever another sprite exists; while none does, both
 *   read nil.
 * - `DO [move]` moves the program's sprite. Its direction modifiers specify
 *   the direction: the chosen cardinals, `toward` the sprite its rule's WHEN
 *   produced, and `away` from that sprite, sum, scaled to length 1; the
 *   sprite is read where it is at every move, so a move follows it as it
 *   goes. `toward` and `away` add nothing while the WHEN produced no sprite,
 *   or one sharing the program's sprite's center. Given no modifier, or
 *   modifiers that cancel, it moves in the direction it is given; given
 *   none, in the direction its rule's WHEN produced; and when the WHEN
 *   produced no direction either, in {@link MOVE_DEFAULT_DIRECTION}.
 *   It moves at {@link MOVE_DEFAULT_SPEED}, halved by each `slowly`, doubled
 *   by each `quickly`, or at the speed it is given. The direction is held to
 *   the unit circle, so a diagonal moves as fast as a straight line and a
 *   part-deflected analog stick moves slower.
 * - `DO [look like]` dresses the program's sprite in the image it is given,
 *   as {@link imageOf} finds it when it acts, or in the image the sprite it
 *   is given wears at that moment -- that same image, not a copy. It must be
 *   given one or the other. Given an image no factory holds, or a value
 *   standing for no sprite, it leaves the sprite's image as it was.
 */
namespace wendoo {
  /** Name the arcade base pack's registrations are reported under. */
  //% hidden
  export const ARCADE_PACK_NAME = "arcade";

  /** Tile name of the dpad sensor. */
  //% hidden
  export const DPAD_TILE = "sensor.arcade.dpad";

  /** Tile name of the move actuator. */
  //% hidden
  export const MOVE_TILE = "actuator.arcade.move";

  /** Tile name of the bump sensor. */
  //% hidden
  export const BUMP_TILE = "sensor.arcade.bump";

  /** Tile name of the in-range sensor. */
  //% hidden
  export const IN_RANGE_TILE = "sensor.arcade.in-range";

  /** Tile name of the out-of-range sensor. */
  //% hidden
  export const OUT_OF_RANGE_TILE = "sensor.arcade.out-of-range";

  /** Tile name of the look-like actuator. */
  //% hidden
  export const LOOK_LIKE_TILE = "actuator.arcade.look-like";

  /** Range the in-range and out-of-range sensors sense within when they are given none, in pixels between sprite centers. */
  //% hidden
  export const DEFAULT_SENSE_RANGE = 60;

  /** Speed a move goes at when nothing sets it, in pixels per second. */
  //% hidden
  export const MOVE_DEFAULT_SPEED = 100;

  /** Direction a move goes in when it is given none and its rule's WHEN produced none: rightward. */
  //% hidden
  export const MOVE_DEFAULT_DIRECTION = new DirectionVector(1, 0);

  /** Factor each `slowly` on a move multiplies its speed by. */
  //% hidden
  export const MOVE_SLOWLY_FACTOR = 0.5;

  /** Factor each `quickly` on a move multiplies its speed by. */
  //% hidden
  export const MOVE_QUICKLY_FACTOR = 2;

  /** Most `slowly` or `quickly` modifiers a move counts. */
  //% hidden
  export const MOVE_SPEED_STEPS_MAX = 3;

  /** Argument-buffer positions of the dpad's direction modifiers. */
  const DPAD_SLOT_UP = 0;
  const DPAD_SLOT_DOWN = 1;
  const DPAD_SLOT_LEFT = 2;
  const DPAD_SLOT_RIGHT = 3;

  /** Argument-buffer positions of the move's direction, `slowly` count, `quickly` count, speed, cardinal modifiers, and `toward` and `away`. */
  const MOVE_SLOT_DIRECTION = 0;
  const MOVE_SLOT_SLOWLY = 1;
  const MOVE_SLOT_QUICKLY = 2;
  const MOVE_SLOT_SPEED = 3;
  const MOVE_SLOT_UP = 4;
  const MOVE_SLOT_DOWN = 5;
  const MOVE_SLOT_LEFT = 6;
  const MOVE_SLOT_RIGHT = 7;
  const MOVE_SLOT_TOWARD = 8;
  const MOVE_SLOT_AWAY = 9;

  /** Argument-buffer position of the in-range and out-of-range sensors' range. */
  const RANGE_SLOT = 0;

  /** Argument-buffer position of the bump sensor's image. */
  const BUMP_SLOT_IMAGE = 0;

  /** Argument-buffer positions of the look-like actuator's image and sprite. */
  const LOOK_SLOT_IMAGE = 0;
  const LOOK_SLOT_SPRITE = 1;

  /** Whether the slot at `slot` of `args` is filled. */
  function isFilled(args: Value[], slot: number): boolean {
    return args[slot] !== undefined && args[slot].t !== ValueTag.Nil;
  }

  /** The count a modifier slot carries: its occurrences, 0 when it is empty. */
  function modifierCount(value: Value): number {
    return value !== undefined && value.t === ValueTag.Number ? value.num : 0;
  }

  /**
   * The direction a move goes in: `specified`, when its direction modifiers
   * specify one; else the direction `explicit` carries; else the direction
   * `whenResult` carries; else {@link MOVE_DEFAULT_DIRECTION}.
   *
   * @param specified - The direction the move's direction modifiers specify, 1 long; `undefined` when they specify none.
   * @param explicit - The move's direction argument; nil when it is given none.
   * @param whenResult - What the move's rule's WHEN produced.
   */
  //% hidden
  export function moveDirection(specified: DirectionVector, explicit: Value, whenResult: Value): DirectionVector {
    if (specified) {
      return specified;
    }
    const given = directionOf(explicit);
    if (given) {
      return given;
    }
    const sensed = directionOf(whenResult);
    return sensed ? sensed : MOVE_DEFAULT_DIRECTION;
  }

  /**
   * The speed a move goes at, in pixels per second: the speed argument held
   * at 0 or above when it carries a number; else {@link MOVE_DEFAULT_SPEED}
   * doubled per `quickly` when there is one; else halved per `slowly`. At
   * most {@link MOVE_SPEED_STEPS_MAX} modifiers are counted.
   *
   * @param slowly - The `slowly` modifier slot: its count, or nil.
   * @param quickly - The `quickly` modifier slot: its count, or nil.
   * @param speed - The speed argument: a number, or nil.
   */
  //% hidden
  export function moveSpeed(slowly: Value, quickly: Value, speed: Value): number {
    if (speed !== undefined && speed.t === ValueTag.Number) {
      return speed.num > 0 ? speed.num : 0;
    }
    const quick = Math.min(modifierCount(quickly), MOVE_SPEED_STEPS_MAX);
    const factor = quick > 0 ? MOVE_QUICKLY_FACTOR : MOVE_SLOWLY_FACTOR;
    const steps = quick > 0 ? quick : Math.min(modifierCount(slowly), MOVE_SPEED_STEPS_MAX);
    let result = MOVE_DEFAULT_SPEED;
    for (let i = 0; i < steps; i++) {
      result *= factor;
    }
    return result;
  }

  /** `sensor.arcade.dpad`: player one's dpad direction, masked by the direction modifiers, or nil when the mask leaves nothing. */
  class DpadSensor extends HostActionBinding {
    constructor() {
      super(false);
    }

    execSync(ctx: ExecutionContext, args: Value[]): Value {
      const up = isFilled(args, DPAD_SLOT_UP);
      const down = isFilled(args, DPAD_SLOT_DOWN);
      const left = isFilled(args, DPAD_SLOT_LEFT);
      const right = isFilled(args, DPAD_SLOT_RIGHT);
      const all = !up && !down && !left && !right;
      const masked = maskDirection(readDpadDirection(), all || up, all || down, all || left, all || right);
      return masked.isZero() ? NIL_VALUE : vector2Value(masked);
    }
  }

  /**
   * `sensor.arcade.bump`: the sprite the program's sprite touches now, as
   * {@link bumpedSprite} picks it, or nil while it touches none. Given an
   * image, only a touched sprite whose image has the same pixels as the
   * image {@link imageOf} finds is picked, and none when no image is found.
   */
  class BumpSensor extends HostActionBinding {
    constructor() {
      super(false);
    }

    execSync(ctx: ExecutionContext, args: Value[]): Value {
      const sprite = (ctx.data as SpriteWorld).sprite;
      let bumped: Sprite;
      if (isFilled(args, BUMP_SLOT_IMAGE)) {
        const wanted = imageOf(args[BUMP_SLOT_IMAGE]);
        bumped = wanted ? bumpedSprite(sprite, (other: Sprite) => other.image.equals(wanted)) : undefined;
      } else {
        bumped = bumpedSprite(sprite);
      }
      return bumped ? spriteValue(bumped) : NIL_VALUE;
    }
  }

  /**
   * The range an in-range or out-of-range sensor senses within, in pixels
   * between sprite centers: the range argument held at 0 or above when it
   * carries a number; else {@link DEFAULT_SENSE_RANGE}.
   *
   * @param range - The range argument: a number, or nil.
   */
  function senseRange(range: Value): number {
    if (range !== undefined && range.t === ValueTag.Number) {
      return range.num > 0 ? range.num : 0;
    }
    return DEFAULT_SENSE_RANGE;
  }

  /**
   * `sensor.arcade.in-range` and `sensor.arcade.out-of-range`: the sprite
   * nearest the program's sprite, as {@link nearestSprite} picks it, while
   * its center lies within the sensor's range of the program's sprite's
   * center, the boundary included (in range), or beyond it (out of range);
   * nil otherwise, and nil while the scene holds no other sprite. Given the
   * same range, exactly one of the pair produces the nearest sprite whenever
   * another sprite exists.
   */
  class RangeSensor extends HostActionBinding {
    /** Whether this sensor produces the nearest sprite while it is within range, and not while it is beyond. */
    private inRange: boolean;

    /**
     * @param inRange - `true` for the in-range sensor, `false` for the out-of-range sensor.
     */
    constructor(inRange: boolean) {
      super(false);
      this.inRange = inRange;
    }

    execSync(ctx: ExecutionContext, args: Value[]): Value {
      const sprite = (ctx.data as SpriteWorld).sprite;
      const nearest = nearestSprite(sprite);
      if (!nearest) {
        return NIL_VALUE;
      }
      const range = senseRange(args[RANGE_SLOT]);
      const within = centerDistanceSquared(sprite, nearest) <= range * range;
      return within === this.inRange ? spriteValue(nearest) : NIL_VALUE;
    }
  }

  /** `actuator.arcade.move`: records the program's sprite's move for this frame's arbitration. */
  class MoveActuator extends HostActionBinding {
    constructor() {
      super(false);
    }

    execSync(ctx: ExecutionContext, args: Value[]): Value {
      const sprite = (ctx.data as SpriteWorld).sprite;
      const whenResult = getWhenResult(ctx);
      const specified = specifiedDirection(
        isFilled(args, MOVE_SLOT_UP),
        isFilled(args, MOVE_SLOT_DOWN),
        isFilled(args, MOVE_SLOT_LEFT),
        isFilled(args, MOVE_SLOT_RIGHT),
        isFilled(args, MOVE_SLOT_TOWARD),
        isFilled(args, MOVE_SLOT_AWAY),
        directionToward(sprite, whenResult)
      );
      const direction = clampToUnitCircle(moveDirection(specified, args[MOVE_SLOT_DIRECTION], whenResult));
      const speed = moveSpeed(args[MOVE_SLOT_SLOWLY], args[MOVE_SLOT_QUICKLY], args[MOVE_SLOT_SPEED]);
      sceneMotionArbiter(game.currentScene()).addIntent(new MoveIntent(sprite, direction, speed, 1));
      return VOID_VALUE;
    }
  }

  /**
   * `actuator.arcade.look-like`: dresses the program's sprite in the image
   * {@link imageOf} finds for its image slot, or in the image the sprite its
   * sprite slot stands for wears now, and leaves the sprite's image as it
   * was when neither gives one.
   */
  class LookLikeActuator extends HostActionBinding {
    constructor() {
      super(false);
    }

    execSync(ctx: ExecutionContext, args: Value[]): Value {
      const sprite = (ctx.data as SpriteWorld).sprite;
      let look: Image;
      if (isFilled(args, LOOK_SLOT_IMAGE)) {
        look = imageOf(args[LOOK_SLOT_IMAGE]);
      } else {
        const other = spriteOf(args[LOOK_SLOT_SPRITE]);
        look = other ? other.image : undefined;
      }
      sprite.setImage(look);
      return VOID_VALUE;
    }
  }

  /** An anonymous slot of the type `type`: a bare value expression of the type fills it. */
  function anonymousArg(type: string): ArgSlotSpec {
    const slot = arg(`anon.${type}`, type);
    slot.anonymous = true;
    return slot;
  }

  /** `slot`, carrying `icon` as the icon of the tile that fills it. */
  function iconed(slot: ArgSlotSpec, icon: Image): ArgSlotSpec {
    slot.icon = icon;
    return slot;
  }

  /** The range slot each range sensor declares: an optional anonymous number of pixels, held at 0 or above. */
  function rangeSlot(): TileArgSpec {
    const slot = anonymousArg(TYPE_NUMBER);
    slot.unit = "px";
    slot.range = argRangeAtLeast(0, ARG_ON_EXCEED_CLAMP);
    return optional(slot);
  }

  /** The four optional direction modifier slots, up, down, left then right, each with its icon. */
  function directionModifiers(): TileArgSpec[] {
    return [
      optional(iconed(modifier("modifier.direction.up"), UP_ICON)),
      optional(iconed(modifier("modifier.direction.down"), DOWN_ICON)),
      optional(iconed(modifier("modifier.direction.left"), LEFT_ICON)),
      optional(iconed(modifier("modifier.direction.right"), RIGHT_ICON)),
    ];
  }

  const arcadePack = pack(ARCADE_PACK_NAME);

  arcadePack.defineStruct(TYPE_VECTOR2, vector2Fields(), vector2Binding);
  arcadePack.defineStruct(TYPE_SPRITE, [], spriteBinding);
  arcadePack.defineAssetType(TYPE_IMAGE, imageBinding);

  const dpadSpec = new TileSpec(TILE_KIND_SENSOR, directionModifiers(), TYPE_VECTOR2);
  dpadSpec.label = "dpad";
  dpadSpec.icon = DPAD_ICON;
  dpadSpec.language.form = "press";
  dpadSpec.language.bare = "the dpad";
  arcadePack.bind(DPAD_TILE, new DpadSensor(), dpadSpec);

  const moveDirectionSlot = anonymousArg(TYPE_VECTOR2);
  moveDirectionSlot.derived = true;
  const moveSpeedSlot = arg("parameter.speed", TYPE_NUMBER);
  moveSpeedSlot.unit = "px/s";
  moveSpeedSlot.range = argRangeAtLeast(0, ARG_ON_EXCEED_CLAMP);
  const moveSpeedArgs: TileArgSpec[] = [
    optional(moveDirectionSlot),
    optional(
      choice([
        repeatedUpTo(iconed(modifier("modifier.slowly"), SLOWLY_ICON), 1, MOVE_SPEED_STEPS_MAX),
        repeatedUpTo(iconed(modifier("modifier.quickly"), QUICKLY_ICON), 1, MOVE_SPEED_STEPS_MAX),
        moveSpeedSlot,
      ])
    ),
  ];
  const moveRelationalArgs: TileArgSpec[] = [
    optional(iconed(modifier("modifier.movement.toward"), TOWARD_ICON)),
    optional(iconed(modifier("modifier.movement.away", "away from"), AWAY_ICON)),
  ];
  const moveSpec = new TileSpec(
    TILE_KIND_ACTUATOR,
    moveSpeedArgs.concat(directionModifiers()).concat(moveRelationalArgs),
    ""
  );
  moveSpec.label = "move";
  moveSpec.icon = MOVE_ICON;
  arcadePack.bind(MOVE_TILE, new MoveActuator(), moveSpec);

  const bumpSpec = new TileSpec(TILE_KIND_SENSOR, [optional(anonymousArg(TYPE_IMAGE))], TYPE_SPRITE);
  bumpSpec.label = "bump";
  bumpSpec.icon = BUMP_ICON;
  bumpSpec.language.bare = "anything";
  arcadePack.bind(BUMP_TILE, new BumpSensor(), bumpSpec);

  const inRangeSpec = new TileSpec(TILE_KIND_SENSOR, [rangeSlot()], TYPE_SPRITE);
  inRangeSpec.label = "in range";
  inRangeSpec.icon = IN_RANGE_ICON;
  inRangeSpec.language.frame = SENTENCE_FRAME_STATE;
  inRangeSpec.language.bare = "of anything";
  arcadePack.bind(IN_RANGE_TILE, new RangeSensor(true), inRangeSpec);

  const outOfRangeSpec = new TileSpec(TILE_KIND_SENSOR, [rangeSlot()], TYPE_SPRITE);
  outOfRangeSpec.label = "out of range";
  outOfRangeSpec.icon = OUT_OF_RANGE_ICON;
  outOfRangeSpec.language.frame = SENTENCE_FRAME_STATE;
  outOfRangeSpec.language.bare = "of anything";
  arcadePack.bind(OUT_OF_RANGE_TILE, new RangeSensor(false), outOfRangeSpec);

  const lookLikeSpec = new TileSpec(
    TILE_KIND_ACTUATOR,
    [choice([anonymousArg(TYPE_IMAGE), anonymousArg(TYPE_SPRITE)])],
    ""
  );
  lookLikeSpec.label = "look like";
  lookLikeSpec.icon = LOOK_LIKE_ICON;
  arcadePack.bind(LOOK_LIKE_TILE, new LookLikeActuator(), lookLikeSpec);
}
