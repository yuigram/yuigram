# Research

Findings from direct inspection of the published artifacts of puregram and mtcute, of the
Telegram Bot API and MTProto specifications, and of the surrounding npm ecosystem.

All figures were measured on 2026-08-19 against:

| Artifact | Version | License |
|---|---|---|
| `puregram` | 3.7.0 | MPL-2.0 |
| `@puregram/api` | 10.2.1 | MPL-2.0 |
| `@mtcute/core` | 0.31.0 | MIT |
| `@mtcute/tl` | 223.0.0 | MIT |
| Telegram Bot API | 10.2 (2026-07-14) | — |
| Telegram TL schema | layer 223 | — |

Measurements are taken from compiled distribution artifacts rather than repository source,
so line counts indicate scale rather than authoring effort. They are used here only for
order-of-magnitude sizing.

---

## 1. puregram

### 1.1 Shape of the project

puregram splits into two packages with a deliberate seam between them:

```
puregram            hand-written runtime      ~92 modules,  705 KB unpacked
  └── @puregram/api generated Bot API layer   ~116 files,   4.0 MB unpacked
```

The runtime package depends on exactly three things at runtime: `@puregram/api`,
`formdata-node` and `form-data-encoder`. It is ESM-only and requires Node >= 22. That is an
unusually disciplined dependency budget for a framework of this surface area, and it is
achievable precisely because the Bot API is, at the transport level, nothing more than
HTTPS with JSON and multipart bodies.

The size asymmetry is the important part. The hand-written framework is small. The
generated type surface is forty times larger. This ratio is the central economic fact of
Bot API framework development: **the value is in the types, and the types are a build-time
artifact rather than an authoring effort.**

### 1.2 Code generation

`@puregram/api` ships `schema/10.2.json` — a 1.0 MB normalized intermediate representation
of the Bot API containing **185 methods and 388 objects**. The schema records its own
provenance:

```json
"source": {
  "corefork": "https://corefork.telegram.org/bots/api",
  "core": "https://core.telegram.org/bots/api",
  "fetchedAt": "2026-07-14T20:58:39.619Z"
}
```

The pipeline is `parse -> emit`, driven by `cheerio` and `undici` in devDependencies: the
HTML documentation is scraped, normalized into a typed IR, and then a set of emitters
produce `types`, `methods`, `api-methods`, `structures`, `updates`, `filters`, `dispatch`,
`method-params` and `formattable-fields`.

The IR normalizes Telegram's prose-typed parameters into a discriminated union:

```json
{ "name": "chat_id", "required": true,
  "type": { "kind": "union", "of": [{ "kind": "integer" }, { "kind": "string" }] } }
```

This is the right architecture, and it is the single most important idea to carry forward.
Telegram publishes no machine-readable Bot API schema; the documentation page *is* the
specification. Any framework that hand-maintains Bot API types will fall behind, because
Bot API 10.2 alone added rich messages, ephemeral messages and communities in one release.

Note the `corefork` source. `corefork.telegram.org` publishes documentation ahead of
`core.telegram.org`, which gives a generated client lead time on unreleased features. That
is a genuinely useful trick and costs nothing to adopt.

### 1.3 Update taxonomy — the strongest idea in the project

The Bot API `Update` object has roughly twenty optional fields. puregram exposes
**60 distinct update classes.**

The extra forty come from *promoting service messages to first-class updates*. In the raw
Bot API, a user joining a chat arrives as a `message` whose `new_chat_members` field is
set. A forum topic being created arrives as a `message` with `forum_topic_created` set.
puregram splits these into `NewChatMembersUpdate`, `ForumTopicCreatedUpdate`,
`VideoChatStartedUpdate`, `GiveawayCompletedUpdate`, `MigrateToChatIdUpdate` and so on.

This matters because the raw shape forces every application to write the same defensive
branching inside its `message` handler, and because a service message is not a message in
any sense the application cares about — it has no text, no author intent, and different
handling. Promoting them is not sugar; it removes a whole class of bugs where a service
message falls through into text-handling logic.

**Yuigram should adopt this concept.** It is an architectural idea rather than an
implementation, and the specific promotion list is a direct reading of the Bot API surface.

### 1.4 Dispatch and middleware

The pipeline is a conventional onion, implemented in about thirty lines:

```js
async function runChain (chain, ctx) {
  let i = 0
  const next = async () => {
    if (i >= chain.length) return
    const fn = chain[i++]
    if (fn) await fn(ctx, next)
  }
  await next()
}
```

Around it sits a `HookRegistry` with named hook points, each holding three priority
buckets (`high`, `normal`, `low`):

| Hook | Purpose |
|---|---|
| `onBeforeRequest` / `onRequestIntercept` / `onResponseIntercept` / `onAfterRequest` | HTTP request lifecycle |
| `onApiCall` | around-hook wrapping the actual API call |
| `onUpdate` | update dispatch middleware |
| `onInit` / `onShutdown` | lifecycle |
| `onError` / `onDispatchError` | error observation and replacement |

Two details are worth carrying forward.

First, `onApiCall` is an **around-hook**: middleware receives `next()` and reaching the
network requires calling it. This is what makes throttling, retry, caching and mocking
implementable as ordinary plugins rather than as framework features. When the chain is
empty the action runs directly, so the abstraction costs nothing when unused.

Second, `runUpdate` reserves a **fixed slot for user handlers between `normal` and `low`**:

```js
await runChain([...update.high, ...update.normal, userHandlers, ...update.low], ctx)
```

This gives plugins a well-defined position relative to application handlers without
requiring them to guess registration order — session middleware registers `high` and is
guaranteed to run before handlers; metrics register `low` and are guaranteed to run after.

### 1.5 The filter system

This is the most sophisticated type-level work in the project.

```ts
interface Filter<Base = unknown, Mod = unknown> extends FilterMeta {
  (update: AnyUpdate): update is AnyUpdate & Base
  and: <B2, M2>(other: Filter<B2, M2>) => Filter<Base & B2, Mod & M2>
  or:  <B2, M2>(other: Filter<B2, M2>) => Filter<Base | B2, Mod | M2>
  not: () => Filter<unknown, unknown>
}
```

A filter is a callable type-guard carrying two independent type parameters and a runtime
metadata object. The separation of `Base` from `Mod` is the insight:

- `Base` narrows *which update type* this is (`MessageUpdate`, `CallbackQueryUpdate`).
- `Mod` narrows *the shape of fields on it* (`{ text: string }` — no longer optional).

They compose independently under `and` / `or`, so `kind.message.and(hasText)` yields a
handler argument typed `MessageUpdate & { text: string }`.

The `Mod` side is applied through a helper that is subtler than it appears:

```ts
export type Modify<Base, Mod> = Omit<Base, keyof Mod> & Mod
```

A plain `Base & Mod` would leave the original accessor signature intact, and TypeScript
would re-widen `text` back to `string | undefined` on chained access. `Omit` first strips
the overridden keys, so the refinement actually survives. This is a real trap and the fix
is non-obvious; Yuigram should use the same technique.

The runtime side carries a `kinds?: readonly string[]` hint, letting the dispatcher skip
predicate evaluation entirely for updates of unrelated kinds. Type-level precision and a
runtime fast path from the same object.

### 1.6 Two more ideas worth taking

**Auto-derived `allowed_updates`.** `Dispatcher.collectAllowedKinds()` walks the registered
handlers and computes the minimal update subscription set, exposed as
`allowedUpdates: 'auto'`. Handlers registered via opaque predicates set an `opaque` flag
that widens the set back to everything. This is a real bandwidth and latency win that most
frameworks leave to the user to get wrong.

**Proxy-based API surface.** The entire method surface is:

```js
export function createApiProxy (caller) {
  return new Proxy({}, {
    get (_t, prop) {
      if (prop === 'call') return (m, p) => caller(m, p)
      return (params) => caller(prop, params)
    }
  })
}
```

185 methods, zero per-method runtime code. The types come from the generated `.d.ts`; the
runtime is eleven lines. New Bot API methods work the moment the schema regenerates, and
`api.call(method, params)` provides a forward-compatible escape hatch for methods newer
than the installed types.

### 1.7 Plugin model

```ts
interface Plugin<N extends string = string, Ext = unknown> {
  readonly name: N
  readonly dependsOn?: readonly string[]
  install: (tg: Telegram) => Ext | Promise<Ext>
}
```

`tg.extend(plugin)` returns `Telegram<Ext & { [K in N]: Awaited<Ext2> }> & …`, so installed
plugins accumulate onto the client type. Installation order is resolved topologically with
explicit `PluginConflict`, `PluginCycle` and `PluginMissingDep` errors.

The type-level accumulation is the good part: `tg.session` exists on the type only after
`.extend(session())` has been called. The awkward part is that this only works for a fluent
chain — a plugin installed on a variable that was already typed does not retroactively
widen it, and the accumulated intersection type degrades editor performance as plugins pile
up. Yuigram should keep the pattern but bound the intersection depth.

### 1.8 Limitations

- **Bot API only.** No MTProto, and no path to it — the architecture assumes a stateless
  request/response transport throughout.
- **Single-client.** `Telegram` is the application. Running two bots means two independent
  objects with no shared middleware, storage or lifecycle.
- **Declaration merging for cross-cutting fields.** `match?: RegExpMatchArray` is bolted
  onto nine update interfaces via `declare module`. It works, but it is a global mutation of
  another package's types, and two plugins claiming the same field silently conflict.
- **Scraper fragility.** The schema pipeline depends on the HTML structure of a page
  Telegram can restructure at will.

---

## 2. mtcute

### 2.1 Measured scale

Line counts from compiled `.js` in `@mtcute/core` 0.31.0:

| Subsystem | Files | LOC | What it is |
|---|---:|---:|---|
| `network/` | 27 | 4,808 | MTProto protocol: sessions, transports, auth, DC pool |
| `utils/` | 31 | 2,520 | crypto, binary, links, deep-link parsing |
| `storage/` | 18 | 817 | driver / repository / service storage stack |
| `highlevel/methods/` | 310 | 9,958 | Telegram API method wrappers, 18 domains |
| `highlevel/types/` | 139 | 13,616 | entity wrapper classes |
| `highlevel/updates/` | 4 | 1,701 | the updates manager |
| `highlevel/utils/` | 15 | 1,426 | peer/message helpers |
| `tl/` | 6 | 27,270 | binary codec (largely generated tables) |

And in `@mtcute/tl` 223.0.0:

| File | Size | Contents |
|---|---:|---|
| `index.d.ts` | **1.96 MB** | generated TypeScript declarations |
| `api-schema.json` | 1.83 MB | TL layer 223 — **2,315 constructors and methods** |
| `binary/writer.js` | 473 KB | generated serializers |
| `binary/reader.js` | 222 KB | generated deserializers |
| `raw-errors.json` | 131 KB | **552 error types**, 371 method-to-error mappings |

Two numbers deserve emphasis. **2,315 TL entries** is the size of the surface a complete
MTProto client must be able to serialize, deserialize and type. **1.96 MB of `.d.ts`** is
what that costs the consumer's TypeScript server on every project that imports it.

### 2.2 The protocol layer

`network/session-connection.js` is 1,572 lines and is the single densest file in either
project. Its method list is the honest specification of what MTProto requires:

```
_authorize / _authorizePfs          auth key generation, perfect forward secrecy
waitForUnencryptedMessage           plaintext handshake channel
_handleRawMessage / _handleMessage  container unpacking, gzip, recursion
_onRpcResult                        result routing, error mapping
_onMessageAcked / _sendAck          acknowledgement bookkeeping
_onBadServerSalt                    salt rotation and replay
_onBadMsgNotification               clock skew and msg_id correction
_onNewSessionCreated                session invalidation
_onMsgsStateInfo / _onMessagesInfo  delivery state reconciliation
_onFutureSalts                      salt prefetch
_onPong / _rtt                      liveness and round-trip measurement
sendRpc / _cancelRpc                request lifecycle, abort, chaining
_checkTimeouts / _flush / _doFlush  batching and the send loop
```

None of this is optional. A client that skips acknowledgement tracking will silently drop
messages; one that skips `bad_msg_notification` handling breaks whenever the local clock
drifts; one that skips `bad_server_salt` breaks roughly hourly.

The auth key exchange in `network/authorization.js` requires, as dependencies:

- RSA with **two different padding schemes** (`rsa_pad` for current keys, a legacy path for
  old keys), selected by key fingerprint
- **PQ factorization** — Pollard's rho / Brent, in the request path
- **Miller-Rabin** primality testing, used to reject a prime `pq`
- **AES-IGE** — a block mode that exists essentially nowhere outside Telegram and is not in
  Node's `crypto`, so it must be hand-implemented
- **2048-bit safe-prime validation** of the DH prime (`checkDhPrime`), expensive enough that
  mtcute caches the result
- SHA-1 and SHA-256, `modPow` over BigInt
- Hardcoded server RSA public keys, matched by fingerprint

with security assertions at every step (nonce equality, inner-hash verification, type
assertions) because each one is a real attack surface.

### 2.3 Connection management

`network-manager.js` maintains **separate connection pools per data centre**, sized by
purpose:

```js
const defaultConnectionCountDelegate = (kind, dcId, isPremium) => { … }
// main / upload x8 / download x8 / downloadSmall
```

Per DC, mtcute persists a permanent auth key, indexed temporary keys with expiry (PFS), and
server salts. Files download in parallel chunks across multiple connections; media DCs are
distinct from the primary DC; CDN DCs are a further case.

This is why a naive "one socket per client" MTProto implementation is not merely slower but
functionally inadequate for file transfer.

### 2.4 The updates manager

`highlevel/updates/manager.js` is 57 KB and is where correctness is hardest to achieve.

MTProto does not deliver updates as an ordered stream. It delivers them against a set of
sequence counters — `pts`, `qts`, `seq`, `date` for the common box, and an independent `pts`
per channel — and the client is responsible for **detecting gaps and reconciling them** by
calling `updates.getDifference` / `updates.getChannelDifference`.

The implementation carries, among other state:

- per-channel `pts` maps and a common-box state, loaded and flushed to storage
- a **no-dispatch index**, so updates already observed as RPC results are not re-emitted
- postponed-update queues for out-of-order arrivals
- pending difference fetches, deduplicated and deferred
- a peer cache with on-demand fetching of peers referenced but not supplied
- channel open/closed tracking, and `CHANNEL_PRIVATE` poisoning so a lost channel does not
  loop forever

**This subsystem has no Bot API counterpart at all.** The Bot API server does this work on
Telegram's infrastructure and hands the bot a clean ordered list. This asymmetry is the
single most important input to the unified-model analysis.

### 2.5 Storage

Three layers, cleanly separated:

```
driver      (memory | sqlite | idb)                    connection lifecycle, transactions
repository  (auth-keys | kv | peers | ref-messages)    raw persistence contracts
service     (auth-keys | current-user | peers | updates | future-salts | default-dcs)
```

The `peers` repository is the one that must be understood. MTProto identifies a peer by
`(id, access_hash)`, and **the access hash is per-account and non-derivable** — a client
that has never seen a user cannot construct a reference to them. Every MTProto client is
therefore obliged to maintain a persistent peer database, and losing it degrades the client
to whatever it can re-resolve.

The Bot API has no equivalent requirement: a bot addresses chats by bare numeric ID or
`@username`, forever, with no local state.

### 2.6 Authorization modes

`highlevel/methods/auth/` reveals that MTProto supports **bot authorization as well as user
authorization**:

```
sign-in.ts        phone + code
sign-in-bot.ts    bot token via auth.importBotAuthorization
sign-in-qr.ts     QR login
check-password.ts 2FA via SRP  (utils/crypto/password.ts: computeSrpParams)
```

So the transport matrix is not two-by-two but three-way:

| Mode | Transport | Credential |
|---|---|---|
| Bot over HTTP | Bot API | bot token |
| Bot over MTProto | MTProto | bot token |
| Account over MTProto | MTProto | phone / QR / session |

Bot-over-MTProto is *not* equivalent to bot-over-HTTP. It bypasses Bot API file-size limits
and gains raw TL access, but loses the Bot API's server-side conveniences and its curated
update stream. Treating "bot" as a single concept would be a modelling error.

### 2.7 Dependencies

`@mtcute/core` depends on `@fuman/io`, `@fuman/net`, `@fuman/utils` (all `0.0.21`, described
by their own author as "experimental"), `@mtcute/file-id`, `@mtcute/tl-runtime`, and `long`
(Apache-2.0). `@mtcute/node` additionally pulls `better-sqlite3` — a native module with a
compilation step. `@mtcute/wasm` exists because the pure-JS implementations of AES-IGE and
friends are too slow.

The `@fuman/*` packages are a supply-chain consideration: pre-1.0, single-maintainer, and
shared with the framework author. Not a defect, but a fact to record.

---

## 3. Telegram Bot API

Bot API **10.2**, released 2026-07-14: 185 methods, 388 objects. The most recent release
added rich messages (structured blocks: headings, tables, collages, mathematical
expressions), ephemeral messages (group messages visible to a single user), and communities
(linked supergroups and channels).

The characteristics that matter architecturally:

- **Stateless HTTPS.** `POST https://api.telegram.org/bot<token>/<method>`, JSON or
  multipart in, `{ ok, result }` or `{ ok: false, error_code, description, parameters }` out.
- **Server-managed updates.** `getUpdates` long-polling or webhook delivery. Ordering,
  deduplication and gap recovery are Telegram's problem, not the client's.
- **`allowed_updates` subscription.** Explicit opt-in per update type, and — importantly —
  some update types are *not delivered at all* unless requested (`message_reaction`,
  `chat_member`).
- **Hard file limits.** 20 MB download, 50 MB upload, unless running against a local Bot API
  server (`useLocal`), which lifts them.
- **No machine-readable schema.** The HTML documentation is the specification.
- **Flood control** via HTTP 429 with `parameters.retry_after`, plus undocumented soft
  limits (approximately 30 requests/second globally, 1 message/second per private chat, 20
  messages/minute per group).

An independent, well-maintained machine-readable schema does exist:
[`ark0f/tg-bot-api`](https://github.com/ark0f/tg-bot-api) publishes OpenAPI and a custom
JSON schema, regenerated nightly and on every `tdlib/telegram-bot-api` commit, under a dual
**Apache-2.0 / MIT** licence. This is directly relevant to Yuigram's licensing position and
is discussed in [licensing.md](licensing.md).

---

## 4. Telegram MTProto

TL layer **223**. 2,315 schema entries, 552 error types.

Requirements, grouped by how hard each actually is:

| Area | Difficulty | Note |
|---|---|---|
| TL parsing and codegen | Medium | well-specified grammar; flags/conditional fields and bare-vs-boxed types are the traps |
| Binary serialization | Medium | little-endian, 4-byte alignment, `long`/`int128`/`int256`, gzipped payloads |
| Transport framing | Low–Medium | intermediate/abridged/padded; obfuscation is a simple AES-CTR wrapper |
| Auth key exchange | **Hard** | RSA + two paddings, PQ factorization, Miller-Rabin, AES-IGE, safe-prime checks |
| Encrypted message layer | **Hard** | msg_id/seqno rules, containers, acks, salts, clock-skew recovery |
| DC migration | Medium–Hard | `*_MIGRATE_N` errors, `auth.exportAuthorization` handoff, per-DC keys |
| Session persistence | Medium | auth keys, salts, DC options, peer cache, update state |
| **Updates manager** | **Extreme** | `pts`/`qts`/`seq` gap recovery, per-channel boxes, difference reconciliation |
| File transfer | Hard | chunked parallel transfer, media DCs, CDN DCs, file references and their expiry |
| 2FA | Medium | SRP against `account.Password`; fiddly but well-documented |
| Entity/peer layer | **Very High** | `access_hash` lifecycle, `min` peers, file-reference refresh — the long tail |
| Flood/rate handling | Medium | `FLOOD_WAIT_N`, `SLOWMODE_WAIT_N`, per-method limits |

Two operational constraints from `core.telegram.org/api/obtaining_api_id`, which are product
constraints rather than engineering ones:

- **`api_id`/`api_hash` are per-developer.** One per phone number. Telegram states that
  sample IDs embedded in open-source code are server-side limited and unsuitable for
  released apps — they produce `API_FLOOD`. **Yuigram cannot ship credentials**; every user
  must obtain their own, and this must be surfaced prominently in onboarding.
- **Ban exposure.** Telegram monitors unofficial clients and bans accounts used for
  flooding, spamming or counter-faking. A framework that makes userbots easy to write is a
  framework whose users can lose their accounts. Documentation carries a duty of care here.

---

## 5. Ecosystem

npm downloads for the month ending 2026-08-18:

| Package | Downloads | Scope | License |
|---|---:|---|---|
| `grammy` | 16,010,590 | Bot API | MIT |
| `telegraf` | 1,474,879 | Bot API | MIT |
| `telegram` (GramJS) | 1,086,253 | MTProto | MIT |
| `node-telegram-bot-api` | 904,403 | Bot API | MIT |
| `teleproto` | 82,863 | MTProto | MIT |
| `@mtcute/core` | 59,573 | MTProto | MIT |
| `@mtcute/node` | 46,768 | MTProto | MIT |
| `gramio` | 14,551 | Bot API | MIT |
| `puregram` | 4,972 | Bot API | MPL-2.0 |
| `tgsnake` | 513 | MTProto | MIT |

Two structural facts stand out.

**grammY has won the Bot API layer**, by roughly an order of magnitude over its nearest
competitor and by three orders over puregram. Any new Bot API framework is entering a solved
market.

**The MTProto layer is unsettled.** GramJS — still pulling a million downloads a month — was
**archived on 2026-07-14** and is read-only; development continues in `teleproto`, a 2025
fork now at 83k/month. mtcute is the most technically serious maintained option at ~60k/month.
A large installed base is currently sitting on an archived library.

That instability, rather than the Bot API market, is where an opening exists. It is examined
in [competitive-analysis.md](competitive-analysis.md).

---

## 6. Findings carried forward

**Adopt as concepts** (independently implemented):

1. Schema-driven code generation with a normalized IR — the only sustainable way to track
   Telegram, and it moves Bot API maintenance from authoring to CI.
2. Promoting service messages to first-class update kinds.
3. `Filter<Base, Mod>` dual narrowing, with the `Omit`-based `Modify` helper.
4. Runtime `kinds` metadata on filters for a dispatch fast path.
5. Around-hooks on the API call path, so retry/throttle/cache/mock are plugins.
6. A reserved handler slot between middleware priority bands.
7. Auto-derived `allowed_updates` from registered handlers.
8. Proxy-based method surface with a typed `call()` escape hatch.
9. Topologically-ordered plugin installation with explicit dependency errors.
10. Driver / repository / service storage layering for MTProto state.
11. Scraping `corefork.telegram.org` for lead time on unreleased Bot API features.

**Avoid:**

1. Declaration merging into a dependency's types for cross-cutting handler fields.
2. Unbounded type-level intersection accumulation on the client type.
3. A single monolithic 2 MB `.d.ts` — the TypeScript-server cost is paid by every consumer.
4. One client object being the whole application — it prevents multi-client hosting.
5. Assuming Bot API architecture generalizes to MTProto. It does not; sections 2.4 and 2.5
   are the proof.

**Established as hard constraints:**

1. puregram is **MPL-2.0**: file-level copyleft. Copying any fragment into a Yuigram file
   makes that file MPL. See [licensing.md](licensing.md).
2. mtcute is **MIT**: reusable with attribution, including vendoring and relicensing of
   derivative work.
3. MTProto's updates manager and peer/`access_hash` model have no Bot API analogue, and place
   a hard floor under how much of the two systems can share an abstraction.
