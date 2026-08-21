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
| `sqlite(path)` | `@yuigram/storage-sqlite` | single file | Single-host production |
| `redis(client)` | `@yuigram/storage-redis` | external | Multi-process, horizontal scale |
| `sql(client)` | `@yuigram/storage-sql` | external | Existing Postgres/MySQL |

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

## 3. Composition

Adapters are values, so they compose:

```ts
import { memory, sqlite, tiered, namespaced, encrypted } from 'yuigram'

namespaced(store, 'sessions:')             // key prefixing
tiered(memory({ max: 1000 }), sqlite(…))   // read-through cache
encrypted(store, process.env.KEY!)         // AES-256-GCM at rest
```

`tiered` matters in practice: session reads happen on every update, and a hot in-memory layer
over a persistent store removes almost all of that traffic without changing application code.

---

## 4. MTProto authorization storage

A different contract, because the data is not key-value. Layered as
driver / repository / service.

The layering follows from the requirements rather than from taste: the peer table needs
indexed lookup by three keys, auth keys need per-DC addressing with expiry on the temporary
ones, and update state needs atomic multi-field commits. Those cannot share one flat interface
without one of them being badly served. mtcute arrived at the same three-layer shape
([research.md](research.md) §2.5), which is corroboration that the requirements drive it —
convergence on a problem, not a borrowed design.

```
┌─────────────────────────────────────────────────┐
│ service    auth keys · peers · update state ·    │  semantic operations
│            current user · salts · DC options     │
├─────────────────────────────────────────────────┤
│ repository authKeys · kv · peers · refMessages   │  persistence contracts
├─────────────────────────────────────────────────┤
│ driver     memory · file · sqlite                │  connection, transactions
└─────────────────────────────────────────────────┘
```

```ts
interface AuthKeysRepository {
  get (dc: number): Promise<Uint8Array | undefined>
  set (dc: number, key: Uint8Array | null): Promise<void>
  getTemp (dc: number, index: number, now: number): Promise<Uint8Array | undefined>
  setTemp (dc: number, index: number, key: Uint8Array | null, expires: number): Promise<void>
  deleteByDc (dc: number): Promise<void>
}

interface PeersRepository {
  store (peer: CachedPeer): Promise<void>
  getById (id: number): Promise<CachedPeer | undefined>
  getByUsername (username: string): Promise<CachedPeer | undefined>
  getByPhone (phone: string): Promise<CachedPeer | undefined>
}
```

### Why peers cannot be KV

The peer cache needs lookup by id **and** by username **and** by phone, it is written on
every update that carries peer data, and in an active account it grows to tens or hundreds of
thousands of rows. A KV interface would force it into a single serialized blob rewritten on
every update — O(n) writes for O(1) information, and unusable well before the account is
interesting.

This is the concrete reason [sessions.md](sessions.md) §4 rejects a single shared contract.

### Recommended drivers

| Deployment | Driver |
|---|---|
| Development, tests | `memory()` |
| Single user client | `file('./me.session')` |
| Many clients, or a large peer cache | `sqlite('./sessions.db')` |
| Distributed | File or SQLite per client, on durable storage |

MTProto sessions do **not** distribute well. A session belongs to exactly one running client;
two processes sharing one session file corrupt each other's message-id and salt state. The
file driver takes an exclusive lock so the failure is immediate and explicit rather than
intermittent and baffling.

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

- Session files are created `0600`; the driver warns on wider permissions.
- `encrypted()` wraps any adapter with AES-256-GCM, key via scrypt — authenticated, so
  tampering surfaces as a decryption failure rather than a protocol error.
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
| Shipped | `memory()`, `file()`, `namespaced()`, `tiered()`, the `KV` contract |
| v0.x | `encrypted()`, the conformance suite, MTProto file driver |
| Userland | `redis`, `sqlite`, `sql` — four methods against a client the application already has |
| Post-1.0 | Official adapters, if the userland ones turn out to disagree with each other |

Nothing beyond memory and filesystem enters core's dependency tree at any phase.
