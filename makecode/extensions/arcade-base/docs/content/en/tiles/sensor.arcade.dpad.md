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

**dpad** reads player one's dpad. Give it a player to read that player's instead: **WHEN dpad player two
DO move** steers your sprite with player two's controller.

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

```assistant
Grammar of dpad, as the editor offers it:
- up, down, left, right: each optional, each at most once, in any order.
- One optional Player, at most once, anywhere among the modifiers: [player one] .. [player four].
  Nothing else: no other value, no parameter, no output tile. dpad is not inline, so no accessor or
  operator follows it and it fills no value slot; its reading reaches the DO side only as the WHEN
  result.

What it reads: the controller of the Player placed, else player one's, fresh at every run, as a Vector2
(x grows rightward, y downward). A Player placed as anything but a literal tile that reads as nothing
leaves the rule off for that frame.
- A digital dpad reads -1, 0 or 1 on each axis, so a held diagonal reads (1, 1) in size, longer than 1.
  Both buttons of one axis held read 0 on that axis; only opposite buttons held reads off.
- An analog stick reads each axis dead-banded: a deflection up to 0.1 reads 0, the rest rescales from 0
  to 1. A stick pushed part of the way reads a vector shorter than 1.

The modifier mask:
- None placed admits every component. Each placed modifier admits only its own direction's component,
  and every other component reads 0. A kept component keeps its size; nothing is rescaled.
- Opposite modifiers do not cancel on dpad: left and right together admit the whole horizontal axis,
  and all four together are the same as none.
- A reading masked to (0, 0) is off. WHEN dpad up is off while only right is held, and carries (0, -1)
  while up and right are held.

The WHEN result is the masked Vector2, and move consumes it:
- An undirected move -- no direction modifier, or move's own modifiers cancelling, and no direction
  value placed after move -- goes along it, held to length 1: a digital diagonal moves at the speed of a
  straight line, and a shorter analog reading moves slower in proportion.
- move's own cardinals, a toward or away from with a target, or wander replace that direction, and dpad
  only gates the rule: WHEN dpad up DO move left goes left while up is held.
- toward or away from with no target placed add nothing under dpad, its result being no Sprite, so the
  move still follows the dpad.
```

## See Also

`tile:tile.actuator->actuator.arcade.move`
`tile:tile.var.factory->struct:<Vector2>`
`tile:tile.var.factory->struct:<Player>`
