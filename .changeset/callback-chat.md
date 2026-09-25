---
'@yuigram/bot-api': patch
'yuigram': patch
---

A callback query's context now carries `chat`: the chat of the message its button is on, absent
for a button on an inline message. Sessions keyed with `userChatKey` and conversation keys
previously missed it, so a person's button presses were kept apart from their messages and a
conversation waiting on a press never received one.
