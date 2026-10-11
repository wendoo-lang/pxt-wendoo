```brain noframe do
{ "tile": "${tileId}" }
```

# Destroy

Removes a sprite from the game.

---

Place **destroy** on the **DO** side of a rule to remove a sprite from the game. The bare tile destroys
your own sprite. Give it a sprite to destroy that one instead: **WHEN bump DO destroy bumped sprite**
eats whatever your sprite bumps.

Give it a particle effect to make the sprite vanish in it, and a **duration** for how many seconds the
effect plays: **DO destroy bumped sprite confetti duration 0.5**. Without an effect, the sprite is gone
at once, whatever the duration.

## Example

```brain
{
  "ruleJsons": [
    {
      "version": 1,
      "when": ["tile.sensor->sensor.arcade.bump"],
      "do": ["tile.actuator->actuator.arcade.destroy", "tile.out->struct:<Sprite>.bumped"],
      "children": [],
      "comment": "Eat whatever this sprite bumps."
    }
  ],
  "catalog": []
}
```

```assistant
Grammar of destroy, as the editor offers it:
- In any order, each at most once: an optional Sprite (the target), an optional ParticleEffect, and the
  optional duration parameter, a Number of seconds. Nothing else: no modifier, no output tile.
- No Sprite: it destroys this program's own sprite; [destroy] [myself] does the same. [destroy]
  [bumped sprite] destroys the sprite bump found -- the "eat" rule.
- A ParticleEffect: the sprite vanishes in that effect over duration seconds, or over the effect's own
  length when no duration, or a duration of 0, is given. A duration below 0 reads as 0.
- duration without a ParticleEffect changes nothing: the sprite is gone at once.
- A Sprite or ParticleEffect placed as anything but a literal tile that reads as nothing leaves the action
  undone for that frame. A ParticleEffect naming nothing Arcade holds is read as none.
- A target already destroyed stays as it is: destroying it again does nothing.

What it does:
- It is Arcade's own destroy. The sprite counts as destroyed at once, even while its effect plays: every
  value standing for it reads as nothing, a sprite variable holding it reads nothing, and bump, in range
  and out of range never read it again. The brain it runs, if any, gets one final think, where
  [destroyed] is on, then stops.
- It acts on every frame its rule fires, on the sprite it is given then.
- Destroying this program's own sprite: put destroy last in the rule. The rest of the think still runs,
  against a sprite already gone -- [myself] reads nothing and writes through it change nothing -- and the
  brain stops after its final think.
```

## See Also

`tile:tile.sensor->sensor.arcade.destroyed`
`tile:tile.var.factory->struct:<ParticleEffect>`
`tile:tile.var.factory->struct:<Sprite>`
`tile:tile.sensor->sensor.arcade.bump`
