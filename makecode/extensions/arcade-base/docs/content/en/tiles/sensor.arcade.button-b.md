```brain noframe when
{ "tile": "${tileId}" }
```

# B Button

On while the player holds the B button.

---

Place **B button** on the **WHEN** side of a rule to act while the player holds B. **WHEN B button
DO move left** moves your sprite to the left for as long as B is held, and stops it when B is let go.

**B button** reads player one's controller. Give it a player to read that player's instead: **WHEN B
button player two DO move** answers only player two's B button.

## Example

```brain
{
  "ruleJsons": [
    {
      "version": 1,
      "when": ["tile.sensor->sensor.arcade.button-b"],
      "do": ["tile.actuator->actuator.arcade.move", "tile.modifier->modifier.direction.left"],
      "children": [],
      "comment": "Move left while B is held."
    }
  ],
  "catalog": []
}
```

```assistant
Grammar of B button, as the editor offers it:
- One optional Player, at most once: [player one] .. [player four].
  Nothing else: no modifier, no other value, no parameter, no output tile. B button is not inline, so
  no accessor or operator follows it and it fills no value slot.

What it reads: the B button of the controller of the Player placed, else player one's, fresh at every
run. It is on while that button is held and off otherwise; the A button never turns it on. A Player
placed as anything but a literal tile that reads as nothing leaves the rule off for that frame.

The WHEN result is true while it is on, not a Vector2 or a Sprite:
- An undirected move -- no direction modifier, or move's own modifiers cancelling, and no direction
  value placed after move -- goes rightward.
- move's own cardinals, a toward or away from with a target, or wander pick the direction, and B
  button only gates the rule: WHEN B button DO move left goes left while B is held.
- toward or away from with no target placed add nothing, its result being no Sprite.
```

## See Also

`tile:tile.sensor->sensor.arcade.dpad`
`tile:tile.actuator->actuator.arcade.move`
`tile:tile.var.factory->struct:<Player>`
