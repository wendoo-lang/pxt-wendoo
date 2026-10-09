```brain noframe do
{ "tile": "${tileId}" }
```

# Bumped Sprite

The sprite **bump** found.

---

Every time **bump** runs, it puts the sprite your sprite touches into **bumped sprite** -- or nothing,
when it touches none. When **bump** is given an image, a sprite, a brain or a side to watch for, that
is the sprite it found.

Use **bumped sprite** later in the same rule as the **bump**, or in the rules tucked under it:
**WHEN bump DO myself image gets bumped sprite image** dresses your sprite just like whatever it
bumps. Put **image**, **position**, **brain** or **move smoothing** after it to read that part of the
sprite.

It can change the sprite it holds, too. Put a part after it and add **gets**: **WHEN bump DO bumped
sprite brain gets** another brain switches the sprite yours touches to that brain from the next
frame. While it holds nothing, changing a part of it changes nothing.

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

```assistant
The bumped sprite output, tile.out->struct:<Sprite>.bumped:
- Written every time bump runs: the sprite read, or nothing. Placeable on the DO side of bump's rule and
  anywhere in the rules under it.
- Writable: [bumped sprite] [image | position | brain | move smoothing] [gets] <value> changes that
  sprite, and [bumped sprite] [position] [x | y] [gets] <number> moves it along one axis. Holding
  nothing, a write through it changes nothing.
- On bump's DO side it holds the same sprite as the WHEN result, so move toward or away from with no
  target placed chases or flees it.
```

## Provided By

`tile:tile.sensor->sensor.arcade.bump`

## See Also

`tile:tile.var.factory->struct:<Sprite>`
`tile:tile.sensor->sensor.arcade.myself`
`tile:tile.out->struct:<Sprite>.inRange`
`tile:tile.out->struct:<Sprite>.outOfRange`
