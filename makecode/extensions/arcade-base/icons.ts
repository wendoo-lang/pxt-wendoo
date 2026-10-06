/**
 * The arcade base pack's icons: one 16 by 16 image per tile and per
 * modifier tile its tiles' argument grammars declare, per accessor tile its
 * types declare, per core tile it gives an icon, and per type it gives one,
 * each an img literal the catalog carries through the arcade icon encoder.
 */
namespace wendoo {
  /** Icon of the dpad sensor: a dpad cross. */
  //% hidden
  export const DPAD_ICON = img`
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

  /** Icon of the move actuator: an arrow trailing speed lines. */
  //% hidden
  export const MOVE_ICON = img`
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

  /** Icon of the bump sensor: two blocks touching under a spark. */
  //% hidden
  export const BUMP_ICON = img`
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

  /** Icon of the in-range sensor: a sprite inside the ring around the program's sprite. */
  //% hidden
  export const IN_RANGE_ICON = img`
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

  /** Icon of the out-of-range sensor: a sprite outside the ring around the program's sprite. */
  //% hidden
  export const OUT_OF_RANGE_ICON = img`
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

  /** Icon of the myself sensor: a smiling hero in a teal starred helmet and an orange tunic. */
  //% hidden
  export const MYSELF_ICON = img`
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

  /** Icon of the `up` direction modifier: an arrow pointing up. */
  //% hidden
  export const UP_ICON = img`
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

  /** Icon of the `down` direction modifier: an arrow pointing down. */
  //% hidden
  export const DOWN_ICON = img`
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

  /** Icon of the `left` direction modifier: an arrow pointing left. */
  //% hidden
  export const LEFT_ICON = img`
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

  /** Icon of the `right` direction modifier: an arrow pointing right. */
  //% hidden
  export const RIGHT_ICON = img`
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

  /** Icon of the move's `toward` modifier: an arrow pointing at a sprite. */
  //% hidden
  export const TOWARD_ICON = img`
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

  /** Icon of the move's `away` modifier: an arrow pointing away from a sprite. */
  //% hidden
  export const AWAY_ICON = img`
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

  /** Icon of the move's `wander` modifier: a winding trail climbing to a destination. */
  //% hidden
  export const WANDER_ICON = img`
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

  /** Icon of the move's `slowly` modifier: one chevron. */
  //% hidden
  export const SLOWLY_ICON = img`
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

  /** Icon of the move's `quickly` modifier: two chevrons. */
  //% hidden
  export const QUICKLY_ICON = img`
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

  /** Icon of the positional modifier above: another sprite above the program's sprite, past the line through its center. */
  //% hidden
  export const ABOVE_ICON = img`
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

  /** Icon of the positional modifier below: another sprite below the program's sprite, past the line through its center. */
  //% hidden
  export const BELOW_ICON = img`
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

  /** Icon of the positional modifier left of: another sprite left of the program's sprite, past the line through its center. */
  //% hidden
  export const LEFT_OF_ICON = img`
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

  /** Icon of the positional modifier right of: another sprite right of the program's sprite, past the line through its center. */
  //% hidden
  export const RIGHT_OF_ICON = img`
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

  /** Icon of the core this-page-starts sensor: a play mark on a page. */
  //% hidden
  export const CORE_ON_PAGE_ENTERED_ICON = img`
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

  /** Icon of the core go-to-page actuator: an arrow going into a page. */
  //% hidden
  export const CORE_SWITCH_PAGE_ICON = img`
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

  /** Icon of the core restart-page actuator: a circling arrow on a page. */
  //% hidden
  export const CORE_RESTART_PAGE_ICON = img`
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

  /** Icon of the core current-page sensor: a dot marking a page. */
  //% hidden
  export const CORE_CURRENT_PAGE_ICON = img`
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

  /** Icon of the core previous-page sensor: a back arrow on a page. */
  //% hidden
  export const CORE_PREVIOUS_PAGE_ICON = img`
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

  /** Icon of the core page tiles, one naming each of the program's pages: a plain page. */
  //% hidden
  export const CORE_PAGE_ICON = img`
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

  /** Icon of the core timer sensor: an hourglass. */
  //% hidden
  export const CORE_TIMER_ICON = img`
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

  /** Icon of the core AND operator: two circles, their overlap filled. */
  //% hidden
  export const CORE_AND_ICON = img`
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

  /** Icon of the core OR operator: two overlapping circles, both filled. */
  //% hidden
  export const CORE_OR_ICON = img`
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

  /** Icon of the core NOT operator: a no sign. */
  //% hidden
  export const CORE_NOT_ICON = img`
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

  /** Icon of the core equal-to operator: an equals sign. */
  //% hidden
  export const CORE_EQUAL_ICON = img`
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

  /** Icon of the core not-equal-to operator: a struck-through equals sign. */
  //% hidden
  export const CORE_NOT_EQUAL_ICON = img`
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

  /** Icon of the core less-than operator: a less-than sign. */
  //% hidden
  export const CORE_LESS_ICON = img`
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

  /** Icon of the core less-than-or-equal-to operator: a less-than sign over a bar. */
  //% hidden
  export const CORE_LESS_OR_EQUAL_ICON = img`
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

  /** Icon of the core greater-than operator: a greater-than sign. */
  //% hidden
  export const CORE_GREATER_ICON = img`
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

  /** Icon of the core greater-than-or-equal-to operator: a greater-than sign over a bar. */
  //% hidden
  export const CORE_GREATER_OR_EQUAL_ICON = img`
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

  /** Icon of the core random-number sensor: a die. */
  //% hidden
  export const CORE_RANDOM_ICON = img`
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

  /** Icon of the core true literal: a check mark. */
  //% hidden
  export const CORE_TRUE_ICON = img`
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

  /** Icon of the core false literal: a cross. */
  //% hidden
  export const CORE_FALSE_ICON = img`
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

  /** Icon of the core nil literal: an empty dashed box. */
  //% hidden
  export const CORE_NIL_ICON = img`
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

  /** Icon of the core plus operator: a plus sign. */
  //% hidden
  export const CORE_PLUS_ICON = img`
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

  /** Icon of the core minus operator: a minus sign. */
  //% hidden
  export const CORE_MINUS_ICON = img`
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

  /** Icon of the core multiplied-by operator: a times sign. */
  //% hidden
  export const CORE_MULTIPLY_ICON = img`
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

  /** Icon of the core divided-by operator: a division sign. */
  //% hidden
  export const CORE_DIVIDE_ICON = img`
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

  /** Icon of the core negative operator: a minus sign before a one. */
  //% hidden
  export const CORE_NEGATIVE_ICON = img`
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

  /** Icon of the core gets operator: an arrow going into a box. */
  //% hidden
  export const CORE_ASSIGN_ICON = img`
    . . . . . . . . . . . . . . . .
    . . . . . . . . . . . . . . . .
    . . . . . . . . . . . . . . . .
    . c c c c c c . . . . . . . . .
    . c 1 1 1 1 c . . . . . . . . .
    . c 1 1 1 1 c . . . 8 . . . . .
    . c 1 1 1 1 c . . 8 8 . . . . .
    . c 1 1 1 1 c . 8 8 8 8 8 8 8 8
    . c 1 1 1 1 c . 8 8 8 8 8 8 8 8
    . c 1 1 1 1 c . . 8 8 . . . . .
    . c 1 1 1 1 c . . . 8 . . . . .
    . c 1 1 1 1 c . . . . . . . . .
    . c c c c c c . . . . . . . . .
    . . . . . . . . . . . . . . . .
    . . . . . . . . . . . . . . . .
    . . . . . . . . . . . . . . . .
  `;

  /** Icon of the core open-parenthesis tile: an opening parenthesis. */
  //% hidden
  export const CORE_OPEN_PAREN_ICON = img`
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

  /** Icon of the core close-parenthesis tile: a closing parenthesis. */
  //% hidden
  export const CORE_CLOSE_PAREN_ICON = img`
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

  /** Icon of the core boolean variable factory: a jar holding a switch. */
  //% hidden
  export const CORE_BOOLEAN_VARIABLE_ICON = img`
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

  /** Icon of the core number variable factory: a jar holding a number sign. */
  //% hidden
  export const CORE_NUMBER_VARIABLE_ICON = img`
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

  /** Icon of the core text variable factory: a jar holding quotation marks. */
  //% hidden
  export const CORE_TEXT_VARIABLE_ICON = img`
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

  /** Icon of the core number tile factory: a value box holding a number sign. */
  //% hidden
  export const CORE_NUMBER_TILE_ICON = img`
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

  /** Icon of the core text tile factory: a value box holding quotation marks. */
  //% hidden
  export const CORE_TEXT_TILE_ICON = img`
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

  /** Icon of the `Vector2` type: an arrow from a point. */
  //% hidden
  export const VECTOR2_TYPE_ICON = img`
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

  /** Icon of the `Sprite` type: a game character. */
  //% hidden
  export const SPRITE_TYPE_ICON = img`
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

  /** Icon of the `Brain` type: a brain. */
  //% hidden
  export const BRAIN_TYPE_ICON = img`
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

  /** Icon of the core number type: a number sign. */
  //% hidden
  export const NUMBER_TYPE_ICON = img`
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

  /** Icon of the core text type: quotation marks over lines of text. */
  //% hidden
  export const TEXT_TYPE_ICON = img`
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

  /** Icon of the core switch type: a switch turned on, its knob to the right. */
  //% hidden
  export const SWITCH_TYPE_ICON = img`
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

  /** Icon of the `x` accessor of a `Vector2`: the letter x over a left-right arrow. */
  //% hidden
  export const X_ACCESSOR_ICON = img`
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

  /** Icon of the `y` accessor of a `Vector2`: the letter y beside an up-down arrow. */
  //% hidden
  export const Y_ACCESSOR_ICON = img`
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

  /** Icon of the `position` accessor of a `Sprite`: a sprite's center marked inside crosshairs. */
  //% hidden
  export const POSITION_ACCESSOR_ICON = img`
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

  /** Icon of the `image` accessor of a `Sprite`: a framed portrait of a hero in a teal starred helmet, head and shoulders against the sky. */
  //% hidden
  export const IMAGE_ACCESSOR_ICON = img`
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
