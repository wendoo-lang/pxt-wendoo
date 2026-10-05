/**
 * Brains as Wendoo values: the `Brain` type a program names one of the
 * project's brains by, and the sprites running the brain such a value
 * names. A value holds the brain's document id only; which sprites run it is
 * read when the value is used.
 */
namespace wendoo {
  /** Wendoo type name of a brain value: a plain struct naming one of the project's brains by its document id. */
  //% hidden
  export const TYPE_BRAIN = "Brain";

  /**
   * The `Brain` type's binding. Its atom id and its id field's id are the
   * project's mapping's once the program host has drained registrations.
   */
  //% hidden
  export const brainBinding = new BrainTypeBinding();

  /**
   * The sprites running, in the program host of `world`, the brain `value`
   * names, in start order. Empty when `value` is not a `Brain` value, nil
   * included, when the world's program host has started no program on it,
   * or when no sprite runs that brain.
   *
   * @param world - World of the sprite whose program reads the value.
   * @param value - Any value a program produced.
   */
  //% hidden
  export function spritesRunning(world: SpriteWorld, value: Value): Sprite[] {
    const documentId = brainBinding.documentIdOf(value);
    const runners: Sprite[] = [];
    if (documentId.length === 0 || !world.host) {
      return runners;
    }
    const worlds = world.host.worldsRunning(documentId);
    for (let i = 0; i < worlds.length; i++) {
      if (worlds[i] instanceof SpriteWorld) {
        runners.push((worlds[i] as SpriteWorld).sprite);
      }
    }
    return runners;
  }
}
