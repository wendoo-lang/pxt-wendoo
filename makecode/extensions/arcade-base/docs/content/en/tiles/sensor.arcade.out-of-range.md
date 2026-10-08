```brain noframe when
{ "tile": "${tileId}" }
```

# Out of Range

On while the sprite nearest yours is far away, carrying that sprite.

---

Place **out of range** on the **WHEN** side of a rule to act while no other sprite is near yours. It
watches the sprite nearest yours, center to center, and is on while that sprite is farther than 60
pixels. Give it a number to pick the range: **out of range 40** means farther than 40 pixels.

**in range** is its partner. Given the same range, image, sprite or brain, and sides, exactly one of
the two is on whenever there is another sprite to watch, and neither is on while there is none.
**WHEN out of range DO move toward** keeps a companion close.

The image, sprite or brain it is given, and **above**, **below**, **left of** and **right of**, pick
which sprites it watches, just as on **in range**. Your own sprite never counts.

## Sprite Out of Range

Every time **out of range** runs, it puts the sprite it found into
`tile:tile.out->struct:<Sprite>.outOfRange`, for the rest of the rule and the rules tucked under it to
read and change. Open it to see how.

## Example

```brain
{
  "ruleJsons": [
    {
      "version": 1,
      "when": ["tile.sensor->sensor.arcade.out-of-range", "tile.literal->number:<number>->20"],
      "do": ["tile.actuator->actuator.arcade.move", "tile.modifier->modifier.movement.toward"],
      "children": [],
      "comment": "Follow the nearest sprite, stopping once it is 20 pixels away."
    }
  ],
  "catalog": [
    {
      "version": 2,
      "kind": "literal",
      "tileId": "tile.literal->number:<number>->20",
      "valueType": "number:<number>",
      "value": 20,
      "valueLabel": "20",
      "displayFormat": "default"
    }
  ]
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
Grammar of out of range: the same as in range -- each optional, in any order after the tile: one
filter (an Image, a Sprite, or a Brain), one Number range in pixels (default 60; below 0 reads as 0),
above or below (at most one), left of or right of (at most one).

What it reads:
- The admitted sprite nearest this sprite, center to center, ties going to the sprite created first.
  On while that sprite's center is beyond the range; the WHEN result is that Sprite. Off while it is
  within the range, the boundary included, or no admitted sprite exists.
- Being on means every admitted sprite is beyond the range, since the nearest one is.

Pairing with in range: given the same range, filter and side modifiers, exactly one of the pair is on
whenever an admitted sprite exists, neither while none does. Different ranges leave a resting band
between them; see in range's notes for the band and the speed / 10 smallest-range rule.

out of range writes what it reads to its sprite out of range output,
tile.out->struct:<Sprite>.outOfRange, whose own page holds its notes.
```

## See Also

`tile:tile.sensor->sensor.arcade.in-range`
`tile:tile.sensor->sensor.arcade.bump`
`tile:tile.var.factory->struct:<Sprite>`
`tile:tile.actuator->actuator.arcade.move`
