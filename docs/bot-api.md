# Bot API Subsystem

Scope, implementation strategy and phasing for Yuigram's Bot API support.

Reference point: **Bot API 10.2**, released 2026-07-14 — **185 methods, 388 objects**.

---

## 1. What the Bot API actually is

Architecturally simple, which is why this subsystem can realistically be completed:

```
POST https://api.telegram.org/bot<token>/<method>
Content-Type: application/json | multipart/form-data

-> { "ok": true, "result": … }
-> { "ok": false, "error_code": 400, "description": "…", "parameters": { "retry_after": 5 } }
```

There is no session, no handshake, no encryption beyond TLS, no client-side state. The token
is the credential and the whole of it. Update delivery is server-managed: Telegram maintains
the queue, the ordering and the deduplication, and hands over a clean array.

**The engineering difficulty is entirely in the type surface**, and the type surface is
generated. That asymmetry is what makes a complete, current Bot API implementation an
achievable goal rather than an aspiration.

---

## 2. Surface inventory

| Area | Scale | Generated? | Notes |
|---|---|---|---|
| Methods | 185 | Yes | Proxy dispatch; zero per-method runtime code |
| Objects | 388 | Yes | Plain interfaces |
| Update fields | ~20 raw | Yes | Expanded to ~60 event kinds — §5 |
| Errors | open-ended | Partial | Codes are structured; descriptions are free text |
| Keyboards | 2 families | Hand-written | Builders benefit from hand-tuned ergonomics |
| Media / input files | ~10 variants | Hybrid | Types generated, upload logic hand-written |
| Formatting | 3 modes | Hand-written | HTML, Markdown, MarkdownV2 + entity construction |

---

## 3. Code generation

The pipeline, per [architecture.md](architecture.md) §8:

```
scrape ──> normalize ──> bot-api.schema.json ──> emit ──> generated sources
```

### Source

Primary: `corefork.telegram.org/bots/api`, falling back to `core.telegram.org/bots/api`.
The corefork host publishes ahead of the stable documentation, which buys lead time on
unreleased features at no cost.

Cross-check: [`ark0f/tg-bot-api`](https://github.com/ark0f/tg-bot-api) (Apache-2.0 / MIT),
regenerated nightly. CI diffs Yuigram's parse against theirs; a divergence means either
Telegram restructured the page or the parser regressed, and both are worth an alert.

Explicitly **not** used: puregram's schema JSON, which is MPL-2.0. See
[licensing.md](licensing.md) §4.

### Intermediate representation

The IR normalizes Telegram's prose types into a discriminated union, so emitters never parse
English:

```ts
type TypeRef =
  | { kind: 'string' }  | { kind: 'integer' } | { kind: 'float' }
  | { kind: 'boolean' } | { kind: 'true' }
  | { kind: 'array', of: TypeRef }
  | { kind: 'union', of: TypeRef[] }
  | { kind: 'reference', name: string }
  | { kind: 'literal', value: string }
  | { kind: 'file' }
```

The awkward cases the parser must get right:

- `chat_id` is `Integer or String` — a union expressed in prose.
- `True` is a distinct type from `Boolean`: the field is present only when true.
- `InputFile or String` marks the multipart boundary.
- Union return types (`Message or True` for `editMessageText`) depend on whether the message
  is inline.
- Recursive types (`Message.reply_to_message`).
- Fields documented as always present but absent in practice for older messages.

### Emitted artifacts

| Output | Contents |
|---|---|
| `types.d.ts` | 388 object interfaces |
| `methods.d.ts` | parameter and return types for 185 methods |
| `api.d.ts` | the callable method surface |
| `events.ts` | event kind map, discriminants, service-message promotion table |
| `filters.ts` | generated per-field filters |
| `errors.ts` | known error-code mappings |

### Splitting the output

puregram's generated `updates.d.ts` alone is 358 KB, and mtcute's TL declarations are 1.96 MB.
Both are paid for by every consumer's TypeScript server on every keystroke.

Yuigram splits generated declarations by domain (`messages`, `chats`, `payments`, `stickers`,
`business`, `giveaways`, …) behind a barrel re-export. Consumers who import only the root
still pay for the barrel, but editors resolve and cache per-file, and incremental
recompilation touches a fraction of the surface. Measured impact will gate whether the
splitting granularity is right — see [performance.md](performance.md) §5.

---

## 4. Runtime

### Method dispatch

A proxy, as in puregram — 185 methods with no per-method code, and forward compatibility for
free:

```ts
bot.raw.sendMessage({ chat_id, text })      // typed from the schema
bot.raw.call('newMethod', { … })            // works before regeneration
```

### HTTP client

Native `fetch` on Node 22, behind a `HttpClient` interface so it can be replaced for proxying,
instrumentation or testing. No `undici`, `axios` or `node-fetch` in the dependency tree.

Multipart is built on the platform `FormData` and `Blob`, which Node 22 provides natively —
removing the `formdata-node` / `form-data-encoder` pair that puregram still carries. Streaming
uploads use `ReadableStream` so large files never buffer whole.

### Polling

```
getUpdates(offset, limit, timeout=30, allowed_updates)
  -> dispatch each
  -> offset = last update_id + 1
```

with exponential backoff on network failure and `retry_after` compliance on 429.

Nothing deduplicates here, because nothing needs to: the offset is the mechanism, and Telegram
will not resend an update once a later offset acknowledges it. Two consumers on one token do
not race either — Telegram answers the second with `409`, which stops that loop rather than
leaving both to interfere. Webhooks are the case that does need a recently-seen set, because
there Telegram retries anything it has not seen acknowledged.

**Not every failure is worth retrying.** Three responses, chosen by what the error means:

| Error | Response |
|---|---|
| Network failure, 5xx, 429 | Retry with backoff — transient, and it will clear |
| Other 4xx | Retry with backoff — the delay widens on every repeat |
| 401, 404, 409 | **Stop**, and report through `onFatal` |

The last row is the one that has to be deliberate. A 401 token does not become valid by
waiting, a 404 bot does not come back, and a 409 means a second process is calling
`getUpdates` with the same token — where retrying leaves two instances stealing updates from
each other and neither making progress. Stopping leaves one working bot; retrying leaves two
broken ones. The client logs the cause and transitions out of `running`, so `bot.state` never
claims to be receiving updates that stopped arriving.

**Shutdown cancels the in-flight request.** Every generated method takes an optional
`CallOptions` carrying an `AbortSignal`, and polling passes one. Without it, `stop()` waits out
the open long poll — up to a minute — which under most process managers is the difference
between a graceful stop and a kill.

`allowedUpdates: 'auto'` derives the minimal subscription from the registered handlers
([research.md](research.md) §1.6). This matters more than it appears, and every part of it is a
way to make a handler silently never fire:

| Detail | Why it bites |
|---|---|
| Telegram takes **its own update type names** | They are the `Update` field names, not Yuigram kinds. The two differ wherever a name reads better renamed — `message_edited` is Telegram's `edited_message`. A name Telegram does not recognise is ignored, so the update never arrives. |
| A promoted service kind is **not an update type** | `chat_member_joined` is a message carrying a marker, so it subscribes to every field that can deliver a message. |
| Omitting the parameter is **not "everything"** | Telegram reuses *the previous setting* — whatever a past run configured, persisted server-side — and its own default excludes `chat_member`, `message_reaction` and `message_reaction_count`. |

So when the registered set cannot be narrowed — an unconstrained filter could match anything —
every type is named explicitly rather than the parameter being dropped. The mapping from kind
to update type is generated from the schema, because a hand-written one drifts the moment
Telegram adds an update type, and the drift is invisible.

### Webhooks

`bot.webhookHandler()` returns a pure function from a parsed request to a response. Every
adapter is the few lines that translate one framework's objects into it:

```ts
import { createServer } from 'node:http'
import { expressWebhook, fastifyWebhook, nodeWebhook } from 'yuigram/webhook'

const handler = bot.webhookHandler({ secretToken })

createServer(nodeWebhook(handler, { path: '/hook' })).listen(8080)
app.use('/hook', expressWebhook(handler))        // express
app.post('/hook', fastifyWebhook(handler))       // fastify
```

**No adapter is a dependency.** Each describes the shape it needs structurally — a `headers`
bag, a `body`, a way to send a status — so no framework has to be installed for the types to
resolve, and no version is pinned. Koa, hono, h3, elysia and the Web `Request`/`Response` pair
follow the same pattern; they are additions to one file, not new dependencies.

Non-negotiable webhook behaviours, all pinned by tests:

| Behaviour | Why |
|---|---|
| `secret_token` compared in constant time | The only thing separating a real update from anyone who guessed the URL |
| 200 sent before the handler runs | Telegram retries anything it has not seen acknowledged, so waiting produces duplicates under exactly the load where duplicates hurt |
| Body size limit, enforced while reading | A public endpoint with an unbounded read is a memory exhaustion primitive; the check runs per chunk, so an endless body is cut off rather than buffered |
| Deduplication by `update_id` | Retries are normal, and a duplicated side effect — a second reply, a second charge — is visible to the user |

An oversized body is refused with `413` rather than the `400` a malformed one gets, and the
refusal does not report the size it received: that would tell whoever is probing exactly where
the cap sits.

**A webhook deployment chooses its own subscription.** `allowedUpdates: 'auto'` governs the
polling loop; a webhook bot never calls `getUpdates`, so the list goes to `setWebhook` instead:

```ts
await bot.api.setWebhook({
  url: 'https://example.com/hook',
  secret_token: secret,
  // Telegram's update type names, not Yuigram kinds — and stating them
  // explicitly, because the default excludes chat member and reaction updates.
  allowed_updates: ['message', 'callback_query', 'message_reaction', 'chat_member'],
})
```

The same three traps apply as for polling: Telegram takes its own update type names, a
promoted service kind is not one of them, and omitting the list reuses whatever a previous run
configured rather than meaning "everything".

### Files

| Operation | Limit | Approach |
|---|---|---|
| Download | 20 MB | `getFile` -> URL -> stream |
| Upload | 50 MB | multipart, streaming |
| Reuse | — | `file_id`, no transfer |
| Local server | unlimited | `useLocal` lifts both limits |

The 20/50 MB caps are Bot API facts, not Yuigram choices, and the documentation must say so
plainly — a developer hitting the ceiling should be told immediately that a local Bot API
server or an MTProto client is the answer.

---

## 5. Event promotion

The Bot API delivers service messages as `message` updates with a service field set.
Yuigram promotes them to first-class kinds, as puregram does
([research.md](research.md) §1.3), because the alternative is that every application writes
the same defensive branching and some of them get it wrong.

```
raw: { message: { new_chat_members: [...] } }   ->  kind: 'chat_member_joined'
raw: { message: { forum_topic_created: {...} } } ->  kind: 'forum_topic_created'
raw: { message: { video_chat_started: {} } }     ->  kind: 'video_chat_started'
```

The promotion table is generated from the schema by identifying `Message` fields that are
service markers, so a new service message type in a future Bot API release becomes a new
event kind automatically. The full taxonomy is in [events.md](events.md).

---

## 6. Rate limiting

Two mechanisms, both required:

**Reactive** — honour `429` + `parameters.retry_after`. Opt-in retry with a wait cap, since
silently sleeping for an hour is not a sane default.

**Proactive** — Telegram's soft limits are undocumented but real: roughly 30 requests/second
globally, 1 message/second per private chat, 20 messages/minute per group. A sliding-window
throttle ships as a plugin rather than in core, because the correct limits depend on the
deployment and a wrong built-in default is worse than none.

---

## 7. Phasing

### MVP

Everything needed to run a real bot in production, and nothing else:

- Full generated types and method surface for Bot API 10.2 (all 185 methods)
- HTTP client, multipart, streaming upload
- Long polling with `allowed_updates: 'auto'`
- Webhook handler + node/express/fastify adapters
- Event normalization with service-message promotion
- Keyboards (inline + reply), parse modes and entity formatting
- File download/upload, `file_id` reuse
- Error taxonomy with `FloodError`
- Raw API, typed and untyped

That is a complete Bot API client. There is no reason to ship a partial one — the surface is
generated, so "all 185 methods" costs no more than twenty.

### v0.x

- Remaining webhook adapters
- Throttling plugin
- Local Bot API server support (`useLocal`)
- Pagination helpers
- Business-account scoped API proxy
- Rich messages (Bot API 10.2) as a first-class builder

### v1.0

- Ephemeral messages, communities (Bot API 10.2 features that need design, not just types)
- Payments and Mini App helpers
- Passport

### Post-1.0

- Bot-over-MTProto, lifting the file-size ceiling for bots

---

## 8. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Telegram restructures the documentation HTML | **High** | Committed schema means builds do not break; scheduled CI job fails loudly; ark0f cross-check gives a second signal; manual schema patch is always possible |
| Prose type descriptions parsed wrongly | Medium | Golden tests over the emitted surface; ark0f diff; runtime `call()` escape hatch limits the blast radius |
| Undocumented behaviour (soft limits, absent "required" fields) | Medium | Treat documented-required as optional where evidence says otherwise; record deviations in a patch file applied after parsing |
| Generated `.d.ts` degrades editor performance | Medium | Domain splitting; measured budget in [performance.md](performance.md) §5 |
| Bot API release cadence outpaces maintenance | Low | Generation makes a release a review task, not an engineering task |

The committed-schema decision is what converts the highest-severity risk into an
inconvenience: if Telegram changes its documentation structure tomorrow, existing Yuigram
builds are unaffected and only the next regeneration needs attention.
