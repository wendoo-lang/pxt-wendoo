```brain noframe when
{ "tile": "${tileId}" }
```

# Dpad

On while the player holds the dpad, carrying the direction it points.

---

Place **dpad** on the **WHEN** side of a rule to act while the player holds the dpad. The rule carries
the direction the dpad points, so **WHEN dpad DO move** steers your sprite with it.

Add **up**, **down**, **left** or **right** to listen to just those directions. **WHEN dpad left right
DO move** slides your sprite from side to side: held up and to the left, the dpad carries just left,
and held straight up, it is off.

On a controller with an analog stick, a stick pushed part of the way carries a shorter direction, and
**move** goes slower along it.

## Example

```brain
{
  "ruleJsons": [
    {
      "version": 1,
      "when": [
        "tile.sensor->sensor.arcade.dpad",
        "tile.modifier->modifier.direction.left",
        "tile.modifier->modifier.direction.right"
      ],
      "do": ["tile.actuator->actuator.arcade.move"],
      "children": [],
      "comment": "Slide from side to side with the dpad."
    }
  ],
  "catalog": []
}
```

## Modifiers & Parameters

| Modifier                                       | Description          |
| ---------------------------------------------- | -------------------- |
| `tile:tile.modifier->modifier.direction.up`    | Listen to up         |
| `tile:tile.modifier->modifier.direction.down`  | Listen to down       |
| `tile:tile.modifier->modifier.direction.left`  | Listen to left       |
| `tile:tile.modifier->modifier.direction.right` | Listen to right      |

## See Also

`tile:tile.actuator->actuator.arcade.move`
`tile:tile.var.factory->struct:<Vector2>`
