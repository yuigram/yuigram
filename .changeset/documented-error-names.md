---
'@yuigram/mtproto': minor
'yuigram': minor
---

The error names Telegram documents are typed. `RpcError.is`, `RpcError.argument` and `isRpcError`
offer the names in Telegram's error database as completions (`'FLOOD_WAIT_%d'`,
`'FILE_PART_%d_MISSING'`, `'CHANNEL_PRIVATE'`, …) and still accept any other string, and
`error.is(pattern)` narrows `text` to the name matched. `RpcError.text` is `RpcErrorText`: the
documented names with a number where they carry one, or any other string.

The names are types only — `DocumentedErrorPattern` and `DocumentedErrorText`, generated from
`schemas/tl/errors.json`, which records the database's codes, names and methods without its
descriptions. Nothing is added to what an import loads, and how a refusal is classified — a wait
as `FloodError`, a redirection as `MigrationError` — is unchanged.
