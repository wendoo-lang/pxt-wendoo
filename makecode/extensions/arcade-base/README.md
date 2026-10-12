# Wendoo Arcade Base

The [Wendoo](https://wendoo.com) vocabulary every MakeCode Arcade game
shares: the tiles a brain uses to read the controllers, notice what its
sprite touches and what is near it, move its sprite, change how it looks,
keep score, talk, show text and ask questions, play sounds, destroy sprites,
and end the game.

- **dpad** -- a WHEN tile that is on while the dpad is held, carrying the
  direction it points. Add **up**, **down**, **left** or **right** to listen
  to just those directions.
- **A button** and **B button** -- WHEN tiles that are on while that button
  is held: **WHEN A button DO move up** moves the sprite up for as long as A
  is held.
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
  it: **WHEN bump DO myself image gets bumped sprite image** dresses your
  sprite just like whatever it bumps.
- **player one**, **player two**, **player three** and **player four** --
  the players of your game, each with a controller and a score of its own.
  Give **dpad**, **A button** or **B button** a player to read that player's
  controller: **WHEN dpad player two DO move** steers with the second
  controller. **add score** is a DO tile adding 1 to player one's score on
  every frame its rule is on; give it a number to add that many instead -- a
  negative number takes points away -- and a player to change that player's
  score. Put **score** after a player to read it: **WHEN player one score
  greater than 9 DO move** waits for 10 points. Once a rule reads or changes
  the score of player two, three or four, the game shows scores the way
  Arcade does for several players, each in a corner of its own.
- **game over** -- a DO tile that ends the game the way Arcade does, as a
  loss. Add **win** to end it as a win, or give it a player to have that
  player win. Give it one of Arcade's effects, like **confetti**, and one of
  its sounds, like **power up**, for the ending: **WHEN player one score
  greater than 9 DO game over win confetti** wins with confetti at 10
  points. A game ends only once, so the first frame a **game over** rule is
  on decides how it ends.
- **destroy** -- a DO tile that removes a sprite from the game: on its own,
  your own sprite; given a sprite, that one -- **WHEN bump DO destroy bumped
  sprite** eats whatever your sprite bumps. Give it one of Arcade's particle
  effects, like **confetti**, to make the sprite vanish in it, and a
  **duration** in seconds for how long the effect plays.
- **destroyed** -- a WHEN tile that is on once, when your own sprite is
  destroyed, for its brain's last turn: **WHEN destroyed DO game over** ends
  the game when your sprite is destroyed, by a brain or by the game's code.
- **say** -- a DO tile that shows text in your sprite's speech bubble:
  **WHEN bump DO say "ouch"**. The bubble stays up while the rule keeps
  firing and for 5 seconds after, or for the **duration** you give it. With
  no text, it shows what its WHEN found -- **WHEN player one score DO say**
  shows the score.
- **show text** -- a DO tile that shows text in a box on the screen until the
  player presses A: **WHEN A button DO show text "Welcome!"**. Add **top**,
  **center** or **full** to place the box. The whole game pauses while it is
  up.
- **ask** -- a DO tile that asks the player a yes-or-no question, A for yes
  and B for no: **WHEN bump DO ask "Eat it?"**. The game pauses until the
  player answers, and the rules tucked under it read the answer with
  **answer**: **WHEN answer DO destroy bumped sprite**.
- **play sound** -- a DO tile that plays one of Arcade's sounds: **WHEN bump
  DO play sound ba ding**. On its own it plays ba ding. Give it one of your
  project's songs, made in the music editor, to play that song instead. The
  rule waits for the sound to end; add **in background** to let it go on at
  once, or **looping** to play the sound over and over until **stop
  sounds**.
- **play tone** -- a DO tile that plays a tone at a pitch in hertz, 440 on
  its own, for half a second or the **duration** you give it: **DO play tone
  440 to 880 for 1** slides up for a second. Give it a **volume** from 0 to
  1, a wave -- **sine**, **square**, **sawtooth**, **triangle** or **noise**
  -- and **vibrato**, **tremolo** or **warble**. **in background** and
  **looping** work as they do on **play sound**.
- **stop sounds** -- a DO tile that stops every sound playing and ends every
  **looping** sound: **WHEN B button DO stop sounds**.
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
- **myself** -- your own sprite, as a tile you can put anywhere a sprite
  goes: **WHEN in range myself brain DO move toward** gathers sprites
  running the same brain into a flock, without naming the brain.
- **image**, **position** and **brain** -- put one after a sprite, like
  **myself** or **bumped sprite**, to read that part of it: the picture it
  wears, the spot its center is at, or the brain it runs (nothing while it
  runs none). Add **gets** to change your own sprite: **DO myself image
  gets** one of your project's images changes its picture, **DO myself
  position gets bumped sprite position** jumps it onto what it bumps, and
  **DO myself brain gets** another brain switches to that brain from the
  next frame. To stop a sprite's brain, make a brain with no rules and
  switch to that one: a brain with no rules does nothing.
- **move smoothing** -- put it after a sprite to read how gradually that
  sprite speeds up, in seconds (0 while it starts at full speed), and add
  **gets** to change it: **DO myself move smoothing gets 0.15** gives your
  sprite smooth starts of its own, and **WHEN bump DO bumped sprite move
  smoothing gets 0** makes whatever it bumps start crisply. See "Smooth
  starts" below.
- **x** and **y** -- put one after a position to read just one number of
  it: **x** grows to the right and **y** grows downward, the same way
  **up** and **down** point on **move**. Compare them with **less than**
  and **greater than**: tucked under **WHEN in range**, a rule **WHEN
  sprite in range position y less than myself position y DO move up**
  climbs while that sprite is higher up the screen than yours. Add
  **gets** to change just that number: **DO myself position x gets 80**
  moves your sprite across to 80, keeping its height.
- **equal to** and **not equal to** -- put one between two images, two
  sprites, two brains or two positions to compare them. Two images are
  equal when they have the same pixels, wherever each one came from; two
  sprites when they are the same sprite and it has not been destroyed; two
  brains when they are the same brain; and two positions when their **x**
  and their **y** both match. Something that stands for nothing is equal to
  nothing, not even another nothing, and **not equal to** is on exactly
  when **equal to** is not. **WHEN myself image equal to** one of your
  project's images **DO move wander** strolls while your sprite wears that
  picture, however it came to wear it.
- **position** and **sprite** variables -- make a variable of either kind to
  have your brain remember a spot or hold on to a sprite. A position
  variable starts at **origin**; a sprite variable holds nothing until a
  rule gives it a sprite. A position variable keeps the spot it was given,
  even after the sprite it came from moves on: with a position variable
  named **home**, **WHEN this page starts DO home gets myself position**
  remembers where your sprite began, and **WHEN in range DO move toward
  home** sends it back there whenever another sprite comes near. Change one
  of its numbers to move the spot it keeps: **DO home x gets 80** shifts
  **home** across to 80. A sprite variable holds the sprite itself, wherever
  it goes: with a sprite variable named **target**, **WHEN bump DO target
  gets bumped sprite** picks the sprite yours touches, and **WHEN target DO
  move toward target** keeps chasing it. Once that sprite is destroyed, the
  variable reads as nothing: **WHEN target** stops firing, reading a part of
  it gives nothing, changing a part of it changes nothing, and a move toward
  it does not run.
- **origin** -- the top-left corner of the screen, a position whose **x**
  and **y** are both 0, and where every position variable starts. Pick a
  spot by its numbers: **DO home x gets 80** and **DO home y gets 60**, and
  **DO move toward home** heads for the spot 80 across and 60 down.
- **plus**, **minus** and **multiplied by** -- work out a new position from
  others. **plus** adds two positions and **minus** takes one from another,
  **x** with **x** and **y** with **y**; a position **multiplied by** a
  number has both its **x** and its **y** multiplied by it. Each gives a new
  position of its own. **WHEN in range DO move toward home multiplied by 0.5
  plus sprite in range position multiplied by 0.5** makes a goalkeeper that
  stands halfway between home and whatever comes near. The number goes after
  the position, never before it, and positions cannot be divided. A result
  too big to hold is no position at all.

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
sprite heading for a spot still stops right on it. Smoothing eases from
the speed a sprite actually has, whatever gave it that speed: a sprite
that changes brains while moving carries on without a stutter, a sprite
your game code set moving eases on from that speed when a brain takes
over, and a sprite a wall stopped eases back up from the stop once the way
is clear. Smoothing suits flocks and followers, where it turns stop-and-go hopping
into flowing motion. It also softens every move a brain makes, the dpad's
included -- at 100 a dpad-steered sprite takes about a quarter of a second
to reach full speed -- so a game built on quick reactions, like a shooter
or a maze chase, is better off without it. Set it back to 0 to turn it off.

That number is the project's default, and any sprite can have its own
instead. Give one sprite its own smoothing, in milliseconds, and it wins
over the default for that sprite alone -- 0 turns smoothing off for it even
while the rest of the game is smoothed:

```typescript
wendoo.moveSmoothing = 100
wendoo.setMoveSmoothing(platform, 60)
wendoo.setMoveSmoothing(arrow, 0)
```

Here a moving platform gets a subtle ease, an arrow flies off at full speed
the moment it is fired, and every other sprite eases with the default of
100. A sprite keeps its own smoothing whichever brain it runs, so give it
before or after the brain. Give it a negative number, like
`wendoo.setMoveSmoothing(platform, -1)`, to have it follow the default
again. A brain can set it too, in seconds, with **move smoothing** --
**DO myself move smoothing gets 0.06** gives its sprite the platform's 60
milliseconds.

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
