```brain noframe do
{ "tile": "${tileId}" }
```

# Move

Moves your sprite.

---

Place **move** on the **DO** side of a rule to move your sprite while the rule is on. When no rule
moves it any more, the sprite stops.

Add **up**, **down**, **left** or **right** to pick its direction -- **up** and **right** together move
on the diagonal, as fast as a straight line. Add **toward** or **away from** to chase or flee the
sprite its WHEN carries: **WHEN bump DO move away from** runs from whatever it bumps for as long as
they touch, turning as that sprite moves. Put a sprite after **toward** or **away from** to chase or
flee that sprite instead, like the **sprite in range** a rule above found, or a position to head for
or leave that spot. Add **wander** to stroll from one random spot on the screen to the next.

They all mix with the other directions: **toward** and **up** together chase while drifting upward,
and **toward** with **wander** drifts after a sprite. A move heading for one place -- just **toward**
a sprite or a spot, or just **wander** -- stops right on it instead of going past, and stays put once
it is there.

Without a direction to go, it moves in the direction its WHEN carries -- **WHEN dpad DO move** follows
the dpad -- or rightward when there is none.

Add **slowly** or **quickly** (up to three times) to change its speed, or give it a **speed** in
pixels per second.

| Words on **move**            | Pixels per second         |
| ---------------------------- | ------------------------- |
| **slowly slowly slowly**     | 12.5                      |
| **slowly slowly**            | 25                        |
| **slowly**                   | 50                        |
| no **slowly** or **quickly** | 100                       |
| **quickly**                  | 200                       |
| **quickly quickly**          | 400                       |
| **quickly quickly quickly**  | 500 -- Arcade's top speed |

500 pixels per second is the fastest an Arcade sprite moves. A move asking for more goes at 500 in
the direction it asks.

## Example

```brain
{
  "ruleJsons": [
    {
      "version": 1,
      "when": ["tile.sensor->sensor.arcade.bump"],
      "do": ["tile.actuator->actuator.arcade.move", "tile.modifier->modifier.movement.away"],
      "children": [],
      "comment": "Run from whatever this sprite bumps."
    }
  ],
  "catalog": []
}
```

## Modifiers & Parameters

| Modifier                                       | Description                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| `tile:tile.modifier->modifier.direction.up`    | Move up                                                            |
| `tile:tile.modifier->modifier.direction.down`  | Move down                                                          |
| `tile:tile.modifier->modifier.direction.left`  | Move left                                                          |
| `tile:tile.modifier->modifier.direction.right` | Move right                                                         |
| `tile:tile.modifier->modifier.movement.toward` | Chase the sprite the WHEN carries, or the sprite or spot after it  |
| `tile:tile.modifier->modifier.movement.away`   | Flee the sprite the WHEN carries, or the sprite or spot after it   |
| `tile:tile.modifier->modifier.movement.wander` | Stroll from one random spot on the screen to the next              |
| `tile:tile.modifier->modifier.slowly`          | Half the speed. Add up to three                                    |
| `tile:tile.modifier->modifier.quickly`         | Twice the speed. Add up to three                                   |

| Parameter                              | Type       | Description                                |
| -------------------------------------- | ---------- | ------------------------------------------ |
| `tile:tile.parameter->parameter.speed` | `Number`   | Speed in pixels per second. Default: `100` |
| (anonymous, after toward or away from) | `Sprite`   | The sprite to chase or flee                |
| (anonymous, after toward or away from) | `Position` | The spot to head for or leave              |

```assistant
Grammar of move, as the editor offers it:
- up, down, left, right: each optional, each at most once. Opposite pairs cancel.
- toward, away from, wander: each optional, each at most once.
- One target, offered only once toward or away from is placed: a Sprite (read live every frame) or a
  position (a fixed point). Both toward and away from read that same one target.
- Speed: at most one of slowly (1 to 3 times), quickly (1 to 3 times), or the speed parameter. Each
  slowly halves 100 px/s, each quickly doubles it; the speed parameter is px/s, below 0 reads as 0.
  500 px/s is the cap, also for a speed above it.

How the direction is chosen:
- The placed modifiers' directions add up and are scaled to length 1, so a diagonal is as fast as a
  straight line. toward and away from together cancel.
- With no target placed, toward and away from use the sprite the rule's WHEN produced; they add nothing
  while there is no such sprite, or while it shares this sprite's center.
- Without toward or away from, a position value placed after move is a direction to move in, not a
  spot to reach.
- When nothing is placed, or everything cancels: that direction value, else the direction the WHEN
  produced (the dpad's reading, for one), else rightward.
- One goal alone (just toward, or just wander) lands on the goal instead of passing it, then holds
  still there. Adding any other direction modifier turns that off.
- wander heads for a random on-screen spot and picks a new one on arrival or after 3 seconds; each
  wander tile keeps its own spot.

Across rules: every move a sprite's rules make in one frame is averaged into one velocity. A sprite
stops on the first frame no rule moves it.
```

## See Also

`tile:tile.sensor->sensor.arcade.dpad`
`tile:tile.sensor->sensor.arcade.bump`
`tile:tile.sensor->sensor.arcade.in-range`
`tile:tile.sensor->sensor.arcade.out-of-range`
