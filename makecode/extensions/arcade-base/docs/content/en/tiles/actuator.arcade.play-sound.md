```brain noframe do
{ "tile": "${tileId}" }
```

# Play Sound

Plays one of Arcade's sounds.

---

Place **play sound** on the **DO** side of a rule and give it a sound: **WHEN bump DO play sound ba
ding**. On its own it plays ba ding. The rule waits for the sound to end, so a rule that stays on plays
its sound again each time it finishes.

Add **in background** to let the rule go on while the sound plays, or **looping** to play the sound over
and over until a rule says **stop sounds**. Sounds from different rules and sprites play at the same
time.

## Example

```brain
{
  "ruleJsons": [
    {
      "version": 1,
      "when": ["tile.sensor->sensor.arcade.bump"],
      "do": ["tile.actuator->actuator.arcade.play-sound", "tile.literal->struct:<Sound>->baDing"],
      "children": [],
      "comment": "Ding when the sprite bumps something."
    }
  ],
  "catalog": []
}
```

```assistant
Grammar of play sound, as the editor offers it:
- In either order, each at most once: an optional Sound value, and one of the modifiers [in background]
  or [looping]. Nothing else: no duration, no volume, no Number, no output tile. To play a pitch, use
  [play tone].
- A Sound placed as anything but a literal tile that reads as nothing -- a Sound variable never set --
  leaves the action undone for that frame. A Sound naming nothing Arcade holds plays nothing.

What it does:
- Bare, it plays ba ding. Sounds mix: plays from other rules, other sprites and other brains sound at
  the same time, up to the five melodies Arcade plays at once.
- With no modifier, the rule holds until the sound ends: a rule under it does not get its turn, and the
  rule cannot fire again until then, so a rule that stays on plays its sound once per completion, never
  once per frame. Other rules and brains keep running meanwhile.
- [in background]: the rule goes on at once. While the copy this same tile last started is still
  playing, the tile starts nothing, so a rule that stays on starts the next copy only after the last
  one ends. Each placed tile keeps its own copy, and so does each sprite running the brain.
- [looping]: the rule goes on at once, and the sound plays over and over until [stop sounds]. While its
  loop runs, the same tile starts nothing more, so a rule that stays on keeps one loop; after [stop
  sounds], its next firing starts the loop again.
- A sound keeps playing after the brain or sprite that started it is gone, and a loop keeps playing
  through Arcade's game-over screen, until [stop sounds] or the game restarts.
```

## See Also

`tile:tile.var.factory->struct:<Sound>`
`tile:tile.actuator->actuator.arcade.play-tone`
`tile:tile.actuator->actuator.arcade.stop-sounds`
