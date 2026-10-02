---
'@yuigram/mtproto': minor
'yuigram': minor
---

A status update says what it brings. `event.presence` on a `mtproto:user_status` event is the
update's status read as `UserView.presence` reads a user's — `state`, `onlineUntil` and
`lastSeen` in Unix seconds, `hiddenByMe` — with the user in `event.target`; it is `undefined` on
every other kind. `readPresence(status)` is the reader both use, exported for a status held on
its own: it reads the six constructors of the schema, derives no time for a status that states
none, and answers `undefined` for anything that is not a status.
