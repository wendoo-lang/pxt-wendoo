/**
 * Reading how near the current scene's sprites are to a sprite: this module
 * owns the nearest-sprite scan and its metric, made synchronously from the
 * current scene's sprites at the moment it is asked. Nearness is the
 * distance between sprite centers.
 */
namespace wendoo {
  /**
   * The square of the distance between the centers of `a` and `b`, in
   * square pixels.
   *
   * @param a - One sprite.
   * @param b - The other sprite.
   */
  //% hidden
  export function centerDistanceSquared(a: Sprite, b: Sprite): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return dx * dx + dy * dy;
  }

  /**
   * The sprite in the current scene, other than `sprite` and not destroyed,
   * whose center is nearest the center of `sprite`; among those equally
   * near, the one created first in the scene (the lowest sprite id).
   * `undefined` when the scene holds no other such sprite `admits` admits. A
   * sprite destroyed with an effect stays in the scene while the effect
   * plays, and is never picked.
   *
   * @param sprite - The sprite nearness is read from.
   * @param admits - Whether a sprite may be picked; omit to admit every sprite.
   */
  //% hidden
  export function nearestSprite(sprite: Sprite, admits?: (other: Sprite) => boolean): Sprite {
    const candidates = game.currentScene().allSprites;
    let picked: Sprite;
    let pickedDistance = 0;
    for (let i = 0; i < candidates.length; i++) {
      if (!(candidates[i] instanceof Sprite)) {
        continue;
      }
      const other = candidates[i] as Sprite;
      if (other === sprite || isDestroyed(other) || (admits && !admits(other))) {
        continue;
      }
      const distance = centerDistanceSquared(sprite, other);
      if (!picked || distance < pickedDistance || (distance === pickedDistance && other.id < picked.id)) {
        picked = other;
        pickedDistance = distance;
      }
    }
    return picked;
  }
}
