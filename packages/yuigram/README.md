# yuigram

[![npm](https://img.shields.io/npm/v/yuigram.svg)](https://www.npmjs.com/package/yuigram)
[![node](https://img.shields.io/node/v/yuigram.svg)](https://nodejs.org)
[![licence](https://img.shields.io/npm/l/yuigram.svg)](https://github.com/yuigram/yuigram/blob/main/LICENSE)
[![CI](https://github.com/yuigram/yuigram/actions/workflows/ci.yml/badge.svg)](https://github.com/yuigram/yuigram/actions/workflows/ci.yml)

**An independent TypeScript framework for the Telegram Bot API and MTProto.**

One package. Bots and user accounts. One programming model.

```bash
npm install yuigram
```

```ts
import { Bot } from 'yuigram'

const bot = Bot.fromToken(process.env.BOT_TOKEN)

bot.onCommand('start', (message) => message.reply('Hello.'))
bot.onText((message) => message.reply(message.text))

bot.onError((error, event) => event.log.error('handler failed', { error }))

await bot.poll()
```

Registration decides what a handler receives. `onText` matched on the text, so `message.text`
is a `string` there; `onMessage` cannot promise that, because a photo without a caption is a
message with no text.

> **The Bot API subsystem is complete.** MTProto is next and is being built bottom-up. Nothing
> released is a stub — unimplemented means absent, not hollow. See the
> [roadmap](https://github.com/yuigram/yuigram/blob/main/docs/roadmap.md).

## What you get

- **Zero runtime dependencies.** Not a wrapper over another Telegram library, at any layer. The
  build fails if that stops being true.
- **A context per event, not one context for everything.** A message handler gets a `chat` that
  is a `Chat`, a button press gets `data` that is a `string`. The fields are generated from the
  Bot API schema, so what Telegram guarantees arrives guaranteed and what it leaves optional
  stays optional.
- **The whole API, already addressed.** `message.banChatMember({ user_id })` — the chat came
  with the update, so you do not pass it. A hundred-odd methods under Telegram's own names,
  generated from the schema, with the forum topic and business connection carried through so a
  reply lands where the conversation is.
- **A registration per event kind.** `onMessage`, `onChatMemberJoined`, `onForumTopicCreated` —
  seventy-nine of them, so autocomplete teaches the taxonomy instead of a documentation page.
- **Routers that actually scope.** A feature becomes a module carrying the client's whole
  registration surface, and its middleware runs for the updates it handles and nothing else —
  once per update, not once per matching handler.
- **Filters that narrow.** `f.has.photo` proves `message.photo` is a `PhotoSize[]` — one filter
  per optional field, generated from the schema, plus curated families for the judgements a
  schema cannot make.
- **Keyboards that are markup.** `new InlineKeyboard().text('Buy', 'buy:1')` goes straight into
  `reply_markup`: no build step, and a payload over Telegram's 64-byte limit is refused where it
  is written rather than by a later API call.
- **Files from anywhere.** `media.path`, `media.url`, `media.id`, `media.buffer`, `media.stream`
  — nothing is read for an attachment you did not send.
- **Text that survives its users.** ``html`Hi <b>${name}</b>` `` escapes the name and leaves the
  markup, so one user called `<b>` does not break a reply.
- **Hooks around every call.** Retry, throttling and caching are ordinary code;
  `retryOnFloodWait()` and `throttle()` ship on that mechanism rather than beside it.
- **Throttling that matches Telegram's limits.** 30 requests a second, one message a second
  per chat, twenty a minute per group — paced with sliding windows and a fair queue, so a
  broadcast does not flood in its first second.
- **Streaming uploads, safe to retry.** `media.path('./video.mp4')` is read as the socket
  drains it, so a 2 GB file costs one buffer rather than 2 GB — and a retried upload either
  replays its bytes or fails loudly, never silently sends an empty file.
- **Concurrency that keeps a conversation in order.** Unrelated chats run in parallel up to a
  bound you set; one chat's updates stay sequential, because that reordering is the one users
  notice. Ingestion is bounded too: the loop stops fetching when handlers fall behind, so a
  backlog cannot become the process's memory.
- **A shutdown deadline that means it.** `stop({ timeout })` bounds the whole shutdown, not one
  stage of it, and returns whether everything finished rather than assuming it did.
- **Inbound rate limiting.** `rateLimit({ limit, windowMs })` caps what one user can ask of
  the bot, and leaves what to tell them to you.
- **The whole Bot API, typed.** All 185 methods and 388 objects generated from a committed
  schema snapshot, every one cancellable. `bot.api.call()` reaches anything newer than the
  installed schema, so a Telegram release never blocks you.
- **Routing that knows Telegram.** `/start` matches every bot in a group and `/start@otherbot`
  matches exactly one — handled for you, because getting it wrong means answering messages
  meant for someone else.
- **Service messages as first-class events.** A member joining arrives as `chat_member_joined`,
  not as a message you have to branch on.
- **Middleware that composes.** Onion ordering with priority bands, so timing, error boundaries
  and cleanup are expressible rather than bolted on.
- **Sessions with the race already handled.** Per-key serialization, so two quick messages
  cannot both read `count: 0` and both write `1`.
- **Polling that survives production.** Backs off on transient failure, honours `retry_after`,
  stops on errors retrying cannot fix, cancels its in-flight request on shutdown, and drains the
  handlers it already started.
- **Webhooks without a framework dependency.** Adapters for `node:http`, Express, Fastify, and
  one Fetch adapter covering Hono, Elysia, h3, Bun, Deno, Workers and Next route handlers —
  none of which you have to install.
- **Secrets stay out of logs.** Structural redaction you cannot switch off.

## Testing your bot

`yuigram/testing` runs the real pipeline — normalization, middleware, dispatch, context — with
only the network replaced. No mocking your own framework.

```ts
import { mockBot } from 'yuigram/testing'

const { bot, send, calls } = mockBot()

bot.onCommand('start', (message) => message.reply('Hello.'))
await send.command('/start')

expect(calls.last('sendMessage')?.params.text).toBe('Hello.')
```

## Webhooks

```ts
import { createServer } from 'node:http'
import { nodeWebhook } from 'yuigram/webhook'

const handler = bot.webhook({ secretToken: process.env.WEBHOOK_SECRET })

createServer(nodeWebhook(handler, { path: '/hook' })).listen(8080)
```

`expressWebhook`, `fastifyWebhook` and `webWebhook` are in the same subpath. The last one takes
a `Request` and returns a `Response`, which is what every edge runtime wants:

```ts
export default { fetch: webWebhook(handler) }
```

## Entry points

| Import | Contents |
|---|---|
| `yuigram` | The client, context, routing, filters, middleware, sessions, storage, errors |
| `yuigram/webhook` | The webhook handler and its framework adapters |
| `yuigram/testing` | `mockBot` and the in-process transport |

## Requirements

Node.js 22 or newer. ESM only.

## Not yet

Scenes and conversations arrive in v0.x — `Router` plus sessions covers step-wise dialogue
meanwhile. Storage adapters beyond memory and file, and media caching, are deliberately
userland: `KV` is four methods, and an adapter is written against the client an application
already configures.

## Documentation

Architecture notes, the API design, the security model and the roadmap live in
[the repository](https://github.com/yuigram/yuigram/tree/main/docs). Runnable
[examples](https://github.com/yuigram/yuigram/tree/main/examples) cover keyboards, routing,
routers, middleware, sessions, storage and a production setup.

## Licence

[MIT](https://github.com/yuigram/yuigram/blob/main/LICENSE)
