```brain noframe
{
  "tiles": [
    "tile.literal->struct:<Player>->1",
    "tile.literal->struct:<Player>->2",
    "tile.literal->struct:<Player>->3",
    "tile.literal->struct:<Player>->4"
  ]
}
```

# Player

One of the four players in your game.

---

**player one**, **player two**, **player three** and **player four** are the players of an Arcade game,
each with a controller of its own. Give one to **dpad**, **A button** or **B button** to read that
player's controller, or to **add score** to change that player's score. Without one, each uses player
one.

A **player** variable holds one, and your game can put a player into it with **set brain player**.

## Score

`tile:tile.accessor->struct:<Player>->score` is a player's score. Put it after a player to read it, and
use **add score** to change it.

Player one's score shows on the screen once it changes. Once a rule reads or changes the score of
player two, three or four, the game shows scores the way Arcade does for several players: each in a
corner of its own.

## See Also

`tile:tile.actuator->actuator.arcade.add-score`
`tile:tile.sensor->sensor.arcade.dpad`
