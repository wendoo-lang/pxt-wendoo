/**
 * Reading Arcade's sprite overlaps: this module owns every raw overlap read,
 * made synchronously from the current scene's sprites at the moment it is
 * asked. Two sprites touch exactly when Arcade's `overlapsWith` says they
 * do, so a sprite flagged to ignore overlaps touches nothing.
 */
namespace wendoo {
  /**
   * The sprite `sprite` touches now in the current scene, or `undefined`
   * while it touches none. When it touches several, the one whose center is
   * nearest its own center; among those equally near, the one created first
   * in the scene (the lowest sprite id), so the same arrangement always
   * picks the same sprite.
   *
   * @param sprite - The sprite whose touch is read.
   */
  //% hidden
  export function bumpedSprite(sprite: Sprite): Sprite {
    const candidates = game.currentScene().allSprites;
    let picked: Sprite;
    let pickedDistance = 0;
    for (let i = 0; i < candidates.length; i++) {
      if (!(candidates[i] instanceof Sprite)) {
        continue;
      }
      const other = candidates[i] as Sprite;
      if (other === sprite || !sprite.overlapsWith(other)) {
        continue;
      }
      const dx = other.x - sprite.x;
      const dy = other.y - sprite.y;
      const distance = dx * dx + dy * dy;
      if (!picked || distance < pickedDistance || (distance === pickedDistance && other.id < picked.id)) {
        picked = other;
        pickedDistance = distance;
      }
    }
    return picked;
  }
}
