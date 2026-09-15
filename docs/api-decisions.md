# API Decisions

The recommended direction, and the reasoning behind each decision that shapes it.

The recommendation is **not one of the three proposals unchanged**. Proposal A is the base,
because it reads best and is the most predictable, but two of its weaknesses — client surface
size and rigidity — are solved by borrowing from B and C rather than accepting them.

Each decision below is marked **Decided** and carries the reasoning that settled it.

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

## Decision 11 — Where an operation lives

**Problem.** With a hundred methods offered on a context, the line between "the context does
this" and "the client does this" stops being obvious. Drawn wrongly it produces either a
context that cannot do the ordinary thing, or one that pretends to reach peers it has never
heard of.

**Decision.** The line is what the update already addressed.

| Layer | Holds | Example |
|---|---|---|
| Context | Identifiers that arrived in the update | `message.banChatMember({ user_id })` |
| Client | Anything requiring a peer to be resolved | `bot.api.sendMessage({ chat_id, text })` |

A context never accepts a chat it was not given. Where a method genuinely takes a second peer
— forwarding, copying — the *source* is supplied and the destination stays the caller's, which
is why those methods are classified apart rather than by parameter name.

**Reasoning, and why it matters more than it looks.** On the Bot API the distinction is mild:
a `chat_id` is a number, and passing the wrong one is a logic error. On MTProto it is
structural. Addressing a peer requires an `access_hash` the client holds in its peer cache,
obtained from an earlier update or an explicit resolve that can fail, hit the network, or be
rate-limited. A peer that arrived in an update needs none of that; a peer named out of the
blue needs all of it. Putting the second on a context would mean either a context that owns a
peer cache, or one whose methods fail in ways their signatures do not admit.

Drawing the line here now means the same shape works when MTProto lands: the context binds
what the update carried, the client resolves everything else.

**What the references do.** Both, arriving from opposite directions, land on the same rule.

*puregram* generates a context class per update kind, carrying its fields as lazy getters
plus roughly 250 members — `reply`, the `replyWith*` family, `send*`, chat administration
bound to the message's chat, about 120 `hasX` predicates and a set of shape tests. Addressing
another chat is not on it: that is `tg.send(chat, text)` on the client, from a separately
generated shortcut interface. The context is broad, and every one of its methods is addressed
by what arrived.

*mtcute* splits the same rule differently. Its `Message` is pure data — 54 getters, no client
reference, no actions at all — and every operation is a client method taking the message as
its first argument: `client.replyText(message, …)`, `client.deleteMessages(…)`. Its dispatcher
then adds a `MessageContext extends Message` carrying `client` and about 25 thin delegations,
each typed as `ParametersSkip1<TelegramClient['answerText']>` so the client method stays the
single source of truth. Peer resolution is explicit and visible: `getCompleteSender()` and
`getCompleteChat()` exist precisely because an MTProto update carries *incomplete* peers.

The convergence is the finding. One framework generates a wide context, the other hand-writes
a narrow one over a wide client, and both refuse to let a message address a peer that did not
arrive with it.

**Yuigram's position.** The same rule, reached by a third route: the classification is
generated, so the surface is as wide as puregram's, and the parameter types are derived from
the client's own method surface, so there is one source of truth as in mtcute. What neither
does — and what having two transports requires — is state the rule as something a generator
enforces rather than a convention a maintainer follows.

**Status: Decided**, and implemented for the Bot API subsystem.

---

## Decision 12 — Breadth is generated as a table, not as methods

**Problem.** Evidence 3 closed the question of *whether* to wrap broadly: generated wrappers
cost nothing to maintain, so the argument for restraint disappears. It left open *how*.

**Decision.** Emit the classification, derive the signatures.

The generator emits which parameters each context supplies. The types come from `ApiMethods`
— already generated — through a mapping that makes supplied parameters optional rather than
absent. The runtime is one binder reading that table onto a prototype built once per client.

**Reasoning.** Emitting a method per entry is the obvious approach and the one the reference
takes, at 9,302 generated lines for the message surface. Both are maintenance-free; the
difference is what consumers pay. A generated `.d.ts` is re-read by every user's TypeScript
server on every keystroke, so the same surface in 7 KB rather than 358 KB is worth one layer
of type-level indirection.

It also keeps a property that matters for the second transport: the binder is transport-blind.
When TL methods arrive, the same mechanism binds `peer` from the update — a different table
and different resolvers, not a different design.

**Trade-offs.** Hovering a bound method shows a computed type rather than a written one, which
is less readable than an emitted signature. Accepted: the parameter documentation still comes
through from the generated `XParams` interface, which is where a developer actually reads it.

**Status: Decided**, and implemented.

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

Against the readability test — *can a first-time reader tell what kind of client this is,
how it authenticated, what it listens to, and how it is running?*

- **What kind of client**: `Bot` ✓
- **How it authenticated**: `fromToken` ✓
- **What it listens to**: `onCommand`, `onMessage` ✓
- **How it is running**: `poll` ✓

And `message.text` is `string`. The `?? 'Say something.'` is gone, because the framework now
uses what it was told.

---

## Decisions settled against a working reference

The three open questions were resolved by examining how a mature Bot API framework actually
answers them in shipped code, rather than by argument. Findings and what each one changes.

### Evidence 1 — Construction: both a factory and a constructor

```
constructor(input: TelegramOptions)
static fromToken(token: string, options?: Partial<TelegramOptions>)
```

A named factory for the common case, a plain constructor for full configuration. Not one or the
other.

**Applied to Yuigram:** `Bot.fromToken(token)` is the documented path; `new Bot({ … })` stays
for the case where every option is being set. `Bot.fromMtproto` and `Account.fromSession` join
the factory set, which is where Yuigram's three client kinds are expressed and where the
reference has nothing to say — it implements one transport.

**Decision 2 closed:** static factories, plus a constructor.

### Evidence 2 — Event methods are generated, not hand-written

`onMessage`, `onCallbackQuery` and the rest are declared in one generated interface and
installed at runtime by iterating the update-kind list. `on(kind, handler)` remains for kinds
outside the curated set.

This is what §2 above proposed, and it removes the objection that carried the most weight
against it: a class does not become unmaintainable through thirty event methods when none of
them is written by hand. Yuigram already generates 185 methods and 388 types from a committed
schema, so the machinery exists.

**Decision 2 (§2) confirmed**, with the surface generated rather than typed out.

### Evidence 3 — Domain wrapping goes much further than expected

The shared message object exposes **435 members** — `reply`, `send`, `edit`, `delete`,
`forward`, `pin`, `react`, roughly twenty-five `replyWith*` variants, chat administration
(`banChatMember`, `setChatTitle`, `promoteChatMember`), around 120 `hasX` predicates and a set
of `isPrivate` / `isGroup` / `isReply` shape tests. The file is generated: 9,302 lines.

**This overturns my earlier recommendation.** §6 argued for wrapping a modest set on the grounds
that every wrapper is a maintenance commitment for years. That argument assumed the wrappers
were hand-written. Generated from the same schema that already produces the method surface, the
marginal cost of the two-hundredth wrapper is zero, and the reasoning against breadth
disappears with it.

**Decision 3 closed: wrap broadly, by generation.** The hand-written core stays small —
`reply`, `edit`, `delete`, `forward`, `react`, `pin`, `chat.send` — and everything beyond it is
emitted from the schema alongside the method surface. Nothing is maintained by hand, so nothing
rots by hand.

The `hasX` predicates deserve separate thought. Yuigram's answer to "is there text here" is
event-specific context types, where `text` is `string` and the question does not arise. Where
predicates remain useful — narrowing within a message — they should be generated too, but they
are a smaller set once the context types carry their weight.

### Evidence 4 — Lifecycle keeps both the general and the specific verb

```
start()          shutdown()
startPolling()   stopPolling()
startWebhook()
```

A general verb *and* mechanism-specific ones.

**Applied to Yuigram:** keep `poll()`, `webhook()` and `connect()` as the honest names, and do
**not** add a general `start()`. The reference needs one because it has a single transport where
"start" is unambiguous; Yuigram has three client kinds where it would mean three different
things. §4 stands, and the `App` container covers starting a mixed set.

### What the reference does not answer

Its vocabulary is mixed in the same way Yuigram's is — `on`, `command`, `callbackQuery`,
`catch`, `use` — so it offers no evidence for or against §7 and §8. Those stay decided on their
own reasoning: one `on…` prefix for everything that subscribes, because predictability is worth
more than the four characters, and it is what lets the surface be guessed rather than memorised.

It also has nothing to say about the question that defines Yuigram — how Bot API and MTProto
share one framework without pretending to be the same thing. That remains Yuigram's own
problem, answered by the capability matrix in `unified-model.md` and by §10 above.

---

## The three structural questions

| Question | Answer | Basis |
|---|---|---|
| Break the API now? | **Yes** | Reasoning below; nothing in the reference argues otherwise |
| Factories or functions? | **Static factories, plus a constructor** | Evidence 1 |
| How far to wrap? | **Broadly, by generation** | Evidence 3 |

### On breaking now

`0.1.0` is newly published. The two critical defects are structural, there
are no dependents, and the cost of a breaking change is at its historic minimum — it only rises.
A compatibility shim for an API with no users is pure cost. The alternative is freezing
`ctx.text ?? ''` into every example on the front page, permanently.

---

## Positions the evidence overturned

Two of the three questions had an obvious answer that the working reference contradicted.

| Question | Obvious answer | Decision | Why it differs |
|---|---|---|---|
| A. Break the API now? | Yes | **Yes** | No difference |
| B. Factories or functions? | Static factories | **Static factories, plus a constructor** | A working reference keeps both: a factory for the common case, a constructor for full configuration |
| C. How far to wrap the domain? | Narrowly — reply, edit, delete, forward, react, pin | **Broadly, by generation** | The argument for restraint is that each wrapper is a hand-maintained commitment. Generated from the schema, that cost is zero, and the argument goes with it |

C is worth recording explicitly, because the restraint argument is sound *given its premise* and
the premise does not hold here. "Every wrapper is a liability" is true of wrappers someone has
to write and keep writing. It is not true of wrappers emitted from the same schema that already
produces the method surface, and which regenerate the day Telegram changes something.

That generalises past this one decision: several constraints that read as binding are
assumptions about what is expensive rather than facts about what is possible.
