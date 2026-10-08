---
'@yuigram/core': minor
'yuigram': minor
---

`indexedDb({ database?, store?, durability? })`, in `yuigram/indexeddb` (`@yuigram/core/indexeddb`),
is a store over a browser's IndexedDB for pages and workers that outgrow `localStorage`. Values are
the JSON envelope the other stores keep; a write resolves when its transaction completes, with
strict durability unless asked otherwise; a failed request or an aborted transaction rejects with
`StorageError`; a missing object store is added by a version upgrade; `close()` ends the
connection. An account over it is kept to one run per origin by the Web Locks guard, as over
`web()`; the store adds no exclusion of its own.
