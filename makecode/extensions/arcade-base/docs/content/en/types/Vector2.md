```brain noframe
{
  "tiles": [
    "tile.literal->struct:<Vector2>->origin",
    "tile.accessor->struct:<Vector2>->x",
    "tile.accessor->struct:<Vector2>->y"
  ]
}
```

# Position

A spot on the screen, or a direction.

---

A sprite's **position** is the spot its center is at, and **dpad** carries the direction it points as
a position too. A **position** variable remembers one. **origin** is the top-left corner of the screen,
where **x** and **y** are both 0.

## X and Y

`tile:tile.accessor->struct:<Vector2>->x` reads how far across a position is, and
`tile:tile.accessor->struct:<Vector2>->y` how far down, both in pixels, one number at a time.

To change where something is, give it a whole new position with **gets**, or change just one of its
numbers: **DO myself position x gets 80** moves your sprite across to 80, and **DO home y gets 20**
changes the spot a position variable named **home** remembers. Open either to see how.

## Starting From Origin

A position variable starts at **origin**, so you can change its numbers right away: **DO home x gets
80** and **DO home y gets 60**, and **DO move toward home** heads for the spot 80 across and 60 down.
**origin** is a position of its own too: **DO move toward origin** heads for the top-left corner, and
**DO home gets origin** sends **home** back there.

## A Snapshot

A position keeps the spot it was given until a rule changes it. **myself position** is where your
sprite stood the moment it was read: with a position variable named **home**, **WHEN this page starts
DO home gets myself position** remembers where your sprite began, and **DO move toward home** goes back
there later, wherever the sprite has wandered since.

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
