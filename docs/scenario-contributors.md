# Scenario Contributors

How the inputs a rehearsal scripts and the state and events it observes
are declared and delivered when they come from more than one source: the
target's own simulated board, the peripherals a library attaches to it,
the packs that stage a world, and the media that connect boards to each
other. One shape serves every source, one composition rule joins them,
and the composed surface is what the assistant learns a world's
vocabulary from and what every host of a rehearsal exposes.

This spec is the Wendoo side of a seam. The shapes live in the shared
assistant bridge (`external/wendoo-lang/packages/assistant-bridge`), and
each target's adapter implements them over that target's own simulation
harness. For MakeCode the harness is pxt's headless test harness,
specified in pxt at `pxtsimcore/headless-harness.md` in pxt's own
vocabulary (simulators, frames, scenarios); the MakeCode
target adapter section below states how the two meet. Nothing Wendoo
needs exists below the seam, and nothing MakeCode-specific exists above
it.

## What it cites

- The unified component contract: a component is a functional device
  model with durable identity that declares its state channels and emits
  their values itself, offers input kinds and interprets scripted values,
  runs on a host-owned clock in lockstep, and is deterministic under the
  seeded random source. UI is outside the contract. Headless hosting in
  browser and Node is mandatory. This spec applies that contract to the
  board, to packs and to media as well as to components.
- The assistant spec (wendoo-backend, `docs/specs/assistant.md`, Scenario
  demonstrations): one shared core scenario format over each target's
  injectable-input mechanism, with per-target extensions; claims scoped to
  the fidelity of the run that backs them.
- The jacdac spec (wendoo-mcu, `docs/specs/jacdac.md`): roles as the
  stable, kid-visible names of module instances; modules as UI-free
  functional cores.
- pxt's headless test harness (pxt, `pxtsimcore/headless-harness.md`):
  contributors, composition, scenarios, the trace, worlds
  of several simulators, media, recording and replay, for MakeCode
  targets.

## Vocabulary

A world advances in steps. A think is Wendoo's word for a brain's turn
and names the kit's per-step record, `ThinkObservation`; on a MakeCode
target a step is a simulator frame, and pxt's harness speaks only of
frames. "Think" is kit and assistant vocabulary and does not appear in
the MakeCode stack.

Each target declares its nominal step period in milliseconds. A test
records the period it ran under, and a recording's clock deltas override
it (see Recording a run), so a step index names the same moment on every
host of one target.

## The contributor

A scenario contributor is anything in a staged world that can be scripted
or observed.

```
ScenarioContributor
  id              durable, unique in the world: "board" for the target's
                  own simulated device; a component's role name; a pack's
                  key; a medium's id
  provider        who teaches it: the target identity for the board, the
                  library's owner/repo for a component, the declaring
                  extension's owner/repo for a pack, the platform for a
                  medium; carried into the
                  declared surface for attribution
  docs            optional markdown: what the contributor is and how its
                  kinds, channels and events relate in time; the guidance
                  an author or the assistant reads before scripting it
  inputKinds()    ScenarioInputKind[]   (name, description, class: level
                  or arrival, values: enum | range | encoding, docs?)
  stateChannels() SubjectStateChannel[] (name, description, rendering,
                  bulk?, identityValue, docs?)
  eventKinds()    WorldEventKind[]      (name, description, values,
                  docs?)
  apply(kind, value)  delivers one scripted input through the
                  contributor's own seam
  readState()     Map<name, rendered value>: the contributor's channels
                  as they stand after the step
  emit(name, value)   called by the contributor itself when an event
                  happens; the kit collects
```

The board is a declared contributor like every other. There is no base
list that peripherals are merged into.

Rules every contributor obeys:

- The executor observes. `readState` renders state the contributor itself
  holds and settled during the step; `emit` is called by the contributor
  at the moment the event happens. Nothing reconstructs another
  contributor's state or events from the outside, and no event is derived
  from a state diff.
- Reads are pure. `readState` changes nothing; state settles in the step.
- Deterministic. Same seed, same scripted inputs, same step count give the
  same emitted state and events, byte for byte. Entropy only through the
  host-provided seeded source.
- Headless. A contributor runs with no DOM, in browser and Node alike. A
  source that exists only as a visual surface is not a contributor and
  appears in no rehearsal surface.

## Composition

The adapter composes a world's contributors into one declared surface and
one dispatch table.

Order is fixed, so that same-seed reruns and the declared surface are
byte-identical: the board first; then components in ascending order of
role name; then packs in ascending order of pack key; then media in
ascending order of medium id, in a world of one board as of many. Within
a contributor, declaration order. In a world with several boards, boards
by id, then media; within a board, its contributors as above. State
deltas on a step list channels in this composed order; events on a step
list in emission order, since the order they happened in is what an
event carries.

The composed surface is fixed for a run. It is declared from the staging
before the first step, and a detach through a medium changes a channel's
value to its absent rendering; it never removes the channel or moves
another's place.

Names. A contributor's own names are plain (`button-a`, `light-level`,
`display`). The composed name of a component's kind, channel or event is
`<role>.<name>`, the role spelled exactly as the user sees it in the
editor: `slider 1.position`, `arm servo.angle`. A pack's is
`<key>.<name>` under the pack's key: `wendoo.position`. A medium's id is
the outer name of its kinds and channels: `ether.link board 1-board 3`,
`bus 1.attached`. The board's names alone are bare; it is the one
default world. When a world has more than
one board, a board's id is the outer name of everything on it:
`board 2.display`, `board 3.slider 1.position`; with one board the outer
name is omitted. Two instances of one component collide by construction,
and the role is how the kid already names the instance, so the compound
is read, not decoded. A composed name is matched whole against the
declared surface and never split on its separator, so a role or a board
id may contain any character the editor lets the user type. The
provider that declares a contributor is attribution and never part of a
name.

Collisions are refused at staging, before the first step, with a stable
code naming the colliding outer name, never merged silently: a role,
pack key or medium id already taken by another contributor's outer
name, or equal to the outer segment of one of the board's own names
(`display`, `speaker`, `pin`), whatever kinds the newcomer declares. The
refusal depends on the names in the staging alone, never on a
contributor's declaration list.

Validation. Every site that checks a scenario's kinds (the simulate tool
against the adapter; the kit's scheduled inputs against the driver)
checks against the composed surface for the request's staging, and a
rejection lists the composed names, so a refused scenario teaches the
model the real vocabulary.

Dispatch. An input is applied by the contributor whose composed name
matches its kind; the kit routes, the contributor applies. Per step:
route the inputs due this step to their contributors; the contributors'
pre-step; the runtime tick; the contributors' post-step drains inboxes
into state; the kit polls every contributor's `readState` once and
merges in composed order, and collects the events emitted during the
step in emission order. In a world of several boards every board takes
its step first and every medium propagates after, so a frame sent on
step N reaches its receivers on step N+1 whichever board sent it, and
delivery latency never depends on board order.

## Values

`ScenarioInput.value` is scalar: number, boolean or string. A kind's
description defines what its value means and the range it is read over.
A kind whose value is compound defines a string encoding in that
sentence ("the x and y of the place, as `x,y` in pixels"); the encoding
is the contributor's own choice and is part of its description. Rendered
channel values are strings under the same rule (the display channel
renders its pixels as one string of brightness digits).

Bulk channels. A channel whose natural rendering runs past a line (an
arcade screen) renders as a content hash, computed as the MakeCode
harness defines it (pxt `pxtsimcore/headless-harness.md`, Values) so
every host renders the same value; the bytes themselves are a file
beside the scenario under the bulk-value rule of Recording a run,
written on request and at a failed expectation on the channel. A check
finer than the whole channel is a probe: a platform-supplied component
staged as an attachment under a role with its probe list as config, each
probe one declared channel (`probe.pixel 10,20`, `probe.region
0,0,16,16`), composing as any component does. Game state a test wants
is a pack's channels (`wendoo.position`), never pixels; probes serve
the display path itself.

## Observation

`ThinkObservation.state` is an object of rendered values keyed by
composed name, in composed order: every channel on the first step,
changed channels after. A channel whose contributor is detached renders
absent and holds `null`; a channel missing from a step holds what it
last showed. `identityValue` is per channel. A channel is a channel of
the staged world: a servo angle is the servo's, the screen is the
board's, and a sprite's position, image and brain are a pack's. The
summarizer is contributor-blind, carries each entry's provider for
attribution, and renders every value so that no value breaks a line of
the account.

### Events

Outputs are level or arrival, as inputs are. A channel is a level: the
display's pixels, a servo's angle, a sprite's position. An event is an
arrival: a number shown, a tone started, a serial line written, a radio
frame sent. Polled state cannot carry arrivals: two consecutive shows of
the same number read as one value, and a value shown and replaced inside
one step is never seen.

- A contributor declares its event kinds beside its channels and emits an
  event (name, value) itself at the moment it happens, through the same
  seam its state settles in.
- `ThinkObservation.events` carries `name=value` entries in emission
  order with composed names, beside `state`. An event emitted between
  steps belongs to the step it falls in. Several events of one kind in
  one step are all kept, in order.
- Expectations have two forms: a channel holds a value on every step of
  a window (level), and an event of a kind occurred in a window with a
  value (arrival). An imperative test API offers the same two forms, a
  wait over a channel and a handler over an event kind.
- The board's speaker is an event kind, `speaker.play`, with the sound's
  name as the value. Serial is an event kind of the board, one event per
  line. The display is a channel, and the text the board scrolls or
  prints is an event kind of its own, `display.show`, with the text shown
  as the value.

### Expectations and the watch list

The trace is complete: every state delta and every event of every step,
because it is the portable test's artifact and the replay oracle. What a
judge reads is a view over it, and the scenario says which view.

- `SimulationScenario.expectations` is a list of questions asked of the
  run. The level form names a channel, a rendered value and a window of
  steps `{from, to}`; it holds when the channel shows the value on every
  step of the window, the channel reconstructed step by step from the
  deltas, a channel absent from a step holding what it last showed, and a
  window the run does not reach is not satisfied. The point form is the
  window `{from: n, to: n}`. The arrival form names an event kind, a
  value and a window; it holds when an event of that kind with that value
  is emitted on some step of the window. Each form has a negated
  counterpart: the channel never shows the value on any step of the
  window, or no event of the kind with the value is emitted in it, so a
  test states that a wrong rule did not fire. Values are rendered
  strings; a contributor that wants a tolerant check declares a
  quantized channel, and no expectation carries a range.
- `SimulationScenario.watch` names the channels and event kinds the
  account renders. Unwatched contributors still settle and still drive
  the world; their entries stay in the trace and leave the account. A
  channel or event kind an expectation names is rendered whether or not
  the list names it, so a verdict never hides its evidence. With no watch
  list the account renders everything.
- The account the simulate tool returns reports each expectation's
  verdict first (held, or the steps it departed on and what the channel
  showed), then the change log over the watched entries, then the rest of
  the summary. The model asks "what did the display show on step 12" by
  stating an expectation or a watch, never by scanning the whole log.
- The kit owns one evaluator for every Wendoo consumer: the simulate
  tool and the backend's eval oracle, which states its state requirements
  in this shape. A target harness that evaluates scenarios of its own
  (pxt's does) implements the same semantics, and the adapter either maps
  its verdicts or re-evaluates the trace with the kit; conformance checks
  that both give the same verdicts for the same scenario.

## The run file

A run serializes to a JSON Lines file in the shape of the MakeCode
harness's trace (pxt `pxtsimcore/headless-harness.md`, "Trace format"),
so a run on any host is a replayable artifact and a run of the kit and a
trace of the harness for one scenario are compared as files. The keys are
the harness's: the step index rides under `frame` and the step period
under `framePeriod`.

- The header record: scenario name, seed, step period, versions, and the
  composed surface as inputs, channels and events, each an array of
  `[name, description]` pairs in composed order.
- One record per step: `frame`, `state` (the object form above), `events`
  (`[name, value]` pairs in emission order), and after them the brain's
  own record under `gates`, `dispatches`, `waiting`, `quiesced` and
  `pageSwitch`, each key present when the contract carries it on that
  step. The harness's own trace ends at `events`; a comparison of the two
  projects the kit's records onto the harness's keys.
- Serialization is canonical as the harness defines it: no whitespace
  outside strings, keys in this order, state keys in composed order, so
  re-serializing a parsed file reproduces it byte for byte.

The kit writes the file for the host that asks for it, and the simulate
tool returns the summary and writes none.

## The contract

The shared contract in the assistant bridge carries composition as
follows.

- `SimulationRequest.attachments`: the project's attachment records
  (component declaration coordinate, kind, role, config), the project's
  staging file by default. A component artifact travels here or is
  loaded host-side by coordinate.
- `TargetAdapter.scenarioSurface(staging)` returns the composed input
  kinds, state channels and event kinds for a staging (its boards,
  attachments and media), each entry carrying its structured fields and
  its provider, and the surface's digest. For an empty
  staging it returns the board's surface, which is what a target's baked
  declared-surface document records.
- The kit's `WorldDriver.contributors(staging)` returns the board
  contributor, one contributor per attachment in the staging, and the
  world's media; the kit composes, validates, routes, polls and collects.
- `ScenarioRejection` lists composed names.
- `WorldEventKind` has a name and a description; `ThinkObservation` has
  `events`, and its `state` is the object form with `null` for absent.
- `SimulationRun` serializes to the run file and parses from it.
- `SimulationScenario` has `expectations` (level and arrival forms over
  step windows) and `watch`; `SimulationRun` carries each expectation's
  verdict; the kit owns the evaluator.
- The vocabulary a client reports when a session opens is the composed
  surface for the project's current attachments, computed by the client
  from the adapter and refreshed when attachments change, each entry
  attributed to its provider.

## The assistant surface

The model reads three flat lists, kinds, channels and event kinds, each
entry a composed name, its structured fields (class and values for a
kind, rendering for a channel, values for an event) and a sentence, each
attributed to its provider ("the Cutebot library reports", "the board
feels", "the Arcade pack stages"), and each contributor's docs for how
its entries relate in time. Descriptions are API: everything the model
knows about an entry is its fields, its sentence and its contributor's
docs, so a rendering states exactly the string an expectation names and
a values spec bounds what an input may carry. A visual-only source is
listed nowhere
in the rehearsal surface; a library's assistant note may say the module
exists and is not rehearsable, so the model never claims what no run can
back. The assistant kernel is not edited for any of this; the surface is
a target-declared capability.

## Worlds with several programs

The world is the unit of a test. One program is the degenerate case. The
kit's world has this shape (participants, brains executed, a population)
because ecosim rehearses many brains in one world; the micro:bit world is
that construct at a population of one.

- N program hosts in lockstep on one virtual clock, each board's runtime
  advanced one step at a time in a fixed order by board id. How a target
  hosts N runtimes is the target harness's concern.
- Names gain the board's id as an outer name when a world has more than
  one program, as Composition states.
- The trace is per world and carries every board's record. The subject is
  optional: a rehearsal names one subject brain, a test observes all
  boards.
- The test stays a project plus a scenario. The project is one project
  deployed to several boards (the radio case) or a set of projects, one
  per board, named in the scenario.

## Media and topology

A medium is a contributor that lives at the world level and connects
boards and components, or models the space they share. A component
attaches to one or more typed media; the platform supplies the media a
target's own cores speak to (the radio ether, the Jacdac bus, the
display shield, a spatial world of positions alone), and a library ships
any other as a headless core, a physical world with obstacles, surfaces
and sources among them; media propagate in the order the staging lists
them, so a world listed before the ether feeds it per-link strength and
feeds each board's sensor kinds through its attachment's map; a medium
reads nothing about a board but the parameters its attachment carries; a
medium declares the quantities it applies and the params its staging
takes, a board kind a staged map targets is marked driven by that
medium and may not be scripted, and the assistant reads all of it from
the composed surface; the seam between a target's core and a medium is
a named contract
(radio, Jacdac, shield) the platform implements once and a library's
medium may implement instead, the radio contract fixing the link,
strength and drop names every implementation declares; attach and
detach are host-invoked operations; a group or address within a medium
is isolated from other instances of that medium.

- Media are explicit instances with ids. Two Jacdac buses are two media; a
  shield is one; a radio group is a parameter of the ether.
- Topology is scenario data. The staging declares the initial
  attachments: which board or component is on which medium, with the
  medium's parameters. Attach and detach are input kinds of the medium,
  their value the module's role, so a test can unplug a module at a step
  and check that its role reads as absent, or stage one unattached and
  plug it in at a step; the medium emits attached and detached events,
  and a device the harness spec's bus presents appears to the board's
  stack as a real one would. The project's staging file, as the harness
  spec defines it,
  is the default topology a scenario starts from and may override section
  by section.
- The same operations are an API in each target's live simulator; the
  contract's postMessage binding is derived from the contract, one
  message per operation, attach and detach included.
- The radio ether delivers frames between the boards attached to it at
  step boundaries in stable order and stamps each delivery with a signal
  strength, scripted through the board's `radio-signal-strength` level
  kind or derived from positions in the spatial world by a deterministic
  propagation model. Its model surface is the same on every target that
  has a radio: a link matrix (`ether.link <a>-<b>`, input kind and
  channel); a loss model (none, Bernoulli, Gilbert-Elliott) drawing from
  a random stream of the ether's own derived from the run seed and the
  medium's id; delay in whole steps with optional jitter and duplication;
  a drop event per link, `ether.drop <a>-<b>`, with the cause as the
  value; collisions as a switch; strength from distance by log-distance
  path loss with seeded shadowing and a reception curve. Nothing in it is
  real randomness.
- The spatial world owns positions: input kinds place a board or a
  component or move it along a path, and channels report positions as
  compound values under the Values rule.

## Recording a run

A run is recorded at the grain of the host seams, never as a log of
nondeterministic calls in call order. A call-ordered log reproduces an
unchanged program's run and fails for a changed one: a candidate brain
makes a different sequence of calls, the log misaligns, and values reach
the wrong calls. Rehearsal runs a changed brain, so the seam is the
grain.

- A recording is the run seed, the clock delta of each step, and the
  inputs at step grain in the `ScenarioInput` shape (kind, at, value),
  with the project and version record of a portable test. A captured clip
  or other bulk value is a file beside the scenario, named under the
  Values rule.
- Replay of the same program advances the virtual host by the recorded
  deltas, seeds the source with the recorded seed, applies the inputs at
  their steps, and reproduces the run exactly.
- Replay against a changed brain keeps the inputs and the seed and drops
  the clock deltas for the nominal step period. The world is the same;
  the behavior differs; that is what a rehearsal measures.
- Live-captured sensors (a microphone level, an accelerometer fed from
  device motion, recorded audio) are inputs like any other and read the
  scenario's values through `apply`.

A target's live simulator takes a seeded random source with the seed
chosen at run start and logged, and logs its step deltas, so a run a kid
saw replays exactly. The live run is explained from its trace, and a
human's inputs replay as a scenario.

## Hosts

Three hosts run contributors; the contract is the same in each.

micro:bit (wendoo-mcu). The board contributor is the device world's
percept table and channel table. Components attach through the device's
attach seam (I2C write listener, pin drive); jacdac modules attach over
the virtual bus as components with headless cores, the core found the
way the harness spec finds a module's. The radio ether's
model surface above is implemented in the device world.

ecosim (wendoo-lang). The board contributor is the world's percepts. It is
the proof that the shape is not device-shaped.

### The MakeCode target adapter

The adapter is the seam between the bridge contract and pxt's headless
test harness. It runs in the worker inside the simx, which is one of the
harness's shells, over the headless bundles the project runs on, with the
compiled program obtained from the editor over the editor-tab program
request.

- A think is a frame. `ScenarioInput.at` and expectation windows pass
  through as frame indices, the request's think count is the scenario's
  frame count, its seed is the scenario's seed, and the nominal step
  period is the target's frame period.
- Composed names pass through unchanged. The harness's board, module,
  program and medium contributors are this spec's board, component, pack
  and medium contributors, with the same ids, providers and order.
- `scenarioSurface(staging)` is the harness's composed surface for the
  staging, computed the way its shells compute it.
- The harness's trace is lifted into `ThinkObservation` record by
  record: a frame record's state object becomes `state` (a null an
  absent channel), its event pairs become `events`, and the header
  record's surface is the staging's `scenarioSurface`.
- The pack contributor is the Wendoo rehearsal harness inside the
  compiled program, registered with pxt's harness as a program
  contributor the way the harness spec defines: the declaration sent on
  the harness's registration channel from the program's start-up code
  under the key `wendoo`, inputs received on the key's inbox channel,
  state and events posted once per frame. Its `apply` stages the world
  (a sprite placed, a brain variable written), its `readState` renders
  the subject's channels the pack declares, and the same declaration
  rides the tile catalog as session data for the editor. The gate and dispatch records a brain's think produces are, from
  the harness's view, events of that program contributor; the adapter
  lifts them into `gates` and `dispatches`, and they appear in no other
  consumer's account.
- The subject is the brain the request names, running on the board the
  staging places it on; with several boards the subject is optional, as
  for every host.
- Expectations and the watch list are passed to the harness in its
  scenario shape and the harness's verdicts are mapped back; the kit's
  evaluator over the lifted trace must agree, and conformance checks that
  it does.
- A recording made by pxt's live simulator or its headless harness is a
  portable test the adapter replays unchanged.

## Conformance

- The component contract's acceptance fixture (one channel, one kind, one
  event kind, one tile) runs as a contributor through the kit's fake
  adapter, and again with two attachments of the same component under two
  roles, proving composed names and order.
- Same seed, same inputs, same steps give byte-identical observations in
  browser-headless and Node for each target.
- Every conformance script stays open-loop; stateful behavior in a script
  means a component has leaked in.
- The fixture emits one event per step it is poked; the suite checks the
  event is in the trace once, in emission order, never derived from a
  state diff.
- A recording of a run replays to a byte-identical trace in Node and in
  the browser-headless host.
- Two boards exchanging frames over the ether receive each other's frame
  at the same step offset, whichever board id is lower.
- The evaluator holds a point window, a negated level and a negated
  arrival; a watch list changes the account and leaves the trace
  byte-identical.
- Every frame a loss model removes is matched by one drop event on its
  link, and a bare link matrix emits none.
- The MakeCode adapter: for the same scenario, the harness's verdicts and
  the kit's evaluator over the lifted trace agree; a scenario run through
  `pxt simtest` and through the adapter yields the same trace at equal
  versions.
- A run file parses record by record and re-serializes byte for byte;
  the kit's file for a scenario, projected onto the harness's keys,
  equals the harness's trace of the same scenario at equal versions.
