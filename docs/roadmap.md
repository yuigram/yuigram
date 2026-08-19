# Roadmap

Phased delivery for an independent implementation of both protocols.

The project brief's proposed sequence (§46) has been adjusted in three ways, each for a stated
reason:

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
- PQ factorization (Pollard's rho / Brent)
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
- MTProto storage: auth keys, temp keys, salts, DC options
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
- Cross-client handlers with `ctx.transport` discrimination
- Unified context surface, exactly as constrained by
  [unified-model.md](unified-model.md) §5
- Shared sessions and storage across client types
- Unified error handling
- Examples 03, 04, 09, 10 (bot + userbot, multiple clients, raw API, production)

Exit: `yuigram@0.5.0` — the first release that does what no other framework does, on an
implementation Yuigram owns end to end.

---

## Phase 11 — Breadth and hardening

*18–28 weeks*

- High-level MTProto surface: messages, chats, channels, users, dialogs — demand-driven,
  prioritized by feedback gathered since Phase 4
- Storage drivers: `sqlite`, `redis`, plus `tiered` / `namespaced` / `encrypted`
- Throttling plugin; flood handling on both transports
- Benchmark suite in CI with regression thresholds
- Performance budgets met and published
- Security review against the [security.md](security.md) §10 checklist

Exit: `yuigram@0.8.0` — production-ready for real workloads.

---

## Phase 12 — v1.0

*10–16 weeks*

- API stability commitment and semantic-versioning policy
- Complete documentation: concepts, guides, reference, migration from grammY / Telegraf /
  GramJS / mtcute
- All ten planned examples
- Plugin ecosystem foundations; stable extension points
- Independent security review of the cryptographic and protocol layers

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
7. **`user.raw` is the answer to "method X is missing"** until demand justifies a wrapper. Depth
   of the protocol is non-negotiable; breadth of convenience wrappers is scheduling.
8. **Correctness before speed.** Especially in crypto, where a fast wrong answer is worthless.
9. **Automate anything recurring.** Schema regeneration, releases, audits, benchmarks. A solo
   maintainer's scarcest resource is attention.
10. **Record what the server actually does.** `docs/protocol-notes/` is a first-class artifact;
    undocumented behaviour discovered once should never have to be discovered twice.
