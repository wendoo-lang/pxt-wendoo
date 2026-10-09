```brain noframe
{ "tiles": ["tile.literal->struct:<Player>->1", "${tileId}"] }
```

# Score

A player's score.

---

Put **score** after a player to read that player's score: **WHEN player one score greater than 9 DO
move** moves your sprite once player one has scored 10. A score is always a whole number.

**add score** changes it.

## Example

```brain
{
  "ruleJsons": [
    {
      "version": 1,
      "when": [
        "tile.literal->struct:<Player>->1",
        "tile.accessor->struct:<Player>->score",
        "tile.op->gt",
        "tile.literal->number:<number>->9"
      ],
      "do": ["tile.actuator->actuator.arcade.move"],
      "children": [],
      "comment": "Move once player one has scored 10."
    }
  ],
  "catalog": [
    {
      "version": 2,
      "kind": "literal",
      "tileId": "tile.literal->number:<number>->9",
      "valueType": "number:<number>",
      "value": 9,
      "valueLabel": "9",
      "displayFormat": "default"
    }
  ]
}
```

```assistant
- [player one] .. [player four] [score] reads that player's score, a whole number, 0 before anything
  changes it. Arcade's own score is player one's: game code's info.setScore and info.changeScoreBy
  change what [player one] [score] reads.
- The editor offers no gets after score: a player tile is a literal, not a variable or a writable
  result, so [player one] [score] [gets] <number> is refused. Change a score with [add score].
- Reading player one's score shows nothing on the screen. Reading or changing the score of player two,
  three or four switches the game to Arcade's display for several players, for the rest of the scene.
```

## Provided By

Every player has a **score**: `tile:tile.var.factory->struct:<Player>`

## See Also

`tile:tile.actuator->actuator.arcade.add-score`
