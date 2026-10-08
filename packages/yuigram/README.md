# yuigram

[![npm](https://img.shields.io/npm/v/yuigram.svg)](https://www.npmjs.com/package/yuigram)
[![node](https://img.shields.io/node/v/yuigram.svg)](https://nodejs.org)
[![licence](https://img.shields.io/npm/l/yuigram.svg)](https://github.com/yuigram/yuigram/blob/master/LICENSE)

**An independent TypeScript framework for the Telegram Bot API and MTProto.**

One package. Bots and user accounts. One programming model.

```bash
npm install yuigram
```

```ts
import { Bot } from 'yuigram'

const bot = Bot.fromToken(process.env.BOT_TOKEN!)

bot.onCommand('start', (message) => message.reply('Hello.'))
bot.onText((message) => message.reply(message.text))

bot.onError((error, event) => event.log.error('handler failed', { error }))

await bot.poll()
```

Registration decides what a handler receives. `onText` matched on the text, so `message.text`
is a `string` there; `onMessage` cannot promise that, because a photo without a caption is a
message with no text.

An account — a person, or a bot signed in over MTProto — is the same model on the other
transport. It needs the application's `apiId` and `apiHash`, Telegram's server public keys and a
first datacenter address; none of them is compiled in:

```ts
import { readFileSync } from 'node:fs'
import { Account, bootstrapAt, serverKeysFromPem } from 'yuigram'

const account = Account.fromSession('./me.session', {
  apiId: Number(process.env.API_ID),
  apiHash: process.env.API_HASH!,
  keys: serverKeysFromPem(readFileSync('./telegram-keys.pem', 'utf8')),
  bootstrap: bootstrapAt({ dc: 2, host: '149.154.167.50', port: 443 }),
})

account.onMessage((event) => (event.text === 'ping' ? event.reply('pong') : undefined))

await account.start()
```

A new account signs in first with `account.signIn({ phone, code, password })`; the
[account example](https://github.com/yuigram/yuigram/tree/master/examples/03-basic-userbot)
walks through it. The session directory is a signed-in account: keep it secret.

## What you get

- **Zero runtime dependencies.** Not a wrapper over another Telegram library, at any layer. The
  build fails if that stops being true.
- **A context per event, not one context for everything.** A message handler gets a `chat` that
  is a `Chat`, a button press gets `data` that is a `string`. The fields are generated from the
  Bot API schema, so what Telegram guarantees arrives guaranteed and what it leaves optional
  stays optional.
- **The whole API, already addressed.** `message.banChatMember({ user_id })` — the chat came
  with the update, so you do not pass it. About a hundred methods under Telegram's own names,
  generated from the schema, with the forum topic and business connection carried through so a
  reply lands where the conversation is.
- **A registration per event kind.** `onMessage`, `onChatMemberJoined`, `onForumTopicCreated` and
  the rest, so autocomplete teaches the taxonomy instead of a documentation page.
- **One application, several clients.** `App` holds bots and accounts together, each with its own
  lifecycle and credentials, and one middleware chain around all of them.
- **Routers that actually scope.** A feature becomes a module carrying the client's whole
  registration surface, and its middleware runs for the updates it handles and nothing else —
  once per update, not once per matching handler.
- **Filters that narrow.** `f.has.photo` proves `message.photo` is a `PhotoSize[]` — one filter
  per optional field, generated from the schema, plus curated families for the judgements a
  schema cannot make. An account has filters of its own in `yuigram/account-filters`, and a bot's
  filter given to an account is a compile error.
- **Keyboards that are markup.** `new InlineKeyboard().text('Buy', 'buy:1')` goes straight into
  `reply_markup`: no build step, and a payload over Telegram's 64-byte limit is refused where it
  is written rather than by a later API call.
- **Files from anywhere.** `media.path`, `media.url`, `media.id`, `media.buffer`, `media.stream`
  — nothing is read for an attachment you did not send — and `bot.download()` or
  `message.download()` to fetch one back.
- **Text that survives its users.** ``html`Hi <b>${name}</b>` `` escapes the name and leaves the
  markup, so one user called `<b>` does not break a reply.
- **Hooks around every call.** Retry, throttling and caching are ordinary code;
  `retryOnFloodWait()` and `throttle()` ship on that mechanism rather than beside it.
- **Throttling that matches Telegram's limits.** 30 requests a second, one message a second
  per chat, twenty a minute per group by default — paced with sliding windows and a fair queue,
  so a broadcast does not flood in its first second.
- **Concurrency that keeps a conversation in order.** Unrelated chats run in parallel up to a
  bound you set; one chat's updates stay sequential, because that reordering is the one users
  notice. Ingestion is bounded too: the loop stops fetching when handlers fall behind.
- **A shutdown deadline that means it.** `stop({ timeout })` bounds the whole shutdown, not one
  stage of it, and returns whether everything finished rather than assuming it did.
- **Inbound rate limiting.** `rateLimit({ limit, windowMs })` caps what one user can ask of
  the bot, and leaves what to tell them to you. `limiter()` offers the same count as a filter,
  a check or a wait, in named buckets, kept in any store several instances share.
- **The whole Bot API, typed.** Every method and type of the release `schemaInfo.botApi` names,
  generated from a committed schema snapshot, every call cancellable. `bot.api.call()` reaches
  anything newer than the installed schema, so a Telegram release never blocks you.
- **Sessions and conversations.** Per-key serialization, so two quick messages cannot both read
  `count: 0` and both write `1`; scenes, prompts and durable flows for multi-step dialogue.
- **Polling that survives production.** Backs off on transient failure, honours `retry_after`,
  stops on errors retrying cannot fix, cancels its in-flight request on shutdown, and drains the
  handlers it already started.
- **Webhooks without a framework dependency.** Adapters for `node:http`, Express, Fastify and Koa, and
  one for servers that take a `Request` and return a `Response` — none of which you have to
  install.
- **Secrets stay out of logs.** Structural redaction you cannot switch off.

## Testing

`yuigram/testing` runs the real pipeline — normalization, middleware, dispatch, context — with
only the network replaced, for a bot and for an account.

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

`expressWebhook`, `fastifyWebhook`, `koaWebhook` and `webWebhook` are in the same subpath. `webWebhook`
takes a `Request` and returns a `Response`:

```ts
export default { fetch: webWebhook(handler) }
```

`koaWebhook` is Koa middleware. It reads the request itself unless a body parser already has, and
leaves sending the response to Koa:

```ts
import Koa from 'koa'
import { koaWebhook } from 'yuigram/webhook'

new Koa().use(koaWebhook(handler, { path: '/hook' })).listen(8080)
```

## Entry points

| Import | Contents |
|---|---|
| `yuigram` | Clients, `App`, contexts, routing, filters, middleware, sessions, storage, conversations, errors |
| `yuigram/testing` | `mockBot`, `mockAccount` and fixtures |
| `yuigram/webhook` | The webhook handler and its framework adapters |
| `yuigram/worker` | An account hosted in a worker |
| `yuigram/markup` | Formatted text, its readers and writers |
| `yuigram/rich` | Rich messages |
| `yuigram/stream` | An answer streamed as a draft while it is written |
| `yuigram/web-app` | Mini App launch data, read and checked |
| `yuigram/dice` | The reels a 🎰 dice shows |
| `yuigram/account-filters` | Filters for an account's events |
| `yuigram/account-utils` | Utilities for an account's data that need no account |
| `yuigram/indexeddb` | `indexedDb()`, a store over a browser's IndexedDB |

SQLite and Redis storage are separate packages: `@yuigram/sqlite` and `@yuigram/redis`.

## Requirements

Node.js 22 or newer. ESM only. Where else it runs, and what has been executed there, is in
[docs/runtimes.md](https://github.com/yuigram/yuigram/blob/master/docs/runtimes.md). Against
Telegram itself, one example has been run by hand under Node.js; the prepared live procedure has
not.

## Documentation

Architecture notes, the API design, the security model and the roadmap live in
[the repository](https://github.com/yuigram/yuigram/tree/master/docs), with
[documentation in Russian](https://github.com/yuigram/yuigram/blob/master/docs/ru/README.md).
Runnable [examples](https://github.com/yuigram/yuigram/tree/master/examples) cover bots,
accounts, both together, middleware, routing, sessions, storage, conversations, workers,
streaming and a production setup.

## Licence

[MIT](https://github.com/yuigram/yuigram/blob/master/LICENSE)
