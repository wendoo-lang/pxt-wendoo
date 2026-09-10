## Project rules

This file is a pointer, not the rule set. The authoritative rules live in
`AGENTS.md` and `.github/instructions/*.instructions.md`; read the full files,
not summaries of them.

Read these before your first edit, comment, or audit:

- `AGENTS.md`
- `.github/instructions/global.instructions.md`
- `.github/instructions/agent-posture.instructions.md` (working temperament and
  decision style; `applyTo: "**"`, so it always applies)
- every other `.github/instructions/*.instructions.md` whose `applyTo` glob
  matches the area you are touching (for `makecode/extensions/`,
  `makecode/simx/`, `apps/arcade/`, that is `vm.instructions.md`)

`external/wendoo-lang` is the upstream language submodule. It carries its own
`AGENTS.md` and `.github/instructions/` covering the packages inside it; read
those when a task takes you into the submodule, in addition to the rules here.
