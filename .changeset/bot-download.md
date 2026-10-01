---
'@yuigram/bot-api': minor
'yuigram': minor
---

`Bot` downloads through its own transport: `bot.download(target)` returns the bytes, and
`bot.downloadStream` and `bot.getFileUrl` complete the set. A message context's `download()` and
`downloadStream()` fetch the file that message carries — a document, video, audio, voice note,
video note or animation, a photo at its largest size, a sticker when nothing else is there — and
refuse a message with no file. `bot.files` hands the bot's transport to the functions for the
forms that need a filesystem: `downloadToFile(bot.files, path, target)`, and `download(bot.files,
target)` against a local Bot API server, whose files are paths on its disk.
