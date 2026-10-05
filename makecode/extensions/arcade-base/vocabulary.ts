/**
 * The arcade base pack's vocabulary: the `Vector2` type, the
 * `Sprite` type, the `Image` asset type, the `Brain` type, the `dpad`,
 * `bump`, `in range` and `out of range` sensors, and the `move` and
 * `look like` actuators, each tile with its icon, registered from this
 * file's top-level code at program start, `Vector2`, `Sprite` and `Brain`
 * each with its icon; and the icons it gives the core tiles -- the page
 * tiles, the timer, AND, OR, NOT, the six comparisons, the arithmetic
 * operators, gets, the parentheses, random number, true, false, nil, and the
 * variable and tile factories.
 *
 * - `WHEN [dpad]` reads player one's dpad as a `Vector2`, or nil while it
 *   points nowhere. Its direction modifiers mask the reading: each admits
 *   its own direction's component, none admits every component, and a
 *   reading masked to nothing is nil.
 * - The proximity sensors -- `bump`, `in range` and `out of range` -- each
 *   take one optional filter, an image, a sprite or a brain, and read only
 *   the sprites it admits: given an image, the sprites whose image has the
 *   same pixels as the image {@link imageOf} finds, whatever image object
 *   they wear, and none when no image is found; given a sprite, that sprite
 *   alone, and none for a value standing for no sprite; given a brain, the
 *   sprites running it, and none while no sprite does. Each also takes the
 *   positional modifiers -- `above` or `below`, and `left of` or `right of`
 *   -- reading only the sprites whose center lies strictly on every given
 *   side of the program's sprite's center. The program's own sprite is never
 *   read.
 * - Each proximity sensor also writes what it reads to an output of its
 *   own -- `bumped sprite`, `sprite in range`, `sprite out of range` --
 *   whenever it runs: the sprite when it reads one, nil when it does not.
 *   The output's tile reads it in the sensor's rule and the rules below it.
 * - `WHEN [bump]` reads the admitted sprite the program's sprite touches as
 *   a `Sprite`, or nil while it touches none; when it touches several, the
 *   one {@link bumpedSprite} picks.
 * - `WHEN [in range]` and `WHEN [out of range]` read the admitted sprite
 *   nearest the program's sprite, as {@link nearestSprite} picks it, as a
 *   `Sprite`: in range while its center lies within the range of the
 *   program's sprite's center, out of range while it lies beyond, and nil
 *   otherwise. The range is the number the tile is given, in pixels, held at
 *   0 or above, or {@link DEFAULT_SENSE_RANGE}. Given the same range,
 *   filter and positional modifiers, exactly one of the pair reads it
 *   whenever an admitted sprite exists; while none does, both read nil.
 * - `DO [move]` moves the program's sprite. Its direction modifiers specify
 *   the direction: the chosen cardinals, `toward` its target, `away` from
 *   it, and `wander` toward the destination it heads for, sum, scaled to
 *   length 1. Once `toward` or `away` is placed, the move takes one target
 *   after it, which both read: a sprite, read where it is at every move, so
 *   a move follows it as it goes, and adding nothing once it is destroyed;
 *   or a `Vector2`, read as a fixed point on the screen. Given no target,
 *   the target is the sprite its rule's WHEN produced. `toward` and `away`
 *   add nothing while there is no sprite to read, or the target shares the
 *   program's sprite's center. `wander` heads for a random destination on
 *   the screen, picking a new one when the sprite arrives or after
 *   {@link WANDER_DEADLINE_MS}; each call site keeps its own destination. A
 *   move heading for one goal alone -- `toward` its target, or `wander`
 *   toward its destination, with no other direction modifier adding a
 *   direction -- goes no farther than the goal in a frame, landing on it;
 *   and a `toward` or `wander` whose goal is the program's sprite's center
 *   holds the sprite still there unless another modifier adds a direction.
 *   Given no modifier, or modifiers that cancel, it moves in the direction
 *   it is given; given none, in the direction its rule's WHEN produced; and
 *   when the WHEN produced no direction either, in
 *   {@link MOVE_DEFAULT_DIRECTION}. It moves at {@link MOVE_DEFAULT_SPEED},
 *   halved by each `slowly`, doubled by each `quickly`, or at the speed it is
 *   given, never faster than {@link ENGINE_MAX_SPEED}. The direction is held
 *   to the unit circle, so a diagonal moves as fast as a straight line and a
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

  /** Name of the bump sensor's output: the sprite it reads. */
  //% hidden
  export const BUMPED_OUTPUT = "bumped";

  /** Name of the in-range sensor's output: the sprite it reads. */
  //% hidden
  export const IN_RANGE_OUTPUT = "inRange";

  /** Name of the out-of-range sensor's output: the sprite it reads. */
  //% hidden
  export const OUT_OF_RANGE_OUTPUT = "outOfRange";

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

  /**
   * Argument-buffer position of the move's first target slot. Four follow
   * from it: the point and the sprite filling the target once `toward` is
   * placed, then the point and the sprite filling it once only `away` is. At
   * most one of the four is filled.
   */
  const MOVE_SLOT_TARGET = 0;
  const MOVE_TARGET_SLOTS = 4;

  /** Argument-buffer positions of the move's direction, `slowly` count, `quickly` count, speed, cardinal modifiers, `toward`, `away` and `wander`. */
  const MOVE_SLOT_DIRECTION = 4;
  const MOVE_SLOT_SLOWLY = 5;
  const MOVE_SLOT_QUICKLY = 6;
  const MOVE_SLOT_SPEED = 7;
  const MOVE_SLOT_UP = 8;
  const MOVE_SLOT_DOWN = 9;
  const MOVE_SLOT_LEFT = 10;
  const MOVE_SLOT_RIGHT = 11;
  const MOVE_SLOT_TOWARD = 12;
  const MOVE_SLOT_AWAY = 13;
  const MOVE_SLOT_WANDER = 14;

  /** Names of the move's `toward` and `away` slots, which the conditional offering its target tests. */
  const MOVE_TOWARD_NAME = "toward";
  const MOVE_AWAY_NAME = "away";

  /** Argument-buffer positions of every proximity sensor's filter: its image, its sprite, then its brain. */
  const FILTER_SLOT_IMAGE = 0;
  const FILTER_SLOT_SPRITE = 1;
  const FILTER_SLOT_BRAIN = 2;

  /** Argument-buffer position of the in-range and out-of-range sensors' range, after their filter. */
  const RANGE_SLOT = 3;

  /** Argument-buffer position of the bump sensor's first positional modifier, after its filter. */
  const BUMP_SLOT_POSITION = 3;

  /** Argument-buffer position of each range sensor's first positional modifier, after its range. */
  const RANGE_SLOT_POSITION = 4;

  /** Offsets of the positional modifiers -- above, below, left of, right of -- from a sensor's first positional modifier slot. */
  const POSITION_ABOVE = 0;
  const POSITION_BELOW = 1;
  const POSITION_LEFT = 2;
  const POSITION_RIGHT = 3;

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
   * The point the move's `toward` heads for and its `away` flees, in the
   * coordinates sprite positions use: `target` when it is given, else the
   * sprite `whenResult` stands for. A `Sprite` target is read at its
   * sprite's center now and gives `undefined` once that sprite is
   * destroyed; a `Vector2` target is a fixed point on the screen.
   * `undefined` when there is no target sprite or point -- no target given
   * and a WHEN that produced no `Sprite` value.
   *
   * @param target - The move's target; nil when it is given none.
   * @param whenResult - What the move's rule's WHEN produced.
   */
  //% hidden
  export function moveGoal(target: Value, whenResult: Value): DirectionVector {
    if (!target || target.t === ValueTag.Nil) {
      const subject = spriteOf(whenResult);
      return subject ? new DirectionVector(subject.x, subject.y) : undefined;
    }
    const other = spriteOf(target);
    if (other) {
      return isDestroyed(other) ? undefined : new DirectionVector(other.x, other.y);
    }
    return vector2Of(target);
  }

  /**
   * The speed a move heading straight for a goal `distance` pixels away
   * goes at over a frame of `dtMs` milliseconds, asked to go at `speed`:
   * `speed`, or the speed that covers exactly `distance` in the frame when
   * that is less, so the move never passes its goal. `speed` itself when
   * `dtMs` is 0 or less -- no frame has been timed yet.
   *
   * @param speed - The speed the move asks for, in pixels per second.
   * @param distance - Distance from the sprite's center to the goal, in pixels.
   * @param dtMs - Duration of the frame the move is made in, in milliseconds.
   */
  //% hidden
  export function speedWithinReach(speed: number, distance: number, dtMs: number): number {
    if (dtMs <= 0) {
      return speed;
    }
    const reaching = (distance * 1000) / dtMs;
    return speed < reaching ? speed : reaching;
  }

  /** The move's target in `args`: the one filled target slot, or nil when none is. */
  function moveTarget(args: Value[]): Value {
    for (let slot = MOVE_SLOT_TARGET; slot < MOVE_SLOT_TARGET + MOVE_TARGET_SLOTS; slot++) {
      if (isFilled(args, slot)) {
        return args[slot];
      }
    }
    return NIL_VALUE;
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

  /** A sprite predicate that admits no sprite. */
  function admitsNone(other: Sprite): boolean {
    return false;
  }

  /**
   * Which sprites a proximity sensor's filter admits, read from its slots
   * in `args`: given an image, the sprites whose image has the same pixels
   * as the image {@link imageOf} finds, and none when no image is found;
   * given a sprite, that sprite alone, and none when the value stands for
   * no sprite; given a brain, the sprites running it in the program host of
   * `world`, as {@link spritesRunning} finds them, and none when no sprite
   * does. `undefined` when the filter is empty -- every sprite is admitted.
   *
   * @param world - World of the sprite the sensor reads for.
   * @param args - The sensor's argument buffer.
   */
  function filterAdmits(world: SpriteWorld, args: Value[]): (other: Sprite) => boolean {
    if (isFilled(args, FILTER_SLOT_IMAGE)) {
      const wanted = imageOf(args[FILTER_SLOT_IMAGE]);
      return wanted ? (other: Sprite) => other.image.equals(wanted) : admitsNone;
    }
    if (isFilled(args, FILTER_SLOT_SPRITE)) {
      const wanted = spriteOf(args[FILTER_SLOT_SPRITE]);
      return wanted ? (other: Sprite) => other === wanted : admitsNone;
    }
    if (isFilled(args, FILTER_SLOT_BRAIN)) {
      const runners = spritesRunning(world, args[FILTER_SLOT_BRAIN]);
      return runners.length > 0 ? (other: Sprite) => runners.indexOf(other) >= 0 : admitsNone;
    }
    return undefined;
  }

  /**
   * Which sprites a proximity sensor reads among, given its argument buffer
   * `args` whose positional modifiers start at `positionSlot`: those its
   * filter admits, as {@link filterAdmits} reads it, whose center lies
   * strictly above the center of the sprite `world` holds when `above` is
   * given, strictly below it when `below` is, strictly left of it when
   * `left of` is, and strictly right of it when `right of` is -- every given
   * condition at once. `undefined` when the filter is empty and no
   * positional modifier is given -- every sprite is read among.
   *
   * @param world - World of the sprite the sensor reads for.
   * @param args - The sensor's argument buffer.
   * @param positionSlot - Argument-buffer position of the sensor's first positional modifier.
   */
  function proximityAdmits(world: SpriteWorld, args: Value[], positionSlot: number): (other: Sprite) => boolean {
    const filter = filterAdmits(world, args);
    const above = isFilled(args, positionSlot + POSITION_ABOVE);
    const below = isFilled(args, positionSlot + POSITION_BELOW);
    const left = isFilled(args, positionSlot + POSITION_LEFT);
    const right = isFilled(args, positionSlot + POSITION_RIGHT);
    if (!above && !below && !left && !right) {
      return filter;
    }
    const sprite = world.sprite;
    return (other: Sprite) =>
      (!filter || filter(other)) &&
      (!above || other.y < sprite.y) &&
      (!below || other.y > sprite.y) &&
      (!left || other.x < sprite.x) &&
      (!right || other.x > sprite.x);
  }

  /**
   * `sensor.arcade.bump`: the sprite the program's sprite touches now, among
   * those {@link proximityAdmits} reads among, as {@link bumpedSprite} picks it, or nil while
   * it touches none of them; written to its {@link BUMPED_OUTPUT} output too.
   */
  class BumpSensor extends HostActionBinding {
    constructor() {
      super(false);
    }

    execSync(ctx: ExecutionContext, args: Value[]): Value {
      const world = ctx.data as SpriteWorld;
      const bumped = bumpedSprite(world.sprite, proximityAdmits(world, args, BUMP_SLOT_POSITION));
      const result = bumped ? spriteValue(bumped) : NIL_VALUE;
      setActionOutput(ctx, structTypeId(TYPE_SPRITE), BUMPED_OUTPUT, result);
      return result;
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
   * nearest the program's sprite among those {@link proximityAdmits} reads
   * among, as {@link nearestSprite} picks it, while its center lies within
   * the sensor's range of the program's sprite's center, the boundary
   * included (in range), or beyond it (out of range); nil otherwise, and nil
   * while the scene holds no other sprite {@link proximityAdmits} admits.
   * Given the same range, filter and positional modifiers, exactly one of
   * the pair produces the nearest admitted sprite whenever one exists. What
   * a sensor produces is written to its output too.
   */
  class RangeSensor extends HostActionBinding {
    /** Whether this sensor produces the nearest sprite while it is within range, and not while it is beyond. */
    private inRange: boolean;
    /** Name of the output this sensor writes what it produces to. */
    private output: string;

    /**
     * @param inRange - `true` for the in-range sensor, `false` for the out-of-range sensor.
     * @param output - Name of the sensor's output.
     */
    constructor(inRange: boolean, output: string) {
      super(false);
      this.inRange = inRange;
      this.output = output;
    }

    execSync(ctx: ExecutionContext, args: Value[]): Value {
      const world = ctx.data as SpriteWorld;
      const sprite = world.sprite;
      const nearest = nearestSprite(sprite, proximityAdmits(world, args, RANGE_SLOT_POSITION));
      let result = NIL_VALUE;
      if (nearest) {
        const range = senseRange(args[RANGE_SLOT]);
        const within = centerDistanceSquared(sprite, nearest) <= range * range;
        result = within === this.inRange ? spriteValue(nearest) : NIL_VALUE;
      }
      setActionOutput(ctx, structTypeId(TYPE_SPRITE), this.output, result);
      return result;
    }
  }

  /** A direction that points nowhere: the move of a sprite holding still at its goal. */
  const HOLD_STILL = new DirectionVector(0, 0);

  /**
   * `actuator.arcade.move`: records the program's sprite's move for this
   * frame's arbitration, a wander heading for the destination the move's
   * call site holds in the sprite's world. A move heading for one goal
   * alone -- `toward` its goal, or `wander` toward its destination, with no
   * other direction added -- goes no farther than the goal in the frame,
   * its speed held by {@link speedWithinReach} over the frame's duration. A
   * `toward` or `wander` whose goal is the sprite's own center holds the
   * sprite still there when no other modifier adds a direction.
   */
  class MoveActuator extends HostActionBinding {
    constructor() {
      super(false);
    }

    execSync(ctx: ExecutionContext, args: Value[]): Value {
      const world = ctx.data as SpriteWorld;
      const sprite = world.sprite;
      const whenResult = getWhenResult(ctx);
      const up = isFilled(args, MOVE_SLOT_UP);
      const down = isFilled(args, MOVE_SLOT_DOWN);
      const left = isFilled(args, MOVE_SLOT_LEFT);
      const right = isFilled(args, MOVE_SLOT_RIGHT);
      const toward = isFilled(args, MOVE_SLOT_TOWARD);
      const away = isFilled(args, MOVE_SLOT_AWAY);
      const goal = toward || away ? moveGoal(moveTarget(args), whenResult) : undefined;
      const bearing = goal ? unitVector(goal.x - sprite.x, goal.y - sprite.y) : undefined;
      let wander: DirectionVector;
      let destination: WanderLeg;
      if (isFilled(args, MOVE_SLOT_WANDER)) {
        wander = world.wander.bearing(sprite, ctx.currentCallSiteId, ctx.time, game.currentScene().camera);
        destination = world.wander.leg(ctx.currentCallSiteId);
      }
      const specified = specifiedDirection(up, down, left, right, toward, away, bearing, wander);
      let speed = moveSpeed(args[MOVE_SLOT_SLOWLY], args[MOVE_SLOT_QUICKLY], args[MOVE_SLOT_SPEED]);
      let direction: DirectionVector;
      const towardArrived = toward && goal !== undefined && bearing === undefined;
      const wanderArrived = destination !== undefined && wander === undefined;
      if (specified === undefined && (towardArrived || wanderArrived)) {
        direction = HOLD_STILL;
      } else {
        direction = clampToUnitCircle(moveDirection(specified, args[MOVE_SLOT_DIRECTION], whenResult));
        const cardinal = up || down || left || right;
        const relational = bearing !== undefined && (toward || away);
        let sole: DirectionVector;
        if (!cardinal && relational && toward && !away && wander === undefined) {
          sole = goal;
        } else if (!cardinal && !relational && wander !== undefined) {
          sole = new DirectionVector(destination.x, destination.y);
        }
        if (sole !== undefined) {
          const dx = sole.x - sprite.x;
          const dy = sole.y - sprite.y;
          speed = speedWithinReach(speed, Math.sqrt(dx * dx + dy * dy), ctx.dt);
        }
      }
      sceneMotionArbiter(game.currentScene()).addIntent(new MoveIntent(sprite, direction, speed, 1, world.motion));
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

  /** The `Sprite` output named `name`, its tile labelled `label` and showing `icon`. */
  function spriteOutput(name: string, label: string, icon: Image): TileOutputSpec {
    const declared = output(name, TYPE_SPRITE);
    declared.label = label;
    declared.icon = icon;
    return declared;
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

  /**
   * One target slot the move declares, taken once `toward` or `away` is
   * placed: an optional choice of an anonymous point or sprite. An empty
   * target is the sprite the move's rule's WHEN produced.
   */
  function moveTargetSlot(): TileArgSpec {
    const point = anonymousArg(TYPE_VECTOR2);
    point.derived = true;
    const sprite = anonymousArg(TYPE_SPRITE);
    sprite.derived = true;
    return optional(choice([point, sprite]));
  }

  /** The range slot each range sensor declares: an optional anonymous number of pixels, held at 0 or above. */
  function rangeSlot(): TileArgSpec {
    const slot = anonymousArg(TYPE_NUMBER);
    slot.unit = "px";
    slot.range = argRangeAtLeast(0, ARG_ON_EXCEED_CLAMP);
    return optional(slot);
  }

  /** The filter slot every proximity sensor declares: an optional choice of an anonymous image, sprite or brain. */
  function filterSlot(): TileArgSpec {
    return optional(choice([anonymousArg(TYPE_IMAGE), anonymousArg(TYPE_SPRITE), anonymousArg(TYPE_BRAIN)]));
  }

  /** The shared positional modifier `tileId`, labelled `label`, read with the word `form`, showing `icon`. */
  function positionModifier(tileId: string, label: string, form: string, icon: Image): ArgSlotSpec {
    return iconed(modifier(tileId, label, tileLanguage(form)), icon);
  }

  /**
   * The positional modifier slots every proximity sensor declares: an
   * optional choice of `above` or `below`, then an optional choice of
   * `left of` or `right of` -- at most one per axis.
   */
  function positionSlots(): TileArgSpec[] {
    return [
      optional(
        choice([
          positionModifier("modifier.position.above", "above", "above me", ABOVE_ICON),
          positionModifier("modifier.position.below", "below", "below me", BELOW_ICON),
        ])
      ),
      optional(
        choice([
          positionModifier("modifier.position.left", "left of", "to my left", LEFT_OF_ICON),
          positionModifier("modifier.position.right", "right of", "to my right", RIGHT_OF_ICON),
        ])
      ),
    ];
  }

  /**
   * The argument grammar each range sensor declares: an optional filter, an
   * optional range and its positional modifiers, in any order, each
   * anonymous value filling the slot of its type -- an image, a sprite or a
   * brain the filter, a number the range.
   */
  function rangeSensorArgs(): TileArgSpec[] {
    return [optional(choice([bag([filterSlot(), rangeSlot()].concat(positionSlots()))]))];
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

  /** Catalog metadata declaring `icon` and nothing else. */
  function iconMeta(icon: Image): CatalogMeta {
    const meta = new CatalogMeta();
    meta.icon = icon;
    return meta;
  }

  const arcadePack = pack(ARCADE_PACK_NAME);

  arcadePack.defineStruct(TYPE_VECTOR2, vector2Fields(), vector2Binding, iconMeta(VECTOR2_TYPE_ICON));
  arcadePack.defineStruct(TYPE_SPRITE, [], spriteBinding, iconMeta(SPRITE_TYPE_ICON));
  arcadePack.defineAssetType(TYPE_IMAGE, imageBinding);
  arcadePack.defineBrainType(TYPE_BRAIN, brainBinding, iconMeta(BRAIN_TYPE_ICON));

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
  const moveTowardSlot = iconed(modifier("modifier.movement.toward"), TOWARD_ICON);
  moveTowardSlot.name = MOVE_TOWARD_NAME;
  const moveAwaySlot = iconed(modifier("modifier.movement.away", "away from"), AWAY_ICON);
  moveAwaySlot.name = MOVE_AWAY_NAME;
  const moveTargetArgs: TileArgSpec[] = [
    conditional(MOVE_TOWARD_NAME, moveTargetSlot(), conditional(MOVE_AWAY_NAME, moveTargetSlot())),
  ];
  const moveRelationalArgs: TileArgSpec[] = [
    optional(moveTowardSlot),
    optional(moveAwaySlot),
    optional(iconed(modifier("modifier.movement.wander", "wander", tileLanguage("around")), WANDER_ICON)),
  ];
  const moveSpec = new TileSpec(
    TILE_KIND_ACTUATOR,
    moveTargetArgs.concat(moveSpeedArgs).concat(directionModifiers()).concat(moveRelationalArgs),
    ""
  );
  moveSpec.label = "move";
  moveSpec.icon = MOVE_ICON;
  arcadePack.bind(MOVE_TILE, new MoveActuator(), moveSpec);

  const bumpSpec = new TileSpec(TILE_KIND_SENSOR, [filterSlot()].concat(positionSlots()), TYPE_SPRITE);
  bumpSpec.label = "bump";
  bumpSpec.icon = BUMP_ICON;
  bumpSpec.outputs = [spriteOutput(BUMPED_OUTPUT, "bumped sprite", BUMP_ICON)];
  bumpSpec.language.bare = "anything";
  arcadePack.bind(BUMP_TILE, new BumpSensor(), bumpSpec);

  const inRangeSpec = new TileSpec(TILE_KIND_SENSOR, rangeSensorArgs(), TYPE_SPRITE);
  inRangeSpec.label = "in range";
  inRangeSpec.icon = IN_RANGE_ICON;
  inRangeSpec.outputs = [spriteOutput(IN_RANGE_OUTPUT, "sprite in range", IN_RANGE_ICON)];
  inRangeSpec.language.frame = SENTENCE_FRAME_STATE;
  inRangeSpec.language.bare = "of anything";
  arcadePack.bind(IN_RANGE_TILE, new RangeSensor(true, IN_RANGE_OUTPUT), inRangeSpec);

  const outOfRangeSpec = new TileSpec(TILE_KIND_SENSOR, rangeSensorArgs(), TYPE_SPRITE);
  outOfRangeSpec.label = "out of range";
  outOfRangeSpec.icon = OUT_OF_RANGE_ICON;
  outOfRangeSpec.outputs = [spriteOutput(OUT_OF_RANGE_OUTPUT, "sprite out of range", OUT_OF_RANGE_ICON)];
  outOfRangeSpec.language.frame = SENTENCE_FRAME_STATE;
  outOfRangeSpec.language.bare = "of anything";
  arcadePack.bind(OUT_OF_RANGE_TILE, new RangeSensor(false, OUT_OF_RANGE_OUTPUT), outOfRangeSpec);

  const lookLikeSpec = new TileSpec(
    TILE_KIND_ACTUATOR,
    [choice([anonymousArg(TYPE_IMAGE), anonymousArg(TYPE_SPRITE)])],
    ""
  );
  lookLikeSpec.label = "look like";
  lookLikeSpec.icon = LOOK_LIKE_ICON;
  arcadePack.bind(LOOK_LIKE_TILE, new LookLikeActuator(), lookLikeSpec);

  arcadePack.defineCoreTileIcon("tile.sensor->on-page-entered", CORE_ON_PAGE_ENTERED_ICON);
  arcadePack.defineCoreTileIcon("tile.actuator->switch-page", CORE_SWITCH_PAGE_ICON);
  arcadePack.defineCoreTileIcon("tile.actuator->restart-page", CORE_RESTART_PAGE_ICON);
  arcadePack.defineCoreTileIcon("tile.sensor->current-page", CORE_CURRENT_PAGE_ICON);
  arcadePack.defineCoreTileIcon("tile.sensor->previous-page", CORE_PREVIOUS_PAGE_ICON);
  arcadePack.defineCoreTileIcon("tile.sensor->sensor.timeout", CORE_TIMER_ICON);
  arcadePack.defineCoreTileIcon("tile.op->and", CORE_AND_ICON);
  arcadePack.defineCoreTileIcon("tile.op->or", CORE_OR_ICON);
  arcadePack.defineCoreTileIcon("tile.op->not", CORE_NOT_ICON);
  arcadePack.defineCoreTileIcon("tile.op->eq", CORE_EQUAL_ICON);
  arcadePack.defineCoreTileIcon("tile.op->ne", CORE_NOT_EQUAL_ICON);
  arcadePack.defineCoreTileIcon("tile.op->lt", CORE_LESS_ICON);
  arcadePack.defineCoreTileIcon("tile.op->le", CORE_LESS_OR_EQUAL_ICON);
  arcadePack.defineCoreTileIcon("tile.op->gt", CORE_GREATER_ICON);
  arcadePack.defineCoreTileIcon("tile.op->ge", CORE_GREATER_OR_EQUAL_ICON);
  arcadePack.defineCoreTileIcon("tile.op->add", CORE_PLUS_ICON);
  arcadePack.defineCoreTileIcon("tile.op->sub", CORE_MINUS_ICON);
  arcadePack.defineCoreTileIcon("tile.op->mul", CORE_MULTIPLY_ICON);
  arcadePack.defineCoreTileIcon("tile.op->div", CORE_DIVIDE_ICON);
  arcadePack.defineCoreTileIcon("tile.op->neg", CORE_NEGATIVE_ICON);
  arcadePack.defineCoreTileIcon("tile.op->assign", CORE_ASSIGN_ICON);
  arcadePack.defineCoreTileIcon("tile.cf->open-paren", CORE_OPEN_PAREN_ICON);
  arcadePack.defineCoreTileIcon("tile.cf->close-paren", CORE_CLOSE_PAREN_ICON);
  arcadePack.defineCoreTileIcon("tile.sensor->random", CORE_RANDOM_ICON);
  arcadePack.defineCoreTileIcon("tile.literal->boolean:<boolean>->true", CORE_TRUE_ICON);
  arcadePack.defineCoreTileIcon("tile.literal->boolean:<boolean>->false", CORE_FALSE_ICON);
  arcadePack.defineCoreTileIcon("tile.literal->nil:<nil>->nil", CORE_NIL_ICON);
  arcadePack.defineCoreTileIcon("tile.var.factory->boolean", CORE_BOOLEAN_VARIABLE_ICON);
  arcadePack.defineCoreTileIcon("tile.var.factory->number", CORE_NUMBER_VARIABLE_ICON);
  arcadePack.defineCoreTileIcon("tile.var.factory->string", CORE_TEXT_VARIABLE_ICON);
  arcadePack.defineCoreTileIcon("tile.lit.factory->number", CORE_NUMBER_TILE_ICON);
  arcadePack.defineCoreTileIcon("tile.lit.factory->string", CORE_TEXT_TILE_ICON);
}
