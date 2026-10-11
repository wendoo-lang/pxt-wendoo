```brain noframe do
{ "tile": "${tileId}" }
```

# Say

Shows text in a speech bubble over your sprite.

---

Place **say** on the **DO** side of a rule and give it some text to show in your sprite's speech
bubble: **WHEN bump DO say "ouch"**. Give it a **duration** to pick how many seconds the bubble stays
after the rule stops: **DO say "hi" duration 2**. Without one, it stays 5 seconds.

While the rule keeps firing, the bubble stays up. Without any text, say shows what the WHEN found:
**WHEN player one score DO say** shows the score.

## Example

```brain
{
  "ruleJsons": [
    {
      "version": 1,
      "when": ["tile.sensor->sensor.arcade.bump"],
      "do": ["tile.actuator->actuator.arcade.say", "tile.literal->string:<string>->ouch"],
      "children": [],
      "comment": "Say ouch while touching another sprite, and for 5 seconds after."
    }
  ],
  "catalog": [
    {
      "version": 2,
      "kind": "literal",
      "tileId": "tile.literal->string:<string>->ouch",
      "valueType": "string:<string>",
      "value": "ouch",
      "valueLabel": "ouch",
      "displayFormat": "default"
    }
  ]
}
```

```assistant
Grammar of say, as the editor offers it:
- In either order, each at most once: an optional text value and the optional duration parameter, a
  Number of seconds. Nothing else: no modifier, no Sprite, no output tile.
- It always speaks through this program's own sprite; it cannot make another sprite talk.

What it does:
- It shows the text in the sprite's speech bubble, the way Arcade's own say does.
- A rule that keeps firing with the same text keeps the bubble up without restarting it. A different
  text replaces the bubble at once.
- The bubble clears duration seconds after the last frame that said its text: 5 seconds with no
  duration. A duration below 0 reads as 0, which keeps the bubble only while the rule fires.
- Empty text clears the bubble at once.
- With no text placed, it says the rule's WHEN value: a number, a text or a switch, printed as Arcade
  prints them ([A button] says true). Any other WHEN value -- a sprite, a position, or nothing, as in a
  rule with no WHEN -- says nothing.
- Once its own sprite is destroyed, say does nothing; a bubble already up goes when Arcade removes the
  sprite.
```

## See Also

`tile:tile.lit.factory->string`
`tile:tile.var.factory->string`
`tile:tile.sensor->sensor.arcade.bump`
`tile:tile.actuator->actuator.arcade.destroy`
