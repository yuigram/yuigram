# Schemas

Committed, version-tagged snapshots of the Telegram schemas Yuigram generates from.

```
bot-api/<version>.json      e.g. 10.2.json

tl/api.<layer>.tl           e.g. api.223.tl      raw text, verbatim
tl/api.<layer>.json         e.g. api.223.json    parsed IR
tl/mtproto.tl                                    raw text, verbatim
tl/mtproto.json                                  parsed IR
```

The TL side keeps the raw `.tl` alongside the IR because they answer different questions: the
text says what Telegram changed, the IR says how the parser read it. A single artifact cannot
separate a schema change from a parser change.

`api.tl` is layer-numbered; `mtproto.tl` is not — Telegram publishes one current service schema
with no layer attached.

They are committed deliberately, for four reasons:

1. **Builds are reproducible offline.** No network access at build time, ever.
2. **Schema changes are reviewable diffs**, not silent shifts in generated output.
3. **A documentation restructure breaks a scheduled job**, not everyone's build.
4. **History is preserved** — diffing two layers answers "what changed" precisely.

The Bot API generator is in `tools/schema`; the TL generator lands in `tools/tl`. See
[../docs/codegen.md](../docs/codegen.md) for both, and §3.3 there for the TL layer policy.
