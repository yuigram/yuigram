# API Decisions

The recommended direction, and the reasoning behind each decision that shapes it.

The recommendation is **not one of the three proposals unchanged**. Proposal A is the base,
because it reads best and is the most predictable, but two of its weaknesses — client surface
size and rigidity — are solved by borrowing from B and C rather than accepting them.

Every decision below is marked **Decided** where the reasoning is conclusive, or **Needs your
approval** where it is a genuine judgement call that changes what the framework feels like.

---

## Decision 1 — Event-specific context types

**Problem.** One `Context` serves twenty-six update kinds, so every non-universal field is
optional. `ctx.text` is `string | undefined` inside `on('message')`; `ctx.data` is
`string | undefined` inside `on('callback_query')`. Verified against the published package.

**Alternatives.**
1. Keep one context; add runtime guards (`isMessage(ctx)`) — the developer still writes the
   check, and the type only narrows inside the `if`.
2. One context with a discriminated union on `kind` — narrows correctly, but every handler
   begins with a `switch` and the union has 80 members.
3. A distinct context type per event kind, selected by the registration.

**Decision.** Option 3. `onMessage` hands back a `MessageContext` where `text` is `string`;
`onCallbackQuery` hands back a `CallbackQueryContext` where `data` is `string`.

**Reasoning.** The developer already declared the event at registration. Making them re-assert
it at runtime is the framework failing to use information it was given. This is the single
change that removes the most noise from the most code.

**Trade-offs.** More generated types (one per kind, from the schema — the generator already
knows the payload type of every update field). Slightly larger `.d.ts`.

**Long-term.** Additive: a new Telegram update kind generates a new context type. No existing
signature changes.

**Status: Decided.** This is the defect that justifies the breaking change.

---

## Decision 2 — `on()` narrows by the kind you pass

**Problem.** Named methods read well but cannot cover eighty event kinds without an eighty-method
class. A string-based `on()` covers everything but does not narrow.

**Alternatives.**
1. Only methods — enormous surface.
2. Only `on()` — loses discoverability and reads worse.
3. Both, with `on()` typed so the literal kind selects the context type.

**Decision.** Option 3:

```ts
on<K extends EventKind>(kind: K, handler: (event: ContextFor<K>) => unknown): this
```

`bot.on('chat_member_joined', (event) => …)` gets a `ChatMemberJoinedContext` — the same type
a method would have given. Methods exist for the dozen or so events used constantly
(`onMessage`, `onCommand`, `onText`, `onPhoto`, `onCallbackQuery`, `onInlineQuery`,
`onEditedMessage`, `onChannelPost`); everything else goes through `on()` without penalty.

**Reasoning.** This dissolves the trade-off that separated Proposals A and B. Discoverability
comes from the methods, coverage from `on()`, and both give identical types. The class stays
readable, and rarely-used events do not each cost a method.

**Trade-offs.** Two ways to register the same handler. Mitigated by a clear rule: *if there is a
method, use it.* Documentation shows methods; `on()` appears in the section about filters and
dynamic kinds.

**Long-term.** New Telegram events work through `on()` the day the schema regenerates, with a
method added later only if the event turns out to be common.

**Status: Decided.**

---

## Decision 3 — `Bot` and `Account`, with named constructors

**Problem.** `new Bot(token)` does not say how authentication happens and does not extend to
three client kinds.

**Alternatives.**
1. One `Client` with a `type` discriminant — rejected in `unified-model.md` §8: every member
   becomes conditionally typed, autocomplete offers methods that throw.
2. Three classes: `BotApiBot`, `MtprotoBot`, `UserAccount` — honest, but the names are
   bureaucratic and the common case pays for the rare one.
3. Two names, several named constructors, distinct return types.

**Decision.** Option 3:

```ts
Bot.fromToken(token)                          // Bot API
Bot.fromMtproto(token, { apiId, apiHash })    // MTProto bot
Account.fromSession(path, { apiId, apiHash }) // MTProto user
Account.fromString(session, { apiId, apiHash })
```

`Bot.fromToken` and `Bot.fromMtproto` return **different types** that share a common interface
for what is genuinely common. A Bot API client has no `.resolvePeer()`; an MTProto client has no
`file_id` reuse. The type system enforces the capability matrix rather than documenting it.

**Reasoning.** The name carries the credential, so the API scales by adding names instead of
growing an options bag. Two nouns — `Bot` and `Account` — match how a developer already thinks
about Telegram: there are bots, and there are accounts.

**Trade-offs.** `Bot` is a namespace of factories rather than a plain constructor, so
`new Bot(...)` stops working. Two clients that are both "bots" have different types, which can
surprise someone writing a function over both — solved by the shared interface.

**Long-term.** A fourth credential (QR sign-in, bot-token-over-MTProto variants) is a new static
method, not a new shape.

**Status: Decided.** `Account` was already settled in `naming.md`; this extends the same
reasoning to construction.

---

## Decision 4 — Lifecycle verbs name the mechanism

**Problem.** `start()` cannot honestly cover polling, webhooks, MTProto connection and
interactive sign-in.

**Alternatives.**
1. Keep `start()` with options — `start({ mode: 'webhook' })` hides the fact that matters most.
2. Distinct verbs per mechanism.

**Decision.** Option 2:

```ts
await bot.poll()                    // long polling
const handler = bot.webhook({ secret })   // returns a handler; you serve it
await account.connect()             // MTProto connection
await account.signIn({ … })         // interactive authorization
await client.stop()                 // one verb — draining is the same everywhere
```

**Reasoning.** Polling versus webhook determines deployment shape, cost and failure mode. A
developer reading ten lines should see which one is running. `webhook()` returning a handler
rather than starting a server is deliberate: Yuigram does not own your HTTP server.

**Trade-offs.** Code written against `Bot | Account` cannot start a client generically. This is
acceptable: that is the `App` container's job, and it knows how to start each kind.

**Long-term.** `stop()` staying single is what keeps shutdown uniform across every client kind.

**Status: Decided.**

---

## Decision 5 — The context is named after its event

**Problem.** `ctx` names a framework construct and models nothing.

**Alternatives.**
1. Remove context; pass the raw payload — loses `reply()`, `session`, `log`.
2. Keep `ctx` as the conventional name.
3. Type per event, named for the domain object; the parameter name is the developer's.

**Decision.** Option 3. Types are `MessageContext`, `CallbackQueryContext`,
`ChatMemberJoinedContext`. Examples and documentation name the parameter for the domain:

```ts
bot.onMessage((message) => message.reply(message.text))
bot.onCallbackQuery((query) => query.answer())
bot.onChatMemberJoined((event) => event.chat.id)   // no better domain noun exists
```

**Reasoning.** What the developer reads is the parameter name, and there it should be a Telegram
noun. What the developer hovers is the type, and there precision matters more than warmth —
`MessageContext` says exactly what it is, including that it carries framework additions.
`Context` is kept as the base name so extension via type parameters continues to work.

**Trade-offs.** Some events have no natural domain noun and fall back to `event`. Accepted:
forcing a noun where none exists is worse than admitting it.

**Status: Decided.**

---

## Decision 6 — Sending lives on the object it concerns

**Problem.** `ctx.reply(...)` frames the framework as the actor. Reference APIs use
`message.send(...)`, which is semantically loose — a message does not send.

**Alternatives.**
1. `ctx.reply(text)` — current.
2. `message.send(text)` — reads well, but says the wrong thing.
3. `message.reply(text)` for replies; `chat.send(text)` for un-quoted sends.

**Decision.** Option 3. The verb matches the operation, and the receiver matches the target:

```ts
message.reply('quoting you')        // reply_to_message_id set
message.chat.send('just talking')   // no quote
message.edit('new text')
message.delete()
message.forward(toChat)
message.react('👍')
```

**Reasoning.** Two distinct Telegram operations get two names instead of one name and a flag.
`message.reply` and `message.chat.send` make the difference visible at the call site, which is
where a developer notices they replied when they meant to send.

**Trade-offs.** `message.chat.send` is longer than `ctx.reply`. That is the point — the shorter
name goes to the more specific operation, which is also the more common one.

**Status: Decided.**

---

## Decision 7 — `onError`, not `catch`

**Problem.** `catch` is borrowed from `try/catch`, where it means something else, and it is the
only subscription not named `on…`.

**Decision.** `bot.onError((error, event) => …)`, with the three-way contract from
`middleware.md` §7 unchanged.

**Reasoning.** One vocabulary: everything that subscribes begins with `on`. The behaviour was
already right; only the name was imported from a different concept.

**Status: Decided.**

---

## Decision 8 — Registration vocabulary is uniform

**Problem.** `on`, `once`, `off`, `command`, `text`, `callback`, `use`, `catch`, `extend` — five
word classes for one concept.

**Decision.**

| Purpose | Name |
|---|---|
| Subscribe | `on…` — `onMessage`, `onCommand`, `onError`, or `on(kind, …)` |
| Subscribe once | `once(kind, …)` |
| Unsubscribe | `off(handler)` |
| Middleware | `use(middleware)` |
| Plugin | `extend(plugin)` |

`bot.command(...)` becomes `bot.onCommand(...)`; `bot.text(...)` becomes `bot.onText(...)`;
`bot.callback(...)` becomes `bot.onCallbackQuery(...)` — which also removes the collision with
JavaScript's own meaning of "callback".

**Reasoning.** A developer who has seen `onMessage` can guess `onCommand` and `onEditedMessage`.
That predictability is worth more than the four characters `on` costs, and it is what lets an
AI assistant infer the surface correctly.

**Status: Decided.**

---

## Decision 9 — Scale through `Router`, not through more client methods

**Problem.** Proposal C's composability advantage is real: at several hundred handlers,
mutation-registration on one client object becomes a single-file bottleneck.

**Decision.** Adopt A's ergonomics for the client and take C's composability through a
`Router` that carries the same surface:

```ts
// features/support.ts
export const support = new Router()
support.onCommand('help', (message) => message.reply('…'))
support.use(rateLimit())          // middleware scoped to this router only

// index.ts
bot.extend(support)
```

**Reasoning.** The minimal application stays three lines, and large applications get real
modules with their own middleware. `Router` was already planned in `naming.md`; this makes it
the answer to scale rather than an extra.

**Trade-offs.** Not as tree-shakeable as C. Accepted: a Telegram bot is a long-running server
process, where bundle size is close to irrelevant.

**Status: Decided.**

---

## Decision 10 — What unifies across transports

**Problem.** Deciding this wrongly produces the fake abstraction `unified-model.md` forbids.

**Decision.** Follow the capability matrix exactly. Shared, on every client:

`onMessage` · `onEditedMessage` · `use` · `extend` · `onError` · `stop` · sessions · storage ·
filters · logging · `message.reply` · `message.edit` · `message.delete` · `chat.send`

Transport-specific, and typed so it cannot be called on the wrong client:

| Bot API only | MTProto only |
|---|---|
| `onInlineQuery` (answering) | `signIn`, `exportSession` |
| `answerCallbackQuery` | `resolvePeer`, access hashes |
| `file_id` reuse | chunked upload/download over 50 MB |
| `webhook()` | `connect()`, DC migration |

**Reasoning.** Where a capability genuinely exists on both, one name. Where it does not, the
type system says so, rather than a method existing and throwing.

**Status: Decided.**

---

## The recommended minimal application

```ts
import { Bot } from 'yuigram'

const bot = Bot.fromToken(process.env.BOT_TOKEN!)

bot.onCommand('start', (message) => message.reply('Hello.'))
bot.onMessage((message) => message.reply(`You said: ${message.text}`))
bot.onError((error, event) => event.log.error('handler failed', { error }))

await bot.poll()
```

Against the test from the review — *can a first-time reader tell what kind of client this is,
how it authenticated, what it listens to, and how it is running?*

- **What kind of client**: `Bot` ✓
- **How it authenticated**: `fromToken` ✓
- **What it listens to**: `onCommand`, `onMessage` ✓
- **How it is running**: `poll` ✓

And `message.text` is `string`. The `?? 'Say something.'` is gone, because the framework now
uses what it was told.

---

## Needs your approval

Everything above follows from the review. These three are genuine judgement calls where I have
a recommendation but the decision changes how the framework feels, so I would rather you choose.

### A. Is this worth a breaking change now?

`0.1.0` was published today. This redesign is `0.2.0` with no compatibility layer.

**My recommendation: yes, and immediately.** The two critical defects are structural, the
package is hours old, and the cost of a breaking change is at its historic minimum — it only
ever rises. A compatibility shim for an API with no users is pure cost.

The alternative is freezing the current surface and living with `ctx.text ?? ''` permanently.

### B. `Bot.fromToken()` — static factories, or plain functions?

```ts
Bot.fromToken(token)     // recommended
bot.fromToken(token)     // lowercase namespace
createBot(token)         // free function
```

**My recommendation: static factories on a capitalised class.** It groups the constructors
under the noun they build, reads as a sentence, and keeps `Bot` usable as a type.

### C. How far do the domain methods go?

`message.reply()` is clearly right. The open question is how much of the Bot API gets wrapped
this way — `message.react()`, `message.pin()`, `message.forward()`, `chat.ban(user)` — versus
left to `bot.api.*`.

**My recommendation: wrap what is common and unambiguous** (reply, edit, delete, forward,
react, pin), leave everything else to the raw API, and expand only on evidence of use. An
over-wrapped API ages badly; an under-wrapped one is merely verbose in rare cases.

---

## What happens after approval

Nothing is implemented yet, and nothing should be until A is answered. If you approve, the
sequence is:

1. Freeze this API on paper — worked examples for all three client kinds
2. Type-level prototype: context types and `on()` narrowing, compiled but not wired
3. Rewrite `Bot` against it; keep dispatch, filters, sessions, storage and errors as they are
4. Regenerate context types from the schema
5. Update examples, README and docs
6. Publish `0.2.0` with a migration note

Steps 1 and 2 are where the design is genuinely validated — if the types do not come out clean,
the API is wrong and it is cheap to find out there.
