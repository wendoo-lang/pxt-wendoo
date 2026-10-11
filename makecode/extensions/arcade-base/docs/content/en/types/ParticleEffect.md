```brain noframe
{
  "tiles": [
    "tile.literal->struct:<ParticleEffect>->spray",
    "tile.literal->struct:<ParticleEffect>->trail",
    "tile.literal->struct:<ParticleEffect>->fountain",
    "tile.literal->struct:<ParticleEffect>->rings",
    "tile.literal->struct:<ParticleEffect>->fire",
    "tile.literal->struct:<ParticleEffect>->warmRadial",
    "tile.literal->struct:<ParticleEffect>->coolRadial",
    "tile.literal->struct:<ParticleEffect>->halo",
    "tile.literal->struct:<ParticleEffect>->ashes",
    "tile.literal->struct:<ParticleEffect>->disintegrate",
    "tile.literal->struct:<ParticleEffect>->confetti",
    "tile.literal->struct:<ParticleEffect>->hearts",
    "tile.literal->struct:<ParticleEffect>->smiles",
    "tile.literal->struct:<ParticleEffect>->blizzard",
    "tile.literal->struct:<ParticleEffect>->bubbles",
    "tile.literal->struct:<ParticleEffect>->starField",
    "tile.literal->struct:<ParticleEffect>->clouds",
    "tile.literal->struct:<ParticleEffect>->none"
  ]
}
```

# Particle Effect

A burst of particles for a sprite to vanish in.

---

Each of these is one of Arcade's own particle effects. Give one to **destroy** to make a sprite vanish
in it: **DO destroy fire** burns your sprite away. **none** shows no particles.

## See Also

`tile:tile.actuator->actuator.arcade.destroy`
`tile:tile.var.factory->struct:<Effect>`
