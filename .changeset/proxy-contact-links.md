---
'@yuigram/core': minor
'yuigram': minor
---

`readLink` and `writeLink` describe MTProxy and SOCKS5 proxy links and temporary profile links,
in their `t.me` and `tg:` forms. A proxy link is read only when it has every part its syntax
requires — a server, a port from 1 to 65535 and, for MTProxy, a secret in hex or base64 text;
a SOCKS5 username or password is kept only when the link gives one. A temporary profile link
carries the token `contacts.importContactToken` takes.

Behaviour a caller may notice: a `t.me/proxy`, `t.me/socks` or `t.me/contact/<token>` link that
was read as `undefined` is now described, so code switching on `kind` sees `'proxy'`, `'socks'`
or `'contact'` where it saw nothing.
