---
title: Session management in pxt-wendoo
status: Accepted
# Active status:   Draft -> Review -> Accepted -> Committed -> In-Progress -> Shipped
# Terminal status: Rejected | Withdrawn | Superseded (set superseded-by)
created: 2026-09-25
updated: 2026-09-25
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
  mechanism to the kind over any payload-capable port.

Per the core placement rule, this package lives here -- with the
integration -- and never in the upstream core packages. Its kind
name must never collide with a reserved bridge namespace.

## Who plays which role

The four-hop path assigns the session parts as follows.

- `apps/editor` is the EDITOR role endpoint. It reaches the wire
  through the app-role stack (`createAppBridge` with the editor
  role path) and binds `connectMakeCodeSession` over the payload
  surface. It follows the editor-class obligations in the upstream
  spec: one session object with stable identity, status, and a
  state-change event surface; authoring continues while
  disconnected with changes pending locally and the status clearly
  indicated; continuity anchors on the binding token and join code,
  never on session ids; the displayed join code live-updates,
  because codes rotate.
- `makecode/simx/bridge` is the SIMX role endpoint. It is a channel,
  not a store: it holds no state that must survive its reload. It
  receives catalogs on the sim-message channel, connects at the
  simx role path, opens or refreshes its connection-scoped
  handshake on every welcome, and publishes the current catalog
  into the session.
- `apps/bridge` is the relay: the engine's opaque adapter plus a
  deployment. It parses only the control envelope, forwards
  everything else byte-verbatim, and is kind-blind -- it contains no
  MakeCode knowledge, and adding session kinds or payload types
  never requires deploying it.
- The VM EXTENSION (`makecode/extensions/vm`) is NOT a session
  party. It participates through the sim-message channel only (next
  section). It is MakeCode-target-agnostic and receives its channel
  identity from the host that calls it.

## The extension channel

The extension-to-simx wire is pxt's sim-message channel, distinct
from and beneath the session:

- The channel name equals the simx's `approvedRepoLib` key
  (`wendoo-lang/pxt-wendoo`), supplied to the extension by its host
  -- the conformance driver in the harness, the game-facing arcade
  extension in product.
- Two packet kinds exist: a catalog emission (extension to simx,
  UTF-8 catalog text) and a request (simx to extension, answered
  with a fresh serialization). The request/answer handshake exists
  because the first packet on a simx channel creates the simx frame
  and is lost to it; the simx requests once loaded.
- The channel framing carries the extension's declared version
  [scheduled; ship-blocking], because the extension is the most
  version-pinned party in the system and has no other declaration
  carrier.
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

The full stack runs locally: MakeCode served from a dev target fork
with the simx registered by localdev URL and loaded via the
`simxdev` parameter, the relay and editor on their dev servers. The
harness exercises the extension's emission headlessly on both
provisioned targets; the composed integration tiers and the live
run-through are described in the workstream's P2b notes.
