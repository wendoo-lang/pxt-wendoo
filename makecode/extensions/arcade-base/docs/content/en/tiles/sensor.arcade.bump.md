```brain noframe when
{ "tile": "${tileId}" }
```

# Bump

On while your sprite touches another sprite, carrying the sprite it touches.

---

Place **bump** on the **WHEN** side of a rule to act while your sprite touches another one. When it
touches several at once, **bump** carries the nearest. **WHEN bump DO move away from** runs from
whatever it touches.

Give **bump** one of your project's images to notice only sprites that look exactly like it, a sprite
to notice only that sprite, or one of your brains to notice only sprites running it. Add **above** or
**below**, and **left of** or **right of**, to notice only sprites on that side of yours, center to
center. Your own sprite never counts.

## Bumped Sprite

Every time **bump** runs, it puts the sprite it found into `tile:tile.out->struct:<Sprite>.bumped`, for
the rest of the rule and the rules tucked under it to read and change. Open it to see how.

## Example

```brain
{
  "ruleJsons": [
    {
      "version": 1,
      "when": ["tile.sensor->sensor.arcade.bump"],
      "do": [
        "tile.sensor->sensor.arcade.myself",
        "tile.accessor->struct:<Sprite>->image",
        "tile.op->assign",
        "tile.out->struct:<Sprite>.bumped",
        "tile.accessor->struct:<Sprite>->image"
      ],
      "children": [],
      "comment": "Dress this sprite like whatever it bumps."
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

| Parameter   | Type     | Description                            |
| ----------- | -------- | -------------------------------------- |
| (anonymous) | `Image`  | Only sprites that look like this image |
| (anonymous) | `Sprite` | Only this sprite                       |
| (anonymous) | `Brain`  | Only sprites running this brain        |

```assistant
Grammar of bump, as the editor offers it:
- One optional filter, a bare value placed after bump: an Image, a Sprite, or a Brain. At most one.
- above or below: at most one. left of or right of: at most one. Any order with the filter.

What it reads:
- On while this sprite overlaps an admitted sprite; the WHEN result is that Sprite. Touching several:
  the nearest center wins, ties going to the sprite created first. Off while it touches none.
- An Image filter admits the sprites whose image has the same pixels, whichever image object they wear;
  a Sprite admits that sprite alone; a Brain admits the sprites running it. An image the project does
  not hold, a destroyed sprite, or a brain no sprite runs admits none, so bump stays off.
- above, below, left of, right of admit only sprites whose center is strictly on that side of this
  sprite's center; two of them together must both hold.
- This sprite itself is never read.

bump writes what it reads to its bumped sprite output, tile.out->struct:<Sprite>.bumped, whose own page
holds its notes.
```

## See Also

`tile:tile.var.factory->struct:<Sprite>`
`tile:tile.sensor->sensor.arcade.myself`
`tile:tile.sensor->sensor.arcade.in-range`
`tile:tile.actuator->actuator.arcade.move`
