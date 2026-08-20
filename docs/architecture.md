# Architecture

The proposed system architecture, the dependency relationships between subsystems, and the
reason each subsystem exists.

The obvious first shape puts a single shared core above both transports, with Context sitting
beneath Events and Middleware. That layering is revised here: **Context is produced by the
transport-specific normalizers, not by the core**, because a context is only meaningful once an
update has been decoded, and decoding is exactly the part that cannot be shared.

---

## 1. System diagram

```
                        ┌────────────────────────────────────────┐
                        │              Application               │
                        └────────────────────────────────────────┘
                                            │
                        ┌────────────────────────────────────────┐
                        │                  App                   │
                        │  multi-client container · shared        │
                        │  middleware · lifecycle · storage       │
                        └────────────────────────────────────────┘
                              │                          │
              ┌───────────────┴──────┐        ┌──────────┴───────────────┐
              │        Bot           │        │        Account           │
              │  (Bot API / HTTPS)   │        │   (MTProto)              │
              └──────────────────────┘        └──────────────────────────┘
                         │                                 │
              ┌──────────┴──────────┐          ┌───────────┴────────────┐
              │  bot-api subsystem  │          │   mtproto subsystem     │
              │  ─────────────────  │          │   ─────────────────     │
              │  http client        │          │   transport + obfusc.   │
              │  polling / webhook  │          │   auth (DH, SRP, PFS)   │
              │  multipart / files  │          │   session connection    │
              │  method proxy       │          │   DC pool + migration   │
              │  normalizer         │          │   TL codec              │
              │                     │          │   updates manager       │
              │                     │          │   peer repository       │
              │                     │          │   normalizer            │
              └──────────┬──────────┘          └───────────┬────────────┘
                         │                                 │
                         └────────────┬────────────────────┘
                                      │  Update (normalized)
                        ┌─────────────┴──────────────────────────┐
                        │                 core                    │
                        │  dispatch · filters · middleware ·      │
                        │  context base · sessions · storage ·    │
                        │  errors · logging · plugins             │
                        └────────────────────────────────────────┘
```

Dependency direction is strictly downward and inward:

```
core       depends on nothing (no transport, no Telegram types)
bot-api    depends on core
mtproto    depends on core
yuigram    depends on core + bot-api + mtproto   (the façade users install)
```

`bot-api` and `mtproto` **never** import each other. This is enforced in CI (§10), and it is
the structural guarantee that the framework has not silently grown a fake abstraction.

### Dependency philosophy

Yuigram implements both protocols itself. There is **no third-party Telegram library in the
dependency tree** — not puregram, not mtcute, not grammY, at any layer, at any phase.

| Subsystem | Runtime dependencies |
|---|---|
| `core` | none |
| `bot-api` | none — `fetch`, `FormData` and `Blob` are Node built-ins |
| `mtproto` | none — `node:crypto` plus native `BigInt` |
| `yuigram` | the three above |

This is achievable rather than aspirational because of what the two protocols actually
require. The Bot API is HTTPS with JSON and multipart bodies, all of which Node 22 provides
natively. MTProto needs SHA-1/256/512, PBKDF2, AES-CTR and a CSPRNG — all in `node:crypto` —
plus AES-IGE, Telegram's RSA padding, factorization, primality testing and SRP, none of which
exist in any library and all of which must therefore be written regardless of what else is
depended upon. Using native `BigInt` for 64-bit and modular arithmetic removes the last
plausible dependency (`long`, Apache-2.0).

Optional adapters — SQLite storage, webhook framework glue, WASM crypto acceleration — ship as
separate packages and never enter core's tree. `npm install yuigram` installs Yuigram and
nothing else.

---

## 2. Subsystems

### 2.1 `core` — the transport-agnostic framework

Knows nothing about Telegram. Its vocabulary is updates, handlers, filters and storage.

| Module | Responsibility |
|---|---|
| `dispatch` | priority buckets, handler registry, `kinds` fast path, the reserved handler slot |
| `middleware` | onion composition, `next()`, error propagation, per-scope chains |
| `filter` | `Filter<Base, Mod>`, `and`/`or`/`not`, `defineFilter`, runtime metadata |
| `context` | the base context contract and its extension mechanism |
| `session` | framework session state, keyed and pluggable |
| `storage` | `KV` and `TtlStore` contracts, memory and filesystem drivers |
| `errors` | the `YuiError` hierarchy and the original-error preservation contract |
| `log` | level-based logger interface, console default, redaction |
| `plugin` | plugin contract, dependency resolution, install ordering |
| `lifecycle` | start/stop/drain, in-flight tracking, graceful shutdown |

**Why it exists:** it is the only part of the system where "unified" is true without
qualification, and isolating it makes that claim testable. `core` has no Telegram dependency,
so its test suite needs no network and no fixtures beyond synthetic updates.

### 2.2 `bot-api` — the Bot API subsystem

| Module | Responsibility |
|---|---|
| `http` | fetch-based client, timeouts, retries, connection reuse |
| `method` | proxy surface over 185 methods, `call()` escape hatch |
| `multipart` | file uploads, streaming bodies |
| `polling` | long-poll loop, offset management, backoff |
| `webhook` | framework-agnostic handler + per-framework adapters |
| `files` | `file_id` model, download helpers, URL resolution |
| `normalize` | raw `Update` -> Yuigram event, including service-message promotion |
| `generated/` | types, method signatures, event map — all emitted from the schema |

**Why it exists as a distinct package:** because it can be finished early and stay finished.
Unlike MTProto, the Bot API subsystem has a bounded, well-understood scope, and delivering it
completely is what gives the project a real shipped artifact while the protocol stack is still
being built.

### 2.3 `mtproto` — the MTProto subsystem

Layered internally, because the layers have very different stability and testability
characteristics:

```
mtproto/
├── tl/            codec runtime + generated reader/writer/types   (generated)
├── crypto/        AES-IGE, RSA padding, factorization, SRP, KDF   (pure, unit-testable)
├── transport/     framing (intermediate/abridged/padded), obfuscation
├── auth/          DH handshake, PFS, bot/phone/QR sign-in, 2FA
├── session/       message ids, seqno, acks, salts, containers, RPC lifecycle
├── network/       DC pool, connection counts, migration, CDN/media DCs
├── storage/       driver / repository / service — auth keys, salts, peers, update state
├── updates/       pts/qts/seq state, gap detection, difference reconciliation
├── peers/         access_hash cache, min-peer resolution, file references
└── normalize/     TL update -> Yuigram event
```

**Why the internal layering matters:** `crypto/` and `tl/` are pure functions over bytes and
can be tested exhaustively offline against known vectors. `session/` and `updates/` are the
subtle parts and need a deterministic mock server. Separating them means the hardest code is
also the most testable, which is the only way a solo maintainer keeps it correct.

### 2.4 `yuigram` — the façade

The package users install. Re-exports the public surface, owns the `App` container, and
contains almost no logic of its own.

**Why it exists:** so that `npm install yuigram` is the entire onboarding step, while the
repository stays modular internally. See [naming.md](naming.md).

---

## 3. The update pipeline

```
 raw payload
     │
     ├─ bot-api:  { update_id, message: {…} }
     └─ mtproto:  updateNewMessage{ message, pts, ptsCount }
     │
     ▼
 [ transport normalizer ]        ← transport-specific, the only place both diverge
     │  · assign a kind (with service-message promotion)
     │  · extract common fields (chat, sender, text, date)
     │  · keep the original payload under `raw`
     │  · attach the originating client
     ▼
 Update  (normalized, transport-tagged)
     │
     ▼
 [ dispatch ]
     │  1. middleware — priority: high
     │  2. middleware — priority: normal
     │  3. handlers   — registered via on()/command()/etc.
     │  4. middleware — priority: low
     ▼
 handler
```

The reserved handler slot at step 3 is deliberate (see [research.md](research.md) §1.4): it
lets session and auth plugins register `high` with a guarantee they run before application
code, and metrics register `low` with a guarantee they run after, without either having to
reason about registration order.

### Concurrency

Updates dispatch concurrently by default, with in-flight tracking so `app.stop()` can drain.
Strict per-chat ordering is available as opt-in — it is a correctness requirement for some
applications and a throughput disaster for others, so it must be a choice rather than a
default. See [events.md](events.md) §7.

---

## 4. Context construction

Context is built by the transport normalizer, not by the core, because it needs decoded
transport data to exist at all.

```
              ┌──────────────────┐
              │  BaseContext     │   core — client, transport, kind, date, raw
              └────────┬─────────┘
                       │
        ┌──────────────┴───────────────┐
        │                              │
┌───────┴────────┐            ┌────────┴────────┐
│  BotContext    │            │  UserContext    │
│  Bot API raw   │            │  TL raw         │
│  answer()      │            │  readHistory()  │
│  file_id ops   │            │  peer ops       │
└───────┬────────┘            └────────┬────────┘
        │                              │
        └──────────────┬───────────────┘
                       │
              per-kind context types
              (MessageContext, CallbackQueryContext, …)
```

Plugins extend context through a declared extension point rather than by merging into
another package's types — the pattern flagged as an anti-pattern in
[research.md](research.md) §1.8. See [middleware.md](middleware.md) §6.

---

## 5. Sessions and storage

Two abstractions, deliberately not one:

```
  Framework session                  Authorization session
  ─────────────────                  ─────────────────────
  user/chat/conversation state       MTProto auth keys, salts,
  application data                   DC state, peer cache,
                                     update state (pts/qts/seq)

  KV<V> contract                     Driver/Repository/Service stack
  memory · file · redis · sql        memory · file · sqlite
  applies to Bot and Account alike      MTProto only
  loss = inconvenience               loss = re-authentication + degraded peers
```

Merging them would produce a KV interface with a peer-shaped hole and would encourage users
to put authorization credentials in the same store as application data — a security problem
as much as a design one. Full treatment in [sessions.md](sessions.md) and
[storage.md](storage.md).

---

## 6. Errors

```
YuiError
├── ConfigError          invalid options, missing credentials
├── TelegramError        the API said no
│   ├── BotApiError        error_code + description
│   ├── RpcError           TL error type + code
│   └── FloodError         retry_after / FLOOD_WAIT_N   (unified across both)
├── NetworkError         transport failure, timeout, DNS
├── AuthError            sign-in failure, invalid token, 2FA required
├── SessionError         corrupt or unusable authorization session
├── PeerError            unresolvable peer, expired access_hash
└── ValidationError      bad arguments caught before the wire
```

Every error preserves the original: `error.cause` holds the untouched payload, and
`BotApiError`/`RpcError` expose `code`, `description` and the raw response. Wrapping must
never destroy information — an error the user cannot diagnose from the object is a bug.

`FloodError` is the one genuinely unified case, because `429 + retry_after` and
`FLOOD_WAIT_N` mean the same thing to a caller and want the same handling.

---

## 7. Raw API

Two separate escape hatches, never merged (see [unified-model.md](unified-model.md) §7):

```ts
bot.raw.sendMessage({ chat_id, text })              // typed Bot API
bot.raw.call('someNewMethod', { … })                // untyped, forward-compatible

user.raw.messages.sendMessage({ peer, message })    // typed TL
user.raw.call({ _: 'messages.sendMessage', … })     // untyped, forward-compatible
```

**Why both a typed and an untyped form:** the typed form covers everything in the current
schema; the untyped form covers the window between Telegram shipping a feature and Yuigram
regenerating. Without the second, every Telegram release temporarily bricks some users.

---

## 8. Code generation

```
   corefork.telegram.org/bots/api  ──┐
   core.telegram.org/bots/api      ──┤──> scraper ──> bot-api.schema.json ──> emitters
   ark0f/tg-bot-api (cross-check)  ──┘                       │
                                                             ├─> types.d.ts
                                                             ├─> methods.d.ts
                                                             ├─> events.ts
                                                             └─> filters.ts

   telegram TL schema (layer N)  ──> tl parser ──> tl.schema.json ──> emitters
                                                             ├─> tl-types.d.ts
                                                             ├─> reader.ts
                                                             ├─> writer.ts
                                                             └─> errors.ts
```

The schema JSON is **committed** to the repository. This is a deliberate choice: builds stay
reproducible without network access, schema changes appear as reviewable diffs in pull
requests, and a Telegram documentation restructure breaks a scheduled CI job rather than
everyone's build.

The scheduled job fetches, regenerates, diffs, and opens a pull request when the surface
changes. Telegram tracking becomes a review task rather than an engineering task. This is
the mechanism that keeps Telegram's release pace from becoming a maintenance burden.

---

## 9. Plugins

```ts
interface Plugin<N extends string, Ext = void> {
  readonly name: N
  readonly dependsOn?: readonly string[]
  install (target: PluginTarget): Ext | Promise<Ext>
}
```

Extension points, fixed and documented, so plugins never need to reach into internals:

| Point | Purpose |
|---|---|
| `use()` | dispatch middleware at a chosen priority |
| `hook('apiCall')` | around-hook on outgoing calls — retry, throttle, cache, mock |
| `hook('init'/'shutdown')` | lifecycle |
| `extendContext()` | declared context additions, namespaced by plugin |
| `defineEvent()` | custom event kinds |
| `provideStorage()` | storage driver registration |

A plugin installs onto an `App`, a `Bot` or an `Account`; the target type determines which
extension points are available, so an MTProto-only plugin cannot be installed on a `Bot` by
mistake.

---

## 10. Enforced invariants

Architecture decays unless something checks it. These are CI gates, not conventions:

1. **`core` imports nothing transport-specific.** Dependency-cruiser rule.
2. **`bot-api` and `mtproto` never import each other.** Dependency-cruiser rule.
3. **No mtcute or puregram type appears in any public `.d.ts`.** Enforced by scanning the
   built declaration files for forbidden identifiers. This is the mechanical guarantee
   behind long-term independence, and it holds regardless of what the implementation depends
   on internally.
4. **No puregram-derived source.** Similarity tripwire; see [licensing.md](licensing.md) §9.
5. **Public API surface is snapshotted.** An API-extractor report is committed; any change to
   the public surface shows up as a reviewable diff.
6. **Generated code is never hand-edited.** A checksum in the header; CI regenerates and
   fails on drift.

Invariant 3 is the one that decides whether the "not a wrapper" requirement is real or
aspirational. It is a build failure, not a code-review preference.

---

## 11. Repository layout

```
yuigram/
├── packages/
│   ├── core/          transport-agnostic framework
│   ├── bot-api/       Bot API subsystem
│   ├── mtproto/       MTProto subsystem
│   └── yuigram/       the façade users install
├── schemas/
│   ├── bot-api/       committed Bot API schema snapshots
│   └── tl/            committed TL schema snapshots
├── tools/
│   ├── scrape-bot-api/
│   ├── parse-tl/
│   └── emit/
├── examples/
├── docs/
└── tests/
    ├── unit/
    ├── integration/   against mock servers
    └── types/         type-level assertions
```

A monorepo with a single published façade. The alternative structures and the reasoning are
in [naming.md](naming.md) §6.

---

## 12. What was rejected

| Rejected | Reason |
|---|---|
| Core owning Context (the §12 hypothesis) | A context requires a decoded update; decoding is transport-specific. Core owns the *contract*, transports own the *construction*. |
| A shared `TelegramClient` base class both clients extend | Inheritance would force the union of two capability sets onto one type. Composition over a shared `core` gives reuse without false polymorphism. |
| Emulating Bot API methods over MTProto | Permanently-lagging compatibility surface. Telegram already ships this as the Bot API server. |
| Plugins as classes | A function returning a descriptor composes better and is easier to type. |
| Publishing `@yuigram/core` etc. as separate installs from day one | Fragments the onboarding story for no early benefit. Monorepo now, split later only if a real consumer needs it. |
| Making MTProto a peer dependency of the façade | Would make `npm install yuigram` insufficient, defeating the product's central promise. Tree-shaking and subpath exports address the size concern instead. |
| Wrapping an existing MTProto library behind an adapter | Would ship faster and would make the implementation someone else's. The public API would be Yuigram's and the substance would not be. Rejected on the project's terms: the implementation must belong to Yuigram. |
| Emulating the Bot API surface on top of Yuigram's MTProto stack | Two protocols, two implementations. Deriving one from the other reintroduces the compatibility-lag problem in a place where Yuigram controls both sides and gains nothing. |
