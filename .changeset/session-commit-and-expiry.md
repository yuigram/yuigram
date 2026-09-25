---
'@yuigram/core': minor
'yuigram': minor
---

Sessions say when they are written. `commit: 'success'` leaves the stored value untouched when
a handler throws or is cancelled; the default, `'always'`, writes what changed either way, as
before. `sessionHandle.save()` writes at once and reports a refused write to the handler that
asked for it.

`sessionHandle.merge(patch)` assigns fields over the value. Each write can carry its own time to
live — `set(value, { ttl })`, `merge(patch, { ttl })`, `save({ ttl })`, `expireIn(seconds)` —
and `expiring(value, ms)` makes a single field expire, with the expiry stored beside it so it
holds across updates and restarts.

A stored `null` is now kept as the session's value rather than replaced by `initial()`, and
`sessionHandle.isNew` says whether the key held nothing. `clear()` makes the value read as
`initial()` at once, and a change made after it is written instead of deleted.
