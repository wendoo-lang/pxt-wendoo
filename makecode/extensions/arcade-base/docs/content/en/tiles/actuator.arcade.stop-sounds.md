```brain noframe do
{ "tile": "${tileId}" }
```

# Stop Sounds

Stops every sound.

---

Place **stop sounds** on the **DO** side of a rule to silence the game: **WHEN B button DO stop
sounds**. It stops what **play sound** and **play tone** are playing and ends every **looping** sound.

## Example

```brain
{
  "ruleJsons": [
    {
      "version": 1,
      "when": ["tile.sensor->sensor.arcade.button-b"],
      "do": ["tile.actuator->actuator.arcade.stop-sounds"],
      "children": [],
      "comment": "Silence every sound when B is pressed."
    }
  ],
  "catalog": []
}
```

```assistant
Grammar of stop sounds, as the editor offers it:
- It takes nothing: no value, no modifier, no parameter.

What it does:
- It is Arcade's own stop all sounds: every melody and tone playing stops, every [looping] sound from
  [play sound] or [play tone] ends, and so do the sounds and songs the game's own code plays.
- It stops what is playing on the frame its rule fires, nothing started later: a rule that keeps firing
  [play sound] [looping] starts its loop again on its next firing.
- A rule waiting on a sound with no modifier goes on once that sound stops: a melody stops at once, a
  tone at the end of its own time.
```

## See Also

`tile:tile.actuator->actuator.arcade.play-sound`
`tile:tile.actuator->actuator.arcade.play-tone`
