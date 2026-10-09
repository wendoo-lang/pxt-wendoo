```brain noframe
{ "tiles": ["tile.sensor->sensor.arcade.myself", "tile.accessor->struct:<Sprite>->position", "${tileId}"] }
```

# Y

How far down a position is.

---

Put **y** after a position to read the second of its two numbers, in pixels. **y** grows downward, the
same way **down** points on **move**: a sprite higher up the screen has a smaller **y**.

Add **gets** to change just that number. **DO myself position y gets 20** moves your sprite up or down
to 20 from the top of the screen, keeping how far across it is, and with a position variable named
**home**, **DO home y gets 20** changes the spot **home** remembers. A new position variable starts at
**origin**, so you can change its **y** right away.

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
