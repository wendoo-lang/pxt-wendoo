```brain noframe
{ "tiles": ["tile.sensor->sensor.arcade.myself", "${tileId}"] }
```

# Brain

The brain a sprite runs.

---

Put **brain** after a sprite to read the brain it runs, or nothing while it runs none --
`concept:nothing` has the details.

**gets** switches the sprite to another brain from the next frame. Switching it to the brain it already
runs changes nothing; the brain does not start over. **WHEN bump DO bumped sprite brain gets myself
brain** spreads your sprite's brain to whatever it touches.

To stop a sprite's brain, make a brain with no rules and switch the sprite to that one: a brain with no
rules does nothing.

## Example

```brain
{
  "ruleJsons": [
    {
      "version": 1,
      "when": ["tile.sensor->sensor.arcade.bump"],
      "do": [
        "tile.out->struct:<Sprite>.bumped",
        "tile.accessor->struct:<Sprite>->brain",
        "tile.op->assign",
        "tile.sensor->sensor.arcade.myself",
        "tile.accessor->struct:<Sprite>->brain"
      ],
      "children": [],
      "comment": "Spread this brain to whatever this sprite bumps."
    }
  ],
  "catalog": []
}
```

```assistant
- Reading brain gives a Brain value naming the brain the sprite runs now, or nothing while it runs none.
  A brain asked for by a write is not read until it has started, on the next frame.
- A brain write is a request applied at the start of the next frame, ending the brain the sprite ran.
  Writing the brain it already runs does nothing: no restart. Writing a brain the project does not
  hold does nothing.
- The editor never offers nothing as the value a gets writes, so a brain cannot be stopped by writing
  nothing. To stop one, write a brain with no rules.
- Two Brain values are equal to each other when they name the same brain. A Brain value is also the
  filter of bump, in range and out of range, admitting the sprites running it.
- Other sprites' brains are written through the output tiles, as [bumped sprite] [brain] [gets] <brain>.
```

## Provided By

`tile:tile.var.factory->struct:<Sprite>`

## See Also

`tile:tile.sensor->sensor.arcade.myself`
`tile:tile.out->struct:<Sprite>.bumped`
`tile:tile.sensor->sensor.arcade.bump`
