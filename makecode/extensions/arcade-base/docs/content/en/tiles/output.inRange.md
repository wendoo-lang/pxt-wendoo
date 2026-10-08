```brain noframe do
{ "tile": "${tileId}" }
```

# Sprite In Range

The sprite **in range** found.

---

Every time **in range** runs, it puts the sprite it found into **sprite in range** -- or nothing, when
it found none. That is the nearest sprite within the range, among the ones its image, sprite, brain
and sides let it watch.

Use it later in the same rule, or in the rules tucked under it. Put **image**, **position**, **brain**
or **move smoothing** after it to read that part of the sprite, and add **gets** to change it: **WHEN
in range DO sprite in range image gets myself image** dresses whatever comes near like your sprite.
While it holds nothing, changing a part of it changes nothing.

## Example

```brain
{
  "ruleJsons": [
    {
      "version": 1,
      "when": ["tile.sensor->sensor.arcade.in-range"],
      "do": [
        "tile.out->struct:<Sprite>.inRange",
        "tile.accessor->struct:<Sprite>->image",
        "tile.op->assign",
        "tile.sensor->sensor.arcade.myself",
        "tile.accessor->struct:<Sprite>->image"
      ],
      "children": [],
      "comment": "Dress whatever comes near like this sprite."
    }
  ],
  "catalog": []
}
```

```assistant
The sprite in range output, tile.out->struct:<Sprite>.inRange:
- Written every time in range runs: the sprite read, or nothing. Placeable on the DO side of its rule
  and anywhere in the rules under it.
- Writable through a part and gets, exactly as bumped sprite is.
- On its rule's DO side it holds the same sprite as the WHEN result, so move toward or away from with no
  target placed chases or flees it.
```

## Provided By

`tile:tile.sensor->sensor.arcade.in-range`

## See Also

`tile:tile.var.factory->struct:<Sprite>`
`tile:tile.out->struct:<Sprite>.outOfRange`
`tile:tile.out->struct:<Sprite>.bumped`
