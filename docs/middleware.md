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
type Middleware<C> = (context: C, next: () => Promise<void>) => Promise<void> | void
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
HANDLERS ── on() / onCommand() / router matches
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
  (value: unknown): value is Base
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
declaration in place, and TypeScript re-widens on chained access — so `message.text.trim()`
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
f.has.<field>               one per optional field — 116 on a message alone
f.hasQuery.<field>          the same, over a callback query
f.text(str | regex)         f.caption(...)      f.anyText(...)
f.command(name | regex)     f.topic
f.chat.private/group/supergroup/anyGroup/channel/forum/id(...)
f.sender.id(...)/isBot/isPremium/anonymous/viaBot
f.media.photo/video/videoNote/animation/audio/voice/document/sticker/… /any
f.callback.data(str | regex)  f.callback.inline
f.reply.exists/toBot        f.forward.exists/fromChat
f.entity.url/textLink/mention/hashtag/code/spoiler/… /anyLink
```

`f.has` is **generated** from the schema — one filter per optional field, so a field Telegram
adds appears the day the schema is regenerated. `f.media.photo` is an alias into it. Everything
else is curated, because it encodes a judgement a schema cannot make: that a group and a
supergroup are both "a group", that a link in a caption is still a link.

Composition and definition are free functions rather than members of `f`, because they are
core's and work on any filter: `and`, `or`, `not`, `every`, `some`, and `filter(name, predicate,
{ kinds })` for one of your own.

Filters are ordinary values — nameable, exportable, testable in isolation:

```ts
export const fromStaff = f.sender.id(...STAFF_IDS)
expect(fromStaff(fixture)).toBe(true)
```

---

## 5. Routing

Handlers register against a kind, a list of kinds, or a filter:

```ts
bot.on('message', handler)
bot.on(['message', 'message_edited'], handler)
bot.on(f.text(/^hi/), handler)
```

One argument selects, one handles. A kind and a filter are not passed together: a filter
already carries the kinds it can match, so the pair would state the same thing twice and
allow the two halves to disagree. Selecting on more than one condition composes instead:

```ts
const privateGreeting = and(f.chat.private, f.text(/^hi/))

bot.on(privateGreeting, handler)
```

The composition is named before it is registered. Composing inside the registration argument
does not infer — TypeScript cannot carry the narrowing out through the nested call — and a
handler that silently widened to every event would be a worse outcome than a compile error.

Shorthands cover the cases that would otherwise be written a thousand times:

```ts
bot.onCommand('start', handler)
bot.onCommand(/^say$/, (message) => message.reply(message.command.rest))
bot.onText('ping', handler)
bot.onCallbackQuery(/^buy:/, handler)
```

Every kind also has a named registration of its own — `onMessage`, `onChatMemberJoined`,
`onForumTopicCreated`, seventy-nine in all — generated from the same taxonomy the dispatcher
indexes and equivalent to `on(kind, handler)`. That is how most people discover that a member
joining has its own kind rather than arriving as a message to branch on.

The three above are hand-written rather than generated because each **matches as well as
selects**, and matching is what earns the narrower context: `text` is a `string` inside
`onText` because the registration proved it.

`bot.onCommand('start')` handles the Telegram conventions — `/start`, `/start arg`,
`/start@botname` — including the mention check against the running bot's username, which is
required for correct behaviour in groups and which almost every hand-rolled implementation
gets wrong.

### Routers

```ts
// features/shop.ts
export const shop = new Router({ name: 'shop' })

shop.use(loadCart)
shop.onCallbackQuery(/^add:/,    addToCart)
shop.onCallbackQuery(/^remove:/, removeFromCart)
shop.onCommand('cart',           showCart)

// index.ts
bot.extend(shop)
```

A router carries the client's registration surface — including the generated `on…` set — so a
handler moves between the two without being rewritten, and it installs through `extend`: the
same verb as any other extension, because that is what a router is from the client's side.

**Its middleware is scoped**, which is the property a naming convention cannot provide.
`loadCart` above runs for the updates this router handles and for nothing else, so it is a
real gate rather than a global one that returns early — a router handling only callback
queries costs nothing on a message. Scoping is by kind: the client dispatches into the router
for the kinds it registered for, and the router's middleware runs **once per update**, not
once per matching handler. A rate limiter charging a message three times because three
handlers wanted it would be worse than no scoping at all.

Ordering nests rather than interleaves:

```
client middleware  →  router middleware  →  router handler  →  router middleware  →  client middleware
```

**Errors travel outward.** A router may register its own `onError` and keep failures local;
without one they reach the client's error handling, which is the route a directly-registered
handler's failure takes. Either way, one failing handler does not stop the rest.

**Populate, then install.** Installing reads which kinds the router covers, and that is what
the client asks Telegram to send. A handler registered afterwards would be for a kind nothing
subscribed to, so it would silently never run — and rather than leave that silent, a
registration after installation throws. A router that carries a filter with no kind hint
widens the subscription instead of narrowing it, for the same reason any opaque filter does.

Typing follows the client's: `new Router<SessionFlavor<Cart>>()` declares what its handlers
expect every context to carry, and a client that does not provide it cannot install the
router.

Namespacing callback data per router — `bot.extend(admin, { prefix: 'admin:' })` — is not
implemented. Two routers matching the same prefix work today; scoping it is a convenience,
not a correctness requirement, and it is easier to add once real applications have said what
they want from it.

### Match order

1. Kind must match (an index lookup, not a scan — a filter carrying a `kinds` hint gets the
   same fast path).
2. Filter must pass.
3. Handlers run in registration order.
4. **All** matching handlers run, and one that throws does not prevent the rest.

Running all matching handlers rather than only the first is deliberate: it makes independent
concerns — logging a photo, reacting to a photo, archiving a photo — compose without
requiring them to know about each other. Exclusivity, where it is wanted, is expressed by
selecting more precisely rather than by cancelling: two handlers that must not both run are
two registrations whose filters do not overlap.

Priority bands order *middleware*, not handlers. Handlers occupy one reserved slot between
the `normal` and `low` bands, so a session plugin registered `high` is correct wherever the
application happens to install it.

---

## 6. Context extension

Plugins add to the context through a **flavour** — an interface describing what the plugin
contributes — rather than by merging into another package's types, which is the anti-pattern
identified in [research.md](research.md) §1.8.

```ts
// The plugin publishes what it adds.
export interface SessionFlavor<V> {
  session: V
  readonly sessionHandle: SessionHandle<V>
}

export interface I18nFlavor {
  readonly t: (key: string) => string
}
```

An application intersects the flavours it uses and names the result once:

```ts
type Extras = SessionFlavor<Cart> & I18nFlavor

const bot = Bot.fromToken<Extras>(token)
```

The type parameter is what plugins add rather than the whole context, because the base
context varies by event: a message handler and a poll-answer handler do not receive the
same shape, so there is no single type to name and extend.

Four properties this buys, the last two of which declaration merging cannot provide at all:

- **Collision-proof.** Two plugins cannot both claim `match` and silently conflict; each owns
  a named key.
- **Local.** Nothing is declared globally, so a plugin cannot affect an unrelated package.
- **Per client.** Two bots in one program hold different state. A merged interface is
  process-wide, so every bot would carry every other bot's fields.
- **Honest.** `session` exists exactly where the middleware providing it is installed,
  not on every context in the program because some file imported the plugin.

Middleware that provides a flavour constrains the context to carry it, so installing it on a
client that never declared it is a compile error rather than an `undefined` at runtime.

The client casts once, where it builds a context: the flavours are attached by the middleware
that provides them, which runs before any handler, and TypeScript cannot see that ordering.
That is the only such cast, and it is the reason the framework does not need to know about
any particular plugin.

Handler-local data that is not plugin-owned uses a typed bag:

```ts
bot.onCommand('say', (message) => message.command.rest)   // typed by the shorthand
```

---

## 7. Errors

Errors propagate outward through the onion, so an outer middleware can catch what an inner
one threw:

```ts
app.use(async (event, next) => {
  try {
    await next()
  } catch (err) {
    // Not every kind can reply — a poll answer has no chat — so the narrowing
    // is checked rather than asserted.
    if ('reply' in event) await event.reply('Something broke.')
    throw err            // rethrow — the framework handler still sees it
  }
})

app.onError((err, event) => {
  event.log.error({ err, kind: event.kind })
})
```

**An error is either handled or propagates. It is never silent.** Three cases, in order:

| Situation | Outcome |
|---|---|
| An `onError` handler is registered | Every catcher sees the error; dispatch continues |
| No catcher, but the client owns a logger | Logged at `error` level; dispatch continues |
| Neither — a bare dispatcher | Propagates to the caller of `dispatch` |

Continuing is the right default for a client. The alternative — crashing the process — is
defensible for a small bot and disastrous for one serving thousands of chats, where a single
malformed update would take down every conversation in flight. Later handlers for the same
update still run, so one broken concern cannot silently disable the others.

That default is safe without being quiet: on start, if no `onError` handler is registered, the
client logs a one-time warning naming the risk. And a `Dispatcher` used directly, with neither
a catcher nor a logger, rethrows rather than swallowing — nothing has claimed responsibility
for the error, so the caller inherits it.

A catcher that throws is reported through the same channel but never re-enters the catchers,
since an error handler cannot meaningfully report to itself.

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
that it is invisible next to a Telegram round trip. `pnpm bench` measures it at roughly 14 µs —
see [performance.md](performance.md) §3.
