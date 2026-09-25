---
'@yuigram/mtproto': minor
'yuigram': minor
---

A request Telegram refuses is raised as `RpcError`, a `TelegramError` carrying `code`, `text` —
Telegram's name for the failure, as sent — and `parameter`, the number a name like
`PASSWORD_TOO_FRESH_3600` ends in, with the `rpc_error` as its cause. `error.is(pattern)` and
`isRpcError(error, pattern)` match names exactly or with `%d` for the number; the latter also
reads the names of waits, which are still raised as `FloodError`. `MigrationError` is now an
`RpcError` and exported, and both cross a worker as the class they were.
