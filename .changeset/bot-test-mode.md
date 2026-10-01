---
'@yuigram/bot-api': minor
'yuigram': minor
---

`testMode: true` on a bot, or on `fetchClient`, talks to Telegram's test environment: calls go to
`/bot<token>/test/<method>` and files come from `/file/bot<token>/test/<path>`. A test-environment
bot has a token from that environment's @BotFather, and can share chats only with test accounts.
