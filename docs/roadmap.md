# Roadmap

Phased delivery for an independent implementation of both protocols.

The conventional sequence — research, architecture, core, then each subsystem in turn — has
been adjusted in three ways, each for a stated reason:

1. **Testing infrastructure precedes the code it tests.** The mock Bot API server precedes the
   Bot API runtime; the mock MTProto server precedes the session and updates layers. A test
   suite written after the implementation tests what the implementation does, not what the
   protocol requires.
2. **Documentation is continuous**, not a phase. [competitive-analysis.md](competitive-analysis.md)
   §5 identifies deferred documentation as a plausible cause of puregram's adoption outcome.
3. **MTProto is built strictly bottom-up.** A defect in the crypto or codec layer surfaces as
   an inexplicable failure six layers higher. Each layer is verified before the next begins.

Total: **2.5–3.5 years part-time**, 1.25–1.75 years full-time. Time is not the constraint;
correctness and independence are.

---

## Phase 0 — Research *(complete)*

Deliverables: this `docs/` directory.

Exit: human review and explicit approval. **Implementation must not begin before this.**

---

## Phase 1 — Foundations

*3–4 weeks*

Repository, tooling, and the invariants that keep the architecture honest.

- Monorepo: `core`, `bot-api`, `mtproto`, `yuigram`
- TypeScript strict, build, lint, format
- CI: test, typecheck, build
- **Architecture invariants as CI gates** ([architecture.md](architecture.md) §10) — dependency
  rules, licence gate, forbidden-identifier scan on public `.d.ts`
- `LICENSE` (MIT), `NOTICE.md`, `SECURITY.md`, `CONTRIBUTING.md`
- Release automation: changesets, npm provenance
- Documentation site skeleton, published from day one
- `docs/protocol-notes/` established for recording observed server behaviour

Exit: an empty package publishes green through the full pipeline, and every invariant fails the
build when deliberately violated.

---

## Phase 2 — Core

*6–9 weeks*

The transport-agnostic framework. No Telegram code.

- Dispatch: priority buckets, kind index, reserved handler slot
- Middleware: onion composition, scoping, error propagation
- **Filters: `Filter<Base, Mod>`, composition, runtime `kinds` metadata**
- Context contract and extension mechanism
- Error hierarchy with preserved originals
- Logger with structural redaction
- Plugin system with topological install
- Storage: `KV` contract, `memory()`, `file()`
- Sessions: keying, lazy load, dirty tracking
- Lifecycle: start, stop, drain
- **Type tests** (`expect-type`) from the first commit

Exit: core fully tested against synthetic updates, with no transport dependency.

**Risk retired early:** prototype `Filter<Base, Mod>` inference in week one. If it does not hold
up under composition, the routing design changes, and learning that now is far cheaper.

---

## Phase 3 — Bot API

*10–14 weeks*

The complete Bot API subsystem, implemented independently.

**3a — Code generation (5–8 weeks)**
- Own scraper over `corefork.telegram.org` and `core.telegram.org`
- Normalized IR; committed schema snapshot
- Emitters: types, methods, events, filters
- `ark0f/tg-bot-api` cross-check in CI
- Scheduled regeneration opening a pull request on change

**3b — Testing first (2–3 weeks)**
- Mock Bot API server
- `mockBot()` harness driving the real dispatch pipeline

**3c — Runtime (5–7 weeks)**
- HTTP client on native `fetch`; multipart on native `FormData`
- Proxy method surface, typed and untyped `call()`
- Polling with `allowed_updates: 'auto'`
- Webhook handler plus node, express and fastify adapters
- Normalization with generated service-message promotion
- Files: upload, download, `file_id` reuse
- Keyboards, parse modes, entity formatting

Exit: a production-capable Bot API framework. All 185 methods typed. Documentation and examples
complete for everything shipped.

---

## Phase 4 — First release

*3–5 weeks*

- Publish `yuigram@0.1.0` — Bot API only, stated plainly
- Documentation site: introduction, quick start, guides, API reference
- Examples 01–08 (bot-focused)
- Announce, with the MTProto roadmap stated openly

**Why release here:** the Bot API subsystem is complete, independent, owned code. Shipping it
gives the project a real artifact, early users, and bug reports against the core and dispatch
layers that MTProto will later depend on. This is delivery sequencing, not a shortcut — nothing
is deferred or stubbed.

Market feedback gathered here informs *priority* within the MTProto phases (which high-level
methods to wrap first), not whether MTProto happens.

---

## Phase 5 — MTProto: cryptography and TL

*10–16 weeks*

The foundation everything else stands on. Pure functions over bytes, exhaustively testable
offline.

**5a — Crypto (4–6 weeks)**
- AES-256-IGE, validated against known-answer vectors
- RSA with both Telegram padding schemes
- PQ factorization (Pollard's rho)
- Miller-Rabin primality, safe-prime validation
- SRP 6a with Telegram's KDF
- Constant-time comparison utilities

**5b — TL (6–10 weeks)**
- Own TL grammar parser: flags, conditional `true`, bare vs boxed, vectors, namespaces
- Constructor id computation and verification
- Schema snapshot, layer-tagged and committed
- Emitters: types (split by namespace), reader, writer, 552 error classes
- Codec runtime

Exit gate: **every one of the 2,315 constructors round-trips** (serialize → deserialize →
deep-equal), as a generated test. Every crypto primitive matches its known-answer vectors.

---

## Phase 6 — MTProto: connection and authorization

*11–16 weeks*

- Transport framings: abridged, intermediate, padded intermediate, full
- AES-CTR obfuscation with the 64-byte init packet
- DH auth key handshake
- **All mandatory security checks** ([mtproto.md](mtproto.md) §5.2), non-bypassable
- PFS temporary keys with `auth.bindTempAuthKey`
- MTProto storage: auth keys, temp keys, salts, datacenter addresses and selection
- Sign-in flows: phone, 2FA, bot token, QR, session resume

Developed against **Telegram's test datacenters** with test-only accounts.

Exit: a real auth key obtained from Telegram, persisted, and resumed across restarts.

---

## Phase 7 — MTProto: session layer and mock server

*12–18 weeks*

The layer where silent message loss originates, and the harness that makes it verifiable.

**7a — Deterministic mock server (4–6 weeks)**

Written **first**. Must be able to inject, on demand:
`bad_server_salt`, `bad_msg_notification` (each error code), `new_session_created`,
containers, gzip payloads, out-of-order delivery, dropped acknowledgements, clock skew.

**7b — Session layer (8–12 weeks)**
- `msg_id` generation with time-offset correction; `seq_no` rules
- Acknowledgement tracking with resend
- Container packing and unpacking
- Salt rotation, `future_salts` prefetch
- RPC lifecycle: routing, timeout, cancellation, `invokeAfterMsg` chaining
- Reconnection with resend of unacknowledged messages
- Ping/pong, RTT, inactivity handling

Exit: every injectable condition from 7a is handled correctly, verified by test.

---

## Phase 8 — MTProto: network, peers and files

*14–20 weeks*

- DC map from `help.getConfig`; connection pools per DC by purpose
- Migration: `PHONE_`/`NETWORK_`/`USER_`/`FILE_MIGRATE_X`
- `auth.exportAuthorization` / `importAuthorization` handoff
- Peer layer: indexed cache, `access_hash` lifecycle, **`min` peer resolution**, username
  resolution
- Files: chunked parallel upload and download, alignment rules, media DCs
- CDN redirects with mandatory SHA-256 hash verification
- File references with origin tracking and automatic refresh

Exit: large files transfer reliably across DCs; expired file references refresh invisibly.

---

## Phase 9 — MTProto: updates manager

*10–16 weeks*

The hardest subsystem, built last, against a mock server extended for it.

- Common box state: `pts`, `qts`, `seq`, `date`
- Per-channel `pts` boxes
- Gap detection per [mtproto.md](mtproto.md) §9.2
- 0.5 s reorder tolerance before recovery
- `updates.getDifference` / `getChannelDifference` with pagination to `final`
- Postponed-update buffering during recovery
- No-dispatch index for RPC-observed updates
- `updatesTooLong`, `differenceTooLong`, `CHANNEL_PRIVATE` handling
- Peer backfill for updates referencing unknown peers
- Normalizer: TL updates → Yuigram events

Exit gate: every branch of the gap algorithm has an explicit test; recorded-session replay
passes; no message loss under injected reordering, gaps and duplicates.

**This phase determines whether the framework can be trusted with production traffic.**

---

## Phase 10 — Unification

*6–8 weeks*

Where the thesis becomes real.

- `App` container: multiple clients, shared middleware, unified lifecycle
- Cross-client handlers with `event.transport` discrimination
- Unified context surface, exactly as constrained by
  [unified-model.md](unified-model.md) §5
- Shared sessions and storage across client types
- Unified error handling
- Examples 03, 04, 09, 10 (bot + userbot, multiple clients, raw API, production)

Exit: the first release that does what no other framework does, on an implementation Yuigram
owns end to end. That is `1.0.0`, the release after `0.1.0`: it was prepared first as `0.2.0`,
which was never published. The commitments Phase 12 names for 1.0 that it does not yet meet are
listed, with their state, in [releases/1.0.0-checklist.md](releases/1.0.0-checklist.md).

---

## Phase 11 — Breadth and hardening

*18–28 weeks*

- High-level MTProto surface: messages, chats, channels, users, dialogs — demand-driven,
  prioritized by feedback gathered since Phase 4
  - Paged lists: eighteen walks over eight continuation policies, each yielding a view where the
    value needs interpreting and the schema's own value where it does not. See
    [entities.md](entities.md) §6
  - Files: three receiving shapes — whole, pushed at a sink, and pulled as an async iterable —
    over one transfer. See [mtproto.md](mtproto.md) §11
  - People: identity, profiles, contacts, blocking, presence and profile media, each resolving
    the people it names through the account's own peer store
  - Conversations: membership and permissions, invite-link operations, management, creation
    and deletion, lookup, and folders and dialog state — sixty operations, loaded when one is
    called so a bot that never uses them pays nothing
  - Peers in bulk: reading who several are through the three bulk reads the protocol has, one
    request per family rather than one per peer, and finding a conversation in the list by
    walking it rather than by keeping a cache
  - Following a channel: Telegram does not push a channel's updates to an account that is not
    looking at it, so watching one is a subscription that asks at the server's interval
  - Forums and stories: topics — opening, editing, closing, pinning, reordering — and stories
    — posting, editing, pinning, archiving, reacting, reading and counting views
  - Gifts, boosts and business: the gift lifecycle from sending to withdrawal, each paid step
    going through the payment form Telegram requires, plus boost slots and the business surface
  - File identifiers: reading and writing the opaque string files travel under between clients,
    and the stable identifier that says two of them are the same file. See
    [mtproto.md](mtproto.md) §11
  - Pages beside the walks, and the message surface in full: a page read reporting the total
    beside every walk; albums, copies, quoted replies, comments and the scheduled family; votes,
    paid reactions, checklists, translation, inline edits on the datacenter an identifier names,
    rich messages and streaming drafts; and the reads beside them
  - The bot surface and stickers: commands per scope and language, a bot's description, menu
    button and default rights, pressing a button and keeping a mini app open for as long as the
    account is; sticker sets from creation to reordering, and custom emoji
  - Communities, which hold conversations rather than being ones, and the ephemeral and welcome
    messages — both constructs that exist only from layer 229. Games' high scores. The operations
    that concern the authorization itself: a login code sent again, test-datacenter sign-in,
    takeout sessions, call defaults bound to a view, a precise range of a file, and what a
    collectible handle sold for
  - QR sign-in as the whole flow, and a download wearing either stream shape
  - Conversation state: scenes whose position survives a restart, prompts that belong to one
    conversation, and callback data with a shape and a byte budget
  - An account in a worker: a dedicated worker or a `SharedWorker` that every tab attaches to,
    the account made once and connected once, and a fixed table of what may cross. See
    [runtimes.md](runtimes.md) §6
  - Durable flows: a conversation written as one function whose journal survives a restart, with
    effects that are not repeated behind the application's back. See [sessions.md](sessions.md) §6.6
  - Formatting and rich messages as entry points of their own: formatted text with readers and
    writers for both dialects, rich messages from builders or read from either rich dialect, and
    streaming an answer as drafts and messages over both transports. See
    [formatting.md](formatting.md)
  - A connection status on every account, carried across a worker, and a worker host that lets a
    closed tab go at once without mistaking a hidden one for it. See [runtimes.md](runtimes.md) §6
  - Still to come in this phase: the storage drivers below
  - The missing capabilities found against the libraries the surface was compared with, built:
    an MTProxy route with all three kinds of secret, fake TLS included (`yuigram/mtproxy`, see
    [mtproto.md](mtproto.md) §7); an IndexedDB store for browser accounts (`yuigram/indexeddb`,
    see [storage.md](storage.md) §2); and a Koa webhook adapter (`koaWebhook`, see
    [bot-api.md](bot-api.md), webhooks). MTProxy is checked against a local proxy and OpenSSL,
    not yet against a real proxy or through one to Telegram
  - Still open at the level of single methods: options some account methods do not take that
    mtcute's do — an upload progress callback, cancelling one sign-in step, a timeout on a
    callback answer, acting through a business connection, code settings for `sendCode`,
    rescheduling or rich content in `editMessage`, paid invite links, declining a gift offer,
    clearing mentions, a contact's note, a web-app switch button on inline answers, answering a
    content-protection request. Most of these calls can be made through `account.api`, which
    makes the call and nothing more: the account method's peer resolution and reading of the
    answer are not part of it
  - Outside the comparison: converting session strings from Telethon, Pyrogram, GramJS and
    MTKruto, which mtcute provides in a separate package (Yuigram reads and writes mtcute's own
    version-3 string), and a SOCKS or HTTP proxy helper — one can be put in an account's path
    through its `open` option, but none is shipped
- Storage ownership: an area per account, a claim inside it, and a refusal rather than a silent
  merge when two accounts meet. See [storage.md](storage.md) §4
- Storage drivers: `sqlite`, `redis`, plus `tiered` / `namespaced` / `encrypted`
- Throttling plugin; flood handling on both transports
- Benchmark suite in CI with regression thresholds
- Performance budgets met and published
- Security review against the [security.md](security.md) §10 checklist

Exit: production-ready for real workloads. Which version that is depends on how many
releases the phase takes; the number is whatever the releases before it reached, not a figure
reserved in advance.

---

## Phase 12 — v1.0

*10–16 weeks*

- API stability commitment and semantic-versioning policy
- Complete documentation: concepts, guides, reference, migration from grammY / Telegraf /
  GramJS / mtcute
- All ten planned examples
- Plugin ecosystem foundations; stable extension points
- Independent security review of the cryptographic and protocol layers — deferred for `1.0.0`
  by the owner, and not done

Exit: `yuigram@1.0.0`.

---

## Phase 13 — Beyond

Demand-driven, not speculative:

- Bot-over-MTProto (lifting the 50 MB ceiling for bots)
- WASM crypto acceleration
- Broader high-level surface, added on request
- Additional runtimes (Deno, Bun)
- Secret chats — large, isolated, genuinely optional

---

## Timeline

| Phase | Duration | Cumulative (part-time) |
|---|---|---|
| 0 — Research | complete | — |
| 1 — Foundations | 3–4 wk | 1 mo |
| 2 — Core | 6–9 wk | 2.5–3.5 mo |
| 3 — Bot API | 10–14 wk | 5–7 mo |
| **4 — First release** | **3–5 wk** | **6–8 mo** |
| 5 — Crypto + TL | 10–16 wk | 8.5–12 mo |
| 6 — Connection + auth | 11–16 wk | 11–16 mo |
| 7 — Session + mock server | 12–18 wk | 14–20 mo |
| 8 — Network, peers, files | 14–20 wk | 17–25 mo |
| 9 — Updates manager | 10–16 wk | 20–29 mo |
| **10 — Unification** | **6–8 wk** | **21–31 mo** |
| 11 — Breadth + hardening | 18–28 wk | 25–38 mo |
| 12 — v1.0 | 10–16 wk | 28–42 mo |

**Bot API release: 6–8 months. Full unified MVP: 21–31 months. v1.0: 28–42 months.**
Roughly half at full-time.

---

## Principles

1. **Bottom-up, always.** Crypto before TL before transport before auth before session before
   updates. Each layer verified before the next begins.
2. **The mock server precedes the layer it tests.** Non-negotiable for the session and updates
   layers, which cannot be validated against the live network.
3. **Specification first.** Telegram's documentation is the input. Other implementations are
   consulted to disambiguate, never to transcribe. See [mtproto.md](mtproto.md) §1.
4. **Security checks are never configurable off.** A flag that disables validation is a flag
   that ends up disabled in production.
5. **Documentation ships with the feature.** Never after.
6. **Invariants precede the code they constrain.** Retrofitted architecture rules do not hold.
7. **`user.api` is the answer to "method X is missing"** until demand justifies a wrapper. Depth
   of the protocol is non-negotiable; breadth of convenience wrappers is scheduling.
8. **Correctness before speed.** Especially in crypto, where a fast wrong answer is worthless.
9. **Automate anything recurring.** Schema regeneration, releases, audits, benchmarks. A solo
   maintainer's scarcest resource is attention.
10. **Record what the server actually does.** `docs/protocol-notes/` is a first-class artifact;
    undocumented behaviour discovered once should never have to be discovered twice.
