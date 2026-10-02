---
'@yuigram/bot-api': minor
'yuigram': minor
---

`parseCommand(text)` is exported: the parser `onCommand` and `message.command` already use, for
text read outside an update. It answers the same `ParsedCommand` a command handler receives, or
`undefined` when the text does not open with a command. Dispatch is unchanged.
