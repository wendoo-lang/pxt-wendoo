```brain noframe do
{ "tile": "${tileId}" }
```

# Add Score

Adds to a player's score.

---

Place **add score** on the **DO** side of a rule to add 1 to player one's score. Give it a number to add
that much instead -- a negative number takes points away -- and a player to change that player's
score: **DO add score 5 player two** gives player two 5 points.

Like every DO tile, it acts on every frame its rule is on, so **WHEN dpad DO add score** keeps adding
while the dpad is held. **WHEN this page starts DO add score** adds just once.

## Example

```brain
{
  "ruleJsons": [
    {
      "version": 1,
      "when": ["tile.sensor->on-page-entered"],
      "do": [
        "tile.actuator->actuator.arcade.add-score",
        "tile.literal->number:<number>->5",
        "tile.literal->struct:<Player>->2"
      ],
      "children": [],
      "comment": "Give player two 5 points as the page starts."
    }
  ],
  "catalog": [
    {
      "version": 2,
      "kind": "literal",
      "tileId": "tile.literal->number:<number>->5",
      "valueType": "number:<number>",
      "value": 5,
      "valueLabel": "5",
      "displayFormat": "default"
    }
  ]
}
```

```assistant
Grammar of add score, as the editor offers it:
- An optional number and an optional Player, each at most once, in either order. Nothing else: no
  modifier, no named parameter, no output tile.
- No number adds 1. A number adds that much, a negative number subtracting.
- No Player changes player one's score. [player one] .. [player four] change that player's.
- A number or Player placed as anything but a literal tile -- a variable, an accessor, an operator --
  that reads as nothing leaves the action undone for that frame. A number holding no finite value
  changes nothing either.

What it does:
- It runs on every frame its rule fires, adding again each time: a rule that should score once needs a
  WHEN that fires once, such as [this page starts].
- The score is Arcade's own: [player one] is the score game code's info.score() reads. Arcade keeps
  whole numbers, so a fraction is dropped toward zero when the score is stored: adding 2.5 to 0 stores
  2.
- Player one's score appears on the screen at its first change. Changing the score of player two,
  three or four switches the game to Arcade's display for several players, for the rest of the scene.
- [player one] [score] [gets] <number> is refused: a player tile is not a variable. Read a score with
  [player one] [score].
```

## See Also

`tile:tile.var.factory->struct:<Player>`
`tile:tile.accessor->struct:<Player>->score`
