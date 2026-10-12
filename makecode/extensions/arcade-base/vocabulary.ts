/**
 * The arcade base pack's vocabulary, registered from this file's top-level
 * code at program start: the pack's struct, asset and brain types with their
 * literals, accessors, variable factories and labels; its sensors and
 * actuators with their call specs and host bindings; and its overloads of
 * the core operators. In the simulator only, {@link attachArcadeBaseIcons}
 * gives every entry its icon, and {@link attachArcadeBaseDocs} gives every
 * documented entry its docs page; on hardware both compile to nothing.
 */
namespace wendoo {
  /** Name the arcade base pack's registrations are reported under. */
  //% hidden
  export const ARCADE_PACK_NAME = "arcade";

  /** Tile name of the dpad sensor. */
  //% hidden
  export const DPAD_TILE = "sensor.arcade.dpad";

  /** Tile name of the A button sensor. */
  //% hidden
  export const BUTTON_A_TILE = "sensor.arcade.button-a";

  /** Tile name of the B button sensor. */
  //% hidden
  export const BUTTON_B_TILE = "sensor.arcade.button-b";

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

  /** Tile name of the myself sensor. */
  //% hidden
  export const MYSELF_TILE = "sensor.arcade.myself";

  /** Tile name of the add-score actuator. */
  //% hidden
  export const ADD_SCORE_TILE = "actuator.arcade.add-score";

  /** Tile name of the game-over actuator. */
  //% hidden
  export const GAME_OVER_TILE = "actuator.arcade.game-over";

  /** Tile name of the destroy actuator. */
  //% hidden
  export const DESTROY_TILE = "actuator.arcade.destroy";

  /** Tile name of the destroyed sensor. */
  //% hidden
  export const DESTROYED_TILE = "sensor.arcade.destroyed";

  /** Tile name of the say actuator. */
  //% hidden
  export const SAY_TILE = "actuator.arcade.say";

  /** Tile name of the show-text actuator. */
  //% hidden
  export const SHOW_TEXT_TILE = "actuator.arcade.show-text";

  /** Tile name of the ask actuator. */
  //% hidden
  export const ASK_TILE = "actuator.arcade.ask";

  /** Tile name of the play-sound actuator. */
  //% hidden
  export const PLAY_SOUND_TILE = "actuator.arcade.play-sound";

  /** Tile name of the play-tone actuator. */
  //% hidden
  export const PLAY_TONE_TILE = "actuator.arcade.play-tone";

  /** Tile name of the stop-sounds actuator. */
  //% hidden
  export const STOP_SOUNDS_TILE = "actuator.arcade.stop-sounds";

  /** Name of the bump sensor's output: the sprite it reads. */
  //% hidden
  export const BUMPED_OUTPUT = "bumped";

  /** Name of the in-range sensor's output: the sprite it reads. */
  //% hidden
  export const IN_RANGE_OUTPUT = "inRange";

  /** Name of the out-of-range sensor's output: the sprite it reads. */
  //% hidden
  export const OUT_OF_RANGE_OUTPUT = "outOfRange";

  /** Name of the ask actuator's output: the answer its question was given. */
  //% hidden
  export const ANSWER_OUTPUT = "answer";

  /** Range the in-range and out-of-range sensors sense within when they are given none, in pixels between sprite centers. */
  //% hidden
  export const DEFAULT_SENSE_RANGE = 60;

  /** Speed a move goes at when nothing sets it, in pixels per second. */
  //% hidden
  export const MOVE_DEFAULT_SPEED = 100;

  /** Direction a move goes in when it is given none and its rule's WHEN produced none: rightward. */
  //% hidden
  export const MOVE_DEFAULT_DIRECTION = new DirectionVector(1, 0);

  /** How long a say keeps its sprite's bubble up after it is said, when it is given no duration, in seconds. */
  //% hidden
  export const SAY_DEFAULT_DURATION = 5;

  /** Pitch a play tone plays when it is given none, in hertz. */
  //% hidden
  export const TONE_DEFAULT_FREQUENCY = 440;

  /** How long a play tone plays when it is given no duration, in seconds. */
  //% hidden
  export const TONE_DEFAULT_DURATION = 0.5;

  /** Loudness a play tone plays at when it is given no volume, from 0 (silent) to 1 (full). */
  //% hidden
  export const TONE_DEFAULT_VOLUME = 1;

  /** Loudness Arcade's shaped tones take for full volume: the top of their 0 to 255 scale. */
  const TONE_FULL_VOLUME = 255;

  /**
   * Shortest shaped tone, in milliseconds, Arcade shapes with a vibrato,
   * tremolo or warble: one step of the effect. A shorter one plays with no
   * effect.
   */
  const TONE_EFFECT_MIN_MS = 5;

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

  /** Argument-buffer position of the dpad's player, after its direction modifiers. */
  const DPAD_SLOT_PLAYER = 4;

  /** Argument-buffer position of each button sensor's player. */
  const BUTTON_SLOT_PLAYER = 0;

  /** Argument-buffer positions of the add-score actuator's amount and player. */
  const ADD_SCORE_SLOT_AMOUNT = 0;
  const ADD_SCORE_SLOT_PLAYER = 1;

  /**
   * Argument-buffer positions of the game-over actuator's `win` modifier, its
   * player, its effect and its sound. Its `lose` modifier fills the position
   * between `win` and the player, which the actuator does not read: a game
   * over not won is lost.
   */
  const GAME_OVER_SLOT_WIN = 0;
  const GAME_OVER_SLOT_PLAYER = 2;
  const GAME_OVER_SLOT_EFFECT = 3;
  const GAME_OVER_SLOT_SOUND = 4;

  /** Argument-buffer positions of the destroy actuator's target sprite, its particle effect and its duration. */
  const DESTROY_SLOT_TARGET = 0;
  const DESTROY_SLOT_EFFECT = 1;
  const DESTROY_SLOT_DURATION = 2;

  /** Argument-buffer positions of the say actuator's text and its duration. */
  const SAY_SLOT_TEXT = 0;
  const SAY_SLOT_DURATION = 1;

  /** Argument-buffer positions of the show-text actuator's text and its `top`, `center` and `full` layout modifiers. */
  const SHOW_TEXT_SLOT_TEXT = 0;
  const SHOW_TEXT_SLOT_TOP = 1;
  const SHOW_TEXT_SLOT_CENTER = 2;
  const SHOW_TEXT_SLOT_FULL = 3;

  /** Argument-buffer position of the ask actuator's question. */
  const ASK_SLOT_QUESTION = 0;

  /** Argument-buffer positions of the play-sound actuator's sound, its song and its `in background` modifier; `looping` follows `in background`. */
  const PLAY_SOUND_SLOT_SOUND = 0;
  const PLAY_SOUND_SLOT_SONG = 1;
  const PLAY_SOUND_SLOT_BACKGROUND = 2;

  /** Argument-buffer positions of the play-tone actuator's pitch, its `to`, its duration and its volume. */
  const PLAY_TONE_SLOT_FREQUENCY = 0;
  const PLAY_TONE_SLOT_TO = 1;
  const PLAY_TONE_SLOT_DURATION = 2;
  const PLAY_TONE_SLOT_VOLUME = 3;

  /** Argument-buffer position of the play-tone actuator's first wave modifier; `square`, `sawtooth`, `triangle` and `noise` follow `sine`. */
  const PLAY_TONE_SLOT_SINE = 4;

  /** Argument-buffer position of the play-tone actuator's first effect modifier; `tremolo` and `warble` follow `vibrato`. */
  const PLAY_TONE_SLOT_VIBRATO = 9;

  /** Argument-buffer position of the play-tone actuator's `in background` modifier; `looping` follows it. */
  const PLAY_TONE_SLOT_BACKGROUND = 12;

  /** Offset of the `looping` modifier from a play actuator's `in background` modifier. */
  const PLAYBACK_LOOPING = 1;

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
   * The speed a move goes at, in pixels per second: the speed argument when
   * it carries a number -- {@link ENGINE_MAX_SPEED} for a positive infinity,
   * and 0 for a not-a-number or a number below 0, a negative infinity
   * included; else {@link MOVE_DEFAULT_SPEED} doubled per `quickly` when
   * there is one; else halved per `slowly`. At most
   * {@link MOVE_SPEED_STEPS_MAX} modifiers are counted.
   *
   * @param slowly - The `slowly` modifier slot: its count, or nil.
   * @param quickly - The `quickly` modifier slot: its count, or nil.
   * @param speed - The speed argument: a number, or nil.
   */
  //% hidden
  export function moveSpeed(slowly: Value, quickly: Value, speed: Value): number {
    if (speed !== undefined && speed.t === ValueTag.Number) {
      if (speed.num > 0 && !isFiniteNumber(speed.num)) {
        return ENGINE_MAX_SPEED;
      }
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

  /**
   * `sensor.arcade.dpad`: the dpad direction of the player its player slot
   * names, else player one's, masked by the direction modifiers, or nil when
   * the mask leaves nothing. An argument buffer ending before the player
   * slot reads player one's dpad.
   */
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
      const direction = readDpadDirection(slotPlayerNumber(args[DPAD_SLOT_PLAYER]));
      const masked = maskDirection(direction, all || up, all || down, all || left, all || right);
      return masked.isZero() ? NIL_VALUE : vector2Value(masked);
    }
  }

  /**
   * `sensor.arcade.button-a` and `sensor.arcade.button-b`: `true` while the
   * button of the player its player slot names, else player one's, is held,
   * and nil otherwise.
   */
  class ButtonSensor extends HostActionBinding {
    /** The button this sensor reads: `ControllerButton.A` or `ControllerButton.B`. */
    private button: ControllerButton;

    /**
     * @param button - The button the sensor reads: `ControllerButton.A` or `ControllerButton.B`.
     */
    constructor(button: ControllerButton) {
      super(false);
      this.button = button;
    }

    execSync(ctx: ExecutionContext, args: Value[]): Value {
      return readButtonHeld(slotPlayerNumber(args[BUTTON_SLOT_PLAYER]), this.button) ? TRUE_VALUE : NIL_VALUE;
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
   * `attachment`, as {@link spritesRunning} finds them, and none when no sprite
   * does. `undefined` when the filter is empty -- every sprite is admitted.
   *
   * @param attachment - Attachment of the sprite the sensor reads for.
   * @param args - The sensor's argument buffer.
   */
  function filterAdmits(attachment: SpriteAttachment, args: Value[]): (other: Sprite) => boolean {
    if (isFilled(args, FILTER_SLOT_IMAGE)) {
      const wanted = imageOf(args[FILTER_SLOT_IMAGE]);
      return wanted ? (other: Sprite) => other.image.equals(wanted) : admitsNone;
    }
    if (isFilled(args, FILTER_SLOT_SPRITE)) {
      const wanted = spriteOf(args[FILTER_SLOT_SPRITE]);
      return wanted ? (other: Sprite) => other === wanted : admitsNone;
    }
    if (isFilled(args, FILTER_SLOT_BRAIN)) {
      const runners = spritesRunning(attachment, args[FILTER_SLOT_BRAIN]);
      return runners.length > 0 ? (other: Sprite) => runners.indexOf(other) >= 0 : admitsNone;
    }
    return undefined;
  }

  /**
   * Which sprites a proximity sensor reads among, given its argument buffer
   * `args` whose positional modifiers start at `positionSlot`: those its
   * filter admits, as {@link filterAdmits} reads it, whose center lies
   * strictly above the center of the sprite `attachment` holds when `above` is
   * given, strictly below it when `below` is, strictly left of it when
   * `left of` is, and strictly right of it when `right of` is -- every given
   * condition at once. `undefined` when the filter is empty and no
   * positional modifier is given -- every sprite is read among.
   *
   * @param attachment - Attachment of the sprite the sensor reads for.
   * @param args - The sensor's argument buffer.
   * @param positionSlot - Argument-buffer position of the sensor's first positional modifier.
   */
  function proximityAdmits(
    attachment: SpriteAttachment,
    args: Value[],
    positionSlot: number
  ): (other: Sprite) => boolean {
    const filter = filterAdmits(attachment, args);
    const above = isFilled(args, positionSlot + POSITION_ABOVE);
    const below = isFilled(args, positionSlot + POSITION_BELOW);
    const left = isFilled(args, positionSlot + POSITION_LEFT);
    const right = isFilled(args, positionSlot + POSITION_RIGHT);
    if (!above && !below && !left && !right) {
      return filter;
    }
    const sprite = attachment.sprite;
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
      const attachment = ctx.data as SpriteAttachment;
      const bumped = bumpedSprite(attachment.sprite, proximityAdmits(attachment, args, BUMP_SLOT_POSITION));
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
      const attachment = ctx.data as SpriteAttachment;
      const sprite = attachment.sprite;
      const nearest = nearestSprite(sprite, proximityAdmits(attachment, args, RANGE_SLOT_POSITION));
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

  /**
   * `actuator.arcade.add-score`: adds to the score of the player its player
   * slot names, else player one's, the number its amount slot holds, else 1,
   * as {@link PlayerBinding.addScore} adds it.
   */
  class AddScoreActuator extends HostActionBinding {
    constructor() {
      super(false);
    }

    execSync(ctx: ExecutionContext, args: Value[]): Value {
      playerBinding.addScore(slotPlayerNumber(args[ADD_SCORE_SLOT_PLAYER]), args[ADD_SCORE_SLOT_AMOUNT]);
      return VOID_VALUE;
    }
  }

  /**
   * `actuator.arcade.game-over`: ends the game through Arcade's own game
   * over. Given a player, that player wins, as `game.gameOverPlayerWin` ends
   * the game, whatever its `win` or `lose` says; else the game is won given
   * `win`, as `game.gameOver(true)` ends it, and lost otherwise, as
   * `game.gameOver(false)` does. Given an effect or a sound naming one of
   * Arcade's, it first makes it the effect or sound of the outcome it ends
   * the game with; given none, or one naming nothing, as
   * {@link EffectBinding.effectOf} and {@link SoundBinding.melodyOf} read
   * them, that outcome keeps the one it has. Arcade ends a game once: a game
   * over after the first sets the effect and sound and ends nothing.
   */
  class GameOverActuator extends HostActionBinding {
    constructor() {
      super(false);
    }

    execSync(ctx: ExecutionContext, args: Value[]): Value {
      const player = playerNumberOf(args[GAME_OVER_SLOT_PLAYER]);
      const win = player > 0 || isFilled(args, GAME_OVER_SLOT_WIN);
      const effect = effectBinding.effectOf(args[GAME_OVER_SLOT_EFFECT]);
      const melody = soundBinding.melodyOf(args[GAME_OVER_SLOT_SOUND]);
      if (effect) {
        game.setGameOverEffect(win, effect);
      }
      if (melody) {
        game.setGameOverPlayable(win, music.melodyPlayable(melody), false);
      }
      if (player > 0) {
        game.gameOverPlayerWin(player);
      } else {
        game.gameOver(win);
      }
      return VOID_VALUE;
    }
  }

  /**
   * The duration a destroy is given, in milliseconds as Arcade's destroy
   * takes it: the duration argument, in seconds, times 1000 when it carries
   * a number -- 0 for a not-a-number or a number below 0; `undefined` when it
   * carries none.
   *
   * @param duration - The duration argument, in seconds: a number, or nil.
   */
  function destroyDurationMs(duration: Value): number {
    if (duration === undefined || duration.t !== ValueTag.Number) {
      return undefined;
    }
    return duration.num > 0 ? duration.num * 1000 : 0;
  }

  /**
   * `actuator.arcade.destroy`: destroys the sprite its target slot holds,
   * else the program's own sprite, through Arcade's own `sprites.destroy`.
   * Given a particle effect naming one of Arcade's, as
   * {@link ParticleEffectBinding.particleEffectOf} reads it, the sprite
   * vanishes in that effect over its duration, as {@link destroyDurationMs}
   * reads it, else over the effect's own; given none, or one naming nothing,
   * it is gone at once and the duration is ignored. A target already
   * destroyed stays as it is. The sprite reads as destroyed from the call
   * on, whatever effect plays.
   */
  class DestroyActuator extends HostActionBinding {
    constructor() {
      super(false);
    }

    execSync(ctx: ExecutionContext, args: Value[]): Value {
      let target = (ctx.data as SpriteAttachment).sprite;
      if (isFilled(args, DESTROY_SLOT_TARGET)) {
        target = spriteOf(args[DESTROY_SLOT_TARGET]);
      }
      if (!target) {
        return VOID_VALUE;
      }
      const effect = particleEffectBinding.particleEffectOf(args[DESTROY_SLOT_EFFECT]);
      sprites.destroy(target, effect, destroyDurationMs(args[DESTROY_SLOT_DURATION]));
      return VOID_VALUE;
    }
  }

  /**
   * How long a say keeps its sprite's bubble up after it is said, in
   * milliseconds: the duration argument, in seconds, times 1000 when it
   * carries a number -- 0 for a not-a-number or a number below 0; else
   * {@link SAY_DEFAULT_DURATION} seconds.
   *
   * @param duration - The duration argument, in seconds: a number, or nil.
   */
  function sayDurationMs(duration: Value): number {
    if (duration === undefined || duration.t !== ValueTag.Number) {
      return SAY_DEFAULT_DURATION * 1000;
    }
    return duration.num > 0 ? duration.num * 1000 : 0;
  }

  /**
   * `actuator.arcade.say`: says the text its text slot holds, else the
   * value its rule's WHEN produced, through the program's own sprite's
   * speech bubble, as its scene's {@link SceneSpeech} says it, the bubble
   * kept up for the duration {@link sayDurationMs} reads after the say. A
   * number, a text or a switch is said as {@link spokenText} prints it; any
   * other value says nothing and is logged as {@link SAY_UNSPEAKABLE}, the
   * first time in this game run. A destroyed sprite says nothing.
   */
  class SayActuator extends HostActionBinding {
    /** Whether a value saying nothing has been logged in this game run. */
    private unspeakableLogged = false;

    constructor() {
      super(false);
    }

    execSync(ctx: ExecutionContext, args: Value[]): Value {
      const sprite = (ctx.data as SpriteAttachment).sprite;
      if (isDestroyed(sprite)) {
        return VOID_VALUE;
      }
      const said = isFilled(args, SAY_SLOT_TEXT) ? args[SAY_SLOT_TEXT] : getWhenResult(ctx);
      const text = spokenText(said);
      if (text === undefined) {
        if (!this.unspeakableLogged) {
          this.unspeakableLogged = true;
          debugLog(`wendoo ${SAY_UNSPEAKABLE}`);
        }
        return VOID_VALUE;
      }
      sceneSpeech(game.currentScene()).say(sprite, text, sayDurationMs(args[SAY_SLOT_DURATION]), ctx.time);
      return VOID_VALUE;
    }
  }

  /**
   * The text a show text or an ask shows, read from its text slot, else from
   * its rule's WHEN result, as {@link spokenText} prints it. One reader
   * serves both tiles, so a value showing nothing is logged as
   * {@link DIALOG_UNSPEAKABLE} once in a game run, whichever tile meets it
   * first.
   */
  class DialogTextReader {
    /** Whether a value showing nothing has been logged in this game run. */
    private unspeakableLogged = false;

    constructor() {}

    /**
     * The text the dialog tile running in `ctx` shows: the value its text
     * slot at `slot` of `args` holds, else the value its rule's WHEN
     * produced, printed as {@link spokenText} prints it; `undefined` for a
     * value it prints nothing for, logged the first time in this game run.
     *
     * @param ctx - Execution context of the dialog tile.
     * @param args - The tile's argument buffer.
     * @param slot - Argument-buffer position of the tile's text.
     */
    read(ctx: ExecutionContext, args: Value[], slot: number): string {
      const text = spokenText(isFilled(args, slot) ? args[slot] : getWhenResult(ctx));
      if (text === undefined && !this.unspeakableLogged) {
        this.unspeakableLogged = true;
        debugLog(`wendoo ${DIALOG_UNSPEAKABLE}`);
      }
      return text;
    }
  }

  /**
   * Where a show text's box goes, read from its layout modifiers in `args`:
   * the top of the screen given `top`, its center given `center`, the whole
   * screen given `full`, else the bottom.
   *
   * @param args - The show-text actuator's argument buffer.
   */
  function showTextLayout(args: Value[]): DialogLayout {
    if (isFilled(args, SHOW_TEXT_SLOT_TOP)) {
      return DialogLayout.Top;
    }
    if (isFilled(args, SHOW_TEXT_SLOT_CENTER)) {
      return DialogLayout.Center;
    }
    return isFilled(args, SHOW_TEXT_SLOT_FULL) ? DialogLayout.Full : DialogLayout.Bottom;
  }

  /**
   * `actuator.arcade.show-text`: shows the text {@link DialogTextReader}
   * reads in a paged text box laid out as {@link showTextLayout} reads it,
   * through its scene's {@link SceneDialogs}, after every dialog asked for
   * before it. Asynchronous: its handle resolves once the box is dismissed
   * and neither A nor down, the buttons that close it, reads pressed, so the
   * rule holds until then. An empty text, or a value showing nothing, opens
   * no box and resolves the handle at once.
   */
  class ShowTextActuator extends HostActionBinding {
    /** Reads the text the box shows. */
    private reader: DialogTextReader;

    /**
     * @param reader - Reads the text the box shows.
     */
    constructor(reader: DialogTextReader) {
      super(true);
      this.reader = reader;
    }

    execAsync(ctx: ExecutionContext, args: Value[], handle: AsyncHandle): void {
      const text = this.reader.read(ctx, args, SHOW_TEXT_SLOT_TEXT);
      if (!text) {
        handle.resolve(VOID_VALUE);
        return;
      }
      sceneDialogs(game.currentScene()).showText(text, showTextLayout(args), () => handle.resolve(VOID_VALUE));
    }
  }

  /**
   * `actuator.arcade.ask`: asks the question {@link DialogTextReader} reads,
   * through its scene's {@link SceneDialogs}, after every dialog asked for
   * before it. Asynchronous: once the question is answered and the button
   * that answered it is let go, it writes the answer -- `true` for A, `false`
   * for B -- to its {@link ANSWER_OUTPUT} output on its rule and then
   * resolves its handle, so the rule holds until then and the rules below it
   * read the answer once it runs on. The answer is written on the dialog
   * queue's fiber in the step that resolves the handle, before that fiber
   * yields. An empty question, or a value showing nothing, asks nothing: it
   * writes nil to the output and resolves the handle at once.
   */
  class AskActuator extends HostActionBinding {
    /** Reads the question asked. */
    private reader: DialogTextReader;

    /**
     * @param reader - Reads the question asked.
     */
    constructor(reader: DialogTextReader) {
      super(true);
      this.reader = reader;
    }

    execAsync(ctx: ExecutionContext, args: Value[], handle: AsyncHandle): void {
      const question = this.reader.read(ctx, args, ASK_SLOT_QUESTION);
      if (!question) {
        setActionOutput(ctx, TYPE_ID_BOOLEAN, ANSWER_OUTPUT, NIL_VALUE);
        handle.resolve(VOID_VALUE);
        return;
      }
      const ruleVars = ctx.services.ruleVars;
      const ruleFuncId = ctx.currentRuleFuncId;
      sceneDialogs(game.currentScene()).ask(question, (answer: boolean) => {
        ruleVars.setByName(ruleFuncId, actionOutputVariableName(TYPE_ID_BOOLEAN, ANSWER_OUTPUT), mkBoolean(answer));
        handle.resolve(VOID_VALUE);
      });
    }
  }

  /**
   * Play `playable` for the play actuator running in `ctx` as its playback
   * modifiers in `args` say, through its scene's {@link SceneSounds}, and
   * settle `handle`. Given `in background`, a copy plays in the background
   * for the actuator's call site and the handle resolves at once; given
   * `looping`, the call site's loop starts and the handle resolves at once;
   * either starts nothing while the call site's last copy still plays or its
   * loop still runs. Given neither, the sound plays to its end and the handle
   * resolves once it has.
   *
   * @param ctx - Execution context of the play actuator.
   * @param args - The actuator's argument buffer.
   * @param backgroundSlot - Argument-buffer position of the actuator's `in background` modifier, `looping` following it.
   * @param playable - The sound to play.
   * @param handle - The actuator's handle.
   */
  function playThrough(
    ctx: ExecutionContext,
    args: Value[],
    backgroundSlot: number,
    playable: music.Playable,
    handle: AsyncHandle
  ): void {
    const sounds = sceneSounds(game.currentScene());
    const background = isFilled(args, backgroundSlot);
    if (background || isFilled(args, backgroundSlot + PLAYBACK_LOOPING)) {
      const site = (ctx.data as SpriteAttachment).sounds.site(ctx.currentCallSiteId);
      if (background) {
        sounds.playInBackground(site, playable);
      } else {
        sounds.playLooping(site, playable);
      }
      handle.resolve(VOID_VALUE);
      return;
    }
    sounds.playUntilDone(playable, () => handle.resolve(VOID_VALUE));
  }

  /**
   * `actuator.arcade.play-sound`: plays, through {@link playThrough}, the
   * project song its song slot names, as {@link songOf} makes it, else the
   * Arcade melody its sound slot names, as {@link SoundBinding.melodyOf}
   * reads it, else `ba ding`. Each play plays a copy of the melody, or a
   * playable of the song, of its own, so plays of one sound from different
   * places overlap. A sound naming no melody, or a song naming no song the
   * project holds, plays nothing and resolves the handle at once.
   */
  class PlaySoundActuator extends HostActionBinding {
    constructor() {
      super(true);
    }

    execAsync(ctx: ExecutionContext, args: Value[], handle: AsyncHandle): void {
      let playable: music.Playable;
      if (isFilled(args, PLAY_SOUND_SLOT_SONG)) {
        playable = songOf(args[PLAY_SOUND_SLOT_SONG]);
      } else {
        let melody = music.baDing;
        if (isFilled(args, PLAY_SOUND_SLOT_SOUND)) {
          melody = soundBinding.melodyOf(args[PLAY_SOUND_SLOT_SOUND]);
        }
        if (melody) {
          playable = music.melodyPlayable(new music.Melody(melody.text));
        }
      }
      if (!playable) {
        handle.resolve(VOID_VALUE);
        return;
      }
      playThrough(ctx, args, PLAY_SOUND_SLOT_BACKGROUND, playable, handle);
    }
  }

  /** The wave shape each wave modifier of the play-tone actuator picks, in slot order from `sine`. */
  const TONE_WAVES = [WaveShape.Sine, WaveShape.Square, WaveShape.Sawtooth, WaveShape.Triangle, WaveShape.Noise];

  /** The effect each effect modifier of the play-tone actuator picks, in slot order from `vibrato`. */
  const TONE_EFFECTS = [SoundExpressionEffect.Vibrato, SoundExpressionEffect.Tremolo, SoundExpressionEffect.Warble];

  /** The position, counted from `first`, of the one filled slot among the `count` slots of `args` from `first`, or -1 when none is filled. */
  function filledAmong(args: Value[], first: number, count: number): number {
    for (let i = 0; i < count; i++) {
      if (isFilled(args, first + i)) {
        return i;
      }
    }
    return -1;
  }

  /**
   * `actuator.arcade.play-tone`: plays a tone through {@link playThrough}:
   * its pitch slot's number of hertz, else {@link TONE_DEFAULT_FREQUENCY},
   * for its duration in seconds, else {@link TONE_DEFAULT_DURATION}, at its
   * volume, else {@link TONE_DEFAULT_VOLUME}. Given no `to`, no wave, no
   * effect and full volume, the tone is Arcade's own plain tone, as
   * `music.tonePlayable` plays it; otherwise it is Arcade's shaped tone, as
   * `music.createSoundEffect` makes it: sweeping in a straight line from the
   * pitch to `to`'s, in the wave its wave modifier picks, else sine, with
   * the effect its effect modifier picks, else none -- none, too, for a tone
   * shorter than one step of the effect -- at the volume times 255 from
   * start to end. The pitch, `to` and the duration are held at 0 or above
   * and the volume from 0 to 1; a number that is no finite number reads as
   * its slot's default, `to`'s being none, and is logged as
   * {@link TONE_UNUSABLE}, the first time in this game run. A tone lasting
   * no time plays nothing and resolves the handle at once.
   */
  class PlayToneActuator extends HostActionBinding {
    /** Whether a number that is no finite number has been logged in this game run. */
    private unusableLogged = false;

    constructor() {
      super(true);
    }

    execAsync(ctx: ExecutionContext, args: Value[], handle: AsyncHandle): void {
      const hz = Math.max(0, this.numberOr(args[PLAY_TONE_SLOT_FREQUENCY], TONE_DEFAULT_FREQUENCY));
      const to = this.numberOr(args[PLAY_TONE_SLOT_TO], undefined);
      const ms = Math.max(0, this.numberOr(args[PLAY_TONE_SLOT_DURATION], TONE_DEFAULT_DURATION)) * 1000;
      const volume = Math.min(1, Math.max(0, this.numberOr(args[PLAY_TONE_SLOT_VOLUME], TONE_DEFAULT_VOLUME)));
      if (ms <= 0) {
        handle.resolve(VOID_VALUE);
        return;
      }
      const wave = filledAmong(args, PLAY_TONE_SLOT_SINE, TONE_WAVES.length);
      const shaping = filledAmong(args, PLAY_TONE_SLOT_VIBRATO, TONE_EFFECTS.length);
      let playable: music.Playable;
      if (to === undefined && wave < 0 && shaping < 0 && volume === 1) {
        playable = music.tonePlayable(hz, ms);
      } else {
        const level = Math.round(volume * TONE_FULL_VOLUME);
        const effect = shaping < 0 || ms < TONE_EFFECT_MIN_MS ? SoundExpressionEffect.None : TONE_EFFECTS[shaping];
        playable = music.createSoundEffect(
          wave < 0 ? WaveShape.Sine : TONE_WAVES[wave],
          hz,
          to === undefined ? hz : Math.max(0, to),
          level,
          level,
          ms,
          effect,
          InterpolationCurve.Linear
        );
      }
      playThrough(ctx, args, PLAY_TONE_SLOT_BACKGROUND, playable, handle);
    }

    /**
     * The number `value` carries, or `fallback` when it carries none or one
     * that is no finite number, the latter logged as {@link TONE_UNUSABLE}
     * the first time in this game run.
     */
    private numberOr(value: Value, fallback: number): number {
      if (value === undefined || value.t !== ValueTag.Number) {
        return fallback;
      }
      if (!isFiniteNumber(value.num)) {
        if (!this.unusableLogged) {
          this.unusableLogged = true;
          debugLog(`wendoo ${TONE_UNUSABLE}`);
        }
        return fallback;
      }
      return value.num;
    }
  }

  /** `actuator.arcade.stop-sounds`: stops every sound playing and every loop running, through its scene's {@link SceneSounds}. */
  class StopSoundsActuator extends HostActionBinding {
    constructor() {
      super(false);
    }

    execSync(ctx: ExecutionContext, args: Value[]): Value {
      sceneSounds(game.currentScene()).stopAll();
      return VOID_VALUE;
    }
  }

  /**
   * `sensor.arcade.destroyed`: `true` while the program's own sprite is
   * destroyed, and nil otherwise. A program sees its sprite destroyed only in
   * its final think.
   */
  class DestroyedSensor extends HostActionBinding {
    constructor() {
      super(false);
    }

    execSync(ctx: ExecutionContext, args: Value[]): Value {
      return (ctx.data as SpriteAttachment).hasEnded() ? TRUE_VALUE : NIL_VALUE;
    }
  }

  /** `sensor.arcade.myself`: the `Sprite` value standing for the program's own sprite. */
  class MyselfSensor extends HostActionBinding {
    constructor() {
      super(false);
    }

    execSync(ctx: ExecutionContext, args: Value[]): Value {
      return spriteValue((ctx.data as SpriteAttachment).sprite);
    }
  }

  /**
   * An overload of the core equality or inequality operator over two values
   * of one type: equality answers whether `same` holds of its two operands,
   * inequality the opposite.
   */
  class EqualityOverload extends HostFunction {
    /** Whether the operands are the same value of the overload's type. */
    private same: (a: Value, b: Value) => boolean;
    /** `true` for the equality operator's overload, `false` for the inequality operator's. */
    private equality: boolean;

    /**
     * @param same - Whether two operands are the same value of the overload's type.
     * @param equality - `true` for the equality operator's overload, `false` for the inequality operator's.
     */
    constructor(same: (a: Value, b: Value) => boolean, equality: boolean) {
      super();
      this.same = same;
      this.equality = equality;
    }

    exec(ctx: ExecutionContext, args: Value[]): Value {
      const lhs = args.length > 0 ? args[0] : NIL_VALUE;
      const rhs = args.length > 1 ? args[1] : NIL_VALUE;
      return mkBoolean(this.same(lhs, rhs) === this.equality);
    }
  }

  /**
   * Add the core equality and inequality operators' overloads over two
   * values of the type `type` to the pack `target`, `same` telling whether
   * two operands are the same value of it.
   */
  function defineEquality(target: Pack, type: string, same: (a: Value, b: Value) => boolean): void {
    const spec = new OperatorSpec([type, type], TYPE_BOOLEAN);
    target.overloadOperator(OPERATOR_EQUAL_TO, new EqualityOverload(same, true), spec);
    target.overloadOperator(OPERATOR_NOT_EQUAL_TO, new EqualityOverload(same, false), spec);
  }

  /**
   * The core addition or subtraction operator's overload over two `Vector2`
   * operands: a fresh `Vector2` holding the component-wise sum, or the
   * component-wise difference of the left operand less the right. Nil when
   * either operand holds no point, as {@link vector2Of} reads it.
   */
  class Vector2SumOverload extends HostFunction {
    /** `true` for the subtraction operator's overload, `false` for the addition operator's. */
    private subtract: boolean;

    /**
     * @param subtract - `true` for the subtraction operator's overload, `false` for the addition operator's.
     */
    constructor(subtract: boolean) {
      super();
      this.subtract = subtract;
    }

    exec(ctx: ExecutionContext, args: Value[]): Value {
      const lhs = vector2Of(args.length > 0 ? args[0] : NIL_VALUE);
      const rhs = vector2Of(args.length > 1 ? args[1] : NIL_VALUE);
      if (!lhs || !rhs) {
        return NIL_VALUE;
      }
      return this.subtract
        ? vector2Value(new DirectionVector(lhs.x - rhs.x, lhs.y - rhs.y))
        : vector2Value(new DirectionVector(lhs.x + rhs.x, lhs.y + rhs.y));
    }
  }

  /**
   * The core multiplication operator's overload over a `Vector2` operand on
   * the left and a number on the right: a fresh `Vector2` holding both of
   * the point's components multiplied by the number. Nil when the left
   * operand holds no point, as {@link vector2Of} reads it, or the right
   * holds no number.
   */
  class Vector2ScaleOverload extends HostFunction {
    constructor() {
      super();
    }

    exec(ctx: ExecutionContext, args: Value[]): Value {
      const point = vector2Of(args.length > 0 ? args[0] : NIL_VALUE);
      const factor = args.length > 1 ? args[1] : NIL_VALUE;
      if (!point || factor.t !== ValueTag.Number) {
        return NIL_VALUE;
      }
      return vector2Value(new DirectionVector(point.x * factor.num, point.y * factor.num));
    }
  }

  /** A direction that points nowhere: the move of a sprite holding still at its goal. */
  const HOLD_STILL = new DirectionVector(0, 0);

  /**
   * `actuator.arcade.move`: records the program's sprite's move for this
   * frame's arbitration, a wander heading for the destination the move's
   * call site holds in the sprite's attachment. A move heading for one goal
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
      const attachment = ctx.data as SpriteAttachment;
      const sprite = attachment.sprite;
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
        wander = attachment.wander.bearing(sprite, ctx.currentCallSiteId, ctx.time, game.currentScene().camera);
        destination = attachment.wander.leg(ctx.currentCallSiteId);
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
      sceneMotionArbiter(game.currentScene()).addIntent(new MoveIntent(sprite, direction, speed, 1));
      return VOID_VALUE;
    }
  }

  /**
   * The `Sprite` output named `name`, its tile labelled `label`, declared
   * writable-result: a brain may write a field of the sprite it holds
   * through its tile.
   */
  function spriteOutput(name: string, label: string): TileOutputSpec {
    const declared = output(name, TYPE_SPRITE);
    declared.label = label;
    declared.writableResult = true;
    return declared;
  }

  /** An anonymous slot of the type `type`: a bare value expression of the type fills it. */
  function anonymousArg(type: string): ArgSlotSpec {
    const slot = arg(`anon.${type}`, type);
    slot.anonymous = true;
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

  /** The shared positional modifier `tileId`, labelled `label`, read with the word `form`. */
  function positionModifier(tileId: string, label: string, form: string): ArgSlotSpec {
    return modifier(tileId, label, tileLanguage(form));
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
          positionModifier("modifier.position.above", "above", "above me"),
          positionModifier("modifier.position.below", "below", "below me"),
        ])
      ),
      optional(
        choice([
          positionModifier("modifier.position.left", "left of", "to my left"),
          positionModifier("modifier.position.right", "right of", "to my right"),
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

  /**
   * The argument grammar the add-score actuator declares: an optional
   * amount and an optional player, in either order, each anonymous value
   * filling the slot of its type -- a number the amount, a player the player.
   */
  function addScoreArgs(): TileArgSpec[] {
    return [optional(choice([bag([optional(anonymousArg(TYPE_NUMBER)), optional(anonymousArg(TYPE_PLAYER))])]))];
  }

  /**
   * The argument grammar the game-over actuator declares: an optional choice
   * of `win` or `lose`, an optional player, an optional effect and an
   * optional sound, in any order, each anonymous value filling the slot of
   * its type.
   */
  function gameOverArgs(): TileArgSpec[] {
    return [
      optional(
        choice([
          bag([
            optional(choice([modifier("modifier.outcome.win", "win"), modifier("modifier.outcome.lose", "lose")])),
            optional(anonymousArg(TYPE_PLAYER)),
            optional(anonymousArg(TYPE_EFFECT)),
            optional(anonymousArg(TYPE_SOUND)),
          ]),
        ])
      ),
    ];
  }

  /** The shared `duration` parameter slot: a named number of seconds, held at 0 or above, read as "for" in a sentence. */
  function durationSlot(): ArgSlotSpec {
    const duration = arg("parameter.duration", TYPE_NUMBER, "duration");
    duration.language = tileLanguage("for");
    duration.unit = "s";
    duration.range = argRangeAtLeast(0, ARG_ON_EXCEED_CLAMP);
    return duration;
  }

  /**
   * The argument grammar the destroy actuator declares: an optional target
   * sprite, an optional particle effect and an optional duration, in any
   * order, each anonymous value filling the slot of its type -- a sprite the
   * target, a particle effect the effect -- and the duration the shared
   * {@link durationSlot}.
   */
  function destroyArgs(): TileArgSpec[] {
    return [
      optional(
        choice([
          bag([
            optional(anonymousArg(TYPE_SPRITE)),
            optional(anonymousArg(TYPE_PARTICLE_EFFECT)),
            optional(durationSlot()),
          ]),
        ])
      ),
    ];
  }

  /** An anonymous text slot derived from the rule's WHEN result when it is empty. */
  function derivedTextSlot(): ArgSlotSpec {
    const text = anonymousArg(TYPE_STRING);
    text.derived = true;
    return text;
  }

  /**
   * The argument grammar the say actuator declares: an optional text and an
   * optional duration, in either order -- the text the shared
   * {@link derivedTextSlot}, and the duration the shared {@link durationSlot}.
   */
  function sayArgs(): TileArgSpec[] {
    return [optional(choice([bag([optional(derivedTextSlot()), optional(durationSlot())])]))];
  }

  /**
   * The argument grammar the show-text actuator declares: an optional text,
   * the shared {@link derivedTextSlot}, and an optional choice of the shared
   * `top`, `center` or `full` layout modifier, in either order.
   */
  function showTextArgs(): TileArgSpec[] {
    return [
      optional(
        choice([
          bag([
            optional(derivedTextSlot()),
            optional(
              choice([
                modifier("modifier.layout.top", "top", tileLanguage("at the top")),
                modifier("modifier.layout.center", "center", tileLanguage("in the center")),
                modifier("modifier.layout.full", "full", tileLanguage("full screen")),
              ])
            ),
          ]),
        ])
      ),
    ];
  }

  /** The argument grammar the ask actuator declares: an optional question, the shared {@link derivedTextSlot}. */
  function askArgs(): TileArgSpec[] {
    return [optional(choice([bag([optional(derivedTextSlot())])]))];
  }

  /** The shared playback modifier slot every play actuator declares: an optional choice of `in background` or `looping`. */
  function playbackSlot(): TileArgSpec {
    return optional(
      choice([
        modifier("modifier.playback.background", "in background"),
        modifier("modifier.playback.looping", "looping"),
      ])
    );
  }

  /**
   * The argument grammar the play-sound actuator declares: an optional
   * choice of an anonymous sound or song, and the shared
   * {@link playbackSlot}, in either order.
   */
  function playSoundArgs(): TileArgSpec[] {
    return [
      optional(choice([bag([optional(choice([anonymousArg(TYPE_SOUND), anonymousArg(TYPE_SONG)])), playbackSlot()])])),
    ];
  }

  /** A pitch slot of the play-tone actuator, measured in hertz and held at 0 or above. */
  function pitched(slot: ArgSlotSpec): ArgSlotSpec {
    slot.unit = "Hz";
    slot.range = argRangeAtLeast(0, ARG_ON_EXCEED_CLAMP);
    return slot;
  }

  /**
   * The argument grammar the play-tone actuator declares, in any order: an
   * optional pitch -- an anonymous number of hertz -- the shared `to`
   * parameter, the shared {@link durationSlot}, the shared `volume`
   * parameter, an optional choice of one wave modifier, an optional choice
   * of one effect modifier, and the shared {@link playbackSlot}.
   */
  function playToneArgs(): TileArgSpec[] {
    const to = pitched(arg("parameter.to", TYPE_NUMBER, "to"));
    to.language = tileLanguage("to");
    const volume = arg("parameter.volume", TYPE_NUMBER, "volume");
    volume.language = tileLanguage("at volume");
    volume.range = argRange(0, 1, ARG_ON_EXCEED_CLAMP);
    return [
      optional(
        choice([
          bag([
            optional(pitched(anonymousArg(TYPE_NUMBER))),
            optional(to),
            optional(durationSlot()),
            optional(volume),
            optional(
              choice([
                modifier("modifier.wave.sine", "sine"),
                modifier("modifier.wave.square", "square"),
                modifier("modifier.wave.sawtooth", "sawtooth"),
                modifier("modifier.wave.triangle", "triangle"),
                modifier("modifier.wave.noise", "noise"),
              ])
            ),
            optional(
              choice([
                modifier("modifier.tone.vibrato", "vibrato", tileLanguage("with vibrato")),
                modifier("modifier.tone.tremolo", "tremolo", tileLanguage("with tremolo")),
                modifier("modifier.tone.warble", "warble", tileLanguage("with warble")),
              ])
            ),
            playbackSlot(),
          ]),
        ])
      ),
    ];
  }

  /** The four optional direction modifier slots, up, down, left then right. */
  function directionModifiers(): TileArgSpec[] {
    return [
      optional(modifier("modifier.direction.up")),
      optional(modifier("modifier.direction.down")),
      optional(modifier("modifier.direction.left")),
      optional(modifier("modifier.direction.right")),
    ];
  }

  /**
   * The spec of a button sensor labelled `label` for the button lettered
   * `letter`, read as "press <letter>" with "button" completing a WHEN side
   * it heads alone: one optional anonymous player.
   */
  function buttonSpec(label: string, letter: string): TileSpec {
    const spec = new TileSpec(TILE_KIND_SENSOR, [optional(anonymousArg(TYPE_PLAYER))], TYPE_BOOLEAN);
    spec.label = label;
    spec.language.form = `press ${letter}`;
    spec.language.bare = "button";
    return spec;
  }

  /**
   * Type metadata declaring the display label `label` the editor calls the
   * type by, and the literals `literals`, in the order the editor offers them.
   */
  function literalTypeMeta(label: string, literals: TypeLiteral[]): TypeMeta {
    const meta = new TypeMeta();
    meta.label = label;
    meta.literals = literals;
    return meta;
  }

  /**
   * Type metadata declaring the display label `label` the editor calls the
   * type by, and a variable factory: brains may hold variables of the type.
   */
  function variableTypeMeta(label: string): TypeMeta {
    const meta = new TypeMeta();
    meta.label = label;
    meta.variableFactory = true;
    return meta;
  }

  const arcadePack = pack(ARCADE_PACK_NAME);

  const vector2Meta = variableTypeMeta("position");
  vector2Meta.literals = vector2Literals();
  vector2Meta.variableInitial = VECTOR2_ORIGIN_KEY;
  const vector2FieldSpecs = vector2Fields();
  arcadePack.defineStruct(TYPE_VECTOR2, vector2FieldSpecs, vector2Binding, vector2Meta);
  const spriteMeta = variableTypeMeta("sprite");
  const spriteFieldSpecs = spriteFields();
  arcadePack.defineStruct(TYPE_SPRITE, spriteFieldSpecs, spriteBinding, spriteMeta);
  const imageMeta = new TypeMeta();
  imageMeta.label = "image";
  arcadePack.defineAssetType(TYPE_IMAGE, imageBinding, imageMeta);
  const brainMeta = new TypeMeta();
  arcadePack.defineBrainType(TYPE_BRAIN, brainBinding, brainMeta);
  const playerMeta = literalTypeMeta("player", playerLiterals());
  playerMeta.variableFactory = true;
  const playerFieldSpecs = playerFields();
  arcadePack.defineStruct(TYPE_PLAYER, playerFieldSpecs, playerBinding, playerMeta);
  const effectMeta = literalTypeMeta("effect", effectLiterals());
  arcadePack.defineStruct(TYPE_EFFECT, namedChoiceFields(), effectBinding, effectMeta);
  const soundMeta = literalTypeMeta("sound", soundLiterals());
  arcadePack.defineStruct(TYPE_SOUND, namedChoiceFields(), soundBinding, soundMeta);
  const particleEffectMeta = literalTypeMeta("particle effect", particleEffectLiterals());
  arcadePack.defineStruct(TYPE_PARTICLE_EFFECT, namedChoiceFields(), particleEffectBinding, particleEffectMeta);
  const songMeta = new TypeMeta();
  songMeta.label = "song";
  arcadePack.defineAssetType(TYPE_SONG, songBinding, songMeta);

  const dpadSpec = new TileSpec(
    TILE_KIND_SENSOR,
    directionModifiers().concat([optional(anonymousArg(TYPE_PLAYER))]),
    TYPE_VECTOR2
  );
  dpadSpec.label = "dpad";
  dpadSpec.language.form = "press the dpad";
  dpadSpec.language.bare = "in any direction";
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
        repeatedUpTo(modifier("modifier.slowly"), 1, MOVE_SPEED_STEPS_MAX),
        repeatedUpTo(modifier("modifier.quickly"), 1, MOVE_SPEED_STEPS_MAX),
        moveSpeedSlot,
      ])
    ),
  ];
  const moveTowardSlot = modifier("modifier.movement.toward");
  moveTowardSlot.name = MOVE_TOWARD_NAME;
  const moveAwaySlot = modifier("modifier.movement.away", "away from");
  moveAwaySlot.name = MOVE_AWAY_NAME;
  const moveTargetArgs: TileArgSpec[] = [
    conditional(MOVE_TOWARD_NAME, moveTargetSlot(), conditional(MOVE_AWAY_NAME, moveTargetSlot())),
  ];
  const moveRelationalArgs: TileArgSpec[] = [
    optional(moveTowardSlot),
    optional(moveAwaySlot),
    optional(modifier("modifier.movement.wander", "wander", tileLanguage("around"))),
  ];
  const moveSpec = new TileSpec(
    TILE_KIND_ACTUATOR,
    moveTargetArgs.concat(moveSpeedArgs).concat(directionModifiers()).concat(moveRelationalArgs),
    ""
  );
  moveSpec.label = "move";
  arcadePack.bind(MOVE_TILE, new MoveActuator(), moveSpec);

  const bumpSpec = new TileSpec(TILE_KIND_SENSOR, [filterSlot()].concat(positionSlots()), TYPE_SPRITE);
  bumpSpec.label = "bump";
  bumpSpec.outputs = [spriteOutput(BUMPED_OUTPUT, "bumped sprite")];
  bumpSpec.language.bare = "anything";
  arcadePack.bind(BUMP_TILE, new BumpSensor(), bumpSpec);

  const inRangeSpec = new TileSpec(TILE_KIND_SENSOR, rangeSensorArgs(), TYPE_SPRITE);
  inRangeSpec.label = "in range";
  inRangeSpec.outputs = [spriteOutput(IN_RANGE_OUTPUT, "sprite in range")];
  inRangeSpec.language.frame = SENTENCE_FRAME_STATE;
  inRangeSpec.language.bare = "of anything";
  arcadePack.bind(IN_RANGE_TILE, new RangeSensor(true, IN_RANGE_OUTPUT), inRangeSpec);

  const outOfRangeSpec = new TileSpec(TILE_KIND_SENSOR, rangeSensorArgs(), TYPE_SPRITE);
  outOfRangeSpec.label = "out of range";
  outOfRangeSpec.outputs = [spriteOutput(OUT_OF_RANGE_OUTPUT, "sprite out of range")];
  outOfRangeSpec.language.frame = SENTENCE_FRAME_STATE;
  outOfRangeSpec.language.bare = "of anything";
  arcadePack.bind(OUT_OF_RANGE_TILE, new RangeSensor(false, OUT_OF_RANGE_OUTPUT), outOfRangeSpec);

  const myselfSpec = new TileSpec(TILE_KIND_SENSOR, [], TYPE_SPRITE);
  myselfSpec.label = "myself";
  myselfSpec.inline = true;
  myselfSpec.writableResult = true;
  arcadePack.bind(MYSELF_TILE, new MyselfSensor(), myselfSpec);

  const addScoreSpec = new TileSpec(TILE_KIND_ACTUATOR, addScoreArgs(), "");
  addScoreSpec.label = "add score";
  arcadePack.bind(ADD_SCORE_TILE, new AddScoreActuator(), addScoreSpec);

  const gameOverSpec = new TileSpec(TILE_KIND_ACTUATOR, gameOverArgs(), "");
  gameOverSpec.label = "game over";
  arcadePack.bind(GAME_OVER_TILE, new GameOverActuator(), gameOverSpec);

  const buttonASpec = buttonSpec("A button", "A");
  arcadePack.bind(BUTTON_A_TILE, new ButtonSensor(ControllerButton.A), buttonASpec);
  const buttonBSpec = buttonSpec("B button", "B");
  arcadePack.bind(BUTTON_B_TILE, new ButtonSensor(ControllerButton.B), buttonBSpec);

  const destroySpec = new TileSpec(TILE_KIND_ACTUATOR, destroyArgs(), "");
  destroySpec.label = "destroy";
  arcadePack.bind(DESTROY_TILE, new DestroyActuator(), destroySpec);
  const destroyedSpec = new TileSpec(TILE_KIND_SENSOR, [], TYPE_BOOLEAN);
  destroyedSpec.label = "destroyed";
  destroyedSpec.language.frame = SENTENCE_FRAME_STATE;
  arcadePack.bind(DESTROYED_TILE, new DestroyedSensor(), destroyedSpec);

  const saySpec = new TileSpec(TILE_KIND_ACTUATOR, sayArgs(), "");
  saySpec.label = "say";
  arcadePack.bind(SAY_TILE, new SayActuator(), saySpec);

  const dialogTextReader = new DialogTextReader();
  const showTextSpec = new TileSpec(TILE_KIND_ACTUATOR, showTextArgs(), "");
  showTextSpec.label = "show text";
  arcadePack.bind(SHOW_TEXT_TILE, new ShowTextActuator(dialogTextReader), showTextSpec);
  const askSpec = new TileSpec(TILE_KIND_ACTUATOR, askArgs(), "");
  askSpec.label = "ask";
  const answerOutput = output(ANSWER_OUTPUT, TYPE_BOOLEAN);
  answerOutput.label = "answer";
  askSpec.outputs = [answerOutput];
  arcadePack.bind(ASK_TILE, new AskActuator(dialogTextReader), askSpec);

  const playSoundSpec = new TileSpec(TILE_KIND_ACTUATOR, playSoundArgs(), "");
  playSoundSpec.label = "play sound";
  arcadePack.bind(PLAY_SOUND_TILE, new PlaySoundActuator(), playSoundSpec);
  const playToneSpec = new TileSpec(TILE_KIND_ACTUATOR, playToneArgs(), "");
  playToneSpec.label = "play tone";
  arcadePack.bind(PLAY_TONE_TILE, new PlayToneActuator(), playToneSpec);
  const stopSoundsSpec = new TileSpec(TILE_KIND_ACTUATOR, [], "");
  stopSoundsSpec.label = "stop sounds";
  arcadePack.bind(STOP_SOUNDS_TILE, new StopSoundsActuator(), stopSoundsSpec);

  defineEquality(arcadePack, TYPE_IMAGE, sameImage);
  defineEquality(arcadePack, TYPE_SPRITE, sameSprite);
  defineEquality(arcadePack, TYPE_BRAIN, sameBrain);
  defineEquality(arcadePack, TYPE_VECTOR2, sameVector2);
  arcadePack.overloadOperator(
    OPERATOR_ADD,
    new Vector2SumOverload(false),
    new OperatorSpec([TYPE_VECTOR2, TYPE_VECTOR2], TYPE_VECTOR2)
  );
  arcadePack.overloadOperator(
    OPERATOR_SUBTRACT,
    new Vector2SumOverload(true),
    new OperatorSpec([TYPE_VECTOR2, TYPE_VECTOR2], TYPE_VECTOR2)
  );
  arcadePack.overloadOperator(
    OPERATOR_MULTIPLY,
    new Vector2ScaleOverload(),
    new OperatorSpec([TYPE_VECTOR2, TYPE_NUMBER], TYPE_VECTOR2)
  );
  defineEquality(arcadePack, TYPE_PLAYER, samePlayer);

  /**
   * Give every argument slot among `nodes`, and among the nodes under them,
   * that the tile `tileId` fills the icon `icon`.
   */
  function attachGrammarSlotIcon(nodes: TileArgSpec[], tileId: string, icon: Image): void {
    for (const node of nodes) {
      if (node.kind === CALL_SPEC_ARG) {
        const slot = node as ArgSlotSpec;
        if (slot.tileId === tileId) {
          slot.icon = icon;
        }
      } else if (node.kind === CALL_SPEC_SEQ) {
        attachGrammarSlotIcon((node as SeqSpec).items, tileId, icon);
      } else if (node.kind === CALL_SPEC_BAG) {
        attachGrammarSlotIcon((node as BagSpec).items, tileId, icon);
      } else if (node.kind === CALL_SPEC_CHOICE) {
        attachGrammarSlotIcon((node as ChoiceSpec).options, tileId, icon);
      } else if (node.kind === CALL_SPEC_OPTIONAL) {
        attachGrammarSlotIcon([(node as OptionalSpec).item], tileId, icon);
      } else if (node.kind === CALL_SPEC_REPEAT) {
        attachGrammarSlotIcon([(node as RepeatSpec).item], tileId, icon);
      } else if (node.kind === CALL_SPEC_CONDITIONAL) {
        const conditional = node as ConditionalSpec;
        attachGrammarSlotIcon([conditional.thenItem], tileId, icon);
        if (conditional.elseItem) {
          attachGrammarSlotIcon([conditional.elseItem], tileId, icon);
        }
      }
    }
  }

  /** Give every argument slot of every tile among `tiles` that the tile `tileId` fills the icon `icon`. */
  function attachSlotIcon(tiles: TileSpec[], tileId: string, icon: Image): void {
    for (const declared of tiles) {
      attachGrammarSlotIcon(declared.args, tileId, icon);
    }
  }

  /** Give the accessor tile of the field named `name` among `fields` the icon `icon`. */
  function attachAccessorIcon(fields: StructFieldSpec[], name: string, icon: Image): void {
    for (const declared of fields) {
      if (declared.name === name && declared.accessor) {
        declared.accessor.icon = icon;
      }
    }
  }

  /**
   * Give each of the pack's tiles, the modifier and parameter tiles filling
   * their slots, their outputs, its `Vector2`, `Sprite`, `Image`, `Brain`, `Player`,
   * `Effect`, `Sound`, `ParticleEffect` and `Song` types and their accessor
   * tiles their icons, and give
   * the core tiles and the core number, text and switch types the pack's icons
   * for them. Call it once, after the pack's registrations and before the
   * catalog is first published. Does nothing on hardware.
   */
  //% shim=TD_NOOP
  function attachArcadeBaseIcons(): void {
    vector2Meta.icon = vector2TypeIcon();
    attachAccessorIcon(vector2FieldSpecs, "x", xAccessorIcon());
    attachAccessorIcon(vector2FieldSpecs, "y", yAccessorIcon());
    spriteMeta.icon = spriteTypeIcon();
    imageMeta.icon = imageTypeIcon();
    attachAccessorIcon(spriteFieldSpecs, "image", imageTypeIcon());
    attachAccessorIcon(spriteFieldSpecs, "position", positionAccessorIcon());
    attachAccessorIcon(spriteFieldSpecs, "brain", brainTypeIcon());
    attachAccessorIcon(spriteFieldSpecs, "moveSmoothing", moveSmoothingAccessorIcon());
    brainMeta.icon = brainTypeIcon();
    playerMeta.icon = playerTypeIcon();
    attachAccessorIcon(playerFieldSpecs, "score", scoreAccessorIcon());
    effectMeta.icon = effectTypeIcon();
    soundMeta.icon = soundTypeIcon();
    particleEffectMeta.icon = particleEffectTypeIcon();
    songMeta.icon = songTypeIcon();
    dpadSpec.icon = dpadIcon();
    buttonASpec.icon = buttonAIcon();
    buttonBSpec.icon = buttonBIcon();
    moveSpec.icon = moveIcon();
    bumpSpec.icon = bumpIcon();
    bumpSpec.outputs[0].icon = bumpIcon();
    inRangeSpec.icon = inRangeIcon();
    inRangeSpec.outputs[0].icon = inRangeIcon();
    outOfRangeSpec.icon = outOfRangeIcon();
    outOfRangeSpec.outputs[0].icon = outOfRangeIcon();
    myselfSpec.icon = myselfIcon();
    addScoreSpec.icon = addScoreIcon();
    gameOverSpec.icon = gameOverIcon();
    destroySpec.icon = destroyIcon();
    destroyedSpec.icon = destroyedIcon();
    saySpec.icon = sayIcon();
    showTextSpec.icon = showTextIcon();
    askSpec.icon = askIcon();
    askSpec.outputs[0].icon = answerIcon();
    playSoundSpec.icon = playSoundIcon();
    playToneSpec.icon = playToneIcon();
    stopSoundsSpec.icon = stopSoundsIcon();
    const tiles = [
      dpadSpec,
      buttonASpec,
      buttonBSpec,
      moveSpec,
      bumpSpec,
      inRangeSpec,
      outOfRangeSpec,
      myselfSpec,
      addScoreSpec,
      gameOverSpec,
      destroySpec,
      destroyedSpec,
      saySpec,
      showTextSpec,
      askSpec,
      playSoundSpec,
      playToneSpec,
      stopSoundsSpec,
    ];
    attachSlotIcon(tiles, "modifier.direction.up", upIcon());
    attachSlotIcon(tiles, "modifier.direction.down", downIcon());
    attachSlotIcon(tiles, "modifier.direction.left", leftIcon());
    attachSlotIcon(tiles, "modifier.direction.right", rightIcon());
    attachSlotIcon(tiles, "modifier.slowly", slowlyIcon());
    attachSlotIcon(tiles, "modifier.quickly", quicklyIcon());
    attachSlotIcon(tiles, "modifier.movement.toward", towardIcon());
    attachSlotIcon(tiles, "modifier.movement.away", awayIcon());
    attachSlotIcon(tiles, "modifier.movement.wander", wanderIcon());
    attachSlotIcon(tiles, "modifier.position.above", aboveIcon());
    attachSlotIcon(tiles, "modifier.position.below", belowIcon());
    attachSlotIcon(tiles, "modifier.position.left", leftOfIcon());
    attachSlotIcon(tiles, "modifier.position.right", rightOfIcon());
    attachSlotIcon(tiles, "modifier.outcome.win", winIcon());
    attachSlotIcon(tiles, "modifier.outcome.lose", loseIcon());
    attachSlotIcon(tiles, "parameter.speed", speedParameterIcon());
    attachSlotIcon(tiles, "parameter.duration", durationParameterIcon());
    attachSlotIcon(tiles, "modifier.layout.top", layoutTopIcon());
    attachSlotIcon(tiles, "modifier.layout.center", layoutCenterIcon());
    attachSlotIcon(tiles, "modifier.layout.full", layoutFullIcon());
    attachSlotIcon(tiles, "parameter.to", toParameterIcon());
    attachSlotIcon(tiles, "parameter.volume", volumeParameterIcon());
    attachSlotIcon(tiles, "modifier.wave.sine", sineWaveIcon());
    attachSlotIcon(tiles, "modifier.wave.square", squareWaveIcon());
    attachSlotIcon(tiles, "modifier.wave.sawtooth", sawtoothWaveIcon());
    attachSlotIcon(tiles, "modifier.wave.triangle", triangleWaveIcon());
    attachSlotIcon(tiles, "modifier.wave.noise", noiseWaveIcon());
    attachSlotIcon(tiles, "modifier.tone.vibrato", vibratoIcon());
    attachSlotIcon(tiles, "modifier.tone.tremolo", tremoloIcon());
    attachSlotIcon(tiles, "modifier.tone.warble", warbleIcon());
    attachSlotIcon(tiles, "modifier.playback.background", inBackgroundIcon());
    attachSlotIcon(tiles, "modifier.playback.looping", loopingIcon());

    arcadePack.defineCoreTileIcon("tile.sensor->on-page-entered", coreOnPageEnteredIcon());
    arcadePack.defineCoreTileIcon("tile.actuator->switch-page", coreSwitchPageIcon());
    arcadePack.defineCoreTileIcon("tile.actuator->restart-page", coreRestartPageIcon());
    arcadePack.defineCoreTileIcon("tile.sensor->current-page", coreCurrentPageIcon());
    arcadePack.defineCoreTileIcon("tile.sensor->previous-page", corePreviousPageIcon());
    arcadePack.defineCoreTileIcon("tile.page", corePageIcon());
    arcadePack.defineCoreTileIcon("tile.sensor->sensor.timeout", coreTimerIcon());
    arcadePack.defineCoreTileIcon("tile.op->and", coreAndIcon());
    arcadePack.defineCoreTileIcon("tile.op->or", coreOrIcon());
    arcadePack.defineCoreTileIcon("tile.op->not", coreNotIcon());
    arcadePack.defineCoreTileIcon("tile.op->eq", coreEqualIcon());
    arcadePack.defineCoreTileIcon("tile.op->ne", coreNotEqualIcon());
    arcadePack.defineCoreTileIcon("tile.op->lt", coreLessIcon());
    arcadePack.defineCoreTileIcon("tile.op->le", coreLessOrEqualIcon());
    arcadePack.defineCoreTileIcon("tile.op->gt", coreGreaterIcon());
    arcadePack.defineCoreTileIcon("tile.op->ge", coreGreaterOrEqualIcon());
    arcadePack.defineCoreTileIcon("tile.op->add", corePlusIcon());
    arcadePack.defineCoreTileIcon("tile.op->sub", coreMinusIcon());
    arcadePack.defineCoreTileIcon("tile.op->mul", coreMultiplyIcon());
    arcadePack.defineCoreTileIcon("tile.op->div", coreDivideIcon());
    arcadePack.defineCoreTileIcon("tile.op->neg", coreNegativeIcon());
    arcadePack.defineCoreTileIcon("tile.op->assign", coreAssignIcon());
    arcadePack.defineCoreTileIcon("tile.cf->open-paren", coreOpenParenIcon());
    arcadePack.defineCoreTileIcon("tile.cf->close-paren", coreCloseParenIcon());
    arcadePack.defineCoreTileIcon("tile.sensor->random", coreRandomIcon());
    arcadePack.defineCoreTileIcon("tile.literal->boolean:<boolean>->true", coreTrueIcon());
    arcadePack.defineCoreTileIcon("tile.literal->boolean:<boolean>->false", coreFalseIcon());
    arcadePack.defineCoreTileIcon("tile.literal->nil:<nil>->nil", coreNilIcon());
    arcadePack.defineCoreTileIcon("tile.var.factory->boolean", coreBooleanVariableIcon());
    arcadePack.defineCoreTileIcon("tile.var.factory->number", coreNumberVariableIcon());
    arcadePack.defineCoreTileIcon("tile.var.factory->string", coreTextVariableIcon());
    arcadePack.defineCoreTileIcon("tile.lit.factory->number", coreNumberTileIcon());
    arcadePack.defineCoreTileIcon("tile.lit.factory->string", coreTextTileIcon());

    arcadePack.defineCoreTypeIcon(TYPE_NUMBER, numberTypeIcon());
    arcadePack.defineCoreTypeIcon(TYPE_STRING, textTypeIcon());
    arcadePack.defineCoreTypeIcon(TYPE_BOOLEAN, switchTypeIcon());
  }

  /**
   * Give the accessor tile of the field named `name` among `fields` the docs
   * page {@link arcadeBaseDocs} holds under the key `page`.
   */
  function attachAccessorDocs(fields: StructFieldSpec[], name: string, page: string): void {
    for (const declared of fields) {
      if (declared.name === name && declared.accessor) {
        declared.accessor.docs = arcadeBaseDocs(page);
      }
    }
  }

  /**
   * Give each of the pack's tiles, their outputs, its `Vector2`,
   * `Sprite`, `Player`, `Effect`, `Sound`, `ParticleEffect` and `Song` types
   * and their accessor tiles the docs page {@link arcadeBaseDocs}
   * holds under the key it is wired to: a tile's or type's name, and
   * `output.<name>` or `accessor.<field>` for an output or an accessor, one
   * accessor page serving every field wired to it. Call it once, after the
   * pack's registrations and before the catalog is first published. Does
   * nothing on hardware.
   */
  //% shim=TD_NOOP
  function attachArcadeBaseDocs(): void {
    vector2Meta.docs = arcadeBaseDocs(TYPE_VECTOR2);
    attachAccessorDocs(vector2FieldSpecs, "x", "accessor.x");
    attachAccessorDocs(vector2FieldSpecs, "y", "accessor.y");
    spriteMeta.docs = arcadeBaseDocs(TYPE_SPRITE);
    attachAccessorDocs(spriteFieldSpecs, "image", "accessor.image");
    attachAccessorDocs(spriteFieldSpecs, "position", "accessor.position");
    attachAccessorDocs(spriteFieldSpecs, "brain", "accessor.brain");
    attachAccessorDocs(spriteFieldSpecs, "moveSmoothing", "accessor.moveSmoothing");
    playerMeta.docs = arcadeBaseDocs(TYPE_PLAYER);
    attachAccessorDocs(playerFieldSpecs, "score", "accessor.score");
    effectMeta.docs = arcadeBaseDocs(TYPE_EFFECT);
    soundMeta.docs = arcadeBaseDocs(TYPE_SOUND);
    particleEffectMeta.docs = arcadeBaseDocs(TYPE_PARTICLE_EFFECT);
    songMeta.docs = arcadeBaseDocs(TYPE_SONG);
    dpadSpec.docs = arcadeBaseDocs(DPAD_TILE);
    buttonASpec.docs = arcadeBaseDocs(BUTTON_A_TILE);
    buttonBSpec.docs = arcadeBaseDocs(BUTTON_B_TILE);
    moveSpec.docs = arcadeBaseDocs(MOVE_TILE);
    bumpSpec.docs = arcadeBaseDocs(BUMP_TILE);
    bumpSpec.outputs[0].docs = arcadeBaseDocs("output.bumped");
    inRangeSpec.docs = arcadeBaseDocs(IN_RANGE_TILE);
    inRangeSpec.outputs[0].docs = arcadeBaseDocs("output.inRange");
    outOfRangeSpec.docs = arcadeBaseDocs(OUT_OF_RANGE_TILE);
    outOfRangeSpec.outputs[0].docs = arcadeBaseDocs("output.outOfRange");
    myselfSpec.docs = arcadeBaseDocs(MYSELF_TILE);
    addScoreSpec.docs = arcadeBaseDocs(ADD_SCORE_TILE);
    gameOverSpec.docs = arcadeBaseDocs(GAME_OVER_TILE);
    destroySpec.docs = arcadeBaseDocs(DESTROY_TILE);
    destroyedSpec.docs = arcadeBaseDocs(DESTROYED_TILE);
    saySpec.docs = arcadeBaseDocs(SAY_TILE);
    showTextSpec.docs = arcadeBaseDocs(SHOW_TEXT_TILE);
    askSpec.docs = arcadeBaseDocs(ASK_TILE);
    askSpec.outputs[0].docs = arcadeBaseDocs("output.answer");
    playSoundSpec.docs = arcadeBaseDocs(PLAY_SOUND_TILE);
    playToneSpec.docs = arcadeBaseDocs(PLAY_TONE_TILE);
    stopSoundsSpec.docs = arcadeBaseDocs(STOP_SOUNDS_TILE);
  }

  attachArcadeBaseIcons();
  attachArcadeBaseDocs();
}
