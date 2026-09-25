---
'@yuigram/bot-api': minor
'yuigram': minor
---

`mediaCache()` keeps the identifier Telegram returns for each upload and sends it instead of the
file next time, for photos, videos, animations, video notes, audio, documents, stickers and voice
messages. Entries are named by bot, media kind and source — a path, a URL, a digest of bytes, or
a `cacheKey` given to `media.*` — and kept in any `KV` store. A stale identifier is replaced by
one more upload, only when Telegram refused it as a bad identifier; nothing is cached from a
failed call; concurrent sends of one file upload it once; and a single-use stream is never read
to be named.
