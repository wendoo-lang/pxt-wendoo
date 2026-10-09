```brain noframe
{
  "tiles": [
    "tile.literal->struct:<Effect>->confetti",
    "tile.literal->struct:<Effect>->hearts",
    "tile.literal->struct:<Effect>->smiles",
    "tile.literal->struct:<Effect>->blizzard",
    "tile.literal->struct:<Effect>->bubbles",
    "tile.literal->struct:<Effect>->starField",
    "tile.literal->struct:<Effect>->clouds",
    "tile.literal->struct:<Effect>->none",
    "tile.literal->struct:<Effect>->dissolve",
    "tile.literal->struct:<Effect>->melt",
    "tile.literal->struct:<Effect>->slash",
    "tile.literal->struct:<Effect>->splatter"
  ]
}
```

# Effect

A screen effect for the end of your game.

---

Each of these is one of Arcade's own screen effects. Give one to **game over** to show it as the game
ends: **DO game over win hearts** fills the screen with hearts for a win. **none** shows no effect at
all.

## See Also

`tile:tile.actuator->actuator.arcade.game-over`
`tile:tile.var.factory->struct:<Sound>`
