---
title: Session management in pxt-wendoo
status: Accepted
# Active status:   Draft -> Review -> Accepted -> Committed -> In-Progress -> Shipped
# Terminal status: Rejected | Withdrawn | Superseded (set superseded-by)
created: 2026-09-25
updated: 2026-09-26
---

# Session Management in pxt-wendoo

How this repository's components integrate with the Wendoo bridge
session system. The mechanism itself -- the ontology, lifecycle,
version discipline, and the engine/application seam -- is specified
upstream in `external/wendoo-lang/docs/specs/session-management.md`;
that document is authoritative, and nothing here restates it. This
document describes the MakeCode lane's side of the contract.

## The kind: @wendoo/makecode-session

`packages/protocol` is the MakeCode lane's session SDK. It owns the
kind's whole identity, and nothing else in the repository declares
session wire surface:

- the kind name `makecode` and its message namespace (`makecode:*`);
- the wire messages: `makecode:hello` and `makecode:catalog`;
- `MAKECODE_SESSION_PROTOCOL_VERSION`, the version each endpoint
  declares;
- the role-path segments `makecode/editor` and `makecode/simx`,
  which endpoints pass to the role-generic client as their wsPath;
- `connectMakeCodeSession`, binding the upstream peer-session
  mechanism to the kind over any payload-capable port;
- `createMakeCodeEditorSession`, the editor role's session object
  (described below);
- `DEFAULT_MAKECODE_BRIDGE_URL`, the deployed bridge service's
  address as a bare host with an optional port and no scheme; the
  bridge client connects with `ws://` to a loopback host and
  `wss://` to any other.

Per the core placement rule, this package lives here -- with the
integration -- and never in the upstream core packages. Its kind
name must never collide with a reserved bridge namespace.

## Who plays which role

The four-hop path assigns the session parts as follows.

- `apps/editor` is the EDITOR role endpoint. It reaches the wire
  through the kind package's editor session object, which runs the
  app-role stack (`createAppBridge` with the editor role path) and
  binds `connectMakeCodeSession` over the payload surface. It joins
  a session by the join code the MakeCode side shows. It follows
  the editor-class obligations in the upstream spec: one session
  object with stable identity, status, and a state-change event
  surface; authoring continues while disconnected with changes
  pending locally and the status clearly indicated; continuity
  anchors on the binding token alone, never on session ids or join
  codes: the join code a person enters is presented only until the
  first welcome. It is the side that ENTERS codes and displays none
  (see the editor webapp, below).
- `makecode/simx/bridge` is the SIMX role endpoint and the session's
  hosting side and the side that DISPLAYS codes: it connects with no
  join code, so the relay mints the session's code for it, and it
  writes that code to the console and exposes it on its handle, again
  for every code the relay sends for the editor's vacant role; each
  welcome takes the code off its handle, since both roles are then
  bound. It is a channel, not a store: the
  one thing it carries across its reload is its binding token (next
  section). It receives catalogs on the sim-message channel,
  connects at the simx role path, opens or refreshes its
  connection-scoped handshake on every welcome, and publishes the
  current catalog into the session.
- `apps/bridge` is the relay service: an adapter plus a deployment
  identity over the upstream session engine,
  `@wendoo/bridge-session`, which holds every session rule. The
  service owns the WebSocket route surface (`/{kind}/{role}`, each
  connection handed to the engine through its adapter interface),
  its configuration (listen address, log level, binding secret),
  and its process lifecycle. It supplies the engine no frame
  handler, so through the engine it parses only the control
  envelope, forwards everything else byte-verbatim, and is
  kind-blind -- it contains no MakeCode knowledge, and adding
  session kinds or payload types never requires deploying it. The
  engine's own rate protection applies to every connection.
- The VM EXTENSION (`makecode/extensions/vm`) is NOT a session
  party. It participates through the sim-message channel only (the
  extension channel, below). It is MakeCode-target-agnostic and receives its channel
  identity from the host that calls it.

## Simx credential continuity

MakeCode tears the simx frame down and allocates a new one often,
so the frame's lifetime anchors nothing; the binding token is what
carries a session across frames.

- The simx saves the binding token of every welcome to the
  browser's `sessionStorage` and presents it in its first hello.
  It never stores the join code.
- `sessionStorage` lasts for one top-level browser tab: a frame
  reallocated in the same MakeCode tab rejoins its session, and a
  second MakeCode tab opened on its own never presents the first
  tab's token, so the two do not displace each other. A tab the
  browser duplicates starts with a copy of the original's storage,
  so its simx presents the same token and takes the session's simx
  role over from the original.
- RESPECTING AN END: when the relay reports `SESSION_ENDED`, the
  simx clears its stored token and logs the code, and holds until the
  simulator restarts; the restarted frame presents no token and forms
  a new session under a new code, never re-forming the ended binding.
  Every other coded failure is logged and holds the same way, the
  token kept.
- DEGRADATION RULE: where the browser denies the frame storage, the
  simx holds the token in memory and says so in the console. The
  session then lasts only as long as the frame: each teardown
  starts a new pairing under a new join code, which the editor must
  be given again.
- A relay restart heals by token when the relay keeps its binding
  secret (`BRIDGE_BINDING_SECRET`) across the restart: the simx and
  the editor each reconnect presenting their saved token, the relay
  re-forms the session under the same binding with a new session id
  and join code, and both are welcomed with no code entered; the
  first side back receives the new code, and the welcome takes it
  down again. A relay started without a configured
  secret signs with a new one at every start, so its restart ends
  every session: the simx's reconnect starts a new pairing under a
  new join code, which the editor must be given again.

## Join codes, refusal, and takeover in this lane

A join code is in service only while one of the session's two roles
is vacant, and the relay sends it to whichever side is connected:

- The simx never presents a code, so it forms each new session and
  receives the session's first code, which it shows. An editor
  entering that code fills the editor role, and the code leaves
  service at that moment. While both sides are connected, the
  session holds no code, and neither side shows one: the welcome
  carries the code just spent, and no display renders it.
- When a side drops -- routinely the simx, as MakeCode reallocates
  its frame -- the other side is told its counterpart is away and
  receives a freshly minted code, the only one that joins the
  session while the role is vacant. The simx's return by its token
  fills the role again and takes that code out of service. The editor
  receives the code minted when the simx drops but shows none: it
  names the simx's vacancy, which only the simx's token fills today.
  A code display returns to the editor when the game side gains code
  entry.
- A hello presenting a code that opens no vacant role -- a spent
  code, a stale one, a mistyped one, or the code of a session whose
  editor role is filled -- is refused with `JOIN_CODE_UNKNOWN`. So a
  second editor entering the code of a connected session is refused
  and the session is undisturbed: there is no replacement.
- The one takeover is by token. A MakeCode tab the browser duplicates
  presents the original's simx token, and editor tabs of one origin
  share the persisted editor token; the newer connection takes the
  role over, and the older one holds on `SESSION_REPLACED` until it
  is started again, which takes the session back.
- Reloads never end a session: the editor closing on `pagehide` and
  the simx disposing its frame both stop the connection, which the
  session survives. The one deliberate end in this lane is the
  editor's `forget()` over a live connection, which sends
  `session:goodbye`; the simx is then told `SESSION_ENDED`, clears its
  token, and holds until the simulator restarts. An operator end tells
  both sides, and each drops its token the same way. The simx never
  ends a session.

The engine rotates every code in service every ten minutes; the relay
service configures nothing about it. A rotation reaches the connected
side as a pushed code: the simx writes the new code to the console and
exposes it on its handle. Neither side presents a code it received, so
rotation never disturbs an established session. A person who read the
simx's code just before a rotation can still enter it for two minutes
afterward, and the editor joins. A
code that has left service is not minted for another session for five
minutes, so a person typing a code that has just gone stale never
lands in a stranger's session.

## Liveness in this lane

The engine closes a connection that sends nothing for a minute, into
the same path as any drop. Both sides keep their connections active
through the bridge client's heartbeat, so a live side never trips the
timeout; a simx frame torn down without a clean close is detected
within about a minute, and the editor is then told its counterpart is
away.

## The editor session object

`createMakeCodeEditorSession` returns the one object the editor's
product code listens to. Its identity is stable for the whole life
of the binding; the app bridges and makecode handshakes it runs
underneath are replaced as connections come and go, and nothing in
it keys on a session id.

- STATUS is `none` (no session: no binding token held and never
  welcomed), `connected` (welcomed, counterpart present), or
  `disconnected` (a binding token is held, but this side's
  connection is down or stopped, or the counterpart is away).
- ENTRY reports the progress of the code a person entered while a
  connection presents it and no welcome has come: `submitted` until
  the relay answers the hello, then `accepted` -- the code joined the
  editor role of a session whose other side is not connected yet.
  The welcome spends the code and clears the entry; a refusal clears
  it with `JOIN_CODE_UNKNOWN`. There is no timeout: a refusal is loud,
  and each wait is named on screen.
- The state also carries the code for the session's vacant role
  (every code the relay sends for it replaces the last; cleared at
  each welcome, never the entered code) and the stable code of the
  failure that ended the latest connection. Every change is published
  at once, with no debouncing.
- The session presents the join code it was created with on each
  connection until its first welcome, and its binding token alone
  from then on. A code the relay sends is never presented.
- Catalogs arrive as events from the current handshake only.
- The binding token is loaded and saved through caller-supplied
  hooks; the session holds no storage of its own.
- RECOVERY follows the upstream in-place rule.
  `OUTBOUND_QUEUE_OVERFLOW` is recovered automatically: the session
  reconnects at once with a fresh handshake, reporting the code
  until it is connected again (the discarded queue is not replayed;
  catalog currency re-establishes state). Every other code holds: no
  automatic reconnection. After `SESSION_REPLACED` (a re-bind of the
  same session elsewhere, by another editor holding the same token),
  `start()` reconnects presenting the binding token and takes the
  session back. After `JOIN_CODE_UNKNOWN` the entered code opened no
  vacant role, and the way back is entering a current code. After
  `SESSION_ENDED` the session respects the end as the simx does: it
  drops its binding token and clears the persisted one, returning the
  status to `none`, so the way back is entering the code the restarted
  simx shows and no reload re-forms the ended binding. The version
  codes hold and name their remedy -- update the outdated side, which
  for the editor means reloading it.
- The session's per-welcome handshake keys on the app bridge's
  welcome event (`AppBridge.onWelcome`).
- FORGET is the escape hatch the in-page rule requires. `forget()`
  over an open connection ends the session on purpose, so the simx is
  told `SESSION_ENDED`; with no open connection -- held, stopped, or
  reconnecting -- it is a local clear. Either way it drops the
  binding token and the join code, clears the token persisted through
  the caller's `clearBindingToken` hook, and returns the state to
  `none`. It is how an editor holding a token with no live way back
  -- a stale token and no code to enter -- returns to code entry in
  place.

## The editor webapp on this object

`apps/editor` consumes the session object through one store
(`EditorSessionStore`), and its two views follow the state:

- The CONNECT PAGE shows while the status is `none`: a join-code
  entry whose submission creates the session with the entered code
  and clears the entry. While the code is pending the page names the
  wait -- connecting while submitted, waiting for the game once
  accepted. A refused code (`JOIN_CODE_UNKNOWN`) shows a
  not-recognized notice above the cleared entry, and an ended session
  (`SESSION_ENDED`) returns here with an ended notice, the entry being
  the way to connect afresh. With a token persisted from an earlier
  page load, the app resumes the session on load and skips this page.
- The SESSION VIEW shows once a session exists: the catalog panel
  rendering the latest catalog, and no join code -- the only codes an
  editor receives are spent or name the simx's vacancy, which no
  person can enter yet. The catalog stays rendered while disconnected
  -- status gates delivery, never what is already shown -- and is
  dropped whenever no session exists.
- The DISCONNECTED GRACE: MakeCode reallocates the simulator frame
  routinely, so a brief disconnect is the common case. The
  disconnected indicator renders only once a disconnection outlasts
  `DISCONNECT_GRACE_MS` (a few seconds), and then offers `forget()`.
  The session object stays truthful; the grace lives in the
  editor's view-model only.
- RECOVERY AFFORDANCES: `SESSION_REPLACED` shows a held-state notice
  at once, with a reconnect action (`start()`) and a start-over
  action (`forget()`, back to the connect page). An overflow recovers
  automatically and surfaces only as transient status. A version
  rejection shows its remedy -- reload the editor -- the one ruled
  exception to in-page recovery. `JOIN_CODE_UNKNOWN` and
  `SESSION_ENDED` render their notices on the connect page. The
  start-over actions call `forget()`, which ends a session whose
  connection is live -- a counterpart away but this side connected --
  and clears locally otherwise.
- The binding token persists in `localStorage` through a small
  persistence module (load/save/clear/has) wired into the session's
  token hooks; the store owns nothing else durable.

## The extension channel

The extension-to-simx wire is pxt's sim-message channel, distinct
from and beneath the session:

- The channel name equals the simx's `approvedRepoLib` key
  (`wendoo-lang/pxt-wendoo`), supplied to the extension by its host
  -- the conformance driver in the harness, the game-facing arcade
  extension in product.
- Two packet kinds exist: a catalog emission (extension to simx,
  the framed catalog text described next) and a request (simx to extension, answered
  with a fresh serialization). The request/answer handshake exists
  because the first packet on a simx channel creates the simx frame
  and is lost to it; the simx requests once loaded.
- The channel framing carries the extension's declared version,
  because the extension is the most version-pinned party in the
  system and has no other declaration carrier. Each message from
  the extension is the channel version in decimal, a line feed,
  then the catalog payload, all UTF-8; the payload text is
  unchanged by the framing. The simx reads any version up to its
  own `SIM_CHANNEL_VERSION` and records it; a newer version, or a
  message with no version line, is rejected with a stable code
  (`SIM_CHANNEL_VERSION_NEWER`, `SIM_CHANNEL_FRAME_MALFORMED`)
  written to the console, and the simx drops its cached catalog so
  no older one outlives it. The simx's request carries no bytes.
  The conformance harness pins the extension's declared version to
  the simx's.
- CATALOG CURRENCY RULE: the extension is the sole authority for
  the current catalog. The simx's in-memory copy and the session's
  buffering are delivery conveniences; neither may outlive a
  fresher emission, and any doubt is resolved by requesting again.

## Trust boundaries, as they touch sessions

Session traffic is program-reported and carries no trust. Provenance
(which extension is installed, by coordinate) is host-attested via
the simx's host-bound channel; assistant-content gating happens at
the point of use against the editor's approved-extensions
configuration. Nothing in the session or the relay participates in
those decisions.

## Local development

The full stack runs locally, with no configuration surface: a page
served from a loopback host connects to the local relay at
`localhost:6465` (the relay's default dev port; the vscode-bridge
relay's is 6464, so both Wendoo relays can run on one dev machine)
instead of the deployed service. The rule lives in each composition
root (`apps/editor/src/main.tsx`, `makecode/simx/bridge/src/main.ts`);
a deployed build, served from a real host, uses the deployed
service.

- The relay: `npm run dev` in `apps/bridge` (port 6465). Set
  `BRIDGE_BINDING_SECRET` to keep sessions healing across relay
  restarts; without it, every restart ends every session.
- The simx: `npm run dev` in `makecode/simx/bridge` (port 5173).
- The editor: `npm run dev` in `apps/editor`.
- MakeCode: `pxt serve` from a dev target checkout, with the simx
  registered by localdev URL (an `approvedRepoLib` entry carrying
  `devUrl`) and loaded via the `simxdev` URL parameter.

The dated all-local run-through in `generated-docs/` records the
exact invocations. The harness exercises the extension's emission
headlessly on both provisioned targets, and the composed acceptance
tier drives the editor's service layer and the simx module against
the engine's in-process testkit, `@wendoo/bridge-session/testing`
(`apps/editor/src/services/editor-session-store-relay.spec.ts`). The
relay service's own suite runs the testkit over the service's own
server (`startTestRelay({ server: startRelayServer })`).
