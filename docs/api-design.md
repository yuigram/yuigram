# API Design

The proposed public API. Every example here is Yuigram's own design, derived from the
constraints in [unified-model.md](unified-model.md) rather than copied from another
framework.

Design priorities, in order: **honesty** (the type reflects what actually works),
**predictability** (a developer or an AI assistant can guess the next call correctly),
**concision** (no ceremony that carries no information), **discoverability** (autocomplete
teaches the API).

The Bot API half of what follows is implemented: `Bot.fromToken`, the `on…` registrations,
per-event contexts, the bound method families, `Router`, the `f` filters, keyboards, the
`media` sources, formatting, API hooks, middleware, sessions, storage, errors, files and the
testing harness. `Account` and `App` are design — the shapes the rest is being built towards,
and the reason the implemented half looks the way it does. [roadmap.md](roadmap.md) says when
each arrives; the rule for reading is in [README.md](README.md).

---

## 1. The client model

Three candidate models were considered.

| Model | Assessment |
|---|---|
| `new Client({ type: 'bot' })` | **Rejected.** Every member becomes conditionally typed on the discriminant. Autocomplete offers members that throw at runtime. AI assistants read types, not caveats, and would generate confidently broken code. |
| `new Client(...)` for both, distinguished by options shape | **Rejected.** Same problem, worse — the divergence is not even visible in the type name. |
| **`Bot` and `Account`, entered through named constructors** | **Adopted.** Two names, two capability sets, no conditional typing anywhere. The names carry real information: a `Bot` cannot read another user's history, an `Account` cannot answer inline queries, and both facts are compile-time truths. |

```ts
import { Account, App, Bot } from 'yuigram'

const bot  = Bot.fromToken('123456:ABC-DEF…')
const user = Account.fromSession('./me.session', { apiId: 12345, apiHash: 'abc…' })
```

The credential is in the constructor's **name**, not in the shape of an options object. That
is what lets the surface grow by adding a name rather than by growing a bag:

```ts
Bot.fromToken(token)                            // Bot API
Bot.fromMtproto(token, { apiId, apiHash })      // the same bot, over MTProto
Account.fromSession(path, { apiId, apiHash })   // a user account, resumed from disk
Account.fromString(session, { apiId, apiHash }) // the same, from a portable string
```

Each factory returns the type that matches its capabilities: `Bot.fromToken` has no
`resolvePeer`, `Bot.fromMtproto` has no `file_id` reuse, and the two share an interface for
what genuinely is common. The type system enforces the capability matrix rather than
documenting it.

A plain constructor stays available for the case where every option is being set —
`new Bot({ … })` — but the factories are the documented path, because a reader of ten lines
should be able to see how the client authenticated.

### Naming

`Bot` and `Account` describe *what the client is on Telegram*, not which protocol it speaks.
That is the right axis: a developer thinks "I need my bot to do X" and "I need my account to
do Y", and the protocol is an implementation consequence. Bot-over-MTProto is therefore a
factory on `Bot` rather than a third class — same identity, different transport.

---

## 2. Getting started

The shortest useful program:

```ts
import { Bot } from 'yuigram'

const bot = Bot.fromToken(process.env.BOT_TOKEN!)

bot.onCommand('start', (message) => message.reply('Hello!'))

await bot.poll()
```

Four questions a first-time reader has are answered by four words: what kind of client
(`Bot`), how it authenticated (`fromToken`), what it listens to (`onCommand`), and how it is
running (`poll`).

And a user client:

```ts
import { Account } from 'yuigram'

const user = Account.fromSession('./me.session', {
  apiId: Number(process.env.API_ID),
  apiHash: process.env.API_HASH!
})

user.onMessage((message) => console.log(message.text))

await user.connect()

await user.signIn({
  phone: () => prompt('Phone: '),
  code:  () => prompt('Code: '),
  password: () => prompt('2FA password: ')
})
```

`connect()` establishes the MTProto connection; `signIn()` performs authorization, and a
session resumed from disk is already authorized, so its callbacks are never reached. They are
separate verbs because they are separate things that fail differently — a network that is
unreachable and a code that was mistyped are not the same problem. The interactive steps are
callbacks rather than values, so nothing prompts unless it is actually needed.

---

## 3. Multiple clients: the `App`

```ts
import { Account, App, Bot } from 'yuigram'

const app = new App({ storage: file('./state') })

const bot   = app.add(Bot.fromToken(process.env.BOT_TOKEN!))
const alice = app.add(Account.fromSession('./alice.session', { apiId, apiHash }))
const bob   = app.add(Account.fromSession('./bob.session', { apiId, apiHash }))

// Middleware shared by every client.
app.use(async (event, next) => {
  event.log.info({ client: event.client.name, kind: event.kind })
  await next()
})

// Cross-client handler — event.transport discriminates.
app.onMessage(async (message) => {
  if (message.text === 'ping') await message.reply('pong')
})

// Client-scoped handler — fully typed, no discriminant needed.
bot.onCallbackQuery((query) => query.answer('ok'))
alice.onMessage((message) => message.client.api.messages.readHistory({ … }))

await app.start()          // starts all clients, resolves when all are running
await app.stop()           // drains in-flight handlers, then disconnects
```

Each client keeps an independent lifecycle, session, connection state and error handling.
`app.start()` is a convenience over starting each — and the only place a general `start` verb
appears, because the `App` is the one object that knows which mechanism each client needs. A
client that fails to start does not prevent the others from running, and its failure is
reported through `app.onError`.

```ts
// Independent lifecycles remain accessible, in each client's own vocabulary.
await bob.stop()
await bob.connect()
console.log(bob.state)      // 'idle' | 'starting' | 'running' | 'stopping' | 'failed'
```

Clients may be named for logging and lookup:

```ts
app.add(Bot.fromToken(token, { name: 'support-bot' }))
app.client('support-bot')   // Bot | undefined
```

---

## 4. Events

Handlers register against a kind, a list of kinds, or a filter — one argument selects, one
handles.

```ts
bot.on('message', handler)
bot.on(['message', 'message_edited'], handler)
bot.on(hasPhoto, handler)          // a filter value — see §5
```

Everything that subscribes is named `on…`, so a developer who has seen one form can guess the
rest. The shorthands cover registrations common enough to be written in every project:

```ts
bot.onMessage(handler)
bot.onCommand('start', handler)
bot.onCommand('say', (message) => message.reply(message.command.rest))
bot.onCallbackQuery(/^buy:/, handler)
bot.onText('ping', handler)
bot.onChatMemberJoined(handler)
bot.onForumTopicCreated(handler)
```

There is one named registration per event kind — seventy-nine of them, generated from the same
taxonomy the dispatcher indexes. That is how most people discover that a member joining has
its own kind rather than arriving as a message to branch on. `onText`, `onCommand` and
`onCallbackQuery` are hand-written, because each matches as well as selects.

A shorthand is not only shorter — it types more precisely. `onText` matched on the text, so
`message.text` is a `string` inside it; `onMessage` cannot promise that, because a photo
without a caption is a message with no text. Registration is what earns the narrowing.

`once` and `off` complete the set:

```ts
bot.once('message', handler)
bot.off(handler)
```

The full taxonomy, the promoted service events and the type-inference rules are in
[events.md](events.md).

---

## 5. Filters

Filters are callable type-guards that compose. They are values, so they can be named,
exported and reused.

```ts
import { and, f, filter, type MessageContext } from 'yuigram'

bot.on(f.text(/^\d+$/), (message) => {
  message.text      // string — narrowed, not string | undefined
})

const fromAdmin = f.sender.id(ADMIN_ID)
const inGroup   = f.chat.group

const adminInGroup = and(fromAdmin, inGroup)
const visualMedia  = f.media.photo.or(f.media.video)

bot.on(adminInGroup, handler)
bot.on(visualMedia, handler)

// Custom filters are first-class. Name the context the predicate expects, and
// list the kinds so it is never run on one it was not written for.
const isWeekend = filter<MessageContext>(
  'isWeekend',
  (message) => [0, 6].includes(new Date(message.date * 1000).getDay()),
  { kinds: ['message'] }
)
```

A composition is named before it is registered. Composing inside the registration argument
does not infer — the narrowing cannot be carried out through the nested call — and the
compile error is a better outcome than a handler that silently widened to every event.

The dual-parameter design (`Filter<Base, Mod>`) that makes the narrowing above work is
described in [research.md](research.md) §1.5 and [middleware.md](middleware.md) §4.

---

## 6. Context

There is no single `Context` type, because registration decides what a handler receives. A
message handler gets a `MessageContext`, a button press a `CallbackQueryContext`, and each
one carries what Telegram guarantees for that event and nothing it does not.

```ts
bot.onMessage(async (message) => {
  message.transport     // 'bot-api'
  message.kind          // 'message' — a literal type, so it discriminates
  message.updateId      // number

  message.chat          // Chat — guaranteed on a message, so not optional
  message.sender        // User | undefined — absent on channel posts
  message.text          // string | undefined — a photo may have no caption
  message.date          // number — Unix time, in the units Telegram sends

  await message.reply('hi')                 // quotes the message
  await message.send('no quote')            // same chat, no quote
  await message.react('👍')
  await message.edit('changed')
  await message.delete()

  message.raw           // the untouched Bot API Update payload
  message.api           // the full generated method surface
  message.log           // logger scoped to this update
})
```

The fields are generated from the Bot API schema, so the optionality above is Telegram's own
rather than a framework guess. The actions are hand-written, because which fields a reply
must inherit from the message it answers — the forum topic, the business connection — is a
judgement rather than a lookup.

Beneath the curated actions sits a second, generated layer: every API method this message or
its chat can address, with the identifiers already filled in.

```ts
await message.banChatMember({ user_id: 42 })     // chat_id supplied
await message.sendPhoto({ photo })               // chat, topic and connection supplied
await message.editMessageCaption({ caption })    // chat and message supplied
await message.forwardMessage({ chat_id: 999 })   // the *source* supplied; you choose where
await message.getChatMember({ user_id: 42 })
```

A hundred-odd methods, keeping Telegram's own names, so a developer who knows the Bot API
already knows this half of the surface and an assistant can infer it. Supplied parameters are
optional rather than absent — naming one overrides it — and the whole layer is a generated
table rather than a generated method per entry. See [codegen.md](codegen.md) §2.5.

The two layers answer different questions. `reply` is what you reach for when the operation
is common enough to deserve a name of its own; `setMessageReaction` is what you reach for
when you know the Bot API method and want it addressed for you.

`reply` and `send` are two names for two operations rather than one name and a flag, so the
difference is visible at the call site, which is where a developer notices they quoted when
they meant not to. Both accept a string for the common case and an object otherwise —
`reply({ photo: media.path('./cat.jpg'), caption: 'cat' })` rather than `replyWithPhoto`,
because one predictable entry point is easier for humans and AI assistants alike than a
family of near-identical names.

Actions exist on the context because the update already addressed something: the chat and the
message id arrived with it. Addressing a peer that did *not* arrive in an update is a client
operation, since it needs resolution the context cannot do — and that boundary is what keeps
the same shape working when MTProto arrives, where resolving a peer needs an access hash the
client owns.

Escalating to transport-specific capability is explicit:

```ts
app.onMessage(async (message) => {
  await message.reply('works on both')

  if (message.transport === 'mtproto') {
    await message.client.api.messages.readHistory({ peer: message.chat.input, maxId: 0 })
  }
})
```

`transport` is a literal union, so the branch narrows the context to the one the check
proved. Nothing outside the branch offers a member that only one transport has.

---

## 7. Middleware

```ts
app.use(async (event, next) => {
  const started = performance.now()
  await next()
  event.log.debug(`handled in ${(performance.now() - started).toFixed(1)}ms`)
})

// Gated on a filter — the middleware sees the narrowed type.
app.use(when(f.chat.private, async (message, next) => { … }))

// Scoped to a client, and to a band.
bot.use(async (event, next) => { … }, { priority: 'high' })
```

Middleware is named `event` rather than for a domain object, because it runs for every kind
and cannot assume it received a message. A handler, which was registered for one kind, can.

Around-hooks wrap outgoing API calls, which is what makes retry, throttling and caching
ordinary plugins:

```ts
bot.hook(async (call, next) => {
  try {
    await next()
  } catch (err) {
    if (err instanceof FloodError && err.retryAfter < 30) {
      await sleep(err.retryAfter * 1000)
      await next()
    } else throw err
  }
})
```

---

## 8. Routing

Routers group handlers and compose, so a large application splits across files:

```ts
// features/admin.ts
import { Router } from 'yuigram'

export const admin = new Router({ name: 'admin' })
admin.use(requireAdmin)
admin.onCommand('ban',  handleBan)
admin.onCommand('kick', handleKick)

// index.ts
bot.extend(admin)
```

A router carries the client's registration surface, so a handler moves between the two
without being rewritten, and it installs through `extend` — the same verb as any other
extension, because that is what a router is from the client's side. Its middleware runs **only
for updates it handles**, which is what makes `requireAdmin` above a real gate rather than a
global one that happens to return early, and it runs once per update rather than once per
matching handler.

A router declares what it needs, and the client must provide it:

```ts
const cart = new Router<SessionFlavor<Cart>>()

Bot.fromToken('…').extend(cart)                       // ✗ no session installed
Bot.fromToken<SessionFlavor<Cart>>('…').extend(cart)  // ✓
```

This is the answer to scale. The minimal application stays three lines, and a large one gets
modules with their own middleware and their own stated requirements, rather than every
registration accumulating on one client object in one file.

---

## 9. Sessions

```ts
import { Bot, file, session } from 'yuigram'

const bot = Bot.fromToken<SessionFlavor<Cart>>(token)
  .extend(session({ storage: file('./sessions'), key: (event) => event.sender?.id }))

bot.onMessage(async (message) => {
  message.session.count++
  await message.reply(`seen ${message.session.count} messages`)
})
```

Typed by a **flavour** carried on the client's type parameter, so the shape is per bot rather
than per program:

```ts
interface Cart {
  count: number
}

const bot = Bot.fromToken<SessionFlavor<Cart>>(token)
```

The type parameter is what plugins *add*, not the whole context. There is no single context
type to name and extend, because the base varies by event — a message handler and a poll
answer do not receive the same shape — so the parameter carries only the part that is
constant across them.

See [sessions.md](sessions.md) for why this replaced declaration merging.

Framework sessions are distinct from MTProto authorization sessions; see
[sessions.md](sessions.md).

---

## 10. Storage

```ts
import { memory, file } from 'yuigram'

new App({ storage: memory() })
new App({ storage: file('./state') })

// Any object satisfying the contract works.
const custom: KV<unknown> = {
  get:    async (k) => …,
  set:    async (k, v) => …,
  delete: async (k) => …
}
```

The contract is deliberately small so that adapters are trivial to write. Redis, SQLite and
Postgres adapters ship as separate packages and never enter core's dependency tree. See
[storage.md](storage.md).

---

## 11. Errors

```ts
import { FloodError, BotApiError, PeerError } from 'yuigram'

bot.onError((err, event) => {
  if (err instanceof FloodError) {
    event.log.warn(`flood wait ${err.retryAfter}s`)
    return
  }
  if (err instanceof BotApiError) {
    event.log.error({ code: err.code, description: err.description })
    return
  }
  throw err            // rethrow what you do not handle
})
```

Every error preserves its origin. `err.cause` holds the untouched payload, and no wrapper
discards `code`, `description` or the raw TL error. See [architecture.md](architecture.md) §6.

---

## 12. Raw API

```ts
// Typed, generated from the committed schema.
await bot.api.sendMessage({ chat_id: 1, text: 'hi' })
await user.api.messages.sendMessage({ peer, message: 'hi', randomId: rnd() })

// Untyped, for anything newer than the installed schema.
await bot.api.call('brandNewMethod', { … })
await user.api.call({ _: 'messages.brandNewMethod', … })
```

The same surface is on every context as `event.api`, so a handler never has to reach back to
the client it was registered on for something the actions do not cover.

Both forms exist deliberately: the typed one covers the schema, the untyped one covers the
window between a Telegram release and Yuigram regenerating. Without the second, every
Telegram release temporarily blocks some users. `schemaInfo` reports which versions a build
was generated from, so a bot can tell what it is talking to.

---

## 13. Files

```ts
import { media } from 'yuigram'

await message.reply({ photo:    media.path('./cat.jpg') })
await message.reply({ video:    media.url('https://…/clip.mp4') })
await message.reply({ document: media.buffer(bytes, 'report.pdf') })
await message.reply({ photo:    media.id(existingFileId) })     // Bot API reuse

const bytes = await bot.download(message.message.photo)
await bot.download(message.message.document, './out.pdf')
```

One `media` namespace with a source per method. The `file_id` reuse path is Bot API only,
and the type reflects that — `media.id()` is not accepted by an `Account` client, because
`file_id` is a Bot API construct that does not convert without a round trip.

Downloading ships today as free functions — `download`, `downloadStream`, `downloadToFile`,
`getFileUrl` — taking the transport explicitly. That is the right shape for the primitive,
which has to work without a client at all; the client methods above wrap it for the case
where a client is right there. Both stay: one composes, the other reads well.

A resolved download URL **contains the bot token**, because Telegram's file endpoint requires
it. `getFileUrl` returns a credential, and it is documented as one — do not log it, and do
not hand it to a third party.

---

## 13.1 Keyboards

```ts
import { InlineKeyboard, Keyboard } from 'yuigram'

const menu = new InlineKeyboard()
  .text('Buy', 'buy:1')
  .url('Docs', 'https://core.telegram.org/bots/api')
  .row()
  .text('Cancel', 'cancel')

await message.reply('Pick one', { reply_markup: menu })
```

A keyboard **is** the markup: `inline_keyboard` is a real property, filled in as buttons are
added, so it passes straight to `reply_markup` with no `build()` step to forget and any
function that accepts markup accepts one without knowing this class exists.

One class rather than a class of static button factories plus a separate builder, because
there is no decision worth making between them — the fluent form reads better in every case,
and `from()` covers a keyboard that is already data. Callback data over Telegram's 64-byte
limit is refused where the button is written rather than by a later API call that mentions
neither.

Building from data is a list plus a layout:

```ts
new InlineKeyboard().addFrom(products, (p) => ({ text: p.name, callback_data: `buy:${p.id}` })).columns(2)
```

`Keyboard` is the same idea for reply keyboards, with the options read as statements —
`.resized()`, `.oneTime()`, `.persistent()` — plus `Keyboard.remove()` and
`Keyboard.forceReply()`.

---

## 13.2 Formatting

```ts
import { html, md } from 'yuigram'

await message.reply(html`Hello, <b>${message.sender.first_name}</b>!`, { parse_mode: 'HTML' })
```

The tag escapes what is **interpolated** and leaves the literal parts alone, which is the
right way round: the markup is written by the developer and the values come from strangers.
Without it, one user called `<b>` breaks a reply with `can't parse entities` — a failure that
appears in a call having nothing to do with formatting.

`escapeHtml`, `escapeMarkdownV2` and `escapeMarkdown` are there for text assembled some other
way, and `raw()` splices already-formatted text into a template without escaping it twice.

---

## 13.3 Hooks

```ts
import { retryOnFloodWait } from 'yuigram'

bot.hook(retryOnFloodWait({ maxWait: 30 }))
```

Hooks wrap outgoing calls, composed outermost-first with `next()` sending the request. Calling
`next()` twice retries; not calling it answers without sending. That is the whole mechanism,
and it is what makes flood-wait handling, throttling, caching and instrumentation ordinary
userland code rather than framework features — `retryOnFloodWait` ships **on** it rather than
beside it.

---

## 14. Lifecycle

```ts
await app.start()

app.onError((error, event) => log.error({ client: event.client.name, error }))

process.on('SIGINT', async () => {
  await app.stop({ timeout: 10_000 })   // stop intake, drain in-flight, disconnect
  process.exit(0)
})
```

Each client says which mechanism it is running — `poll()`, `webhook()`, `connect()` — because
that choice determines deployment shape, cost and failure mode, and a reader of ten lines
should see it. `stop()` is the one verb that stays general: draining is the same everywhere,
whatever was started.

`stop()` drains rather than severing: intake halts immediately, in-flight handlers are
awaited up to the timeout, then transports close. A bot killed mid-handler loses work and
may reprocess an update on restart, so draining is the default rather than an option.

Draining is a property of the client, not of the transport that started it. A webhook
deployment never calls a start verb — it hands a request handler to someone else's server —
and its updates are drained on `stop()` all the same. The same reasoning puts plugin
installation on the dispatch path rather than in `poll()`: whatever the transport, a plugin
is installed before the first update reaches a handler.

---

## 15. Plugins

```ts
import { definePlugin } from 'yuigram'

export const metrics = (opts: MetricsOptions = {}) =>
  definePlugin({
    name: 'metrics',
    install (target) {
      let handled = 0
      target.use(async (_event, next) => { handled++; await next() }, { priority: 'low' })
      return { get handled () { return handled } }
    }
  })

const bot = Bot.fromToken(token).extend(metrics())
bot.metrics.handled          // typed — exists only after .extend()
```

The returned object is attached under the plugin's name, so two plugins cannot collide, and
the type is only present once the plugin is installed.

---

## 16. Testing

```ts
import { mockBot } from 'yuigram/testing'

const { bot, send, calls } = mockBot()
bot.onCommand('start', (message) => message.reply('hi'))

await send.command('/start')

expect(calls.last('sendMessage')?.params).toMatchObject({ text: 'hi' })
```

No network, no token, no fixtures. The mock drives the real dispatch pipeline and records
outgoing calls, so tests exercise the actual middleware and routing rather than a
stand-in. See [architecture.md](architecture.md) §2.1 — this is possible precisely because
`core` has no transport dependency.

---

## 17. AI-assistant ergonomics

A great deal of Telegram code is now written with a model in the loop, and models read types
rather than caveats. The properties that make an API inferable are structural rather than
cosmetic:

| Property | How the design delivers it |
|---|---|
| **Types are honest** | No member exists on a type where it would throw. A model that follows the types generates working code. |
| **One obvious way** | `message.reply({ photo })` rather than `replyWithPhoto`. Fewer near-identical names to choose wrongly between. |
| **Consistent argument order** | Target, then content, then options — everywhere. |
| **Predictable naming** | Everything that subscribes is `on…`; `use` / `extend` / `stop` mean one thing each. A model that has seen `onMessage` guesses `onCommand` correctly. |
| **The credential is in the name** | `Bot.fromToken` versus `Account.fromSession` — a model picks the constructor from what it has, rather than assembling an options object it has to get right. |
| **Single import root** | Everything from `'yuigram'`. No guessing which subpath a symbol lives in. |
| **Narrowing over casting** | Filters and registration narrow; `as` is never required in normal use. |
| **Discriminated escape** | `event.transport` is a literal union, so a model can branch on it correctly. |

The short-import argument for `@yui` is addressed in [naming.md](naming.md) — token savings
turn out to be negligible, and consistency matters far more to inference than brevity.

---

## 18. Complete example

```ts
import { Account, and, App, Bot, f, file, FloodError, Router, session, when } from 'yuigram'

const app = new App({ storage: file('./state'), log: { level: 'info' } })

const bot = app.add(
  Bot.fromToken(process.env.BOT_TOKEN!, { name: 'main' })
    .extend(session({ key: (event) => event.sender?.id }))
)

const me = app.add(
  Account.fromSession('./me.session', {
    apiId: Number(process.env.API_ID),
    apiHash: process.env.API_HASH!,
    name: 'me'
  })
)

const fromAdmin = f.sender.id(Number(process.env.ADMIN_ID))

const admin = new Router()
admin.use(when(fromAdmin, async (_event, next) => next()))
admin.onCommand('stats', (message) => message.reply(`uptime ${process.uptime() | 0}s`))

bot.extend(admin)
bot.onCommand('start', (message) => message.reply('Hi! Try /stats if you are an admin.'))
bot.on(f.media.photo, (message) => message.react('👍'))

// The userbot archives any text it sees in a private chat.
const privateText = and(f.chat.private, f.text(/./))

me.on(privateText, async (message) => {
  // `text` is a string here: the filter that selected this message proved it.
  await archive(message.text, message.date)
})

app.onError((err, event) => {
  if (err instanceof FloodError) return event.log.warn(`flood ${err.retryAfter}s`)
  event.log.error(err)
})

await app.start()
process.on('SIGINT', () => app.stop({ timeout: 10_000 }).then(() => process.exit(0)))
```

One package, one import, one application object, two clients, one middleware model — and no
point at which the API claims a bot and a user account are the same thing.
