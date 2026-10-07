/**
 * Moving sprites for their programs, in two halves.
 *
 * Arbitration: each move a program makes during a frame's drain is an
 * intent, collected in its scene's {@link MotionArbiter}. Once the frame's
 * programs have all thought, the arbiter blends each sprite's intents into
 * one verdict -- the weighted average of the intents' velocities -- and
 * clears them, so a sprite whose programs made no move this frame has no
 * intent at all.
 *
 * Application: each verdict crosses the motion applicator boundary, where a
 * {@link DirectMotionApplicator} sets the sprite's velocity. This boundary is
 * where a motion model, such as physics, replaces the applicator and consumes
 * the same verdicts. A verdict carries only the sprite and the velocity its
 * programs ask for; whatever state an applicator's motion needs, it keeps
 * itself.
 */
namespace wendoo {
  /** One move a program made during a frame: the sprite, the direction and speed it asked for, and the intent's weight. */
  //% hidden
  export class MoveIntent {
    /** The sprite to move. */
    sprite: Sprite;
    /** The direction to move in, at most 1 long. */
    direction: DirectionVector;
    /** Speed along the direction, in pixels per second. */
    speed: number;
    /** Weight of this intent in its sprite's blend. */
    weight: number;

    constructor(sprite: Sprite, direction: DirectionVector, speed: number, weight: number) {
      this.sprite = sprite;
      this.direction = direction;
      this.speed = speed;
      this.weight = weight;
    }
  }

  /** One sprite's blended motion for a frame: the velocity its intents agree on, in pixels per second. */
  //% hidden
  export class MotionVerdict {
    /** The sprite the verdict is for. */
    sprite: Sprite;
    /** Horizontal velocity; positive is rightward. */
    vx: number;
    /** Vertical velocity; positive is downward. */
    vy: number;

    constructor(sprite: Sprite, vx: number, vy: number) {
      this.sprite = sprite;
      this.vx = vx;
      this.vy = vy;
    }
  }

  /**
   * The fastest a program sets a sprite moving, in pixels per second,
   * measured along the sprite's direction of travel: the default
   * `maxVelocity` of Arcade's physics engine.
   */
  //% hidden
  export const ENGINE_MAX_SPEED = 500;

  /**
   * How gradually programs speed their sprites up, as a time constant in
   * milliseconds. While it is above 0, a move asking for at least the speed
   * its sprite moves at closes `1 - e^(-dt / moveSmoothing)` of the gap
   * between the velocity the sprite moves at and the one it asks for over a
   * frame of `dt` milliseconds; a move asking for less, and a stop, take
   * effect at once. At 0 or below every move sets the velocity it asks for
   * at once. 0 -- off -- until game code sets it, as
   * `wendoo.moveSmoothing = 100`; read on every frame.
   * The project's default: a sprite given smoothing of its own, by
   * {@link setMoveSmoothing} or by a program, eases with that instead.
   */
  //% hidden
  // biome-ignore lint/style/useConst: game code outside this file assigns it.
  export let moveSmoothing = 0;

  /** Key a sprite's own move smoothing is kept under in the sprite's data, absent while the sprite has none. */
  const SPRITE_SMOOTHING_KEY = "wendoo.moveSmoothing";

  /**
   * The time constant, in milliseconds, the moves of `sprite` ease with:
   * the smoothing it was given of its own, else {@link moveSmoothing}. Read
   * on every frame, so a change to either takes effect on the next.
   *
   * @param sprite - Any sprite.
   */
  //% hidden
  export function moveSmoothingOf(sprite: Sprite): number {
    const own = sprite.data[SPRITE_SMOOTHING_KEY];
    return own === undefined ? moveSmoothing : (own as number);
  }

  /**
   * Give `sprite` move smoothing of its own, `ms` milliseconds, which its
   * moves ease with in place of {@link moveSmoothing} -- 0 turns smoothing
   * off for it alone; or, given `undefined`, take its own away, so it eases
   * with {@link moveSmoothing} again. Kept on the sprite itself, whichever
   * program it runs or runs next.
   *
   * @param sprite - The sprite to give smoothing to.
   * @param ms - The time constant, in milliseconds, at 0 or above; `undefined` to inherit.
   */
  //% hidden
  export function keepMoveSmoothing(sprite: Sprite, ms: number): void {
    sprite.data[SPRITE_SMOOTHING_KEY] = ms;
  }

  /**
   * Give `sprite` move smoothing of its own, `ms` milliseconds, in place of
   * {@link moveSmoothing} for this sprite alone: its moves ease as every
   * sprite's do while {@link moveSmoothing} is that number, and 0 turns
   * smoothing off for it even while every other sprite's is on. A negative
   * or non-finite number takes its own smoothing away again, so it follows
   * {@link moveSmoothing}; given no sprite, nothing happens. The sprite keeps
   * its smoothing whichever program it runs, so it may be given before or
   * after the program, as
   * `wendoo.setMoveSmoothing(platform, 60)` or
   * `wendoo.setMoveSmoothing(arrow, 0)`.
   *
   * @param sprite - The sprite to smooth.
   * @param ms - The time constant, in milliseconds; negative to follow {@link moveSmoothing} again.
   */
  //% hidden
  export function setMoveSmoothing(sprite: Sprite, ms: number): void {
    if (!sprite) {
      return;
    }
    keepMoveSmoothing(sprite, ms >= 0 && isFiniteNumber(ms) ? ms : undefined);
  }

  /**
   * The velocity the direct applicator last set a sprite moving at, in
   * pixels per second, at full precision, and the velocity the sprite held
   * once set to it: a sprite keeps its velocity in steps of 1/256 of a pixel
   * per second, so the two may differ. Kept in the sprite's data and
   * obtained with {@link appliedMotionOf}; all zero until the applicator
   * first sets the sprite's velocity.
   */
  class AppliedMotion {
    /** Horizontal velocity set; positive is rightward. */
    vx = 0;
    /** Vertical velocity set; positive is downward. */
    vy = 0;
    /** Horizontal velocity the sprite held once set to {@link AppliedMotion.vx}. */
    heldVx = 0;
    /** Vertical velocity the sprite held once set to {@link AppliedMotion.vy}. */
    heldVy = 0;

    constructor() {}
  }

  /** Key a sprite's {@link AppliedMotion} is kept under in the sprite's data, absent until {@link appliedMotionOf} is first called for the sprite. */
  const SPRITE_APPLIED_MOTION_KEY = "wendoo.appliedMotion";

  /**
   * The velocity the direct applicator last set `sprite` moving at, and the
   * velocity the sprite held once set to it; created all zero on first use.
   *
   * @param sprite - Any sprite.
   */
  function appliedMotionOf(sprite: Sprite): AppliedMotion {
    let applied = sprite.data[SPRITE_APPLIED_MOTION_KEY] as AppliedMotion;
    if (!applied) {
      applied = new AppliedMotion();
      sprite.data[SPRITE_APPLIED_MOTION_KEY] = applied;
    }
    return applied;
  }

  /**
   * The direct motion applicator: sets a verdict's sprite to the verdict's
   * velocity -- held to {@link ENGINE_MAX_SPEED} in the verdict's own
   * direction when it is faster, and eased toward from the velocity the
   * sprite moves at while the sprite's smoothing, as {@link moveSmoothingOf}
   * reads it, is on and the verdict asks for at least the speed the sprite
   * moves at -- and a released sprite's velocity, and that of a sprite whose
   * verdict holds an infinity or a not-a-number, to zero. A sprite's
   * velocity is the program's on every frame that carries a verdict for it,
   * and the game code's on every other frame; whichever set it, or a wall
   * that stopped it, a smoothed move eases from it.
   */
  //% hidden
  export class DirectMotionApplicator {
    constructor() {}

    /**
     * Set the verdict's sprite moving at the verdict's velocity, or, when
     * that is faster than {@link ENGINE_MAX_SPEED}, at that speed in the
     * verdict's direction. While the sprite's smoothing, as
     * {@link moveSmoothingOf} reads it, is above 0 and `dtMs` is above 0, a
     * velocity at least as fast as the sprite moves at is eased toward
     * instead: the sprite is set to the velocity it moves at moved
     * `1 - e^(-dtMs / smoothing)` of the way to it. The velocity it moves at
     * is the one this applicator last set it to, at full precision, while
     * the sprite still holds what it held once set to that, and otherwise
     * the sprite's own. A velocity so computed that holds an infinity or a
     * not-a-number releases the sprite instead, as
     * {@link DirectMotionApplicator.release} does.
     *
     * @param verdict - One sprite's blended motion for this frame.
     * @param dtMs - Duration of the frame, in milliseconds.
     */
    apply(verdict: MotionVerdict, dtMs: number): void {
      const sprite = verdict.sprite;
      let vx = verdict.vx;
      let vy = verdict.vy;
      const speed = Math.sqrt(vx * vx + vy * vy);
      if (speed > ENGINE_MAX_SPEED) {
        vx = (vx * ENGINE_MAX_SPEED) / speed;
        vy = (vy * ENGINE_MAX_SPEED) / speed;
      }
      const smoothing = moveSmoothingOf(sprite);
      if (smoothing > 0 && dtMs > 0) {
        const applied = appliedMotionOf(sprite);
        let fromX = sprite.vx;
        let fromY = sprite.vy;
        if (fromX === applied.heldVx && fromY === applied.heldVy) {
          fromX = applied.vx;
          fromY = applied.vy;
        }
        const asked = Math.sqrt(vx * vx + vy * vy);
        const current = Math.sqrt(fromX * fromX + fromY * fromY);
        if (asked >= current) {
          const share = 1 - Math.exp(-dtMs / smoothing);
          vx = fromX + (vx - fromX) * share;
          vy = fromY + (vy - fromY) * share;
        }
      }
      if (!isFiniteNumber(vx) || !isFiniteNumber(vy)) {
        this.release(sprite);
        return;
      }
      setVelocity(sprite, vx, vy);
    }

    /**
     * Stop `sprite`: its verdicts stopped this frame, after a frame that
     * carried one, or its verdict this frame comes to an infinite or
     * not-a-number velocity.
     *
     * @param sprite - The sprite no program moves any more.
     */
    release(sprite: Sprite): void {
      setVelocity(sprite, 0, 0);
    }
  }

  /**
   * Set `sprite` moving at `vx`, `vy`, in pixels per second, and record in
   * its {@link AppliedMotion} that velocity and the velocity the sprite holds
   * once set to it.
   */
  function setVelocity(sprite: Sprite, vx: number, vy: number): void {
    sprite.vx = vx;
    sprite.vy = vy;
    const applied = appliedMotionOf(sprite);
    applied.vx = vx;
    applied.vy = vy;
    applied.heldVx = sprite.vx;
    applied.heldVy = sprite.vy;
  }

  /**
   * One scene's move arbitration: collects the frame's move intents and,
   * once per frame after the scene's programs have thought, turns them into
   * one verdict per sprite for its applicator. Obtain it with
   * {@link sceneMotionArbiter}.
   */
  //% hidden
  export class MotionArbiter {
    private intents: MoveIntent[] = [];
    private moving: Sprite[] = [];
    private applicator: DirectMotionApplicator;

    /**
     * @param applicator - The applicator every verdict is handed to.
     */
    constructor(applicator: DirectMotionApplicator) {
      this.applicator = applicator;
    }

    /**
     * Record one move for this frame's arbitration; the sprite moves when the
     * frame is resolved.
     *
     * @param intent - The move.
     */
    addIntent(intent: MoveIntent): void {
      this.intents.push(intent);
    }

    /**
     * Arbitrate this frame: blend each sprite's intents into one verdict --
     * the weighted average of the intents' velocities -- and apply it, in the
     * order the sprites' first intents were recorded; release every sprite
     * that had a verdict last frame and has none now; then clear the intents.
     * A sprite's velocity is so written only on a frame with a verdict for it
     * and, to zero, on the first frame without one; on any other frame it is
     * left as game code set it.
     *
     * @param dtMs - Duration of the frame being arbitrated, in milliseconds.
     */
    resolve(dtMs: number): void {
      const sprites: Sprite[] = [];
      const sumX: number[] = [];
      const sumY: number[] = [];
      const weights: number[] = [];
      for (let i = 0; i < this.intents.length; i++) {
        const intent = this.intents[i];
        let index = sprites.indexOf(intent.sprite);
        if (index < 0) {
          index = sprites.length;
          sprites.push(intent.sprite);
          sumX.push(0);
          sumY.push(0);
          weights.push(0);
        }
        sumX[index] += intent.weight * intent.direction.x * intent.speed;
        sumY[index] += intent.weight * intent.direction.y * intent.speed;
        weights[index] += intent.weight;
      }
      for (let i = 0; i < sprites.length; i++) {
        this.applicator.apply(new MotionVerdict(sprites[i], sumX[i] / weights[i], sumY[i] / weights[i]), dtMs);
      }
      for (let i = 0; i < this.moving.length; i++) {
        if (sprites.indexOf(this.moving[i]) < 0) {
          this.applicator.release(this.moving[i]);
        }
      }
      this.moving = sprites;
      this.intents = [];
    }
  }

  /** Key the motion arbiter of a scene is kept under in the scene's data. */
  const SCENE_ARBITER_KEY = "wendoo.motionArbiter";

  /**
   * Frame-handler priority of each scene's arbitration: just after the
   * scene's update priority, at which its programs think.
   */
  const MOTION_PRIORITY = scene.UPDATE_PRIORITY + 1;

  /**
   * The motion arbiter of `gameScene`, created on first use with a
   * {@link DirectMotionApplicator} and its arbitration registered on the
   * scene's frame loop at {@link MOTION_PRIORITY}.
   *
   * @param gameScene - The scene whose sprites the arbiter moves.
   */
  //% hidden
  export function sceneMotionArbiter(gameScene: scene.Scene): MotionArbiter {
    const existing = gameScene.data[SCENE_ARBITER_KEY] as MotionArbiter;
    if (existing) {
      return existing;
    }
    const arbiter = new MotionArbiter(new DirectMotionApplicator());
    gameScene.data[SCENE_ARBITER_KEY] = arbiter;
    gameScene.eventContext.registerFrameHandler(MOTION_PRIORITY, () => {
      arbiter.resolve(gameScene.eventContext.deltaTimeMillis);
    });
    return arbiter;
  }
}
