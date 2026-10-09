# @yuigram/sqlite

## 1.0.0

### Major Changes

- Licensed under the Mozilla Public License 2.0 (`MPL-2.0`) from this release. `0.1.0` was
  released under the MIT License, which still applies to it. The package ships the MPL-2.0 text
  as `LICENSE`, and its source files carry an SPDX identifier.
- `1.0.0` is the release after `0.1.0`. It was prepared first as `0.2.0`, which was never published;
  the changes listed below were made for it and are part of this release. From `1.0.0` on, a change that breaks
  the public API needs a major version. Upgrading from `0.1.0` is described, rename by rename, in
  `docs/migration.md`.

### Minor Changes

- d17681a: `@yuigram/sqlite` keeps the key-value contract in a SQLite table over a connection the
  application supplies — `node:sqlite`, `better-sqlite3` or `bun:sqlite` — and `openDatabase()`
  opens a file with the runtime's own SQLite, ready for several processes: write-ahead logging, a
  busy timeout, and an owner-only file where the platform allows. It serves sessions,
  conversation state and an MTProto account's own state; expired entries are invisible at once and
  removed on read or by `sweep()`.
  
  `sqliteCounter()` counts rate-limit hits in one statement per hit, and core's `limiter()` takes
  it — or any `WindowCounter` — as `counter`, in place of a store. Hits from any number of
  processes on one key each get a count of their own, so a shared limit holds exactly.
- 101e74f: One run per MTProto account across processes, over SQLite and Redis. `sqliteStore` and
  `redisStore` lease an area of themselves to one holder at a time — `store.lease(prefix, { holder,
  ttlMs })` — and check the lease in the same atomic step as every write through it: a
  `BEGIN IMMEDIATE` transaction on SQLite, a script on Redis. Every grant is numbered above the
  last, so a run that was paused past its lease, and superseded, has its writes refused by the store
  with `StorageOwnershipError` rather than landing over its successor's.
  
  An account given one of these stores takes its area through the lease as well as the process
  guard, and `AreaLease.scope` reports `'store'`. A second process is refused while the first runs;
  a run that stops frees the area at once; one that dies frees it when its lease lapses, with no
  flag; `takeOverStorage` supersedes a live run, which learns so at its next renewal or write and
  stops. `storageLeaseMs` (30 seconds unless given) sets how long a dead run keeps the next waiting.
  
  `StorageOwnershipError` now lives in `@yuigram/core`, re-exported from `@yuigram/mtproto` as
  before, and comes back as itself across a worker. `canLease()` and the `LeasableKV`,
  `StoreLease` and `LeaseOptions` types describe the capability for other adapters; `namespaced`
  passes it through, `tiered` and `encrypted` do not. `redisStore` takes a `leaseNamespace`,
  `yuigram:lease:` unless given, which must not overlap its `namespace`.

### Patch Changes

- c8fdd1a: Each package ships a small `package.json` in `dist/` saying its files are ES modules, with its
  `browser` substitutions and `sideEffects` rewritten relative to `dist/`, so Node stops looking for
  a module's package one directory up. A cold `import 'yuigram'` is about 13 ms faster in a paired
  comparison of isolated builds. Resolution by package name, export maps, browser substitutions in
  esbuild, webpack and Rollup, and tree shaking are unchanged.
- 61719ce: The SQLite counter never reports a wait longer than the window. A hit whose clock was read before
  another process opened the window could be told the window's length plus the time it spent
  waiting for the write lock.

- Updated dependencies
  - @yuigram/core@1.0.0
