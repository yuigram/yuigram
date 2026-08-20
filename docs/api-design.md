# API Design

The proposed public API. Every example here is Yuigram's own design, derived from the
constraints in [unified-model.md](unified-model.md) rather than copied from another
framework.

Design priorities, in order: **honesty** (the type reflects what actually works),
**predictability** (a developer or an AI assistant can guess the next call correctly),
**concision** (no ceremony that carries no information), **discoverability** (autocomplete
teaches the API).

---

## 1. The client model

Three candidate models were considered.

| Model | Assessment |
|---|---|
| `new Client({ type: 'bot' })` | **Rejected.** Every member becomes conditionally typed on the discriminant. Autocomplete offers members that throw at runtime. AI assistants read types, not caveats, and would generate confidently broken code. |
| `new Client(...)` for both, distinguished by options shape | **Rejected.** Same problem, worse — the divergence is not even visible in the type name. |
| **`new Bot(...)` and `new Account(...)`** | **Adopted.** Two names, two capability sets, no conditional typing anywhere. The names carry real information: a `Bot` cannot read another user's history, an `Account` cannot answer inline queries, and both facts are compile-time truths. |

```ts
import { Account, App, Bot } from 'yuigram'

const bot  = new Bot('123456:ABC-DEF…')
const user = new Account({ apiId: 12345, apiHash: 'abc…', session: './me.session' })
```

`Bot` takes a token positionally because it is the only required argument in the common case.
`Account` takes an object because it never has fewer than three.

### Naming

`Bot` and `Account` describe *what the client is on Telegram*, not which protocol it speaks.
That is the right axis: a developer thinks "I need my bot to do X" and "I need my account to
do Y", and the protocol is an implementation consequence. Bot-over-MTProto is therefore
`Bot.overMtproto({ … })` rather than a third class — same identity, different transport.

---

## 2. Getting started

The shortest useful program:

```ts
import { Bot } from 'yuigram'

const bot = new Bot(process.env.BOT_TOKEN!)

bot.command('start', (ctx) => ctx.reply('Hello!'))

await bot.start()
```

And a user client:

```ts
import { Account } from 'yuigram'

const user = new Account({
  apiId: Number(process.env.API_ID),
  apiHash: process.env.API_HASH!,
  session: './me.session'
})

user.on('message', (ctx) => console.log(ctx.text))

await user.start({
  phone: () => prompt('Phone: '),
  code:  () => prompt('Code: '),
  password: () => prompt('2FA password: ')
})
```

`start()` on an `Account` takes the interactive callbacks because sign-in genuinely requires
them; on a resumed session they are never called. Callbacks rather than values, so nothing
prompts unless it is actually needed.

---

## 3. Multiple clients: the `App`

```ts
import { Account, App, Bot } from 'yuigram'

const app = new App({ storage: file('./state') })

const bot     = app.add(new Bot(process.env.BOT_TOKEN!))
const alice   = app.add(new Account({ apiId, apiHash, session: './alice.session' }))
const bob     = app.add(new Account({ apiId, apiHash, session: './bob.session' }))

// Middleware shared by every client.
app.use(async (ctx, next) => {
  ctx.log.info({ client: ctx.client.name, kind: ctx.kind })
  await next()
})

// Cross-client handler — ctx.transport discriminates.
app.on('message', async (ctx) => {
  if (ctx.text === 'ping') await ctx.reply('pong')
})

// Client-scoped handler — fully typed, no discriminant needed.
bot.on('callback_query', (ctx) => ctx.answer('ok'))
alice.on('message', (ctx) => ctx.client.raw.messages.readHistory({ … }))

await app.start()          // starts all clients, resolves when all are running
await app.stop()           // drains in-flight handlers, then disconnects
```

Each client keeps an independent lifecycle, session, connection state and error handling.
`app.start()` is a convenience over starting each; a client that fails to start does not
prevent the others from running, and its failure is reported through `app.on('error')`.

```ts
// Independent lifecycles remain accessible.
await bob.stop()
await bob.start()
console.log(bob.state)      // 'idle' | 'starting' | 'running' | 'stopping' | 'failed'
```

Clients may be named for logging and lookup:

```ts
app.add(new Bot(token, { name: 'support-bot' }))
app.client('support-bot')   // Bot | undefined
```

---

## 4. Events

Handlers register with a kind and an optional filter.

```ts
bot.on('message', handler)
bot.on('message', f.text(/^hi/i), handler)
bot.on(['message', 'edited_message'], handler)

// Convenience forms for the overwhelmingly common cases.
bot.command('start', handler)
bot.command(/^\/say (?<what>.+)$/, (ctx) => ctx.reply(ctx.match.groups.what))
bot.callback('buy:*', handler)
bot.text('ping', handler)
```

Handlers may be registered at a priority, and `once` is supported:

```ts
bot.on('message', handler, { priority: 'high' })
bot.once('message', handler)
bot.off('message', handler)
```

The full taxonomy, the promoted service events and the type-inference rules are in
[events.md](events.md).

---

## 5. Filters

Filters are callable type-guards that compose. They are values, so they can be named,
exported and reused.

```ts
import { f } from 'yuigram'

bot.on('message', f.text(/^\d+$/), (ctx) => {
  ctx.text      // string — narrowed, not string | undefined
})

const fromAdmin = f.sender.id(ADMIN_ID)
const inGroup   = f.chat.group

bot.on('message', fromAdmin.and(inGroup), handler)
bot.on('message', f.media.photo.or(f.media.video), handler)
bot.on('message', f.command('ban').and(fromAdmin), handler)

// Custom filters are first-class.
const isWeekend = f.define('isWeekend', (u) => [0, 6].includes(u.date.getDay()))
```

The dual-parameter design (`Filter<Base, Mod>`) that makes the narrowing above work is
described in [research.md](research.md) §1.5 and [middleware.md](middleware.md) §4.

---

## 6. Context

```ts
bot.on('message', async (ctx) => {
  ctx.client            // Bot — the client that received this
  ctx.transport         // 'bot-api'
  ctx.kind              // 'message'

  ctx.chat              // Chat | undefined
  ctx.sender            // User | undefined
  ctx.text              // string | undefined
  ctx.date              // Date

  await ctx.reply('hi')
  await ctx.reply({ photo: media.path('./cat.jpg'), caption: 'cat' })
  await ctx.react('👍')
  await ctx.edit('changed')
  await ctx.delete()

  ctx.raw               // the untouched Bot API Update payload
})
```

`reply` accepts a string for the common case and an object otherwise. It is one method
rather than `replyWithPhoto`, `replyWithVideo`, `replyWithDocument` and so on — a single
predictable entry point is easier for both humans and AI assistants than a family of
near-identical names, and the media type is inferred from the key.

Escalating to transport-specific capability is explicit:

```ts
app.on('message', async (ctx) => {
  await ctx.reply('works on both')

  if (ctx.transport === 'mtproto') {
    await ctx.client.raw.messages.readHistory({ peer: ctx.chat.input, maxId: 0 })
  }
})
```

---

## 7. Middleware

```ts
app.use(async (ctx, next) => {
  const started = performance.now()
  await next()
  ctx.log.debug(`handled in ${(performance.now() - started).toFixed(1)}ms`)
})

// Gated on a filter — the middleware sees the narrowed type.
app.use(f.chat.private, async (ctx, next) => { … })

// Scoped to a client.
bot.use(async (ctx, next) => { … }, { priority: 'high' })
```

Around-hooks wrap outgoing API calls, which is what makes retry, throttling and caching
ordinary plugins:

```ts
bot.hook('apiCall', async (call, next) => {
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
import { Router, f } from 'yuigram'

export const admin = new Router()
admin.use(requireAdmin)
admin.command('ban',  handleBan)
admin.command('kick', handleKick)

// index.ts
bot.mount(admin)
bot.mount(shop, { prefix: 'shop:' })   // scopes callback data
```

A router carries its own middleware, which runs only for updates it handles. This is the
composition unit the brief's §18 asks for, and it keeps `bot.command(...)` from being the
only organizing tool available.

---

## 9. Sessions

```ts
import { session, file } from 'yuigram'

const bot = new Bot(token)
  .extend(session({ storage: file('./sessions'), key: (ctx) => ctx.sender?.id }))

bot.on('message', async (ctx) => {
  ctx.session.count ??= 0
  ctx.session.count++
  await ctx.reply(`seen ${ctx.session.count} messages`)
})
```

Typed by a **flavour** carried on the client's type parameter, so the shape is per bot rather
than per program:

```ts
interface Cart {
  count: number
}

type MyContext = Context & SessionFlavor<Cart>

const bot = new Bot<MyContext>(token)
```

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

bot.catch((err, ctx) => {
  if (err instanceof FloodError) {
    ctx.log.warn(`flood wait ${err.retryAfter}s`)
    return
  }
  if (err instanceof BotApiError) {
    ctx.log.error({ code: err.code, description: err.description })
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
// Typed, generated from the current schema.
await bot.raw.sendMessage({ chat_id: 1, text: 'hi' })
await user.raw.messages.sendMessage({ peer, message: 'hi', randomId: rnd() })

// Untyped, for anything newer than the installed schema.
await bot.raw.call('brandNewMethod', { … })
await user.raw.call({ _: 'messages.brandNewMethod', … })
```

Both forms exist deliberately: the typed one covers the schema, the untyped one covers the
window between a Telegram release and Yuigram regenerating. Without the second, every
Telegram release temporarily blocks some users.

---

## 13. Files

```ts
import { media } from 'yuigram'

await ctx.reply({ photo:    media.path('./cat.jpg') })
await ctx.reply({ video:    media.url('https://…/clip.mp4') })
await ctx.reply({ document: media.buffer(bytes, 'report.pdf') })
await ctx.reply({ photo:    media.id(existingFileId) })     // Bot API reuse

const bytes = await bot.download(ctx.message.photo)
await bot.download(ctx.message.document, './out.pdf')
```

One `media` namespace with a source per method. The `file_id` reuse path is Bot API only,
and the type reflects that — `media.id()` is not accepted by an `Account` client, because
`file_id` is a Bot API construct that does not convert without a round trip.

---

## 14. Lifecycle

```ts
await app.start()

app.on('error', ({ error, client }) => log.error({ client: client.name, error }))

process.on('SIGINT', async () => {
  await app.stop({ timeout: 10_000 })   // stop intake, drain in-flight, disconnect
  process.exit(0)
})
```

`stop()` drains rather than severing: intake halts immediately, in-flight handlers are
awaited up to the timeout, then transports close. A bot killed mid-handler loses work and
may reprocess an update on restart, so draining is the default rather than an option.

---

## 15. Plugins

```ts
import { definePlugin } from 'yuigram'

export const metrics = (opts: MetricsOptions = {}) =>
  definePlugin({
    name: 'metrics',
    install (target) {
      let handled = 0
      target.use(async (_ctx, next) => { handled++; await next() }, { priority: 'low' })
      return { get handled () { return handled } }
    }
  })

const bot = new Bot(token).extend(metrics())
bot.metrics.handled          // typed — exists only after .extend()
```

The returned object is attached under the plugin's name, so two plugins cannot collide, and
the type is only present once the plugin is installed.

---

## 16. Testing

```ts
import { mockBot } from 'yuigram/testing'

const { bot, send, calls } = mockBot()
bot.command('start', (ctx) => ctx.reply('hi'))

await send.command('start', { from: { id: 1 } })

expect(calls.last('sendMessage')).toMatchObject({ text: 'hi' })
```

No network, no token, no fixtures. The mock drives the real dispatch pipeline and records
outgoing calls, so tests exercise the actual middleware and routing rather than a
stand-in. See [architecture.md](architecture.md) §2.1 — this is possible precisely because
`core` has no transport dependency.

---

## 17. AI-assistant ergonomics

The project brief §37 asks for an API that models can infer correctly. The properties that matter
are structural rather than cosmetic:

| Property | How the design delivers it |
|---|---|
| **Types are honest** | No member exists on a type where it would throw. A model that follows the types generates working code. |
| **One obvious way** | `ctx.reply({ photo })` rather than `replyWithPhoto`. Fewer near-identical names to choose wrongly between. |
| **Consistent argument order** | Target, then content, then options — everywhere. |
| **Predictable naming** | `on` / `once` / `off`, `start` / `stop`, `use` / `hook` / `extend`. Common verbs used in their common senses. |
| **Single import root** | Everything from `'yuigram'`. No guessing which subpath a symbol lives in. |
| **Narrowing over casting** | Filters narrow; `as` is never required in normal use. |
| **Discriminated escape** | `ctx.transport` is a literal union, so a model can branch on it correctly. |

The short-import argument for `@yui` is addressed in [naming.md](naming.md) — token savings
turn out to be negligible, and consistency matters far more to inference than brevity.

---

## 18. Complete example

```ts
import { Account, App, Bot, Router, f, session, file, FloodError } from 'yuigram'

const app = new App({ storage: file('./state'), log: { level: 'info' } })

const bot = app.add(
  new Bot(process.env.BOT_TOKEN!, { name: 'main' })
    .extend(session({ key: (ctx) => ctx.sender?.id }))
)

const me = app.add(new Account({
  apiId: Number(process.env.API_ID),
  apiHash: process.env.API_HASH!,
  session: './me.session',
  name: 'me'
}))

const admin = new Router()
admin.use(f.sender.id(Number(process.env.ADMIN_ID)), async (ctx, next) => next())
admin.command('stats', (ctx) => ctx.reply(`uptime ${process.uptime() | 0}s`))

bot.mount(admin)
bot.command('start', (ctx) => ctx.reply('Hi! Try /stats if you are an admin.'))
bot.on('message', f.media.photo, (ctx) => ctx.react('👍'))

// The userbot archives anything forwarded to Saved Messages.
me.on('message', f.chat.self, async (ctx) => {
  await archive(ctx.text ?? '', ctx.date)
})

app.catch((err, ctx) => {
  if (err instanceof FloodError) return ctx.log.warn(`flood ${err.retryAfter}s`)
  ctx.log.error(err)
})

await app.start()
process.on('SIGINT', () => app.stop({ timeout: 10_000 }).then(() => process.exit(0)))
```

One package, one import, one application object, two clients, one middleware model — and no
point at which the API claims a bot and a user account are the same thing.
