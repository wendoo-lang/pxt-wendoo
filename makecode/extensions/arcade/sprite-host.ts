/**
 * Hosting Wendoo programs on Arcade sprites: each game scene gets one
 * program host, drained once per frame from the scene's own update loop, and
 * each sprite given a program is an actor of its scene's host.
 *
 * Every scene's host runs the core vocabulary and every pack's, bound
 * through the project's id manifest by the one drain the hosts share. Each
 * sprite runs its program in a {@link SpriteWorld}, through which a
 * host-bound tile reaches the sprite.
 */
namespace wendoo {
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
