---
'@yuigram/mtproto': minor
'yuigram': minor
---

An account refuses, at compile time, a filter written for the Bot API's events. `account.on`,
`account.once` and the same methods on `AccountRouter` accepted the `f` exported from `yuigram`,
whose filters read Bot API fields such as `chat.type`; an account's events do not carry them, so
such a handler compiled and never ran. A filter written for an account's events, for a narrower
view of them, or for what both subsystems share is accepted as before.

Migration: filter an account with the account filters, `import { f } from 'yuigram/account-filters'`
(`@yuigram/mtproto/filters`) — for example `f.chat('user')` where the Bot API filter was
`f.chat.private`.
