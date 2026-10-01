---
'@yuigram/core': minor
'yuigram': minor
---

A session key given to `session()` reads the chat and the sender an update carries, so the usual
scopes need no context type named: `key: (event) => event.sender?.id` keeps one session per user
across chats, and `key: (event) => event.chat?.id` one per chat. A key may also be a `bigint`, which
is written out in full, so an account's 64-bit peer identifiers are never rounded. `userChatKey`
is unchanged.
