# @yuigram/sqlite

SQLite storage for [Yuigram](https://github.com/yuigram/yuigram): a key-value store for
sessions, conversation state, caches and an account's own state, and an atomic counter for rate
limits shared between processes.

```bash
npm install @yuigram/sqlite
```

> Published from `1.0.0` on. Until that release is on npm, the package is built from a
> [checkout of the repository](https://github.com/yuigram/yuigram#install).

The package installs no database driver. It takes a connection the application opens —
`node:sqlite`, `better-sqlite3` or `bun:sqlite` all fit — and `openDatabase()` opens a file with
the runtime's own SQLite on Node.js 22.5 or later.

```ts
import { limiter, session, userChatKey } from 'yuigram'
import { openDatabase, sqliteCounter, sqliteStore } from '@yuigram/sqlite'

const database = await openDatabase('./bot.db')

bot.extend(
  session<Cart>({
    storage: sqliteStore<Cart>(database, { table: 'sessions' }),
    key: userChatKey,
    initial: () => ({ items: [] }),
  }),
)

// Exact across every process that opens the same file.
const limits = limiter({ counter: sqliteCounter(database) })
bot.use(limits.middleware({ limit: 20, windowMs: 60_000 }))
```

## What it guarantees

- **Every operation is one statement**, so each is atomic by itself and safe from several
  connections at once.
- **The counter counts a hit in one statement** — an insert that becomes an update and returns
  the row — so any number of processes counting one key are each told their own count and the
  limit holds exactly. A limiter given the store rather than the counter serializes hits within
  one process only.
- **Expired entries are invisible** from the moment they expire, deleted when read, and removed in
  bulk by `sweep()`.
- **Values are JSON data.** `undefined` fields are dropped, `null` is kept, a `Date` comes back as
  a string, and a `bigint` is refused with an error that names the key and never the value.
- **The connection stays yours** unless `ownsConnection: true` says otherwise; `openDatabase` sets
  write-ahead logging, a five-second busy timeout and, where the platform has permissions, a file
  only its owner can read.

It does **not** stop two processes from running one MTProto account from the same file. The store
reports itself as persistent, which is what tells the account layer that its in-process guard
does not reach other processes.

Node.js 22 or newer. ESM only. MIT licensed.
