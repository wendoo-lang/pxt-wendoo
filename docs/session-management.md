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
  first welcome; the displayed join code live-updates, because codes
  rotate.
- `makecode/simx/bridge` is the SIMX role endpoint and the session's
  hosting side: it connects with no join code, so the relay mints
  the session's code for it, and it writes that code to the console
  and exposes it on its handle. It is a channel, not a store: the
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
  and its process lifecycle. Through the engine it parses only the
  control envelope, forwards everything else byte-verbatim, and is
  kind-blind -- it contains no MakeCode knowledge, and adding
  session kinds or payload types never requires deploying it.
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
- DEGRADATION RULE: where the browser denies the frame storage, the
  simx holds the token in memory and says so in the console. The
  session then lasts only as long as the frame: each teardown
  starts a new pairing under a new join code, which the editor must
  be given again.
- A relay restart heals by token when the relay keeps its binding
  secret (`BRIDGE_BINDING_SECRET`) across the restart: the simx and
  the editor each reconnect presenting their saved token, the relay
  re-forms the session under the same binding with a new session id
  and join code, and both are welcomed with no code entered. The
  simx writes the new code to the console and the editor's
  displayed code updates. A relay started without a configured
  secret signs with a new one at every start, so its restart ends
  every session: the simx's reconnect starts a new pairing under a
  new join code, which the editor must be given again.

## Replacement in this lane

The simx never presents a join code, so a replacement here is a
second editor entering the code while the editor role is occupied.
The first editor is displaced and holds (`SESSION_REPLACED`). The
simx is migrated to the new editor on its open connection: it saves
the fresh binding token of the migrating welcome and opens a new
handshake, publishing the current catalog into it. The displaced
editor's token names the ended session, so its way back is a person
entering the join code again.

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
- The state also carries the join code to show (every code the
  relay sends replaces the last) and the stable code of the failure
  that ended the latest connection. Every change is published at
  once, with no debouncing.
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
  catalog currency re-establishes state). `SESSION_REPLACED` holds:
  no automatic reconnection. `start()` reconnects presenting the
  binding token: after a re-bind of the same session elsewhere
  (another editor holding the same token) that takes the session
  back; after a replacement the token names the ended session and
  never reaches the successor, and the way back is a person entering
  the join code. The version codes hold and name their remedy -- update
  the outdated side, which for the editor means reloading it.
- FORGET is the escape hatch the in-page rule requires. `forget()`
  closes the connection, drops the binding token and the join code,
  clears the token persisted through the caller's `clearBindingToken`
  hook, and returns the state to `none`. It is how an editor holding
  a token with no live way back -- a stale token and no code to
  enter -- returns to code entry in place.

## The editor webapp on this object

`apps/editor` consumes the session object through one store
(`EditorSessionStore`), and its two views follow the state:

- The CONNECT PAGE shows while the status is `none`: a join-code
  entry whose submission creates the session with the entered code.
  With a token persisted from an earlier page load, the app resumes
  the session on load and skips this page.
- The SESSION VIEW shows once a session exists: the join code with
  a copy affordance, live-updating as the relay pushes newer codes,
  and the catalog panel rendering the latest catalog. The catalog
  stays rendered while disconnected -- status gates delivery, never
  what is already shown.
- The DISCONNECTED GRACE: MakeCode reallocates the simulator frame
  routinely, so a brief disconnect is the common case. The
  disconnected indicator renders only once a disconnection outlasts
  `DISCONNECT_GRACE_MS` (a few seconds), and then offers `forget()`.
  The session object stays truthful; the grace lives in the
  editor's view-model only.
- RECOVERY AFFORDANCES leave no dead ends: `SESSION_REPLACED` shows
  a held-state notice at once, with a reconnect action (`start()`)
  and a start-over action (`forget()`, back to the connect page).
  An overflow recovers automatically and surfaces only as transient
  status. A version rejection shows its remedy -- reload the editor
  -- the one ruled exception to in-page recovery.
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
(`apps/editor/src/services/editor-session-store-relay.spec.ts`).
