# Wendoo Arcade Host

The machinery that runs [Wendoo](https://wendoo.com) brains on MakeCode
Arcade sprites.

This extension holds the blocks a game uses to give its sprites brains --
**run brain**, and the blocks that set and read a brain's variables -- and
the program host behind them. Each game scene gets one host, drained from
the scene's own update loop, and every sprite of the scene given a brain
runs it there. On the game's first frame the extension publishes the
project's catalog, the tiles its brains can use, to the Wendoo simulator
extension.

You do not add this extension yourself: the Wendoo extension for MakeCode
Arcade depends on it and pulls it in, together with the Wendoo VM extension
and the Wendoo Arcade base vocabulary it builds on.

---

Developers: the source lives in the
[pxt-wendoo](https://github.com/wendoo-lang/pxt-wendoo) repository; see the
repository README for how the project fits together.

#### Metadata (used for search, rendering)

- for PXT/arcade
