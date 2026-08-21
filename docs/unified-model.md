# The Unified Model

> What can actually be unified between the Bot API and MTProto?

This is the question the whole project rests on. Getting it wrong in the optimistic
direction produces a framework that lies to its users; getting it wrong in the pessimistic
direction produces two libraries in one package with a shared README.

The conclusion, stated up front:

> **The unifiable layer is real but thin. It is the application-facing plumbing — dispatch,
> context, filters, sessions, storage, errors, logging — not the Telegram domain model.
> Almost everything specific to Telegram differs, and the differences are load-bearing.**

Yuigram's value therefore comes from unifying *how you write an application*, not from
pretending the two APIs are one API.

---

## 1. Three transports, not two

The obvious framing is "Bot API + MTProto". Source inspection of mtcute's
`highlevel/methods/auth/` shows the real matrix has three entries:

| Mode | Transport | Credential | Update delivery | Raw surface |
|---|---|---|---|---|
| **Bot / HTTP** | Bot API over HTTPS | bot token | server-ordered, `getUpdates` or webhook | Bot API methods |
| **Bot / MTProto** | MTProto | bot token via `auth.importBotAuthorization` | `pts`-based, client-reconciled | full TL |
| **Account / MTProto** | MTProto | phone, QR, or stored session | `pts`/`qts`/`seq`, client-reconciled | full TL |

Bot-over-MTProto is not a variant of bot-over-HTTP. It gains 2 GB file transfer, raw TL and
lower latency; it loses the Bot API's curated update stream, its server-side conveniences
and its simplicity. A bot can be *either*, and the choice changes the capability set.

**Design consequence:** "bot" is not a client type. The client type is defined by
*transport*, and the credential is a property of the connection. Yuigram models
`Bot` (HTTP) and `User` (MTProto) as the two shipped clients, with bot-over-MTProto as a
deliberate post-1.0 addition rather than an accidental third code path.

---

## 2. The capability matrix

`✓` = supported, `~` = supported with materially different semantics, `✗` = absent.

| Capability | Bot API | MTProto | Unify? | Reasoning |
|---|:--:|:--:|---|---|
| **Send text message** | ✓ | ✓ | **Yes** | Genuinely the same operation. `chat + text -> message`. Safe to put on context. |
| **Edit / delete message** | ~ | ✓ | **Partial** | Bots cannot delete others' messages after 48h; users can delete their own anywhere. Unify the call, surface the failure honestly. |
| **Reply** | ✓ | ✓ | **Yes** | `reply_to_message_id` vs `replyTo` — a field-name difference, nothing more. |
| **Reactions** | ~ | ✓ | **Partial** | Bots need `message_reaction` in `allowed_updates`; users receive them unconditionally. Custom emoji reactions are Premium-gated for users. |
| **Message IDs** | ~ | ~ | **No** | Bot API IDs are per-chat integers. MTProto IDs are per-peer with distinct channel semantics, and the same logical message has *different* IDs in the two systems. Never present them as interchangeable. |
| **Users** | ~ | ~ | **Partial** | Both have `id`, `first_name`, `username`. MTProto adds `access_hash`, `min` flags, status, and full-profile fetches. Unify the common subset; never fake `access_hash`. |
| **Chats / groups** | ~ | ~ | **Partial** | Bot API flattens user/group/supergroup/channel into one `Chat`. MTProto keeps `User`/`Chat`/`Channel` distinct with different ID spaces. |
| **Channels** | ~ | ✓ | **Partial** | Bot API exposes channels only where the bot is an administrator. |
| **Peer addressing** | ✗ | ✓ | **No** | Bot API: bare `chat_id` or `@username`, stateless, forever. MTProto: `(id, access_hash)`, per-account, non-derivable, must be cached. **This is the single hardest asymmetry.** See §3. |
| **Files — download** | ~ | ✓ | **Partial** | Bot API caps at 20 MB and hands back a URL. MTProto streams chunks across parallel connections from media/CDN DCs, with file references that expire. |
| **Files — upload** | ~ | ✓ | **Partial** | Bot API caps at 50 MB (unless local server). MTProto uploads up to 2 GB (4 GB Premium) in chunks. |
| **`file_id` reuse** | ✓ | ✗ | **No** | `file_id` is a Bot API construct. MTProto has `InputFileLocation` + file reference. They do not convert without a round trip. |
| **Inline mode** | ✓ | ~ | **No** | Bots answer inline queries; users *send* them. Opposite ends of the same feature. |
| **Callback queries** | ✓ | ~ | **Partial** | Bots receive and answer; users press buttons and receive results. |
| **Keyboards** | ✓ | ~ | **Partial** | Construction unifies; a user client can only *interact*, not attach. |
| **Update delivery** | ~ | ~ | **No** | Long-poll/webhook against a server-ordered queue vs. client-side `pts`/`qts`/`seq` gap reconciliation. No shared implementation is possible. See §4. |
| **Update *dispatch*** | ✓ | ✓ | **Yes** | Once an update is normalized, everything downstream is transport-agnostic. **This is the seam.** |
| **Authentication** | ✗ | ✗ | **No** | Bot token in a URL vs. DH handshake, SMS code, SRP 2FA, per-DC keys. Nothing in common. |
| **Authorization session** | ✗ | ✓ | **No** | Bot API is stateless — the token *is* the session. MTProto sessions are auth keys, salts, DC state and a peer cache. |
| **Framework session (user state)** | ✓ | ✓ | **Yes** | Purely a framework concern. Fully shared. |
| **Storage** | ~ | ~ | **Partial** | A KV contract serves framework sessions on both. MTProto additionally needs a structured peer repository. Layer, do not merge. See [storage.md](storage.md). |
| **Errors** | ~ | ~ | **Partial** | Common envelope, preserved originals. `429 + retry_after` vs `FLOOD_WAIT_N` map onto one `FloodError`; the rest do not. |
| **Flood control** | ~ | ~ | **Partial** | Same *concept*, different mechanics: HTTP 429 and soft per-chat limits vs. per-method `FLOOD_WAIT`/`SLOWMODE_WAIT`. |
| **Raw API** | ✓ | ✓ | **No — deliberately separate** | `bot.api.sendMessage({…})` and `user.api.messages.sendMessage({…})` are different type universes and must stay so. |
| **Logging** | ✓ | ✓ | **Yes** | Framework concern. |
| **Middleware / filters / routing** | ✓ | ✓ | **Yes** | Operate on normalized updates. Fully shared. |

---

## 3. The peer problem

This deserves its own section because it is the asymmetry most likely to produce a broken
abstraction.

In the **Bot API**, addressing a chat is stateless:

```
sendMessage(chat_id: 123456789, text: "hi")
sendMessage(chat_id: "@channelname", text: "hi")
```

The bot needs no prior knowledge. The ID works forever.

In **MTProto**, every peer reference requires an `access_hash`:

```
messages.sendMessage(peer: inputPeerUser(user_id: 123456789, access_hash: 0x…), …)
```

The hash is **per-account** and **non-derivable**. A client that has never encountered a
user cannot construct a reference to them. This forces every MTProto client to maintain a
persistent peer database, populated from every update and RPC result that carries peers, and
to handle `min` peers — references that arrive without a usable hash and must be resolved
through a context peer.

### Why this breaks naive unification

A tempting API is:

```ts
// Looks reasonable. Is a trap.
await client.send(123456789, "hello")
```

On a `Bot` this always works. On an `Account` it works only if that peer is already cached, and
otherwise fails with an error the developer did not anticipate and cannot fix by retrying.
A unified signature that succeeds on one client and fails unpredictably on the other is
worse than two honest signatures.

### Resolution

Yuigram exposes peer resolution explicitly, and types the difference:

```ts
// Bot: a chat reference is just an id or @username.
type BotPeer = number | `@${string}`

// Account: a peer is a resolved handle, or something resolvable that may fail.
type UserPeer = Peer | number | `@${string}`
await user.resolve('@someone')   // may hit the network, may throw PeerNotFound
```

Context-bound operations — `message.reply()`, `message.edit()`, `message.delete()` — are safe on both
clients, because the peer came from the incoming update and is therefore already known. This
is the important practical point: **the overwhelming majority of handler code addresses
peers it just heard from**, so the unified surface covers the common case honestly, and the
divergence appears only where it genuinely exists — addressing a peer out of the blue.

---

## 4. Update delivery vs. update dispatch

The clean seam in the whole architecture sits here.

```
   BOT API                                       MTPROTO
   ───────                                       ───────
   getUpdates / webhook                          socket -> encrypted messages
        │                                             │
        │  server-ordered, deduplicated                │  updates.* constructors
        │  gap recovery: Telegram's problem            │  pts/qts/seq bookkeeping
        │                                             │  gap detection
        │                                             │  getDifference / getChannelDifference
        │                                             │  peer backfill, no-dispatch index
        ▼                                             ▼
   ┌──────────────────────────────────────────────────────┐
   │                     NORMALIZER                        │   <- per-transport, not shared
   └──────────────────────────────────────────────────────┘
                              │
                        Yuigram Event
                              │
   ┌──────────────────────────────────────────────────────┐
   │   dispatch · filters · middleware · context · session │   <- 100% shared
   └──────────────────────────────────────────────────────┘
                              │
                          Handler
```

Above the normalizer, nothing is shared and nothing should be. `highlevel/updates/manager.js`
in mtcute is 57 KB of gap-reconciliation logic with no Bot API counterpart whatsoever.

Below the normalizer, everything is shared, and this is where a framework earns its keep:
one middleware model, one filter algebra, one session system, one router, one error
taxonomy, one logger — usable from a bot handler and a userbot handler without change.

**This seam is Yuigram's core architectural claim.**

---

## 5. What the unified context can honestly contain

Only fields that exist with the same meaning on both sides, and only actions that are safe
on both.

```ts
interface Context {
  // Identity of the delivering client — always available, always honest.
  readonly client: Bot | Account
  readonly transport: 'bot-api' | 'mtproto'

  // Normalized, present on both.
  readonly chat: Chat | undefined
  readonly sender: User | undefined
  readonly text: string | undefined
  readonly date: Date

  // Safe on both, because the peer came from the update.
  reply (text: string, params?: ReplyParams): Promise<Message>
  react (emoji: string): Promise<void>

  // The escape hatch, typed per transport.
  readonly raw: unknown   // narrowed by transport — see api-design.md §7
}
```

Everything else — `answerCallbackQuery`, `editMessageMedia`, `forwardMessages` with
MTProto's semantics, `getFullUser` — lives on the client, where its availability is a
compile-time fact rather than a runtime surprise.

### The rule

> A member appears on the unified context **only** if it behaves the same way on both
> transports. Anything else lives on the client, is transport-narrowed, or is exposed under
> `raw`.

This rule is what keeps Yuigram from over-abstracting the two protocols into a single
surface that misrepresents both.

---

## 6. Discriminating at the type level

Type narrowing carries the divergence, so the compiler enforces what prose cannot.

```ts
app.onMessage(async (message) => {
  await message.reply('works on both')       // unified surface

  if (message.transport === 'mtproto') {
    await message.client.api.messages.readHistory({ … })   // narrowed to Account
  }

  if (message.transport === 'bot-api') {
    await message.client.api.setMessageReaction({ … })     // narrowed to Bot
  }
})
```

Handlers registered directly on a client skip the discriminant entirely, because the client
type is already known:

```ts
bot.onCallbackQuery(async (query) => {
  await query.answer('done')      // Bot-only, no narrowing needed
})
```

This gives two ergonomics tiers from one model: write against `app` for cross-client logic
and accept a discriminant, or write against a client for full fidelity with no ceremony.

---

## 7. Anti-patterns this model rejects

| Anti-pattern | Why it is rejected |
|---|---|
| A single `Client` class with `type: 'bot' \| 'user'` | Every member becomes conditionally typed. Inference collapses, autocomplete fills with members that throw at runtime, and AI assistants — which read types, not caveats — generate broken code confidently. |
| A unified `Message` entity spanning both | Message IDs are not interchangeable; media models differ; a shared type would be a union pretending to be a product type. Normalize the *common* fields, keep the original under `raw`. |
| Auto-converting `file_id` to `InputFileLocation` | Requires a network round trip, fails in ways the developer cannot predict, and hides a real cost behind a property access. |
| `client.send(anyPeer, text)` uniformly | Silently unreliable on MTProto for uncached peers. See §3. |
| One `Storage` interface for both session kinds | Framework sessions are KV. MTProto authorization state is a structured multi-table store. Forcing them together produces a KV interface with a peer-shaped hole. See [storage.md](storage.md). |
| Emulating Bot API methods on MTProto (or the reverse) | This is the tdlib/Bot-API-server problem. It is an enormous, permanently-lagging compatibility surface, and Telegram already ships that product. |

---

## 8. Where the boundary sits

```
                        ┌─────────────────────────────┐
                        │      Application code        │
                        └─────────────────────────────┘
                                      │
   ══════════════════════════ UNIFIED ══════════════════════════
                                      │
        App container · routing · filters · middleware ·
        context (common subset) · sessions · storage ·
        errors · logging · plugins · testing
                                      │
   ════════════════════════ TRANSPORT-SPECIFIC ═════════════════
                                      │
        ┌─────────────────┐                  ┌─────────────────┐
        │  Bot subsystem  │                  │Account subsystem│
        ├─────────────────┤                  ├─────────────────┤
        │ HTTPS client    │                  │ MTProto stack   │
        │ polling/webhook │                  │ auth + DH + SRP │
        │ multipart       │                  │ DC pool + PFS   │
        │ Bot API types   │                  │ TL codec        │
        │ file_id model   │                  │ peer repository │
        │ raw: Bot API    │                  │ updates manager │
        │                 │                  │ raw: TL         │
        └─────────────────┘                  └─────────────────┘
```

Everything above the line ships once and serves both. Everything below is written twice
because it genuinely is two different things.

Measured against mtcute's own proportions, the lower-right box is roughly 80% of the total
engineering cost of the project. That is the number [feasibility.md](feasibility.md) has to
confront.
