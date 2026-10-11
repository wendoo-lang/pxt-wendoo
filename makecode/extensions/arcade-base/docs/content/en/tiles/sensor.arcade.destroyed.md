```brain noframe when
{ "tile": "${tileId}" }
```

# Destroyed

On once, when your sprite is destroyed.

---

Place **destroyed** on the **WHEN** side of a rule to act when your own sprite is destroyed, whether a
brain or the game's code destroyed it. The rule runs one last time, then the brain stops: **WHEN
destroyed DO game over** ends the game when your sprite is gone.

## Example

```brain
{
  "ruleJsons": [
    {
      "version": 1,
      "when": ["tile.sensor->sensor.arcade.destroyed"],
      "do": ["tile.actuator->actuator.arcade.add-score"],
      "children": [],
      "comment": "Score a point when this sprite is destroyed."
    }
  ],
  "catalog": []
}
```

```assistant
Grammar of destroyed: no arguments. It is not inline, so no accessor or operator follows it and it fills
no value slot.

What it reads: on while this program's own sprite is destroyed -- by [destroy] in any brain, or by the
game's code, such as Arcade's destroy blocks, auto destroy or a lifespan running out. A brain sees its
sprite destroyed in exactly one think, its final think, the first think after the destroy; then the
brain stops. So a rule under destroyed fires once. The WHEN result is true, not a Sprite or a
direction.

The final think:
- Every rule of the brain runs in it, in the usual order, and brain variables keep their values for it.
- What does not need the sprite works: [game over], [add score], [destroy] given another sprite.
- [myself] reads nothing there: accessor chains on it leave their rule off, and a write to a part of
  the sprite changes nothing.
```

## See Also

`tile:tile.actuator->actuator.arcade.destroy`
`tile:tile.actuator->actuator.arcade.game-over`
`tile:tile.var.factory->struct:<Sprite>`
