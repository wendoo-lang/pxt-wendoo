/**
 * The world of a Wendoo program running on an Arcade sprite. Every
 * host-bound arcade tile reaches the sprite its program runs on through it:
 * the execution context's world is the sprite's {@link SpriteWorld}.
 */
namespace wendoo {
  /** The world of one sprite a program runs on: the sprite, as its program's actor. */
  //% hidden
  export class SpriteWorld extends ActorWorld {
    /** The sprite the program runs on. */
    sprite: Sprite;

    /**
     * @param sprite - The sprite the program runs on.
     */
    constructor(sprite: Sprite) {
      super();
      this.sprite = sprite;
    }

    /** Whether the sprite has been destroyed. */
    hasEnded(): boolean {
      return (this.sprite.flags & sprites.Flag.Destroyed) !== 0;
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
