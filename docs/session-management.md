---
title: Session management in pxt-wendoo
status: Accepted
# Active status:   Draft -> Review -> Accepted -> Committed -> In-Progress -> Shipped
# Terminal status: Rejected | Withdrawn | Superseded (set superseded-by)
created: 2026-09-25
updated: 2026-10-11
---

# Session Management in pxt-wendoo

How this repository's components integrate with the Wendoo peer-session
mechanism, over the port MakeCode brokers between the editor tab and the
simulator extension. The mechanism itself -- the ontology, lifecycle,
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
  below), the `makecode:manifest*` payload family (see "The manifest
  payload family", below), `makecode:assets` (see "The assets
  publication", below), and the liveness pair `makecode:ping` /
  `makecode:pong` (see "Liveness in this lane", below);
- the hello's declaration, `MakeCodeSessionDeclaration` (see "The
  target declaration", below);
- `MAKECODE_SESSION_PROTOCOL_VERSION`, the version each endpoint
  declares;
- `connectMakeCodeSession`, binding the upstream peer-session
  mechanism to the kind over any payload-capable port, whose session
  both requests brains (`listBrains`, `pullBrains`, `pushBrain`) and the
  id manifest (`readManifest`, `writeManifest`) and serves them
  (`onBrainsRequest`, `onManifestRequest`), and both publishes and
  receives the catalog (`publishCatalog`, `onCatalog`) and the asset
  snapshot (`publishAssets`, `onAssets`), and both probes its peer's
  liveness (`ping`) and answers the peer's probes;
- `createMakeCodePortEditorSession`, the editor role's session object
  over the ports the page hosting the editor tab brokers, with
  `messagePortSessionPort` wrapping a `MessagePort` as a session port
  (see "The editor session object", below);
- the id manifest's shape, `MakeCodeIdManifest` (see "The manifest
  payload family", below);
- the brain contracts both sides of the family must agree on:
  `brainSourceHash` (32-bit FNV-1a over UTF-16 code units, eight
  lowercase hex digits) and the device profile compiled brains carry
  (see "Device profiles", below).

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

The three-hop path -- the editor tab, the simx column frame, and the
MakeCode project, with MakeCode brokering the port between the two
frames -- assigns the session parts as follows.

- The editor (`makecode/simx/wendoo/src/editor`) is the EDITOR role
  endpoint, running as the MakeCode editor tab. It reaches the wire
  through the kind package's port-backed session object, which binds
  `connectMakeCodeSession` over each port MakeCode brokers to the tab.
  It follows the editor-class obligations in the upstream spec: one
  session object with stable identity, status, and a state-change
  event surface; authoring continues while disconnected with changes
  pending locally. Continuity anchors on the tab frame itself: the
  session object is the binding, so no token or code is involved (see
  "The editor session object", below).
- The simx (`makecode/simx/wendoo/src/simx`) is the SIMX role endpoint
  and the party serving the project. Its frame renders the brand strip
  (see "The brand strip", below). It is a channel, not a store: it
  carries nothing across its reload. It receives catalogs on the
  sim-message channel, opens a makecode handshake over each port
  MakeCode brokers to it, closing the previous one, publishes the
  current catalog into the session RENDERED -- each icon the extension
  carries as hex of an image buffer replaced by an `iconUrl` data URI
  drawn under the project's palette, so no icon hex reaches the
  editor -- then the project's asset snapshot (see "The assets
  publication", below), then the project's name as its project info,
  and answers the editor's brains and manifest requests from the
  project's files (see "The simx write path" and "The id manifest",
  below).
- The VM EXTENSION (`makecode/extensions/vm`) is NOT a session
  party. It participates through the sim-message channel only (the
  extension channel, below). It is MakeCode-target-agnostic and holds
  its channel identity itself; no caller of its API supplies or sees
  it.

## The editor tab's in-page session

The editor runs as the MakeCode editor tab and reaches the project over
a port MakeCode brokers: a `MessageChannel` between the tab frame and the
simx frame (the column frame), over which the two speak the
`makecode:*` session -- the hello with the target declaration, the
catalog, the asset snapshot, the project info, and the brains and
manifest request-reply families. The editor-tab messages themselves
(`simxeditor`, `simxeditorport`) are MakeCode's, vendored from pxt's
`pxtservices/simxeditor.ts` into `src/vendor/simxeditor.ts`.

- REGISTRATION: the simx's `approvedRepoLib` entry in a target's
  `targetconfig.json` registers the tab with `allowEditorTab` and
  `editor` -- `index` (the editor entry's page, `index.html`), `label`,
  and `icon` (an artifact-relative SVG MakeCode shows beside the
  label). Beside it the entry grants `allowFileWrite` (projfs) and
  `allowAssetRead` (projassets) for the simx write path and the assets
  publication, `allowPopups` for the brand strip's logotype link,
  `allowDownloads` for the brain editor's save of a brain to a file,
  and `hideInFullscreen`, and sets `aspectRatio` 6.6, which sizes the
  strip's frame to about 49 px tall at the 326 px simulator column.
- BOOT: the simx starts its port bridge and renders the brand strip at
  once. The editor entry boots the tab alone: it reads `parentOrigin`
  from its frame URL, posts `{ type: "simxeditor", event: "ready" }` to
  `parentOrigin`, and takes each `simxeditorport` MakeCode then posts
  from that origin. A URL naming no valid `parentOrigin` is logged as
  `TAB_PARENT_ORIGIN_INVALID`, and the editor hears nothing.
- THE BROKERED RECONNECTION: MakeCode posts a new port pair whenever the
  tab becomes ready while the simx frame is loaded and whenever a simx
  frame finishes loading while the tab is ready. Each new port replaces
  the previous one on both sides: the old handshake ends, its requests
  reject with their family's `CLOSED` code, and the brains store
  reconciles over the new handshake's brains channel, pushing its pends.
  The simx accepts a port only from `parentOrigin`.
- ONE WRITER: the tab gains no write path. It requests brains and the
  manifest over its session, and the simx frame answers through projfs,
  writes the project's files, and posts live program updates on the sim
  channel.
- TWO TABS, ONE PROJECT: two MakeCode tabs open on one project each hold
  their own editor tab and simx frame, and both write the project
  through their own simx. Nothing arbitrates between them: the last
  write wins, the same advisory parity pxt's header lock gives two
  Blocks tabs on one project.
- CLOSE PATH: when the page is hidden for good (`pagehide`), which is
  how a tab frame learns its project is closing, the editor flushes every
  open brain editor's unflushed edit at once, so the push leaves before
  the frame goes. MakeCode posts no message before removing the frame.

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
  records the target of each completed handshake and keeps it while
  the session is disconnected; the editor's session store exposes it
  as `target`, `undefined` when unknown.
- The value is informational, for display and theming. It is the
  sender's own claim: identity and trust come from the session's
  credentials, never from it.
- The editor themes for it through its per-target record
  (`TARGET_THEMES` in `makecode/simx/wendoo/src/editor/services/target-theme.ts`),
  which maps a target id to theme token overrides and the colors its
  tiles are filled in. An undeclared target, a declared value that is
  not a non-empty string, and an id the record does not know all leave
  the default theme.

## The brains payload family

Brains travel between the editor and the party serving the MakeCode
project as a request-reply family under the kind's namespace. Payload
kinds carry no versions of their own: the family is additive under
`MAKECODE_SESSION_PROTOCOL_VERSION`, and every party ignores a
`makecode:*` type it does not know (the kind's session object routes
catalogs and asset snapshots to their listeners and replies to their
requests, and drops everything else).

- REQUEST-REPLY: every request carries an envelope `id`, and its reply
  carries the same `id`, the folder-session protocol's `folder:ack` /
  `folder:error` shape. The requesting session mints ids with a random
  per-session prefix, so a late reply to an earlier handshake's request
  on the same port never matches a later request. A request settles on its reply, or
  rejects with `MAKECODE_BRAINS_CLOSED` when its handshake ends; the
  kind sets no timeout, and a peer that never answers leaves requests
  pending until the handshake ends -- which, in the editor, the
  heartbeat brings about once the peer leaves two pings in a row
  unanswered (see "Liveness in this lane", below).
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
  handshake and reject once it ends, and every later handshake -- over
  each port MakeCode brokers next -- hands out a new one.
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

## The assets publication

The MakeCode project's assets reach the editor as a publication under the
kind's namespace, on the catalog's discipline: the party serving the
project publishes whole snapshots, a later snapshot replaces an earlier
one, and nothing is requested or answered.

- `makecode:assets` (project -> editor) carries `{ assets: [{ kind, id,
  name?, width?, height?, previewUrl? }] }`: every asset the snapshot holds,
  in no particular order. An empty list is a snapshot holding none.
- `kind` is the asset's kind as MakeCode names it, for example `image` or
  `song`.
  The set is open: a party skips an entry whose kind it does not handle,
  so kinds join additively.
- `id` is the asset's short id as MakeCode stamps it in the project's
  asset files: the id a compiled program names the asset by, unchanged
  when the asset is renamed. It is unique within its kind, so an entry is
  identified by `kind` and `id` together.
- `name` is the asset's display name, absent when it has none; `width`
  and `height` are its size in pixels, present for a kind with a pixel
  form and absent for one without; `previewUrl` is a data URI in any image
  format, rendering the asset, usable as an image source as it is, present
  for a kind with a visual form and absent for one without.
- Which assets a snapshot holds and when one is published -- exclusions,
  debouncing, skipping an unchanged snapshot -- is the publisher's policy.
  A handshake receives only the snapshots published into it, so the
  publisher sends its current snapshot into each new handshake.
- THE SIMX'S SNAPSHOT (`ProjectAssets`,
  `makecode/simx/wendoo/src/simx/project-assets.ts`): the project's images
  and then its songs, as MakeCode's projassets API lists them, each kind
  ordered by id. An image carries its name, its size and a preview drawn
  under the project's palette, the images MakeCode mints for itself
  (`transparency16` and the like) left out; a song carries its name alone,
  with no size and no preview. Every kind is listed again on each change
  MakeCode reports, and a snapshot is published once every kind has
  answered. A listing MakeCode fails is logged by its code and kind and
  retried at a bounded rate for as long as it takes; a kind MakeCode
  refuses for good (`UNSUPPORTED_KIND` from a MakeCode that does not list
  it, among others) is logged once and left out of every later snapshot,
  and while every kind is refused no snapshot is published.
- The kind's session publishes with `publishAssets` and delivers with
  `onAssets`, replaying snapshots received before the first listener
  attaches to it; the editor session object delivers the snapshots of the
  current handshake only (`onAssets`).
- VERSIONING: the publication is additive under
  `MAKECODE_SESSION_PROTOCOL_VERSION` 1. A party that does not know
  `makecode:assets` ignores it, and one that publishes none leaves the
  editor with no snapshot.

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
  `makecode/simx/wendoo/src/vendor/projfs.ts`; the sibling
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
  namespace `wendooBrains` carrying one entry per brain, ordered by
  id and separated by blank lines:

  ```ts
  namespace wendooBrains {
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
  `readBrainsModule` (`makecode/simx/wendoo/src/simx/brains-module.ts`) are
  a writer and reader pair: the same entries always write the same
  text, which reads back to them, and an entry whose label or
  declaration name is not the one its id and name make reads as
  damaged. The VM extension's registration selftest compiles the
  module's generated form in real Arcade and micro:bit projects, from
  the folder path a project holds it at, with programs the editor
  compiled from the brain sources checked in beside it.
- READING A DAMAGED MODULE: the reader never throws. A module
  declaring no format, or declaring format 1 without opening the
  `wendooBrains` namespace (one declaring its entries in a superseded
  namespace among them), reads as registering nothing
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
  other than the last update the simx posted for that brain -- compiled
  from other source, or the same source compiled to other bytes, as the
  editor's staleness rule pushes -- posts that compiled form; a write
  carrying the compiled form it posted last (a source edit that does not
  compile pushes the last good compiled form beside it) or carrying none
  posts nothing; a removal
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
  change, as an ARTIFACT (never `dirty`), and is acknowledged once it has
  landed. The editor has one write out at a time and waits for its answer
  however long MakeCode's write rate holds it, until its handshake ends; an
  allocation that changes meanwhile is written once that answer arrives. A
  refused write fails with `MAKECODE_MANIFEST_WRITE_FAILED`, the projfs code
  leading the message, and the editor retries it after each of
  `PUSH_RETRY_DELAYS_MS`, then at the last delay, while its handshake stays
  connected. A manifest of a newer format is never rewritten: writes fail
  with its code leading the message, and the editor binds no pack while it
  stands.
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
  (`makecode/simx/wendoo/src/simx/ids-module.ts`) are a writer and reader pair.
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

## Liveness in this lane

A brokered `MessagePort` gives no close event and the kind has no
goodbye, so the editor tab learns that the column frame is gone by
probing it. The kind carries a liveness pair, on the bridge protocol's
`control:ping` / `control:pong` shape:

- `makecode:ping` carries an `id`, minted with the sending session's
  random prefix; `makecode:pong` answers it carrying the same `id`.
  Either party may ping, and every established session answers each
  ping it receives until it is disposed, so the column frame answers
  through the kind's shared session code with nothing of its own.
- `ping()` on the kind's session sends a ping and resolves when its pong
  arrives. The session sets no deadline of its own: a ping pending when
  the session is disposed, and one made afterwards, never settles, and
  the caller races it against its own deadline.
- THE HEARTBEAT: the editor session object pings the column frame over
  each established handshake, one ping outstanding at a time and two
  after a miss -- `MAKECODE_HEARTBEAT_INTERVAL_MS` (5 s) after the
  handshake completes and after each pong. A ping unanswered for
  `MAKECODE_HEARTBEAT_DEADLINE_MS` (10 s) is a MISS: a follow-up ping
  goes out at once under a fresh deadline, the missed ping still
  awaiting its pong, and a pong to either one clears the miss and the
  heartbeat carries on at the interval. A stall of either frame -- a
  busy thread, a frozen page, a sleeping machine -- therefore costs at
  most one miss: the follow-up goes out after the stall and is answered
  in milliseconds.
- TWO MISSES IN A ROW end the handshake: a follow-up ping unanswered
  for its deadline ends it exactly as a port replacement does -- its
  brains and manifest requests reject with their family's `CLOSED`, the
  status turns `disconnected` with no error code, and the session stays
  started. A column frame that stops answering is detected within the
  interval plus twice the deadline (25 s at the defaults). No ping goes
  out before a handshake completes, a pong arriving after the handshake
  ended changes nothing, and `stop()` and every port replacement end the
  heartbeat with the handshake.
- RECOVERY is always a new port: MakeCode brokers one whenever a column
  frame finishes loading, which a respawned frame does on the next
  simulator run. The tab cannot ask for one. A push to a frame that is
  gone stays pending through the disconnection; the next brokered
  port's handshake reconciles and flushes it.
- The `MAKECODE_HEARTBEAT_*` values are defaults; the session object's
  `heartbeat` option sets others.

## The editor session object

`createMakeCodePortEditorSession` returns the one object the editor's
product code listens to. Its identity is stable for the life of the
editor tab's frame; the makecode handshakes it runs are replaced as
MakeCode brokers ports, and nothing in it keys on a session id.

- BINDING BY CONTAINMENT: the tab frame lives inside the project's
  page, so the binding is the frame itself, and the session object is
  the binding: one for the frame's life, holding no token and no join
  code and writing nothing to storage. Every brains channel therefore
  belongs to the same project, so brains and pends survive every port.
- STATUS BY PORT LIVENESS: the session is `connected` once the makecode
  handshake over the current port has completed, until the column frame
  leaves two pings in a row unanswered past the heartbeat deadline --
  detected within the interval plus twice the deadline (see "Liveness
  in this lane", above) -- the port is replaced, or `stop()`; and
  `disconnected` while no port is attached, while the current port's
  handshake is pending, after it was rejected or ended, and after
  `stop()`. Every change is published at once, with no debouncing.
- PORTS: `attachPort` makes a port the session's port, replacing the
  current one: the current handshake ends and stops reading its port,
  and while the session is started a new handshake opens over the new
  port at once. A port carries one handshake.
- Catalogs, asset snapshots and project info arrive as events from the
  current handshake only.
- The one ERROR CODE is `PEER_SESSION_PROTOCOL_VERSION_NEWER`, for a
  counterpart hello declaring a newer version. It holds until a later
  handshake completes, or until `start()` starts the session again after
  a stop, and names its remedy -- update the outdated side, which for the
  editor means reloading it. On the simx side the same rejection is
  logged by its code and nothing is served over that port.
- `start()` opens handshakes over the ports attached, clearing the error
  code; `stop()` ends the current handshake, lets its port go, and opens
  none until the session is started again.

## The editor webapp on this object

The editor (`makecode/simx/wendoo/src/editor`) consumes the session
object through one store (`EditorSessionStore`), which takes the
session when it is created and starts it. The editor boots only as the
MakeCode editor tab (see "The editor tab's in-page session", above), so
it always shows the session view.

- The SESSION VIEW shows with NO HEADER: no logotype, project name,
  target name, connection status, or save status, since none of their
  states is something a user can act on, and MakeCode's own chrome names
  the project and labels the tab. The one control above the content is
  the DOCS BUTTON in the page's upper right corner (`corner-controls`),
  opening and closing the docs sidebar. The connection status is
  machine-layer only, carried as `data-status` on the view's root
  element (`session-view`): `connecting` (the session has not connected
  since the page started it), `connected`, `reconnecting` (the session
  connected earlier and is disconnected now, carried at once), and
  `update` (a version rejection). Below the corner the session view
  holds the version notice while it applies (see RECOVERY, below), then
  the BRAIN LIST (the brains store's brains, below), then, in one slot,
  the catalog pending notice (see CATALOG PENDING, below) and the
  catalog's diagnostics. The store keeps the latest catalog while
  disconnected -- status gates delivery, never what is already held --
  and holds the latest ASSET SNAPSHOT and project name the same way:
  each one the session delivers replaces the last, and it is kept while
  disconnected.
- RECOVERY: a version rejection shows its remedy -- reload the editor --
  below the docs button and above the brain list, carrying its code as
  `data-code`, and only while it applies.
- The BRAINS STORE (`BrainsStore`) follows the session store, reading
  the catalog, from which it builds the environment brains are edited
  and compiled in -- the catalog's packs bound under the project's id
  allocation (see "The id manifest", above), rebuilt whenever a different
  catalog arrives or the allocation changes, every brain recompiled in
  each rebuild -- the asset snapshot, which its environment's asset
  literals follow (below), and the status, and it syncs its brains with
  the MakeCode project over each handshake's brains channel (see "Brain
  sync", below). The brains are kept through every status.
- ASSET LITERALS: for each catalog type declaring an asset kind (the
  catalog's `asset` key, for example `image`), the store's environment
  holds one literal tile per snapshot asset of that kind, minted through
  the upstream literal builder: its value the type's struct naming the
  asset's short id in its `asset` field, its tile id following from type
  and short id alone, its label the asset's name (its short id when it
  has none). Definitions are never persisted: a brain's source holds only
  the literal's reference. The environment also binds every asset literal
  a brain source references, before that source is read or compiled,
  whether or not the snapshot lists the asset; such a literal is
  UNRESOLVED while the snapshot does not list its asset. A brain therefore
  compiles to the same program with its assets listed, unlisted, or
  before any snapshot arrives -- at runtime an unlisted asset is the VM
  extension's to resolve to nothing. Only resolved literals are offered:
  wherever a slot of an asset type stands open, they join the candidate
  strip like any other literal, and an unresolved literal never does.
  Snapshot changes update the literals in place and never rebuild the
  environment, recompile a brain, or push one: an added asset mints its
  literal, a renamed one relabels it (sentence word included), a
  redrawn one changes its face alone, a deleted one turns unresolved, and
  one restored under the same id resolves again.
- The TILE VISUAL PROVIDER is the editor's one function resolving any
  tile to how it shows, wired into the brain editor's `resolveTileVisual`:
  a resolved asset literal shows its asset's name and its `previewUrl`
  as its face; one whose asset has no preview, and an unresolved one, show
  their label with their type's icon as their face, and no face while the
  type carries no icon; every other tile shows
  the display metadata pack binding gave it, the catalog's `iconUrl`
  included -- a core tile the icon a pack gives it, the first one given
  standing, and a brain literal its brain type's icon beside its name. A
  placed asset literal's value box draws its asset's preview through a
  display-only literal type per asset type (`customLiteralTypes`, no
  dialog members), and its label as text while unresolved or while its
  asset has no preview. Each new
  editor config also carries a fresh localizer identity, so rule sentences
  re-read the words of literals relabelled in place. Icons and previews are
  data URIs from session data, rendered only as an image source, never
  injected as markup. The icons ride the
  catalog the store keeps, so they show while disconnected.
- The BRAIN LIST renders the brains store in every status, so
  authoring continues while the project is away. Each row is keyed by
  the brain's document id; the name is display data, and two brains
  may show the same one. A row opens the brain in the upstream brain
  editor dialog in its continuous mode, whose config is built from the
  store's current environment and asset literals and rebuilt whenever
  either changes.
  The row's badge counts the compile's errors and warnings (carrying
  the compile state -- `current`, `stale`, or `none` -- as
  `data-compile`), and shows on no brain placing unresolved pack tiles
  while the catalog is pending (below). Rows also rename and remove
  brains; adding a brain names it and opens the editor on it.
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
- The SAVE STATE says whether the brains are saved to the MakeCode
  project, from the store's facts: `saved` while nothing is pending;
  `saving` while something is pending and a push is in flight;
  `unsaved` while something is pending and no push is in flight --
  disconnected, reconciling, waiting to retry, or held by a damaged
  source. It is machine-layer only, shown nowhere: the session view's
  root element carries the state as `data-save-state`, the pend count
  as `data-pending`, the pushes in flight as `data-in-flight`, and
  `reconciled` as `data-reconciled`. A damaged brain, the one state
  behind `unsaved` a user can act on, shows its own notice (below).
- DAMAGED BRAINS (see "Brain sync", below) surface in the brain list
  at the default diagnostics tier, since restoring is a
  blocks-only action. A damaged brain's row carries a notice worded
  for the user -- its file in the MakeCode project is broken -- with
  the damage's stable code as `data-code`, never as text. When the
  store holds a copy of the brain, the notice offers Restore
  (`repushBrain`), disabled (the button's `disabled` attribute) unless
  the store is `reconciled`, since a re-push reaches the project only
  then; a damaged brain the store holds no copy of is
  listed after the held brains under the name the project gave it,
  with the notice alone (fix or delete the file in MakeCode) and no
  other controls. The store clears the damage on the project's ack
  or a later reconciliation, and the notice goes with it.
- A brain using UNRESOLVED ASSET LITERALS -- assets the held snapshot
  no longer lists -- carries a notice below its row at the default
  tier, worded in plain words for the user and naming each asset by its label (add it
  back in MakeCode, or pick something else), with
  `BRAIN_ASSET_UNRESOLVED` as `data-code`. It informs and never blocks:
  the brain still compiles and runs as before. No notice shows before
  the first snapshot arrives.
- A brain placing UNRESOLVED PACK TILES -- tiles the store's
  environment holds none for: while no catalog has arrived (the
  program has not run yet), under an unreadable catalog or a manifest
  of a newer format, or once the pack has left the project -- keeps its
  last good program (see "Brain sync", below). The store records each
  such tile on the brain under `BRAIN_TILE_UNRESOLVED`, beside the
  compile's diagnostics. The state is machine-layer only: the view
  shows no notice for it.
- CATALOG PENDING: the brains store's `catalogPending` holds while the
  session has delivered no catalog, so every pack tile a brain places
  reads as unresolved until the game runs and publishes its catalog on
  its first frame. It holds whatever the status, connected or not,
  reconciled or not, and ends with the first catalog, which the editor
  keeps for the life of its tab. It is derived from the store's state
  and stored nowhere. While it holds, a brain placing unresolved pack
  tiles shows no badge on its row, its compile's diagnostics and its
  `BRAIN_TILE_UNRESOLVED` tiles still recorded in the store, and the
  slot below the brain list shows one notice at the default tier,
  worded in plain words for the user -- run the game once to load its tiles -- with
  `CATALOG_PENDING` as `data-code`. No catalog was read, so the
  catalog's diagnostics then hold at most the line of a manifest of a
  newer format. Once a catalog is held the notice is gone and every
  badge shows: a pack tile a held catalog leaves unresolved is a
  problem in the project.
- The CATALOG DIAGNOSTICS the store reports while building its
  environment render as one coded line each below the brain list,
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
  model refuses (`CATALOG_TILE_REJECTED`) -- the rest of its pack bound;
  and one line per sentence frame the catalog grammar does not have
  (`CATALOG_SENTENCE_FRAME_UNKNOWN`), whose tile is still made, reading
  through the default frame.
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
  label of its first declaration; a tile's sentence words, and a modifier
  slot's for its tile, land verbatim in the tile's metadata as the
  upstream `language` group the rule-sentence projection reads (form,
  frame, bare), a tile declaring none reading by the projection's
  defaults, and a shared modifier keeping the words of its first
  declaration; the icon a tile or slot carries (`iconUrl`) lands in its
  tile's metadata the same way, a shared tile keeping its first
  declaration's; and each operator as its own operator
  under its allocated host-function id, infix over two operands, prefix
  over one.
  Pack actions run nothing in the editor.

## Brain sync

The editor is authoritative for in-flight edits and the MakeCode
project is durable truth. The brains store reconciles on every brains
channel, then pushes each edit as it is made:

- LIFECYCLE: the session object is the binding, so every channel
  belongs to the one project the tab frame was opened in, and each keeps
  every brain and pend. Brains authored before the first handshake are
  pending, so the first handshake merges: they push to the project, and
  its brains are pulled beside them.
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
  as `remove`. A compile reading any tile the brain places as one the
  store's environment does not hold is not a good compile either: the
  push carries the last good compiled form, never that compile's
  program. A push records its brain pending as it goes out, and the
  project's acknowledgment of it clears the pend only while it carries
  the brain's latest state, however late it arrives. A push is in flight
  until the column frame answers it -- once projfs has landed it, however
  long MakeCode's write rate holds it -- or its handshake ends: a push to
  a column frame that has gone rejects with `CLOSED` once the heartbeat
  ends its handshake, its pend standing for the next reconciled
  handshake's flush. A push the project refuses fails, and a failed push
  of a brain's latest state is retried after each of
  `PUSH_RETRY_DELAYS_MS` (500 ms doubling to 8 s) in turn, then every 8 s
  for as long as the push keeps failing, while the handshake stays
  reconciled and connected and the brain is not damaged; a newer edit's
  push takes over from the retries. Pends flush on the next reconciled
  handshake; until acknowledged they survive every status.
- STALENESS: a pulled brain whose compiled form is absent, was
  compiled from other source (its `sourceHash` differs from the
  source's hash -- someone edited the source out of band), or differs
  from the program the store's environment compiles of the source -- its
  pack vocabulary bound under other ids -- is recompiled from the pulled
  source and, when that compile succeeds, the fresh pair is pushed. The
  same holds for every held brain whenever the environment is rebuilt: a
  brain whose compiled form changes is pushed. A pulled source that parses but fails to compile is
  held with its diagnostics beside the project's compiled form as the
  last good one, and nothing is pushed. A pulled or held brain whose
  compile reads any of its tiles as one the environment does not hold
  -- a pack tile while no catalog binds its pack -- is held the same
  way at its last good compiled form, and nothing is pushed for that
  compile; once a later catalog or allocation resolves every tile, the
  rebuild recompiles it and pushes the fresh pair when it differs.
- COMPILED-FORM HEALING: because the list reports the compiled form, a
  project whose `brains.g.ts` lost or garbled a brain's registration --
  the file deleted in MakeCode's Explorer, an entry damaged, a
  registration left from other source -- has that brain pulled even
  when the store's copy of the source matches, and the staleness rule
  pushes the fresh pair, rewriting the module. Every brain whose
  registration is current is left alone. Healing happens when a
  handshake reconciles: a fresh editor tab, or a port MakeCode brokers
  anew to a respawned column frame. Damage done while a handshake stays open is not seen
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

## The brand strip

The simx frame is a visible strip in the simulator column: the Wendoo
logotype and one button, and nothing else -- no status, no code, no
authoring, no catalog, no product behavior. The simx renders it at boot,
whatever MakeCode offers, and the strip stores nothing.

- MARKUP: a section carrying `data-testid="simx-strip"` whose one row
  holds the logotype, linking to https://wendoo.com and carrying
  `data-link="home"`, and the open-editor button
  (`data-action="open-editor"`).
- OPEN EDITOR: the button posts MakeCode the open request
  `{ type: "simxeditor", subtype: "open", id }`; a refusal is logged by
  its code (`UNREGISTERED`, `PERMISSION_DENIED`, `UNAVAILABLE`,
  `INVALID_REQUEST`). On a MakeCode that offers no editor tab, no port
  arrives and the request is refused and logged.
- THE LOGOTYPE LINK opens through a click probe: the strip opens a blank
  tab, cuts its `opener`, and navigates it to the link's URL. A frame
  sandboxed without `allow-popups` makes the browser refuse the tab; the
  strip then replaces the link in place with its URL as selectable text
  and selects it, for the person to copy. The registration grants
  `allowPopups` for this link (see "The editor tab's in-page session",
  above).

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
  to it. The ping is that first packet, so the frame and its brand
  strip appear as soon as any program that includes the extension runs,
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
configuration. Nothing in the session participates in
those decisions.

## Local development

The full stack runs locally:

- The editor and the simx: `npm run dev` in `makecode/simx/wendoo`
  (port 5175, pinned with `strictPort` by its dev config, matching the
  `devUrl` its `approvedRepoLib` entry registers; `npm run dev -- --port
  <port>` serves it elsewhere, and the registration must then name that
  port). The editor is served at the root, the page the registration's
  `editor` names, and the simx at `simx/index.html`, the `index` the
  registration names.
- MakeCode: `pxt serve` from a dev target checkout whose pxt offers the
  editor tab, with the simx registered by localdev URL (an
  `approvedRepoLib` entry carrying `devUrl`) and loaded via the
  `simxdev` URL parameter.

The harness exercises the extension's emission headlessly on both
provisioned targets, and three port specs make up the composed
acceptance tier. `makecode/simx/wendoo/src/editor/services/brains-sync-port.spec.ts`
composes the editor tab's session store and brains store over a real
`MessageChannel`, against a column frame the spec plays over the raw
port and against the simx's port bridge serving an in-memory MakeCode
project (`makecode/simx/wendoo/src/simx/test-support/projfs-host.ts`,
which applies MakeCode's projfs rules -- scope, visibility, quota,
deferral over the rate, binding to the project a request arrived in,
refusal of an unserved frame -- and plays MakeCode's text editor sharing
the project: the open file's buffer, its reload on a write, its
save-back on a file switch, and debounced saves of typing that wait for
a reload; each rule has a switch whose control specs prove a spec's
outcome rests on it). `makecode/simx/wendoo/src/simx/simx-port-bridge.spec.ts`
drives the simx's port bridge from a raw editor end of the port, and
`packages/protocol/src/makecode-port-editor-session.spec.ts` drives the
port-backed session object against the kind's own session over a
`MessageChannel`.
