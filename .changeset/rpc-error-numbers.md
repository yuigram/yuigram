---
'@yuigram/mtproto': patch
'yuigram': patch
---

`RpcError.parameter` reads the number a name carries wherever it is — `FILE_REFERENCE_5_EXPIRED`,
`INTERDC_2_CALL_ERROR` — not only at the end, and `error.argument(pattern)` reads one written
into a word, such as `…_WAIT_5MIN`. `2FA_CONFIRM_WAIT_N` is now raised as a `FloodError` like the
other waits, `STATS_MIGRATE_N` as a `MigrationError` of kind `'stats'`, and `RpcError.BAD_REQUEST`,
`FLOOD` and the rest name Telegram's codes.
