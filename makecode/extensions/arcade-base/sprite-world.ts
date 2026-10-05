/**
 * The world of a Wendoo program running on an Arcade sprite. Every
 * host-bound arcade tile reaches the sprite its program runs on through it:
 * the execution context's world is the sprite's {@link SpriteWorld}.
 */
namespace wendoo {
  /** The world of one sprite a program runs on: the sprite, as its program's actor, and the wander and motion state its moves keep. */
  //% hidden
  export class SpriteWorld extends ActorWorld {
    /** The sprite the program runs on. */
    sprite: Sprite;
    /** The destinations the program's wandering moves head for, one per call site, and the random source picking them. */
    wander: WanderState;
    /** The velocity the program's moves last set the sprite moving at; while {@link moveSmoothing} is on, a move at least that fast eases from it. */
    motion: AppliedMotion;

    /**
     * @param sprite - The sprite the program runs on.
     */
    constructor(sprite: Sprite) {
      super();
      this.sprite = sprite;
      this.wander = new WanderState();
      this.motion = new AppliedMotion();
    }

    /** Whether the sprite has been destroyed. */
    hasEnded(): boolean {
      return isDestroyed(this.sprite);
    }

    /**
     * Whether `other` is the world of this same sprite.
     *
     * @param other - World of the actor a program is being attached to.
     */
    isSameActor(other: ActorWorld): boolean {
      return other instanceof SpriteWorld && (other as SpriteWorld).sprite === this.sprite;
    }
  }
}
