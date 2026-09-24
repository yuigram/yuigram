# Sessions

Two things share this word and must not share an abstraction.

| | Framework session | Authorization session |
|---|---|---|
| **What** | Application state per user, chat or conversation | Telegram credentials and protocol state |
| **Who needs it** | Optional, both client types | Mandatory, MTProto only |
| **Contents** | Whatever the application puts there | Auth keys, salts, DC state, peer cache, update counters |
| **Sensitivity** | Ordinary application data | **Equivalent to a logged-in account** |
| **If lost** | A conversation forgets its place | Full re-authentication; peers unaddressable |
| **If leaked** | Application-specific harm | **Complete account takeover** |
| **Shape** | Key-value | Structured, indexed, multi-table |
| **Lifecycle** | Application-defined, often TTL'd | As long as the account stays signed in |

The sensitivity row is why these are separate abstractions rather than one with a flag.
Putting an auth key in the same store as a shopping cart invites a deployment where the
shopping-cart store is a shared Redis with a permissive ACL.

---

## 2. Framework sessions

### Model

```ts
import { Bot, file, type SessionFlavor, session } from 'yuigram'

interface Cart {
  count: number
}

const bot = Bot.fromToken<SessionFlavor<Cart>>(token).extend(
  session<Cart>({
    storage: file('./sessions'),
    key: (event) => event.sender?.id,
    ttl: 60 * 60 * 24 * 7,
    initial: () => ({ count: 0 })
  })
)

bot.onMessage(async (message) => {
  message.session.count++
  await message.reply(`message ${message.session.count}`)
})
```

`message.session.count++` changes the session in place, and that is enough: the value is
tracked, so a change anywhere inside it — including a nested array pushed into — marks the
session dirty and writes it back when the handler finishes. A session that was only read is
never written, so read-only traffic does not hammer the store.

### Typing

An application names its own state type and hands the plugin's **flavour** to the client as
its type parameter:

```ts
import { Bot, memory, type SessionFlavor, session, userChatKey } from 'yuigram'

interface Cart {
  count: number
  items?: CartItem[]
}

const bot = Bot.fromToken<SessionFlavor<Cart>>(token).extend(
  session<Cart>({ storage: memory(), key: userChatKey, initial: () => ({ count: 0 }) })
)
```

The client's type parameter is what plugins add, not the whole context: the base context
varies by event, so there is no single type for an application to name and extend.

The value type is named once. `createSession` — which the plugin wraps — takes the context
type as well, and is what to reach for when that type needs stating: middleware generic over
the client, or two sessions installed under different properties. For the ordinary case the
second type argument never caught a mistake, it only produced one to debug.

#### Why not declaration merging

Merging a shared `SessionData` interface is terser, and it was the first design here. It was
replaced after two problems showed up in practice — neither visible until you have more than
one bot or more than one package:

| Problem | Consequence |
|---|---|
| Augmentation is process-global | One session shape per program. Two bots in one repository cannot remember different things, and neither can two tenants in one process. |
| It cannot cross a façade | The interface would live in `@yuigram/core`, but applications install `yuigram`. `declare module 'yuigram'` creates a *new* interface rather than merging — it compiles and silently does nothing — and the form that works names an internal package users are promised they never need to know. |

A flavour also states something merging cannot: `session` exists exactly where the
middleware providing it is installed, rather than on every context in the program because some
file imported the plugin.

This is the one place Yuigram deliberately diverges from puregram, which merges `SessionData`
from `@puregram/session` and generates an augmentation per update kind. That works there
because the plugin is the package users install directly; Yuigram ships one façade, so the
same approach would put an internal package name in every application's source.

### Keying

The key function decides scope, and getting it wrong is the most common session bug:

```ts
key: (e) => e.sender?.id                              // per user, across all chats
key: (e) => e.chat?.id                                // per chat, shared by members
key: (e) => `${e.chat?.id}:${e.sender?.id}`           // per user per chat  ← usual default
key: (e) => `${e.chat?.id}:${e.message?.message_thread_id}`  // per forum topic
```

The default is per-user-per-chat, because a user's state in a group is rarely the state they
want in a DM, and the reverse mistake leaks one conversation's context into another.

Returning `undefined` skips session loading entirely — correct for updates with no
meaningful subject, such as channel posts.

### Persistence

Sessions load lazily on first access and flush after the handler completes, with dirty
tracking so an untouched session costs no write. `lazy: false` forces eager loading where a
middleware needs the data before the handler runs.

Concurrent updates for the same key are serialized while the session is held, which prevents
the classic lost-update race where two rapid messages both read `count: 0`.

### Conversations

A conversation is a session with a resumable position, built on the same storage:

```ts
bot.onCommand('order', async (message) => {
  const size  = await message.ask('What size?', f.text(/^(S|M|L)$/))
  const count = await message.ask('How many?',  f.text(/^\d+$/))
  await message.reply(`${count} × ${size}`)
})
```

`ask` registers a one-shot waiter keyed like the session, suspends the handler, and resumes
when a matching update arrives. Waiters carry a TTL so an abandoned conversation does not
accumulate state forever.

**Constraint worth stating:** a suspended conversation survives a process restart only if the
storage is persistent and the resume point is serializable. Yuigram persists the waiter
descriptor (kind, filter name, expiry), not the closure. Anything requiring a live closure is
memory-only, and the documentation must say so rather than letting people discover it in
production.

---

## 3. Authorization sessions (MTProto)

### Contents

```
auth keys        permanent, per DC (256 bytes each)
temp auth keys   per DC, indexed, with expiry (PFS)
server salts     per DC, rotating
DC options       address list, refetched from config
current user     id, self/bot flags
peer cache       (id, access_hash, type, username) — indexed, unbounded growth
update state     pts, qts, seq, date, per-channel pts
```

### API

```ts
const user = Account.fromSession('./me.session', { apiId, apiHash })

// A driver instance, where a file is not the right store.
const user2 = Account.fromSession(sqlite('./sessions.db', 'alice'), { apiId, apiHash })
```

Export and import for deployment, where writing a file is not an option:

```ts
const serialized = await user.exportSession()   // opaque, secret-bearing string
const user = Account.fromString(process.env.SESSION!, { apiId, apiHash })
```

`exportSession()` returns an opaque string carrying live credentials. The documentation must
be blunt: **this string is equivalent to being logged in**. It is not a configuration value,
it does not belong in a repository, and it should not be pasted into a chat for debugging.
See [security.md](security.md) §3.

### The portable format

259 bytes, then standard base64 — a canonical string of exactly 348 characters:

```
offset  size  field
──────────────────────────────────────────────────────
0       1     version    0x01
1       1     flags      bit 0 = test network; 1-7 reserved
2       1     dcId       1..255
3     256     authKey
──────────────────────────────────────────────────────
```

It carries one datacenter's long-lived key and enough to place it: which datacenter the key
belongs to, and which network that datacenter is on. Everything else is left out because it
is obtained again rather than carried — a key with a lifetime is negotiated on connecting, a
salt is named by the server on the first message that lacks one, addresses are supplied to the
account and republished by the server, and the peers and the update sequence are caches of
what the network already knows. `apiId` and `apiHash` stay outside it: they belong to the
application rather than to the account, and are passed alongside.

Encoding is standard base64 with mandatory padding, and decoding is strict — the alphabet, the
padding and the unused bits of the final character are all checked, so one session has exactly
one string. A string that is not exactly one is refused with `SessionError`, naming what was
wrong without repeating what it read.

**There is no checksum, and no encryption.** A session damaged in a way that survives decoding
is refused by the datacenter, which is where a revoked one is refused too. Nothing in the
format authenticates it: whoever holds the string is the account.

Only version `0x01` is read. A later version is refused rather than guessed at, so a session
written by a newer build fails where it is passed instead of somewhere further in.

```ts
const me = Account.fromString(process.env.SESSION!, {
  apiId,
  apiHash,
  keys,
  bootstrap,
  storage: memory(),
})
```

A store is supplied rather than made for you. An account needs one to run at all, not merely
to survive a restart — a key with a lifetime, the peers it learns and the addresses it is told
are all written while it works. `memory()` is what to pass when there is nowhere to write; the
string is then the only thing that has to survive, which is the point of having one.

Importing is authoritative: any authorization already in the supplied store for a datacenter
this account could reach is cleared before the imported key is installed, so an account built
from one session can never end up using a key left behind by another.

The first connection after an import negotiates a key with a lifetime and has the imported key
vouch for it; the long-lived exchange is skipped because that is what the string carried.

### Encryption at rest

```ts
session: file('./me.session', { encrypt: process.env.SESSION_KEY })
```

Optional, off by default, because a mandatory passphrase makes headless deployment painful
and most users would end up storing the key next to the session anyway. When enabled:
AES-256-GCM with a key derived via scrypt, authenticated so tampering is detected rather than
producing confusing protocol errors.

Regardless of encryption, the file driver creates session files with mode `0600` and warns if
it finds permissions wider than that.

### Multiple accounts

Each `Account` owns an independent session; nothing is shared:

```ts
const alice = app.add(Account.fromSession('./alice.session', { apiId, apiHash }))
const bob   = app.add(Account.fromSession('./bob.session', { apiId, apiHash }))
```

`apiId`/`apiHash` are per-*developer*, not per-account, so they are legitimately shared across
clients. Session state never is — sharing a session file between two running clients corrupts
both, and the file driver takes an exclusive lock to make that failure loud rather than
mysterious.

---

## 4. Why not one abstraction

The tempting simplification:

```ts
// Rejected.
const storage = redis(…)
new App({ storage })
Account.fromSession(storage, { apiId, apiHash })
```

It fails on four counts:

1. **Shape.** Framework sessions are key-value. The peer cache needs indexed lookup by id and
   by username, with range scans. A KV interface forces peers into a serialized blob that must
   be fully rewritten on every update — unusable for an account with tens of thousands of peers.
2. **Sensitivity.** Auth keys and shopping carts have different threat models and belong under
   different access controls. One interface encourages one store.
3. **Lifecycle.** Framework sessions expire; auth keys must not. A shared TTL mechanism would
   eventually sign someone out.
4. **Failure semantics.** Losing a framework session is a minor annoyance. Losing an auth key
   requires human re-authentication with an SMS code — it cannot be recovered automatically,
   and the framework must treat it as a fatal, loud condition rather than a cache miss.

They may share a *driver* — the same SQLite file, the same Redis instance — but through
different contracts. That is the layering in [storage.md](storage.md).

---

## 5. Failure handling

| Failure | Response |
|---|---|
| Framework session unreadable | Log a warning, start from `initial()`, continue |
| Framework storage unavailable | Degrade to memory, log an error, keep serving |
| Auth session file missing | Treat as first run, begin sign-in |
| Auth session corrupt | **Fail loudly.** Never silently re-authenticate — that turns a storage bug into an unexplained SMS to the user's phone |
| Auth session rejected by Telegram (`AUTH_KEY_UNREGISTERED`) | Raise `SessionError`, stop the client, require explicit re-sign-in |
| Peer cache corrupt | Rebuild — it is a cache; log the fact and continue |
| Two clients on one session file | Refuse to start the second, with an explicit error |

The asymmetry is the point: framework state degrades gracefully because it can, and
authorization state fails loudly because a silent recovery path would be indistinguishable
from an attack.

---

## 6. Conversation state

A third kind, above framework sessions and distinct from them: where a
conversation *is*, rather than what is known about a person. `conversation()`
covers scenes, prompts and the waiting that both rest on.

### 6.1 Identity

The key names the client first, then whichever parts of the update the scope
asks for:

```
bot:c:-100123:u:456        chat+user, the default
bot:c:-100123              chat — everybody shares one conversation
bot:u:456                  user — one conversation wherever they are
bot:c:-100123:u:456:t:7    chat+user+topic — per forum topic
```

Naming the client first is what keeps an application holding a bot and three
accounts from having them advance each other's forms. An update the scope
cannot be derived from — an inline query, a channel post with no sender — has
no conversation, and reaches the ordinary handlers untouched.

### 6.2 Concurrency

Updates for one conversation are serialised; different conversations run in
parallel. Without it, two answers arriving together both read the same position
and the second write loses the first — a form that advances one step for two
answers. The lock is per key and each key is dropped as it drains, so a bot
serving a thousand conversations does not process them one at a time because
two of them might collide.

A handler that awaits `conversation.wait(...)` hands its turn back while it
waits — the answer belongs to the same conversation and could not get in
otherwise — and takes it again, behind whatever arrived meanwhile, before it
carries on. Its continuation never runs alongside a later update.

The lock is in the process. Two processes sharing one store are not coordinated:
the storage contract has no compare-and-set, and nothing here claims otherwise.
Run one process per conversation, or route each conversation to one process.

### 6.3 What survives a restart, and what does not

| | Where it lives | Survives a restart |
|---|---|---|
| Scene position and state | The `KV` given to the plugin | **Yes**, if the store does |
| A flow's journal and the wait it is at | The `KV` given to `flows` | **Yes**, if the store does |
| `conversation.wait(...)` | A suspended function in memory | **No** |

This is the one thing to know before choosing between them. A form built from
scene steps resumes after a deployment because the only thing kept is a name, a
number and plain data. A flow resumes for the same reason: what it keeps is a
journal of plain data, not the function. A form built from
`await conversation.wait(...)` reads like a flow and does not survive: the
promise goes with the process. All three ship because each is useful, and none
is described as another.

### 6.4 Scenes

Entering runs the scene's entry handler and its first step against the update
that entered. A step that neither navigates nor leaves is waiting for another
update, which is the ordinary case for a question — `fresh` is what tells the
step whether to ask or to read an answer.

`beforeStep` runs before every step and *replaces* it when it navigates or
leaves, which is what makes it the place to handle `/cancel`. `afterStep` runs
only for a step that stayed. Moving past the last step leaves the scene, because
that is how a form ends. Leaving always runs the exit handler before any
successor's entry handler, including when a scene is entered from outside one.

### 6.5 Waiting

A waiter belongs to one conversation, so a pending prompt never consumes another
person's message. It may validate a match and keep waiting, time out — raising
or answering nothing, as asked — and be cancelled by a signal. A non-matching
update reaches the handlers unless the waiter asked to be exclusive.

One waiter per conversation: a second replaces the first, and the first is told
so rather than left to never resolve. Entering or leaving a scene cancels an
open waiter. Stopping the client does not: nothing tells a plugin that its
client stopped, so an application calls `controls.cancelAll()` when it stops,
and a handler still waiting then learns why.

### 6.6 Flows

A flow is a conversation written as one function, which survives a restart:

```ts
const order = defineFlow<Step, undefined, Order>({
  name: 'order',
  version: 1,
  async run(flow) {
    const drink = await flow.ask('drink', (m) => m.reply('What would you like?'), typed)
    const number = await flow.effect('place', () => placeOrder(drink))
    await flow.effect('confirm', () => flow.context.reply(`Order #${number}.`).then(() => null))

    return { drink, number }
  },
})

bot.onCommand('order', (message) => message.conversation.start(order))
```

**What is stored.** Nothing about the function. A run is a record of plain
data: its identity, the flow's name and version, the conversation key and where
it was started, the input, a journal of what each step produced, the wait it is
suspended at — its label, deadline and how many answers it rejected — the update
that started it, and how it ended. The store is the one given to `flows`, and a
file store keeps it as JSON.

**Resuming is replaying.** When an update arrives for a conversation whose flow
is waiting — in this process or a new one, with the definitions registered again
under the same names — the function runs again from the top. Every step already
in the journal returns what it returned the first time without doing anything;
the wait it was suspended at is offered the update; from there it runs for real
until it waits again or ends. Two rules follow, and they are the price of
writing a durable conversation as one function:

- **Take the same path given the same journal.** Decide on what steps
  returned, not on `flow.context`, which is whatever update is driving this
  resume.
- **Reach outside only through `flow.effect`.** Code between steps runs again
  on every resume. A message, a write, the clock and a random number are
  effects, and their results are recorded.

**What happens to the run that stopped.** A pass that reaches a wait it cannot
answer stops there by awaiting a promise created with no way to settle it — not
by throwing, so a `catch` around a wait's timeout cannot catch the stop and carry
on. Nothing can ever resume that frame: the next update, deadline or cancellation
starts a new pass from the top, and the abandoned one, referred to by nothing,
is collected. A test resumes one run two hundred times and forces a collection
with at most one of the abandoned frames left; another checks that no pass which
stopped at a wait ever gets past it later — through rejected answers, the
answer, a cancellation and a shutdown — and that the one effect after the wait
ran once. A run holds at most one deadline timer in a process, re-armed as the
wait is reached again, and none once it has ended or the process has shut down.

A definition that changes its steps changes its `version`. A run started under
a version the definition does not `accept` is left as it is and reported. A
change that slipped through without a new version is caught when the replay
meets a different step than the journal recorded — or ends before reaching the
one the run was waiting at — and is reported without anything being written.

**What an effect promises.** The flow records that an effect started before it
runs and records its result after. A stop between the two leaves an outcome
nobody can know:

| The run stopped | On resume |
|---|---|
| Before the effect started | It runs, once |
| After it started, before it finished | `EffectUncertainError` at that step — or, with `repeat: true`, it runs again |
| After it finished, before its result was written | The same: from the store, this cannot be told apart from the row above |
| After its result was written | Its result is returned; it does not run |

An effect is handed `once.key`, stable for that step of that run across attempts
and restarts, and `once.id`, a 64-bit number derived from it — the shape of an
MTProto send's `random_id`, which is how Telegram recognises a message sent
again. Nothing here makes a Telegram call exactly-once: it is at-most-once by
default, and at-least-once where an effect says repeating is safe.

**Waiting and ending.**

| What happens | What the flow sees |
|---|---|
| The answer arrives | The wait returns what `transform` made of it |
| An answer is rejected by `validate` | Nothing: `onInvalid` is told, the attempt is counted, the wait stays |
| An update that is not the answer | Nothing; the update reaches the handlers unless the wait is `exclusive` |
| The deadline passes while this process runs | `WaitTimeoutError` at the wait, with no update: `flow.context` throws and `flow.address` names the chat |
| The deadline passed while nothing ran | The same, on the next update in the conversation — which then reaches the handlers, since it was not an answer — or at startup through `controls.flows.resume()` |
| `cancelFlow()`, `controls.flows.cancel()`, entering a scene, a reset, or another flow started | `WaitCancelledError` at the wait, so cleanup can run as effects; the run ends cancelled |
| The same update delivered twice | Nothing: it is recognised by its update number, or by its message number and kind, and not used again |
| The function throws | The run ends failed with the error kept; the error goes where a handler's would, or to `onProblem` when a deadline was driving it |
| The client stops or the process exits | Nothing. The run stays as stored; `controls.flows.shutdown()` stops this process acting on deadlines, and the next process's `resume()` picks them up |

Stopping and cancelling are different on purpose. A deployment is not a reason
to tell somebody their order was abandoned.

**Concurrency** is §6.2's: updates for one conversation are handled one at a
time in one process, so two answers arriving together cannot both advance one
wait; two processes over one store are not coordinated.

A flow is a bounded conversation — a run may take a thousand steps by default —
and the journal is replayed on every resume. A conversation that loops for ever
belongs in a scene.

### 6.7 What it is not

Conversation state is not authorization state, and the separation in §4 applies
to it unchanged: a scene's position is application data that degrades
gracefully, and nothing here touches the credentials in §3.

Typed callback data is not authorization either. `unpack` says the data belongs
to a schema; anybody who can see a button can press it, and anybody who has
pressed one can send its data again. The query carries who pressed it, and
whether they may is the application's question.
