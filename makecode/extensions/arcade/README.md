# Wendoo for MakeCode Arcade

Give your sprites brains made in [Wendoo](https://wendoo.com).

A Wendoo brain is a set of rules -- **WHEN** something happens, **DO**
something about it. This extension runs the brains in your project on
your sprites: place **run brain ... on mySprite**, pick a brain by name,
and the sprite runs it from the next frame until it is destroyed.
Change a brain in the Wendoo editor while your game runs, and every
sprite running it starts the new version right away -- no restart.

> **Heads up:** this extension is under development and not ready to use in
> your projects yet.

To add it to a project:

1. Open your MakeCode Arcade project.
2. Click the gearwheel menu, then **Extensions**.
3. Paste this into the search box and press Enter:

   https://github.com/wendoo-lang/pxt-wendoo/makecode/extensions/arcade

## Brain variables

Your game can read and change a brain's variables. **set brain number**,
**set brain text** and **set brain boolean** put a value into a variable of
the brain a sprite runs, and **brain number**, **brain text** and **brain
boolean** read one back. Type the variable's name exactly as the brain shows
it. The brain sees the new value the next time it thinks, and a value set
right after **run brain** is there from the brain's start. Edit a brain
while your game is running and its variables keep their values.

**set brain player** puts one of the four players into a brain's **player**
variable, so one brain can drive a sprite for each player. A Paddle brain
with the rule **WHEN dpad player DO move** moves each paddle with its own
player's controller:

```
run brain Paddle on leftPaddle
set brain player "player" of leftPaddle to player one
run brain Paddle on rightPaddle
set brain player "player" of rightPaddle to player two
```

---

Developers: the source lives in the
[pxt-wendoo](https://github.com/wendoo-lang/pxt-wendoo) repository. This
extension builds on the Wendoo VM extension and the Wendoo Arcade base
vocabulary, which it pulls in; see the repository README for how the
project fits together.

#### Metadata (used for search, rendering)

- for PXT/arcade
