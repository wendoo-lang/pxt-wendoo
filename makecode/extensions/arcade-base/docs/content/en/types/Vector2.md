```brain noframe
{ "tiles": ["tile.accessor->struct:<Vector2>->x", "tile.accessor->struct:<Vector2>->y"] }
```

# Position

A spot on the screen, or a direction.

---

A sprite's **position** is the spot its center is at, and **dpad** carries the direction it points as
a position too. A **position** variable remembers one.

## X and Y

`tile:tile.accessor->struct:<Vector2>->x` reads how far across a position is, and
`tile:tile.accessor->struct:<Vector2>->y` how far down, both in pixels. A brain reads them but cannot
change them. Open either to see how.

## A Snapshot

A position stays as it was made. **myself position** is where your sprite stood the moment it was read:
with a position variable named **home**, **WHEN this page starts DO home gets myself position**
remembers where your sprite began, and **DO move toward home** goes back there later, wherever the
sprite has wandered since.

## Working Out New Positions

**plus** adds two positions and **minus** takes one from another, **x** with **x** and **y** with
**y**. A position **multiplied by** a number has both its numbers multiplied by it; the number goes
after the position. Each gives a new position. Positions cannot be divided, and a result too big to
hold is no position at all.

**WHEN in range DO move toward home multiplied by 0.5 plus sprite in range position multiplied by 0.5**
makes a goalkeeper that stands halfway between home and whatever comes near.

Two positions are **equal to** each other when their **x** and their **y** both match.

## See Also

`tile:tile.op->add`
`tile:tile.op->sub`
`tile:tile.op->mul`
`tile:tile.op->eq`
`tile:tile.var.factory->struct:<Sprite>`
`tile:tile.actuator->actuator.arcade.move`
