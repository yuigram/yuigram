# Middleware, Filters and Routing

The execution model for handling updates, and the type machinery that keeps it safe.

---

## 1. Execution model

Onion composition. Middleware receives the context and a `next` continuation; work before
`next()` runs on the way in, work after runs on the way out.

```
     ┌────────────────────────────────────────────┐
     │  logging                                    │
     │  ┌──────────────────────────────────────┐   │
     │  │  session                              │   │
     │  │  ┌────────────────────────────────┐   │   │
     │  │  │  auth                           │   │   │
     │  │  │  ┌──────────────────────────┐   │   │   │
     │  │  │  │      handler              │   │   │   │
     │  │  │  └──────────────────────────┘   │   │   │
     │  │  └────────────────────────────────┘   │   │
     │  └──────────────────────────────────────┘   │
     └────────────────────────────────────────────┘
```

```ts
type Middleware<C> = (ctx: C, next: () => Promise<void>) => Promise<void> | void
```

Chosen over the alternatives for concrete reasons:

| Model | Why not |
|---|---|
| Event emitter | No ordering guarantee, no way to wrap, no short-circuit |
| Return-value pipeline | Cannot run code after the handler — no timing, no cleanup |
| Fixed hook list | Not composable; every new cross-cutting concern needs a framework change |

The onion is what makes timing, error boundaries, transactions and cleanup expressible in
userland instead of requiring framework support for each.

---

## 2. Priorities

Three bands, with a **reserved slot for handlers** between `normal` and `low`:

```
high    ──  session, auth, rate limiting        (must run before handlers)
normal  ──  application middleware
HANDLERS ── on() / command() / router matches
low     ──  metrics, response logging           (must run after handlers)
```

This solves a real problem: without it, a plugin must either guess registration order or
document "install me first", and both fail as soon as two plugins have the same requirement.
With it, `session` declares `high` and is correct regardless of when the user installs it.

```ts
app.use(mw)                            // normal
app.use(mw, { priority: 'high' })
app.use(mw, { priority: 'low' })
```

Within a band, registration order applies.

---

## 3. Scopes

Middleware attaches at three levels, running outermost first:

```
App middleware        → every client, every update
  Client middleware   → one client
    Router middleware → updates that router handles
      Handler
```

```ts
app.use(globalLogging)
bot.use(botOnlyThing)
adminRouter.use(requireAdmin)
```

A router's middleware runs **only if the router matches**, which is what makes
`requireAdmin` above correct rather than a global gate — it never runs, and never costs
anything, for updates the admin router does not handle.

---

## 4. Filters

A filter is a callable type-guard carrying composition methods and runtime metadata.

```ts
interface Filter<Base = unknown, Mod = unknown> {
  (update: Update): update is Update & Base
  readonly name: string
  readonly kinds?: readonly string[]

  and: <B2, M2>(other: Filter<B2, M2>) => Filter<Base & B2, Mod & M2>
  or:  <B2, M2>(other: Filter<B2, M2>) => Filter<Base | B2, Mod | M2>
  not: () => Filter
}
```

### The two type parameters

This is the design worth understanding, and it is adopted from puregram's approach
([research.md](research.md) §1.5) as an independently-implemented concept.

- **`Base`** — *which* update this is. `MessageContext`, `CallbackQueryContext`.
- **`Mod`** — *what shape* its fields have. `{ text: string }` where the base had
  `string | undefined`.

They compose independently:

```ts
f.text(/x/)            // Filter<MessageContext, { text: string }>
f.chat.private         // Filter<MessageContext, {}>
f.text(/x/).and(f.chat.private)
                       // Filter<MessageContext, { text: string }>
```

The handler argument is `Base & Mod` with the `Mod` keys replaced rather than intersected:

```ts
type Modify<Base, Mod> = Omit<Base, keyof Mod> & Mod
```

The `Omit` is essential. A plain `Base & Mod` leaves the original `text: string | undefined`
declaration in place, and TypeScript re-widens on chained access — so `ctx.text.trim()`
still errors even though the filter proved `text` is a string. Stripping the key first makes
the refinement survive. This trap is subtle enough to be worth stating in the design
document rather than discovering during implementation.

### Runtime metadata

`kinds` lets the dispatcher skip a filter entirely for irrelevant updates, before evaluating
any predicate:

```ts
if (filter.kinds && !filter.kinds.includes(update.kind)) return  // skip
```

For an application with fifty handlers this turns a linear scan of predicates into a map
lookup for the common case.

### Built-in filter families

```
f.text(str | regex)         f.caption(...)      f.command(name | regex)
f.chat.private/group/channel/self
f.sender.id/username/isBot/isAdmin
f.media.photo/video/document/audio/voice/sticker/animation
f.callback.data(str | regex)
f.reply.exists/toBot
f.forward.exists/fromChat
f.entity.url/mention/hashtag
f.and(...) f.or(...) f.not(...)
f.define(name, predicate, { kinds })
```

Filters are ordinary values — nameable, exportable, testable in isolation:

```ts
export const fromStaff = f.sender.id(...STAFF_IDS)
expect(fromStaff(fixture)).toBe(true)
```

---

## 5. Routing

Handlers register with a kind and an optional filter:

```ts
bot.on('message', handler)
bot.on('message', f.text(/^hi/), handler)
bot.on(['message', 'message_edited'], handler)
```

Shorthands cover the cases that would otherwise be written a thousand times:

```ts
bot.command('start', handler)
bot.command(/^\/say (?<what>.+)$/, (ctx) => ctx.reply(ctx.match.groups.what))
bot.text('ping', handler)
bot.callback('buy:*', handler)
bot.inline(/^search /, handler)
```

`bot.command('start')` handles the Telegram conventions — `/start`, `/start arg`,
`/start@botname` — including the mention check against the running bot's username, which is
required for correct behaviour in groups and which almost every hand-rolled implementation
gets wrong.

### Routers

```ts
const shop = new Router()
shop.use(loadCart)
shop.callback('add:*',    addToCart)
shop.callback('remove:*', removeFromCart)
shop.command('cart',      showCart)

bot.mount(shop)
bot.mount(admin, { prefix: 'admin:' })   // scopes callback data
```

Routers nest, carry their own middleware, and are the unit of code organization for anything
larger than a single file. The `prefix` option namespaces callback data so two routers can
both use `add:*` without colliding.

### Match order

1. Kind must match (map lookup, not a scan).
2. Filter must pass.
3. Handlers run in priority order, then registration order.
4. By default **all** matching handlers run. Calling `ctx.stop()` prevents the rest.

Running all matching handlers rather than only the first is deliberate: it makes independent
concerns — logging a photo, reacting to a photo, archiving a photo — compose without
requiring them to know about each other. `ctx.stop()` is available when exclusivity is
actually wanted.

---

## 6. Context extension

Plugins add to the context through a declared extension point, rather than by merging into
another package's types — the anti-pattern identified in [research.md](research.md) §1.8.

```ts
// Plugin declares what it adds, under its own key.
declare module 'yuigram' {
  interface ContextExtensions {
    session: SessionData
    i18n: { t: (key: string) => string }
  }
}
```

Two properties this buys:

- **Collision-proof.** Two plugins cannot both claim `match` and silently conflict; each owns
  a named key.
- **Local.** The declaration extends Yuigram's own interface, not a dependency's update
  types, so it cannot affect an unrelated package.

Handler-local data that is not plugin-owned uses a typed bag:

```ts
bot.command(/^\/say (?<what>.+)$/, (ctx) => ctx.match.groups.what)   // typed by the shorthand
```

---

## 7. Errors

Errors propagate outward through the onion, so an outer middleware can catch what an inner
one threw:

```ts
app.use(async (ctx, next) => {
  try {
    await next()
  } catch (err) {
    await ctx.reply('Something broke.')
    throw err            // rethrow — the framework handler still sees it
  }
})

app.catch((err, ctx) => {
  ctx.log.error({ err, kind: ctx.kind, chat: ctx.chat?.id })
})
```

**Default behaviour when nothing handles an error:** log it at `error` level and continue.
The alternative — crashing the process — is defensible for a small bot and disastrous for one
serving thousands of chats, where a single malformed update would take down every
conversation. On start, if no `catch` handler is registered, the framework logs a one-time
warning naming the risk, so the default is safe without being silent.

---

## 8. Performance

| Concern | Treatment |
|---|---|
| Per-update allocation | Context objects use lazy getters; nothing decodes until accessed |
| Filter evaluation | `kinds` metadata short-circuits before any predicate runs |
| Handler lookup | Kind-indexed map, not a linear scan |
| Middleware depth | Chain composed once at registration, not rebuilt per update |
| Empty chains | Skipped entirely — an unused hook costs nothing |

Budget: middleware and dispatch overhead should stay well under a millisecond per update, so
that it is invisible next to a Telegram round trip. Measured against that budget in
[performance.md](performance.md) §3.
