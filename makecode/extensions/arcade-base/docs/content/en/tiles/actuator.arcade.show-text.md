```brain noframe do
{ "tile": "${tileId}" }
```

# Show Text

Shows text in a box on the screen until the player presses A.

---

Place **show text** on the **DO** side of a rule and give it some text: **WHEN A button DO show text
"Welcome!"**. The box opens at the bottom of the screen; add **top**, **center** or **full** to put it
somewhere else. Long text shows a page at a time, and A turns the page.

While the box is up, the whole game pauses, and the rule waits until A closes it. Without any text,
show text shows what the WHEN found: **WHEN player one score DO show text** shows the score.

## Example

```brain
{
  "ruleJsons": [
    {
      "version": 1,
      "when": ["tile.sensor->sensor.arcade.button-a"],
      "do": ["tile.actuator->actuator.arcade.show-text", "tile.literal->string:<string>->Welcome!"],
      "children": [],
      "comment": "Show a welcome when A is pressed."
    }
  ],
  "catalog": [
    {
      "version": 2,
      "kind": "literal",
      "tileId": "tile.literal->string:<string>->Welcome!",
      "valueType": "string:<string>",
      "value": "Welcome!",
      "valueLabel": "Welcome!",
      "displayFormat": "default"
    }
  ]
}
```

```assistant
Grammar of show text, as the editor offers it:
- In either order, each at most once: an optional text value, and one of the modifiers top, center or
  full. Nothing else: no duration, no Sprite, no output tile.

What it does:
- It opens Arcade's own long-text box: at the bottom of the screen bare, or at the top, in the center,
  or over the whole screen. Long text shows a page at a time; A turns the page and closes the box after
  the last page.
- The rule holds until the box is closed: a rule under it does not get its turn, and the rule cannot
  fire again until then.
- The whole game pauses while the box is up: every brain stops thinking and every sprite stops, the way
  Arcade pauses the game for any dialog. Boxes and questions asked for at once open one after another, in
  the order they were asked for.
- With no text placed, it shows the rule's WHEN value: a number, a text or a switch, printed as Arcade
  prints them ([A button] shows true). Any other WHEN value -- a sprite, a position, or nothing -- and
  empty text open no box, and the rule goes on at once.
- The rule goes on once the button that closed the box is let go. The down button turns the page and
  closes the box too, without firing WHEN [A button].
```

## See Also

`tile:tile.actuator->actuator.arcade.ask`
`tile:tile.actuator->actuator.arcade.say`
`tile:tile.sensor->sensor.arcade.button-a`
