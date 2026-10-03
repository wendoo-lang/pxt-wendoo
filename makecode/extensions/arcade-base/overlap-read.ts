/**
 * Reading Arcade's sprite overlaps: this module owns every raw overlap read,
 * made synchronously from the current scene's sprites at the moment it is
 * asked. Two sprites touch exactly when Arcade's `overlapsWith` says they
 * do, so a sprite flagged to ignore overlaps touches nothing.
 */
namespace wendoo {
  /**
   * The sprite `sprite` touches now in the current scene, or `undefined`
   * while it touches none. When it touches several, the one
   * {@link nearestSprite} picks among them: nearest center first, ties to
   * the sprite created first.
   *
   * @param sprite - The sprite whose touch is read.
   */
  //% hidden
  export function bumpedSprite(sprite: Sprite): Sprite {
    return nearestSprite(sprite, (other: Sprite) => sprite.overlapsWith(other));
  }
}
