<div align="center">

# Yuigram

**One TypeScript framework for Telegram bots and Telegram accounts.**

[Documentation](docs/README.md) · [API design](docs/api-design.md) · [Examples](examples) · [Русский](README.ru.md)

Bot API 10.3 · TL layer 229 · Node.js 22+ · no runtime dependencies

</div>

```ts
import { readFileSync } from 'node:fs'
import { Account, App, Bot, bootstrapAt, serverKeysFromPem } from 'yuigram'
import { f as heard } from 'yuigram/account-filters'

const OWNER = Number(process.env.OWNER_ID)

const bot = Bot.fromToken(process.env.BOT_TOKEN!)
const account = Account.fromSession('./me.session', {
  apiId: Number(process.env.API_ID),
  apiHash: process.env.API_HASH!,
  keys: serverKeysFromPem(readFileSync('./telegram-keys.pem', 'utf8')),
  bootstrap: bootstrapAt({ dc: 2, host: '149.154.167.50', port: 443 }),
})

// The bot is the control panel: its owner tells the account what to send.
bot.onCommand('say', async (message) => {
  if (message.sender?.id !== OWNER) return

  await account.sendText('@example', message.command.rest)
  await message.reply('Sent from the account.')
})

// What the account hears comes back as a notification from the bot.
account.on('message', heard.incoming.and(heard.chat('user')), async (event) => {
  await bot.api.sendMessage({ chat_id: OWNER, text: `New message: ${event.text ?? '(no text)'}` })
})

const app = new App()
app.add(bot)
app.add(account)

await app.start()
```

Yuigram is a framework for programs that work with Telegram as a bot, as a user account, or as
both at once. `Bot` speaks the Bot API over HTTPS. `Account` speaks MTProto, implemented in this
repository rather than wrapped from another library. `App` runs any number of either in one
process, with the same handlers, filters, middleware, sessions, storage and test harness around
all of them.

## Why both in one framework

Yuigram lets one application coordinate a Bot API bot and an MTProto account. The application
chooses which transport performs each operation it supports, within Telegram's permissions and
what the account is able to see. Projects that need both usually glue two unrelated libraries
together, with two event models, two kinds of session and two ways to test. Yuigram gives them
one application model:

- **A bot as the control panel for an account.** People talk to the bot; the work that needs an
  account — reading a channel's history, resolving a username, sending as a person — happens
  through the `Account` next to it, in the same process and the same handler.
- **Account updates as bot notifications.** What the account hears is filtered by the same kind
  of filter a bot uses, and delivered wherever the bot can write.
- **One set of tools around both.** A single middleware chain, session and storage layer,
  conversations, formatting, error types and logging; `mockBot` and `mockAccount` run the real
  pipeline for either with only the network replaced.

The two transports are not made to look identical. A bot and an account have different
permissions, different contexts and different ways of naming a chat, and the types keep that
visible: `event.transport` says which one an update came through, and what only one of them can
do is offered only there.

## Install

```bash
npm install yuigram
```

`Account`, `App` and the example above came with `1.0.0`: every package at that version, and
the first release of `@yuigram/mtproto`, `@yuigram/sqlite` and `@yuigram/redis`. `0.1.0` was the
Bot API client alone. The examples run from a checkout:

```bash
git clone https://github.com/yuigram/yuigram
cd yuigram
pnpm install && pnpm build
BOT_TOKEN=123456:ABC-DEF pnpm tsx examples/01-basic-bot/index.ts
```

Node.js 22 or newer, ESM only. [docs/migration.md](docs/migration.md) lists what changed since
`0.1.0`. An account needs an application id and hash from
[my.telegram.org](https://my.telegram.org), Telegram's published server keys, and one sign-in;
[examples/03-basic-userbot](examples/03-basic-userbot) walks through it. A session directory or
session string **is** a signed-in account — keep it out of repositories, logs and messages.

## What is in it

- **Two clients, one model** — `Bot`, `Account`, and `App` to hold several of either, each with
  its own lifecycle, credentials and connections.
- **Typed from the schemas** — every Bot API method and every TL method is generated and typed;
  a handler's context is the one its event kind has, and a registration narrows it.
- **A framework layer** — filters, middleware, routers, sessions, conversations that survive a
  restart, rate limits, and plugins, shared by both clients.
- **Storage** — memory, files, encrypted files and browser storage built in; SQLite and Redis as
  separate packages; an interface of three required methods for anything else.
- **Messages as they are** — formatting from HTML, Markdown or builders, rich messages, answers
  streamed as drafts, uploads and downloads on both transports.
- **An escape hatch** — `bot.api.call` and `account.api` reach whatever the framework has not
  wrapped yet.

## Documentation

| | |
| --- | --- |
| [Examples](examples) | Runnable programs, type-checked with the repository |
| [Package README](packages/yuigram/README.md) | Entry points and optional packages |
| [API design](docs/api-design.md) | The public surface as implemented, and why it has this shape |
| [Russian guides](docs/ru/README.md) | Both clients, handlers, messages, state and operations |
| [Unified model](docs/unified-model.md) | What the two transports share, and what they do not |
| [Events](docs/events.md), [middleware](docs/middleware.md), [sessions](docs/sessions.md), [storage](docs/storage.md) | The framework layer |
| [Bot API](docs/bot-api.md), [MTProto](docs/mtproto.md), [formatting](docs/formatting.md) | Each subsystem |
| [Runtimes](docs/runtimes.md), [testing](docs/testing.md), [security](docs/security.md) | Where it runs, how it is checked, what it protects |

[docs/README.md](docs/README.md) indexes the design records behind all of it, and every
TypeScript sample in this file is compiled against the built packages by `pnpm check:docs`.

## Status

- **Node.js 22+ is the primary target.** Bun, Deno, workerd (locally, through Miniflare) and a
  Chromium page have also run the runtime checks: Bot API calls and webhooks, the stores, and an
  account's key exchange, encrypted calls and updates. [docs/runtimes.md](docs/runtimes.md) says
  what was run and what is inferred.
- **Against Telegram itself, one example has run, by hand.** Example 20 ran against production
  Telegram: an account signing in with a code and a two-step password, receiving status updates
  and reading users, and a bot answering commands over long polling. Everything else is checked
  against mock transports and a stand-in datacenter that speaks the real protocol, and the
  prepared live procedure has not been run; [docs/live-verification.md](docs/live-verification.md)
  records what the runs showed and what they did not.
- **The cold import is not reliably under its 100 ms target** on the machine it is measured on
  — medians from 99 to 109 ms — and stays within the 120 ms the gate allows;
  [docs/performance.md](docs/performance.md) has the method and the figures.
- [docs/roadmap.md](docs/roadmap.md) lists what is still planned.

An account acts as the person who owns it. Yuigram is not a tool for spam or flooding, and
Telegram restricts accounts used that way.

## Development

```bash
pnpm install
pnpm verify      # lint, typecheck, invariants, tests, declaration budget
pnpm smoke       # pack the packages, install them, and use them as an application would
```

[CONTRIBUTING.md](CONTRIBUTING.md) covers the rest. Report vulnerabilities privately:
[SECURITY.md](SECURITY.md).

## Licence and credits

[MIT](LICENSE). Yuigram ships no third-party code and has no runtime dependencies; both
protocols are written from Telegram's published specifications.

[mtcute](https://github.com/mtcute/mtcute), [puregram](https://github.com/puregram/puregram),
[Telethon](https://github.com/LonamiWebs/Telethon), [TDLib](https://github.com/tdlib/td) and
[grammY](https://github.com/grammyjs/grammY) were studied while designing it. No code from any of
them is used here; [NOTICE.md](NOTICE.md) says what was learned from each, and
[docs/licensing.md](docs/licensing.md) records the analysis.
