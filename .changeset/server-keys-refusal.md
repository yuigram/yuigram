---
'@yuigram/mtproto': patch
'yuigram': patch
---

An account built without the server keys a datacenter offers is told so on its first call, with a
`ConfigError` naming the offered fingerprints and `serverKeysFromPem`, instead of retrying the key
exchange forever while the call waits. The connection fails everyone waiting and arms no retry; the
next call makes one fresh attempt.
