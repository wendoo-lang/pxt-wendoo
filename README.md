# Wendoo for MakeCode

[Wendoo](https://wendoo.com) brains inside [Microsoft MakeCode](https://makecode.com/).

A Wendoo brain is a list of rules. Each rule says **WHEN** something is
happening, **DO** something in response. You build rules by placing tiles,
the way you build sentences from words, in a Wendoo editor that opens as
a tab inside MakeCode, and the brain runs inside your project. Change a
rule while the project is running and the brain picks up the change
right away.

The Wendoo engine does not care which MakeCode editor it runs in. What
differs per editor is the vocabulary of tiles: what a brain can sense
and what it can do. In [MakeCode Arcade](https://arcade.makecode.com/),
brains drive sprites, and the rest of this page is about that.

## Wendoo for Arcade

Give your sprites brains.

- **WHEN dpad DO move** steers a sprite with the controller.
- **WHEN in range DO move toward** makes a sprite chase whatever comes
  near.
- **WHEN bump DO game over** ends the game on contact.

You draw your sprites in Arcade as usual, give each one a brain, and the
brain runs inside your game. Wendoo is good at behavior: what a sprite
does on its own, how it reacts to the player and to other sprites. The
rest of your game, such as the level, the score display and the title
screen, stays in Blocks or JavaScript, where it belongs.

## Adding Wendoo to a project

1. Open a project in MakeCode Arcade.
2. Click the gearwheel menu, then **Extensions**.
3. Paste this into the search box and press Enter:

   ```text
   https://github.com/wendoo-lang/pxt-wendoo/makecode/extensions/arcade
   ```

4. Click the extension to add it. A **Wendoo** category appears in the
   toolbox, and **Wendoo** appears in the language dropdown next to
   JavaScript and Python. The simulator column also shows a small Wendoo
   strip with an **Open editor** button.

Run the game once before you open the Wendoo tab: the tab learns which
tiles your project has from the running game.

## Your first brains: a chase game

The game has a hero the player steers and a monster that hunts the hero.
Touching the monster ends the game. It takes two brains and three rules.

### 1. Make the brains

Open the Wendoo tab from the language dropdown, or press **Open editor**
on the strip in the simulator column.

Click **Add brain** and name it `hero`. Add one rule:

- **WHEN dpad DO move**

The dpad tile carries the direction the player is pressing, and move
follows it, so this one rule is the whole steering.

Click **Add brain** again and name it `monster`. Add two rules:

- **WHEN in range DO move toward slowly**
- **WHEN bump DO game over**

The first rule turns on while another sprite is within 60 pixels, chases
it, and moves at half speed so the hero can get away. The second ends the
game the moment the monster touches anything.

Brains save with your project, like your images and tilemaps.

### 2. Give the brains to sprites

Switch back to **Blocks**. In **on start**:

1. Create two sprites the usual way, with **set mySprite to sprite** from
   the **Sprites** category. Draw a hero and a monster, and name the
   variables `hero` and `monster`.
2. Move the monster away from the hero with **set position**, for example
   to x 120, y 80.
3. From the **Wendoo** category, add **run brain hero on hero** and
   **run brain monster on monster**. The block's dropdown lists your
   brains by name.

From the next frame each sprite runs its brain until it is destroyed; pick
**none** in the dropdown to stop a sprite's brain.

### 3. Play, then change it while it runs

Press the run button. Steer the hero with the arrow keys and keep away
from the monster.

Now switch to the Wendoo tab and change the monster's first rule to
**WHEN in range DO move toward**, without **slowly**. The monster speeds
up in the simulator right away, with no restart.

Some things to try next, each a rule or two:

- A second monster: give it the same `monster` brain with another
  **run brain** block. One brain can drive many sprites.
- A monster that prowls: add **WHEN out of range DO move wander** to the
  `monster` brain, so it strolls around the screen until the hero comes
  near.
- A buddy that keeps its distance: a `buddy` brain with **WHEN out of
  range DO move toward** and **WHEN in range DO move away from**, on a
  third sprite.
- Running the hero into something to escape: **WHEN bump DO move away
  from** on the `hero` brain pushes it off whatever it touches.

The Wendoo tab has a docs button in its upper right. Every tile has a
page there that says what it does and what you can add to it.

## For developers

The source for the extension and the editor lives in this repository.
Read [AGENTS.md](AGENTS.md) for how the pieces fit together, then:

```bash
git clone --recurse-submodules https://github.com/wendoo-lang/pxt-wendoo.git
cd pxt-wendoo
npm run bootstrap
```

The Wendoo language, compiler and reference VM live in
[wendoo-lang](https://github.com/wendoo-lang/wendoo-lang), included here
as a submodule. [wendoo-mcu](https://github.com/wendoo-lang/wendoo-mcu)
brings Wendoo to the BBC micro:bit, a separate product.

## License

[MIT](LICENSE)
