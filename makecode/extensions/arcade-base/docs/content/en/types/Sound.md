```brain noframe
{
  "tiles": [
    "tile.literal->struct:<Sound>->baDing",
    "tile.literal->struct:<Sound>->wawawawaa",
    "tile.literal->struct:<Sound>->jumpUp",
    "tile.literal->struct:<Sound>->jumpDown",
    "tile.literal->struct:<Sound>->powerUp",
    "tile.literal->struct:<Sound>->powerDown",
    "tile.literal->struct:<Sound>->magicWand",
    "tile.literal->struct:<Sound>->siren",
    "tile.literal->struct:<Sound>->pewPew",
    "tile.literal->struct:<Sound>->knock",
    "tile.literal->struct:<Sound>->footstep",
    "tile.literal->struct:<Sound>->thump",
    "tile.literal->struct:<Sound>->smallCrash",
    "tile.literal->struct:<Sound>->bigCrash",
    "tile.literal->struct:<Sound>->zapped",
    "tile.literal->struct:<Sound>->buzzer",
    "tile.literal->struct:<Sound>->sonar",
    "tile.literal->struct:<Sound>->spooky",
    "tile.literal->struct:<Sound>->beamUp"
  ]
}
```

# Sound

One of Arcade's own sounds.

---

Each of these is one of Arcade's own sounds. Give one to **play sound** to play it: **WHEN bump DO play
sound ba ding**. Give one to **game over** to play it as the game ends: **DO game over win power up**
plays power up for a win.

## See Also

`tile:tile.actuator->actuator.arcade.play-sound`
`tile:tile.actuator->actuator.arcade.game-over`
`tile:tile.var.factory->struct:<Effect>`
