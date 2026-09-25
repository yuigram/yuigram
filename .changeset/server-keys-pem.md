---
'@yuigram/mtproto': minor
'yuigram': minor
---

`serverKeysFromPem(text)` reads the RSA keys Telegram publishes for its datacenters — in either
PEM form, several to a text — into the `keys` an account needs, each with the fingerprint a
datacenter names it by. `serverRsaKey({ n, e })` builds one from a modulus and exponent. Neither was
public before, which left no supported way to give an account the keys it verifies a datacenter
with.
