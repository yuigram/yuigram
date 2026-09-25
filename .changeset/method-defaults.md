---
'@yuigram/bot-api': minor
'yuigram': minor
---

A bot's `defaults` are layered: `'*'` sets common parameters for every method whose schema takes
them, a method's own key sets any of its parameters with the schema's types, and a call's own
values win over both — `false`, `null`, `''` and `undefined` included. Which methods take each
common parameter is generated from the schema, so a global `parse_mode` no longer reaches
`getMe`. Defaults are copied per bot and per call, and a defaulted `parse_mode` is left off
text that carries its own entities.

`Bot`'s `defaults` option is now typed as `MethodDefaults`: move a top-level parameter under
`'*'`. The older flat form is still applied to every call at runtime.
