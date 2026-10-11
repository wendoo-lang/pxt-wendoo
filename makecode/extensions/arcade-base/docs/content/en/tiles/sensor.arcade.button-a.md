```brain noframe when
{ "tile": "${tileId}" }
```

# A Button

On while the player holds the A button.

---

Place **A button** on the **WHEN** side of a rule to act while the player holds A. **WHEN A button
DO move up** moves your sprite up for as long as A is held, and stops it when A is let go.

**A button** reads player one's controller. Give it a player to read that player's instead: **WHEN A
button player two DO move** answers only player two's A button.

## Example

```brain
{
  "ruleJsons": [
    {
      "version": 1,
      "when": ["tile.sensor->sensor.arcade.button-a"],
      "do": ["tile.actuator->actuator.arcade.move", "tile.modifier->modifier.direction.up"],
      "children": [],
      "comment": "Move up while A is held."
    }
  ],
  "catalog": []
}
```

```assistant
Grammar of A button, as the editor offers it:
- One optional Player, at most once: [player one] .. [player four].
  Nothing else: no modifier, no other value, no parameter, no output tile. A button is not inline, so
  no accessor or operator follows it and it fills no value slot.

What it reads: the A button of the controller of the Player placed, else player one's, fresh at every
run. It is on while that button is held and off otherwise; the B button never turns it on. A Player
placed as anything but a literal tile that reads as nothing leaves the rule off for that frame.

The WHEN result is true while it is on, not a Vector2 or a Sprite:
- An undirected move -- no direction modifier, or move's own modifiers cancelling, and no direction
  value placed after move -- goes rightward.
- move's own cardinals, a toward or away from with a target, or wander pick the direction, and A
  button only gates the rule: WHEN A button DO move up goes up while A is held.
- toward or away from with no target placed add nothing, its result being no Sprite.
```

## See Also

`tile:tile.sensor->sensor.arcade.dpad`
`tile:tile.actuator->actuator.arcade.move`
`tile:tile.var.factory->struct:<Player>`
