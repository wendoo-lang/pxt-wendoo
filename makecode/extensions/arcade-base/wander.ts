/**
 * Wandering: this module owns where a wandering move heads. Each call site
 * of a wandering move keeps a destination of its own, picked at random on
 * the screen -- the part of the scene the camera shows, less a margin at
 * every edge -- and picks a new one when its sprite arrives or the
 * destination's deadline passes. The destinations live in the sprite's
 * {@link SpriteAttachment}, beside the random source that picks them.
 */
namespace wendoo {
  /** How near its destination, in pixels between the sprite's center and the destination, a wandering sprite counts as arrived. */
  //% hidden
  export const WANDER_ARRIVAL_DISTANCE = 4;

  /** How long a wandering move keeps heading for one destination before it picks a new one, in milliseconds. */
  //% hidden
  export const WANDER_DEADLINE_MS = 3000;

  /** The least distance, in pixels, between a wander destination and each edge of the screen. */
  //% hidden
  export const WANDER_SCREEN_MARGIN = 16;

  /** The source of the random numbers wander destinations are picked with: Arcade's own random numbers. */
  //% hidden
  export class WanderRandom {
    constructor() {}

    /**
     * A random whole number from `min` to `max`, both included.
     *
     * @param min - The least number it may be; a whole number.
     * @param max - The greatest number it may be; a whole number, at least `min`.
     */
    pick(min: number, max: number): number {
      return Math.randomRange(min, max);
    }
  }

  /** One destination a wandering move heads for: a point on the screen, and when it stops heading for it. */
  //% hidden
  export class WanderLeg {
    /** Horizontal position of the destination, in the coordinates sprite positions use. */
    x: number;
    /** Vertical position of the destination, in the coordinates sprite positions use. */
    y: number;
    /** The scheduled time, in milliseconds, from which the move picks a new destination. */
    deadline: number;

    /**
     * @param x - Horizontal position of the destination.
     * @param y - Vertical position of the destination.
     * @param deadline - The scheduled time, in milliseconds, from which the move picks a new destination.
     */
    constructor(x: number, y: number, deadline: number) {
      this.x = x;
      this.y = y;
      this.deadline = deadline;
    }
  }

  /**
   * One sprite's wandering: the destination each call site of a wandering
   * move heads for, and the random source that picks them. Destinations of
   * different call sites never affect each other.
   */
  //% hidden
  export class WanderState {
    /** The source every destination is picked with; replace it to pick from another. */
    random: WanderRandom = new WanderRandom();
    /** The call sites holding a destination, in the order each first wandered; `legs` holds each one's destination at the same index. */
    callSiteIds: number[] = [];
    /** The destination of the call site at the same index of `callSiteIds`. */
    legs: WanderLeg[] = [];

    constructor() {}

    /**
     * The destination the call site `callSiteId` heads for, or `undefined`
     * when it has not wandered.
     *
     * @param callSiteId - Call-site id of a wandering move.
     */
    leg(callSiteId: number): WanderLeg {
      const index = this.callSiteIds.indexOf(callSiteId);
      return index < 0 ? undefined : this.legs[index];
    }

    /**
     * The direction the call site `callSiteId` wanders in now: from the
     * center of `sprite` toward its destination, scaled to length 1. A new
     * destination is picked first when the call site holds none, when the
     * sprite's center is within {@link WANDER_ARRIVAL_DISTANCE} of it, or
     * once `now` reaches its deadline: a random whole-pixel point at least
     * {@link WANDER_SCREEN_MARGIN} inside each edge of the part of the scene
     * `camera` shows, kept until {@link WANDER_DEADLINE_MS} after `now`.
     * `undefined` when the destination is the sprite's center.
     *
     * @param sprite - The wandering sprite.
     * @param callSiteId - Call-site id of the wandering move.
     * @param now - The scheduled time of the move, in milliseconds.
     * @param camera - The camera of the sprite's scene.
     */
    bearing(sprite: Sprite, callSiteId: number, now: number, camera: scene.Camera): DirectionVector {
      let index = this.callSiteIds.indexOf(callSiteId);
      if (index < 0) {
        index = this.callSiteIds.length;
        this.callSiteIds.push(callSiteId);
        this.legs.push(this.pickLeg(now, camera));
      } else {
        const leg = this.legs[index];
        const dx = leg.x - sprite.x;
        const dy = leg.y - sprite.y;
        const arrived = dx * dx + dy * dy <= WANDER_ARRIVAL_DISTANCE * WANDER_ARRIVAL_DISTANCE;
        if (arrived || now >= leg.deadline) {
          this.legs[index] = this.pickLeg(now, camera);
        }
      }
      const destination = this.legs[index];
      return unitVector(destination.x - sprite.x, destination.y - sprite.y);
    }

    /** A new destination picked at `now` on the part of the scene `camera` shows, less the margin. */
    private pickLeg(now: number, camera: scene.Camera): WanderLeg {
      const x = this.random.pick(camera.left + WANDER_SCREEN_MARGIN, camera.right - WANDER_SCREEN_MARGIN);
      const y = this.random.pick(camera.top + WANDER_SCREEN_MARGIN, camera.bottom - WANDER_SCREEN_MARGIN);
      return new WanderLeg(x, y, now + WANDER_DEADLINE_MS);
    }
  }
}
