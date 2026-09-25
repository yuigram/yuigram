---
'@yuigram/mtproto': minor
'yuigram': minor
---

Session strings in the version-3 TL layout other MTProto libraries write can be imported and
exported: `Account.fromString(text, { ...options, format: 'tl-v3' })`, `account.exportSession({
format: 'tl-v3' })`, and `readSession` / `writeSession` for converting between layouts. The layout
is always named; one given the wrong layout is refused with a message saying which it looks like.
A datacenter address the string carries is added where the bootstrap has none, and the user it
names is written down as the account's own, with whether it is a bot.

Importing no longer replaces a different authorization the store already holds for the session's
datacenter: that is refused unless `replace: true` is passed. The same key already stored is used
as before.
