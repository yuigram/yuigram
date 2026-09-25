---
'@yuigram/bot-api': minor
'@yuigram/mtproto': minor
'yuigram': minor
---

`yuigram/testing` tests accounts as well as bots. `mockAccount()` (also `@yuigram/mtproto/testing`) runs
the real account over a channel answered from a script: `send.message`, `send.service` and
`send.press` deliver updates, common calls are answered as Telegram would, `rpcError()` refuses one
as a real refusal is raised, and `calls`, `sent` and `errors` record what happened.

`mockBot()` answers sending, editing and confirming methods without scripting, keeps the messages
the bot sent in `sent`, presses a real button on one with `send.press`, and collects handler errors
nothing caught in `errors`. New builders cover chosen inline results, reactions, pre-checkout
queries, poll answers and join requests.
