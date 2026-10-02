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
 * the same verdicts.
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
   * The direct motion applicator: sets a verdict's sprite to exactly the
   * verdict's velocity, and a released sprite's velocity to zero. A sprite's
   * velocity is the program's on every frame that carries a verdict for it,
   * and the game code's on every other frame.
   */
  //% hidden
  export class DirectMotionApplicator {
    constructor() {}

    /**
     * Set the verdict's sprite moving at the verdict's velocity.
     *
     * @param verdict - One sprite's blended motion for this frame.
     */
    apply(verdict: MotionVerdict): void {
      verdict.sprite.vx = verdict.vx;
      verdict.sprite.vy = verdict.vy;
    }

    /**
     * Stop `sprite`: its verdicts stopped this frame, after a frame that
     * carried one.
     *
     * @param sprite - The sprite no program moves any more.
     */
    release(sprite: Sprite): void {
      sprite.vx = 0;
      sprite.vy = 0;
    }
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
     */
    resolve(): void {
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
        this.applicator.apply(new MotionVerdict(sprites[i], sumX[i] / weights[i], sumY[i] / weights[i]));
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
      arbiter.resolve();
    });
    return arbiter;
  }
}
