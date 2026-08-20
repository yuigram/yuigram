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
import { session, file } from 'yuigram'

const bot = new Bot(token).extend(
  session({
    storage: file('./sessions'),
    key: (ctx) => ctx.sender?.id,
    ttl: 60 * 60 * 24 * 7,
    initial: () => ({ count: 0 })
  })
)

bot.on('message', async (ctx) => {
  ctx.session.count++
  await ctx.reply(`message ${ctx.session.count}`)
})
```

### Typing

An application names its own state type and intersects the plugin's **flavour** into the
context it hands the client:

```ts
import { Bot, type Context, type SessionFlavor } from 'yuigram'

interface Cart {
  count: number
  items?: CartItem[]
}

type MyContext = Context & SessionFlavor<Cart>

const bot = new Bot<MyContext>(token)

bot.use(createSession<MyContext, Cart>({ storage: memory(), key: userChatKey, initial: () => ({ count: 0 }) }))
```

`createSession` constrains the context to carry the flavour, so installing it on a client
whose context does not declare one is a compile error rather than an `undefined` at runtime.

#### Why not declaration merging

Merging a shared `SessionData` interface is terser, and it was the first design here. It was
replaced after two problems showed up in practice — neither visible until you have more than
one bot or more than one package:

| Problem | Consequence |
|---|---|
| Augmentation is process-global | One session shape per program. Two bots in one repository cannot remember different things, and neither can two tenants in one process. |
| It cannot cross a façade | The interface would live in `@yuigram/core`, but applications install `yuigram`. `declare module 'yuigram'` creates a *new* interface rather than merging — it compiles and silently does nothing — and the form that works names an internal package users are promised they never need to know. |

A flavour also states something merging cannot: `ctx.session` exists exactly where the
middleware providing it is installed, rather than on every context in the program because some
file imported the plugin.

This is the one place Yuigram deliberately diverges from puregram, which merges `SessionData`
from `@puregram/session` and generates an augmentation per update kind. That works there
because the plugin is the package users install directly; Yuigram ships one façade, so the
same approach would put an internal package name in every application's source.

### Keying

The key function decides scope, and getting it wrong is the most common session bug:

```ts
key: (ctx) => ctx.sender?.id                          // per user, across all chats
key: (ctx) => ctx.chat?.id                            // per chat, shared by members
key: (ctx) => `${ctx.chat?.id}:${ctx.sender?.id}`     // per user per chat  ← usual default
key: (ctx) => `${ctx.chat?.id}:${ctx.threadId}`       // per forum topic
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
bot.command('order', async (ctx) => {
  const size  = await ctx.ask('What size?', f.text(/^(S|M|L)$/))
  const count = await ctx.ask('How many?',  f.text(/^\d+$/))
  await ctx.reply(`${count} × ${size}`)
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
const user = new User({
  apiId, apiHash,
  session: './me.session'                 // path — file-backed
})

const user2 = new User({
  apiId, apiHash,
  session: sqlite('./sessions.db', 'alice')  // driver instance
})
```

Export and import for deployment, where writing a file is not an option:

```ts
const serialized = await user.exportSession()   // opaque, secret-bearing string
const user = new User({ apiId, apiHash, session: fromString(process.env.SESSION!) })
```

`exportSession()` returns an opaque string carrying live credentials. The documentation must
be blunt: **this string is equivalent to being logged in**. It is not a configuration value,
it does not belong in a repository, and it should not be pasted into a chat for debugging.
See [security.md](security.md) §3.

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

Each `User` owns an independent session; nothing is shared:

```ts
const alice = app.add(new User({ apiId, apiHash, session: './alice.session' }))
const bob   = app.add(new User({ apiId, apiHash, session: './bob.session' }))
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
new User({ apiId, apiHash, storage })
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
