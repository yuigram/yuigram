# Schemas

Committed, version-tagged snapshots of the Telegram schemas Yuigram generates from.

```
bot-api/<version>.json   e.g. 10.2.json
tl/<layer>.json          e.g. 223.json
```

They are committed deliberately, for four reasons:

1. **Builds are reproducible offline.** No network access at build time, ever.
2. **Schema changes are reviewable diffs**, not silent shifts in generated output.
3. **A documentation restructure breaks a scheduled job**, not everyone's build.
4. **History is preserved** — diffing two layers answers "what changed" precisely.

Generators land in Phase 3 (Bot API) and Phase 5 (TL). See [../docs/codegen.md](../docs/codegen.md).
