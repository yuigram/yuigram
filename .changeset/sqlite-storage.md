---
'@yuigram/core': minor
'@yuigram/sqlite': minor
'yuigram': minor
---

`@yuigram/sqlite` keeps the key-value contract in a SQLite table over a connection the
application supplies — `node:sqlite`, `better-sqlite3` or `bun:sqlite` — and `openDatabase()`
opens a file with the runtime's own SQLite, ready for several processes: write-ahead logging, a
busy timeout, and an owner-only file where the platform allows. It serves sessions,
conversation state and an MTProto account's own state; expired entries are invisible at once and
removed on read or by `sweep()`.

`sqliteCounter()` counts rate-limit hits in one statement per hit, and core's `limiter()` takes
it — or any `WindowCounter` — as `counter`, in place of a store. Hits from any number of
processes on one key each get a count of their own, so a shared limit holds exactly.
