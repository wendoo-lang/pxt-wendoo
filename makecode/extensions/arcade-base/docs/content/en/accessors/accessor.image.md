```brain noframe
{ "tiles": ["tile.sensor->sensor.arcade.myself", "${tileId}"] }
```

# Image

The picture a sprite wears.

---

Put **image** after a sprite to read the picture it wears. **gets** dresses the sprite in one of your
project's images, or in another sprite's image: **WHEN bump DO bumped sprite image gets myself image**
dresses whatever your sprite touches just like it.

**WHEN myself image equal to** one of your project's images is on while your sprite wears a picture
with the same pixels, however it came to wear it.

## Example

```brain
{
  "ruleJsons": [
    {
      "version": 1,
      "when": ["tile.sensor->sensor.arcade.bump"],
      "do": [
        "tile.out->struct:<Sprite>.bumped",
        "tile.accessor->struct:<Sprite>->image",
        "tile.op->assign",
        "tile.sensor->sensor.arcade.myself",
        "tile.accessor->struct:<Sprite>->image"
      ],
      "children": [],
      "comment": "Dress whatever this sprite bumps like this sprite."
    }
  ],
  "catalog": []
}
```

## Provided By

`tile:tile.var.factory->struct:<Sprite>`

## See Also

`tile:tile.sensor->sensor.arcade.myself`
`tile:tile.out->struct:<Sprite>.bumped`
`tile:tile.op->eq`
