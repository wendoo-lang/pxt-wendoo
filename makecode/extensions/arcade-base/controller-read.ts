/**
 * Reading the Arcade controller: this module owns every raw controller read
 * and the raw-to-clean transform, so no tile downstream sees a pressure
 * level -- only whether the A or B button is held, and a clean direction in
 * Arcade's own convention, `x` increasing rightward and `y` increasing
 * downward, each component from -1 (full deflection left or up) to 1 (full
 * deflection right or down).
 *
 * A digital dpad reads full deflection on every pressed direction. An analog
 * controller reads each axis as the difference of its two buttons' pressure
 * levels, through a per-axis dead band: deflection inside the band reads
 * exactly 0, and the live band beyond it rescales smoothly from 0 at the band
 * edge to full deflection.
 */
namespace wendoo {
  /**
   * Half-width of each analog axis's dead band, as a fraction of full
   * deflection. Must be at least 0 and less than 1, so the live band beyond
   * it is not empty.
   */
  //% hidden
  export const DPAD_DEAD_BAND = 0.1;

  /** The pressure level a controller button reports when pressed all the way. */
  const FULL_PRESSURE = 512;

  /** A direction on the Arcade screen: `x` increasing rightward, `y` increasing downward. */
  //% hidden
  export class DirectionVector {
    /** Horizontal component; positive is rightward. */
    x: number;
    /** Vertical component; positive is downward. */
    y: number;

    /**
     * @param x - Horizontal component; positive is rightward.
     * @param y - Vertical component; positive is downward.
     */
    constructor(x: number, y: number) {
      this.x = x;
      this.y = y;
    }

    /** Whether both components are 0, so the vector points nowhere. */
    isZero(): boolean {
      return this.x === 0 && this.y === 0;
    }
  }

  /**
   * One analog axis's deflection, dead-banded: a deflection whose magnitude
   * is at most {@link DPAD_DEAD_BAND} reads 0, and one beyond it reads its
   * position in the live band, rescaled from 0 at the band edge to 1 at full
   * deflection, with the deflection's sign. A magnitude above 1 reads as 1.
   *
   * @param deflection - Raw deflection of the axis, from -1 to 1.
   */
  //% hidden
  export function deadBandAxis(deflection: number): number {
    const magnitude = deflection < 0 ? -deflection : deflection;
    if (magnitude <= DPAD_DEAD_BAND) {
      return 0;
    }
    let scaled = (magnitude - DPAD_DEAD_BAND) / (1 - DPAD_DEAD_BAND);
    if (scaled > 1) {
      scaled = 1;
    }
    return deflection < 0 ? -scaled : scaled;
  }

  /**
   * One axis of a digital dpad: -1 while only its negative button is
   * pressed, 1 while only its positive button is, and 0 otherwise.
   */
  function digitalAxis(negative: controller.Button, positive: controller.Button): number {
    return (positive.isPressed() ? 1 : 0) - (negative.isPressed() ? 1 : 0);
  }

  /** One axis of an analog controller: the pressure difference of its two buttons as a raw deflection, dead-banded. */
  function analogAxis(negative: controller.Button, positive: controller.Button): number {
    return deadBandAxis((positive.pressureLevel() - negative.pressureLevel()) / FULL_PRESSURE);
  }

  /**
   * Arcade's controller of the player numbered `player`: player two's,
   * three's or four's for 2, 3 or 4, and player one's for any other number.
   */
  function controllerOf(player: number): controller.Controller {
    switch (player) {
      case 2:
        return controller.player2;
      case 3:
        return controller.player3;
      case 4:
        return controller.player4;
    }
    return controller.player1;
  }

  /**
   * The direction the dpad of the player numbered `player` points now, read
   * fresh: each component from -1 to 1, the zero vector when it points
   * nowhere. A digital dpad reads full deflection on each pressed direction,
   * so holding two directions reads a diagonal of two unit components; an
   * analog controller reads each axis dead-banded.
   *
   * @param player - The player's number: 2, 3 or 4 for that player, any other number for player one.
   */
  //% hidden
  export function readDpadDirection(player: number): DirectionVector {
    const pad = controllerOf(player);
    if (pad.analog) {
      return new DirectionVector(analogAxis(pad.left, pad.right), analogAxis(pad.up, pad.down));
    }
    return new DirectionVector(digitalAxis(pad.left, pad.right), digitalAxis(pad.up, pad.down));
  }

  /**
   * Whether the A or B button of the player numbered `player` is held now,
   * read fresh.
   *
   * @param player - The player's number: 2, 3 or 4 for that player, any other number for player one.
   * @param button - `ControllerButton.B` reads the B button; any other value reads the A button.
   */
  //% hidden
  export function readButtonHeld(player: number, button: ControllerButton): boolean {
    const pad = controllerOf(player);
    return (button === ControllerButton.B ? pad.B : pad.A).isPressed();
  }
}
