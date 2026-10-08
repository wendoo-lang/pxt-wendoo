```brain noframe
{ "tiles": ["tile.sensor->sensor.arcade.myself", "${tileId}"] }
```

# Position

Where a sprite's center is.

---

Put **position** after a sprite to read where its center is, as a position. Each read is a snapshot of
that moment: kept in a **position** variable, it stays put after the sprite moves on.

**gets** puts the sprite's center there at once, and a **move** that is running carries on from the new
spot: **WHEN bump DO myself position gets bumped sprite position** jumps your sprite onto whatever it
bumps.

## Example

```brain
{
  "ruleJsons": [
    {
      "version": 1,
      "when": ["tile.sensor->sensor.arcade.bump"],
      "do": [
        "tile.sensor->sensor.arcade.myself",
        "tile.accessor->struct:<Sprite>->position",
        "tile.op->assign",
        "tile.out->struct:<Sprite>.bumped",
        "tile.accessor->struct:<Sprite>->position"
      ],
      "children": [],
      "comment": "Jump onto whatever this sprite bumps."
    }
  ],
  "catalog": []
}
```

## Provided By

`tile:tile.var.factory->struct:<Sprite>`

## See Also

`tile:tile.var.factory->struct:<Vector2>`
`tile:tile.accessor->struct:<Vector2>->x`
`tile:tile.accessor->struct:<Vector2>->y`
`tile:tile.actuator->actuator.arcade.move`
