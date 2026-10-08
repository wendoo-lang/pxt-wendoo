```brain noframe
{ "tiles": ["tile.sensor->sensor.arcade.myself", "${tileId}"] }
```

# Move Smoothing

How gradually a sprite speeds up.

---

Put **move smoothing** after a sprite to read how gradually it speeds up, in seconds: its own smoothing,
else the game's, and 0 while its moves start at full speed.

**gets** gives the sprite smoothing of its own: **DO myself move smoothing gets 0.15** eases its starts,
and 0 -- or any number below it -- makes it start crisply even while the rest of the game is smoothed.
Writing anything that is not a number changes nothing.

A brain reads and writes seconds; your game's JavaScript gives the same smoothing in milliseconds, as
`wendoo.moveSmoothing = 150` for the whole game or `wendoo.setMoveSmoothing(mySprite, 150)` for one
sprite.

Smoothing belongs to **move**: it eases how **move** speeds the sprite up. Slowing down and stopping
still happen at once, and a speed your game's own code gives the sprite is not smoothed, though a
**move** eases on from it.

## Example

```brain
{
  "ruleJsons": [
    {
      "version": 1,
      "when": ["tile.sensor->on-page-entered"],
      "do": [
        "tile.sensor->sensor.arcade.myself",
        "tile.accessor->struct:<Sprite>->moveSmoothing",
        "tile.op->assign",
        "tile.literal->number:<number>->0.15"
      ],
      "children": [],
      "comment": "Ease this sprite's moves from the start."
    }
  ],
  "catalog": [
    {
      "version": 2,
      "kind": "literal",
      "tileId": "tile.literal->number:<number>->0.15",
      "valueType": "number:<number>",
      "value": 0.15,
      "valueLabel": "0.15",
      "displayFormat": "default"
    }
  ]
}
```

## Provided By

`tile:tile.var.factory->struct:<Sprite>`

## See Also

`tile:tile.actuator->actuator.arcade.move`
`tile:tile.sensor->sensor.arcade.myself`
