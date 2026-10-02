/**
 * Hosting Wendoo programs on Arcade sprites: each game scene gets one
 * program host, drained once per frame from the scene's own update loop, and
 * each sprite given a program is an actor of its scene's host.
 *
 * Every scene's host runs the core vocabulary and every pack's, bound
 * through the project's id manifest by the one drain the hosts share. A
 * sprite's world carries the sprite, and a host-bound tile reaches its
 * sprite through the world.
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

  /** Key the program host of a scene is kept under in the scene's data. */
  const SCENE_HOST_KEY = "wendoo.programHost";

  /**
   * The program host of `gameScene`, created on first use with its drain
   * registered on the scene's update loop. Each frame of the scene publishes
   * the catalog to the Wendoo simulator extension, then drains the host at
   * the scene's elapsed time. A scene the game has pushed a new scene over runs
   * no frames, so its programs pause with it and resume when it is popped
   * back.
   *
   * @param gameScene - The scene whose programs the host runs.
   */
  //% hidden
  export function sceneProgramHost(gameScene: scene.Scene): ProgramHost {
    const existing = gameScene.data[SCENE_HOST_KEY] as ProgramHost;
    if (existing) {
      return existing;
    }
    const host = new ProgramHost(new VmObserver());
    gameScene.data[SCENE_HOST_KEY] = host;
    gameScene.eventContext.registerFrameHandler(scene.UPDATE_PRIORITY, () => {
      publishCatalog(new CatalogIconEncoder());
      host.drain(gameScene.millis());
    });
    return host;
  }

  sceneProgramHost(game.currentScene());
}
