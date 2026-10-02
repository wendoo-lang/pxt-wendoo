/**
 * The arcade base pack's vocabulary: the `Vector2` direction type, the
 * `Sprite` type, the `dpad` and `bump` sensors, and the `move` actuator,
 * registered from this file's top-level code at program start.
 *
 * - `WHEN [dpad]` reads player one's dpad as a `Vector2`, or nil while it
 *   points nowhere. Its direction modifiers mask the reading: each admits
 *   its own direction's component, none admits every component, and a
 *   reading masked to nothing is nil.
 * - `WHEN [bump]` reads the sprite the program's sprite touches as a
 *   `Sprite`, or nil while it touches none; when it touches several, the
 *   one {@link bumpedSprite} picks.
 * - `DO [move]` moves the program's sprite. Its direction modifiers specify
 *   the direction: the chosen cardinals sum, scaled to length 1. Given no
 *   modifier, or modifiers that cancel, it moves in the direction it is
 *   given; given none, in the direction its rule's WHEN produced; and when
 *   the WHEN produced no direction either, in {@link MOVE_DEFAULT_DIRECTION}.
 *   It moves at {@link MOVE_DEFAULT_SPEED}, halved by each `slowly`, doubled
 *   by each `quickly`, or at the speed it is given. The direction is held to
 *   the unit circle, so a diagonal moves as fast as a straight line and a
 *   part-deflected analog stick moves slower.
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

  /** Argument-buffer positions of the move's direction, `slowly` count, `quickly` count, speed and direction modifiers. */
  const MOVE_SLOT_DIRECTION = 0;
  const MOVE_SLOT_SLOWLY = 1;
  const MOVE_SLOT_QUICKLY = 2;
  const MOVE_SLOT_SPEED = 3;
  const MOVE_SLOT_UP = 4;
  const MOVE_SLOT_DOWN = 5;
  const MOVE_SLOT_LEFT = 6;
  const MOVE_SLOT_RIGHT = 7;

  /** Whether the modifier slot at `slot` of `args` is filled. */
  function hasModifier(args: Value[], slot: number): boolean {
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
   * @param specified - The direction the move's direction modifiers specify, as {@link cardinalDirection} sums them; `undefined` when they specify none.
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
      const up = hasModifier(args, DPAD_SLOT_UP);
      const down = hasModifier(args, DPAD_SLOT_DOWN);
      const left = hasModifier(args, DPAD_SLOT_LEFT);
      const right = hasModifier(args, DPAD_SLOT_RIGHT);
      const all = !up && !down && !left && !right;
      const masked = maskDirection(readDpadDirection(), all || up, all || down, all || left, all || right);
      return masked.isZero() ? NIL_VALUE : vector2Value(masked);
    }
  }

  /** `sensor.arcade.bump`: the sprite the program's sprite touches now, as {@link bumpedSprite} picks it, or nil while it touches none. */
  class BumpSensor extends HostActionBinding {
    constructor() {
      super(false);
    }

    execSync(ctx: ExecutionContext, args: Value[]): Value {
      const bumped = bumpedSprite((ctx.data as SpriteWorld).sprite);
      return bumped ? spriteValue(bumped) : NIL_VALUE;
    }
  }

  /** `actuator.arcade.move`: records the program's sprite's move for this frame's arbitration. */
  class MoveActuator extends HostActionBinding {
    constructor() {
      super(false);
    }

    execSync(ctx: ExecutionContext, args: Value[]): Value {
      const specified = cardinalDirection(
        hasModifier(args, MOVE_SLOT_UP),
        hasModifier(args, MOVE_SLOT_DOWN),
        hasModifier(args, MOVE_SLOT_LEFT),
        hasModifier(args, MOVE_SLOT_RIGHT)
      );
      const direction = clampToUnitCircle(moveDirection(specified, args[MOVE_SLOT_DIRECTION], getWhenResult(ctx)));
      const speed = moveSpeed(args[MOVE_SLOT_SLOWLY], args[MOVE_SLOT_QUICKLY], args[MOVE_SLOT_SPEED]);
      const sprite = (ctx.data as SpriteWorld).sprite;
      sceneMotionArbiter(game.currentScene()).addIntent(new MoveIntent(sprite, direction, speed, 1));
      return VOID_VALUE;
    }
  }

  const arcadePack = pack(ARCADE_PACK_NAME);

  arcadePack.defineStruct(TYPE_VECTOR2, vector2Fields(), vector2Binding);
  arcadePack.defineStruct(TYPE_SPRITE, [], spriteBinding);

  const dpadSpec = new TileSpec(
    TILE_KIND_SENSOR,
    [
      optional(modifier("modifier.direction.up")),
      optional(modifier("modifier.direction.down")),
      optional(modifier("modifier.direction.left")),
      optional(modifier("modifier.direction.right")),
    ],
    TYPE_VECTOR2
  );
  dpadSpec.label = "dpad";
  arcadePack.bind(DPAD_TILE, new DpadSensor(), dpadSpec);

  const moveDirectionSlot = arg(`anon.${TYPE_VECTOR2}`, TYPE_VECTOR2);
  moveDirectionSlot.anonymous = true;
  moveDirectionSlot.derived = true;
  const moveSpeedSlot = arg("parameter.speed", TYPE_NUMBER);
  moveSpeedSlot.unit = "px/s";
  moveSpeedSlot.range = argRangeAtLeast(0, ARG_ON_EXCEED_CLAMP);
  const moveSpec = new TileSpec(
    TILE_KIND_ACTUATOR,
    [
      optional(moveDirectionSlot),
      optional(
        choice([
          repeatedUpTo(modifier("modifier.slowly"), 1, MOVE_SPEED_STEPS_MAX),
          repeatedUpTo(modifier("modifier.quickly"), 1, MOVE_SPEED_STEPS_MAX),
          moveSpeedSlot,
        ])
      ),
      optional(modifier("modifier.direction.up")),
      optional(modifier("modifier.direction.down")),
      optional(modifier("modifier.direction.left")),
      optional(modifier("modifier.direction.right")),
    ],
    ""
  );
  moveSpec.label = "move";
  arcadePack.bind(MOVE_TILE, new MoveActuator(), moveSpec);

  const bumpSpec = new TileSpec(TILE_KIND_SENSOR, [], TYPE_SPRITE);
  bumpSpec.label = "bump";
  arcadePack.bind(BUMP_TILE, new BumpSensor(), bumpSpec);
}
