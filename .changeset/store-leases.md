---
'@yuigram/core': minor
'@yuigram/mtproto': minor
'@yuigram/sqlite': minor
'@yuigram/redis': minor
'yuigram': minor
---

One run per MTProto account across processes, over SQLite and Redis. `sqliteStore` and
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
