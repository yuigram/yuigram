---
'@yuigram/bot-api': minor
'yuigram': minor
---

`Bot` downloads through its own transport: `bot.download(target)` returns the bytes,
`bot.download(target, path)` writes them to disk as they arrive, and `bot.downloadStream` and
`bot.getFileUrl` complete the set. A message context's `download()` and `downloadStream()` fetch
the file that message carries — a document, video, audio, voice note, video note or animation, a
photo at its largest size, a sticker when nothing else is there — and refuse a message with no
file. Both use the client the bot was built with, including a local Bot API server, where the
free functions need the transport passed by hand.
