```brain noframe when
{ "tile": "${tileId}" }
```

# Myself

Your own sprite.

---

**myself** is your sprite, as a tile you can put anywhere a sprite goes. Put **image**, **position**,
**brain** or **move smoothing** after it to read that part of your sprite, and add **gets** to change
it: **DO myself image gets** one of your project's images changes its picture, and **DO myself position
gets bumped sprite position** jumps it onto what it bumps.

It works on the **WHEN** side too. **WHEN in range myself brain DO move toward** gathers the sprites
running the same brain as yours into a flock, without naming the brain.

## Example

```brain
{
  "ruleJsons": [
    {
      "version": 1,
      "when": [
        "tile.sensor->sensor.arcade.in-range",
        "tile.sensor->sensor.arcade.myself",
        "tile.accessor->struct:<Sprite>->brain"
      ],
      "do": ["tile.actuator->actuator.arcade.move", "tile.modifier->modifier.movement.toward"],
      "children": [],
      "comment": "Flock together with every sprite running this brain."
    }
  ],
  "catalog": []
}
```

```assistant
Grammar of myself: no arguments. It is inline and placeable on either side of a rule: a Sprite value
that accessors and operators may follow, filling any slot that value, or the value an accessor after it
reads, fits -- a sensor's filter, move's target, an operand, a parenthesized group. Its value is the
program's own sprite.

Writing through it:
- Its result is writable: [myself] [image | position | brain | move smoothing] [gets] <value> changes
  the program's own sprite. Each accessor's own page holds when and how the write lands.
- [myself] [gets] is never a write, since only a variable or a field is written, and the x and y of
  [myself] [position] are read-only.

As the filter of bump, in range or out of range:
- [myself] alone admits nothing: the program's own sprite is never read, so the sensor stays off and its
  output holds nothing.
- [myself] [brain] admits the other sprites running the brain this sprite runs; [myself] [image] the
  other sprites wearing an image with the same pixels as this sprite's.
- Flock: WHEN [in range] [myself] [brain] DO [move] [toward]. The WHEN result is the nearest other sprite
  running this brain, while it is within range, and toward chases it; a sprite alone running the brain
  leaves the rule off.

On the WHEN side:
- Inside a comparison, such as [myself] [image] [equal to] <image>, the WHEN result is the comparison's
  true or false, not a Sprite or a direction: an undirected move under it goes rightward, and toward or
  away from with no target placed add nothing.
- As the whole WHEN, myself is always on and its WHEN result is this sprite itself, so toward or away
  from with no target placed add nothing, a toward alone holding still. [move] [toward] [myself] and
  [move] [away from] [myself] add nothing the same way.
```

## See Also

`tile:tile.var.factory->struct:<Sprite>`
`tile:tile.sensor->sensor.arcade.bump`
`tile:tile.sensor->sensor.arcade.in-range`
