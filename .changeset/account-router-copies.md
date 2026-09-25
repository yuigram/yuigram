---
'@yuigram/mtproto': minor
'yuigram': minor
---

`AccountRouter` can be copied and taken into another. `router.clone(children?)` returns an
independent router with the same registrations, hooks, catchers and dependencies as they stand;
`router.extend(other)` takes in another router as a snapshot, so what is registered on it
afterwards is not taken in.
