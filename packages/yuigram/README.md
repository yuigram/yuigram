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

const bot = new Bot(process.env.BOT_TOKEN)

bot.command('start', (ctx) => ctx.reply('Hello.'))
bot.on('message', (ctx) => ctx.reply(ctx.text ?? 'Say something.'))

bot.catch((error, ctx) => ctx.log.error('handler failed', { error }))

await bot.start()
```

> **0.1.0 ships the Bot API subsystem.** MTProto is next and is being built bottom-up. Nothing
> released is a stub — unimplemented means absent, not hollow. See the
> [roadmap](https://github.com/yuigram/yuigram/blob/main/docs/roadmap.md).

## What you get

- **Zero runtime dependencies.** Not a wrapper over another Telegram library, at any layer. The
  build fails if that stops being true.
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
  stops on errors retrying cannot fix, and cancels its in-flight request on shutdown.
- **Webhooks without a framework dependency.** Adapters for `node:http`, Express and Fastify,
  none of which you have to install.
- **Secrets stay out of logs.** Structural redaction you cannot switch off.

## Testing your bot

`yuigram/testing` runs the real pipeline — normalization, middleware, dispatch, context — with
only the network replaced. No mocking your own framework.

```ts
import { mockBot } from 'yuigram/testing'

const { bot, send, calls } = mockBot()

bot.command('start', (ctx) => ctx.reply('Hello.'))
await send.command('/start')

expect(calls.last('sendMessage')?.params.text).toBe('Hello.')
```

## Webhooks

```ts
import { createServer } from 'node:http'
import { nodeWebhook } from 'yuigram/webhook'

const handler = bot.webhookHandler({ secretToken: process.env.WEBHOOK_SECRET })

createServer(nodeWebhook(handler, { path: '/hook' })).listen(8080)
```

`expressWebhook` and `fastifyWebhook` are in the same subpath.

## Entry points

| Import | Contents |
|---|---|
| `yuigram` | The client, context, routing, filters, middleware, sessions, storage, errors |
| `yuigram/webhook` | The webhook handler and its framework adapters |
| `yuigram/testing` | `mockBot` and the in-process transport |

## Requirements

Node.js 22 or newer. ESM only.

## Not yet

Keyboard builders and streaming upload arrive in v0.x. Meanwhile pass the typed markup object
directly, and buffer files before upload — bot uploads cap at 50 MB either way.

## Documentation

Architecture notes, the API design, the security model and the roadmap live in
[the repository](https://github.com/yuigram/yuigram/tree/main/docs). Runnable
[examples](https://github.com/yuigram/yuigram/tree/main/examples) cover routing, middleware,
sessions and storage.

## Licence

[MIT](https://github.com/yuigram/yuigram/blob/main/LICENSE)
