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
5. **Transport-exclusive events are namespaced.** `mtproto:*` for events only an `Account` client
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
via `event.raw`, and the mapping is documented — this is a naming choice in Yuigram's own
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

Namespaced, because they exist only on an `Account`:

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

The event kind determines the context type through a generated map — `ContextFor<K>` — built
from the same schema that produces the method surface:

```ts
interface EventFieldsByKind {
  message:        MessageEventFields
  message_edited: MessageEventFields
  callback_query: CallbackQueryEventFields
  inline_query:   InlineQueryEventFields
  // …one entry per kind, generated
}
```

so that:

```ts
bot.on('message',        (message) => message.text)     // MessageContext<'message'>
bot.on('callback_query', (query) => query.answer())     // CallbackQueryContext
bot.on('mtproto:typing', (event) => …)                  // ✗ compile error — not a Bot event
```

The kind is a type-level input, not a runtime string the handler has to re-check. A handler
registered for `callback_query` has `data`; one registered for `message` does not, and asking
for it is a compile error rather than an `undefined`.

Multiple kinds produce a union:

```ts
bot.on(['message', 'message_edited'], (event) => {
  event.text      // available on both
  event.kind      // 'message' | 'message_edited'
})
```

Cross-client handlers on the `App` intersect the two maps and expose only what both provide:

```ts
app.onMessage((message) => {
  message.text                   // available
  message.transport              // 'bot-api' | 'mtproto'
  if (message.transport === 'mtproto') message.client.api.messages…   // narrowed
})
```

---

## 5. Payloads

Every context carries three tiers, and the tiering is the honest part:

```ts
interface MessageContext<K> {
  // 1. Framework-owned — true whatever produced the event.
  readonly kind: K                    // a literal type, so it discriminates
  readonly transport: 'bot-api'
  readonly updateId: number
  readonly log: Logger

  // 2. Generated from the schema — the payload's own fields, its own optionality.
  readonly message: Message           // the whole payload, under a domain name
  readonly chat: Chat                 // guaranteed on a message
  readonly sender: User | undefined   // absent on a channel post
  readonly text: string | undefined   // a photo may carry no caption
  readonly date: number               // Unix time, in the units Telegram sends

  // 3. Escape hatches — untouched update, and the full method surface.
  readonly raw: Update
  readonly api: RawApi
}
```

Tier 1 is what generic middleware is written against. Tier 2 is what handlers read, and its
optionality is Telegram's rather than a framework guess — nothing is asserted that Telegram
does not guarantee, and nothing it does guarantee is thrown away. Tier 3 is what covers
anything the framework has not modelled.

The timestamp is deliberately not converted to a `Date`. It belongs to the payload, in the
units Telegram sends, and a handler that wants a `Date` builds one — a conversion the
framework performs on every update, for every handler, is a cost paid by everyone for the
benefit of a few.

Actions — `reply`, `send`, `edit`, `delete`, `forward`, `react`, `pin` — are hand-written and
sit alongside the generated fields. Which fields a reply inherits from the message it answers,
such as the forum topic and the business connection, is a judgement rather than a lookup, and
getting it wrong sends a reply to the wrong place.

Below them sits the **bound layer**: every API method this message or its chat can address,
under Telegram's own names, with the identifiers supplied. It is generated from a
classification of method parameters rather than written per method, so it is complete by
construction — `message.banChatMember({ user_id })`, `message.sendPhoto({ photo })`,
`message.getChatMember({ user_id })`. See [codegen.md](codegen.md) §2.5 for what the
classification can and cannot decide on its own.

---

## 6. Filtering

Filters narrow both which event and which fields:

```ts
bot.on(f.text(/^\d+$/), (message) => message.text)     // string, not undefined
bot.on(f.media.photo, (message) => message.photo)      // Photo, not undefined

const fromOneInPrivate = and(f.chat.private, f.sender.id(1))
bot.on(fromOneInPrivate, handler)
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

app.on('payment_confirmed', (event) => event.reply('Thanks!'))
app.emit('payment_confirmed', { chat, sender, orderId })
```

The payload map is a type parameter, for the same reasons the context flavours are
([sessions.md](sessions.md) §Typing): declaration merging is process-global and cannot cross
the `yuigram` façade.

```ts
interface MyEvents {
  payment_confirmed: { orderId: string }
}

const app = new App<MyEvents>()
```

This exists so that a webhook from a payment provider, a cron tick or an internal signal can
reuse the framework's dispatch machinery instead of living in a parallel universe with its
own error handling.

---

## 9. Settled, and still open

**Settled by the Bot API subsystem shipping.**

1. **`message_edited`, not `edited_message`.** §2's argument won: the kind reads
   subject-then-verb, which is what makes `message_edited` sort next to `message` and
   `channel_post_edited` next to `channel_post`. The Bot API's own name is preserved in the
   mapping table and reachable through `raw`.
2. **Promotion depth: all of it.** All 54 service events are promoted to their own kinds from
   a generated table, so the fifty-fourth costs no more to maintain than the first. A promoted
   service message still carries the message context, and can still reply — it is a message
   in an ordinary chat, which is what a developer selecting `chat_member_joined` expects to
   be able to answer.

**Still open.**

3. **`mtproto:` prefix.** Explicit and honest, but slightly verbose. The alternative —
   unprefixed names available only on `Account` — is terser but makes availability invisible
   in the name. Current recommendation is to keep the prefix; it is decided when the MTProto
   subsystem lands, and nothing shipped depends on it yet.
