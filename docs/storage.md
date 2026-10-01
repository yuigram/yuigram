# Storage

The storage abstraction, its layering, and the reason core carries no database dependency.

---

## 1. Principles

1. **Core depends on nothing.** Memory and filesystem drivers use only Node built-ins. Redis,
   SQLite and Postgres adapters are separate packages. Installing Yuigram never compiles a
   native module.
2. **Small contracts.** A KV adapter should be implementable in twenty lines, because most
   users will eventually want to write one against whatever database they already run.
3. **Two contracts, not one.** Framework sessions and MTProto authorization state have
   genuinely different shapes; see [sessions.md](sessions.md) §4.
4. **Async throughout.** Even the memory driver returns promises, so swapping a driver never
   changes calling code.

---

## 2. The KV contract

Serves framework sessions, plugin state, caches — everything except MTProto authorization
state.

```ts
interface KV<V = unknown> {
  get    (key: string): Promise<V | undefined>
  set    (key: string, value: V, opts?: { ttl?: number }): Promise<void>
  delete (key: string): Promise<void>
  has?   (key: string): Promise<boolean>
  clear? (prefix?: string): Promise<void>
  keys?  (prefix?: string): AsyncIterable<string>
}
```

Four required methods; the rest optional with framework-provided fallbacks. `ttl` is in
seconds, and a driver that cannot express TTL natively may implement it with a stored expiry
and lazy eviction — the framework detects which by feature-probing the driver.

### Shipped drivers

| Driver | Package | Persistence | Use |
|---|---|---|---|
| `memory()` | core | none | Development, tests, ephemeral state |
| `file(dir)` | core | JSON per key | Small deployments, single process |
| `sqliteStore(db)` | `@yuigram/sqlite` | single file | Single-host production, several processes on one file |
| `redisStore(client)` | `@yuigram/redis` | external | Multi-process, horizontal scale |
| — | — | external | Existing Postgres/MySQL: an adapter is four methods against the application's own client |

The SQLite and Redis packages take a connection the application opens — `node:sqlite`,
`better-sqlite3` or `bun:sqlite`; `ioredis` or `redis` — so neither installs a driver, and core
depends on neither. Each also provides an atomic counter for a limiter shared between processes;
see [Rate limits across processes](#rate-limits-across-processes).

`memory()` supports an LRU bound so a long-running process cannot leak indefinitely:

```ts
memory({ max: 10_000 })
```

`file()` is deliberately unsophisticated — atomic write via temp-file rename, one file per
key, keys hashed for filesystem safety. It exists so that "persist my sessions" needs no
infrastructure, not to be a database. The documentation says so, and points at SQLite past a
few thousand keys.

### Writing an adapter

```ts
import type { KV } from 'yuigram'

export const myStore = (client: MyClient): KV => ({
  async get (key)          { return client.fetch(key) ?? undefined },
  async set (key, v, opts) { await client.put(key, v, opts?.ttl) },
  async delete (key)       { await client.remove(key) }
})
```

That is the whole contract, and it is why Redis and SQL adapters are deliberately **not**
shipped: an adapter is written against the client an application already configures, and
shipping one would mean owning a driver dependency, a connection lifecycle and a version
matrix on its behalf. `namespaced()` and `tiered()` compose whatever is written this way, and
`file()` covers durability without a service.

A conformance suite for third-party adapters — TTL expiry, concurrent writes, key isolation —
is planned rather than shipped.

---

### Rate limits across processes

A limiter given a plain store reads a count and writes it back. Within one process it serializes
hits per key, so the count is exact there; across processes sharing the store, two can read the
same count between those two steps and both let a hit through. That is the documented limit of a
plain store, and it fails towards letting a hit or two through, never towards refusing one.

A limiter given a counter instead has the store count each hit in one step of its own:

| Counter | The step | Clock |
|---|---|---|
| `sqliteCounter(db)` | one `INSERT … ON CONFLICT DO UPDATE … RETURNING` statement, run under SQLite's write lock | the caller's; processes on one host share it |
| `redisCounter(client)` | one Lua script: `INCR`, `PEXPIRE` on the first hit, `PTTL` | the Redis server's |

Every hit gets a count of its own however many processes count one key, so the limit holds
exactly and the time to wait comes from the same step. Refused attempts are counted too. A
counter's failure — a locked file past its busy timeout, a connection refused — reaches whoever
asked for the hit as a `StorageError` with the driver's error as its cause; nothing is let
through by default when the count cannot be taken.

Both stores also lease areas of themselves, checked with every write, which is what keeps two
processes from running one MTProto account over the same file or Redis database; see
[stores that lease their areas](#stores-that-lease-their-areas).

## 3. Composition

Adapters are values, so they compose:

```ts
import { memory, file, tiered, namespaced, encrypted } from 'yuigram'

namespaced(store, 'sessions:')                    // key prefixing
tiered(memory({ max: 1000 }), file('./state'))    // read-through cache
encrypted(file<string>('./state'), process.env.KEY!)   // AES-256-GCM at rest
```

`tiered` matters in practice: session reads happen on every update, and a hot in-memory layer
over a persistent store removes almost all of that traffic without changing application code.

`encrypted` wraps a store that holds text, because that is what it writes there: a value is
serialized, sealed, and stored as one base64 string. Keys are **not** encrypted — they pass
through untouched, so `namespaced`, `clear(prefix)` and `keys(prefix)` keep working and the
two compose in either order. A reader of the store therefore learns what an application
stores things under, and nothing about what it stored.

A value that does not decrypt **throws** `StorageError` rather than reading as absent, and
nothing is deleted: a mistyped secret would otherwise look exactly like an empty store, and an
application would carry on and overwrite data that is still good under the right key. This is
the one place where a driver does not degrade quietly, and §5's corrupt-data row does not
apply to it for that reason.

### What an `App` divides

An application is given one store and divides it, so that what belongs to the container and
what belongs to each client stay apart:

```
app:                the application's own state
clients:<name>:     one area per client it holds
```

```ts
const app = new App({ storage: file('./state') })
const bot = app.add(Bot.fromToken(token, { name: 'support' }))

await app.storage.set('deployed', Date.now())   // app:deployed
await app.storageFor(bot).set('cursor', 42)     // clients:support:cursor
```

Neither prefix begins the other, so no key written under one is reachable under the other. A
client's name is percent-encoded on the way in: names are unique within an application, but
uniqueness alone would still let a client called `a` writing `b:x` collide with one called
`a:b` writing `x`. Encoding leaves no `:` inside a name, which makes the mapping one-to-one.

An area is a function of the prefix and nothing else, so a later run of the same application
against the same store reads what the previous one wrote.

The store itself never leaves the application — only areas of it do. And storage is handed out
on request rather than pushed into a client, because a client is usable without an application
and one that had been given its storage by a container would stop being.

This divides *framework* state only. An MTProto account's authorization does not appear here at
all; see §4 and [sessions.md](sessions.md) §4 for why it is a different contract entirely.

---

## 4. MTProto authorization storage

An account takes one store — the same `KV` contract framework storage uses — and keeps
everything that must survive a restart in it, under an area of its own (below). The contract is
shared; the store is not. An account's store holds a signed-in authorization, and it is given to
the account directly rather than taken from an `App`; [sessions.md](sessions.md) §4 says why the
two are kept apart.

Inside its area an account divides the store by purpose:

| Prefix | Holds | Written |
|---|---|---|
| `auth:` | the permanent key per datacenter, and temporary keys with their expiry | on a key exchange, and cleared on sign-out |
| `dcs:` | the datacenter list the server published | when it changes |
| `peers:` | one record per peer seen (`peer:<kind>:<id>`: kind, identifier, access hash), and `username:` and `phone:` entries pointing at it, rebuilt when the record is written | as updates and answers describe peers |
| `updates:` | the place in the update stream | once per batch absorbed |
| `claim` | which run holds the area | when a run takes or gives the area up |

Peers are individual records rather than one serialized value, so learning a peer writes that
record and its index entries however many peers the account already knows.

### Recommended drivers

| Deployment | Store |
|---|---|
| Development, tests | `memory()` |
| One account on a machine with a disk | `Account.fromSession('./me.session', …)`, which is `file()` over that directory |
| Several processes or machines that could open the same account | `sqliteStore(await openDatabase('./accounts.db'))` or `redisStore(client)`, which lease areas and fence writes |
| Edge runtime, browser | `Account.fromString(session, { storage: memory() })`, or `web()` in a page |

An authorization belongs to one running client at a time: two runs writing one area overwrite
each other's keys and their place in the update stream. What keeps them apart depends on the
guard and on the store, and is set out next. No driver takes a file lock.

### Which account a store's contents belong to

An account divides the store it is given by purpose — `auth:`, `dcs:`, `peers:`, `updates:` —
and those names are the same for every account. Two accounts given one store therefore write
to the same keys, and the second to reach a datacenter overwrites the first one's
authorization for it. Nothing fails at the time. The symptom arrives later and somewhere
else, as a sign-in demanded from an account that had already signed in.

Two things prevent that, and both are needed.

**An area per account.** Everything an account keeps lives under its own name:

```
store
 └─ accounts:<name>:            one per account
     ├─ claim                   who holds it, and whether it is running
     ├─ auth:…                  authorizations
     ├─ dcs:…                   the datacenter list
     ├─ peers:…                 peers this account has seen
     └─ updates:…               the place in the stream
```

The name is `Account`'s existing `name` option, which defaults to `'account'`. Nothing new is
asked of a caller: it is chosen before anything is known about who will sign in, it is stable
across a restart, and it is not a Telegram user id — an account has no user id until it has
signed in, and the first thing it needs a store for is the authorization that lets it sign
in. It is encoded into the prefix, so an account called `a` and one called `a:b` cannot reach
each other's keys.

**A guard around taking one.** Areas separate two accounts only when they have different
names. The same program started twice, two tabs of a page, or two `Account`s built from one
configuration all land on the same keys — and a record written into the store cannot keep them
apart by itself. Reading it, finding it free and writing your own is three steps, and two runs
doing that together both read "free" before either writes. Both then start, both believe they
own the area, and the store keeps whichever wrote last while both keep writing.

So the name is taken through a **guard** before anything is read or written, and the guard is
whatever the environment actually provides — or, where the store can do it, the store itself:

| Runtime or store | Primitive | What it excludes |
| --- | --- | --- |
| A browser page | `navigator.locks` (Web Locks API) | Every page, tab and worker of the origin — which is also everyone who can reach that origin's storage |
| A store that leases — `sqliteStore`, `redisStore` | A lease the store records and checks with every write, taken as well as the guard | Every process and machine that reaches the same database file or Redis server |
| Everywhere else | A registry inside the process | Two `Account`s in this process, exactly. Nothing outside it |

**The reach is reported, not assumed.** `AreaLease.scope` is `store`, `origin` or `process`, and
nothing downstream may treat one as another. A registry says nothing about a second process
opened over the same directory, and claiming otherwise would be worse than not excluding at all,
because a caller would stop being careful. A caller with a better primitive than the runtime
advertises — a database advisory lock, a lock file — supplies it as `storageGuard`.

**What each part establishes, and what it does not.**

| Part | Establishes | Does not establish |
| --- | --- | --- |
| The account's `name` | Which area its data is in, `accounts:<encoded name>:`. Two names never share a key | Who signed in — it is chosen before sign-in — or that only one run uses the area |
| The claim record (`claim`: the name, and a token per run while it runs) | That a run with that token took the area and had not given it up in an orderly way when the record was read. An orderly stop rewrites it without the token | That the holder is still running, or any exclusion. It is read, judged and written in separate steps: over a store that does not lease, two processes that both read it before either writes both start, and the record names whichever wrote last |
| The process registry, outside a browser | That no other `Account` in this process holds the name. A take-over inside the process drains the holder it replaces first | Anything about another process |
| Web Locks, in a browser | That no other page, tab or worker of the origin holds the name. A page that closes or crashes has its lock released by the browser | — |
| A SQLite or Redis lease | One current lease per area across every process and machine that reaches the database, and every `set` and `delete` through it checked against the current lease in the same atomic step as the write | Protection from writes that go around the lease — to the table or the keys directly — or from a Redis cluster, which refuses the scripts |

So a claim record is a refusal on a later start, not a lock. Over `file()` or any other
persistent adapter without leases, it turns a second run that starts *after* the first has
written its claim into a `StorageOwnershipError` naming the account; it cannot stop two runs that
start together in different processes, and nothing tells a run in another process that it has
been taken over.

**A lease that can be lost, and admitted work that finishes first.** Holding the guard now is
not holding it forever, and two different things have to be true for that to be safe.

The first is a fence: the area refuses `set`, `delete` and `clear` the moment the lease is over,
so a run that has been superseded cannot *start* anything further. Reads are still answered —
what a superseded run reads is its own account's data, and a diagnostic that cannot read is one
nobody writes.

The second is a drain, and the fence alone does not give it. Reading the lease decides whether a
write may start; it says nothing about one already inside the adapter. An adapter is
asynchronous, so between admission and the mutation there is a window, and a takeover landing in
that window would have the old run's bytes written into an area a new run is keeping. So the
area counts what it has admitted, and **ownership does not transfer while that count is above
zero**: an orderly release waits for it, and a take-over waits for it wherever the guard can see
the run it is superseding.

| | Fence (refuse to start) | Drain (finish before handing on) |
| --- | --- | --- |
| Orderly release, any runtime | ✓ | ✓ |
| Take-over inside one process | ✓ | ✓ |
| Take-over inside one browser page | ✓ | ✓ |
| Take-over from another page of an origin | refused — see below | refused |
| Take-over from another process, over a store that leases | ✓, by the store | not needed: the store refuses what arrives late — see below |
| Take-over from another process, over any other persistent store | no — nothing reaches the other process, so its writes land if it is still running | no — the caller's assertion that it has ended |

**A take-over that cannot drain is refused rather than forced.** The invariant is that a
successor must not begin using an area while the run before it can still complete a conflicting
write, and `takeOverStorage` is held to that rather than excused from it.

The case this decides is the fourth row: a second tab of the same origin, holding the lock, with
a write inside the adapter. The Web Locks API does have a steal, and what a steal does is take
the lock and *then* reject the request that held it — the other page learns it lost the lock
afterwards, from a context this one cannot reach into, with whatever it had begun still running.
So `takeOverStorage` does not use it across pages. Asking is answered with
`StorageOwnershipError` naming what holds the area:

> taking the storage for the account 'account' over was refused: another page of this browser
> origin still holds the area, and a run that still holds it is a run that is still writing to
> it. `takeOverStorage` recovers an area a previous run left behind; it does not take one away
> from a run that is going.

Refusing costs nothing, because the situations people actually need are the other rows. A page
that closed or crashed has already had its lock released by the browser, so recovery is an
ordinary acquire with no flag at all. Two `Account`s in **one** page are a case the guard can
answer for — both holds are in that realm — so the one being replaced is drained first, exactly
as two in one process are. `Guard.drainsOnSteal` is where that property is declared, and a guard
supplied from outside that answers `false` is refused a take-over outright.

**What happens, by backend.**

| | `memory()` (process registry) | `file()` or another persistent store without leases (process registry) | `web()` or any store in a browser (Web Locks) | `sqliteStore`, `redisStore` (lease) |
| --- | --- | --- | --- | --- |
| Orderly stop | Admitted writes finish, the claim loses its token, the name is freed | The same; the next run, in any process, adopts the claim without a flag | The same, and the lock is released | The same, and the lease is released if it is still this grant |
| Crash | The store goes with the process | The claim keeps its token; the next run is refused until `takeOverStorage` | The browser releases the lock; the next page adopts the claim without a flag | The lease lapses after `storageLeaseMs` (30 s unless given); the next run then adopts the claim without a flag |
| Expiry | — | None: a claim never expires | — | A lease not renewed in time lapses; a running account renews every third of its life |
| `takeOverStorage` | Drains the holder in this process, then takes over | Taken on the caller's word that the other run has ended | Refused while another page holds the lock; inside one page, drains first | Supersedes the live lease; the store refuses the old run's writes from then on |
| A late write from a superseded run | Refused by the area's fence | Lands, if the other process is still running | Refused by the fence within a page | Refused by the store, in the same atomic step as the write |

These are pinned by tests: `packages/core/test/storage-guard.test.ts` for the two guards,
`packages/mtproto/test/storage-ownership.test.ts` for claims, fencing, draining and the two
cases between processes that a claim does not cover, `packages/sqlite/test/lease.test.ts` for
the SQLite lease, and `packages/mtproto/test/storage-lease-account.test.ts` and
`storage-lease-processes.test.ts` for accounts over a leasing store, the latter across real
processes against SQLite and, where a server is configured, Redis.

### Stores that lease their areas

`sqliteStore` and `redisStore` close the fifth row themselves. Each can lease an area of itself
to one holder at a time, and an account given one takes its area through that lease as well as
through the process guard:

| | SQLite | Redis |
| --- | --- | --- |
| Where the lease lives | a `<table>_leases` row: area, token, holder, expiry | `<leaseNamespace><namespace><area>:owner`, expiring with the lease, and `…:token` |
| A grant | one `BEGIN IMMEDIATE` transaction: refuse if a live lease exists, else count the token up and record the holder | one script: refuse if an owner is set, else `INCR` the token and set the owner |
| A `set` or `delete` through the lease | one `BEGIN IMMEDIATE` transaction: check the lease is current, then write | one script: compare the owner with this holder's, then write |
| A `clear` through the lease | one transaction, as above | a `SCAN` that is not fenced, then each batch of deletions fenced by a script; a lease lost part-way leaves the batches before it deleted |
| A read through the lease | not fenced: answered whoever holds the area | not fenced |
| Whose clock expires it | the writer's; processes sharing a file share a host | the server's |

**The fence is the token, not the expiry.** Every grant is numbered above every one before it —
released and expired leases keep their count, and clearing the store does not reach it — and
every write is checked against the current number in the same atomic step that makes it. A run
that was paused while its lease lapsed and another run took the area — a debugger, a stalled
disk, a machine asleep — cannot tell by itself that it is late, and does not need to: its write
arrives with an old number and the store refuses it with `StorageOwnershipError`. So does a write
it had already sent: on Redis, a command queued on the server behind a slow one runs after the
successor's grant and is refused there. Nothing it began lands after its successor starts,
which is what a drain is for, arrived at without seeing the other process at all.

**Expiry is only liveness.** A running account renews its lease every third of
`storageLeaseMs` (30 seconds unless given). One that stops releases it, and the next run starts
at once. One that dies without stopping loses it when it lapses, and the next run starts then
with no flag — the claim record it left behind is adopted, because the lease is the evidence
that nobody holds the area. `takeOverStorage: true` over a store that leases skips that wait by
superseding the live lease, which is safe here as nowhere else: the superseded run's writes are
refused from that moment, it learns so at its next renewal or write, and it stops itself.

A lease shorter than the longest stretch the process computes without yielding lapses during
that stretch. A key exchange is the longest in this package, a few hundred milliseconds, which is
why the default is measured in seconds; an account that loses its lease this way stops, the
same as one that was superseded.

Leases on nested prefixes do not exclude each other, and a store that wraps another — `tiered`,
`encrypted` — does not offer the capability, because a lease's writes go to the store beneath and
would skip the cache or the encryption. `namespaced` passes it through. On Redis every fenced
script touches the owner key and the keys it writes together, so fenced areas need one server or
a primary with its replicas, not a cluster.

**Crash recovery stays ordinary.** A page that closes takes its locks with it, a process that
dies takes its registry with it, and a lease lapses — so where the reach covers everyone who
could hold the area, being granted it *is* the evidence that the previous run is gone, and the
claim it left behind is adopted without anybody being asked. That covers a browser (origin
reach), a store that leases (store reach) and an in-memory store (which cannot be reached from
another process anyway).

Where it does not — a directory, or a database adapter without leases, behind a process-wide
guard — a claim naming another run may well be a live one, so the account refuses and says
exactly that. `takeOverStorage: true` is how a caller who knows the other run is gone says so,
and there it is a caller's assertion that the other run has **ended**: a run that has ended
cannot complete a write, and a run that has not was never excluded by a process-wide guard in
the first place, which is what `AreaLease.scope` reports. It cannot take a *different* account's
area: that is not a stale claim, it is the wrong store.

**What is still not promised.** Nothing here stops a process that ignores all of it — one that
writes to the table or the keys directly rather than through a lease. A generic KV adapter has
no compare-and-set and no lock, so over one of those what excludes two runs is the guard and
nothing else — and outside a browser that is one process. That is a limitation, stated, rather
than exclusivity implied. An adapter that can check and write in one step offers `lease` to lift
it; see `LeasableKV`.

Cleanup is scoped the same way, and holds the area while it happens. `logOut()` stops the
account first — so nothing reaches for a key about to go — and then takes a lease of its own
for the removal, because erasing an area without holding it is exactly the write this account
refuses from anybody else. A run that took the area over in that window is refused rather than
erased. Whether the store can remove in bulk at all is asked of the store the account was
given, because a namespaced view always offers the method and quietly does nothing when what it
wraps cannot.

A start that fails after taking the area gives it back. Nothing above calls `stop()` on a
`start()` that threw, so without that one bad start would hold the name for the life of the
process.

This also covers browser defaults. `web()` is one place per origin, so two accounts in a page
share it whether or not they meant to; what separates them is the area, not the store. Passing
a different `prefix` per account still works and is no longer required.

### Compatibility

The on-store layout changed. An account written before areas existed left `auth:`, `dcs:`,
`peers:` and `updates:` at the root of its store, and there is nothing in such a store saying
which account they were. They are **not** adopted under whichever name happens to ask first —
that would hand one account another's authorization, which is the failure the areas exist to
prevent. Opening over such a store raises `StorageOwnershipError` naming the prefix it found:

> this storage holds an account written before accounts had areas, and there is nothing in it
> saying which account that was — so it is not being given to 'account'. Point this account at
> a store of its own, or move the existing 'auth:' keys under 'accounts:account:' to say they
> are its.

Moving those keys under `areaFor(name)` — exported for exactly this — adopts them. An account
whose store is untouched is unaffected: a fresh store claims its area on the way up and
nothing has to be migrated.

---

## 5. Failure policy

| Situation | Framework storage | Authorization storage |
|---|---|---|
| Unavailable at start | Warn, degrade to memory, continue | **Fatal.** Refuse to start. |
| Transient read failure | Warn, treat as miss | Retry, then fail the client |
| Transient write failure | Warn, retain in memory, retry | Retry, then fail the client |
| Corrupt data | Discard, reinitialize | **Fatal**, except the peer cache, which is a cache and is rebuilt |
| Disk full | Warn, continue in memory | Fail the client |

Framework state degrades because a bot that forgets a shopping cart is still a working bot.
Authorization state does not, because a silent recovery is indistinguishable from an
unauthorized re-authentication.

---

## 6. Security

Storage is where secrets end up, so the defaults matter more than the options:

- Session files are created `0600` and their directory `0700`. The driver checks that
  directory the first time it opens one and warns, through the logger it was given, when the
  mode lets anyone but the owner in — the directory rather than the files, because on a POSIX
  filesystem nothing reaches a file whose directory denies it. Where permissions carry no such
  meaning, it says nothing rather than warning about a number that decides nothing.
- `encrypted()` wraps any adapter with AES-256-GCM, key via scrypt — authenticated, so
  tampering surfaces as a decryption failure rather than a protocol error. Each store salts
  its own derivation and carries the salt with every value it writes, so a key derived for one
  deployment is useless against another and a later process still reads what an earlier one
  wrote. Each write gets a fresh nonce, so equal values are not visibly equal in the store.
  The derived key is held in memory for as long as the store is; the secret is supplied by the
  caller and never written anywhere.
- Keys are hashed before becoming filenames, which prevents path traversal from a
  user-controlled session key.
- No storage adapter logs values, and key logging is opt-in at `debug`.
- The Redis and SQL adapters document plainly that a shared instance without an ACL means
  anything with access to that instance can read session state.

Full threat model in [security.md](security.md).

---

## 7. Phasing

| Phase | Deliverable |
|---|---|
| Shipped | `memory()`, `file()`, `namespaced()`, `tiered()`, `encrypted()`, the `KV` contract; `@yuigram/sqlite` and `@yuigram/redis`, each a store and an atomic counter over an injected client |
| v0.x | The conformance suite |
| Userland | `sql` — four methods against a client the application already has |

Nothing beyond memory and filesystem enters core's dependency tree at any phase.
