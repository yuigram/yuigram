---
'@yuigram/core': patch
'yuigram': patch
---

`encrypted()` writes on Bun. Bun reports a successful key derivation to scrypt's callback with
`undefined` rather than `null`, which the store took for a failure, so every write was rejected
with nothing to say why.
