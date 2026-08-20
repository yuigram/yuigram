# API Review

A review of Yuigram's public API as it stands at 0.1.0, written from the position of a
developer who has never seen the internals.

The question is not whether the API works — it does, and it is tested. The question is whether
it is a good enough foundation to freeze for a decade.

The answer is no. This document says why, precisely.

---

## 1. The symptom

The smallest Yuigram application reads:

```ts
import { Bot } from 'yuigram'

const bot = new Bot(process.env.BOT_TOKEN)

bot.command('start', (ctx) => ctx.reply('Hello.'))
bot.on('message', (ctx) => ctx.reply(ctx.text ?? 'Say something.'))
bot.catch((error, ctx) => ctx.log.error('handler failed', { error }))

await bot.start()
```

Six lines, and four of them contain a design defect. They are worth taking one at a time,
because each points at a different structural problem rather than a naming preference.

---

## 2. `ctx.text ?? 'Say something.'` — the type system is not helping

This is the most damaging line in the example, because the `??` is not defensive programming.
It is a scar left by a type that is wrong.

Verified against the published 0.1.0 package:

```ts
bot.on('message', (ctx) => {
  const t: string = ctx.text   // Type 'string | undefined' is not assignable to type 'string'
})

bot.on('callback_query', (ctx) => {
  const d: string = ctx.data   // Type 'string | undefined' is not assignable to type 'string'
})
```

Both fail. Inside a handler registered for `callback_query`, `ctx.data` — the one field that
update *always* carries — is still optional.

The cause is structural. There is exactly one context type:

```ts
export interface Context extends BaseContext {
  readonly text: string | undefined
  readonly data: string | undefined
  readonly query: string | undefined
  readonly message: Message | undefined
  // …
}
```

One type serves twenty-six update kinds, so every field that is not universal must be optional.
The developer then re-establishes at runtime what they already stated at registration time.

**This is the single largest defect in the current API.** It is not cosmetic: it makes every
handler noisier, it teaches developers that Yuigram's types cannot be trusted, and it wastes
the one advantage a TypeScript-first framework is supposed to have.

It also compounds. `ctx.message` is `Message | undefined`, so reaching a photo reads:

```ts
bot.on('photo', (ctx) => {
  const photo = ctx.message?.photo?.at(-1)   // two optional hops, both provably present
  if (photo === undefined) return             // dead branch the developer must still write
})
```

A framework that knows the update is a photo should hand back a context where the photo is
`PhotoSize[]`, not `PhotoSize[] | undefined`.

---

## 3. `new Bot(token)` — does not survive contact with the roadmap

Two problems, one of which is fatal.

**It does not say how authentication happens.** `new Bot(someString)` — what is the string? The
type says `string`. The developer learns from documentation, not from the API.

**It does not extend to three client kinds.** Yuigram must support:

| Client | Transport | Credential |
|---|---|---|
| Bot | Bot API | bot token |
| Bot | MTProto | bot token + `api_id`/`api_hash` |
| User account | MTProto | phone / QR / stored session |

A positional-string constructor accommodates exactly one of these. Adding the rest means
overloads or an options bag, and both erode the thing the constructor was chosen for:

```ts
new Bot(token)                                        // Bot API
new Bot({ token, apiId, apiHash, via: 'mtproto' })     // MTProto bot — a different object
new Account({ apiId, apiHash, session: './me' })       // and now a second class
```

By the third line the constructor has stopped communicating anything. The developer must read
docs to know which shape means what.

The relevant comparison is not that puregram's `Telegram.fromToken(...)` is prettier. It is
that a **named constructor puts the authentication method in the name**, so the API scales by
adding names rather than by adding conditional shapes. `fromToken`, `fromSession`,
`fromCredentials` are self-describing and mutually exclusive by construction.

---

## 4. `bot.start()` — will become a lie

Today `start()` means "begin long polling". Tomorrow the same client must also:

- serve a webhook
- open an MTProto connection
- run an interactive sign-in (phone, code, 2FA)
- reconnect after a network partition

`start()` cannot honestly name all of those. It already cannot: a webhook bot never calls
`start()` at all, it calls `webhookHandler()` — so the lifecycle verb applies to one of two
modes, silently.

Worse, `start()` hides the single most important operational fact about a bot: **whether it is
polling or being pushed to.** That determines deployment shape, scaling, cost and failure mode.
A framework should not make the developer look it up.

---

## 5. `bot.on('message', …)` — a string where a type belongs

`on(kind, handler)` is the conventional shape, and it has two costs here.

**No narrowing.** The signature is `on(match: string | string[] | AnyFilter, handler:
Handler<C>)`. The handler always receives `C`. The string is not a type-level input, so it
cannot select a context type. Section 2 is a direct consequence.

**Discovery through strings.** To learn what events exist, the developer types a quote and
waits for autocomplete inside a string literal. It works, but it is a worse experience than
typing `bot.on` and seeing methods, and it does not survive a rename or show documentation on
hover the way a real method does.

`on()` is still needed — for dynamic kinds, arrays and composed filters — but it should not be
the primary path.

---

## 6. `ctx` — a framework object where a domain object belongs

`ctx` is a container the framework invented. Nothing in Telegram is called a context.

This matters more than it sounds. The name sets what the developer thinks they are
manipulating. `ctx.reply(...)` frames the operation as *the framework replying on my behalf*.
`message.reply(...)` frames it as *this message being replied to* — which is what actually
happens, and what the Bot API itself models.

The deeper issue: `Context` is a **union of every update shape**, so it is not a model of
anything. It is a bag. A developer cannot form a mental picture of a `Context` the way they can
of a `Message` or a `Chat`.

Note carefully what this criticism is **not**. It is not "remove the context object". puregram's
`message` in `onMessage(message => …)` is itself a context — a `MessageContext` carrying
methods. The lesson is not *no context*; it is:

> A context should be named after the domain object it wraps, and typed for the one event it
> represents.

That is a redesign of the context model, not its removal.

---

## 7. `bot.catch(...)` — borrowed word, wrong meaning

`catch` is taken from `try/catch`, where it means "this block handles the exception and
execution continues here". `bot.catch` does something else: it registers a **reporter** that
runs for errors from any handler, after which dispatch continues regardless.

It also reads as an instruction to the bot ("bot, catch") rather than as a subscription, which
is what it is. Everything else that subscribes is named `on…`; this one is not.

The behaviour is right. The name is imported from a different concept.

---

## 8. The vocabulary is not one language

Collecting the current surface:

| Method | Word class | Registers a… |
|---|---|---|
| `on` | verb | handler |
| `once` | adverb | handler |
| `off` | preposition | — (removes) |
| `command` | **noun** | handler |
| `text` | **noun** | handler |
| `callback` | **noun** | handler |
| `use` | verb | middleware |
| `catch` | verb | error reporter |
| `extend` | verb | plugin |

Five different word classes for one concept — "run this when that happens". `bot.command(...)`
and `bot.text(...)` read like accessors, not registrations; a developer could reasonably expect
`bot.text` to *return* the text.

Meanwhile `bot.callback(...)` is ambiguous in a language where "callback" already means "a
function you pass in". It handles callback *queries*, which is a Telegram concept, but the name
collides with the JavaScript one.

A developer cannot predict this vocabulary. Given `on`, `use` and `catch`, nothing suggests
`command` and `text` are also registrations.

---

## 9. What actually makes the reference API feel better

The instinct to compare against puregram is correct, but the reason is worth stating precisely,
because copying the surface would miss it.

```ts
const telegram = Telegram.fromToken(process.env.TOKEN!)
telegram.onMessage(message => message.send('hey!'))
await telegram.startPolling()
```

Four properties, none of which is about aesthetics:

**1. The constructor names the credential.** `fromToken` scales by adding sibling names rather
than by growing an options object.

**2. Every noun is a Telegram noun.** `Telegram`, `message`. Nothing is named after the
framework's internal machinery. The developer reasons about Telegram, and the framework
disappears.

**3. Handlers are methods, so events are discoverable and types are specific.** `onMessage`
hands back something typed for messages. No string-to-type mapping is needed.

**4. Lifecycle verbs describe the mechanism.** `startPolling` states which of several possible
modes is running.

Where the reference is beatable: `message.send('hey!')` is semantically loose — a message does
not send; something is sent *in reply to* it. And `Telegram` as a class name suggests a single
global connection, which is wrong the moment an application holds a bot and two user accounts.
Yuigram must hold three client kinds, so it needs a vocabulary the reference never had to solve.

---

## 10. What is already right

The review should not imply the current design is wholly wrong. Several decisions are sound and
should survive any redesign:

- **Service-message promotion.** A member joining arrives as `chat_member_joined`, not as a
  message the developer must branch on. This is genuinely better than the Bot API's own shape.
- **`filter` / `and` / `or` / `not`.** Composable, type-guard based, no string DSL.
- **Errors are typed and preserve Telegram's originals**, with a documented three-way contract.
- **Sessions serialize per key**, so the lost-update race cannot happen.
- **The testing harness** drives the real pipeline. Few frameworks ship this.
- **Zero runtime dependencies**, enforced by CI.

The defects are concentrated in the *shape of the client and the handler surface*. The layers
below — dispatch, filters, sessions, storage, errors — are fine and are what the redesign should
build on.

---

## 11. Summary of what must be redesigned

| # | Problem | Severity |
|---|---|---|
| 1 | One `Context` type for all events; everything optional | **Critical** — poisons every handler |
| 2 | `new Bot(token)` does not extend to three client kinds | **Critical** — blocks MTProto |
| 3 | `start()` cannot name what it does | High |
| 4 | `on('kind')` does not narrow | High — cause of #1 at the call site |
| 5 | `ctx` names a framework construct | Medium |
| 6 | Mixed vocabulary (`on`/`command`/`text`/`catch`) | Medium |
| 7 | `catch` borrowed from a different concept | Low |

Items 1 and 2 are the ones that justify a breaking change. The rest are worth fixing in the
same pass because a second breaking change costs far more than a larger first one.

---

## 12. The test this redesign must pass

> A developer who has never seen Yuigram reads the first ten lines and can tell: what kind of
> client this is, how it authenticated, what it listens to, and how it is running.

The current example fails on three of those four. `new Bot(token)` says nothing about
authentication; `start()` says nothing about the running mode; and nothing distinguishes a Bot
API client from an MTProto one, because the API cannot yet express the difference.

Proposals are in [api-proposals.md](api-proposals.md); the recommendation is in
[api-decisions.md](api-decisions.md).
