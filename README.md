# pxt-wendoo

[Wendoo](https://wendoo.com) brains inside
[Microsoft MakeCode](https://makecode.com/).

Wendoo programs are built by arranging **tiles** -- typed, composable tokens --
into **rules**. Each rule has a WHEN side (condition) and a DO side (action). A
collection of rules forms a **brain** that drives an autonomous actor. This
repository brings those brains to MakeCode. The Wendoo VM and most of the
machinery here are target-agnostic; the first target is
[MakeCode Arcade](https://arcade.makecode.com/), where you draw a sprite in
Arcade's image editor, give it a brain of readable rules in the Wendoo editor,
and spawn it from blocks. Further MakeCode targets are expected to follow.

The Wendoo language, compiler, and reference VM live in the upstream
[wendoo-lang](https://github.com/wendoo-lang/wendoo-lang) repository, included
here as a git submodule under `external/`. The TypeScript reference VM is the
executable specification; the Static TypeScript VM in this repository mirrors
its observable bytecode semantics.

## Status

Under development. The path runs end to end -- a sprite drawn in Arcade, a
brain authored in the Wendoo editor, running inside the game -- but nothing
is released yet, and formats and extension coordinates may still change.

## Layout

The top level splits by side of the integration.

| Directory                                    | Contents                                                                                                         |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| [apps/bridge](apps/bridge/)                  | The bridge service, relaying between the editor and the simx.                                                    |
| [makecode/extensions/](makecode/extensions/) | MakeCode extensions. `vm` holds the Static TypeScript Wendoo VM (target-agnostic, no blocks); `arcade-base` is Arcade's base vocabulary pack, and `arcade` is the extension a project adds. |
| [makecode/simx/](makecode/simx/)             | MakeCode simulator extension components. `wendoo` holds the Wendoo editor webapp, which authors brains, and the simx that joins it to the MakeCode project through the bridge. |
| [packages/](packages/)                       | Shared npm packages: contracts spoken by units on both sides of the integration. `protocol` carries the MakeCode session kinds. |
| [external/wendoo-lang](external/wendoo-lang) | The upstream language, compiler, and reference VM (submodule).                                                   |

`apps/`, `makecode/simx/`, and `packages/` are ordinary npm/TypeScript projects.
`makecode/extensions/` are pxt projects built by the MakeCode toolchain, in the
static TypeScript subset it compiles. The root `pxt.json` exists only because
pxt requires a top-level extension for the nested ones to resolve.

## Getting started

This is not an npm workspaces monorepo. Each app and simx component installs
into its own `node_modules`; cross-package links use `file:` dependencies, and
the Wendoo language lives in a submodule.

```bash
git clone --recurse-submodules https://github.com/wendoo-lang/pxt-wendoo.git
cd pxt-wendoo
npm run bootstrap
```

`bootstrap` installs every package and builds the `file:` dependency graph,
dependencies first.

Run the editor webapp:

```bash
npm --prefix makecode/simx/wendoo run dev
```

## Related

- [wendoo-lang](https://github.com/wendoo-lang/wendoo-lang) -- the language, compiler, reference VM, and shared packages
- [wendoo-mcu](https://github.com/wendoo-lang/wendoo-mcu) -- Wendoo on the BBC micro:bit, a separate product on Wendoo's own platform

## License

[MIT](LICENSE)
