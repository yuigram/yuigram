---
'@yuigram/mtproto': minor
'yuigram': minor
---

`mtproxy({ host, port, secret, greetingTimeout? })`, in `yuigram/mtproxy` (`@yuigram/mtproto/mtproxy`),
is an MTProxy an account is given as its `proxy` option. The secret selects the kind: 16 bytes for
an obfuscated connection, `dd` for padded frames, `ee` with a domain for fake TLS, whose greeting is
checked against the secret before anything else is sent. Every connection goes through the proxy,
the test environment's and media-only ones included, and none falls back to a direct connection;
`initConnection` names the proxy. A `tg://proxy` link read by `readLink` is accepted too. The secret
is never written to a description, an error or a log. In a browser `mtproxy()` refuses with
`ConfigError`, since a proxy is reached over TCP.
