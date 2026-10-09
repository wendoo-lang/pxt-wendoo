```brain noframe
{ "tiles": ["tile.sensor->sensor.arcade.myself", "tile.accessor->struct:<Sprite>->position", "${tileId}"] }
```

# X

How far across a position is.

---

Put **x** after a position to read the first of its two numbers, in pixels. **x** grows to the right:
a sprite farther right on the screen has a bigger **x**.

Add **gets** to change just that number. **DO myself position x gets 80** moves your sprite across to
80, keeping its height, and with a position variable named **home**, **DO home x gets 80** changes the
spot **home** remembers. A new position variable starts at **origin**, so you can change its **x**
right away.

Tucked under **WHEN in range**, the rule **WHEN sprite in range position x greater than myself position
x DO move right** follows that sprite to the right while it is farther right than yours.

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
            "tile.accessor->struct:<Vector2>->x",
            "tile.op->gt",
            "tile.sensor->sensor.arcade.myself",
            "tile.accessor->struct:<Sprite>->position",
            "tile.accessor->struct:<Vector2>->x"
          ],
          "do": ["tile.actuator->actuator.arcade.move", "tile.modifier->modifier.direction.right"],
          "children": [],
          "comment": "Head right while the nearby sprite is farther right."
        }
      ]
    }
  ],
  "catalog": []
}
```

## Provided By

Every position has an **x**: `tile:tile.var.factory->struct:<Vector2>`

## See Also

`tile:tile.accessor->struct:<Vector2>->y`
`tile:tile.accessor->struct:<Sprite>->position`
