```brain noframe do
{ "tile": "${tileId}" }
```

# Ask

Asks the player a yes-or-no question.

---

Place **ask** on the **DO** side of a rule and give it a question: **WHEN bump DO ask "Eat it?"**. The
player answers with A for yes or B for no. While the question is up, the whole game pauses, and the
rule waits for the answer. Without any text, ask asks what the WHEN found.

## Answer

The answer goes into `tile:tile.out->boolean:<boolean>.answer`, for the rules tucked under the **ask**
to read once it is given: **WHEN answer DO destroy bumped sprite** eats only on a yes.

## Example

```brain
{
  "ruleJsons": [
    {
      "version": 1,
      "when": ["tile.sensor->sensor.arcade.bump"],
      "do": ["tile.actuator->actuator.arcade.ask", "tile.literal->string:<string>->Eat it?"],
      "children": [
        {
          "version": 1,
          "when": ["tile.out->boolean:<boolean>.answer"],
          "do": ["tile.actuator->actuator.arcade.destroy", "tile.out->struct:<Sprite>.bumped"],
          "children": [],
          "comment": "Eat what this sprite bumps, but only on a yes."
        }
      ]
    }
  ],
  "catalog": [
    {
      "version": 2,
      "kind": "literal",
      "tileId": "tile.literal->string:<string>->Eat it?",
      "valueType": "string:<string>",
      "value": "Eat it?",
      "valueLabel": "Eat it?",
      "displayFormat": "default"
    }
  ]
}
```

```assistant
Grammar of ask, as the editor offers it:
- At most one optional text value: the question. Nothing else: no modifier, no Sprite.

What it does:
- It asks the question in Arcade's own yes-or-no dialog: A answers yes, B answers no.
- The rule holds until the question is answered: a rule under it does not get its turn, and the rule
  cannot fire again until then.
- The whole game pauses while the question is up: every brain stops thinking and every sprite stops,
  the way Arcade pauses the game for any dialog. Questions and boxes asked for at once open one after
  another, in the order they were asked for.
- It writes the answer to its answer output, tile.out->boolean:<boolean>.answer, whose own page holds
  its notes.
- The rule goes on once the button that answered the question is let go.
- With no text placed, it asks the rule's WHEN value: a number, a text or a switch, printed as Arcade
  prints them. Any other WHEN value -- a sprite, a position, or nothing -- and empty text ask nothing:
  answer holds nothing, and the rule goes on at once.
```

## See Also

`tile:tile.actuator->actuator.arcade.show-text`
`tile:tile.actuator->actuator.arcade.destroy`
`tile:tile.sensor->sensor.arcade.bump`
