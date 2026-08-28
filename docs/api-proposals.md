# API Proposals

Three designs for Yuigram's public API. They are genuinely different in structure, not
variations on one idea, and each is worked through the same set of scenarios so they can be
compared honestly.

Shared premises, established in [api-review.md](api-review.md) and taken as given here:

- Handlers receive a context **typed for the event**, named after the domain object.
- Authentication is expressed in the constructor's **name**, not in the shape of its argument.
- Lifecycle verbs state **which mechanism** is running.
- Everything below dispatch — filters, sessions, storage, errors — is kept as it is today.

---

## Proposal A — Domain clients with named constructors

Two client classes, named for what the client *is* on Telegram. Events are methods. The handler
receives the domain object the event is about.

### Bot API

```ts
import { Bot } from 'yuigram'

const bot = Bot.fromToken(process.env.BOT_TOKEN!)

bot.onCommand('start', (message) => message.reply('Welcome.'))

bot.onMessage((message) => {
  message.reply(`You said: ${message.text}`)      // text is string, not string | undefined
})

bot.onCallbackQuery((query) => {
  query.answer('Got it')                           // query.data is string
  query.message.edit('Done.')
})

bot.onError((error, event) => {
  event.log.error('handler failed', { error })
})

await bot.poll()
```

### MTProto user account

```ts
import { Account } from 'yuigram'

const me = Account.fromSession('./me.session', { apiId, apiHash })

// First run has no session yet, so sign-in is explicit rather than implicit.
if (!me.authorized) {
  await me.signIn({
    phone: () => ask('Phone: '),
    code: () => ask('Code: '),
    password: () => ask('2FA password: '),
  })
}

me.onMessage((message) => {
  if (message.text === 'ping') message.reply('pong')
})

await me.connect()
```

### MTProto bot

```ts
import { Bot } from 'yuigram'

// Same class, different credential — the name says which.
const bot = Bot.fromMtproto(process.env.BOT_TOKEN!, { apiId, apiHash })

bot.onMessage((message) => message.reply('hi'))

await bot.connect()
```

### The rest

```ts
// Middleware — unchanged from today, still the onion.
bot.use(async (event, next) => {
  const began = performance.now()
  await next()
  event.log.info('handled', { ms: performance.now() - began })
})

// Multiple handlers — all matching handlers run.
bot.onMessage((message) => audit(message))
bot.onMessage((message) => archive(message))

// Filters, for anything a method cannot express.
import { and, filter } from 'yuigram'
const fromAdmin = filter('fromAdmin', (e) => e.sender?.id === ADMIN)
bot.onMessage(and(fromAdmin, hasPhoto), (message) => message.reply('Nice photo.'))

// Files
bot.onPhoto(async (message) => {
  const bytes = await message.photo.download()          // reads from the message itself
  await message.replyWithPhoto(bytes, { caption: 'Back at you' })
})

// Sessions
import { memory, session, userChatKey } from 'yuigram'
type Cart = { items: string[] }
bot.use(session<Cart>({ storage: memory(), key: userChatKey, initial: () => ({ items: [] }) }))
bot.onCommand('add', (message) => {
  message.session.items.push(message.command.rest)
  message.reply(`${message.session.items.length} items`)
})

// Graceful shutdown
process.once('SIGTERM', () => void bot.stop())

// Webhook instead of polling
import { createServer } from 'node:http'
import { nodeWebhook } from 'yuigram/webhook'
createServer(nodeWebhook(bot.webhook({ secret }))).listen(8080)
```

### Character

Reads closest to English. `bot.onCommand('start', message => message.reply(…))` needs no
documentation. The cost is surface area: one method per event kind, and the class carries every
one of them.

---

## Proposal B — One `Telegram` namespace, capability-scoped clients

A single entry point that produces clients. The namespace answers "what am I talking to";
the factory answers "as whom".

### Bot API

```ts
import { telegram } from 'yuigram'

const bot = telegram.bot({ token: process.env.BOT_TOKEN! })

bot.on.command('start', (message) => message.reply('Welcome.'))
bot.on.message((message) => message.reply(`You said: ${message.text}`))
bot.on.callbackQuery((query) => query.answer('Got it'))
bot.on.error((error, event) => event.log.error('failed', { error }))

await bot.poll()
```

### MTProto user account

```ts
import { telegram } from 'yuigram'

const me = telegram.account({
  apiId,
  apiHash,
  session: './me.session',
})

if (!me.authorized) await me.signIn({ phone, code, password })

me.on.message((message) => message.reply('hi'))

await me.connect()
```

### MTProto bot

```ts
const bot = telegram.bot({
  token: process.env.BOT_TOKEN!,
  transport: 'mtproto',
  apiId,
  apiHash,
})

bot.on.message((message) => message.reply('hi'))
await bot.connect()
```

### The rest

```ts
bot.use(async (event, next) => { await next() })

bot.on.photo(async (message) => {
  const bytes = await message.photo.download()
  await message.reply.photo(bytes, { caption: 'Back at you' })   // grouped sends, too
})

bot.use(telegram.session<Cart>({ storage: telegram.memory(), key: userChatKey, initial }))

await bot.stop()
```

### Character

The `on.` grouping keeps the client surface flat — one property instead of thirty methods — and
autocomplete after `bot.on.` lists every event in one place. It also gives a natural home for
symmetric groupings (`bot.on.*`, `message.reply.*`).

The cost is an extra hop everywhere, and a `telegram` namespace object that must be imported to
reach storage and session helpers, which is one more thing to learn than a bare import.

---

## Proposal C — Handlers as values, composed into the client

Handlers are standalone values built by factory functions, then handed to the client. Nothing
is registered by mutation.

### Bot API

```ts
import { bot, command, message, onError, poll } from 'yuigram'

const app = bot(process.env.BOT_TOKEN!, [
  command('start', (m) => m.reply('Welcome.')),
  message((m) => m.reply(`You said: ${m.text}`)),
  onError((error, event) => event.log.error('failed', { error })),
])

await poll(app)
```

### MTProto user account

```ts
import { account, connect, message, signIn } from 'yuigram'

const me = account({ apiId, apiHash, session: './me.session' }, [
  message((m) => m.reply('hi')),
])

await signIn(me, { phone, code, password })
await connect(me)
```

### MTProto bot

```ts
const app = bot({ token, apiId, apiHash, via: 'mtproto' }, [
  message((m) => m.reply('hi')),
])

await connect(app)
```

### The rest

```ts
// Handlers are values, so they compose and test in isolation.
const audit = message((m) => log(m))
const greet = command('start', (m) => m.reply('hi'))

export const support = group([audit, greet])              // reusable module
const app = bot(token, [support, photo(handlePhoto)])

// Middleware is just another value in the list.
const app2 = bot(token, [timing(), session({ storage: memory() }), greet])

// A handler can be unit-tested without a client at all.
await greet.run(fakeMessage)
```

### Character

Maximally composable and tree-shakeable: an application imports only the handler kinds it uses.
Handlers are ordinary values, so they are trivially testable, groupable and shareable across
projects — a real advantage for large codebases and plugin authors.

The cost is that the minimal example is no longer three lines. It requires importing `bot`,
`command`, `message` and `poll` before anything happens, and the free-function lifecycle
(`poll(app)` rather than `app.poll()`) reads less naturally to most developers.

---

## Side-by-side

The same task in all three:

```ts
// A — methods on a domain client
const bot = Bot.fromToken(token)
bot.onCommand('start', (m) => m.reply('hi'))
await bot.poll()

// B — namespace factory, grouped events
const bot = telegram.bot({ token })
bot.on.command('start', (m) => m.reply('hi'))
await bot.poll()

// C — handlers as values
const app = bot(token, [command('start', (m) => m.reply('hi'))])
await poll(app)
```

| Criterion | A | B | C |
|---|:--:|:--:|:--:|
| Reads without documentation | **best** | good | fair |
| Lines to first working bot | **3** | 3 | 4 |
| Imports for the minimal app | **1** | 1 | 4 |
| Event discoverability | good | **best** (`bot.on.` lists all) | fair |
| Client surface size | large (~30 methods) | **small** (grouped) | **smallest** |
| Composability / reuse | fair | fair | **best** |
| Testing a handler alone | fair | fair | **best** |
| Tree-shaking | poor | poor | **best** |
| Predictable for an AI assistant | **best** | good | fair |
| Extending with a new event kind | add a method | add to `on` | add a factory |

None of the three has a type-safety advantage: all give event-specific contexts, which is the
requirement that matters. The differences are ergonomic and structural.

---

## What none of them settles

Three questions cut across all proposals and are decided in
[api-decisions.md](api-decisions.md):

1. **Does `Bot` cover both Bot API and MTProto bots, or are they separate classes?** All three
   proposals above assume one `Bot` with different constructors. The alternative is
   `Bot` / `MtprotoBot`, which is uglier but never lets a developer call a Bot-API-only method
   on an MTProto client.

2. **What is the handler argument called when the event is not a message?** `onMessage` gives a
   `message`. What does `onChatMemberJoined` give? `member`? `event`? Consistency here decides
   whether the model holds together.

3. **`poll()` / `connect()` — or one verb?** Distinct verbs state the mechanism, which is what
   makes the lifecycle legible. But a developer holding a `Bot | Account` union then cannot
   start it generically.
