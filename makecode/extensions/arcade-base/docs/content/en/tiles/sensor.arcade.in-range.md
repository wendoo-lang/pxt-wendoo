```brain noframe when
{ "tile": "${tileId}" }
```

# In Range

On while the sprite nearest yours is close, carrying that sprite.

---

Place **in range** on the **WHEN** side of a rule to act while another sprite is near yours. It watches
the sprite nearest yours, center to center, and is on while that sprite is within 60 pixels. Give it a
number to pick the range: **in range 40** means within 40 pixels.

**out of range** is its partner. Given the same range, image, sprite or brain, and sides, exactly one
of the two is on whenever there is another sprite to watch, and neither is on while there is none.
**WHEN out of range DO move toward** keeps a companion close, and adding **WHEN in range DO move away
from** makes it hold its distance.

Like **bump**, it can be given an image, a sprite or a brain, to watch only the nearest sprite that
looks like that image, only that sprite, or the nearest sprite running that brain. Add **above** or
**below**, and **left of** or **right of**, to watch only sprites on that side of yours. Your own sprite
never counts.

**in range** looks once a frame, so a fast sprite can jump right across a small range. Keep each range
at least a tenth of the speed of the fastest move in the brain: 10 pixels at the normal speed of 100,
50 at the top speed of 500.

## Sprite In Range

Every time **in range** runs, it puts the sprite it found into `tile:tile.out->struct:<Sprite>.inRange`,
for the rest of the rule and the rules tucked under it to read and change. Open it to see how.

## Example

```brain
{
  "ruleJsons": [
    {
      "version": 1,
      "when": ["tile.sensor->sensor.arcade.out-of-range"],
      "do": ["tile.actuator->actuator.arcade.move", "tile.modifier->modifier.movement.toward"],
      "children": [],
      "comment": "Come closer while the nearest sprite is far away."
    },
    {
      "version": 1,
      "when": ["tile.sensor->sensor.arcade.in-range"],
      "do": ["tile.actuator->actuator.arcade.move", "tile.modifier->modifier.movement.away"],
      "children": [],
      "comment": "Back off while it is close, so this sprite holds its distance."
    }
  ],
  "catalog": []
}
```

## Modifiers & Parameters

| Modifier                                       | Description                          |
| ---------------------------------------------- | ------------------------------------ |
| `tile:tile.modifier->modifier.position.above`  | Only sprites above yours             |
| `tile:tile.modifier->modifier.position.below`  | Only sprites below yours             |
| `tile:tile.modifier->modifier.position.left`   | Only sprites to the left of yours    |
| `tile:tile.modifier->modifier.position.right`  | Only sprites to the right of yours   |

| Parameter   | Type     | Description                                    |
| ----------- | -------- | ---------------------------------------------- |
| (anonymous) | `Number` | Range in pixels between centers. Default: `60` |
| (anonymous) | `Image`  | Only sprites that look like this image         |
| (anonymous) | `Sprite` | Only this sprite                               |
| (anonymous) | `Brain`  | Only sprites running this brain                |

```assistant
Grammar of in range, as the editor offers it -- each optional, in any order after the tile:
- One filter, a bare value: an Image, a Sprite, or a Brain. At most one.
- One Number, the range in pixels between centers. Default 60; below 0 reads as 0.
- above or below: at most one. left of or right of: at most one.

What it reads:
- The admitted sprite nearest this sprite, center to center, ties going to the sprite created first.
  On while that sprite's center is within the range, the boundary included; the WHEN result is that
  Sprite. Off while it is beyond the range, or no admitted sprite exists.
- The filter and side modifiers admit sprites exactly as on bump, so they pick which sprite counts as
  nearest. This sprite itself is never read.

Pairing with out of range:
- Given the same range, filter and side modifiers, the two read the same nearest sprite, and exactly one
  is on whenever an admitted sprite exists; neither is on while none does.
- Different ranges leave a band: out of range 20 with in range 15 has neither on between 15 and 20, a
  resting band for a follower that moves toward on out of range and away from on in range.
- Both look once a frame. Keep the smallest range at least speed / 10 pixels (three jumps of a slow
  frame): 10 for 100 px/s, 20 for 200, 40 for 400, 50 for 500. Below that a pair can flicker.

in range writes what it reads to its sprite in range output, tile.out->struct:<Sprite>.inRange, whose
own page holds its notes.
```

## See Also

`tile:tile.sensor->sensor.arcade.out-of-range`
`tile:tile.sensor->sensor.arcade.bump`
`tile:tile.var.factory->struct:<Sprite>`
`tile:tile.actuator->actuator.arcade.move`
