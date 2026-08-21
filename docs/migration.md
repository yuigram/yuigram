# Migration

What changes between releases, and what to do about it. Newest first.

---

## 0.1 → 0.2

`0.2.0` replaces the client surface. Registration now selects the context type, so a handler
receives what its registration proved rather than the weakest case across every update kind.

The change is mechanical: renamed methods, one construction form, and a type parameter that
carries less. Nothing was removed without a replacement, and no behaviour silently changed
underneath a name that stayed the same.

### Why

`0.1.0` had one `Context` serving twenty-six kinds, which forced every non-universal field to
be optional. Inside `on('message')` the `chat` a handler had just been given was typed
`Chat | undefined`, and inside `on('callback_query')` so was `data`. Every handler opened with
a guard against something the dispatcher already guaranteed, and the front-page example read
`ctx.text ?? 'Say something.'`.

Per-event context types remove the guard rather than document it. The fields are generated
from the Bot API schema, so what a handler sees is Telegram's own optionality — nothing
asserted that Telegram does not promise, and nothing it does promise thrown away.

### Renames

| `0.1` | `0.2` |
|---|---|
| `new Bot(token)` | `Bot.fromToken(token)` — the constructor is kept for full configuration |
| `bot.start()` | `bot.poll()` |
| `bot.webhookHandler(…)` | `bot.webhook(…)` |
| `bot.catch(handler)` | `bot.onError(handler)` |
| `bot.command(…)` | `bot.onCommand(…)` |
| `bot.text(…)` | `bot.onText(…)` |
| `bot.callback(…)` | `bot.onCallbackQuery(…)` |
| `bot.on('message', …)` | unchanged, or `bot.onMessage(…)` |
| `bot.onEditedMessage(…)` | `bot.onMessageEdited(…)` — the name now matches the kind |
| `Bot<C extends Context>` | `Bot<Ext>` — what plugins add, not the whole context |

Everything that subscribes is now named `on…`, so a developer who has seen one form can guess
the rest — and the `callback` shorthand no longer collides with JavaScript's own meaning of
the word.

Lifecycle verbs name the mechanism. `poll()` and `webhook()` differ in deployment shape, cost
and failure mode, and `start()` hid exactly that. `stop()` is unchanged and stays general,
because draining is the same whatever was started.

### The context

```ts
// 0.1
bot.on('message', (ctx) => ctx.reply(ctx.text ?? 'Say something.'))

// 0.2
bot.onText((message) => message.reply(message.text))
```

`onText` matched on the text, so `message.text` is a `string` inside it. `onMessage` cannot
promise that — a photo without a caption is a message with no text — and its `text` stays
optional, honestly.

Two field-level changes:

- **`chat` is no longer optional** on message contexts. Telegram guarantees it on a message,
  so the type says so. Existing `ctx.chat?.id` still compiles; the `?.` is now redundant.
- **`BaseContext.date` is gone**, replaced by `transport`. A normalized `Date` collided with
  the schema's own `date` in Unix seconds, which is still there on the payload. Code that
  wants a `Date` builds one: `new Date(message.date * 1000)`.

There is no single `Context` type to import and extend any more, because there is no single
context. `Context` remains as core's transport-agnostic base, which is what generic middleware
is written against.

### Plugin typing

```ts
// 0.1
type MyContext = Context & SessionFlavor<Cart>
const bot = new Bot<MyContext>(token)

// 0.2
const bot = Bot.fromToken<SessionFlavor<Cart>>(token)
```

The type parameter carries what plugins *add*, not the whole context. The session plugin then
needs only the value type:

```ts
const bot = Bot.fromToken<SessionFlavor<Cart>>(token).extend(session<Cart>({ … }))
```

`createSession` — which the plugin wraps — still takes the context type as well, for
middleware written generic over the client.

### Filters

`filter()` is constrained to the base context interface rather than the distributed union, so
a filter can name `MessageContext` once and cover every message-bearing kind:

```ts
const isPrivate = filter<MessageContext>('isPrivate', (message) => message.chat.type === 'private')

bot.on(isPrivate, (message) => message.reply('Just between us.'))
```

`bot.on(filter, handler)` applies what the filter proves. Compose before registering — the
narrowing does not survive a composition written inside the registration argument.

### Fixed on the way

Five defects surfaced while porting, and are fixed:

- **Service messages could not reply.** A promoted service kind is absent from `MESSAGE_KINDS`,
  and deciding by kind left exactly those updates — a member joining, a title changing —
  without `reply`. The payload decides now, so `chat_member_joined` can answer.
- **A callback query could not reach its chat at all.** It can now, through `reply`, `send`,
  `edit` and `delete`. A query from an inline-mode result has no chat, so `reply`, `send` and
  `delete` reject with an error naming the reason and pointing at `edit`, which works for both
  forms.
- **Those actions threw synchronously** on a missing message, so `.catch()` could not handle
  them. They reject instead.
- **Plugins never installed behind a webhook.** Installation happened in `poll()`, so
  `bot.extend(session(…))` compiled, ran and did nothing in the deployment shape most
  production bots use. It now happens on the dispatch path, before the first update reaches a
  handler, whatever the transport.
- **`stop()` drained nothing behind a webhook.** A webhook client never reaches the `running`
  state, and `stop()` returned immediately when idle — abandoning every in-flight handler
  while reporting a clean shutdown. In-flight work is now drained whether or not a start verb
  was ever called.

### What is new

Two surfaces appeared that have no `0.1` equivalent, both generated from the schema:

**Every method a context can address.** An update already names a chat, a message or a query,
so every API method taking those identifiers is offered with them filled in:

```ts
bot.onMessage(async (message) => {
  await message.banChatMember({ user_id: 42 })      // chat_id supplied
  await message.sendPhoto({ photo })                // chat, topic and connection supplied
  await message.forwardMessage({ chat_id: 999 })    // the source supplied; you choose where
})
```

Telegram's own method names, so nothing new has to be learned. Supplied parameters stay
overridable. A context never addresses a peer that did not arrive with the update — reaching
some other chat is `bot.api.sendMessage({ chat_id, … })`, which is the boundary that keeps the
same design working when MTProto lands, where addressing a peer needs an access hash the
client holds.

**A named registration per event kind.** `onMessage`, `onChatMemberJoined`,
`onForumTopicCreated` — seventy-nine of them, each equivalent to `on(kind, handler)` with the
kind fixed. `onText`, `onCommand` and `onCallbackQuery` stay hand-written, because each
matches as well as selects.

### Reading order

The reasoning behind each decision is in [api-decisions.md](api-decisions.md), the review that
prompted them in [api-review.md](api-review.md), and the resulting surface in
[api-design.md](api-design.md).
