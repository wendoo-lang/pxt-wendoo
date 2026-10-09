```brain noframe do
{ "tile": "${tileId}" }
```

# Game Over

Ends the game.

---

Place **game over** on the **DO** side of a rule to end the game the way Arcade does: the game stops,
shows how it ended, and starts again at the next button press. On its own, **game over** ends the game
as a loss. Add **win** to end it as a win, or give it a player to end it with that player winning: **DO
game over player two** says player two won.

Give it an effect and a sound for the ending: **DO game over win hearts power up**. Without them, the
game ends with Arcade's own: confetti and power up for a win, melt and wawawawaa for a loss.

A game ends only once, so the first frame a **game over** rule is on is the one that counts.

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
      "do": [
        "tile.actuator->actuator.arcade.game-over",
        "tile.modifier->modifier.outcome.win",
        "tile.literal->struct:<Effect>->confetti"
      ],
      "children": [],
      "comment": "Win with confetti once player one has scored 10."
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
Grammar of game over, as the editor offers it:
- In any order, each at most once: an optional [win] or [lose] (one of the two at most), an optional
  Player, an optional Effect and an optional Sound. Nothing else: no named parameter, no output tile.
- No [win] and no Player: the game ends as a loss. [lose] says the same thing.
- [win]: the game ends as a win.
- A Player: that player wins, as Arcade's game.gameOverPlayerWin ends a game. [win] or [lose] beside a
  Player changes nothing: [game over] [lose] [player two] still ends with player two winning.
- An Effect and a Sound are shown and played as the game ends with the outcome this tile gives it; a
  Player winning is a win. Without one, that outcome keeps its own: Arcade's confetti and power up for a
  win, melt and wawawawaa for a loss, unless the game's code set others.
- A Player, Effect or Sound placed as anything but a literal tile that reads as nothing leaves the action
  undone for that frame. An Effect or Sound naming nothing Arcade holds is read as none.

What it does:
- It is Arcade's own game over: the game stops, shows the effect, plays the sound, shows the result and
  restarts at the next button press. When the game's code handles game over itself (game.onGameOver),
  that code runs instead and the game goes on.
- Arcade ends a game once and ignores every later game over, so unlike add score it does NOT act again
  on later frames: the first frame its rule fires decides how the game ends. To compose an ending, give
  it a WHEN that fires at the ending moment, such as [player one] [score] [greater than] 9 or [bump]
  with a filter; when two game over rules fire on the same frame, the one running first wins.
```

## See Also

`tile:tile.var.factory->struct:<Player>`
`tile:tile.var.factory->struct:<Effect>`
`tile:tile.var.factory->struct:<Sound>`
`tile:tile.actuator->actuator.arcade.add-score`
