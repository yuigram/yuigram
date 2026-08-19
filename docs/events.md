# Events

The event taxonomy, naming rules, payload model, type inference and dispatch semantics.

---

## 1. Pipeline

```
Telegram update
      │
      ▼
[ transport normalizer ]     bot-api or mtproto — the only divergent stage
      │  assign kind · extract common fields · preserve raw · tag client
      ▼
   Update                    normalized, transport-tagged
      │
      ▼
[ dispatch ]                 filters · middleware · handlers
      │
      ▼
   Handler
```

Everything after the normalizer is shared. See [unified-model.md](unified-model.md) §4.

---

## 2. Naming rules

Fixed, so that names are guessable rather than memorized:

1. **`snake_case`**, matching Telegram's own vocabulary. `callback_query`, not
   `callbackQuery`.
2. **Noun, or noun + past-tense verb.** `message`, `message_edited`, `chat_member_joined`.
3. **Subject first.** `chat_member_joined`, not `joined_chat_member` — so related events sort
   and autocomplete together.
4. **No `on` prefix in the name.** `bot.on('message')`, never `bot.on('onMessage')`.
5. **Transport-exclusive events are namespaced.** `mtproto:*` for events only a `User` client
   can produce, so their availability is visible at a glance.

### A deliberate departure from the Bot API

The Bot API names the edited-message update `edited_message`. Yuigram uses
**`message_edited`**, because rule 3 groups the whole message family together:

```
message
message_edited
message_deleted
message_reaction
message_reaction_count
```

against the Bot API's ordering, which scatters them. The raw Bot API name remains accessible
via `ctx.raw`, and the mapping is documented — this is a naming choice in Yuigram's own
vocabulary, which the framework is entitled to have, and it costs one line in the migration
guide.

---

## 3. Taxonomy

### 3.1 Core events — both transports

| Event | Description |
|---|---|
| `message` | New message |
| `message_edited` | Message edited |
| `message_deleted` | Message deleted |
| `message_reaction` | Reaction added or removed |

### 3.2 Bot API events

| Event | Notes |
|---|---|
| `channel_post` / `channel_post_edited` | Channel posts |
| `business_message` / `business_message_edited` / `business_messages_deleted` | Business accounts |
| `business_connection` | Connection state changed |
| `callback_query` | Inline button pressed |
| `inline_query` | Inline mode query |
| `inline_result_chosen` | Inline result selected |
| `poll` / `poll_answer` | Poll state and votes |
| `shipping_query` / `pre_checkout_query` / `purchased_paid_media` | Payments |
| `my_chat_member` / `chat_member` | Membership changes — **requires `allowed_updates`** |
| `chat_join_request` | Join request |
| `chat_boost` / `chat_boost_removed` | Boosts |
| `message_reaction_count` | Anonymous reaction totals |
| `subscription` | Payment subscription changed (Bot API 10.2) |

### 3.3 Promoted service events

The Bot API delivers these as `message` updates with a service field set. Yuigram promotes
them, for the reasons in [research.md](research.md) §1.3.

| Group | Events |
|---|---|
| Membership | `chat_member_joined`, `chat_member_left` |
| Chat metadata | `chat_title_changed`, `chat_photo_changed`, `chat_photo_deleted`, `chat_created`, `chat_migrated_to`, `chat_migrated_from` |
| Pins | `message_pinned` |
| Forum topics | `forum_topic_created`, `forum_topic_edited`, `forum_topic_closed`, `forum_topic_reopened`, `forum_general_hidden`, `forum_general_unhidden` |
| Video chats | `video_chat_scheduled`, `video_chat_started`, `video_chat_ended`, `video_chat_participants_invited` |
| Giveaways | `giveaway_created`, `giveaway_completed`, `giveaway_winners` |
| Payments | `payment_successful`, `invoice_sent`, `refunded_payment` |
| Sharing | `users_shared`, `chat_shared` |
| Mini Apps | `web_app_data`, `write_access_allowed` |
| Other | `boost_added`, `auto_delete_timer_changed`, `proximity_alert`, `passport_data` |
| Communities (10.2) | `community_chat_added`, `community_chat_removed` |

The promotion table is **generated from the schema** by detecting `Message` fields that are
service markers, so a new service message type in a future Bot API release becomes a new
event kind without hand-editing.

### 3.4 MTProto-only events

Namespaced, because they exist only on a `User`:

| Event | Description |
|---|---|
| `mtproto:typing` | Typing / activity in a chat |
| `mtproto:user_status` | Online/offline transition |
| `mtproto:read_history` | Read horizon moved |
| `mtproto:draft` | Draft message changed |
| `mtproto:dialog_pinned` / `mtproto:dialog_unpinned` | Dialog list changes |
| `mtproto:folder` | Folder membership changed |
| `mtproto:call` | Call state |
| `mtproto:raw` | Any TL update, unwrapped |

Registering an `mtproto:*` handler on a `Bot` is a **type error**, not a silent no-op.

### 3.5 Framework events

Not Telegram updates — lifecycle signals on the client and app:

| Event | Description |
|---|---|
| `start` / `stop` | Lifecycle transitions |
| `error` | Unhandled handler or transport error |
| `connection` | Transport state changed (MTProto) |
| `raw` | Every raw payload, before kind discrimination |

`raw` is a forward-compatibility hatch: it fires for update types newer than the installed
schema, so ingestion pipelines and logging never silently drop unknown data.

---

## 4. Type inference

The event kind determines the context type through a generated map:

```ts
interface BotEvents {
  message:        MessageContext<Bot>
  message_edited: MessageContext<Bot>
  callback_query: CallbackQueryContext<Bot>
  inline_query:   InlineQueryContext<Bot>
  // …
}

interface UserEvents {
  message:                MessageContext<User>
  'mtproto:typing':       TypingContext<User>
  // …
}
```

so that:

```ts
bot.on('message',        (ctx) => ctx.text)        // MessageContext<Bot>
bot.on('callback_query', (ctx) => ctx.answer())    // CallbackQueryContext<Bot>
bot.on('mtproto:typing', (ctx) => …)               // ✗ compile error — not a Bot event
```

Multiple kinds produce a union:

```ts
bot.on(['message', 'message_edited'], (ctx) => {
  ctx.text        // available on both
  ctx.kind        // 'message' | 'message_edited'
})
```

Cross-client handlers on the `App` intersect the two maps and expose only what both provide:

```ts
app.on('message', (ctx) => {
  ctx.text                       // available
  ctx.transport                  // 'bot-api' | 'mtproto'
  if (ctx.transport === 'mtproto') ctx.client.raw.messages…   // narrowed
})
```

---

## 5. Payloads

Every context carries three tiers, and the tiering is the honest part:

```ts
interface MessageContext<C> {
  // 1. Normalized — same meaning on both transports.
  readonly kind: 'message'
  readonly chat: Chat | undefined
  readonly sender: User | undefined
  readonly text: string | undefined
  readonly date: Date

  // 2. Transport-typed — the shape differs, the type says so.
  readonly message: C extends Bot ? BotApi.Message : Tl.Message

  // 3. Raw — untouched.
  readonly raw: unknown
}
```

Tier 1 is what unified handlers use. Tier 2 is what transport-specific handlers use. Tier 3
is the escape hatch. Nothing is hidden, and nothing pretends to be something it is not.

---

## 6. Filtering

Filters narrow both which event and which fields:

```ts
bot.on('message', f.text(/^\d+$/), (ctx) => ctx.text)      // string, not undefined
bot.on('message', f.media.photo, (ctx) => ctx.photo)        // Photo, not undefined
bot.on('message', f.chat.private.and(f.sender.id(1)), h)
```

Filters carry runtime `kinds` metadata, so the dispatcher skips predicate evaluation for
unrelated kinds entirely. Full model in [middleware.md](middleware.md) §4.

---

## 7. Ordering and concurrency

Telegram guarantees ordering per chat, not globally, and the two transports differ in what
they hand over:

| | Bot API | MTProto |
|---|---|---|
| Delivery order | server-ordered within a `getUpdates` batch | `pts`-ordered after gap reconciliation |
| Duplicates | possible on webhook retry / polling overlap | possible from `getDifference` |
| Gaps | Telegram's problem | the client's problem |

Yuigram's defaults:

- **Concurrent dispatch.** Updates process in parallel. This is the right default for
  throughput and for the many bots whose handlers are independent.
- **Deduplication on.** By `update_id` (Bot API) or message identity (MTProto), over a
  bounded recent window. Duplicate delivery is a real occurrence, not a theoretical one, and
  the failure it causes — a double reply, a double charge — is user-visible.
- **Per-chat ordering opt-in.** `new App({ ordering: 'per-chat' })` serializes handlers per
  chat. Correct for conversational state machines, a throughput ceiling for everything else,
  which is why it is a choice.

```ts
new App({ ordering: 'concurrent' })   // default
new App({ ordering: 'per-chat' })     // serialize within a chat
new App({ ordering: 'sequential' })   // one at a time, globally — debugging aid
```

In-flight handlers are tracked so `app.stop()` drains rather than severing.

---

## 8. Custom events

Applications and plugins can define their own kinds, which then flow through the same
filters, middleware and routing as Telegram events:

```ts
app.defineEvent('payment_confirmed')

app.on('payment_confirmed', (ctx) => ctx.reply('Thanks!'))
app.emit('payment_confirmed', { chat, sender, orderId })
```

```ts
declare module 'yuigram' {
  interface CustomEvents {
    payment_confirmed: { orderId: string }
  }
}
```

This exists so that a webhook from a payment provider, a cron tick or an internal signal can
reuse the framework's dispatch machinery instead of living in a parallel universe with its
own error handling.

---

## 9. Open questions for review

1. **`message_edited` vs `edited_message`.** §2 argues for the former; it diverges from Bot
   API vocabulary. Worth confirming before the name is public and expensive to change.
2. **`mtproto:` prefix.** Explicit and honest, but slightly verbose. The alternative —
   unprefixed names available only on `User` — is terser but makes availability invisible in
   the name. Current recommendation is to keep the prefix.
3. **Promotion depth.** ~40 promoted service events is a lot of surface. An alternative is to
   promote only the commonly-handled ones and leave the rest as `message` with a filter. The
   generated-table approach makes full promotion nearly free to maintain, which is the
   argument for doing all of it.
