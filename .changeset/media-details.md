---
'@yuigram/mtproto': minor
'yuigram': minor
---

`MediaView` reads the media whose content is a structure: `pollDetails` joins a poll's tally to its
answers (voters, this account's choice, the right answer, and whether the results are partial),
`todoDetails` joins a checklist's completions to its tasks, and `webpageDetails`, `gameDetails`,
`stickerDetails` (type, format, set, custom emoji id, mask position, premium effect) and `location`
read link previews, games, stickers and points. `videoCodec`, `videoStartTimestamp`,
`isSilentVideo` and `preloadPrefixSize` read the rest of a video's attribute. The functions behind
them — `readPoll`, `readTodo`, `readWebPage`, `readGame`, `readSticker`, `readLocation` — are
exported for values held without a view.
