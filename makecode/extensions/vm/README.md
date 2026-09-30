# Wendoo VM for MakeCode

The engine that runs [Wendoo](https://wendoo.com) brains inside a MakeCode
program.

A brain is a set of rules -- **WHEN** something happens, **DO** something
about it -- compiled to Wendoo bytecode. This extension executes that
bytecode. It contains no blocks and depends on no target-specific libraries:
it is the target-agnostic core that game- and device-facing Wendoo
extensions build on.

> **Heads up:** this extension is under development and not ready to use in
> your projects yet.

Most people will never add this extension directly -- the Wendoo extension
for your editor (and its vocabulary packs) depends on it and pulls it in
automatically. If you are building on the VM itself:

1. Open your MakeCode editor and open your project.
2. Click the gearwheel menu, then **Extensions**.
3. Paste this into the search box and press Enter:

   https://github.com/wendoo-lang/pxt-wendoo/makecode/extensions/vm

To give sprites programs in MakeCode Arcade, add the Wendoo arcade
extension instead -- it pulls this one in:

   https://github.com/wendoo-lang/pxt-wendoo/makecode/extensions/arcade

---

Developers: the source lives in the
[pxt-wendoo](https://github.com/wendoo-lang/pxt-wendoo) repository. The
VM is a conforming Wendoo VM, held to the reference implementation's
observable semantics; see the repository README for how the project fits
together.

#### Metadata (used for search, rendering)

- for PXT/arcade
