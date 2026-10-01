# API Design

The proposed public API. Every example here is Yuigram's own design, derived from the
constraints in [unified-model.md](unified-model.md) rather than copied from another
framework.

Design priorities, in order: **honesty** (the type reflects what actually works),
**predictability** (a developer or an AI assistant can guess the next call correctly),
**concision** (no ceremony that carries no information), **discoverability** (autocomplete
teaches the API).

Everything this document shows is implemented, and `pnpm check:docs` type-checks its examples
against the built packages ([testing.md](testing.md) §8 says what that does and does not show).
Where a passage records a decision rather than code, it says so. That covers the Bot API client — `Bot.fromToken`, the `on…` registrations,
per-event contexts, the bound method families, `Router`, the `f` filters, keyboards, the `media`
sources, formatting, API hooks, middleware, sessions, storage, errors, files and the testing
harness — the account client — connecting, signing in, typed events, the generated and bound
method surfaces, files, and the message, chat, dialog and member operations built on them — and
`App`, which holds several clients of either kind. [roadmap.md](roadmap.md) records what is still
planned; the rule for reading the design documents is in [README.md](README.md).

---

## 1. The client model

Three candidate models were considered.

| Model | Assessment |
|---|---|
| `new Client({ type: 'bot' })` | **Rejected.** Every member becomes conditionally typed on the discriminant. Autocomplete offers members that throw at runtime. AI assistants read types, not caveats, and would generate confidently broken code. |
| `new Client(...)` for both, distinguished by options shape | **Rejected.** Same problem, worse — the divergence is not even visible in the type name. |
| **`Bot` and `Account`, entered through named constructors** | **Adopted.** Two names, two capability sets, no conditional typing anywhere. The names carry real information: a `Bot` cannot read another user's history, an `Account` cannot answer inline queries, and both facts are compile-time truths. |

```ts
import { Account, Bot } from 'yuigram'

const bot = Bot.fromToken('123456:ABC-DEF…')
const user = Account.fromSession('./me.session', { apiId, apiHash, keys, bootstrap })
```

The credential is in the constructor's **name**, not in the shape of an options object. That
is what lets the surface grow by adding a name rather than by growing a bag:

```ts
Bot.fromToken(token)                                                  // Bot API
Account.fromSession(directory, { apiId, apiHash, keys, bootstrap })   // an account, kept on disk
Account.fromString(session, { apiId, apiHash, keys, bootstrap, storage }) // the same, from a string
```

An account needs more than its credentials because MTProto starts below HTTP. `apiId` and
`apiHash` name the application, from my.telegram.org. `keys` are Telegram's server public keys,
which an account checks a datacenter against by fingerprint — `serverKeysFromPem(text)` reads
them in the PEM form Telegram's MTProto documentation publishes. `bootstrap` is the first
address to reach, which `bootstrapAt({ dc, host, port })` builds from one published address.
Neither is compiled in: published keys and addresses change, and a value baked into a release
would be one more thing to be stale ([mtproto.md](mtproto.md) §3.4, and §8 under "Addresses and
selection").
`fromSession` keeps everything in a directory; `fromString` takes the session as a string and a
store for what an account writes while it runs, `memory()` where nothing should outlive the
process.

Each class carries the capabilities of what it is: a `Bot` has no peer resolution because the
Bot API addresses chats by identifier, and an `Account` has no `file_id` reuse because a
`file_id` is a Bot API construct. What genuinely is common is the context surface both
transports implement (§6). The type system enforces the capability matrix rather than
documenting it.

A bot can also sign in over MTProto, and that is an account: `account.signInAsBot(token)`. It is
the same identity reached through the other transport, with the account's surface — and with
whatever Telegram refuses a bot on that transport, which it reports as it would to any client.

Plain constructors stay available — `new Bot(token, options)` and `new Account(options)` — but the
factories are the documented path, because a reader of ten lines should be able to see how the
client authenticated.

### Naming

`Bot` and `Account` describe *what the client is on Telegram* and how it reaches it: a `Bot`
speaks the Bot API over HTTPS, an `Account` speaks MTProto. A developer thinks "I need my bot to
do X" and "I need my account to do Y", and the class follows. A bot signed in over MTProto is an
`Account` rather than a third class, because what it can call is MTProto's surface, not the Bot
API's.

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
import { readFileSync } from 'node:fs'
import { Account, bootstrapAt, serverKeysFromPem } from 'yuigram'

const user = Account.fromSession('./me.session', {
  apiId: Number(process.env.API_ID),
  apiHash: process.env.API_HASH!,
  keys: serverKeysFromPem(readFileSync('./telegram-keys.pem', 'utf8')),
  bootstrap: bootstrapAt({ dc: 2, host: '149.154.167.50', port: 443 }),
})

user.onMessage((message) => console.log(message.text))

await user.connect()

await user.signIn({
  phone: () => ask('Phone: '),
  code: () => ask('Code: '),
  password: () => ask('2FA password: '),
})
```

`ask` is the application's: anything that returns a promise of what a person typed. Example 03
uses `node:readline/promises`.

`connect()` establishes the MTProto connection; the sign-in steps prove which account it
belongs to. They are separate verbs because they are separate things that fail differently — a
network that is unreachable and a code that was mistyped are not the same problem.

Each step says how far it got rather than throwing at a fork in the flow, so a password is
asked for only when the account has one, and a number that has no account yet is reported
rather than mistaken for a failure. A bot proves itself in one call with `signInAsBot(token)`,
and a second device with `requestLoginToken()`, which hands back a token to display and is
asked again until it has been approved. An account resumed from a session it was already
signed in with needs none of them.

Every step goes to the datacenter the account belongs to, and follows Telegram if it says the
account lives at another — recording where it went, so the next call does not return to the one
it was just told to leave.

`signIn()` above is those steps driven from prompts, and it reaches a callback only where the
account genuinely needs one: a password is asked for only where the account has one, and an
account resumed from a session it was already signed in with reaches none of them.

Knowing that last part cannot be done locally. A stored flag outlives a session revoked from
another device, and an authorization discarded and re-obtained is a new one nobody has proved
anything to — so `signIn()` asks Telegram before it asks a person for anything.
[mtproto.md](mtproto.md) §7, under "Reaching a datacenter", names the signal: a refusal that
"says the key exists but no account is signed in against it".

It asks with `updates.getState`, which takes no arguments and changes nothing, and whose answer
is the four counters [mtproto.md](mtproto.md) §9.1 calls the client's own state — so the client
has a reason to care about the answer beyond the question being asked here. Only that one
refusal means nobody is signed in. Anything else is a different problem and is raised, because
a client that read a flood wait as "not signed in" would ask a signed-in person for their phone
number.

The steps remain public, because a flow driven by something other than a prompt — a queue, a
web form, a device that displays a token — needs them.

Signing out is `account.logOut()`, and it is a call and a clearing:

```ts
await account.logOut()
```

Telegram revokes the authorization, and what was true only because the account was signed in
goes with it — the keys, the place in the update stream, and the peers, whose access hashes
were issued to that account and mean nothing to another. The published address list stays: it
describes Telegram rather than the account. The call goes first, so a refused sign-out leaves
the store as it was. [mtproto.md](mtproto.md) §5.4 records why each of those is not a choice.

---

## 3. Multiple clients: the `App`

```ts
import {
  Account,
  type AnyEventContext,
  App,
  Bot,
  file,
  type MtprotoContext,
  type UnifiedContext,
} from 'yuigram'

const app = new App<AnyEventContext | MtprotoContext>({ storage: file('./state') })

const bot   = app.add(Bot.fromToken(process.env.BOT_TOKEN!))
const alice = app.add(Account.fromSession('./alice.session', { apiId, apiHash, keys, bootstrap }))
const bob   = app.add(Account.fromSession('./bob.session', { apiId, apiHash, keys, bootstrap }))

// Middleware shared by every client.
app.use(async (event, next) => {
  event.log.info('update', { client: event.client.name, kind: event.kind })
  await next()
})

// Cross-client handler. The type argument says the kinds registered for carry a
// message to answer, which is what every client's `message` does.
app.on<UnifiedContext>('message', async (message) => {
  if (message.text === 'ping') await message.reply('pong')
})

// Client-scoped handler — fully typed, no discriminant needed.
bot.onCallbackQuery((query) => query.answer('ok'))
alice.onMessage((message) => message.here.messages.readHistory({ max_id: 0 }))

await app.start()          // starts all clients, resolves when all are running
await app.stop()           // drains in-flight handlers, then disconnects
```

The type argument names what the clients produce. Without one, an application describes their
events as `BaseContext` — the kind, the transport, the client, a logger and the raw payload —
which is enough for middleware that logs or meters; naming the union is what lets a handler narrow
on `transport` and read what only one subsystem has (§6).

Each client keeps an independent lifecycle, session, connection state and error handling.
`app.start()` is a convenience over starting each — and the only place a general `start` verb
appears, because the `App` is the one object that knows which mechanism each client needs. A
client that fails to start does not prevent the others from running, and its failure is
reported through `app.onError`, which receives the client and the error:

```ts
app.onError(({ client, error }) => console.error(`${client.name} failed`, error))
```

Independent lifecycles remain accessible, in each client's own vocabulary:

```ts
await bob.stop()
await bob.connect()
console.log(bob.state)      // 'idle', 'starting', 'running', 'stopping' or 'failed'
```

Clients may be named for logging and lookup:

```ts
app.add(Bot.fromToken(token, { name: 'support-bot' }))
app.client('support-bot')   // the client as the application holds it, or undefined
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

There is one named registration per event kind, generated from the same taxonomy the
dispatcher indexes. That is how most people discover that a member joining has
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

An account registers the same way — `account.on(kind, handler)`, `account.on(filter, handler)`,
`account.on(kind, filter, handler)`, `once`, `off` and `onMessage` — over its own kinds, which
are MTProto's (§6).

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

`f` filters a bot's updates. An account's events have filters of their own, because they carry
different fields — a peer is a sort and a 64-bit number rather than a `Chat` with a `type`:

```ts
import { f } from 'yuigram/account-filters'

account.on(f.text(/^ping$/), (event) => event.reply('pong'))   // `text` is a string here
account.on('message', f.chat('user'), (event) => event.react('👍'))
```

Handing a bot's filter to an account is a compile error rather than a handler that never runs.
A filter written with `defineFilter` against what both share — `UnifiedContext` — is accepted by
either.

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
the same shape working for MTProto, where resolving a peer needs an access hash the client
owns.

Escalating to transport-specific capability is explicit:

```ts
app.on<MessageContext | MtprotoContext>('message', async (message) => {
  await message.reply('works on both')

  if (message.transport === 'mtproto') {
    await message.here.messages.readHistory({ max_id: 0 })
  }
})
```

`here` is the MTProto form of the second layer above: the generated surface with the peer the
update arrived from already filled in, so a method that addresses that conversation is called
without naming it. `transport` is a literal union, so the branch narrows the context to the one
the check proved. Nothing outside the branch offers a member that only one transport has.

An MTProto context carries curated actions over the peer and message the update supplied —
`reply`, `send`, `replyMedia`, `react`, `edit`, `delete`, `pin`, `unpin` and `download` — and,
on the kinds that carry one, the answer to it: `answerCallback`, `answerInline`,
`answerShipping`, `answerPrecheckout` and `decideJoin`:

```ts
await event.edit('corrected')
await event.delete()
```

Neither names the message or the conversation, because the update carried both. Whether the
message may be edited or deleted at all — whose it is, and how long ago it was sent — is
Telegram's to decide, and it refuses rather than being guessed at here.

`delete` removes the message for everyone. Which method that takes is decided by the
conversation: a channel keeps its messages under the channel rather than in the account's own
numbering, so the ordinary method would name a message somewhere else entirely. The channel
method offers no other meaning, and the Bot API's `delete` has none either, so the curated
action has no options. Removing a message from this account's own view alone is a different
operation, and is asked for by name on the client:
`account.deleteMessages(peer, ids, { revoke: false })`.

`download` fetches the file the event's message carried — a document, or a photo at the largest
size that has to be fetched — and is where an expired file reference is put right: the reference
travels with the media, expires on the datacenter's own schedule, and a refused one is answered
by asking for the message again rather than by handing the caller a protocol detail. Which photo
size that is follows the same rule the Bot API's download already applies to a size list; the
media section of [mtproto.md](mtproto.md) §11 gives the reasoning.

`forward(to)` and `copy(to)` take the one thing the update did not carry: where the message goes.
The destination is `@username` or a `PeerRef`, and it is resolved through the account that
received the update, because resolving a peer needs an access hash and the account owns them —
the context supplies the source, the client still does the resolving. `forward` shows where the
message came from; `copy` sends it again as the account's own.

---

## 7. Middleware

```ts
app.use(async (event, next) => {
  const started = performance.now()
  await next()
  event.log.debug(`handled in ${(performance.now() - started).toFixed(1)}ms`)
})

// Gated on a filter — the middleware sees the narrowed type.
app.use(when(f.chat.private, async (message, next) => {
  message.log.debug('private message', { chat: message.chat.id })
  await next()
}))

// Scoped to a client, and to a band.
bot.use(async (event, next) => {
  event.log.debug('first in this bot', { kind: event.kind })
  await next()
}, { priority: 'high' })
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

// @ts-expect-error — no session installed, so the router's requirement is unmet
Bot.fromToken('…').extend(cart)
Bot.fromToken<SessionFlavor<Cart>>('…').extend(cart)  // accepted
```

This is the answer to scale. The minimal application stays three lines, and a large one gets
modules with their own middleware and their own stated requirements, rather than every
registration accumulating on one client object in one file.

---

## 9. Sessions

```ts
import { Bot, file, type SessionFlavor, session, userChatKey } from 'yuigram'

const bot = Bot.fromToken<SessionFlavor<Cart>>(token).extend(
  session<Cart>({ storage: file('./sessions'), key: userChatKey, initial: () => ({ count: 0 }) }),
)

bot.onMessage(async (message) => {
  message.session.count++
  await message.reply(`seen ${message.session.count} messages`)
})
```

The key is required, so the scope is visible where the session is installed. `userChatKey` keeps
one session per user per chat; a key of your own reads the chat and the sender an update carries —
`key: (event) => event.sender?.id` is one session per user across chats — and may return a
`bigint`, which an account's identifiers are. `initial` produces the value for a key with nothing
stored.

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
import { App, file, type KV, memory } from 'yuigram'

new App({ storage: memory() })
new App({ storage: file('./state') })

// Any object satisfying the contract works.
const entries = new Map<string, unknown>()
const custom: KV<unknown> = {
  get:    async (k) => entries.get(k),
  set:    async (k, v) => { entries.set(k, v) },
  delete: async (k) => { entries.delete(k) },
}
```

The contract is deliberately small so that adapters are trivial to write: `get`, `set` and
`delete`, with `has`, `clear` and `keys` optional. The SQLite and Redis adapters ship as separate
packages, `@yuigram/sqlite` and `@yuigram/redis`, and never enter core's dependency tree. See
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
    event.log.error('Telegram refused a call', { code: err.code, description: err.description })
    return
  }
  throw err            // rethrow what you do not handle
})
```

Every error preserves its origin. `err.cause` holds the untouched payload, and no wrapper
discards `code`, `description` or the raw TL error. A logger takes a message and then fields,
which is what lets a structured sink keep them apart. See [architecture.md](architecture.md) §6.

---

## 12. Raw API

```ts
// Typed, generated from the committed schema.
await bot.api.sendMessage({ chat_id: 1, text: 'hi' })
await user.api.messages.sendMessage({ peer, message: 'hi', random_id: rnd() })

// Untyped, for anything newer than the installed schema.
await bot.api.call('brandNewMethod', { chat_id: 1 })
await user.api.call({ _: 'messages.brandNewMethod', peer })
```

The same surface is on every context as `event.api`, so a handler never has to reach back to
the client it was registered on for something the actions do not cover.

All four ship. The MTProto surface has a signature for every method in the committed TL schema,
grouped by the namespace TL declares each method in, with the parameter type being the
method's own request without its constructor and the result being the boxed type it returns.
There is no code per method: dispatch is one proxy that turns a property path into the TL name
it spells, so a method Telegram adds works as soon as the schema regenerates.

Field names are the schema's, unchanged: TL declares `random_id`, so that is what the type
carries. Renaming them would put a translation layer between a caller and the wire, and the
first method it did not know about would be the one that needed it.

`call()` is not deprecated by any of that, and will not be. It is what
[roadmap.md](roadmap.md) principle 7 means by `user.api` being the answer to "method X is
missing" — a method newer than the installed schema has no signature, and naming it is the
only way through.

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

const { photo, document } = message.message
if (photo !== undefined) await bot.download(photo)                         // the largest size
if (document !== undefined) await downloadToFile(bot.files, './out.pdf', document)   // to disk
const stream = await bot.downloadStream(fileId)

bot.onMessage(async (message) => {
  const carried = await message.download()                    // the file this message carries
})
```

One `media` namespace with a source per method. The `file_id` reuse path is Bot API only,
and the type reflects that — `media.id()` is not accepted by an `Account` client, because
`file_id` is a Bot API construct that does not convert without a round trip.

Downloading is free functions — `download`, `downloadStream`, `downloadToFile`, `getFileUrl` —
taking the transport explicitly, and three methods on the bot — `download(target)`,
`downloadStream(target)`, `getFileUrl(target)` — that use the transport the bot was built with,
which an application could not otherwise recover from the bot. A message context's `download()`
and `downloadStream()` fetch the file that message carries through the client it arrived on: a
document, video, audio, voice note, video note or animation as it is, a photo at its largest, a
sticker only when nothing else is there, and a refusal for a message with no file.

The methods work over the transport only. Writing to a path, and reading a local Bot API
server's files — which are paths on its disk — need a filesystem, and a bot is bundled for
workers and pages where there is none: a method that could reach one would put a Node built-in
into every bot's bundle, which `docs/runtimes.md` §3 rules out and a test holds. So those two
are the functions' alone, given the bot's transport as `bot.files`; a local-server bot's
`download` says so rather than failing somewhere less clear. Neither form takes a cancellation
signal; a download is one request for one file.

A resolved download URL **contains the bot token**, because Telegram's file endpoint requires
it. `getFileUrl` returns a credential, and it is documented as one — do not log it, and do
not hand it to a third party.

An account fetches files itself rather than through a URL, because MTProto has no HTTP in it:

```ts
const bytes = await account.download({ location, dcId, size })

await account.downloadTo({ location, dcId, size, write: (chunk, offset) => sink(chunk, offset) })
```

`location` is the `InputFileLocation` naming the file, read off whatever mentioned it — a
document or a photo on a message says which datacenter holds it and carries the reference
that names it. Ranges are asked for several at a time when the length is known, on connections
kept apart from the one ordinary calls travel on, so a large transfer does not put an
interactive call behind it. `downloadTo` receives each range in file order, so a consumer
appending to a stream keeps nothing on the side.

Where the bytes go is always the caller's decision. A filename that arrived from Telegram is
attacker-chosen — [security.md](security.md) §6 — so nothing here turns one into a path.

Sending one goes the other way:

```ts
const { file } = await account.upload({ source, name: 'report.pdf' })
```

A source is anything that can hand over a run of bytes, and says its length when it has one:

```ts
interface UploadSource {
  readonly size?: number
  read(offset: number, length: number): Promise<Uint8Array>
}
```

A source that reports a size may be read at any offset, which is what lets parts go out
together; one that does not is read in order, and takes the path Telegram reserves for a
length nobody knows yet. [api-decisions.md](api-decisions.md) Decision 13 settles why this is
one interface rather than a union of the things bytes can arrive in, and what the two lines
look like for bytes already in memory. The source stays the caller's — nothing retains it, and
it holds no reference to the account.

The result carries the reference that names the file, which is what a method taking an
`InputFile` wants. Uploads go to the account's own datacenter; unlike a download, there is no
location naming one. `name` is a hint Telegram records, never a path, and nothing here reads a
filesystem.

Turning a file into the media a message carries is four functions, and they are the same
mapping in both directions:

```ts
import { documentMedia, photoMedia, uploadedDocument, uploadedPhoto } from 'yuigram'

// Bytes this account has just sent.
const uploaded = await account.upload({ source, name: 'report.pdf' })
uploadedPhoto(uploaded)
uploadedDocument(uploaded, { mimeType: 'application/pdf', name: 'report.pdf' })

// A file that is already on Telegram, sent again without the bytes moving.
documentMedia(media.document)
photoMedia(media.photo)
```

A photo needs nothing beyond the file: the datacenter decodes the image and produces the sizes
itself. A document needs a content type, and it is required rather than guessed — deriving one
from a filename would be inventing a fact about the content, and reading the content means a
decoder this project does not have. Anything else a document could say about itself — a
duration, dimensions, a waveform — is the same problem, so those are attributes a caller
states and this passes through.

Where the media goes is a separate question with a separate answer.
`account.sendMedia(peer, media, caption?, options?)` sends it to a peer named by `@username` or
by a `PeerRef` an update carried, and `account.sendText(peer, text, options?)` does the same for
text; both resolve to the message that was sent. `account.api.messages.sendMedia` remains for
anything they do not cover — `message` is the caption there, `reply_to` the message being
answered. See [mtproto.md](mtproto.md) §11 for what each form of media requires.

What a send answers with is not the message. MTProto answers with the updates the send caused,
so `sentMessage(answer, random_id)` picks the message out of them against the number the send
was deduplicated by — `event.reply()` already returns that, with the answer itself reachable
under `raw`. It takes the answer from whichever surface produced it: a typed method hands back
the shape the schema names, `call` hands back the shape the decoder produced, and both are the
same value described to the type system twice. [mtproto.md](mtproto.md) §9.6 records the two shapes an answer takes and why the
short one can carry no message at all.

A page of dialogs is read the same way. `nextDialogs(answer)` says where the next page begins,
or nothing when there is nowhere to continue from:

```ts
const answer = await account.api.messages.getDialogs({
  offset_date: 0,
  offset_id: 0,
  offset_peer: { _: 'inputPeerEmpty' },
  limit: 100,
  hash: 0n,
})

const next = nextDialogs(answer)
if (next !== undefined) {
  await account.api.messages.getDialogs({
    offset_date: next.date,
    offset_id: next.id,
    offset_peer: await account.resolve(next.peer),
    limit: 100,
    hash: 0n,
  })
}
```

The offset names a peer by reference rather than by the argument itself, because naming a peer
needs an access hash and that is the peer table's to supply — `account.resolve()` turns it into
what the call carries.

The date it needs is on the last dialog's *message*, not on the dialog, which is the mistake
that produces an offset Telegram accepts and answers from somewhere else —
[mtproto.md](mtproto.md) §9.7. Walking them is `account.dialogs()`, an async iterator over the
account's dialogs that reads page after page, and `account.history(peer)` does the same for a
conversation's messages; `account.dialogsPage()` and `account.historyPage()` read one page at a
time, for a caller that decides how far to go.

A datacenter may hand a download to a delivery node — a machine Telegram does not operate. That
is a decision about trust rather than speed, so it is the caller's and off by default:

```ts
await account.download({ location, dcId, size, cdn: true })
```

Without it a datacenter that would rather redirect still serves the file. With it the node is
reached on connections of its own, holding an authorization negotiated with that node and
vouched for by nothing; it is asked for byte ranges and nothing else; what comes back is
decrypted and checked against the hashes published for it before a byte reaches the caller; and
`account.reach()` refuses to be pointed at a node at all. [security.md](security.md) §5 records
each of those rules and why it is this client's to enforce rather than the node's.

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

await message.reply(html`Hello, <b>${message.sender?.first_name ?? 'there'}</b>!`, { parse_mode: 'HTML' })
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

app.onError(({ client, error }) => console.error(`${client.name} failed`, error))

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
import { Bot, definePlugin, type MiddlewareHost } from 'yuigram'

export function metrics() {
  let handled = 0

  return {
    plugin: definePlugin({
      name: 'metrics',
      install(target: MiddlewareHost) {
        target.use(async (_event, next) => {
          handled++
          await next()
        })
      },
    }),
    get handled() {
      return handled
    },
  }
}

const counter = metrics()
const bot = Bot.fromToken(token).extend(counter.plugin)
counter.handled              // read from the value the application kept
```

A plugin is a name and an `install` that receives the client. It is installed on the dispatch
path, before the first update reaches a handler (§14), so whatever it returns from `install` is
not available as a property of the client — state an application reads is kept where the plugin
was made, as above. The name is what makes installing two plugins of one name an error rather
than a silent replacement, and `dependsOn` orders plugins that need each other. A plugin that adds
to every context does it with `bot.extendContext(owner, key, value)`; one that only needs
somewhere to put middleware declares `MiddlewareHost` as its target, which is what lets it install
on a `Router` as well as on a client.

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
| **One package, few entry points** | Ordinary code imports from `'yuigram'`. The optional entry points each name what they hold — `yuigram/testing`, `yuigram/webhook`, `yuigram/worker`, `yuigram/markup`, `yuigram/stream`, `yuigram/rich`, `yuigram/account-filters`, `yuigram/account-utils` — so a program loads only what it uses. |
| **Narrowing over casting** | Filters and registration narrow; `as` is never required in normal use. |
| **Discriminated escape** | `event.transport` is a literal union, so a model can branch on it correctly. |

The short-import argument for `@yui` is addressed in [naming.md](naming.md) — token savings
turn out to be negligible, and consistency matters far more to inference than brevity.

---

## 18. Complete example

```ts
import { readFileSync } from 'node:fs'
import {
  Account,
  type AnyEventContext,
  and,
  App,
  Bot,
  bootstrapAt,
  f,
  FloodError,
  file,
  type MtprotoContext,
  Router,
  type SessionFlavor,
  serverKeysFromPem,
  session,
  userChatKey,
} from 'yuigram'
import { f as account } from 'yuigram/account-filters'

interface Visits {
  count: number
}

const app = new App<AnyEventContext | MtprotoContext>({ storage: file('./state') })

const bot = app.add(
  Bot.fromToken<SessionFlavor<Visits>>(process.env.BOT_TOKEN!, { name: 'main' }).extend(
    session<Visits>({ storage: file('./sessions'), key: userChatKey, initial: () => ({ count: 0 }) }),
  ),
)

const me = app.add(
  Account.fromSession('./me.session', {
    apiId: Number(process.env.API_ID),
    apiHash: process.env.API_HASH!,
    keys: serverKeysFromPem(readFileSync('./telegram-keys.pem', 'utf8')),
    bootstrap: bootstrapAt({ dc: 2, host: '149.154.167.50', port: 443 }),
    name: 'me',
  }),
)

const fromAdmin = f.sender.id(Number(process.env.ADMIN_ID))

// Its middleware runs only for updates it handles, so this is a real gate.
const admin = new Router()
admin.use(async (event, next) => {
  if (fromAdmin(event)) await next()
})
admin.onCommand('stats', (message) => message.reply(`uptime ${process.uptime() | 0}s`))

bot.extend(admin)
bot.onCommand('start', async (message) => {
  message.session.count++
  await message.reply(`Hi! Visit ${message.session.count}. Try /stats if you are an admin.`)
})
bot.on(f.media.photo, (message) => message.react('👍'))

// The account archives any text it sees in a conversation with a user.
const privateText = and(account.chat('user'), account.text())

me.on('message', privateText, async (event) => {
  // `text` is a string here: the filter that selected this message proved it.
  await archive(event.text)
})

bot.onError((error, event) => {
  if (error instanceof FloodError) return event.log.warn(`flood wait ${error.retryAfter}s`)
  event.log.error('a handler failed', { error })
})
app.onError(({ client, error }) => console.error(`${client.name} failed`, error))

await app.start()
process.on('SIGINT', () => app.stop({ timeout: 10_000 }).then(() => process.exit(0)))
```

One package, one application object, two clients, one middleware model — and no point at which
the API claims a bot and a user account are the same thing: each is filtered by what its own
events carry, and each reports its own handler failures.
