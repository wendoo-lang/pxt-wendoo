/**
 * Reading Arcade's sprite overlaps: this module owns every raw overlap read,
 * made synchronously from the current scene's sprites at the moment it is
 * asked. Two sprites touch exactly when Arcade's `overlapsWith` says they
 * do, so a sprite flagged to ignore overlaps touches nothing.
 */
namespace wendoo {
  /**
   * The sprite `sprite` touches now in the current scene, among those
   * `admits` admits, or `undefined` while it touches none of them. When it
   * touches several, the one {@link nearestSprite} picks among them: nearest
   * center first, ties to the sprite created first.
   *
   * @param sprite - The sprite whose touch is read.
   * @param admits - Whether a touched sprite may be picked; omit to admit every touched sprite.
   */
  //% hidden
  export function bumpedSprite(sprite: Sprite, admits?: (other: Sprite) => boolean): Sprite {
    return nearestSprite(sprite, (other: Sprite) => sprite.overlapsWith(other) && (!admits || admits(other)));
  }
}
