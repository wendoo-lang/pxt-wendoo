# Wendoo Arcade

[Wendoo](https://wendoo.com) brains inside [MakeCode Arcade](https://arcade.makecode.com/).

Wendoo programs are built by
arranging **tiles** -- typed, composable tokens -- into **rules**. Each rule has
a WHEN side (condition) and a DO side (action). A collection of rules forms a
**brain** that drives an autonomous actor. This repository brings those brains
to Arcade: draw a sprite in Arcade's image editor, give it a brain of readable
rules in the Wendoo editor, and spawn it from blocks.

The Wendoo language, compiler, and reference VM live in the upstream
[wendoo-lang](https://github.com/wendoo-lang/wendoo-lang) repository, included
here as a git submodule under `external/`. The TypeScript reference VM is the
executable specification; the Static TypeScript VM in this repository mirrors
its observable bytecode semantics.

## Status

Early. The repository is being bootstrapped and nothing here runs end to end
yet.

## Layout

The top level splits by side of the integration.

| Directory                                    | Contents                                                                                                         |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| [apps/arcade](apps/arcade/)                  | The Wendoo editor webapp. Authors brains and talks to the MakeCode project through the bridge.                   |
| [apps/bridge](apps/bridge/)                  | The Arcade bridge service, relaying between the editor and the simx.                                             |
| [makecode/extensions/](makecode/extensions/) | MakeCode extensions. `vm` holds the Static TypeScript Wendoo VM (target-agnostic, no blocks); vocabulary packs supply genre-specific tiles. |
| [makecode/simx/](makecode/simx/)             | MakeCode simulator extension components. `bridge` joins the editor webapp to the MakeCode project.               |
| [external/wendoo-lang](external/wendoo-lang) | The upstream language, compiler, and reference VM (submodule).                                                   |

`apps/` and `makecode/simx/` are ordinary npm/TypeScript projects.
`makecode/extensions/` are pxt projects built by the MakeCode toolchain, in the
static TypeScript subset it compiles. The root `pxt.json` exists only because
pxt requires a top-level extension for the nested ones to resolve.

## Getting started

This is not an npm workspaces monorepo. Each app and simx component installs
into its own `node_modules`; cross-package links use `file:` dependencies, and
the Wendoo language lives in a submodule.

```bash
git clone --recurse-submodules https://github.com/wendoo-lang/wendoo-arcade.git
cd wendoo-arcade
npm install
```

Run the editor webapp:

```bash
npm --prefix apps/arcade run dev
```

## Related

- [wendoo-lang](https://github.com/wendoo-lang/wendoo-lang) -- the language, compiler, reference VM, and shared packages
- [wendoo-mcu](https://github.com/wendoo-lang/wendoo-mcu) -- Wendoo on the BBC micro:bit, a separate product on Wendoo's own platform

## License

[MIT](LICENSE)
