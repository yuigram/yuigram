---
'@yuigram/core': minor
'@yuigram/bot-api': minor
'@yuigram/mtproto': minor
'yuigram': minor
---

`defineEvent<Payload>(kind)` defines an event the application raises itself, and `bot.emit` /
`account.emit` dispatch it through the client's plugins, middleware, sessions and error handlers,
tracked so that `stop()` waits for it. `bot.on(definition, handler)` and `account.on(definition,
handler)` receive a typed `event.payload`. An emitted event has `transport: 'custom'`, no update
identity, and no effect on polling offsets, update sequences or `allowed_updates`; it may carry the
`chat` and `sender` it concerns so that their session loads. A kind Telegram also sends is refused.
