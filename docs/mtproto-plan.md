# MTProto Implementation Plan

The implementation plan for Yuigram's second transport. [mtproto.md](mtproto.md) is the
protocol specification — what the protocol requires. This document is the engineering plan —
how the subsystem is built, in what order, against what tests, behind what boundaries.

It takes the Bot API subsystem as it stands and proposes no changes to it beyond three small
generalizations named in §5.

---

## 1. Current state

### What exists

| Layer | State |
|---|---|
| `@yuigram/core` | Complete and transport-agnostic. Dispatch, middleware, filters, the context contract, sessions, `KV` storage, the error taxonomy, logging with redaction, lifecycle, plugins. Nothing in it mentions Telegram. |
| `@yuigram/bot-api` | Complete. HTTP transport, polling, webhooks, the generated Bot API surface, per-event contexts, bound methods, router, filters, hooks, throttling, scheduler, streaming uploads. |
| `@yuigram/mtproto` | Private and unpublished. The cryptographic layer and the TL codec are complete and verified offline; both are internal, so the package entry point still exports one constant. Nothing above the codec exists yet. |
| `yuigram` | Façade over core and bot-api. No MTProto entry point. |
| `tools/schema` | Bot API schema pipeline: fetch, parse, IR, emitters, diff. Deterministic and reproducible offline. |
| `tools/invariants` | Five CI-enforced rules, including `no-telegram-dependencies`, `layer-boundaries` and `module-boundaries`. |
| `schemas/tl/` | The raw `.tl` for both schemas, their parsed IR, and the pinned layer. |
| `docs/protocol-notes/` | Empty, with a README describing its purpose. |

### What the core already gets right for two transports

The core was written for this and needs no rework:

- `BaseContext.transport` is the discriminant a cross-client handler branches on.
- `BaseContext` names no Telegram entity, so MTProto contexts intersect onto it exactly as Bot
  API contexts do.
- `Dispatcher` is generic over the context and keys on `kind`, a plain string.
- `FloodError` and `TelegramError` already carry an original error and a `retryAfter`, which
  `FLOOD_WAIT_N` maps onto without a new type.
- `PeerError`, `AuthError` and `SessionError` exist and are unused by the Bot API — they were
  reserved for this subsystem.
- `SchedulerOptions.keyOf` is caller-supplied, so a transport that orders by something other
  than a chat supplies its own key function without the scheduler changing.

### Scale

The measured reference for a complete implementation is roughly 25,000 hand-written lines plus
a large body of generated code, against 2,315 TL entries and 552 error types at the layer
measured on 2026-08-19. Generated TL declarations are the dominant artifact and the dominant
consumer-side cost.

---

## 2. Research findings

The existing research is strong on protocol mechanics and thin on three things: how the TL
schema enters the repository, how a connection announces itself, and what the public `Account`
surface actually promises. Those are the gaps that matter, because each is a decision the first
line of code commits to.

### 2.1 Gaps

**G1 — The TL schema is two schemas, and the plan treats it as one.**
[mtproto.md](mtproto.md) §4 describes a single pipeline from `core.telegram.org/schema`.
Telegram publishes two TL schemas with different lifetimes and different uses:

- `mtproto.tl` — the service layer: `msg_container`, `rpc_result`, `rpc_error`,
  `bad_msg_notification`, `bad_server_salt`, `new_session_created`, `msgs_ack`, `future_salts`,
  `ping`/`pong`, `gzip_packed`, and the plaintext handshake constructors (`req_pq_multi`,
  `resPQ`, `server_DH_params_*`, `set_client_DH_params`). Layer-independent; changes almost
  never.
- `api.tl` — the API layer: 2,300-odd constructors and methods, versioned by layer, changing
  every few weeks.

They must emit **separate modules with separate constructor tables**. The handshake
constructors are read and written *without* an auth key and before a session exists, and the
plaintext channel must accept only `mtproto.tl` constructors — a restriction that is only
expressible if the tables are distinct. Fusing them also couples the service decoder to an API
layer bump.

*Settled by D2.* Three tables, with the shared TL primitives in a `core` the other two import.
[codegen.md](codegen.md) §3.2.

**G2 — Connection initialization is unspecified.**
Every connection must wrap its first API call:

```
invokeWithLayer(layer, initConnection(api_id, device_model, system_version, app_version,
                                      system_lang_code, lang_pack, lang_code, query))
```

Nothing in the current research states this, which call carries it, or what happens on
reconnect. Omitting it produces a connection that authenticates and then fails every API call.
It also fixes the shape of the public options object, because `api_id` and the device strings
come from the user.

**G3 — `api_id` / `api_hash` policy is undecided.**
An MTProto client cannot connect without an application identifier registered at
`my.telegram.org`. This is a product decision with a security consequence: a framework that
ships a shared identifier gets that identifier — and every application using it — restricted.
The position must be explicit: Yuigram ships none, requires the user's own, treats both values
as secrets under the existing redaction rules, and documents registration as a prerequisite
rather than an aside.

**G4 — Prime validation cost is acknowledged but not solved.**
§5.2 requires Miller-Rabin on a 2048-bit `dh_prime` and on `(p-1)/2`, and says to "cache the
validation result" without saying where the cache lives or what it holds. A full validation
over `BigInt` costs on the order of hundreds of milliseconds and sits on the connection path.
The mechanism belongs in the specification: a pinned table of SHA-256 digests of primes that
have passed full validation, consulted first; a full check for anything absent from it; the
result of a full check persisted by digest. The check is never skipped for an unknown prime and
the table is never user-configurable.

*Settled and implemented.* [mtproto-crypto.md](mtproto-crypto.md) §3.5.

**G5 — AES-IGE over `node:crypto` has two traps the research does not name.**
`createCipheriv('aes-256-ecb', …)` applies PKCS#7 padding unless `setAutoPadding(false)` is
called, which silently corrupts every IGE operation — and corrupts it in a way a round-trip
test written against the same mistake will not catch. Separately, IGE cannot be batched: each
block's cipher *input* depends on the previous block's output, so the block function is applied
sequentially in both directions. What is avoidable is constructing a cipher object per block,
which is what dominates the cost; one instance per call, driven with repeated `update()` calls,
is the shape that performs. Both belong in the primitive's specification.

*Settled and implemented.* [mtproto-crypto.md](mtproto-crypto.md) §3.2.

**G6 — The raw API's relationship to the peer cache is undecided.**
[unified-model.md](unified-model.md) §2 lists the raw API as deliberately not unified and shows
`user.api.messages.sendMessage({…})`. Almost every TL result carries `users` and `chats` arrays
whose contents must reach the peer cache, or the cache degrades in a way that surfaces later as
unresolvable peers. So `account.api` cannot be a transparent passthrough. Either it harvests
peers on the way out — making "raw" mean "not wrapped by a convenience method", still
integrated — or it does not, and a second integrated path exists. The first is correct, and the
plan has to say so: it is the difference between an escape hatch and a foot-gun.

**G7 — There is no `App` container.**
[api-design.md](api-design.md) describes an `App` holding several clients, and
[unified-model.md](unified-model.md) §6 shows handlers registered on it. Nothing implements it,
and the Bot API subsystem does not need it. It becomes necessary the moment a second client
type exists, and its design — shared dispatch with a `transport` discriminant, per-client
lifecycle, one `stop()` covering all of them — is unspecified.

### 2.2 Assumptions worth correcting

**A1 — "Reference point: TL layer 223" reads as a target; it is a measurement.**
The layer will move several times before the subsystem is complete. The generator is
layer-parametric from its first commit, the committed snapshot is layer-tagged in its filename
exactly as the Bot API snapshot is version-tagged, and no layer number appears as a constant
outside the generated schema module and the `invokeWithLayer` call.

**A2 — "Every constructor round-trips" is necessary and not sufficient.**
A round-trip over a generated corpus proves the writer and reader agree with each other. It does
not prove either agrees with Telegram. The corpus needs fixed byte vectors for the encodings
that are easy to get self-consistently wrong: conditional `true` fields, bare vectors, `flags`
with no bits set, empty strings at the 253/254 length boundary, and `int128`/`int256` byte
order.

**A3 — Test datacenters de-risk less than the roadmap implies.**
Test DCs validate the handshake, sign-in and basic RPC. They do not produce update gaps,
`differenceTooLong`, `min` peers at scale, CDN redirects or file-reference expiry, because those
need a populated, actively-used account. The mock server is the primary instrument for
everything above the session layer.

**A4 — The 0.5 s reorder tolerance is a starting value, not a specification.**
`core.telegram.org/api/updates` describes waiting before recovering without fixing the interval.
It is a named constant with a documented default, and the updates manager's tests do not depend
on its exact value.

### 2.3 Protocol details requiring verification

Observed against test datacenters or a real account, with findings recorded in
`docs/protocol-notes/`. None blocks the phases below the session layer.

| # | Question | Where it bites |
|---|---|---|
| V1 | Which `bad_msg_notification` error codes occur in practice, and whether 16/17 arrive before or after the first successful call | Time-offset correction |
| V2 | Whether `future_salts` prefetch is required to avoid a visible stall at salt rotation | Session layer |
| V3 | Which `inputPeer*FromMessage` variants the server accepts for each `min` peer origin | Peer resolution |
| V4 | The granularity of CDN `file_hashes` relative to requested chunk boundaries | File download |
| V5 | Whether `updates.getDifference` returns `differenceSlice` often enough to require a pagination loop in practice, and the effective `limit` for user versus bot accounts | Gap recovery |
| V6 | Rate limits on `contacts.resolveUsername` and `users.getUsers` | Peer resolution |
| V7 | Whether `msgs_state_req` is ever server-initiated in normal operation | Session layer |
| V8 | Behaviour of `upload.getFile` when `offset` straddles a 1 MB boundary, to confirm the documented constraint is enforced rather than advisory | File download |

### 2.4 Where the Bot API stays independent

`bot-api` imports nothing from `mtproto`, and the reverse holds. This is enforced by the
`layer-boundaries` invariant and does not relax for any of the work below. None of the
following acquires an MTProto variant, a shared base type, or a conditional branch:

`Update`, `Chat`, `Message` and the rest of the generated Bot API types; `file_id` and the
`InputFile` model; `ApiMethods` and the generated method surface; the multipart encoder;
polling; webhook handlers and their framework adapters; the Bot API error mapping.

The two transports converge at the normalizer's output and nowhere below it.

---

## 3. Architecture

Bottom-up. Each subsystem states its responsibility, inputs and outputs, public boundary,
dependencies, test strategy and failure modes.

### 3.1 TL schema representation

**Responsibility.** Turn TL notation into a stable, layer-tagged intermediate representation,
and emit types, codec tables and error classes from it.

**Inputs.** `api.tl` and `mtproto.tl` text; a layer number.
**Outputs.** `schemas/tl/api.<layer>.json`, `schemas/tl/mtproto.json`; generated modules.

**Public.** Nothing. The IR is internal to `tools/tl`; consumers see only generated output.

**Depends on.** Nothing at runtime. Shares only text rendering with `tools/schema`.

**Boundary decision.** `tools/tl` is a **new tool package**, not an extension of
`tools/schema`. The Bot API schema is a JSON description of an HTTP API; TL is a grammar with
constructor identifiers, bitfield-conditional fields and a bare/boxed distinction. The two IRs
have nothing in common but the word "schema". Sharing the emitter's string rendering is
reasonable; sharing an IR would be the fake abstraction this project rejects elsewhere.

**Tests.** A fixture grammar covering every construct before the parser sees the real schema:
flags, `flags.N?true`, bare vectors, `%Type`, namespaces, generic methods, explicit and computed
constructor ids. Then the full schema parses with zero unrecognized constructs, and every
computed id matches the declared one.

**Failure modes.** A construct the parser silently skips, producing a codec that is correct for
what it knows and absent for the rest. Guarded by requiring the parse to be total: an
unrecognized line is an error, never a skip.

### 3.2 TL serialization and deserialization

**Responsibility.** Read and write TL binary for every constructor in both schemas.

**Inputs.** Bytes, or a typed object plus a constructor id.
**Outputs.** A typed object, or bytes.

**Public.** `TlReader`, `TlWriter`, the generated type namespace, the generated error classes.
The reader and writer are public because the raw API needs them; the constructor tables are not.

**Depends on.** Generated tables only. No crypto, no I/O.

**Tests.** Byte vectors for the primitives and for the constructors named in A2; a generated
round-trip over every constructor; a bounded-input suite asserting that a truncated, over-long
or self-referential payload raises rather than allocates.

**Failure modes.** Unbounded allocation from a hostile length prefix; infinite recursion on a
nested container; silent field misalignment when a flag is misread, which corrupts every
subsequent field rather than failing where the error is. The reader carries an explicit
remaining-bytes bound and rejects any length exceeding it before allocating.

### 3.3 Cryptographic primitives

**Responsibility.** The operations Telegram requires that `node:crypto` does not provide.

**Inputs / outputs.** Bytes and `BigInt`. Pure functions: no state, no I/O, no logging.

**Public.** Not exported from the package's public entry point. Reachable only inside
`@yuigram/mtproto`, because a published cryptographic surface is a support obligation and an
invitation to misuse.

**Depends on.** `node:crypto` for SHA-1/256/512, PBKDF2, AES-CTR, AES-ECB and the CSPRNG.
Native `BigInt` for modular arithmetic.

**Inventory.** AES-256-IGE; RSA with `rsa_pad` and the legacy padding; PQ factorization;
Miller-Rabin; safe-prime and generator validation; SRP 6a with Telegram's KDF; constant-time
comparison. Nothing beyond this list is written, and nothing on it is invented — each is an
implementation of a published algorithm.

**Tests.** Known-answer vectors for every primitive, committed before the primitive is written.
Encrypt/decrypt round-trips. Block-boundary cases for IGE, including the IV split. The
`rsa_pad` retry path when the padded value is not below the modulus. Miller-Rabin against
Carmichael numbers. Safe-prime validation accepting Telegram's published prime and rejecting
deliberately unsafe ones.

**Failure modes.** Silent misuse of `node:crypto` defaults (G5); a timing-variable comparison on
secret material; a validation returning a truthy non-boolean. Every validation returns a
boolean and every secret comparison goes through the constant-time helper.

### 3.4 Transport

**Responsibility.** Frame and unframe payloads; obfuscate the stream; own the socket.

**Inputs.** A payload buffer; a DC address; an optional proxy secret.
**Outputs.** Framed bytes on the wire; complete payloads off it.

**Public.** The `Transport` interface, so an alternative — WebSocket, MTProxy, an in-process
test transport — can be supplied. The concrete TCP implementation is internal.

**Depends on.** `node:net`, `node:crypto` (AES-CTR). Nothing else.

**Tests.** Framing round-trips for all four framings, including the abridged length boundary at
127 and the padded variant's 0–15 byte tail. Obfuscation init-packet generation under fixed
seeded randomness. Partial-read reassembly: a payload delivered one byte at a time must produce
exactly one complete frame.

**Failure modes.** Reassembly bugs that appear only under fragmentation, which is why the
partial-read test drives a byte at a time rather than a whole frame.

### 3.5 Authorization

**Responsibility.** Obtain an auth key over the plaintext channel; bind temporary keys; run the
sign-in flows.

**Inputs.** A transport, the server RSA keys, the user's credentials.
**Outputs.** An auth key, its identifier, the initial salt, the server time offset.

**Public.** The sign-in surface on `Account` — phone, code, password, bot token, QR, resume.
The handshake itself is internal.

**Depends on.** Crypto, TL (the `mtproto.tl` table only), transport, storage.

**Non-negotiable.** Every check in [mtproto.md](mtproto.md) §5.2 runs unconditionally. No
option, flag, environment variable or constructor parameter disables one; the functions that
perform them take no options object.

**Tests.** The handshake runs against the mock server with a fixed key pair, seeded randomness
and a fixed clock, so the exchange is byte-reproducible. Each mandatory check gets a test
supplying a value that must be rejected: a composite `dh_prime`, a `g_a` at the boundary, a
mismatched nonce, a `pq` that is prime, an answer whose SHA-1 prefix does not match. Then the
same flow against a test DC, which validates the reading of the specification against the
server.

**Failure modes.** A check that is implemented but unreachable because an earlier branch returns
first. Each rejection test asserts the specific error, not merely that something threw.

### 3.6 Session layer

**Responsibility.** The encrypted message layer: identifiers, sequence numbers, salts,
acknowledgements, containers and the RPC lifecycle.

**Inputs.** An auth key, a transport, outgoing RPC calls.
**Outputs.** RPC results and errors; decoded server-initiated messages forwarded upward.

**Public.** `invoke(method, params, options)` and the connection state it exposes. Everything
about `msg_id`, `seq_no` and salts is internal — a caller that can observe them will eventually
depend on them.

**Depends on.** Crypto, TL, transport, storage.

**Tests.** Driven entirely by the mock server, which injects each condition from
[testing.md](testing.md) §3.2 deliberately. `seq_no` correctness gets its own suite, because
the server's response to getting it wrong is silence rather than an error.

**Failure modes.** This is where silent message loss originates. An unacknowledged message never
resent; a `bad_server_salt` handled by reconnecting instead of adopting the salt and replaying;
a `new_session_created` that resets state without notifying the updates layer. Each produces a
client that passes every test written against a well-behaved server and loses messages in
production.

### 3.7 Datacenters, pools and migration

**Responsibility.** Know where the datacenters are, hold connections to them, and follow
migration instructions.

**Inputs.** Bootstrap addresses; `help.getConfig`; migration errors.
**Outputs.** A connection appropriate to a given call.

**Public.** Nothing directly. Migration is invisible by design: a call that receives
`FILE_MIGRATE_X` is retried on the right DC and returns its result, not the error.

**Depends on.** Session, storage, auth (for `exportAuthorization`/`importAuthorization`).

**Pools.** One main connection per DC for RPC and updates; up to eight upload and eight download
connections; one or two for small media. File connections use separate `session_id` values over
the same auth key.

**Tests.** Each migration error against the mock server, asserting the call completes on the
target DC and the authorization transfer happened exactly once. Pool behaviour under concurrent
transfers, asserting a large download does not starve interactive RPC.

**Failure modes.** A migration loop when two DCs redirect to each other, guarded by a bounded
redirect count that surfaces an error rather than spinning.

### 3.8 Peers and access hashes

**Responsibility.** Maintain the mapping from peer identity to a usable input reference.

**Inputs.** `users` and `chats` arrays from every update and every RPC result; username lookups.
**Outputs.** `InputPeer` values, or an honest `PeerError`.

**Public.** `account.resolve(ref)` and the `Peer` handle. The cache is internal.

**Depends on.** Storage (the peers repository), session (for `contacts.resolveUsername`).

**Rules.** A `min` peer never overwrites a full cached peer. An unresolvable peer produces
`PeerError`; no hash is ever fabricated and no failure is ever silent. Harvesting runs on every
result, including results of raw API calls (G6).

**Tests.** `min` peers arriving before and after the full peer; `access_hash` rotation; username
resolution and its cache; a peer referenced by an update but absent from its `users`/`chats`
arrays.

**Failure modes.** Cache poisoning by a `min` peer, which degrades permanently and surfaces far
from the cause. The overwrite rule is tested directly rather than inferred from behaviour.

### 3.9 Files

**Responsibility.** Chunked upload and download, across DCs, through CDNs, with automatic
reference refresh.

**Inputs.** A local source or an `InputFileLocation`; a destination.
**Outputs.** An uploaded file reference, or a stream of bytes.

**Depends on.** Session, DC pool, crypto (CDN AES-CTR and SHA-256), peers (for reference
origins).

**Public.** `account.upload()` / `account.download()` and the source model. Alignment rules,
part sizing and CDN handling are internal.

**Rules.** CDN chunk hashes are verified, always — CDN nodes are not operated by Telegram.
`FILE_REFERENCE_EXPIRED` refetches the origin and retries once, invisibly.

**Tests.** Alignment constraints as property tests over offset and limit. CDN redirect with
valid and with deliberately invalid hashes, asserting the invalid case fails rather than
returning corrupt bytes. Reference expiry and refresh. Partial chunk delivery and resumption.

**Failure modes.** Accepting unverified CDN bytes; an infinite refresh loop when the refetched
origin also yields an expired reference, bounded by the single retry.

### 3.10 Updates, state and gap recovery

**Responsibility.** Turn a stream of TL updates into an ordered, gap-free, deduplicated
sequence.

**Inputs.** `updates*` constructors from the session layer; the persisted state.
**Outputs.** Updates in order, ready for the normalizer; a persisted `pts`/`qts`/`seq`/`date`.

**Public.** Nothing. The manager's correctness is its whole interface.

**Depends on.** Session, peers, storage.

**State.** One common box (`pts`, `qts`, `seq`, `date`) and one `pts` box per channel. The boxes
are independent and recover independently.

**Ordering.** This is where the subsystem meets the shared scheduler. Bot API updates are ordered
per chat. MTProto updates are ordered **per box** — the common box or a specific channel —
because that is the unit `pts` sequences. The scheduler's `keyOf` is supplied by the transport,
so MTProto keys on box identity and gets correct ordering from the same scheduler without
either transport learning about the other.

**Tests.** Every branch of the gap algorithm, driven by a mock server that produces gaps,
reordering inside and outside the tolerance window, duplicates, `updatesTooLong`,
`differenceTooLong`, paginated `getChannelDifference`, `CHANNEL_PRIVATE` and
`new_session_created` mid-stream. Recorded-session replay for conditions too rare to script.

**Failure modes.** The whole subsystem. Silent message loss, duplicate dispatch, unbounded
postponement queues, and a recovery loop that never reaches `final`. The mock server exists
because none of these can be provoked reliably on the live network.

### 3.11 Normalizer

**Responsibility.** Convert TL updates into Yuigram events.

**Inputs.** An ordered TL update plus the peers it references.
**Outputs.** A context intersecting `BaseContext`, with `transport: 'mtproto'`.

**Public.** The event kinds and context types, which are the MTProto half of the public surface.

**Depends on.** Peers, TL types, core's context contract.

**Boundary.** This is the seam. Below it nothing is shared with the Bot API; above it
everything is.

**Tests.** Fixture TL updates in, expected contexts out. The dispatch, filter and middleware
suites that cover the Bot API, re-run against MTProto contexts, asserting core behaves
identically whichever transport produced the event.

### 3.12 Storage

**Responsibility.** Persist authorization state: auth keys, temporary keys, salts, DC options,
peers, update state, the current user.

**Public.** The driver interface, so an application can supply its own. The repositories and the
service are internal.

**Shape.** Driver / repository / service, per [storage.md](storage.md) §4. The peer repository
is not `KV` and does not become `KV`: it needs indexed lookup by id, username and phone, and it
is written on every update.

**Failure policy.** Authorization storage failure is fatal — the client refuses to start rather
than silently re-authenticating. Framework session storage keeps its existing degrade-and-warn
policy. The two are different contracts because their failures mean different things.

**Tests.** A conformance suite every driver passes, including persistence across a simulated
restart, concurrent writes, and the exclusive-lock behaviour of the file driver.

### 3.13 Account types and the public client

**Responsibility.** The client an application constructs.

```
Account.fromSession(path, { apiId, apiHash })    resume a stored session
Account.fromPhone({ apiId, apiHash, phone })     interactive sign-in
Account.fromQr({ apiId, apiHash })               QR sign-in
Account.fromBotToken(token, { apiId, apiHash })  bot over MTProto — post-1.0
```

Named constructors, matching the decision already taken for `Bot`. `Account` satisfies the same
lifecycle contract as `Bot`: `connect()`, `stop({ timeout })`, `onError`, the same registration
vocabulary, the same router, the same filters, the same sessions.

`account.api` is the raw TL surface, and it harvests peers (G6). Raw means "not wrapped by a
convenience method", not "outside the framework".

### 3.14 The Bot API / MTProto boundary

Three rules, all mechanically enforced:

1. `@yuigram/bot-api` and `@yuigram/mtproto` never import each other — `layer-boundaries`.
2. No foreign type reaches the public surface of either — `public-surface-is-clean`.
3. Neither acquires a runtime dependency on any Telegram library — `no-telegram-dependencies`.

The invariant tool already runs all three. No new enforcement is required; the existing rules
extend to the new package for free.

### 3.15 The unified high-level surface

`App` holds several clients and dispatches across them:

```ts
const app = new App()
app.add(Bot.fromToken(token))
app.add(Account.fromSession('./me', { apiId, apiHash }))

app.onMessage(async (message) => {
  await message.reply('works on both')
  if (message.transport === 'mtproto') { /* narrowed to Account */ }
})

await app.start()
```

`App` owns no protocol logic. It is a dispatcher, a lifecycle and a registration surface over
clients that each already have their own. Handlers registered on a client keep full fidelity
with no discriminant; handlers registered on `App` receive the common subset and branch.

---

## 4. Shared, Bot API only, MTProto only

The rule that governs the classification: a component is SHARED only if it behaves the same way
for both transports, not if it merely has a counterpart in both.

| Component | Class | Why |
|---|---|---|
| Dispatcher, middleware, filter algebra | **SHARED** | Operate on normalized events. Already transport-agnostic and already serving one transport. |
| `BaseContext`, `Flavor`, context extension | **SHARED** | Names nothing Telegram-specific; `transport` is already the discriminant. |
| Framework sessions, `KV` storage | **SHARED** | A framework concern with no protocol content. |
| Logging and redaction | **SHARED** | Patterns extend to auth keys and `api_hash`; the mechanism is unchanged. |
| Error taxonomy | **SHARED** | `FloodError` already carries `retryAfter`; `FLOOD_WAIT_N` maps onto it. `PeerError`, `AuthError` and `SessionError` were reserved for this subsystem. |
| `Lifecycle` | **SHARED** | Start, stop, drain, one deadline. Per-DC connection state lives *under* it, not in place of it. |
| Scheduler | **SHARED**, after C1 | Per-key ordering plus a concurrency bound plus backpressure is transport-neutral. It currently types its argument as the Bot API `Update`. |
| Hook chain around outgoing calls | **SHARED**, after C2 | `ApiHook` is defined over a Bot API call shape; the mechanism generalizes. `retryOnFloodWait` generalizes with it. |
| Inbound rate limiting | **SHARED** | Already written against `BaseContext` and `Middleware`. No change. |
| Router | **SHARED**, after C3 | Currently generic over the Bot API registration surface; generalizes over a registration-surface parameter. |
| Testing harness *shape* | **SHARED** | The `mockBot()` pattern — real pipeline, network replaced — applies to `mockAccount()`. The implementations share nothing. |
| HTTP client, multipart, streaming uploads | **BOT API ONLY** | There is no HTTP in MTProto. |
| Polling and webhooks | **BOT API ONLY** | MTProto updates arrive on a socket the client already holds. |
| `file_id`, `InputFile` | **BOT API ONLY** | A Bot API construct with no MTProto equivalent that does not require a round trip. |
| Bot API generated types and methods | **BOT API ONLY** | A different schema, a different type universe. |
| Bot API throttling defaults | **BOT API ONLY** | Those are HTTP-API limits. MTProto's `FLOOD_WAIT` is server-driven per method and needs its own policy. |
| Crypto primitives | **MTPROTO ONLY** | The Bot API is HTTPS and needs none of them. |
| TL parser, codec, generated schema | **MTPROTO ONLY** | A different grammar with different semantics from the Bot API schema. |
| Transport framing and obfuscation | **MTPROTO ONLY** | — |
| Authorization, DH, SRP, PFS | **MTPROTO ONLY** | The Bot API's credential is a string in a URL. |
| Session layer | **MTPROTO ONLY** | — |
| DC pool and migration | **MTPROTO ONLY** | The Bot API has one endpoint. |
| Peer repository, `access_hash` lifecycle | **MTPROTO ONLY** | The single hardest asymmetry. A `chat_id` needs no cache. |
| Updates manager, gap recovery, `pts`/`qts`/`seq` | **MTPROTO ONLY** | Telegram does this server-side for the Bot API. |
| File references and CDN | **MTPROTO ONLY** | — |
| Normalizer | **PER TRANSPORT** | One each. The seam itself, not a shared component. |
| Raw API | **PER TRANSPORT** | Two type universes, deliberately not merged. |

Four things that look shareable and are not:

- **A unified `Message` entity.** Message identifiers are not interchangeable between the two
  systems; a shared type would be a union pretending to be a product type.
- **A unified peer reference.** `chat_id` is stateless and permanent; `(id, access_hash)` is
  per-account and non-derivable. A signature that works on one and fails unpredictably on the
  other is worse than two honest signatures.
- **One storage contract.** Framework sessions are key-value; authorization state is a
  structured multi-table store with an indexed peer table. Merging them produces a `KV`
  interface with a peer-shaped hole.
- **One update-delivery path.** Server-ordered polling and client-side gap reconciliation share
  no code and no state.

---

## 5. Module boundaries

### Packages

```
packages/
├── core/          unchanged in substance; gains Hook<TCall> and a generalized scheduler
├── bot-api/       unchanged except for three import-site adjustments
├── mtproto/       the subsystem
└── yuigram/       façade; gains an MTProto entry point and App

tools/
├── schema/        Bot API pipeline — unchanged
├── tl/            new: TL fetch, parser, IR, emitters
└── invariants/    unchanged; existing rules cover the new package
```

### Inside `@yuigram/mtproto`

```
src/
├── crypto/       ige · rsa · factorize · primes · srp · constant-time
├── tl/           reader · writer · registry (runtime, table-agnostic)
├── generated/
│   ├── core/         vector · Bool · True · Error · Null
│   ├── mtproto/      service constructors, functions, registry
│   └── api/          layer constructors, functions, errors, registry
├── transport/    framing · obfuscation · tcp · interface
├── auth/         handshake · pfs · signin
├── session/      connection · msgid · acks · containers · rpc
├── net/          dc-map · pool · migration
├── storage/      driver · repository · service
├── peers/        cache · resolve · min
├── files/        upload · download · cdn · references
├── updates/      state · gaps · difference · dedupe
├── normalize/    tl updates -> events
├── account.ts    the public client
└── testing/      mock server (internal, not exported)
```

Each directory depends only on those above it in that list. The direction is checked by the
`declared-imports` invariant.

`generated/mtproto` and `generated/api` never import each other; both may import
`generated/core`. That is D2, and it is what keeps an API constructor from being decodable on
the plaintext handshake channel. See [codegen.md](codegen.md) §3.2.

### The three changes to existing code

The only modifications to shipped code the plan requires. All three are generalizations that
leave the Bot API's behaviour identical.

| # | Change | Reason | Risk |
|---|---|---|---|
| C1 | Move `Scheduler` to `@yuigram/core`, typed over an opaque payload with a required `keyOf` | MTProto keys ordering by update box, not by chat; the mechanism is otherwise identical | Low. `chatKeyOf` stays in `bot-api` and is passed in. Behaviour unchanged. |
| C2 | Introduce `Hook<TCall>` in core; redefine `ApiHook` as `Hook<ApiCall>` | The retry and throttle mechanism applies to TL calls; the shape is the same | Low. A type alias; no runtime change. |
| C3 | Generalize `Router` over its registration surface | So an MTProto router is the same class, not a copy | Medium. Touches inference on a public generic; covered by existing type tests. |

None is undertaken before the phase that needs it. C1 and C2 land with Phase 6; C3 with
Phase 10.

---

## 6. Implementation phases

Ten phases. Each is independently verifiable, and each states the tests that exist before the
implementation does. Complexity is relative effort, not a schedule.

### Phase 1 — Cryptographic primitives

**Objective.** Every primitive Telegram needs that `node:crypto` does not provide, verified
against known-answer vectors.

**Modules.** `crypto/ige.ts`, `crypto/rsa.ts`, `crypto/factorize.ts`, `crypto/primes.ts`,
`crypto/srp.ts`, `crypto/constant-time.ts`, `crypto/index.ts`.

**Depends on.** Nothing. This phase can begin immediately.

**Tests first.** Vector files for AES-IGE, both RSA padding schemes, PQ factorization,
Miller-Rabin, safe-prime validation and SRP, each citing its source, committed before the
implementations.

**Acceptance.**
- Every primitive matches its vectors.
- IGE round-trips at block boundaries with the IV split applied correctly.
- `rsa_pad` exercises its retry path under seeded randomness.
- Miller-Rabin rejects Carmichael numbers.
- Safe-prime validation accepts Telegram's published prime and rejects unsafe ones.
- No primitive logs, and none takes an option that weakens a check.
- The prime-validation cache (G4) is present, keyed by digest, and never consulted in place of
  a full check for an unknown prime.

**Complexity.** Medium. Small surface, unforgiving correctness, fully offline.

### Phase 2 — TL parser and generator

**Objective.** Parse both schemas; emit three separate tables with their types, codecs and
errors; commit the raw text and the IR alongside the generated output.

Settled by D1–D4, recorded in [codegen.md](codegen.md) §3: the `.tl` text is canonical,
`mtproto.tl` and `api.tl` stay apart over a shared `core`, the layer is pinned at 223, and the
declarations are split by TL namespace under a 300 KB budget.

**Modules.** `tools/tl/src/{fetch,parse,ir,crc,emit/*,cli}.ts`; `schemas/tl/{api.223.tl,
api.223.json,mtproto.tl,mtproto.json}`; `packages/mtproto/src/generated/{core,mtproto,api}/**`;
`packages/mtproto/src/tl/{reader,writer,registry}.ts`.

Two enforcement gaps close here, because D2 and D4 are only real if something checks them:

- **A `module-boundaries` invariant.** The existing `layer-boundaries` and `declared-imports`
  rules resolve a specifier to a package name and skip relative ones, so neither can see
  `generated/mtproto` importing `generated/api`. The workspace collector already records every
  specifier including relative ones, so the rule is new logic over data that exists.
- **A declaration-size check.** The 300 KB budget is stated in three documents and enforced
  nowhere; the largest declaration today is 229 KB, under budget by luck rather than by gate.
  TL will emit far larger candidates.

**Depends on.** Phase 1 for nothing at runtime. CRC32 is added here, not there — it is a
checksum, not a cryptographic primitive, and it belongs with the parser that needs it.

**Tests first.**
- A fixture grammar exercising every construct in §3.5, with the expected IR written out.
- One rejection case per row of the malformed-input table in §3.1, asserting the specific
  failure rather than that something threw.
- Fixed byte vectors for the primitive encodings and for the constructors a self-consistent bug
  would pass: conditional `true`, bare vectors, empty `flags`, the 253/254 string boundary,
  `int128`/`int256` byte order.

**Acceptance.**
- Both documents parse totally; an unrecognised construct fails the fetch.
- Every computed constructor id matches the declared id.
- Three tables are emitted, and `mtproto` and `api` import neither each other nor each other's
  registry — enforced by the new `module-boundaries` invariant, with a deliberately violating
  fixture proving the rule fires.
- A reader built for the plaintext channel refuses an API constructor id.
- Branded ids make a cross-table call a compile error, asserted by a type test.
- Every constructor round-trips; the fixed byte vectors pass.
- No generated `.d.ts` exceeds 300 KB, enforced by a CI check rather than by inspection.
- The runtime codec module graph is acyclic; type modules may reference each other.
- Regeneration is byte-identical across runs, as the Bot API pipeline already is.
- `schemaInfo.tlLayer` reports 223 and nothing else exposes a layer.

**Explicitly out of scope for this phase.** No transport, no obfuscation, no handshake, no
session, no storage, no peers, no updates, and no `Account`. Phase 2 produces bytes-to-objects
and objects-to-bytes, and nothing that opens a socket.

**Complexity.** High. The largest single artifact in the subsystem.

### Phase 3 — Transport

**Objective.** All four framings, obfuscation, and a socket implementation behind an interface.

**Modules.** `transport/{framing,obfuscation,tcp,types}.ts`.

**Depends on.** Phase 1 for AES-CTR usage.

**Tests first.** Framing round-trips including the abridged 127-byte boundary; obfuscation init
packets under seeded randomness; a byte-at-a-time reassembly harness.

**Acceptance.** Every framing round-trips; fragmented delivery reassembles exactly; the
obfuscation init packet matches a fixed expected value for a fixed seed; the interface admits an
in-process test transport.

**Complexity.** Medium.

### Phase 4 — Mock MTProto server

**Objective.** The instrument the rest of the subsystem is verified against. Built before the
code it tests, because a session layer tested only against a well-behaved server is untested.

**Modules.** `testing/server/*` — internal, never exported.

**Depends on.** Phases 1–3. It speaks real MTProto.

**Acceptance.** The server produces, on demand, every condition in [testing.md](testing.md)
§3.2: salt changes, each `bad_msg_notification` code, `new_session_created`, dropped
acknowledgements, reordering, duplication, connection drop mid-RPC, containers, gzip, clock skew
past both rejection windows, update gaps, `updatesTooLong`, `differenceTooLong`, paginated
channel difference, `CHANNEL_PRIVATE`, `min` peers, `FILE_MIGRATE_X`,
`FILE_REFERENCE_EXPIRED`, CDN redirects with valid and invalid hashes, every migration error and
the flood-wait family. Behaviour is fully deterministic under a fixed seed and a fixed clock.

**Complexity.** High. An investment whose return is every phase after it.

### Phase 5 — Authorization handshake

**Objective.** Obtain a real auth key with every mandatory security check enforced.

**Modules.** `auth/{handshake,pfs,keys}.ts`.

**Depends on.** Phases 1–4.

**Tests first.** A rejection test per mandatory check, each asserting the specific error.

**Acceptance.** A key is negotiated against the mock server byte-reproducibly and against a test
DC for real; every §5.2 check has a test that fails without it; no check is reachable by a path
that skips it; temporary keys bind and expire.

**Complexity.** High.

### Phase 6 — Session layer and storage

**Objective.** The encrypted message layer, and somewhere to persist what it learns.

**Modules.** `session/*`, `storage/*`. Lands C1 and C2.

**Depends on.** Phases 1–5.

**Tests first.** One test per injectable condition from Phase 4; a dedicated `seq_no` suite.

**Acceptance.** Every condition the mock server injects is handled correctly; no message is lost
under dropped acknowledgements; salt rotation is invisible to callers; time offset is learned
and applied; cancellation propagates to an in-flight RPC; an auth key survives a process
restart; authorization storage failure is fatal rather than silent.

**Complexity.** Very high. The layer where silent loss originates.

### Phase 7 — Datacenters, migration and sign-in

**Objective.** Multiple DCs, authorization transfer, and the ways a user signs in.

**Modules.** `net/*`, `auth/signin.ts`.

**Depends on.** Phase 6.

**Tests first.** Each migration error against the mock server; a redirect-loop bound.

**Acceptance.** Every migration error resolves transparently; authorization transfers once;
phone, 2FA, bot-token, QR and resume flows complete against a test DC; connection pools keep a
bulk transfer from starving interactive RPC.

**Complexity.** High.

### Phase 8 — Peers and files

**Objective.** Address arbitrary peers correctly; move large files reliably.

**Modules.** `peers/*`, `files/*`.

**Depends on.** Phase 7.

**Tests first.** `min`-peer ordering cases; alignment property tests; CDN hash verification with
a deliberately invalid hash.

**Acceptance.** A `min` peer never overwrites a full one; unresolvable peers raise `PeerError`;
harvesting runs on raw calls too (G6); alignment constraints hold for every offset and limit;
invalid CDN hashes fail rather than returning bytes; expired file references refresh once,
invisibly.

**Complexity.** High. The long tail lives here.

### Phase 9 — Updates manager

**Objective.** An ordered, gap-free, deduplicated update stream.

**Modules.** `updates/*`, `normalize/*`.

**Depends on.** Phase 8, and on Phase 4 extended for update conditions.

**Tests first.** Every branch of the gap algorithm, each named, before the manager exists.

**Acceptance.** Every branch has an explicit test; no loss or duplication under injected gaps,
reordering and duplicates; recovery terminates on every path including `differenceTooLong` and
a channel difference that paginates; postponement queues are bounded; the no-dispatch index
suppresses updates already seen as RPC results; recorded-session replay passes.

**Complexity.** Very high. This phase decides whether the subsystem can be trusted.

### Phase 10 — `Account`, `App` and unification

**Objective.** The public client, the multi-client container, and one programming model over
both transports.

**Modules.** `account.ts`, `testing/mock-account.ts`, the façade's MTProto entry point, `App`.
Lands C3.

**Depends on.** Phase 9.

**Tests first.** The core dispatch, filter, middleware, session and router suites, re-run
against MTProto contexts.

**Acceptance.** `Account` satisfies the same lifecycle contract as `Bot`; a handler written
against `App` runs on both clients and narrows correctly on `transport`; core behaves
identically whichever transport produced the event; `mockAccount()` drives the real pipeline;
`stop({ timeout })` bounds the shutdown of every client in the container.

**Complexity.** Medium. A small surface over finished machinery.

---

## 7. Testing architecture

The pyramid is inverted relative to the usual advice, because the risk is concentrated in the
middle tier.

```
              live network        opt-in smoke, real credentials
           test datacenters       handshake, sign-in, migration, basic RPC
          mock MTProto server     session, updates, files, error recovery
       integration in-process     dispatch, routing, middleware, sessions
            unit + property       crypto, TL codec, framing, storage
                type tests        run by tsc, part of the build
```

**Determinism is a requirement, not a preference.** The mock server runs on a fixed seed and a
fixed clock. Every test involving time controls it. A test that passes or fails depending on
machine load is rewritten — the Bot API subsystem already has one such rewrite behind it, and
the same standard applies here.

| Condition | Instrument |
|---|---|
| TL round trips | Generated test over every constructor, plus fixed byte vectors |
| Cryptographic vectors | Committed vector files, in place before the implementations |
| Transport framing | Round-trip plus byte-at-a-time reassembly |
| Authorization | Mock server byte-reproducibly; test DC for real behaviour; one rejection test per mandatory check |
| Session persistence | Driver conformance suite, including a simulated restart |
| DC migration | Mock server, one test per migration error, plus a redirect-loop bound |
| RPC errors | Mock server, covering the flood-wait family and the error-to-class mapping |
| Peer resolution | Mock server: `min` peers in both orders, hash rotation, absent peers, username lookups |
| Update gaps | Mock server, every branch of the gap algorithm named individually |
| `pts`/`qts`/`seq` | Dedicated state-machine suite over scripted sequences |
| Reconnects | Mock server drops the connection mid-RPC; unacknowledged messages must resend |
| Concurrent requests | Container packing under load; ordering guarantees per box |
| Cancellation | An aborted signal reaches an in-flight RPC and frees its slot |
| File transfers | Alignment property tests, CDN hashes valid and invalid, reference expiry, partial chunks |

Test datacenters run as a separate CI job that may fail without blocking a merge, because it
depends on an external service. Everything else gates every commit.

Recorded sessions are scrubbed before commit: no auth keys, no session material, no message
content, no real identifiers. What is kept is structural — constructor sequence, `pts` values,
timing, error codes. A recording that cannot be scrubbed is not committed.

---

## 8. Security model

### Primitives and how each is verified

| Operation | Source | Verification |
|---|---|---|
| SHA-1, SHA-256, SHA-512 | `node:crypto` | Platform |
| PBKDF2-HMAC-SHA512, 100,000 iterations | `node:crypto` | Platform, plus SRP end-to-end vectors |
| AES-256-CTR | `node:crypto` | Platform, plus obfuscation and CDN round-trips |
| AES-256-ECB | `node:crypto`, padding explicitly disabled | Underpins IGE; the disabled padding is asserted by test |
| AES-256-IGE | Own, over ECB | Known-answer vectors; block boundaries; IV split |
| RSA `rsa_pad` | Own | Fixed vectors; the retry path under seeded randomness |
| RSA legacy padding | Own | Fixed vectors |
| Modular exponentiation | Native `BigInt` | Exercised by DH and SRP vectors |
| PQ factorization | Own (Pollard's rho) | Known `pq` values; `p < q` asserted; bounded attempts |
| Miller-Rabin | Own | Known primes and composites, including Carmichael numbers |
| Safe-prime and generator validation | Own | Telegram's prime accepted; unsafe primes rejected |
| SRP 6a, Telegram variant | Own | Vectors from a fixed password, salts and server values; `M1` reproducible |
| CSPRNG | `crypto.randomBytes` | Used for every DH secret, nonce and padding |
| Constant-time comparison | Own, over `crypto.timingSafeEqual` | Used for every comparison on secret-derived material |

Nothing outside this list is written. No primitive is invented, and no algorithm is implemented
from a description that is not Telegram's own or a published standard.

### Auth key handling

Auth keys exist in three places and no others: in memory inside the session layer, in the
storage service, and on the wire in derived form. They are never returned by a public method,
never included in an error, never serialized into a log record, and never compared with `===`.
Temporary keys carry an expiry and are dropped past it rather than refreshed in place.

### Secrets in logs

The existing structural redaction extends to cover `api_hash`, auth keys, temporary keys, salts,
session identifiers, sign-in codes, 2FA passwords, SRP intermediates and file encryption keys.
Redaction remains not switchable off. `api_id` is treated as a secret alongside `api_hash`,
because the pair identifies an application and a leaked pair is an abuse vector for its owner.

### Session storage

Session files are created `0600`; wider permissions produce a warning. Encryption at rest is
available through the same wrapper the framework storage uses, authenticated so tampering
surfaces as a decryption failure rather than a protocol error. Storage keys are hashed before
becoming filenames. Authorization storage failure is fatal by policy, because silent recovery is
indistinguishable from an unauthorized re-authentication. The file driver takes an exclusive
lock, because two processes sharing one session corrupt each other's message-id and salt state.

### Message validation and replay

Every check in [mtproto.md](mtproto.md) §5.2 runs on every encrypted message, unconditionally,
including after an earlier error — a check skipped once an error is known is a timing oracle.
`msg_key` is recomputed and compared in constant time. Length, padding, session identifier,
`msg_id` parity, duplication and the ±30 s / ±300 s window are all enforced. Any failure
discards the message and reconnects rather than attempting partial recovery.

### Malformed TL and hostile server responses

The reader treats every server response as untrusted input. It carries an explicit
remaining-bytes bound, rejects any length prefix exceeding it before allocating, bounds container
nesting depth, bounds decompressed gzip size, and rejects a constructor id absent from the table
for the channel it is reading. The decoder is fuzzed for bounds and allocation limits as a
standing test, not a one-off exercise.

### Error handling

An error never carries secret material. Protocol failures preserve the original TL error name
and code, as the Bot API subsystem already preserves Telegram's originals. A framework-raised
error is never re-wrapped as a network error — the Bot API subsystem has this rule already, and
it applies here for the same reason: the wrapping hides the one message that says what to do.

---

## 9. Decisions

D1–D4 are settled and recorded in [codegen.md](codegen.md) §3. The rest are open, each needed
before the phase named against it. Nothing blocks Phase 2.

| # | Decision | Needed by | Resolution |
|---|---|---|---|
| D1 | TL schema source of truth | Phase 2 | **Settled.** The `.tl` text from `core.telegram.org`, parsed by Yuigram's own parser. Telegram's own JSON is a cross-check, never an input. No third-party mirror at any stage. Runtime never fetches. §3.1 |
| D2 | Whether `mtproto.tl` and `api.tl` emit separate modules and tables | Phase 2 | **Settled.** Three tables: a shared `core` for the TL primitives, then `mtproto` and `api`, which never import each other. A reader is built for a channel, so an API constructor cannot decode on the plaintext channel. Ids are branded per table. §3.2 |
| D3 | Layer pinning and bump policy | Phase 2 | **Settled.** Pinned at layer 223, verified current on 2026-08-29. One layer per release, no automatic upgrade, not runtime-configurable; `schemaInfo.tlLayer` is the whole public surface. §3.3 |
| D4 | Declaration splitting for 2,315 entries | Phase 2 | **Settled.** Split by TL namespace under a 300 KB per-file budget. Type modules may reference each other; runtime codecs resolve through the registry so their module graph is a tree. §3.4 |
| D5 | `api_id` / `api_hash` policy | Phase 5 | Yuigram ships none. Both are required from the user, treated as secrets, and registration is documented as a prerequisite. |
| D6 | `initConnection` device strings: defaults or required | Phase 5 | Sensible defaults naming Yuigram and the runtime, overridable. Forcing every user to invent them is friction; lying about them is worse. |
| D7 | Whether `account.api` harvests peers | Phase 8 | Yes. See G6. |
| D8 | Relationship between `Lifecycle` and per-DC connection state | Phase 6 | `Lifecycle` stays the client-level contract; a connection state machine lives under it, per DC, invisible to callers. |
| D9 | `App` semantics | Phase 10 | Shared dispatch with a `transport` discriminant; per-client lifecycle; one `stop({ timeout })` bounding all of them, reusing the existing deadline behaviour. |
| D10 | Whether bot-over-MTProto ships with the first MTProto release | Phase 10 | No. It is a third mode with its own capability set; it ships after the two-client model is proven. |

### Alternatives rejected for D1–D4

| Alternative | Why it was rejected |
|---|---|
| Consume mtcute's or GramJS's `api-schema.json` | It is someone else's parse with someone else's corrections folded in. The parser has to exist regardless, because the codec must agree with the notation the protocol is documented in — so the mirror buys nothing and costs the independence the project is built on. |
| Consume Telegram's own `/schema/json` as the input | First-party, so the provenance objection does not apply, but it is still a *rendering*: it carries the site's conventions rather than the notation the specification is written in, and adopting it would make the repository's understanding of TL a function of a page Telegram is free to restructure. It is used as a cross-check instead, where not sharing a parser is exactly what gives it value. |
| Fetch the schema at runtime or at install time | Unbuildable offline, non-reproducible, and a supply-chain surface on the path that decides how the client speaks to Telegram. |
| Commit only the IR, not the raw `.tl` | A diff of the IR alone cannot separate "Telegram changed the schema" from "the parser now reads it differently", which is the question a schema review exists to answer. |
| A permissive parser that skips unknown constructs | Produces a codec correct for what it knows and silently absent for the rest. The absence is invisible until a message fails to decode in production, far from the cause. |
| One flat constructor registry across both schemas | Simpler to implement, and that is its only argument. It makes an API constructor decodable on the plaintext channel — a step that should be structurally impossible, not merely unused — and couples the service decoder to an API layer bump. |
| Duplicating the TL core primitives into both tables | Two definitions of `vector#1cb5c415` that must stay identical by discipline rather than by construction. The shared `core` table removes the possibility of drift. |
| Tracking Telegram's newest layer automatically | Changes the surface users compile against with nobody having read the diff. The drift job opens a pull request instead, and a person merges it. |
| Making the layer a runtime option | An application could announce a wire contract its own generated types do not implement. No protocol requirement calls for a client to speak more than one layer. |
| Emitting one declaration file for the whole schema | The measured ecosystem reference is 1.96 MB, re-read by the TypeScript server on every keystroke. It is the single largest thing generation can do to a consumer's editor. |
| Splitting declarations purely to hit a byte target | Cuts across the concepts the schema already organises, so every import becomes arbitrary and navigation gets worse in exchange for a number. The split follows TL namespaces, which is a boundary that means something. |
| Letting runtime codecs import each other directly | Cross-namespace references are ordinary in TL, so direct imports would produce genuine runtime cycles. Resolving through the registry by id makes the runtime graph a tree by construction rather than by careful ordering. |

### What D1–D4 commit the later phases to

| Phase | Consequence |
|---|---|
| 3 — Transport | None. Framing and obfuscation are byte-level and see no TL. |
| 4 — Mock server | The mock speaks real MTProto, so it links the same three tables. Building a fixture with an API constructor on the plaintext channel is impossible in the mock too, which is what makes the negative test meaningful. |
| 5 — Authorization | The handshake reads and writes over `core + mtproto` only, and the branded ids make that a compile-time fact rather than a convention. `invokeWithLayer` carries the pin; the device strings that accompany it are D6. |
| 6 — Session | The session reader carries all three tables. `gzip_packed` and `msg_container` are service constructors that wrap API payloads, so the session is the one place a `mtproto` codec hands bytes to an `api` codec — through the registry, never through an import. |
| 7 — Datacenters | None beyond the session's. |
| 8 — Peers and files | Peer harvesting reads `users` and `chats` off API results, so it depends on the API table's shape but not on how it is split. |
| 9 — Updates | The gap machinery is driven by API constructors exclusively. A layer bump that adds update kinds is additive, so the manager sees new kinds it does not model rather than failing. |
| 10 — Account and App | `schemaInfo.tlLayer` is the only protocol-version surface a user meets. Everything else about layers stays inside the package. |

## 10. Definition of done

The subsystem is complete when all of the following hold. These are acceptance criteria for the
software.

**Protocol.**
- Both TL schemas parse totally, and every constructor round-trips.
- Every cryptographic primitive matches published vectors.
- Every mandatory security check runs unconditionally and cannot be disabled by configuration.
- An auth key is obtained from Telegram, persisted, and resumed across a restart.
- Every condition the mock server can inject is handled correctly.
- Every branch of the gap algorithm has an explicit test.
- Large files transfer across DCs; CDN chunks are hash-verified; expired references refresh
  invisibly.

**Integration.**
- `Account` satisfies the same lifecycle contract as `Bot`.
- Core's dispatch, filters, middleware, sessions and router behave identically for both
  transports, verified by running the same suites against both.
- `App` dispatches across clients with correct `transport` narrowing.
- `mockAccount()` drives the real pipeline with only the network replaced.

**Boundaries.**
- No import crosses between `bot-api` and `mtproto`, in either direction.
- No Telegram library appears anywhere in the dependency tree.
- No foreign type reaches the public surface of either package.
- All three are enforced by CI, not by convention.

**Quality.**
- No generated declaration file exceeds 300 KB.
- Regeneration is byte-identical across runs.
- No test depends on wall-clock timing or machine load.
- Nothing is a stub: an unimplemented capability is absent, not hollow.

**Documentation.**
- Every subsystem in §3 is documented in terms of what it does.
- The ban-risk warning is present and prominent in the MTProto documentation.
- Findings from §2.3 are recorded in `docs/protocol-notes/`.

---

## 11. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Updates-manager correctness | **Extreme** | Mock server built before the manager; every algorithm branch tested by name; recorded-session replay |
| Silent message loss in the session layer | **Extreme** | Mock server injects each condition deliberately; acknowledgement tracking verified directly rather than inferred |
| Peer and file-reference long tail | **High** | Explicit peer model from the first commit; origin tracking built in, not retrofitted; the `min`-peer overwrite rule tested directly |
| A security check implemented but unreachable | **High** | One rejection test per check, asserting the specific error rather than that something threw |
| Generated declaration size degrading consumer editors | **High** | Namespace splitting with a measured 300 KB budget, enforced in CI |
| Undocumented server behaviour | **High** | Test-DC observation; findings recorded; the mock server updated to reproduce each finding |
| Schema drift during a long build | **Medium** | Layer-tagged snapshots; the parser is layer-parametric from the start |
| TL codec edge cases | **Medium** | Round-trip over every constructor plus fixed byte vectors for the cases a self-consistent bug would pass |
| Scope creep into high-level wrappers | **Medium** | Protocol depth is non-negotiable; wrapper breadth is demand-driven, with `account.api` covering everything not yet wrapped |
| Account bans for users of the subsystem | **High (product)** | Documented duty of care; the warning ships with the subsystem, not after it |
| The Phase 4 investment being deferred under pressure | **High** | The mock server is a deliverable with its own acceptance criteria, not scaffolding attached to a later phase |

---

## 12. Estimated effort

For one experienced TypeScript developer working consistently. Ranges, not points, and the
spread is real.

| Phase | Part-time | Full-time | Complexity |
|---|---|---|---|
| 1 — Crypto | 4–6 weeks | 2–3 weeks | Medium |
| 2 — TL parser and generator | 6–10 weeks | 3–5 weeks | High |
| 3 — Transport | 3–5 weeks | 2–3 weeks | Medium |
| 4 — Mock server | 4–6 weeks | 2–3 weeks | High |
| 5 — Authorization | 5–8 weeks | 3–4 weeks | High |
| 6 — Session and storage | 10–16 weeks | 5–8 weeks | Very high |
| 7 — DCs, migration, sign-in | 6–9 weeks | 3–5 weeks | High |
| 8 — Peers and files | 8–12 weeks | 4–6 weeks | High |
| 9 — Updates manager | 10–16 weeks | 5–8 weeks | Very high |
| 10 — Account, App, unification | 5–7 weeks | 3–4 weeks | Medium |
| **Total** | **61–95 weeks** | **32–49 weeks** | |

Roughly 14–22 months part-time, or 8–12 months full-time, to a subsystem that can be trusted
with production traffic. That sits inside the 12–24 month estimate in [mtproto.md](mtproto.md)
§14: the lower bound assumes the mock server is built when scheduled and the security checks are
written alongside the code they guard rather than after it.

Approximate code volume:

| Artifact | Lines |
|---|---:|
| Hand-written subsystem | 12,000–16,000 |
| Generated TL types, reader, writer, errors | 40,000–60,000 |
| Mock server | 2,500–4,000 |
| Tests | 10,000–14,000 |
| Tooling (`tools/tl`) | 2,000–3,000 |

The generated figure is the dominant artifact, and the reason D4 exists.
