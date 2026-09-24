---
'@yuigram/core': minor
'@yuigram/bot-api': minor
'yuigram': minor
---

`limiter()` counts what one person asks for and refuses past an allowance, on a bot and an account
alike. One counter backs a middleware that drops what is over the limit, a filter a handler can be
registered behind, a `check` a handler makes itself, and a `wait` that throttles rather than
refuses and gives up on an abort signal. Counts are kept in named buckets, so two limits do not
spend each other's allowance, and in any `KV` store, so instances sharing a store count one person
across all of them. An account's senders are counted by kind and number, so a user and a chat with
the same number stay apart.

The Bot API's `rateLimit` is now the middleware form of the same counter and accepts `storage` and
`bucket`. Its behaviour is otherwise unchanged: the sender by default, every attempt counted, and
updates naming nobody let through uncounted.
