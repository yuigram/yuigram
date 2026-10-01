---
'@yuigram/bot-api': minor
'yuigram': minor
---

Mini App launch data, in a new entry point: `yuigram/web-app` (`@yuigram/bot-api/web-app`).
`readInitData` reads `Telegram.WebApp.initData` and proves nothing. `verifyInitData` checks
`hash` with the bot token, or with a key derived once by `InitDataKey.fromToken`;
`verifyInitDataSignature` checks Telegram's Ed25519 `signature` with the bot's id alone, against
the production key or, with `publicKey: 'test'`, the test environment's. Both follow Telegram's
published data-check-strings and take a required `maxAge`, so the window in which the same text
can be presented again is always stated.

Text that could be read two ways — a pair with no `=`, a field named twice, an escape that is not
UTF-8, a line feed — is refused rather than guessed at. A refusal is an `InitDataError` whose
`problem` is `'malformed'`, `'mismatch'`, `'unsigned'`, `'expired'`, `'future'` or
`'unsupported'`, and whose message repeats neither the data nor the token. The entry point uses
the Web Crypto API alone and imports nothing from Node; programs that do not import it do not
load it.
