/**
 * The arcade base pack's icons: one 16 by 16 image per tile and per
 * modifier tile its tiles' argument grammars declare, per accessor tile its
 * types declare, per core tile it gives an icon, and per type it gives one,
 * each the img literal one function returns, which the catalog carries
 * through the arcade icon encoder. Outside tests, call them only from
 * {@link attachArcadeBaseIcons}.
 */
namespace wendoo {
  /** Icon of the dpad sensor: a dpad cross. */
  //% hidden
  export function dpadIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . . . . c c c c . . . . . .
      . . . . . . c c c c . . . . . .
      . . . . . . c c c c . . . . . .
      . . . . . . c c c c . . . . . .
      . . . . . . c c c c . . . . . .
      . c c c c c c c c c c c c c c .
      . c c c c c c 1 1 c c c c c c .
      . c c c c c c 1 1 c c c c c c .
      . c c c c c c c c c c c c c c .
      . . . . . . c c c c . . . . . .
      . . . . . . c c c c . . . . . .
      . . . . . . c c c c . . . . . .
      . . . . . . c c c c . . . . . .
      . . . . . . c c c c . . . . . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the move actuator: an arrow trailing speed lines. */
  //% hidden
  export function moveIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . 7 . . . . . .
      . . . . . . . . . 7 7 . . . . .
      . . . . . . . . . 7 7 7 . . . .
      . . . . . . . . . 7 7 7 7 . . .
      7 7 . 7 7 . 7 7 7 7 7 7 7 7 . .
      7 7 . 7 7 . 7 7 7 7 7 7 7 7 7 .
      7 7 . 7 7 . 7 7 7 7 7 7 7 7 7 .
      7 7 . 7 7 . 7 7 7 7 7 7 7 7 . .
      . . . . . . . . . 7 7 7 7 . . .
      . . . . . . . . . 7 7 7 . . . .
      . . . . . . . . . 7 7 . . . . .
      . . . . . . . . . 7 . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the bump sensor: two blocks touching under a spark. */
  //% hidden
  export function bumpIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . . 5 . . 5 5 . . 5 . . . .
      . . . . . 5 . 5 5 . 5 . . . . .
      . . . . . . 5 . . 5 . . . . . .
      . . . . . . . . . . . . . . . .
      . 2 2 2 2 2 2 2 8 8 8 8 8 8 8 .
      . 2 2 2 2 2 2 2 8 8 8 8 8 8 8 .
      . 2 2 2 2 2 2 2 8 8 8 8 8 8 8 .
      . 2 2 2 2 2 2 2 8 8 8 8 8 8 8 .
      . 2 2 2 2 2 2 2 8 8 8 8 8 8 8 .
      . 2 2 2 2 2 2 2 8 8 8 8 8 8 8 .
      . 2 2 2 2 2 2 2 8 8 8 8 8 8 8 .
      . 2 2 2 2 2 2 2 8 8 8 8 8 8 8 .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the in-range sensor: a sprite inside the ring around the program's sprite. */
  //% hidden
  export function inRangeIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . . . 9 9 9 9 9 9 . . . . .
      . . . 9 9 . . . . . . 9 9 . . .
      . . 9 . . . . . . . . . . 9 . .
      . . 9 . . . . . . . 2 2 . 9 . .
      . 9 . . . . . . . . 2 2 . . 9 .
      . 9 . . . . . . . . . . . . 9 .
      . 9 . . . . . 7 7 . . . . . 9 .
      . 9 . . . . . 7 7 . . . . . 9 .
      . 9 . . . . . . . . . . . . 9 .
      . 9 . . . . . . . . . . . . 9 .
      . . 9 . . . . . . . . . . 9 . .
      . . 9 . . . . . . . . . . 9 . .
      . . . 9 9 . . . . . . 9 9 . . .
      . . . . . 9 9 9 9 9 9 . . . . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the out-of-range sensor: a sprite outside the ring around the program's sprite. */
  //% hidden
  export function outOfRangeIcon(): Image {
    return img`
      . . . . . . . . . . . . . . 2 2
      . . . . . 9 9 9 9 9 9 . . . 2 2
      . . . 9 9 . . . . . . 9 9 . . .
      . . 9 . . . . . . . . . . 9 . .
      . . 9 . . . . . . . . . . 9 . .
      . 9 . . . . . . . . . . . . 9 .
      . 9 . . . . . . . . . . . . 9 .
      . 9 . . . . . 7 7 . . . . . 9 .
      . 9 . . . . . 7 7 . . . . . 9 .
      . 9 . . . . . . . . . . . . 9 .
      . 9 . . . . . . . . . . . . 9 .
      . . 9 . . . . . . . . . . 9 . .
      . . 9 . . . . . . . . . . 9 . .
      . . . 9 9 . . . . . . 9 9 . . .
      . . . . . 9 9 9 9 9 9 . . . . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the myself sensor: a smiling hero in a teal starred helmet and an orange tunic. */
  //% hidden
  export function myselfIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . . . f f f f f f . . . . .
      . . . f f 6 6 6 6 6 6 f f . . .
      . . f 6 6 6 6 5 5 6 6 9 9 f . .
      . . f 6 6 6 5 5 5 5 6 6 9 f . .
      . f 6 6 6 6 6 5 5 6 6 6 6 6 f .
      . f 6 6 f f f f f f f f 6 6 f .
      . f 6 f d d d d d d d d f 6 f .
      . f 6 f d d f d d f d d f 6 f .
      . f 6 f d d f d d f d d f 6 f .
      . f 6 f 3 d d d d d d 3 f 6 f .
      . . f f d d f d d f d d f f . .
      . . . f f d d f f d d f f . . .
      . . f 4 4 f 4 5 5 4 f 4 4 f . .
      . . f d f 4 4 4 4 4 4 f d f . .
      . . . f c c c f f c c c f . . .
    `;
  }

  /** Icon of the `up` direction modifier: an arrow pointing up. */
  //% hidden
  export function upIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . 8 8 . . . . . . .
      . . . . . . 8 8 8 8 . . . . . .
      . . . . . 8 8 8 8 8 8 . . . . .
      . . . . 8 8 8 8 8 8 8 8 . . . .
      . . . 8 8 8 8 8 8 8 8 8 8 . . .
      . . 8 8 8 8 8 8 8 8 8 8 8 8 . .
      . . . . . . 8 8 8 8 . . . . . .
      . . . . . . 8 8 8 8 . . . . . .
      . . . . . . 8 8 8 8 . . . . . .
      . . . . . . 8 8 8 8 . . . . . .
      . . . . . . 8 8 8 8 . . . . . .
      . . . . . . 8 8 8 8 . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the `down` direction modifier: an arrow pointing down. */
  //% hidden
  export function downIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . 8 8 8 8 . . . . . .
      . . . . . . 8 8 8 8 . . . . . .
      . . . . . . 8 8 8 8 . . . . . .
      . . . . . . 8 8 8 8 . . . . . .
      . . . . . . 8 8 8 8 . . . . . .
      . . . . . . 8 8 8 8 . . . . . .
      . . 8 8 8 8 8 8 8 8 8 8 8 8 . .
      . . . 8 8 8 8 8 8 8 8 8 8 . . .
      . . . . 8 8 8 8 8 8 8 8 . . . .
      . . . . . 8 8 8 8 8 8 . . . . .
      . . . . . . 8 8 8 8 . . . . . .
      . . . . . . . 8 8 . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the `left` direction modifier: an arrow pointing left. */
  //% hidden
  export function leftIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . 8 . . . . . . . .
      . . . . . . 8 8 . . . . . . . .
      . . . . . 8 8 8 . . . . . . . .
      . . . . 8 8 8 8 . . . . . . . .
      . . . 8 8 8 8 8 8 8 8 8 8 8 . .
      . . 8 8 8 8 8 8 8 8 8 8 8 8 . .
      . . 8 8 8 8 8 8 8 8 8 8 8 8 . .
      . . . 8 8 8 8 8 8 8 8 8 8 8 . .
      . . . . 8 8 8 8 . . . . . . . .
      . . . . . 8 8 8 . . . . . . . .
      . . . . . . 8 8 . . . . . . . .
      . . . . . . . 8 . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the `right` direction modifier: an arrow pointing right. */
  //% hidden
  export function rightIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . 8 . . . . . . .
      . . . . . . . . 8 8 . . . . . .
      . . . . . . . . 8 8 8 . . . . .
      . . . . . . . . 8 8 8 8 . . . .
      . . 8 8 8 8 8 8 8 8 8 8 8 . . .
      . . 8 8 8 8 8 8 8 8 8 8 8 8 . .
      . . 8 8 8 8 8 8 8 8 8 8 8 8 . .
      . . 8 8 8 8 8 8 8 8 8 8 8 . . .
      . . . . . . . . 8 8 8 8 . . . .
      . . . . . . . . 8 8 8 . . . . .
      . . . . . . . . 8 8 . . . . . .
      . . . . . . . . 8 . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the move's `toward` modifier: an arrow pointing at a sprite. */
  //% hidden
  export function towardIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . 7 . . . . . . . . .
      . . . . . . 7 7 . . . . . . . .
      . . . . . . 7 7 7 . . . . . . .
      . 7 7 7 7 7 7 7 7 7 . . 2 2 2 2
      . 7 7 7 7 7 7 7 7 7 7 . 2 2 2 2
      . 7 7 7 7 7 7 7 7 7 7 . 2 2 2 2
      . 7 7 7 7 7 7 7 7 7 . . 2 2 2 2
      . . . . . . 7 7 7 . . . . . . .
      . . . . . . 7 7 . . . . . . . .
      . . . . . . 7 . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the move's `away` modifier: an arrow pointing away from a sprite. */
  //% hidden
  export function awayIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . 7 . . . . . . . . . .
      . . . . 7 7 . . . . . . . . . .
      . . . 7 7 7 . . . . . . . . . .
      . . 7 7 7 7 7 7 7 7 7 . 2 2 2 2
      . 7 7 7 7 7 7 7 7 7 7 . 2 2 2 2
      . 7 7 7 7 7 7 7 7 7 7 . 2 2 2 2
      . . 7 7 7 7 7 7 7 7 7 . 2 2 2 2
      . . . 7 7 7 . . . . . . . . . .
      . . . . 7 7 . . . . . . . . . .
      . . . . . 7 . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the move's `wander` modifier: a winding trail climbing to a destination. */
  //% hidden
  export function wanderIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . 2 2 .
      . . . . . . . . . . . . 2 2 2 2
      . . . . . . . . . . . . 2 2 2 2
      . . . . . . . . . . . 7 . 2 2 .
      . . . . . . . . . . 7 . . . . .
      . . 7 7 . 7 7 . 7 7 . . . . . .
      . 7 . . . . . . . . . . . . . .
      . 7 . . . . . . . . . . . . . .
      . . 7 7 . 7 7 . 7 7 . . . . . .
      . . . . . . . . . . 7 . . . . .
      . . . . . . . . . . 7 . . . . .
      . . 7 7 . 7 7 . 7 7 . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the move's `slowly` modifier: one chevron. */
  //% hidden
  export function slowlyIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . 4 4 . . . . . . . . .
      . . . . . . 4 4 . . . . . . . .
      . . . . . . . 4 4 . . . . . . .
      . . . . . . . . 4 4 . . . . . .
      . . . . . . . . . 4 4 . . . . .
      . . . . . . . . . 4 4 . . . . .
      . . . . . . . . 4 4 . . . . . .
      . . . . . . . 4 4 . . . . . . .
      . . . . . . 4 4 . . . . . . . .
      . . . . . 4 4 . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the move's `quickly` modifier: two chevrons. */
  //% hidden
  export function quicklyIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . 4 4 . . . . . 4 4 . . . . . .
      . . 4 4 . . . . . 4 4 . . . . .
      . . . 4 4 . . . . . 4 4 . . . .
      . . . . 4 4 . . . . . 4 4 . . .
      . . . . . 4 4 . . . . . 4 4 . .
      . . . . . 4 4 . . . . . 4 4 . .
      . . . . 4 4 . . . . . 4 4 . . .
      . . . 4 4 . . . . . 4 4 . . . .
      . . 4 4 . . . . . 4 4 . . . . .
      . 4 4 . . . . . 4 4 . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the positional modifier above: another sprite above the program's sprite, past the line through its center. */
  //% hidden
  export function aboveIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . . . . 2 2 2 2 . . . . . .
      . . . . . . 2 2 2 2 . . . . . .
      . . . . . . 2 2 2 2 . . . . . .
      . . . . . . 2 2 2 2 . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . 7 7 7 7 . . . . . .
      b . b . b . 7 7 7 7 . b . b . b
      . . . . . . 7 7 7 7 . . . . . .
      . . . . . . 7 7 7 7 . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the positional modifier below: another sprite below the program's sprite, past the line through its center. */
  //% hidden
  export function belowIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . 7 7 7 7 . . . . . .
      . . . . . . 7 7 7 7 . . . . . .
      b . b . b . 7 7 7 7 . b . b . b
      . . . . . . 7 7 7 7 . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . 2 2 2 2 . . . . . .
      . . . . . . 2 2 2 2 . . . . . .
      . . . . . . 2 2 2 2 . . . . . .
      . . . . . . 2 2 2 2 . . . . . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the positional modifier left of: another sprite left of the program's sprite, past the line through its center. */
  //% hidden
  export function leftOfIcon(): Image {
    return img`
      . . . . . . . . . b . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . b . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . b . . . . . .
      . . . . . . . . . . . . . . . .
      . 2 2 2 2 . . . 7 7 7 7 . . . .
      . 2 2 2 2 . . . 7 7 7 7 . . . .
      . 2 2 2 2 . . . 7 7 7 7 . . . .
      . 2 2 2 2 . . . 7 7 7 7 . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . b . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . b . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . b . . . . . .
    `;
  }

  /** Icon of the positional modifier right of: another sprite right of the program's sprite, past the line through its center. */
  //% hidden
  export function rightOfIcon(): Image {
    return img`
      . . . . . . b . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . b . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . b . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . 7 7 7 7 . . . 2 2 2 2 .
      . . . . 7 7 7 7 . . . 2 2 2 2 .
      . . . . 7 7 7 7 . . . 2 2 2 2 .
      . . . . 7 7 7 7 . . . 2 2 2 2 .
      . . . . . . . . . . . . . . . .
      . . . . . . b . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . b . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . b . . . . . . . . .
    `;
  }

  /** Icon of the core this-page-starts sensor: a play mark on a page. */
  //% hidden
  export function coreOnPageEnteredIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . c c c c c c c . . . . . .
      . . . c 1 1 1 1 1 c c . . . . .
      . . . c 1 1 1 1 1 c 1 c . . . .
      . . . c 1 1 1 1 1 c c c c . . .
      . . . c 1 1 1 1 1 1 1 1 c . . .
      . . . c 1 1 7 1 1 1 1 1 c . . .
      . . . c 1 1 7 7 1 1 1 1 c . . .
      . . . c 1 1 7 7 7 1 1 1 c . . .
      . . . c 1 1 7 7 7 7 1 1 c . . .
      . . . c 1 1 7 7 7 1 1 1 c . . .
      . . . c 1 1 7 7 1 1 1 1 c . . .
      . . . c 1 1 7 1 1 1 1 1 c . . .
      . . . c 1 1 1 1 1 1 1 1 c . . .
      . . . c c c c c c c c c c . . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the core go-to-page actuator: an arrow going into a page. */
  //% hidden
  export function coreSwitchPageIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . c c c c c c c . . . . . .
      . . . c 1 1 1 1 1 c c . . . . .
      . . . c 1 1 1 1 1 c 1 c . . . .
      . . . c 1 1 1 1 1 c c c c . . .
      . . . c 1 1 1 8 1 1 1 1 c . . .
      . . . c 1 1 1 8 8 1 1 1 c . . .
      . . . c 1 1 1 8 8 8 1 1 c . . .
      8 8 8 8 8 8 8 8 8 8 8 1 c . . .
      8 8 8 8 8 8 8 8 8 8 8 1 c . . .
      . . . c 1 1 1 8 8 8 1 1 c . . .
      . . . c 1 1 1 8 8 1 1 1 c . . .
      . . . c 1 1 1 8 1 1 1 1 c . . .
      . . . c 1 1 1 1 1 1 1 1 c . . .
      . . . c c c c c c c c c c . . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the core restart-page actuator: a circling arrow on a page. */
  //% hidden
  export function coreRestartPageIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . c c c c c c c . . . . . .
      . . . c 1 1 1 1 1 c c . . . . .
      . . . c 1 1 1 1 1 c 1 c . . . .
      . . . c 1 1 1 1 1 c c c c . . .
      . . . c 1 1 4 4 4 4 1 1 c . . .
      . . . c 1 4 4 1 1 4 4 1 c . . .
      . . . c 4 4 1 1 4 4 4 4 c . . .
      . . . c 4 4 1 1 1 4 4 1 c . . .
      . . . c 4 4 1 1 1 1 1 1 c . . .
      . . . c 4 4 1 1 1 1 4 4 c . . .
      . . . c 1 4 4 1 1 4 4 1 c . . .
      . . . c 1 1 4 4 4 4 1 1 c . . .
      . . . c 1 1 1 1 1 1 1 1 c . . .
      . . . c c c c c c c c c c . . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the core current-page sensor: a dot marking a page. */
  //% hidden
  export function coreCurrentPageIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . c c c c c c c . . . . . .
      . . . c 1 1 1 1 1 c c . . . . .
      . . . c 1 1 1 1 1 c 1 c . . . .
      . . . c 1 1 1 1 1 c c c c . . .
      . . . c 1 1 1 1 1 1 1 1 c . . .
      . . . c 1 1 1 1 1 1 1 1 c . . .
      . . . c 1 1 1 2 2 1 1 1 c . . .
      . . . c 1 1 2 2 2 2 1 1 c . . .
      . . . c 1 1 2 2 2 2 1 1 c . . .
      . . . c 1 1 2 2 2 2 1 1 c . . .
      . . . c 1 1 1 2 2 1 1 1 c . . .
      . . . c 1 1 1 1 1 1 1 1 c . . .
      . . . c 1 1 1 1 1 1 1 1 c . . .
      . . . c c c c c c c c c c . . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the core previous-page sensor: a back arrow on a page. */
  //% hidden
  export function corePreviousPageIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . c c c c c c c . . . . . .
      . . . c 1 1 1 1 1 c c . . . . .
      . . . c 1 1 1 1 1 c 1 c . . . .
      . . . c 1 1 1 1 1 c c c c . . .
      . . . c 1 1 1 1 1 1 1 1 c . . .
      . . . c 1 1 1 6 1 1 1 1 c . . .
      . . . c 1 1 6 6 1 1 1 1 c . . .
      . . . c 1 6 6 6 6 6 6 1 c . . .
      . . . c 1 6 6 6 6 6 6 1 c . . .
      . . . c 1 1 6 6 1 1 1 1 c . . .
      . . . c 1 1 1 6 1 1 1 1 c . . .
      . . . c 1 1 1 1 1 1 1 1 c . . .
      . . . c 1 1 1 1 1 1 1 1 c . . .
      . . . c c c c c c c c c c . . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the core page tiles, one naming each of the program's pages: a plain page. */
  //% hidden
  export function corePageIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . c c c c c c c . . . . . .
      . . . c 1 1 1 1 1 c c . . . . .
      . . . c 1 1 1 1 1 c 1 c . . . .
      . . . c 1 1 1 1 1 c c c c . . .
      . . . c 1 1 1 1 1 1 1 1 c . . .
      . . . c 1 1 1 1 1 1 1 1 c . . .
      . . . c 1 1 1 1 1 1 1 1 c . . .
      . . . c 1 1 1 1 1 1 1 1 c . . .
      . . . c 1 1 1 1 1 1 1 1 c . . .
      . . . c 1 1 1 1 1 1 1 1 c . . .
      . . . c 1 1 1 1 1 1 1 1 c . . .
      . . . c 1 1 1 1 1 1 1 1 c . . .
      . . . c 1 1 1 1 1 1 1 1 c . . .
      . . . c c c c c c c c c c . . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the core timer sensor: an hourglass. */
  //% hidden
  export function coreTimerIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . e e e e e e e e e e e e . .
      . . . c . . . . . . . . c . . .
      . . . c 5 5 5 5 5 5 5 5 c . . .
      . . . . c 5 5 5 5 5 5 c . . . .
      . . . . . c 5 5 5 5 c . . . . .
      . . . . . . c 5 5 c . . . . . .
      . . . . . . . c c . . . . . . .
      . . . . . . . c c . . . . . . .
      . . . . . . c . 5 c . . . . . .
      . . . . . c . . 5 . c . . . . .
      . . . . c . . . 5 . . c . . . .
      . . . c . . 5 5 5 5 . . c . . .
      . . . c 5 5 5 5 5 5 5 5 c . . .
      . . e e e e e e e e e e e e . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the core AND operator: two circles, their overlap filled. */
  //% hidden
  export function coreAndIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . c c c c c c c c . . . .
      . . c c . . . c c . . . c c . .
      . c c . . . c 9 9 c . . . c c .
      . c . . . c 9 9 9 9 c . . . c .
      c . . . . c 9 9 9 9 c . . . . c
      c . . . c 9 9 9 9 9 9 c . . . c
      c . . . c 9 9 9 9 9 9 c . . . c
      c . . . . c 9 9 9 9 c . . . . c
      . c . . . c 9 9 9 9 c . . . c .
      . c c . . . c 9 9 c . . . c c .
      . . c c . . . c c . . . c c . .
      . . . . c c c c c c c c . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the core OR operator: two overlapping circles, both filled. */
  //% hidden
  export function coreOrIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . c c c c c c c c . . . .
      . . c c 9 9 9 c c 9 9 9 c c . .
      . c c 9 9 9 c 9 9 c 9 9 9 c c .
      . c 9 9 9 c 9 9 9 9 c 9 9 9 c .
      c 9 9 9 9 c 9 9 9 9 c 9 9 9 9 c
      c 9 9 9 c 9 9 9 9 9 9 c 9 9 9 c
      c 9 9 9 c 9 9 9 9 9 9 c 9 9 9 c
      c 9 9 9 9 c 9 9 9 9 c 9 9 9 9 c
      . c 9 9 9 c 9 9 9 9 c 9 9 9 c .
      . c c 9 9 9 c 9 9 c 9 9 9 c c .
      . . c c 9 9 9 c c 9 9 9 c c . .
      . . . . c c c c c c c c . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the core NOT operator: a no sign. */
  //% hidden
  export function coreNotIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . . . 2 2 2 2 2 2 . . . . .
      . . . 2 2 2 2 2 2 2 2 2 2 . . .
      . . 2 2 2 . . . . . . 2 2 2 . .
      . . 2 2 2 2 . . . . . . 2 2 . .
      . 2 2 . 2 2 2 . . . . . . 2 2 .
      . 2 2 . . 2 2 2 . . . . . 2 2 .
      . 2 2 . . . 2 2 2 . . . . 2 2 .
      . 2 2 . . . . 2 2 2 . . . 2 2 .
      . 2 2 . . . . . 2 2 2 . . 2 2 .
      . 2 2 . . . . . . 2 2 2 . 2 2 .
      . . 2 2 . . . . . . 2 2 2 2 . .
      . . 2 2 2 . . . . . . 2 2 2 . .
      . . . 2 2 2 2 2 2 2 2 2 2 . . .
      . . . . . 2 2 2 2 2 2 . . . . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the core equal-to operator: an equals sign. */
  //% hidden
  export function coreEqualIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . a a a a a a a a a a a a . .
      . . a a a a a a a a a a a a . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . a a a a a a a a a a a a . .
      . . a a a a a a a a a a a a . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the core not-equal-to operator: a struck-through equals sign. */
  //% hidden
  export function coreNotEqualIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . a a . . . .
      . . . . . . . . . . a a . . . .
      . . . . . . . . . a a . . . . .
      . . a a a a a a a a a a a a . .
      . . a a a a a a a a a a a a . .
      . . . . . . . . a a . . . . . .
      . . . . . . . a a . . . . . . .
      . . . . . . . a a . . . . . . .
      . . . . . . a a . . . . . . . .
      . . a a a a a a a a a a a a . .
      . . a a a a a a a a a a a a . .
      . . . . . a a . . . . . . . . .
      . . . . a a . . . . . . . . . .
      . . . . a a . . . . . . . . . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the core less-than operator: a less-than sign. */
  //% hidden
  export function coreLessIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . a a a .
      . . . . . . . . . . a a a a . .
      . . . . . . . . a a a a . . . .
      . . . . . . a a a a . . . . . .
      . . . . a a a a . . . . . . . .
      . . a a a a . . . . . . . . . .
      . a a a . . . . . . . . . . . .
      . a a a . . . . . . . . . . . .
      . . a a a a . . . . . . . . . .
      . . . . a a a a . . . . . . . .
      . . . . . . a a a a . . . . . .
      . . . . . . . . a a a a . . . .
      . . . . . . . . . . a a a a . .
      . . . . . . . . . . . . a a a .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the core less-than-or-equal-to operator: a less-than sign over a bar. */
  //% hidden
  export function coreLessOrEqualIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . a a . .
      . . . . . . . . . . a a a a . .
      . . . . . . . . a a a a . . . .
      . . . . . . a a a a . . . . . .
      . . . . a a a a . . . . . . . .
      . . a a a a . . . . . . . . . .
      . . . . a a a a . . . . . . . .
      . . . . . . a a a a . . . . . .
      . . . . . . . . a a a a . . . .
      . . . . . . . . . . a a a a . .
      . . . . . . . . . . . . a a . .
      . . . . . . . . . . . . . . . .
      . . a a a a a a a a a a a a . .
      . . a a a a a a a a a a a a . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the core greater-than operator: a greater-than sign. */
  //% hidden
  export function coreGreaterIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . a a a . . . . . . . . . . . .
      . . a a a a . . . . . . . . . .
      . . . . a a a a . . . . . . . .
      . . . . . . a a a a . . . . . .
      . . . . . . . . a a a a . . . .
      . . . . . . . . . . a a a a . .
      . . . . . . . . . . . . a a a .
      . . . . . . . . . . . . a a a .
      . . . . . . . . . . a a a a . .
      . . . . . . . . a a a a . . . .
      . . . . . . a a a a . . . . . .
      . . . . a a a a . . . . . . . .
      . . a a a a . . . . . . . . . .
      . a a a . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the core greater-than-or-equal-to operator: a greater-than sign over a bar. */
  //% hidden
  export function coreGreaterOrEqualIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . a a . . . . . . . . . . . .
      . . a a a a . . . . . . . . . .
      . . . . a a a a . . . . . . . .
      . . . . . . a a a a . . . . . .
      . . . . . . . . a a a a . . . .
      . . . . . . . . . . a a a a . .
      . . . . . . . . a a a a . . . .
      . . . . . . a a a a . . . . . .
      . . . . a a a a . . . . . . . .
      . . a a a a . . . . . . . . . .
      . . a a . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . a a a a a a a a a a a a . .
      . . a a a a a a a a a a a a . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the core random-number sensor: a die. */
  //% hidden
  export function coreRandomIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . f f f f f f f f f f f f . .
      . f 1 1 1 1 1 1 1 1 1 1 1 1 f .
      . f 1 f f 1 1 1 1 1 1 f f 1 f .
      . f 1 f f 1 1 1 1 1 1 f f 1 f .
      . f 1 1 1 1 1 1 1 1 1 1 1 1 f .
      . f 1 1 1 1 1 1 1 1 1 1 1 1 f .
      . f 1 1 1 1 1 f f 1 1 1 1 1 f .
      . f 1 1 1 1 1 f f 1 1 1 1 1 f .
      . f 1 1 1 1 1 1 1 1 1 1 1 1 f .
      . f 1 1 1 1 1 1 1 1 1 1 1 1 f .
      . f 1 f f 1 1 1 1 1 1 f f 1 f .
      . f 1 f f 1 1 1 1 1 1 f f 1 f .
      . f 1 1 1 1 1 1 1 1 1 1 1 1 f .
      . . f f f f f f f f f f f f . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the core true literal: a check mark. */
  //% hidden
  export function coreTrueIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . 7 7 . .
      . . . . . . . . . . . 7 7 7 . .
      . . . . . . . . . . 7 7 7 . . .
      . . . . . . . . . 7 7 7 . . . .
      . . . . . . . . 7 7 7 . . . . .
      . 7 7 . . . . 7 7 7 . . . . . .
      . 7 7 7 . . 7 7 7 . . . . . . .
      . . 7 7 7 7 7 7 . . . . . . . .
      . . . 7 7 7 7 . . . . . . . . .
      . . . . 7 7 . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the core false literal: a cross. */
  //% hidden
  export function coreFalseIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . 2 2 . . . . . . . . 2 2 . .
      . . 2 2 2 . . . . . . 2 2 2 . .
      . . . 2 2 2 . . . . 2 2 2 . . .
      . . . . 2 2 2 . . 2 2 2 . . . .
      . . . . . 2 2 2 2 2 2 . . . . .
      . . . . . . 2 2 2 2 . . . . . .
      . . . . . . 2 2 2 2 . . . . . .
      . . . . . 2 2 2 2 2 2 . . . . .
      . . . . 2 2 2 . . 2 2 2 . . . .
      . . . 2 2 2 . . . . 2 2 2 . . .
      . . 2 2 2 . . . . . . 2 2 2 . .
      . . 2 2 . . . . . . . . 2 2 . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the core nil literal: an empty dashed box. */
  //% hidden
  export function coreNilIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . b b b . . b b . . b b b . .
      . . b b b . . b b . . b b b . .
      . . b b . . . . . . . . b b . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . b b . . . . . . . . b b . .
      . . b b . . . . . . . . b b . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . b b . . . . . . . . b b . .
      . . b b b . . b b . . b b b . .
      . . b b b . . b b . . b b b . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the core plus operator: a plus sign. */
  //% hidden
  export function corePlusIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . 4 4 . . . . . . .
      . . . . . . . 4 4 . . . . . . .
      . . . . . . . 4 4 . . . . . . .
      . . . . . . . 4 4 . . . . . . .
      . . . . . . . 4 4 . . . . . . .
      . . 4 4 4 4 4 4 4 4 4 4 4 4 . .
      . . 4 4 4 4 4 4 4 4 4 4 4 4 . .
      . . . . . . . 4 4 . . . . . . .
      . . . . . . . 4 4 . . . . . . .
      . . . . . . . 4 4 . . . . . . .
      . . . . . . . 4 4 . . . . . . .
      . . . . . . . 4 4 . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the core minus operator: a minus sign. */
  //% hidden
  export function coreMinusIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . 4 4 4 4 4 4 4 4 4 4 4 4 . .
      . . 4 4 4 4 4 4 4 4 4 4 4 4 . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the core multiplied-by operator: a times sign. */
  //% hidden
  export function coreMultiplyIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . 4 4 . . . . . . . . 4 4 . .
      . . . 4 4 . . . . . . 4 4 . . .
      . . . . 4 4 . . . . 4 4 . . . .
      . . . . . 4 4 . . 4 4 . . . . .
      . . . . . . 4 4 4 4 . . . . . .
      . . . . . . 4 4 4 4 . . . . . .
      . . . . . 4 4 . . 4 4 . . . . .
      . . . . 4 4 . . . . 4 4 . . . .
      . . . 4 4 . . . . . . 4 4 . . .
      . . 4 4 . . . . . . . . 4 4 . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the core divided-by operator: a division sign. */
  //% hidden
  export function coreDivideIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . 4 4 . . . . . . .
      . . . . . . . 4 4 . . . . . . .
      . . . . . . . 4 4 . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . 4 4 4 4 4 4 4 4 4 4 4 4 . .
      . . 4 4 4 4 4 4 4 4 4 4 4 4 . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . 4 4 . . . . . . .
      . . . . . . . 4 4 . . . . . . .
      . . . . . . . 4 4 . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the core negative operator: a minus sign before a one. */
  //% hidden
  export function coreNegativeIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . 4 4 . . . .
      . . . . . . . . . 4 4 4 . . . .
      . . . . . . . . 4 4 4 4 . . . .
      . . . . . . . . . . 4 4 . . . .
      . . . . . . . . . . 4 4 . . . .
      . . 4 4 4 4 . . . . 4 4 . . . .
      . . 4 4 4 4 . . . . 4 4 . . . .
      . . . . . . . . . . 4 4 . . . .
      . . . . . . . . . . 4 4 . . . .
      . . . . . . . . . . 4 4 . . . .
      . . . . . . . . 4 4 4 4 4 4 . .
      . . . . . . . . 4 4 4 4 4 4 . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the core gets operator: a left-facing arrow. */
  //% hidden
  export function coreAssignIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . 8 8 . . . . . . . .
      . . . . . 8 8 . . . . . . . . .
      . . . . 8 8 . . . . . . . . . .
      . . . 8 8 . . . . . . . . . . .
      . . 8 8 8 8 8 8 8 8 8 8 8 8 . .
      . . 8 8 8 8 8 8 8 8 8 8 8 8 . .
      . . . 8 8 . . . . . . . . . . .
      . . . . 8 8 . . . . . . . . . .
      . . . . . 8 8 . . . . . . . . .
      . . . . . . 8 8 . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the core open-parenthesis tile: an opening parenthesis. */
  //% hidden
  export function coreOpenParenIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . . . . . . c c . . . . . .
      . . . . . . . c c . . . . . . .
      . . . . . . c c . . . . . . . .
      . . . . . c c c . . . . . . . .
      . . . . . c c . . . . . . . . .
      . . . . c c c . . . . . . . . .
      . . . . c c c . . . . . . . . .
      . . . . c c c . . . . . . . . .
      . . . . c c c . . . . . . . . .
      . . . . . c c . . . . . . . . .
      . . . . . c c c . . . . . . . .
      . . . . . . c c . . . . . . . .
      . . . . . . . c c . . . . . . .
      . . . . . . . . c c . . . . . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the core close-parenthesis tile: a closing parenthesis. */
  //% hidden
  export function coreCloseParenIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . . . . c c . . . . . . . .
      . . . . . . . c c . . . . . . .
      . . . . . . . . c c . . . . . .
      . . . . . . . . c c c . . . . .
      . . . . . . . . . c c . . . . .
      . . . . . . . . . c c c . . . .
      . . . . . . . . . c c c . . . .
      . . . . . . . . . c c c . . . .
      . . . . . . . . . c c c . . . .
      . . . . . . . . . c c . . . . .
      . . . . . . . . c c c . . . . .
      . . . . . . . . c c . . . . . .
      . . . . . . . c c . . . . . . .
      . . . . . . c c . . . . . . . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the core boolean variable factory: a jar holding a switch. */
  //% hidden
  export function coreBooleanVariableIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . . . c c c c c c . . . . .
      . . . . . c 1 1 1 1 c . . . . .
      . . c c c c c c c c c c c c . .
      . . c 1 1 1 1 1 1 1 1 1 1 c . .
      . . c 1 1 1 1 1 1 1 1 1 1 c . .
      . . c 1 1 1 1 1 1 1 1 1 1 c . .
      . . c 1 1 f f f f f f 1 1 c . .
      . . c 1 f 1 1 1 1 f f f 1 c . .
      . . c 1 f 1 1 1 1 f f f 1 c . .
      . . c 1 1 f f f f f f 1 1 c . .
      . . c 1 1 1 1 1 1 1 1 1 1 c . .
      . . c 1 1 1 1 1 1 1 1 1 1 c . .
      . . c 1 1 1 1 1 1 1 1 1 1 c . .
      . . c c c c c c c c c c c c . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the core number variable factory: a jar holding a number sign. */
  //% hidden
  export function coreNumberVariableIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . . . c c c c c c . . . . .
      . . . . . c 1 1 1 1 c . . . . .
      . . c c c c c c c c c c c c . .
      . . c 1 1 1 1 1 1 1 1 1 1 c . .
      . . c 1 1 1 1 1 1 1 1 1 1 c . .
      . . c 1 1 1 f 1 1 f 1 1 1 c . .
      . . c 1 1 f f f f f f 1 1 c . .
      . . c 1 1 1 f 1 1 f 1 1 1 c . .
      . . c 1 1 1 f 1 1 f 1 1 1 c . .
      . . c 1 1 f f f f f f 1 1 c . .
      . . c 1 1 1 f 1 1 f 1 1 1 c . .
      . . c 1 1 1 1 1 1 1 1 1 1 c . .
      . . c 1 1 1 1 1 1 1 1 1 1 c . .
      . . c c c c c c c c c c c c . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the core text variable factory: a jar holding quotation marks. */
  //% hidden
  export function coreTextVariableIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . . . c c c c c c . . . . .
      . . . . . c 1 1 1 1 c . . . . .
      . . c c c c c c c c c c c c . .
      . . c 1 1 1 1 1 1 1 1 1 1 c . .
      . . c 1 1 1 1 1 1 1 1 1 1 c . .
      . . c 1 1 1 1 1 1 1 1 1 1 c . .
      . . c 1 1 f f 1 1 f f 1 1 c . .
      . . c 1 1 f f 1 1 f f 1 1 c . .
      . . c 1 1 1 f 1 1 1 f 1 1 c . .
      . . c 1 1 f 1 1 1 f 1 1 1 c . .
      . . c 1 1 1 1 1 1 1 1 1 1 c . .
      . . c 1 1 1 1 1 1 1 1 1 1 c . .
      . . c 1 1 1 1 1 1 1 1 1 1 c . .
      . . c c c c c c c c c c c c . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the core number tile factory: a value box holding a number sign. */
  //% hidden
  export function coreNumberTileIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . 1 1 1 1 1 1 1 1 1 1 1 1 1 1 .
      . 1 1 1 1 1 1 1 1 1 1 1 1 1 1 .
      . 1 1 d d d d d d d d d d 1 1 .
      . 1 1 d d d f d d f d d d 1 1 .
      . 1 1 d d f f f f f f d d 1 1 .
      . 1 1 d d d f d d f d d d 1 1 .
      . 1 1 d d d f d d f d d d 1 1 .
      . 1 1 d d f f f f f f d d 1 1 .
      . 1 1 d d d f d d f d d d 1 1 .
      . 1 1 d d d d d d d d d d 1 1 .
      . 1 1 1 1 1 1 1 1 1 1 1 1 1 1 .
      . 1 1 1 1 1 1 1 1 1 1 1 1 1 1 .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the core text tile factory: a value box holding quotation marks. */
  //% hidden
  export function coreTextTileIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . 1 1 1 1 1 1 1 1 1 1 1 1 1 1 .
      . 1 1 1 1 1 1 1 1 1 1 1 1 1 1 .
      . 1 1 d d d d d d d d d d 1 1 .
      . 1 1 d d d d d d d d d d 1 1 .
      . 1 1 d d f f d d f f d d 1 1 .
      . 1 1 d d f f d d f f d d 1 1 .
      . 1 1 d d d f d d d f d d 1 1 .
      . 1 1 d d f d d d f d d d 1 1 .
      . 1 1 d d d d d d d d d d 1 1 .
      . 1 1 d d d d d d d d d d 1 1 .
      . 1 1 1 1 1 1 1 1 1 1 1 1 1 1 .
      . 1 1 1 1 1 1 1 1 1 1 1 1 1 1 .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the `Vector2` type: an arrow from a point. */
  //% hidden
  export function vector2TypeIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . 8 8 8 8 8 8 . .
      . . . . . . . . 8 8 8 8 8 8 . .
      . . . . . . . . . . 8 8 8 8 . .
      . . . . . . . . . 8 8 . 8 8 . .
      . . . . . . . . 8 8 . . 8 8 . .
      . . . . . . . 8 8 . . . 8 8 . .
      . . . . . . 8 8 . . . . . . . .
      . . . . . 8 8 . . . . . . . . .
      . . . . 8 8 . . . . . . . . . .
      . . . 8 8 . . . . . . . . . . .
      . . f f . . . . . . . . . . . .
      . . f f . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the `Sprite` type: a game character. */
  //% hidden
  export function spriteTypeIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . 2 2 2 2 2 2 2 2 . . . .
      . . . 2 2 2 2 2 2 2 2 2 2 . . .
      . . . 2 2 1 1 2 2 1 1 2 2 . . .
      . . . 2 2 1 1 2 2 1 1 2 2 . . .
      . . . 2 2 2 2 2 2 2 2 2 2 . . .
      . . . 2 2 2 2 2 2 2 2 2 2 . . .
      . . . 2 2 2 2 2 2 2 2 2 2 . . .
      . . . 2 2 2 2 2 2 2 2 2 2 . . .
      . . . 2 2 . 2 2 2 2 . 2 2 . . .
      . . . 2 2 . 2 2 2 2 . 2 2 . . .
      . . . 2 2 . . . . . . 2 2 . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the `Brain` type: a brain. */
  //% hidden
  export function brainTypeIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . a a . . a a . . . . .
      . . . a a a a a . a a a a a . .
      . . a a . a a a . a a a . a a .
      . . a a a a . a . a . a a a a .
      . a a . a a a a . a a a a . a a
      . a a a a . a a . a a . a a a a
      . a a a a a a a . a a a a a a a
      . a a . a a a a . a a a a . a a
      . . a a a a . a . a . a a a a .
      . . a a . a a a . a a a . a a .
      . . . a a a a a . a a a a a . .
      . . . . . a a . . a a . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the core number type: a number sign. */
  //% hidden
  export function numberTypeIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . 4 4 . . 4 4 . . . . .
      . . . . . 4 4 . . 4 4 . . . . .
      . . . . . 4 4 . . 4 4 . . . . .
      . . 4 4 4 4 4 4 4 4 4 4 4 4 . .
      . . 4 4 4 4 4 4 4 4 4 4 4 4 . .
      . . . . . 4 4 . . 4 4 . . . . .
      . . . . . 4 4 . . 4 4 . . . . .
      . . 4 4 4 4 4 4 4 4 4 4 4 4 . .
      . . 4 4 4 4 4 4 4 4 4 4 4 4 . .
      . . . . . 4 4 . . 4 4 . . . . .
      . . . . . 4 4 . . 4 4 . . . . .
      . . . . . 4 4 . . 4 4 . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the core text type: quotation marks over lines of text. */
  //% hidden
  export function textTypeIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . 6 6 6 . . 6 6 6 . . . .
      . . . . 6 6 6 . . 6 6 6 . . . .
      . . . . 6 6 6 . . 6 6 6 . . . .
      . . . . . . 6 . . . . 6 . . . .
      . . . . . 6 6 . . . 6 6 . . . .
      . . . . 6 6 . . . 6 6 . . . . .
      . . . . . . . . . . . . . . . .
      . . 6 6 6 6 6 6 6 6 6 6 6 6 . .
      . . . . . . . . . . . . . . . .
      . . 6 6 6 6 6 6 6 6 6 6 6 6 . .
      . . . . . . . . . . . . . . . .
      . . 6 6 6 6 6 6 6 6 . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the core switch type: a switch turned on, its knob to the right. */
  //% hidden
  export function switchTypeIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . 7 7 7 7 7 7 7 7 7 7 . . .
      . . 7 . . . . . . 7 7 7 7 7 . .
      . 7 . . . . . . 7 7 7 7 7 7 7 .
      . 7 . . . . . . 7 7 7 7 7 7 7 .
      . 7 . . . . . . 7 7 7 7 7 7 7 .
      . 7 . . . . . . 7 7 7 7 7 7 7 .
      . . 7 . . . . . . 7 7 7 7 7 . .
      . . . 7 7 7 7 7 7 7 7 7 7 . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the `x` accessor of a `Vector2`: the letter x over a left-right arrow. */
  //% hidden
  export function xAccessorIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . . f f . . . . f f . . . .
      . . . . f f . . . . f f . . . .
      . . . . . f f . . f f . . . . .
      . . . . . . f f f f . . . . . .
      . . . . . . . f f . . . . . . .
      . . . . . . f f f f . . . . . .
      . . . . . f f . . f f . . . . .
      . . . . f f . . . . f f . . . .
      . . . . f f . . . . f f . . . .
      . . . . . . . . . . . . . . . .
      . . . 8 . . . . . . . . 8 . . .
      . . 8 8 . . . . . . . . 8 8 . .
      . 8 8 8 8 8 8 8 8 8 8 8 8 8 8 .
      . . 8 8 . . . . . . . . 8 8 . .
      . . . 8 . . . . . . . . 8 . . .
    `;
  }

  /** Icon of the `y` accessor of a `Vector2`: the letter y beside an up-down arrow. */
  //% hidden
  export function yAccessorIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . f f . . . f f . . . . 8 . . .
      . f f . . . f f . . . 8 8 8 . .
      . . f f . f f . . . 8 8 8 8 8 .
      . . . f f f . . . . . . 8 . . .
      . . . . f . . . . . . . 8 . . .
      . . . . f . . . . . . . 8 . . .
      . . . . f . . . . . . . 8 . . .
      . . . . f . . . . . . . 8 . . .
      . . . . f . . . . . . . 8 . . .
      . . . . . . . . . . . . 8 . . .
      . . . . . . . . . . . . 8 . . .
      . . . . . . . . . . 8 8 8 8 8 .
      . . . . . . . . . . . 8 8 8 . .
      . . . . . . . . . . . . 8 . . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the `position` accessor of a `Sprite`: a sprite's center marked inside crosshairs. */
  //% hidden
  export function positionAccessorIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . . . . . 8 8 . . . . . . .
      . . . . . . . 8 8 . . . . . . .
      . . . . . 8 8 8 8 8 8 . . . . .
      . . . . 8 8 . 8 8 . 8 8 . . . .
      . . . 8 8 . . . . . . 8 8 . . .
      . . . 8 . . . 2 2 . . . 8 . . .
      . 8 8 8 8 . 2 2 2 2 . 8 8 8 8 .
      . 8 8 8 8 . 2 2 2 2 . 8 8 8 8 .
      . . . 8 . . . 2 2 . . . 8 . . .
      . . . 8 8 . . . . . . 8 8 . . .
      . . . . 8 8 . 8 8 . 8 8 . . . .
      . . . . . 8 8 8 8 8 8 . . . . .
      . . . . . . . 8 8 . . . . . . .
      . . . . . . . 8 8 . . . . . . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the `image` accessor of a `Sprite`: a framed portrait of a hero in a teal starred helmet, head and shoulders against the sky. */
  //% hidden
  export function imageAccessorIcon(): Image {
    return img`
      f f f f f f f f f f f f f f f f
      f 9 9 9 9 9 9 9 9 9 9 9 9 9 9 f
      f 9 9 9 9 f f f f f f 9 9 9 9 f
      f 9 9 9 f 6 6 5 5 6 9 f 9 9 9 f
      f 9 9 f 6 6 5 5 5 5 6 6 f 9 9 f
      f 9 f 6 6 6 6 5 5 6 6 6 6 f 9 f
      f 9 f 6 f f f f f f f f 6 f 9 f
      f 9 f 6 f d d d d d d f 6 f 9 f
      f 9 f 6 f d f d d f d f 6 f 9 f
      f 9 f 6 f d f d d f d f 6 f 9 f
      f 9 f 6 f 3 d d d d 3 f 6 f 9 f
      f 9 9 f f d f d d f d f f 9 9 f
      f 9 9 9 f f d f f d f f 9 9 9 f
      f 9 9 f 4 4 f 5 5 f 4 4 f 9 9 f
      f 9 f 4 4 4 4 4 4 4 4 4 4 f 9 f
      f f f f f f f f f f f f f f f f
    `;
  }

  /** Icon of the `moveSmoothing` accessor of a `Sprite`: a green curve rising steeply from the lower left and leveling off toward the upper right, a sprite at its end -- a move easing up to full speed. */
  //% hidden
  export function moveSmoothingAccessorIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . 2 2 .
      . . . . . . . . . 7 7 7 7 2 2 .
      . . . . . . . 7 7 7 7 7 7 7 . .
      . . . . . . 7 7 7 . . . . . . .
      . . . . . 7 7 . . . . . . . . .
      . . . . 7 7 . . . . . . . . . .
      . . . . 7 7 . . . . . . . . . .
      . . . 7 7 . . . . . . . . . . .
      . . . 7 7 . . . . . . . . . . .
      . . 7 7 . . . . . . . . . . . .
      . . 7 7 . . . . . . . . . . . .
      . 7 7 . . . . . . . . . . . . .
      . 7 7 . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the `Player` type: the head and shoulders of a person. */
  //% hidden
  export function playerTypeIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . . . . 8 8 8 8 . . . . . .
      . . . . . 8 8 8 8 8 8 . . . . .
      . . . . 8 8 8 8 8 8 8 8 . . . .
      . . . . 8 8 8 8 8 8 8 8 . . . .
      . . . . 8 8 8 8 8 8 8 8 . . . .
      . . . . . 8 8 8 8 8 8 . . . . .
      . . . . . . 8 8 8 8 . . . . . .
      . . . . . . . . . . . . . . . .
      . . . 8 8 8 8 8 8 8 8 8 8 . . .
      . . 8 8 8 8 8 8 8 8 8 8 8 8 . .
      . 8 8 8 8 8 8 8 8 8 8 8 8 8 8 .
      . 8 8 8 8 8 8 8 8 8 8 8 8 8 8 .
      . 8 8 8 8 8 8 8 8 8 8 8 8 8 8 .
      . 8 8 8 8 8 8 8 8 8 8 8 8 8 8 .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the add-score actuator: a green plus one. */
  //% hidden
  export function addScoreIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . 7 7 . . .
      . . . . . . . . . . 7 7 7 . . .
      . . . . . . . . . 7 7 7 7 . . .
      . . . 7 7 . . . . . . 7 7 . . .
      . . . 7 7 . . . . . . 7 7 . . .
      . 7 7 7 7 7 7 . . . . 7 7 . . .
      . 7 7 7 7 7 7 . . . . 7 7 . . .
      . . . 7 7 . . . . . . 7 7 . . .
      . . . 7 7 . . . . . . 7 7 . . .
      . . . . . . . . . . . 7 7 . . .
      . . . . . . . . . 7 7 7 7 7 7 .
      . . . . . . . . . 7 7 7 7 7 7 .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
    `;
  }

  /** Icon of the `score` accessor of a `Player`: a yellow star. */
  //% hidden
  export function scoreAccessorIcon(): Image {
    return img`
      . . . . . . . . . . . . . . . .
      . . . . . . . 5 5 . . . . . . .
      . . . . . . . 5 5 . . . . . . .
      . . . . . . 5 5 5 5 . . . . . .
      . . . . . . 5 5 5 5 . . . . . .
      . 5 5 5 5 5 5 5 5 5 5 5 5 5 5 .
      . . 5 5 5 5 5 5 5 5 5 5 5 5 . .
      . . . 5 5 5 5 5 5 5 5 5 5 . . .
      . . . . 5 5 5 5 5 5 5 5 . . . .
      . . . . 5 5 5 5 5 5 5 5 . . . .
      . . . . 5 5 5 5 5 5 5 5 . . . .
      . . . 5 5 5 5 . . 5 5 5 5 . . .
      . . . 5 5 5 . . . . 5 5 5 . . .
      . . 5 5 5 . . . . . . 5 5 5 . .
      . . 5 5 . . . . . . . . 5 5 . .
      . . . . . . . . . . . . . . . .
    `;
  }
}
