```brain noframe do
{ "tile": "${tileId}" }
```

# Answer

The answer the player gave to **ask**.

---

Once the player answers an **ask**, **answer** holds yes -- true -- for A, or no -- false -- for B. Read
it in the rules tucked under the **ask**, which run only after the answer is given: **WHEN answer DO
destroy bumped sprite** eats on a yes, and **WHEN not answer** acts on a no.

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
The answer output, tile.out->boolean:<boolean>.answer:
- A switch: true when the player answered with A, false with B. Written once the question is answered
  and the button that answered it is let go, before the rules under the ask run. Placeable in the rules
  under ask's rule.
- An ask that asks nothing -- empty text, or a WHEN value that is no number, text or switch -- clears
  it: answer then holds nothing, and WHEN [answer] does not fire.
- Before the first answer, it holds nothing.
```

## Provided By

`tile:tile.actuator->actuator.arcade.ask`

## See Also

`tile:tile.op->not`
