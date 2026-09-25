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
| `mtproto:membership` | Somebody joined, left, was promoted or was restricted |
| `mtproto:callback_query` | An inline-keyboard button was tapped |
| `mtproto:inline_query` | Somebody typed an inline query |
| `mtproto:inline_chosen` | Somebody picked one of the results offered |
| `mtproto:shipping_query` | A checkout is asking what delivery options exist |
| `mtproto:precheckout_query` | A payment is about to be taken and can still be refused |
| `mtproto:join_request` | Somebody asked to be let into a conversation |
| `mtproto:join_requests_pending` | How many people are waiting to be let into a chat this account manages |
| `mtproto:album` | Several messages sent together, handled once after the last part |
| `mtproto:poll` / `mtproto:poll_vote` | A poll's results changed; one person voted |
| `mtproto:story` | A story was posted, edited or deleted |
| `mtproto:bot_stopped` | A person stopped a bot's private chat, or started it again |
| `mtproto:bot_reaction` / `mtproto:bot_reaction_count` | One person's reaction changed; anonymous counts changed |
| `mtproto:chat_boost` | A chat the bot manages was boosted |
| `mtproto:paid_media_purchased` | A person paid for media the bot sent |
| `mtproto:business_connection` | A business account connected the bot, or changed what it may do |
| `mtproto:business_message` / `_edited` / `mtproto:business_messages_deleted` | A business account's chats, as the connected bot sees them |
| `mtproto:business_callback_query` | A button under a business account's message was pressed |
| `mtproto:guest_query` | A bot is asked about a message in a chat it is not a member of |
| `mtproto:raw` | Any TL update, unwrapped |

Registering an `mtproto:*` handler on a `Bot` is a **type error**, not a silent no-op.

#### Why the bot-facing queries are here and not on `Bot`

A bot token can sign an account in over MTProto — `account.signInAsBot(token)` — and an account
signed in that way receives these queries on its own connection. A `Bot` is a different client
talking to a different endpoint; it cannot answer a query that arrived on an `Account`, because
the identifier the answer is keyed by is scoped to the connection the query came in on. Sharing
a framework does not make the two interchangeable, so these keep the `mtproto:` prefix and each
has an answer on `Account` rather than being delegated to the Bot API subsystem.

Every one of them holds something a person is looking at. An unanswered callback query leaves a
spinner on the button; an unanswered inline query leaves an empty result list; an unanswered
shipping or pre-checkout query stalls a checkout. Answering with nothing to say is still an
answer, and is usually the right one.

| Event | Constructor | Answered by | Keyed by | Deadline |
|---|---|---|---|---|
| `mtproto:callback_query` | `updateBotCallbackQuery`, `updateInlineBotCallbackQuery` | `account.answerCallback` | `query_id` | Expires; the spinner runs until then |
| `mtproto:inline_query` | `updateBotInlineQuery` | `account.answerInlineQuery` | `query_id` | Expires; results are dropped after |
| `mtproto:inline_chosen` | `updateBotInlineSend` | — | — | Nothing to answer |
| `mtproto:shipping_query` | `updateBotShippingQuery` | `account.answerShipping` | `query_id` | Checkout waits |
| `mtproto:precheckout_query` | `updateBotPrecheckoutQuery` | `account.answerPrecheckout` | `query_id` | Checkout waits; last refusal point |
| `mtproto:join_request` | `updateBotChatInviteRequester` | `account.decideJoinRequest` | chat + person | Stands until decided |
| `mtproto:guest_query` | `updateBotGuestChatQuery` | `account.answerBotGuestChatQuery` | `query_id` | Expires |

Each is also answerable from the event itself, which reads the identifier from the update so a
handler does not: `event.answerCallback(answer?)`, `event.answerInline(results, answer?)`,
`event.answerShipping(answer)`, `event.answerPrecheckout(refusal?)`, `event.answerGuest(result)`
and `event.decideJoin(approved)`. Each refuses, by name, an event of a kind it does not answer.
`event.queryId` is the identifier, and `event.data` a pressed button's data read as UTF-8 text —
`undefined` where the bytes are not text, which stay readable under `event.raw.data`.

**`mtproto:shipping_query`.** Sent only for an invoice that asked for a delivery address, and
only to the account that issued it. `event.raw` carries the `payload` the invoice was created
with and the `shipping_address` the person entered. The answer either offers `shipping_option`
entries — each an id, a title and a list of labelled prices — or gives an error string shown to
the person as written. `answerShipping` refuses an answer carrying neither, because the protocol
requires one and an answer with neither leaves the checkout waiting on a reply Telegram cannot
display.

**`mtproto:precheckout_query`.** The last point at which a charge can be stopped. `event.raw`
carries the `payload`, the `currency` and `total_amount`, and the `info` and `shipping_option_id`
chosen earlier. `answerPrecheckout` with no argument approves and the card is charged;
`answerPrecheckout(queryId, reason)` refuses and the reason is shown. There is no silent
refusal, and the two are mutually exclusive on the wire — approving and refusing in one message
is not expressible.

**`mtproto:join_request`.** Not a query: it stands until it is decided rather than expiring, so
it is answered by naming the conversation and the person rather than by an identifier.
`event.raw` carries the `about` text the person wrote and the `invite` they used.
`decideJoinRequest(chat, user, approved)` lets them in or turns them down; turning somebody down
is not a ban and they may ask again.

**What these events do not carry.** A query is not said in a conversation. `updateBotInlineQuery`,
`updateBotInlineSend`, `updateInlineBotCallbackQuery` and both payment steps name no chat at all,
so `event.chat` is `undefined` for them rather than the private chat with whoever asked — an
inline query typed in a group is not a message to the bot. `updateBotCallbackQuery` and
`updateBotChatInviteRequester` do name one, and it is read. `event.sender` is the person asking
in every case.

#### Conversation, actor and subject

Three fields, because an update can name three different peers and a handler has to be able to
tell them apart:

| Field | Meaning | Absent when |
|---|---|---|
| `chat` | The conversation: somewhere things are said, and what a reply, a session or a conversation key is scoped to | The update is said in no conversation |
| `sender` | Who acted | Nobody is named as having acted, or this account did |
| `target` | Whom it is about, where that is neither of the above | The update names nobody apart from where and who |

A `user_id` on an update is **not** read as the conversation. Only two updates are said in the
private chat of the user they name — somebody typing to this account, and somebody stopping a
bot — and only those two read it that way. A user's status, name or phone changing is about that
user (`target`) and happens in no conversation, so `chat` is `undefined` rather than a private
chat nobody spoke in; a conversation invented there would give a status change a session, a lock
and a scene position.

Two updates name the actor where others name the place: a poll vote's `peer` is the voter and a
story's `peer` is whoever posted it, so both are `sender` and neither has a `chat`. A reaction a
bot is told about names who reacted in `actor`, which may be a channel reacting anonymously.

A business account's messages have their own kinds because they are answered through the
connection they arrived on rather than as the bot. `event.reply`, `event.send` and `event.edit`
on one of them are sent inside `invokeWithBusinessConnection` with that connection's identifier,
so the answer comes from the business account.

`mtproto:album` is gathered from the messages of one `grouped_id` in one conversation. Telegram
marks none of them as last, so the album is handled once no further part has arrived for
`albumWindow` milliseconds (250 unless the account says otherwise); `event.album` holds the
messages in order and `event.text` the caption, from whichever part carries one. Each part is
still its own `message` event. Nothing is gathered unless a handler could take `mtproto:album`,
and an album still gathering when the account stops is handled before the stop waits for
handlers.

#### Which field names the actor on a membership change

`mtproto:membership` covers the seven constructors Telegram kept for one question, and they
disagree about which field means what. The subject — the person the change happened to — is
always `user_id` and is reachable through `event.raw`. The actor is not:

| Constructor | Conversation | Actor | Subject |
|---|---|---|---|
| `updateChatParticipant` | `chat_id` | `actor_id` | `user_id` |
| `updateChannelParticipant` | `channel_id` | `actor_id` | `user_id` |
| `updateChatParticipantAdd` | `chat_id` | `inviter_id` | `user_id` |
| `updateChatParticipantDelete` | `chat_id` | not named | `user_id` |
| `updateChatParticipantAdmin` | `chat_id` | not named | `user_id` |
| `updateChatParticipantRank` | `chat_id` | not named | `user_id` |
| `updateChatParticipants` | `participants.chat_id` | not named | the whole list |

`event.sender` is the actor where one is named and `undefined` where none is, and `event.target`
is the subject. The three that name no actor really do not carry it: the basic-group forms predate
`actor_id`, and reading `user_id` in its place would report the person who was removed as the
person who removed them.

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

Cross-client handlers on the `App` see every client's updates. The application is declared
with the union it is written against, and the discriminant carries the divergence:

```ts
const app = new App<AnyEventContext | MtprotoContext>()

app.on('message', (event) => {
  event.transport                // 'bot-api' | 'mtproto'

  if (event.transport === 'mtproto') event.text      // narrowed to the account's context
  if (event.transport === 'bot-api') event.updateId  // narrowed to the bot's
})
```

The union is named at the call site rather than published by core, which describes neither
transport and must not: the shared layer would otherwise depend on whichever subsystem
produced the event. What the two have in common is already a type — the base every context
extends — and `transport` carries what they do not.

`on` takes a kind, a list of kinds, or a filter, exactly as on a client. Handlers run in
registration order, and all of them run: they are independent concerns that matched the same
update. `once` and `off` complete the set.

An application handler runs inside the application's middleware and outside the client's:

```
App middleware
  App handlers          every client, matching kinds
    Client middleware
      Client handlers   the client still handles its own update
```

Both tiers are live at once. Registering on the application does not consume the update or
replace what a client handles itself, and registration is independent of the lifecycle — a
handler added before or after `start` reaches the same updates, and stopping an application
forgets nothing.

A handler that throws takes the application's existing error path, naming the client the
update arrived on:

```ts
app.onError(({ client, error }) => log.error({ client: client.name, error }))
```

A failure nobody is listening for is raised rather than dropped.

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

An application's own events — a payment provider's webhook, a timer, a signal from another
service — flow through the same plugins, middleware, sessions, routing and error handling as
Telegram's:

```ts
import { defineEvent } from 'yuigram'

const paymentConfirmed = defineEvent<{ orderId: string; chatId: number }>('payment_confirmed')

bot.on(paymentConfirmed, async (event) => {
  await bot.api.sendMessage({ chat_id: event.payload.chatId, text: `Order ${event.payload.orderId} is paid.` })
})

await bot.emit(paymentConfirmed, { orderId: 'A-17', chatId: 42 }, { chat: { id: 42 }, sender: { id: 42 } })
```

The payload type belongs to the definition, so a handler registered for it reads a typed
`event.payload`, and a definition is an ordinary value to import where it is emitted and where it
is handled. `account.on` and `account.emit` take the same definitions.

| | An emitted event | An update |
| --- | --- | --- |
| `transport` | `'custom'` | `'bot-api'` or `'mtproto'` |
| identity | none: no update id, nothing acknowledged | Telegram's |
| polling offset, update sequence | untouched | advanced |
| `allowed_updates: 'auto'` | never asked for | derived from handlers |
| plugins, middleware, sessions, error handlers | the same | the same |
| `stop()` | waits for it | waits for it |
| who it concerns | the `chat` and `sender` it was emitted with, if any | who sent it |

`emit` resolves once the handlers have run; an error in them goes to the client's error handlers
exactly as an update's would, rather than rejecting the `emit`. A kind that names something
Telegram sends — `message`, `callback_query` — is refused, since a handler for it would run for
both.

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
