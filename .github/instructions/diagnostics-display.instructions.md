---
applyTo: "{makecode/extensions/**,makecode/simx/**}"
---

# Diagnostics Display on Kid-Facing Surfaces

Having a diagnostic and displaying it are separate decisions. Stable
codes exist for every diagnostic regardless of display (the machine
layer: store state, console, `data-*` attributes, tests). Display is
tiered by audience.

## The default tier serves a blocks-only kid

- A diagnostic surfaced by default must be actionable by a blocks-only
  user, at least. A fix that requires editing TypeScript is meaningless
  to a user who never opens the MakeCode JavaScript editor.
- Diagnostics originating from dependencies do not surface by default.
- Default-tier notices are worded for the kid; the code rides as data
  on the element, never as the display text.
- A kid's own brain-compile diagnostics are default-tier: their rules,
  their blocks.

## The show-all tier serves developers, in-product

- A "show all diagnostics" setting reveals the full set. The developer
  and debugging audience is served through that toggle, never by
  erasing diagnostics.
- The setting lives in the app settings system; when this repo builds
  one, microbit-sim's and ecosim's app-settings systems are the
  reference implementations.
- Until the toggle exists, a surface may render show-all-tier
  diagnostics unconditionally while the product's only users are its
  developers; the gate must exist before the surface is deployed to
  kids.
