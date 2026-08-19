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

with exponential backoff on network failure, `retry_after` compliance on 429, and a bounded
recently-seen `update_id` set to survive overlapping restarts.

`allowed_updates: 'auto'` derives the minimal subscription from registered handlers
([research.md](research.md) §1.6). This matters more than it appears: `message_reaction` and
`chat_member` are **not delivered at all** unless explicitly requested, so the common failure
"my handler never fires" is prevented by construction.

### Webhooks

A framework-agnostic handler, with thin adapters:

```ts
bot.webhookCallback()                    // node:http
import { express } from 'yuigram/webhook/express'
```

Adapters for express, fastify, koa, hono, h3, elysia and the Web `Request`/`Response` pair.
Each is a few dozen lines and lives behind a subpath export so it never enters the main
bundle.

Non-negotiable webhook behaviours: `secret_token` validation on every request, a 200 response
before handler completion (Telegram retries otherwise), request-body size limits, and
deduplication by `update_id`.

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
