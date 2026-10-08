```brain noframe when
{ "tile": "${tileId}" }
```

# Myself

Your own sprite.

---

**myself** is your sprite, as a tile you can put anywhere a sprite goes. Put **image**, **position**,
**brain** or **move smoothing** after it to read that part of your sprite, and add **gets** to change
it: **DO myself image gets** one of your project's images changes its picture, and **DO myself position
gets bumped sprite position** jumps it onto what it bumps.

It works on the **WHEN** side too. **WHEN in range myself brain DO move toward** gathers the sprites
running the same brain as yours into a flock, without naming the brain.

## Example

```brain
{
  "ruleJsons": [
    {
      "version": 1,
      "when": [
        "tile.sensor->sensor.arcade.in-range",
        "tile.sensor->sensor.arcade.myself",
        "tile.accessor->struct:<Sprite>->brain"
      ],
      "do": ["tile.actuator->actuator.arcade.move", "tile.modifier->modifier.movement.toward"],
      "children": [],
      "comment": "Flock together with every sprite running this brain."
    }
  ],
  "catalog": []
}
```

## See Also

`tile:tile.var.factory->struct:<Sprite>`
`tile:tile.sensor->sensor.arcade.bump`
`tile:tile.sensor->sensor.arcade.in-range`
