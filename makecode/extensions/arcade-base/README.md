# Wendoo Arcade Base

The [Wendoo](https://wendoo.com) vocabulary every MakeCode Arcade game
shares: the tiles a brain uses to read the controller, notice what its
sprite touches and what is near it, move its sprite, and change how it
looks.

- **dpad** -- a WHEN tile that is on while the dpad is held, carrying the
  direction it points. Add **up**, **down**, **left** or **right** to listen
  to just those directions.
- **bump** -- a WHEN tile that is on while the sprite touches another
  sprite, carrying the sprite it touches. When it touches several at once,
  it carries the nearest. Give it one of your project's images to notice
  only sprites that look exactly like that image.
- **in range** and **out of range** -- a pair of WHEN tiles that watch the
  sprite nearest yours, carrying it: **in range** is on while that sprite is
  within 60 pixels, center to center, and **out of range** while it is
  farther. Give either a number to pick the range -- **in range 40** means
  within 40 pixels. When both have the same range and there is another
  sprite, exactly one of the pair is on; with no other sprite, neither is. **WHEN out of range DO move
  toward** keeps a companion close, and adding **WHEN in range DO move away
  from** makes it hold its distance.
- **move** -- a DO tile that moves the sprite. Add **up**, **down**,
  **left** or **right** to pick its direction -- **up** and **right**
  together move on the diagonal. Add **toward** or **away from** to chase or
  flee the sprite its WHEN carries -- **WHEN bump DO move away from** runs
  from whatever it bumps for as long as they touch, turning as that sprite
  moves. They mix with the other directions: **toward** and **up** together
  chase while drifting upward. Without a direction to go, it moves in the
  direction its WHEN carries, or rightward when there is none. Add
  **slowly** or **quickly** (up to three times) to change its speed, or
  give it a **speed** in pixels per second.
- **look like** -- a DO tile that changes the sprite's picture. Give it one
  of your project's images to wear, or a sprite to dress just like.

> **Heads up:** this extension is under development and not ready to use in
> your projects yet.

Most people will never add this extension directly -- the Wendoo arcade
extension depends on it and pulls it in. To give sprites brains, add that
extension instead:

   https://github.com/wendoo-lang/pxt-wendoo/makecode/extensions/arcade

---

Developers: the source lives in the
[pxt-wendoo](https://github.com/wendoo-lang/pxt-wendoo) repository. This
extension builds on the Wendoo VM extension, which it pulls in; see the
repository README for how the project fits together.

#### Metadata (used for search, rendering)

- for PXT/arcade
