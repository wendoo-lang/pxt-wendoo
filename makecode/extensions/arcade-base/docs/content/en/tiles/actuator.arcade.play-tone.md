```brain noframe do
{ "tile": "${tileId}" }
```

# Play Tone

Plays a tone at a pitch.

---

Place **play tone** on the **DO** side of a rule and give it a pitch in hertz: **DO play tone 440**
plays an A for half a second. Give it a **duration** in seconds, a **volume** from 0 to 1, and **to**
with a second pitch to slide between them: **DO play tone 440 to 880 for 1** swoops up for a second.

Add a wave -- **sine**, **square**, **sawtooth**, **triangle** or **noise** -- to change how the tone
sounds, and **vibrato**, **tremolo** or **warble** to make it shake. The rule waits for the tone to end,
and **in background** and **looping** work as they do on **play sound**.

## Example

```brain
{
  "ruleJsons": [
    {
      "version": 1,
      "when": ["tile.sensor->sensor.arcade.button-a"],
      "do": [
        "tile.actuator->actuator.arcade.play-tone",
        "tile.literal->number:<number>->440",
        "tile.parameter->parameter.to",
        "tile.literal->number:<number>->880",
        "tile.parameter->parameter.duration",
        "tile.literal->number:<number>->1"
      ],
      "children": [],
      "comment": "Swoop up from 440 to 880 hertz over a second while A is held."
    }
  ],
  "catalog": [
    {
      "version": 2,
      "kind": "literal",
      "tileId": "tile.literal->number:<number>->440",
      "valueType": "number:<number>",
      "value": 440,
      "valueLabel": "440",
      "displayFormat": "default"
    },
    {
      "version": 2,
      "kind": "literal",
      "tileId": "tile.literal->number:<number>->880",
      "valueType": "number:<number>",
      "value": 880,
      "valueLabel": "880",
      "displayFormat": "default"
    },
    {
      "version": 2,
      "kind": "literal",
      "tileId": "tile.literal->number:<number>->1",
      "valueType": "number:<number>",
      "value": 1,
      "valueLabel": "1",
      "displayFormat": "default"
    }
  ]
}
```

```assistant
Grammar of play tone, as the editor offers it:
- In any order, each at most once: an optional Number, the pitch in hertz; the optional parameters [to]
  (a Number, the pitch in hertz to slide to), [duration] (a Number of seconds) and [volume] (a Number
  from 0 to 1); one wave modifier -- [sine], [square], [sawtooth], [triangle] or [noise]; one effect
  modifier -- [vibrato], [tremolo] or [warble]; and one of [in background] or [looping]. A wave, an
  effect and a playback modifier go together; two waves, two effects, or [in background] with [looping]
  do not. No Sound value: to play one of Arcade's sounds, use [play sound].
- [duration] is the shared parameter [say] and [destroy] also take; [play sound] takes none.
- Defaults: pitch 440, duration 0.5 seconds, volume 1, no slide, no effect. A pitch or [to] below 0
  reads as 0, which is silent; a duration below 0 reads as 0; a volume reads as 0 below 0 and as 1
  above 1. A number that is no finite number -- an infinity or not-a-number -- reads as its default,
  [to]'s being no slide.

What it does:
- With nothing but a pitch and a duration, it is Arcade's own plain tone, a sine wave. With [to], a
  wave, an effect or a volume below 1, it is Arcade's sound effect instead: it slides in a straight line
  from the pitch to [to]'s, in the wave (sine when none is given), with the effect, at the volume.
  Arcade plays its sound effects quieter than its plain tone.
- A tone lasting 0 seconds plays nothing, and the rule goes on at once.
- Holding, [in background] and [looping] work as they do on [play sound]: with no modifier the rule
  holds until the tone ends, so a rule that stays on plays once per completion; [in background] goes on
  at once and the same tile starts its next copy only after its last one ends; [looping] repeats the
  tone until [stop sounds]. Tones mix with every other sound.
```

## See Also

`tile:tile.parameter->parameter.duration`
`tile:tile.actuator->actuator.arcade.play-sound`
`tile:tile.actuator->actuator.arcade.stop-sounds`
