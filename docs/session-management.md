---
title: Session management in pxt-wendoo
status: Accepted
# Active status:   Draft -> Review -> Accepted -> Committed -> In-Progress -> Shipped
# Terminal status: Rejected | Withdrawn | Superseded (set superseded-by)
created: 2026-09-25
updated: 2026-10-01
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
- the wire messages: `makecode:hello`, `makecode:catalog`, the
  `makecode:brains*` payload family (see "The brains payload family",
  below), and the `makecode:manifest*` payload family (see "The manifest
  payload family", below);
- the hello's declaration, `MakeCodeSessionDeclaration` (see "The
  target declaration", below);
- `MAKECODE_SESSION_PROTOCOL_VERSION`, the version each endpoint
  declares;
- the role-path segments `makecode/editor` and `makecode/simx`,
  which endpoints pass to the role-generic client as their wsPath;
- `connectMakeCodeSession`, binding the upstream peer-session
  mechanism to the kind over any payload-capable port, whose session
  both requests brains (`listBrains`, `pullBrains`, `pushBrain`) and the
  id manifest (`readManifest`, `writeManifest`) and serves them
  (`onBrainsRequest`, `onManifestRequest`);
- `createMakeCodeEditorSession`, the editor role's session object
  (described below);
- the id manifest's shape, `MakeCodeIdManifest` (see "The manifest
  payload family", below);
- the brain contracts both sides of the family must agree on:
  `brainSourceHash` (32-bit FNV-1a over UTF-16 code units, eight
  lowercase hex digits) and the device profile compiled brains carry
  (see "Device profiles", below);
- `DEFAULT_MAKECODE_BRIDGE_URL`, the deployed bridge service's
  address as a bare host with an optional port and no scheme; the
  bridge client connects with `ws://` to a loopback host and
  `wss://` to any other.

Per the core placement rule, this package lives here -- with the
integration -- and never in the upstream core packages. Its kind
name must never collide with a reserved bridge namespace.

## Device profiles

Every compiled brain's envelope carries a numeric device-profile id:
the computational world the brain was compiled for. The upstream
format specifies the field; each platform declares its own ids, and
this lane's declaration is `MakeCodeDeviceProfileNumericId` in
`packages/protocol`, a frozen map from world name to id:

| World     | Id   | Meaning                                                          |
| --------- | ---- | ---------------------------------------------------------------- |
| `sts-f64` | 2001 | the static TypeScript VM, 64-bit floating point, on every target |

- The map is keyed by WORLD, not by MakeCode target: the VM is
  target-agnostic and computes in 64-bit floating point on every
  MakeCode target, so every target shares the one world.
- `MAKECODE_VM_PROFILE_ID` is the `sts-f64` id; the editor stamps it
  into every brain it compiles.
- The map is append-only: an entry is never renumbered, and a removed
  entry's id is never reused.

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
  bound. Its frame renders a minimal session-status panel (see "The
  simx status panel", below), which shows the code while the simx
  holds no binding. It is a channel, not a store: the
  one thing it carries across its reload is its binding token (next
  section). It receives catalogs on the sim-message channel,
  connects at the simx role path, opens or refreshes its
  connection-scoped handshake on every welcome, publishes the
  current catalog into the session, and answers the editor's brains
  and manifest requests from the project's files (see "The simx write
  path" and "The id manifest", below).
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
  extension channel, below). It is MakeCode-target-agnostic and holds
  its channel identity itself; no caller of its API supplies or sees
  it.

## The target declaration

The editor is target-blind, so the MakeCode target reaches it as
session data, declared when the kind's handshake binds:

- pxt passes the running target's id (`pxt.appTarget.id`, for
  example `microbit` or `arcade`) to every simx frame in its URL's
  `target` parameter, beside `channel` and `parentOrigin`.
- The simx reads the parameter at boot and declares it in each
  makecode hello it sends, as the declaration's `target`. A frame
  URL without the parameter declares nothing; the hello then
  carries its version alone.
- The editor's hello never carries a declaration. The editor session
  records the target of each completed handshake, keeps it while
  the session is disconnected, and drops it with the binding; the
  editor's session store exposes it as `target`, `undefined` when
  unknown.
- The value is informational, for display and theming. It is the
  sender's own claim: identity and trust come from the session's
  credentials, never from it.
- The editor presents it through its per-target record
  (`TARGET_THEMES` in `apps/editor/src/services/target-theme.ts`),
  which maps a target id to a display name and theme token
  overrides. An undeclared target, or a declared value that is not a
  non-empty string, shows the Wendoo logotype alone in the default
  theme; an id the record does not know shows raw, in the default
  theme.

## The brains payload family

Brains travel between the editor and the party serving the MakeCode
project as a request-reply family under the kind's namespace. Payload
kinds carry no versions of their own: the family is additive under
`MAKECODE_SESSION_PROTOCOL_VERSION`, and every party ignores a
`makecode:*` type it does not know (the kind's session object routes
catalogs to catalog listeners and replies to their requests, and drops
everything else).

- REQUEST-REPLY: every request carries an envelope `id`, and its reply
  carries the same `id`. This is the envelope correlation the relay
  engine already honors (a forwarded message carrying an `id` has the
  peer's next message carrying it relayed back as its reply) and the
  folder-session protocol's `folder:ack` / `folder:error` shape. The
  requesting session mints ids with a random per-session prefix, so a
  late reply to an earlier handshake's request on the same connection
  never matches a later request. A request settles on its reply, or
  rejects with `MAKECODE_BRAINS_CLOSED` when its handshake ends; there
  is no timeout, and a peer that never answers leaves requests pending
  until the handshake ends.
- `makecode:brainsList` (editor -> project): answered by
  `makecode:brainsListReply` carrying `{ brains: [{ id, name,
  sourceHash, compiledSourceHash? }] }` -- every brain the project
  holds, `sourceHash` being `brainSourceHash` of the source text as the
  project holds it now. `compiledSourceHash` reports the project's
  compiled form of the brain in three states: a STRING is the source
  hash the brain's current registration carries (equal to `sourceHash`
  exactly when the compiled form was compiled from the current source);
  `null` means the serving party read the project and found no current
  registration of the brain -- no entry, an unreadable entry, or no
  readable compiled-form file -- which a push of the brain restores;
  ABSENT means the serving party does not report it (it predates the
  field, or cannot read the compiled-form file's format), and the
  editor draws no conclusion from it. The absent state is what keeps an
  editor from pushing forever at a peer that can never report a
  current registration.
- `makecode:brainsPull` (editor -> project) with `{ ids }`: answered by
  `makecode:brainsPullReply` carrying `{ brains: [{ id, name, source,
  compiled?: { bytecode, sourceHash } }] }` in request order; an id the
  project does not hold has no entry.
- `makecode:brainsPush` (editor -> project) with `{ op: "write", brain }`
  (the pull entry's shape; a write replaces both forms) or `{ op:
  "remove", brainId }`: answered by `makecode:brainsAck` once applied.
- `makecode:brainsError` answers any request that failed, carrying `{
  code, message }`: `MAKECODE_BRAINS_READ_FAILED` for a list or pull,
  `MAKECODE_BRAINS_WRITE_FAILED` for a push.
- An entry's `id` is the brain's ADDRESS -- the document id its source
  file is keyed by -- which the serving party takes from the file name,
  never from the source; `source` is carried verbatim whether or not it
  is a valid brain document; `compiled.sourceHash` is the hash of the
  source the program was compiled from, the hash the compiled form
  embeds.
- BINARY ENCODING: `compiled.bytecode` is base64 text, the platform's
  wire norm for bytes (`FileContentPayload`'s `encoding: "base64"` in
  `@wendoo/bridge-protocol`), encoded and decoded with
  `@wendoo/service-api`'s `bytesToBase64` / `base64ToBytes`. The kind's
  API takes and returns bytes; only the wire carries text.
- The editor session object hands out a BRAINS CHANNEL per completed
  makecode handshake (`onBrainsChannel`); its requests travel on that
  handshake and reject once it ends, and every later handshake -- a
  reconnection, the counterpart returning, or a further welcome on an
  open connection -- hands out a new one.
- Only the editor requests; the party serving the project answers.
  The kind's session hands each incoming request to its
  `onBrainsRequest` listeners (buffered until the first attaches) as a
  `list`, `pull`, or `push` request carrying the senders of its answer:
  `reply` for a list or a pull, `ack` for a push, and `fail(message)`,
  which answers `MAKECODE_BRAINS_READ_FAILED` for a list or a pull and
  `MAKECODE_BRAINS_WRITE_FAILED` for a push. A request is answered once;
  a later answer, or any answer after the session is disposed, is not
  sent. The simx serves them from the project (see "The simx write
  path", below).

## The manifest payload family

The editor allocates the ids the MakeCode project's packs' vocabulary is
compiled and bound under -- host-action ids for tiles, host-function ids
for operators, type-atom and field ids for struct types -- and the project
keeps them in its id manifest (see "The id manifest", below). The manifest
travels as a request-reply family under the kind's namespace, on the same
discipline as the brains family: every request carries an envelope `id`
its reply carries back, ids are minted with the session's random prefix,
there is no timeout, and a request rejects with `MAKECODE_MANIFEST_CLOSED`
when its handshake ends. The editor session object's brains channel
carries the manifest requests beside the brains requests.

- `makecode:manifestRead` (editor -> project): answered by
  `makecode:manifestReadReply` carrying `{ manifest, problem? }` -- the
  entries the project's manifest holds, `null` when the project holds none,
  and the coded problem the serving party found reading it:
  `MAKECODE_MANIFEST_UNREADABLE` (no format it reads; `manifest` is
  `null`), `MAKECODE_MANIFEST_FORMAT_NEWER` (written by a newer simx;
  `manifest` is `null`), or `MAKECODE_MANIFEST_ENTRY_MALFORMED` (part of it
  damaged; `manifest` holds the rest).
- `makecode:manifestWrite` (editor -> project) with `{ manifest }`, the
  editor's WHOLE allocation, which replaces the project's: answered by
  `makecode:manifestAck` once written.
- `makecode:manifestError` answers any request that failed, carrying `{
  code, message }`: `MAKECODE_MANIFEST_READ_FAILED` for a read,
  `MAKECODE_MANIFEST_WRITE_FAILED` for a write.
- THE MANIFEST: `{ actions, operators, types, next }`. `actions` and
  `operators` are `{ name, id }` entries; `types` are `{ name, atom, fields
  }`, a field's id being its position in `fields`, which only grows; `next`
  holds the next id of each space, `{ action, operator, atom }`, above every
  id the space ever handed out. Entries are append-only and in allocation
  order.
- VERSIONING: the family is additive under
  `MAKECODE_SESSION_PROTOCOL_VERSION` 1. Every party ignores a `makecode:*`
  type it does not know, and no producer speaking version 1 without the
  family was ever deployed, so no peer exists that receives a manifest
  request it cannot answer.
- Only the editor requests; the party serving the project answers, through
  `onManifestRequest` (buffered until the first listener attaches), with
  `reply` or `fail` for a read and `ack` or `fail` for a write, each
  request answered once.

## The simx write path

The simx answers the brains family from the MakeCode project's files,
through MakeCode's project-file messages (projfs). It holds no brains
of its own: every answer is read from the project when the request
arrives, and every push is written to it, so a simx started afresh
serves exactly what the last one wrote.

- SCOPE: projfs lets a simx see and change only the folder named by
  the key its frame was created for (`wendoo-lang/pxt-wendoo/`), by
  names relative to that folder, and only the files `pxt.json` lists;
  a write lists its file. The client is pxt's own
  `pxtservices/projfs.ts`, vendored byte-for-byte as
  `makecode/simx/bridge/src/vendor/projfs.ts`; the sibling
  `PROVENANCE` file records the exact source (the pxt commit, or the
  file's blob until that commit lands), and the vendored
  file is kept out of this repo's lint and formatting so a re-vendor
  is a plain copy. Its frame-parameter helpers (`getSimxChannel`, `getTargetId`,
  `getProjectId`) are how the simx reads its frame URL.
- SOURCE FORM: `brains/<documentId>.src.json` holds the brain document
  exactly as pushed (the editor's two-space pretty print). A list names
  each such file by its id, with the document's `name`, the
  `brainSourceHash` of the file's text, and as `compiledSourceHash` the
  source hash `brains.g.ts` registers the brain under -- `null` when the
  module is missing or unreadable or holds no readable entry for the
  brain, and left out while the module is of a newer format (see
  below); a pull returns the text verbatim. A text that is not a readable brain document is still
  listed and pulled -- the editor's corruption handling takes it from
  there -- and is named from its registration, else empty.
- COMPILED FORM: `brains.g.ts`, at the folder root, is ONE generated
  module declaring every brain's compiled form, which the project
  compiles with the rest of its code. After two comment lines it
  declares `// wendoo-brains-format 1`, then a blank line, then the
  namespace `wendooPrograms` carrying one entry per brain, ordered by
  id and separated by blank lines:

  ```ts
  namespace wendooPrograms {
      // source-hash 1a2b3c4d
      //% fixedInstance block="Chaser"
      export const p_abcdabcdabcdabcd = wendoo.registerCompiledBrain("abcdabcdabcdabcd", "Chaser", hex`
          000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f
      `);
  }
  ```

  Each entry is a fixed instance of the VM extension's compiled-brain
  type: a block parameter of that type lists every entry in its
  dropdown, labelled by the `block` attribute, and binds the entry's
  declaration, named for the brain's document id -- so two brains
  sharing a name are two entries, each bound to its own id. The label
  is the brain's name, or its id when the name is empty. The
  declaration is `p_` followed by the id, each character of the id
  outside `[A-Za-z0-9]` written as `_` and four hex digits of its code
  unit. The id and name are JSON string literals with every character
  outside printable ASCII escaped; the label is the same literal with
  each `"` escaped as `\u0022`, the only form pxt's attribute grammar
  reads. The program follows as lowercase hex, 32 bytes a line (pxt's
  `hex` literal skips whitespace). The `source-hash` line binds the
  program to the source it was compiled from. `writeBrainsModule` and
  `readBrainsModule` (`makecode/simx/bridge/src/brains-module.ts`) are
  a writer and reader pair: the same entries always write the same
  text, which reads back to them, and an entry whose label or
  declaration name is not the one its id and name make reads as
  damaged. The VM extension's registration selftest compiles the
  module's generated form in real Arcade and micro:bit projects, from
  the folder path a project holds it at, with programs the editor
  compiled from the brain sources checked in beside it.
- READING A DAMAGED MODULE: the reader never throws. A module
  declaring no format reads as registering nothing
  (`BRAINS_MODULE_UNREADABLE`); one entry that does not follow the
  format is skipped (`BRAINS_MODULE_ENTRY_MALFORMED`) and the rest are
  read; a module declaring a newer format (`BRAINS_MODULE_FORMAT_NEWER`)
  reads as registering nothing and is never rewritten -- pushes fail
  while it stands. Each problem is written to the console by its code;
  a list reports the affected brains' `compiledSourceHash` as `null`
  (left out for a newer-format module, whose registrations this simx
  cannot read and must not replace), and a pull serves them without
  compiled forms, which the editor's staleness rule recompiles and
  pushes.
- PUSH: a push writes (or, for `remove`, deletes) the brain's source
  file and regenerates `brains.g.ts` from the registrations it holds for
  brains whose source file exists, with the push applied: a write
  carrying a compiled form registers it, one carrying none drops the
  registration, and a removal drops it. Deleting a source the project
  does not hold counts as done. Every write and delete is an ARTIFACT
  (never `dirty`), so a brain save never restarts the running program;
  a written file open in MakeCode's text editor reloads to show it,
  replacing typing not yet saved from it, and the write is answered
  once the editor shows it, so no later save of the editor's older
  text can land over an acknowledged push.
- COALESCING: pushes queue and apply in drains. A drain reads the
  project, then takes every push queued by then -- the latest push of
  each brain, when a brain was pushed more than once, all of its
  requests answered together -- writes `brains.g.ts` once (skipped when
  its text would not change), then each brain's source file. A burst of
  pushes, such as a reconnection's flush, costs one module write plus
  one write per brain against projfs's rate of 30 writes and deletes
  per 10 seconds, over which MakeCode holds the writes and applies them
  as the window allows; pushes arriving while a drain writes join the
  next.
- LIVE UPDATE: a push also reaches the running game at once, apart from
  the drain. The moment a push arrives, before it joins a drain, the simx
  posts a program update to the running program over the extension
  channel (see "The extension channel"): a write carrying a compiled form
  whose source hash differs from the last update the simx posted for that
  brain posts that compiled form; a write carrying the compiled form it
  posted last (a source edit that does not compile pushes the last good
  compiled form beside it) or carrying none posts nothing; a removal
  posts an update carrying no program. The post never waits on projfs:
  the game takes a save at the channel's speed while the project write
  trails at the drain's pace, the same bytes at two speeds. The simx
  keeps the last update it posted for each brain and posts them all again
  at every program start (the extension's ping), so a game restarted
  before a drain landed still runs the latest save. In the program, the
  channel handler only queues an update; the next program host drain
  applies it to the compiled-brain registration of its document id,
  through the loader's checks as at cold start, plus one: an update
  referencing a host-function, host-action, or type-atom id the id
  manifest did not hold when the run started is refused with
  `WENDOO_PROGRAM_UPDATE_UNMAPPED_ID`, and the next restart binds it. A
  refused update leaves the registration and its programs running as they
  were (`wendoo program-update-rejected <code> <id>`); an update carrying
  the program the registration holds, or for an id no registration holds
  (a brain authored after the run started, which no game code names yet),
  changes nothing. An accepted update replaces the registration's program
  (`wendoo program-updated <id> <source-hash>`), and a removal replaces it
  with the empty program (`wendoo program-removed <id>`); at its next
  drain, each program host restarts every actor running that registration
  on the same actor -- the old instance dropped, the new one starting from
  its first page -- so a scene paused under another takes the update when
  it resumes, and every later spawn runs the new program.
- MAKECODE'S ANSWERS: MakeCode answers every projfs request once,
  after it has applied or been refused, and applies one simulator
  extension's requests in the order they arrive. Rate pressure defers:
  a write or delete over the rate waits, with the requests behind it,
  until the window allows it, so a drain of any size lands whole.
  Refusals are known-permanent and coded: `QUOTA_EXCEEDED` (the folder
  would pass 512 KiB), `INVALID_NAME`, `INVALID_REQUEST`,
  `PROJECT_CLOSED` (the project open when the request arrived has
  closed -- a request never applies to a project opened after it
  arrived), `UNREGISTERED` (MakeCode does not serve the requesting
  frame), `RATE_LIMITED` (a flood of more than 1000 writes and deletes
  waiting for answers, which a drain never reaches), and `FAILED` (an
  error applying the request, which a repeat completes). The client
  waits for every answer however long it takes and only notes a slow
  one in the console; when the frame is torn down, its pending
  requests end with `DISPOSED`, their outcome unknown, and recovery
  falls to the editor's pend and the next handshake.
- ACKS AND REFUSALS: a push is acknowledged once its source file has
  landed after its drain's module write, so an acknowledged push is in
  the project in both forms; a push fails only on a refusal, never on
  a slow answer. A refused write fails the pushes it carried with
  `MAKECODE_BRAINS_WRITE_FAILED`, the projfs code leading the message
  (`QUOTA_EXCEEDED: ...`, `PROJECT_CLOSED: ...`); a refused module
  write fails every push of its drain and writes no source. The
  editor keeps a failed push pending and retries it over the same
  handshake, and the next reconciled handshake pushes it too (see
  "Brain sync", below). A list or a pull the project cannot serve fails
  with `MAKECODE_BRAINS_READ_FAILED` and the projfs code likewise.
- VISIBILITY: both forms are ordinary project files. They appear in
  MakeCode's Explorer -- shown in the JavaScript and Python views, not
  in Blocks -- grouped under `wendoo-lang/pxt-wendoo` and
  `wendoo-lang/pxt-wendoo/brains`, each with a delete action, and
  they travel with the project wherever its files go.
- DETECTING HAND EDITS: the editor compares hashes when a handshake
  reconciles, so a source edited in MakeCode, and a `brains.g.ts`
  edited, damaged, or deleted there, is healed at the next handshake
  (an editor reload or a reconnection); a simulator restart that keeps
  the simx frame opens no new handshake.

## The id manifest

The project's id manifest is `ids.g.ts`, at the simx folder's root beside
`brains.g.ts`: projfs confines every simx write to that folder, so the
file needs no prefix of its own to mark it the simx's. It is ONE generated
module the project compiles with the rest of its code. After two comment
lines it declares `// wendoo-ids-format 1`, then the watermarks as `//
next-ids action <n> operator <n> atom <n>`, then a blank line, then the
namespace `wendooIds` carrying one call per allocation, in allocation
order:

```ts
namespace wendooIds {
    wendoo.mapActionId("actuator.chime.ring", 1024);
    wendoo.mapOperatorId("beacon.combine", 1024);
    wendoo.mapTypeIds("Beacon", 1024, ["y", "retired", "x"]);
}
```

- SCOPE: the manifest allocates for HOST-REGISTERED pack vocabulary only
  -- the tiles, operators and struct types a pack registers through the VM
  extension's registration surface. Struct types a Wendoo-TS program
  declares are program-local: they carry no type atom and their fields'
  ids travel in the program's own type table, so the manifest never holds
  them.
- ALLOCATION: the editor is the single allocator. At every handshake it
  reads the manifest, adopts what it holds over its own allocation (the
  project's entries win; its own other entries stay where their ids are
  free), allocates every name the session catalog declares beyond them --
  first sight allocates, in catalog order, above each space's watermark --
  and writes the whole allocation whenever it differs from what the
  project holds; a catalog arriving with new vocabulary mid-session is
  allocated and written the same way. Nothing ever renumbers: a name the
  catalog stops declaring keeps its id, which is never handed out again; a
  rename is a new name. A struct type's layout is the manifest's -- each
  field's id is its position in the type's field list -- so a pack
  reordering its fields changes nothing, a new field appends, and a removed
  field keeps its id.
- WRITE: a write replaces `ids.g.ts`, skipped when its text would not
  change, as an ARTIFACT (never `dirty`); a refused write fails with
  `MAKECODE_MANIFEST_WRITE_FAILED`, the projfs code leading the message,
  and the editor retries it after each of `PUSH_RETRY_DELAYS_MS`, then at
  the last delay, while its handshake stays connected. A manifest of a newer
  format is never rewritten: writes fail with its code leading the message,
  and the editor binds no pack while it stands.
- READING A DAMAGED MANIFEST: the reader never throws. A file declaring no
  format reads as no manifest (`MAKECODE_MANIFEST_UNREADABLE`); an
  allocation line that does not follow the format, a second line naming
  one registration, or a damaged watermark line is skipped
  (`MAKECODE_MANIFEST_ENTRY_MALFORMED`) and the rest is read. Each problem
  is written to the console by its code, and the editor's next write --
  made at once, since the allocation it adopted differs from what the
  project holds -- replaces the damaged file from the editor's allocation.
  A file hand-edited while a handshake stays open is healed at the next
  handshake.
- THE PROGRAM: `writeIdsModule` and `readIdsModule`
  (`makecode/simx/bridge/src/ids-module.ts`) are a writer and reader pair.
  The VM extension's registration selftest compiles the module's generated
  form in real Arcade and micro:bit projects, the allocation it declares
  made by the editor's allocator from the selftest's catalog. In the
  program, the module's calls record each id before any code runs a
  program; the first drain of any program host drains every pack's
  registrations through the manifest once, for every host of the run, and
  logs each registration problem as `wendoo <code> <name> <pack>` -- a
  registration the manifest allocates no id for
  (`registration-unmapped-name`) is left unbound and the rest of the game
  runs. A program addressing a struct field its type no longer declares
  reads nil, and the host logs `wendoo field-undeclared <typeId>
  <fieldId>` once.

## Simx credential continuity

MakeCode tears the simx frame down and allocates a new one often,
so the frame's lifetime anchors nothing; the binding token is what
carries a session across frames.

- The simx saves the binding token of every welcome to the
  browser's `localStorage` and presents it in its first hello.
  It never stores the join code.
- PER-PROJECT KEYING: MakeCode passes the open project's id to every
  simx frame in its URL's `project` parameter, and the simx stores its
  token under a key naming that project
  (`wendoo-simx-bridge:bindingToken:<projectId>`). A frame serving
  another project in the same tab therefore finds no token and forms a
  new pairing under a new join code, so an editor bound to the first
  project never joins, lists, or pushes into the second; returning to
  the first project resumes its own session by its own token. A frame
  URL without the parameter (a MakeCode build that does not pass it)
  stores under the one unscoped key `wendoo-simx-bridge:bindingToken`.
- `localStorage` outlives the tab and is shared by every tab of the
  origin: a frame reallocated in the same MakeCode tab, a page
  refresh, and a MakeCode tab closed and opened again on the project
  all present the stored token and rejoin the session, so the editor
  waiting on its own token is welcomed with no code entered. The
  editor persists its token the same way, so the binding survives
  either side's tab closing.
- TWO TABS, ONE PROJECT: a second MakeCode tab on the same project
  presents the same token, and the relay's token takeover resolves
  it (see "Join codes, refusal, and takeover in this lane", below):
  the newer tab takes the simx role over and the older one rests on
  its `replaced` panel. The last tab opened holds the session.
- WHO WRITES THE TOKEN: a welcome saves its token only when it differs
  from the one held, and the relay signs one token per binding, so a
  takeover rewrites nothing; a `SESSION_REPLACED` neither saves nor
  clears the stored token, which the tab now holding the session
  relies on for its own next reload; only an end clears it (next
  bullet). Each frame reads the stored token once, when it opens.
- RESPECTING AN END: when the relay reports `SESSION_ENDED`, the
  simx clears its stored token and logs the code, and holds: its
  panel shows the session ended, with a "start a new session" action
  that opens a new pairing in place (`startNewSession`). A simulator
  restart does the same -- the restarted frame presents no token and
  forms a new session under a new code, never re-forming the ended
  binding. Every other coded failure but a replacement is logged and
  holds the same way, the token kept until a new session is started.
  `SESSION_REPLACED` is logged and rests on the `replaced` panel,
  which offers no action: nothing in that frame reconnects, starts a
  new session, or touches the stored token, so two tabs never
  displace each other in a loop. The way back is any fresh hello
  from the resting tab: a page reload, or MakeCode resuming its
  simulator when the tab becomes visible again -- MakeCode pauses a
  hidden tab's simulator and resumes it on focus, so in practice the
  session follows the tab the user is looking at, each switch a
  user-driven takeover, never an automatic loop.
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
  carries no code.
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
- The one takeover is by token. MakeCode tabs on one project share
  the stored simx token, and editor tabs of one origin share the
  persisted editor token; the newer connection takes the role over,
  and the older one holds on `SESSION_REPLACED`. An editor holds
  until it is started again, which takes the session back; a simx
  rests on its `replaced` panel until its next fresh hello -- a page
  reload, or MakeCode resuming the simulator as its tab regains
  focus, so the session follows the visible tab.
- Reloads never end a session: the editor closing on `pagehide` and
  the simx disposing its frame both stop the connection, which the
  session survives. Two deliberate ends exist in this lane. The
  editor's `forget()` over a live connection sends `session:goodbye`
  (the editor's End session action calls it; see "The editor webapp
  on this object", below); the simx is then told `SESSION_ENDED`,
  clears its token, and holds on its ended panel. The simx's panel "end session" action, once
  confirmed, calls `startNewSession`: over an open connection it sends
  `session:goodbye`, so a connected editor is told `SESSION_ENDED`
  and returns to its connect page, then the simx clears its token and
  at once opens a new pairing, whose code its panel shows. An
  operator end tells both sides, and each drops its token the same
  way. An end reaches only a CONNECTED counterpart: one that is away
  when the session ends is told nothing, and its token later re-forms
  a lone session under the ended binding (the relay's documented
  token semantics), from which its own start-over path recovers.

The engine rotates every code in service every ten minutes; the relay
service configures nothing about it. A rotation reaches the connected
side as a pushed code: the simx writes the new code to the console,
exposes it on its handle, and swaps it into its panel in place when
the panel is showing a code. Neither side presents a code it received, so
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
  the relay answers the hello. When the MakeCode side is connected,
  the welcome itself is the answer; otherwise the relay answers with
  the session's code and the entry becomes `accepted` -- the code
  joined the editor role of a session whose other side is not
  connected yet. The welcome spends the code and clears the entry; a refusal clears
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
  wait beside the status dot -- connecting while submitted, waiting
  for the MakeCode project once accepted. A refused code
  (`JOIN_CODE_UNKNOWN`) shows a not-recognized notice above the
  cleared entry, and an ended session
  (`SESSION_ENDED`) returns here with an ended notice, the entry being
  the way to connect afresh. With a token persisted from an earlier
  page load, the app resumes the session on load and skips this page,
  unless the page was opened with a join code in its fragment (see
  "Opening the editor from the simx", below).
- The SESSION VIEW shows once a session exists, under the APP
  HEADER: the Wendoo logotype (a link to https://wendoo.com, opening
  in a new tab), the declared target's display name,
  and the connection status as an 8px dot and a lowercase word --
  the simx panel's idiom, using its words where the states
  correspond -- followed, while the status is `connected` or
  `reconnecting`, by the END SESSION action (below). The status is
  carried as `data-status`: `connecting`
  (the session has not connected since the page opened it),
  `connected`, `reconnecting` (only once a disconnection outlasts the
  grace, below), `replaced` (the takeover hold), `ended`,
  and `update` (a version rejection). The dots paint from the
  editor's themeable tokens: success, warning, destructive, and the
  neutral muted foreground. Below the notices the session view holds
  the BRAIN LIST (the brains store's brains, below), then the
  catalog's diagnostics, then the catalog panel rendering the latest
  catalog -- and no join code: the only codes an editor receives are
  spent or name the simx's vacancy, which no person can enter yet.
  The catalog stays rendered while disconnected -- status gates
  delivery, never what is already shown -- and is dropped whenever no
  session exists.
- The DISCONNECTED GRACE: MakeCode reallocates the simulator frame
  routinely, so a brief disconnect is the common case. The header
  turns `reconnecting` only once a disconnection outlasts
  `DISCONNECT_GRACE_MS` (a few seconds); until then it keeps showing
  the status from before the disconnection. The header's status is
  the whole disconnection surface, and End session beside it is the
  way out. The session
  object stays truthful; the grace lives in the editor's view-model
  only.
- END SESSION: a small destructive button beside the header's status,
  shown while the status is `connected` or `reconnecting` (never on
  the connect page, and not in the `replaced` or `update` holds,
  which carry their own remedies). It opens a destructive
  confirmation, the same dialog removing a brain uses; confirming
  calls the store's `forget()`, which over a live connection sends
  `session:goodbye`, so the relay ends the session for BOTH sides --
  the simx is told `SESSION_ENDED` and shows its ended panel -- and
  returns this editor to the connect page. It is the analog of the
  simx panel's "End session". Known shape: an end performed while the
  simx is away does not reach it (see "Join codes, refusal, and
  takeover in this lane", above), and an end performed while this
  editor's own connection is down reaches no one; either way the
  editor returns to its connect page, and the simx's own End session
  recovers its side.
- RECOVERY AFFORDANCES: `SESSION_REPLACED` shows a held-state notice
  at once, with a reconnect action (`start()`) and a "Start over"
  action (`forget()`, back to the connect page; the held connection
  is closed, so nothing reaches the relay and the start over clears
  this editor's seat alone). An overflow recovers
  automatically and surfaces only as transient status. A version
  rejection shows its remedy -- reload the editor -- the one
  exception to in-page recovery. `JOIN_CODE_UNKNOWN` and
  `SESSION_ENDED` render their notices on the connect page; a
  `JOIN_CODE_UNKNOWN` refusing a code entered while a binding token is
  held renders its notice in the session view instead, while the store
  falls back to the token's session (see "Opening the editor from the
  simx", below).
- The binding token persists in `localStorage` through a small
  persistence module (load/save/clear/has) wired into the session's
  token hooks; the store owns nothing else durable.
- The BRAINS STORE (`BrainsStore`) follows the session store, reading
  the catalog, from which it builds the environment brains are edited
  and compiled in -- the catalog's packs bound under the project's id
  allocation (see "The id manifest", above), rebuilt whenever a different
  catalog arrives or the allocation changes, every brain recompiled in
  each rebuild -- and the status, and it syncs its brains with the
  MakeCode project over each handshake's brains channel (see "Brain
  sync", below). The brains are kept through every status.
- The BRAIN LIST renders the brains store in every status, so
  authoring continues while the project is away. Each row is keyed by
  the brain's document id; the name is display data, and two brains
  may show the same one. A row opens the brain in the upstream brain
  editor dialog in its continuous mode, whose config is built from the
  store's current environment and rebuilt whenever the environment is.
  The row's badge counts the compile's errors and warnings (carrying
  the compile state -- `current`, `stale`, or `none` -- as
  `data-compile`). Rows also rename and remove brains; adding a brain
  names it and opens the editor on it.
- CONTINUOUS EDITING: the brain editor has no OK or Cancel. Every edit
  the dialog reports -- a command, an undo, a redo, a load -- reaches
  the store through the editing's debounced flush: once
  `FLUSH_DEBOUNCE_MS` (700 ms) has passed after the latest edit, the
  flush reads the edited document and applies it to the store, which
  compiles and pushes it. The floor follows MakeCode's write rate: a
  flush that changes a brain costs two project-file writes, and
  MakeCode allows 30 per 10 seconds. Closing the editor flushes the
  unflushed edit at once, before the dialog goes; closing hands over
  and discards nothing else, and reverting is the editor's own undo.
  The dialog keeps the document it opened on for as long as it stays
  open, whatever the flushes store. A flush that throws is logged
  under `BRAIN_FLUSH_FAILED` and keeps its edit unflushed, so the next
  edit's flush, or the close, tries again. Edits live only in memory
  until the project acknowledges them: closing the page drops any not
  yet acknowledged.
- The SAVE STATUS beside the header's connection status shows whether
  the brains are saved to the MakeCode project, from the store's facts:
  `saved` while nothing is pending, and nothing shown; `saving` while
  something is pending and a push is in flight; `unsaved` while
  something is pending and no push is in flight -- disconnected,
  reconciling, waiting to retry, or held by a damaged source. It is
  worded for the kid; the state rides as `data-save-state`, the pend
  count as `data-pending`, the pushes in flight as `data-in-flight`,
  and `reconciled` as `data-reconciled`. From the `sm` breakpoint up
  it is drawn above the brain editor's backdrop, so it stays readable
  while the editor is open.
- DAMAGED BRAINS (see "Brain sync", below) surface in the brain list
  at the default diagnostics tier, since restoring is a
  blocks-only action. A damaged brain's row carries a notice worded
  for the kid -- its file in the MakeCode project is broken -- with
  the damage's stable code as `data-code`, never as text. When the
  store holds a copy of the brain, the notice offers Restore
  (`repushBrain`), disabled (the button's `disabled` attribute) unless
  the store is `reconciled`, since a re-push reaches the project only
  then; a damaged brain the store holds no copy of is
  listed after the held brains under the name the project gave it,
  with the notice alone (fix or delete the file in MakeCode) and no
  other controls. The store clears the damage on the project's ack
  or a later reconciliation, and the notice goes with it.
- The CATALOG DIAGNOSTICS the store reports while building its
  environment render as one coded line each above the catalog panel,
  each carrying its code as `data-code` and, where it names them, the pack
  as `data-pack`, the entry as `data-name` and the offending token as
  `data-token`: `CATALOG_UNREADABLE` for catalog text it cannot read
  (brains keep the built-in tiles); `CATALOG_PACK_UNBOUND` per pack while
  the store holds no id allocation (until a handshake reads the project's
  manifest); `MAKECODE_MANIFEST_FORMAT_NEWER` while the project's manifest
  is of a newer format; and one line per catalog entry no tile can be made
  of -- a token the catalog grammar does not have
  (`CATALOG_TILE_KIND_UNKNOWN`, `CATALOG_CALL_SPEC_KIND_UNKNOWN`,
  `CATALOG_ON_EXCEED_UNKNOWN`), a tile whose registration declared no
  shape (`CATALOG_TILE_SHAPE_UNDECLARED`), a malformed entry
  (`CATALOG_ENTRY_MALFORMED`), a reference to no type
  (`CATALOG_TYPE_UNKNOWN`), an unreadable default
  (`CATALOG_DEFAULT_UNREADABLE`), a shared slot tile declared with another
  type (`CATALOG_SHARED_TILE_CONFLICT`), an operator of an unsupported
  shape (`CATALOG_OPERATOR_SHAPE_UNSUPPORTED`), or an entry the language
  model refuses (`CATALOG_TILE_REJECTED`) -- the rest of its pack bound.
  These are show-all-tier diagnostics, rendered unconditionally while the
  product's only users are its developers. They inform and never block
  authoring.
- PACK BINDING: the store's environment binds each catalog pack through
  the upstream model's own builders: each struct type under its allocated
  atom, its fields at their allocated ids; each tile as a host sensor or
  actuator under its allocated action id, its grammar built as the
  upstream call spec, with a slot's tile private to its tile
  (`<pack>:user.<tile>.<fragment>`) unless its fragment starts
  `parameter.` or `modifier.`, which names a tile shared across packs, and
  an anonymous slot filled by the anonymous parameter tile of its type
  (`anon.<TypeName>`); a slot's tile is labelled by the label the slot
  carries, or, when it carries none, by its fragment after the last dot
  (an anonymous slot's by its type name), and a shared tile keeps the
  label of its first declaration; and each operator as its own operator
  under its allocated host-function id, infix over two operands, prefix
  over one.
  Pack actions run nothing in the editor.

## Brain sync

The editor is authoritative for in-flight edits and the MakeCode
project is durable truth. The brains store reconciles on every brains
channel, then pushes each edit as it is made:

- BINDING IDENTITY: each channel carries the binding token the session
  held when its handshake completed -- the session store tracks it
  through the session's token hooks. Equal tokens name the same
  binding; the relay derives the token from the binding alone, so it is
  stable across reconnections and across relay restarts that keep the
  binding secret. The store compares tokens only.
- LIFECYCLE, per binding: a channel of the same binding as the previous
  one keeps every brain and pend. A channel of a DIFFERENT binding first
  replaces the store's brains with that project's pulled set,
  discarding every local brain and pend. Brains authored before any
  binding was ever held are pending, so the first binding merges: they
  push to it, and its brains are pulled beside them. Carrying brains
  from one project to another is not done.
- RECONCILIATION: read the project's id manifest and list, adopting the
  manifest (see "The id manifest", above); pull every listed brain the
  store holds no copy of, whose copy's `sourceHash` differs, or whose `compiledSourceHash`
  is `null` or differs from its `sourceHash` (a summary without
  `compiledSourceHash` pulls on the source rule alone); adopt each
  pulled brain the store holds no pending edit of (a pending edit wins,
  and the flush pushes it); drop each brain the project no longer holds
  that has no pending edit; then push every pend. A request that fails
  abandons that run, pends intact, and the reconciliation re-runs over
  the same channel after each of `PUSH_RETRY_DELAYS_MS` in turn, then
  after the last of them again and again, while the session stays
  connected and no later handshake has completed; a later handshake
  reconciles over its own channel instead.
- RECONCILED: the store's `reconciled` is `true` while the session is
  connected and the latest handshake's reconciliation has finished;
  it turns `false` at the next disconnection and while a new handshake
  reconciles. Edits made and re-pushes asked while it is `false` do
  not reach the project at once.
- PUSH: once reconciled, each add, apply, rename, or removal made while
  connected is pushed at once; one made otherwise is recorded pending.
  A push carries the brain exactly as the store holds it -- source plus
  the compiled form and hash of ONE compile (the convergence rule; a
  failed compile carries the last good compiled form); a removal pushes
  as `remove`. A push records its brain pending as it goes out, and the
  project's acknowledgment of it clears the pend only while it carries
  the brain's latest state, however late it arrives. A push unanswered
  for `PUSH_LIVENESS_DEADLINE_MS` (30 s) counts as failed, its pend
  standing. A failed push of a brain's latest state is retried after
  each of `PUSH_RETRY_DELAYS_MS` (500 ms doubling to 8 s) in turn, then
  every 8 s for as long as the push keeps failing, while the handshake
  stays reconciled and connected and the brain is not damaged; a newer
  edit's push takes over from the retries. Pends flush on the next
  reconciled handshake; until acknowledged they survive every status.
- STALENESS: a pulled brain whose compiled form is absent, was
  compiled from other source (its `sourceHash` differs from the
  source's hash -- someone edited the source out of band), or differs
  from the program the store's environment compiles of the source -- its
  pack vocabulary bound under other ids -- is recompiled from the pulled
  source and, when that compile succeeds, the fresh pair is pushed. The
  same holds for every held brain whenever the environment is rebuilt: a
  brain whose compiled form changes is pushed. A pulled source that parses but fails to compile is
  held with its diagnostics beside the project's compiled form as the
  last good one, and nothing is pushed.
- COMPILED-FORM HEALING: because the list reports the compiled form, a
  project whose `brains.g.ts` lost or garbled a brain's registration --
  the file deleted in MakeCode's Explorer, an entry damaged, a
  registration left from other source -- has that brain pulled even
  when the store's copy of the source matches, and the staleness rule
  pushes the fresh pair, rewriting the module. Every brain whose
  registration is current is left alone. Healing happens when a
  handshake reconciles: a fresh editor session, a reconnection, or a
  new simx frame. Damage done while a handshake stays open is not seen
  until the next one.
- CORRUPTION: a pulled source that is not a brain document is listed in
  the store's `damaged` map under `BRAIN_SOURCE_INVALID`, and one whose
  embedded id differs from its address under `BRAIN_SOURCE_ID_MISMATCH`,
  each with the display name the pull carried.
  The store never crashes on it and never overwrites it by itself: a
  held copy stays as it was, edits to a damaged brain (removals
  included) stay pending, and the flush skips it. `repushBrain(id)`
  restores the project from the held copy -- offered only when the
  store holds one; otherwise the way out is fixing or deleting the file
  in the project, which the next reconciliation sees. An acknowledged
  push of the brain, or a later pull finding the source repaired or
  gone, clears the damage.

## The simx status panel

The simx frame is a visible panel in the simulator column, and it
renders a minimal session-status surface: no authoring, no catalog,
no product behavior. Everything it shows derives from session state
the simx already holds; the panel stores nothing.

- LAYERS: the simx bridge handle exposes truthful session state
  (`joinCode`, `counterpartConnected`, `counterpartAway`, `bound` --
  a binding token is held -- `connection`, `errorCode`) with an
  `onChange` event and the one action `startNewSession`.
  `SimxStatusModel` derives the displayed state from it and adds the
  only two things that are display-only: the away grace and the
  end confirmation. The panel renders the model's view with plain
  DOM and routes its buttons to the model's actions.
- STATES, one at a time, carried as `data-state` on the panel root:
  `connecting` (the connection is not open, or the relay has not
  answered the hello; `data-retrying="true"` while the bridge client
  retries after a failed attempt), `code`, `connected`, `away`,
  `confirm`, `ended`, `replaced`, `update`.
- VACANCY: the panel shows a join code exactly while the simx holds
  no binding token -- the editor seat has never been filled in this
  binding. The welcome takes the code down, a rotation swaps it in
  place, and a bound session whose editor is gone shows `away`, never
  a code. The relay does mint and push a working code for a lingering
  editor role; it stays on the handle and in the console but is not
  displayed, because a second editor entering it would contend with
  the first editor's still-valid token. From `away` the way to a
  displayable code is ending the session.
- AWAY GRACE: `away` shows only once the session has called for it
  continuously for `AWAY_DISPLAY_GRACE_MS` (a few seconds), so an
  editor tab reload that resumes by token never flashes it; until
  then the previous display stays. The session state stays truthful;
  the grace lives in the model only.
- ENDING: `connected` and `away` offer "end session", which shows an
  inline confirmation first; confirming calls `startNewSession`
  (see "Join codes, refusal, and takeover in this lane", above). `ended` covers
  `SESSION_ENDED` and every other failure that stops the connection
  except a replacement, and offers "start a new session", the same
  call.
- REPLACED: `SESSION_REPLACED` -- another tab on the project took the
  session over -- shows `replaced`, which says the session continues
  in the other tab and offers no action: starting a new session there
  would clear the token the other tab relies on. Reloading the page
  takes the session back.
- VERSIONS: a relay refusing this side's protocol
  (`PROTOCOL_VERSION_MISMATCH`) or an editor hello declaring a newer
  makecode protocol (`PEER_SESSION_PROTOCOL_VERSION_NEWER`, held until
  a later handshake completes) shows `update`: reload the page. It and
  `replaced` are the states whose remedy is not in place.
- LINKS: the header's logotype links to https://wendoo.com in every
  state, and the `code` state adds an "or open the editor" link after
  the type-this-code hint (see "Opening the editor from the simx",
  below). Links carry `data-link` (`home`, `editor`) and open through
  a click probe: the panel opens a blank tab, cuts its `opener`, and
  navigates it to the link's URL. MakeCode creates simx frames
  sandboxed without `allow-popups`, so there the browser refuses the
  tab; the panel then replaces the link in place with its URL as
  selectable text and selects it, for the person to copy -- the same
  fallback the copy button takes.
- COPY: the code's copy button writes it with the async clipboard
  API. MakeCode's simx iframe delegates only `autoplay` and
  `microphone`, so in Chromium the write is refused by permissions
  policy; the panel then selects the code's text for the person to
  copy, and a click on the code selects all of it.

## Opening the editor from the simx

The simx panel's `code` state links to the editor so a person can
join without typing the code. The link carries the code between
browser tabs in a URL, never on the session wire.

- VACANCY: the link exists exactly while the panel shows a join code,
  and its URL always carries the code shown: a rotation re-renders it
  with the new code, and the welcome takes it down with the code.
- FORMAT: `<editor origin>/#code=<code>`, the code percent-encoded
  (`encodeURIComponent`). The code travels in the fragment, which the
  browser sends to no server and writes to no request log.
- BASE URL, derived like the bridge address from the frame's own host
  (`editorUrlFor` beside `bridgeUrlFor` in
  `makecode/simx/bridge/src/service-urls.ts`): a frame served from a
  loopback host links to the dev editor at `http://localhost:5176`;
  any other frame links to the deployed editor at
  `https://makecode.playwendoo.com`.
- ENTRY: at boot, before rendering, the editor takes a fragment that
  starts `#code=` and carries a non-empty code
  (`takeFragmentJoinCode` in `apps/editor/src/services/fragment-entry.ts`):
  it rewrites the URL without the fragment (`history.replaceState`,
  keeping the path, query, and history state) and only then hands the
  decoded, trimmed code to the store's `connect`, the connect page's
  own entry action. The code is used once and stored nowhere; it gets
  the ordinary entry states, and a code that went stale before the tab
  opened is refused with `JOIN_CODE_UNKNOWN` like a typed one. Any
  other fragment is left in the URL, and a page with no code resumes
  by its persisted token as before.
- WITH A HELD TOKEN: the session presents the entered code beside the
  persisted token, and the relay matches the code alone. A code in
  service joins its session, and the welcome's token replaces the
  persisted one. When the relay refuses the code, the store opens a
  new session presenting the token alone, so the tab falls back into
  the session it already had; the session view shows the
  not-recognized notice, carrying `JOIN_CODE_UNKNOWN`, until that
  session is welcomed, unless it fails with a code of its own.
- The link opens through the panel's click probe (see "The simx
  status panel", above): inside a MakeCode frame that may not open
  tabs, it reveals its URL for the person to copy into a new tab.

## The extension channel

The extension-to-simx wire is pxt's sim-message channel, distinct
from and beneath the session:

- The channel name equals the simx's `approvedRepoLib` key
  (`wendoo-lang/pxt-wendoo`). The extension holds it as one
  internal constant (`makecode/extensions/vm/sim-channel.ts`), and
  no public API of the extension takes or exposes it: a caller
  publishes with `wendoo.publishCatalog(encoder)`, whose first call in a
  program run publishes and whose later calls do nothing. The arcade
  extension calls it from each game frame, before draining the
  scene's programs, so a project holding the arcade extension
  publishes its catalog on its first frame with no code of its own. The simx reads
  the channel MakeCode names in its frame URL's `channel` parameter,
  falling back to its own `SIMX_CHANNEL` constant for a frame URL
  that names none; it reads the program's messages on that channel
  only, and posts its catalog requests and program updates on it. The conformance
  harness checks the extension's key against the fallback constant. This
  equality is a ROUTING fact, not a
  trust fact: pxt never checks a message's channel field against
  its sender, any program can post on any registered channel, and
  simx frames receive every channel. The one host-attested binding
  is the frame itself (pxt tags each simx iframe with its key at
  creation); anything deriving identity from this wire must key on
  the frame, never on the channel field a sender writes.
- Four packet kinds exist: a ping (extension to simx, posted once
  from the extension's own load-time init, before any user code
  runs), a catalog emission (extension to simx, posted by
  `publishCatalog`), a request (simx to extension, answered
  with a fresh serialization once `publishCatalog` has run), and a
  program update (simx to extension, see "LIVE UPDATE" under the
  brains, above). The simx reads each ping as a program start. pxt
  creates -- or, from an earlier run, restarts -- the simx frame on
  the first packet of a run on its channel, and that packet is lost
  to it. The ping is that first packet, so the frame -- its status
  panel, and the join code while the editor seat is vacant --
  appears as soon as any program that includes the extension runs,
  whether or not the program ever publishes a catalog. The
  simx requests the catalog once loaded; a program that publishes
  later posts its catalog unasked.
- The channel framing carries the extension's declared version,
  because the extension is the most version-pinned party in the
  system and has no other declaration carrier. Each message from
  the extension is the channel version in decimal, a line feed,
  then the payload, all UTF-8: empty for the ping, the catalog
  text for a catalog emission (a catalog is never empty), unchanged
  by the framing. The simx reads any version up to its
  own `SIM_CHANNEL_VERSION`; it ignores a ping, and records the
  version of each catalog it reads. A newer version, or a
  message with no version line, is rejected with a stable code
  (`SIM_CHANNEL_VERSION_NEWER`, `SIM_CHANNEL_FRAME_MALFORMED`)
  written to the console, and the simx drops its cached catalog so
  no older one outlives it. The simx's request carries no bytes.
  A program update is one frame under the simx's channel version:
  the version in decimal and a line feed, then the brain's document
  id, name, and source hash, each a ULEB128 byte length followed by
  that many UTF-8 bytes, then the program's byte length as a ULEB128
  followed by the program bytes verbatim -- none for a removal. pxt
  carries a message's bytes by structured clone end to end, with no
  size limit of its own. The extension reads any version up to its
  own `SIM_CHANNEL_VERSION`; a newer version, or a frame that does
  not follow the framing, is refused with the same stable codes,
  logged as `wendoo sim-channel-rejected <code>`. The conformance
  harness pins the extension's declared version and its channel to
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
instead of the deployed service. The rule lives with each composition
root (`apps/editor/src/main.tsx`, `makecode/simx/bridge/src/service-urls.ts`);
a deployed build, served from a real host, uses the deployed
service.

- The relay: `npm run dev` in `apps/bridge` (port 6465). Set
  `BRIDGE_BINDING_SECRET` to keep sessions healing across relay
  restarts; without it, every restart ends every session.
- The simx: `npm run dev` in `makecode/simx/bridge` (port 5175, pinned
  with `strictPort` by its dev config, matching the `devUrl` its
  `approvedRepoLib` entry registers; `npm run dev -- --port <port>`
  serves it elsewhere, and the registration must then name that port).
- The editor: `npm run dev` in `apps/editor` (port 5176, pinned with
  `strictPort` by its dev config, because a simx served from a loopback
  host links there).
- MakeCode: `pxt serve` from a dev target checkout, with the simx
  registered by localdev URL (an `approvedRepoLib` entry carrying
  `devUrl`) and loaded via the `simxdev` URL parameter.

The dated all-local run-through in `generated-docs/` records the
exact invocations. The harness exercises the extension's emission
headlessly on both provisioned targets, and the composed acceptance
tier drives the editor's service layer and the simx module against
the engine's in-process testkit, `@wendoo/bridge-session/testing`
(`apps/editor/src/services/editor-session-store-relay.spec.ts`), and
the brain sync against a scripted simx and against the real simx
module serving an in-memory MakeCode project over the same testkit
(`apps/editor/src/services/brains-sync-relay.spec.ts`; the project is
`makecode/simx/bridge/src/test-support/projfs-host.ts`, which applies
MakeCode's projfs rules -- scope, visibility, quota, deferral over the
rate, binding to the project a request arrived in, refusal of an
unserved frame -- and plays MakeCode's text editor sharing the project:
the open file's buffer, its reload on a write, its save-back on a file
switch, and debounced saves of typing that wait for a reload; each rule
has a switch whose control specs prove a spec's outcome rests on it). The
relay service's own suite runs the testkit over the service's own
server (`startTestRelay({ server: startRelayServer })`).
