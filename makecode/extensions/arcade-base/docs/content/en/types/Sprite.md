```brain noframe
{
  "tiles": [
    "tile.accessor->struct:<Sprite>->image",
    "tile.accessor->struct:<Sprite>->position",
    "tile.accessor->struct:<Sprite>->brain",
    "tile.accessor->struct:<Sprite>->moveSmoothing"
  ]
}
```

# Sprite

A sprite in your game, with parts a brain can read and change.

---

**myself**, **bumped sprite**, **sprite in range** and **sprite out of range** each give you a sprite,
and a **sprite** variable holds one. Put a part after a sprite to read it, and add **gets** after the
part to change it: **DO myself image gets bumped sprite image** dresses your sprite like whatever it
bumps.

Two sprites are **equal to** each other when they are the same sprite.

## Image

`tile:tile.accessor->struct:<Sprite>->image` is the picture the sprite wears; **gets** dresses it in
another one.

## Position

`tile:tile.accessor->struct:<Sprite>->position` is where the sprite's center is; **gets** puts it
somewhere else at once.

## Brain

`tile:tile.accessor->struct:<Sprite>->brain` is the brain the sprite runs; **gets** switches it to
another from the next frame.

## Move Smoothing

`tile:tile.accessor->struct:<Sprite>->moveSmoothing` is how gradually the sprite speeds up, in
seconds; **gets** gives it smoothing of its own.

Open a part to see how it reads and changes.

## When a Sprite Is Destroyed

A destroyed sprite reads as nothing: a WHEN holding it does not fire, its parts read nothing, and
changing a part of it changes nothing.

## See Also

`tile:tile.sensor->sensor.arcade.myself`
`tile:tile.sensor->sensor.arcade.bump`
`tile:tile.var.factory->struct:<Vector2>`
`tile:tile.op->assign`
`tile:tile.op->eq`
