---
'@yuigram/bot-api': minor
'yuigram': minor
---

The six paged Bot API lists read as async sequences that fetch a page only when the loop asks:
`bot.profilePhotos()`, `bot.profileAudios()` and `bot.starTransactions()` by position, and
`bot.userGifts()`, `bot.chatGifts()` and `bot.businessGifts()` by cursor, with `limit`,
`pageSize`, a starting `offset` or `cursor`, and an abort `signal`. `.collect()` reads the rest
with Telegram's total, and `offsetPages` / `cursorPages` read any other paged source the same way.

`pager()` shows a list a screen at a time: the ‹ · › buttons, slicing, and reading a press back,
with the person the list was shown to carried in the button so a press by anyone else is
reported as refused.
