```brain noframe
{ "tiles": ["tile.sensor->sensor.arcade.myself", "tile.accessor->struct:<Sprite>->position", "${tileId}"] }
```

# Y

How far down a position is.

---

Put **y** after a position to read the second of its two numbers, in pixels. **y** grows downward, the
same way **down** points on **move**: a sprite higher up the screen has a smaller **y**. A brain reads
**y** but cannot change it.

Tucked under **WHEN in range**, the rule **WHEN sprite in range position y less than myself position y
DO move up** climbs while that sprite is higher up the screen than yours.

## Example

```brain
{
  "ruleJsons": [
    {
      "version": 1,
      "when": ["tile.sensor->sensor.arcade.in-range"],
      "do": [],
      "children": [
        {
          "version": 1,
          "when": [
            "tile.out->struct:<Sprite>.inRange",
            "tile.accessor->struct:<Sprite>->position",
            "tile.accessor->struct:<Vector2>->y",
            "tile.op->lt",
            "tile.sensor->sensor.arcade.myself",
            "tile.accessor->struct:<Sprite>->position",
            "tile.accessor->struct:<Vector2>->y"
          ],
          "do": ["tile.actuator->actuator.arcade.move", "tile.modifier->modifier.direction.up"],
          "children": [],
          "comment": "Climb while the nearby sprite is higher up the screen."
        }
      ]
    }
  ],
  "catalog": []
}
```

## Provided By

Every position has a **y**: `tile:tile.var.factory->struct:<Vector2>`

## See Also

`tile:tile.accessor->struct:<Vector2>->x`
`tile:tile.accessor->struct:<Sprite>->position`
