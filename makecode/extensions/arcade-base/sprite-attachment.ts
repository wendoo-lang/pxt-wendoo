/**
 * The binding between one program run and the Arcade sprite it runs on.
 * A fresh {@link SpriteAttachment} is created each time a program is attached
 * to a sprite, and it lives exactly as long as that run: attaching a
 * different brain replaces it. Every host-bound arcade tile executing
 * inside the run reaches its sprite through it -- the execution
 * context's attachment is the run's {@link SpriteAttachment}.
 */
namespace wendoo {
  /**
   * One program run's binding to its sprite: the sprite, standing as the
   * run's actor, plus the working state the run's own tiles keep. Keep
   * only run-scoped state here; state the sprite carries across runs,
   * such as its smoothing override, belongs in the sprite's own data.
   */
  //% hidden
  export class SpriteAttachment extends ActorAttachment {
    /** The sprite this run's program animates: the run's actor. */
    sprite: Sprite;
    /** The destinations the program's wandering moves head for, one per call site, and the random source picking them. */
    wander: WanderState;

    /**
     * @param sprite - The sprite the program runs on.
     */
    constructor(sprite: Sprite) {
      super();
      this.sprite = sprite;
      this.wander = new WanderState();
    }

    /** Whether the sprite has been destroyed. */
    hasEnded(): boolean {
      return isDestroyed(this.sprite);
    }

    /**
     * Whether `other` is the attachment of this same sprite.
     *
     * @param other - Attachment of the actor a program is being attached to.
     */
    isSameActor(other: ActorAttachment): boolean {
      return other instanceof SpriteAttachment && (other as SpriteAttachment).sprite === this.sprite;
    }
  }
}
