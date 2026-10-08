```brain noframe do
{ "tile": "${tileId}" }
```

# Sprite Out of Range

The sprite **out of range** found.

---

Every time **out of range** runs, it puts the sprite it found into **sprite out of range** -- or
nothing, when it found none. That is the nearest sprite, while it is beyond the range, among the ones
its image, sprite, brain and sides let it watch.

Use it later in the same rule, or in the rules tucked under it. Put **image**, **position**, **brain**
or **move smoothing** after it to read that part of the sprite, and add **gets** to change it. While it
holds nothing, changing a part of it changes nothing.

## Example

```brain
{
  "ruleJsons": [
    {
      "version": 1,
      "when": ["tile.sensor->sensor.arcade.out-of-range"],
      "do": [
        "tile.sensor->sensor.arcade.myself",
        "tile.accessor->struct:<Sprite>->image",
        "tile.op->assign",
        "tile.out->struct:<Sprite>.outOfRange",
        "tile.accessor->struct:<Sprite>->image"
      ],
      "children": [],
      "comment": "Look like the nearest sprite while it is far away."
    }
  ],
  "catalog": []
}
```

```assistant
The sprite out of range output, tile.out->struct:<Sprite>.outOfRange: written every time out of range
runs, the sprite read or nothing; placeable on the DO side of its rule and anywhere in the rules under
it; writable through a part and gets, exactly as bumped sprite is.
```

## Provided By

`tile:tile.sensor->sensor.arcade.out-of-range`

## See Also

`tile:tile.var.factory->struct:<Sprite>`
`tile:tile.out->struct:<Sprite>.inRange`
`tile:tile.out->struct:<Sprite>.bumped`
