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
  only sprites that look exactly like that image, a sprite to notice only
  that sprite, or one of your brains to notice only sprites running it.
- **in range** and **out of range** -- a pair of WHEN tiles that watch the
  sprite nearest yours, carrying it: **in range** is on while that sprite is
  within 60 pixels, center to center, and **out of range** while it is
  farther. Give either a number to pick the range -- **in range 40** means
  within 40 pixels. Like **bump**, either can be given an image, a sprite
  or a brain to watch only the nearest sprite that looks like that image,
  only that sprite, or the nearest sprite running that brain -- never your
  own. When both have the same range and the same image, sprite or brain, and
  there is a sprite to watch, exactly one of the pair is on; with none,
  neither is. **WHEN out of range DO move toward** keeps a companion close,
  and adding **WHEN in range DO move away from** makes it hold its distance.
- **above**, **below**, **left of** and **right of** -- add one or two to
  **bump**, **in range** or **out of range** to notice only sprites on that
  side of yours, center to center: **WHEN in range above DO move toward**
  climbs after a sprite overhead and ignores one underneath. **above** and
  **right of** together mean up and to the right.
- **bumped sprite**, **sprite in range** and **sprite out of range** --
  the sprite **bump**, **in range** or **out of range** found, as a tile of
  its own you can use later in the same rule, or in the rules tucked under
  it: **WHEN bump DO look like bumped sprite** dresses your sprite just
  like whatever it bumps.
- **move** -- a DO tile that moves the sprite. Add **up**, **down**,
  **left** or **right** to pick its direction -- **up** and **right**
  together move on the diagonal. Add **toward** or **away from** to chase or
  flee the sprite its WHEN carries -- **WHEN bump DO move away from** runs
  from whatever it bumps for as long as they touch, turning as that sprite
  moves. Put a sprite after **toward** or **away from** to chase or flee
  that sprite instead, like the **sprite in range** a rule above found.
  Add **wander** to stroll from one random spot on the screen to the next.
  They all mix with the other directions: **toward** and **up** together
  chase while drifting upward, and **toward** with **wander** drifts after a
  sprite. A move heading for one place -- just **toward** a sprite or a
  spot, or just **wander** -- stops right on it instead of going past, and
  stays put once it is there. Without a direction to go, it moves in the
  direction its WHEN carries, or rightward when there is none. Add
  **slowly** or **quickly** (up to three times) to change its speed, or
  give it a **speed** in pixels per second -- see the speed table below.
- **look like** -- a DO tile that changes the sprite's picture. Give it one
  of your project's images to wear, or a sprite to dress just like.

### How fast a move goes

| Words on **move**            | Pixels per second         |
| ---------------------------- | ------------------------- |
| **slowly slowly slowly**     | 12.5                      |
| **slowly slowly**            | 25                        |
| **slowly**                   | 50                        |
| no **slowly** or **quickly** | 100                       |
| **quickly**                  | 200                       |
| **quickly quickly**          | 400                       |
| **quickly quickly quickly**  | 500 -- Arcade's top speed |

500 pixels per second is the fastest an Arcade sprite moves. A move asking
for more -- three **quickly**s ask for 800, or a **speed** above 500 --
goes at 500 in the direction it asks, on a diagonal as well as straight.

### Fast sprites and ranges

A moving sprite goes forward in small jumps, one per frame: each jump is
its speed (500 at most) times how long the frame lasts. Arcade runs at most
50 frames a second, so a frame lasts at least 20 milliseconds -- and about
33 milliseconds on a slower device. **in range** and **out of range** look
once a frame, so a sprite whose jumps are nearly as big as a range can hop
across it from one side to the other, and a rule pair that keeps it in
place switches back and forth instead.

Rule of thumb: keep the smallest range in a brain at least about three
jumps wide on the slowest device you expect -- three times the speed times
0.033 seconds:

| Fastest move in the brain | One jump on a slow device | Smallest range |
| ------------------------- | ------------------------- | -------------- |
| normal speed, 100         | 3.3 pixels                | 10             |
| **quickly**, 200          | 6.7 pixels                | 20             |
| **quickly quickly**, 400  | 13.3 pixels               | 40             |
| **quickly** x3, 500       | 16.7 pixels               | 50             |

For example, a group of followers each running **WHEN out of range 20 DO
move toward** a leader and **WHEN in range 15 DO move away from** the others
settles around its leader at the normal speed. With **quickly quickly
quickly**, give the same pair ranges of 60 and 45 and it settles too.

### Smooth starts

A move starts at full speed on the frame its rule fires and stops on the
frame it stops: the crisp feel of a classic arcade game, and how every
game starts out. To have sprites speed up gradually instead, add one line
to your game's JavaScript:

```typescript
wendoo.moveSmoothing = 100
```

The number is how gradual, in milliseconds. At 100 a sprite starting from
rest reaches nine tenths of its speed in about a quarter of a second; at
150, in about a third. Slowing down and stopping still happen at once, so a
sprite heading for a spot still stops right on it. Smoothing suits flocks
and followers, where it turns stop-and-go hopping into flowing motion. It
also softens every move a brain makes, the dpad's included -- at 100 a
dpad-steered sprite takes about a quarter of a second to reach full speed
-- so a game built on quick reactions, like a shooter or a maze chase, is
better off without it. Set it back to 0 to turn it off.

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
