---
'@yuigram/mtproto': minor
'yuigram': minor
---

Sticker sets are read through `StickerSetView`, which reads a set in every form Telegram sends it:
brief in a list, with or without covers, and full when asked for by itself. It answers the set's
kind, flags, installation date, link and input reference, pairs each sticker with every emoji the
set files it under and its keywords, finds stickers by emoji, and builds the download request for
the set's own picture. It crosses the worker boundary like the other views.

`getStickerSet` and the calls that change a set return the view, which still carries `set`,
`documents`, `packs` and `keywords`. `getInstalledStickers` and `getMyStickerSets` now return
views rather than raw `stickerSet` values; the raw value is on `raw`, and `stickerSet`'s snake_case
fields read as `id`, `accessHash`, `shortName` and the rest.
