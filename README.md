<div align="center">

# Yuigram

**An independent TypeScript framework for the Telegram Bot API and MTProto.**

One package. Bots and user accounts. One programming model.

[![npm](https://img.shields.io/npm/v/yuigram.svg)](https://www.npmjs.com/package/yuigram)
[![node](https://img.shields.io/node/v/yuigram.svg)](https://nodejs.org)
[![licence](https://img.shields.io/npm/l/yuigram.svg)](LICENSE)

English · [Русский](README.ru.md)

</div>

---

> **Status.** The published `0.1.0` is the Bot API client. This branch adds the MTProto account
> client, `App` for holding several clients, and the surface described below; it is released
> when the pending changesets are. [docs/migration.md](docs/migration.md) lists what changed
> since `0.1.0`, and [docs/roadmap.md](docs/roadmap.md) what is still planned.

## What Yuigram provides

- **`Bot`** — a Bot API client over HTTPS: a typed method for every Bot API method, a context per
  event kind, long polling, webhooks with framework adapters, keyboards, formatting, file uploads
  and downloads.
- **`Account`** — a user account (or a bot) over MTProto, implemented in this repository: the
  key exchange, the encrypted session, datacenters, updates, peers and files, the generated TL
  surface, and the operations built on it — sending, editing and forwarding messages, walking
  dialogs and history, managing chats and members.
- **`App`** — several clients of either kind in one process, each with its own lifecycle,
  credentials and connections, and one middleware chain around all of them.
- **One framework layer for both** — dispatch, filters, middleware, routers, sessions, storage,
  conversations, errors and logging, shared by both transports without pretending they are the
  same. Where the Bot API and MTProto differ, the types say so.
- **No runtime dependencies.** Neither protocol is borrowed from another Telegram library; the
  build fails if one appears.

## Installation

```bash
npm install yuigram
```

Node.js 22 or newer, ESM only. The storage adapters `@yuigram/sqlite` and `@yuigram/redis` are
separate packages, installed when wanted.

## A bot

```ts
import { Bot } from 'yuigram'

const bot = Bot.fromToken(process.env.BOT_TOKEN!)

bot.onCommand('start', (message) => message.reply('Hello.'))
bot.onText((message) => message.reply(message.text))

bot.onError((error, event) => event.log.error('handler failed', { error }))

await bot.poll()
```

Get a token from [@BotFather](https://t.me/BotFather). Registration decides what a handler
receives: `onText` matched on the text, so `message.text` is a `string` there, while a handler
registered with `onMessage` must allow for a photo with no caption.

## An account

An account signs in as a person, so it needs what MTProto needs before any call can be made:

| | Where it comes from |
| --- | --- |
| `apiId`, `apiHash` | The application's credentials, from [my.telegram.org](https://my.telegram.org). |
| `keys` | Telegram's server public keys, in the PEM form Telegram's MTProto documentation publishes, read with `serverKeysFromPem`. They are public, and checked by fingerprint; none are compiled in. |
| `bootstrap` | The first datacenter address to reach, from the same documentation, built with `bootstrapAt`. The account learns the full list from Telegram. |
| a place for state | `fromSession(directory, …)` keeps the authorization in a directory; `fromString(session, …)` takes an exported session string and a store. |

```ts
import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { Account, bootstrapAt, serverKeysFromPem } from 'yuigram'

const account = Account.fromSession('./me.session', {
  apiId: Number(process.env.API_ID),
  apiHash: process.env.API_HASH!,
  keys: serverKeysFromPem(readFileSync('./telegram-keys.pem', 'utf8')),
  bootstrap: bootstrapAt({ dc: 2, host: '149.154.167.50', port: 443 }),
})

async function ask(question: string): Promise<string> {
  const input = createInterface({ input: process.stdin, output: process.stdout })
  try {
    return (await input.question(question)).trim()
  } finally {
    input.close()
  }
}

account.onMessage(async (event) => {
  if (event.text === 'ping') await event.reply('pong')
})

await account.connect()
await account.signIn({
  phone: () => ask('Phone: '),
  code: () => ask('Code: '),
  password: () => ask('2FA password: '),
})
```

`signIn` asks only for what the account needs: a session already signed in asks for nothing, and
the password is asked for only when the account has one. **The directory, and any exported
session string, is a signed-in account** — keep it out of repositories, logs and messages, and
revoke it from Telegram's active sessions if it leaks. An account acts as the person who owns
it, and Telegram restricts accounts used for flooding or spam.

## Both in one application

```ts
import { type AnyEventContext, App, type MtprotoContext, type UnifiedContext } from 'yuigram'

const app = new App<AnyEventContext | MtprotoContext>()
app.add(bot)
app.add(account)

app.use(async (event, next) => {
  event.log.info('update', { client: event.client.name, kind: event.kind })
  await next()
})

app.on<UnifiedContext>('message', (event) => event.react('👀'))

await app.start()
```

A handler on the application sees both clients; one on a client sees only its own, fully typed.
`event.transport` tells them apart where a handler needs what only one transport has.

## Entry points and optional packages

| Import | What it holds |
| --- | --- |
| `yuigram` | Clients, `App`, contexts, filters, middleware, routers, sessions, storage, conversations, errors, formatting helpers, media sources, keyboards |
| `yuigram/testing` | `mockBot` and `mockAccount`: the real pipeline with only the network replaced |
| `yuigram/webhook` | The webhook handler and adapters for `node:http`, Express, Fastify and Fetch-style servers |
| `yuigram/worker` | An account hosted in a worker and driven from another thread |
| `yuigram/markup` | Formatted text: builders, HTML and Markdown readers and writers |
| `yuigram/rich` | Rich messages built from blocks or read from rich Markdown and HTML |
| `yuigram/stream` | An answer shown as a draft while it is written, over a bot or an account |
| `yuigram/web-app` | Mini App launch data: read, and checked with the bot token or Telegram's signature |
| `yuigram/dice` | What a rolled 🎰 shows: the three reels of a slot machine from its value |
| `yuigram/account-filters` | Filters for an account's events |
| `yuigram/account-utils` | Waveforms, thumbnails, Instant View and inline message identifiers |
| `@yuigram/sqlite` | SQLite storage and a shared counter, through the runtime's own driver |
| `@yuigram/redis` | Redis storage and a shared counter, through the client the application already has |

Each subpath loads only when imported, and a program that uses only the Bot API bundles none of
the MTProto subsystem.

## Documentation

| | |
| --- | --- |
| [Examples](examples) | Runnable programs, each type-checked with the repository |
| [Russian documentation](docs/ru/README.md) | Guides for both transports, in Russian |
| [API design](docs/api-design.md) | The public surface as implemented, and why it has this shape |
| [Events](docs/events.md), [middleware](docs/middleware.md) | Event kinds, dispatch, filters, routing, ordering |
| [Sessions](docs/sessions.md), [storage](docs/storage.md) | Framework state, conversations, stores and their guarantees |
| [Formatting](docs/formatting.md) | Formatted text, rich messages and streaming |
| [MTProto](docs/mtproto.md) | The protocol implementation |
| [Runtimes](docs/runtimes.md) | Where it runs, and what was executed there |
| [Security](docs/security.md), [testing](docs/testing.md) | Threat model, secret handling, how correctness is established |
| [Live verification](docs/live-verification.md) | The prepared checklist for checking against Telegram itself |
| [Migration](docs/migration.md), [roadmap](docs/roadmap.md) | What changed, and what is planned |

[docs/README.md](docs/README.md) indexes the design records behind all of it.

## Runtime support

Node.js 22 or newer is the primary target; everything in the repository runs there. Bun 1.4.2,
Deno 2.9.6 and workerd (locally, through Miniflare) have run the runtime matrix — Bot API calls
and webhooks, the stores, and an account's key exchange, encrypted calls and updates — against a
local stand-in datacenter, and a browser page has run an account the same way.
[docs/runtimes.md](docs/runtimes.md) has the table and says what was run and what is inferred.

Limits worth knowing:

- Long polling needs a process that outlives a request; an edge function uses a webhook.
- File paths and `file()` storage need a filesystem. A bot that does not use them bundles none
  of that code, and the bot's own download methods never reach a disk.
- A browser page cannot call the Bot API directly, because Telegram sends no CORS headers.
- **Nothing here has been run against Telegram itself.** Signing in needs real credentials and has
  not been run anywhere; [docs/live-verification.md](docs/live-verification.md) is the prepared
  procedure. The checks above use mock transports and a stand-in datacenter that speaks the real
  protocol.

## Development

```bash
pnpm install
pnpm verify      # lint, typecheck, invariants, tests, declaration budget
pnpm smoke       # pack the packages, install them, and use them as an application would
pnpm bench       # startup, bundle and dispatch budgets
```

`pnpm verify` needs nothing beyond the repository. The runtime matrix needs Bun, Deno and
Miniflare, and the Redis suite a Redis server; [CONTRIBUTING.md](CONTRIBUTING.md) says how to run
both. Live checks against Telegram are opt-in, one variable per kind of change, and never part of
a normal run.

## Security

Yuigram handles credentials. A bot token controls a bot, and a leaked MTProto session is a
signed-in account. Logs redact both structurally. Report vulnerabilities privately — see
[SECURITY.md](SECURITY.md).

## Licence and attribution

[MIT](LICENSE). Yuigram ships no third-party code and has no runtime dependencies. It is written
from Telegram's published specifications; the projects studied while designing it are credited
in [NOTICE.md](NOTICE.md), and [docs/licensing.md](docs/licensing.md) records the analysis.
