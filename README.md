<div align="center">

# Yuigram

**An independent TypeScript framework for the Telegram Bot API and MTProto.**

One package. Bots and user accounts. One programming model.

[![npm](https://img.shields.io/npm/v/yuigram.svg)](https://www.npmjs.com/package/yuigram)
[![node](https://img.shields.io/node/v/yuigram.svg)](https://nodejs.org)
[![licence](https://img.shields.io/npm/l/yuigram.svg)](LICENSE)
[![CI](https://github.com/yuigram/yuigram/actions/workflows/ci.yml/badge.svg)](https://github.com/yuigram/yuigram/actions/workflows/ci.yml)

</div>

---

> **Status: the Bot API subsystem is complete.** Every Bot API capability is reachable, and
> nothing released is a stub — unimplemented means absent, not hollow. MTProto is next and is
> being built bottom-up. See [the roadmap](docs/roadmap.md).
>
> The client surface changed after `0.1.0`. [docs/migration.md](docs/migration.md) lists every
> rename.

## What it is

Yuigram is a framework for Telegram applications that need more than a bot — a bot and a user
account in one process, sharing middleware, routing, sessions and error handling.

### Working today

```ts
import { Bot } from 'yuigram'

const bot = Bot.fromToken(process.env.BOT_TOKEN)

bot.onCommand('start', (message) => message.reply('Hello.'))
bot.onText((message) => message.reply(message.text))

bot.onError((error, event) => event.log.error('handler failed', { error }))

await bot.poll()
```

Registration decides what a handler receives. `onText` matched on the text, so
`message.text` is a `string` there; `onMessage` cannot promise that, because a photo
without a caption is a message with no text. The context types come from the Bot API
schema, so what Telegram guarantees arrives guaranteed and what it leaves optional stays
optional.

Commands and routing, filters, middleware, sessions, storage, file downloads, long polling,
webhooks with framework adapters, a typed surface generated from Bot API 10.2, and a testing
harness that drives the real pipeline with only the network replaced. See
[examples](examples).

A context also carries every API method the update already addresses, with the identifiers
filled in — `message.banChatMember({ user_id })`, `message.sendPhoto({ photo })` — and every
event kind has a named registration. Both are generated from the schema, so the surface is
complete without being maintained by hand.

Every Bot API capability is reachable — all 185 methods and 388 objects are generated and
typed. Two conveniences are still to come in v0.x: keyboard builders (pass the typed markup
object meanwhile) and streaming upload (buffer the file meanwhile).

### The design target

```ts
import { Account, App, Bot } from 'yuigram'

const app = new App()

const bot = app.add(Bot.fromToken(process.env.BOT_TOKEN))
const me = app.add(Account.fromSession('./me.session', { apiId, apiHash }))

// Shared middleware across both clients.
app.use(async (event, next) => {
  event.log.info({ transport: event.transport, kind: event.kind })
  await next()
})

bot.onCommand('start', (message) => message.reply('Hello!'))
me.onMessage((message) => archive(message.text))

await app.start()
```

*`Account` and `App` arrive with the MTProto subsystem. See [docs/api-design.md](docs/api-design.md).*

## What makes it different

**Both protocols, one framework.** No other TypeScript framework provides first-class Bot API
*and* MTProto support in a single programming model. Today that means gluing two libraries
together with two mental models, two session concepts and two error taxonomies.

**A framework over MTProto.** Middleware, filters, routing and sessions — over a user account,
not just a bot. Existing MTProto libraries are clients; you build the framework yourself.

**Applications, not clients.** One `App` holds several clients with independent lifecycles,
authentication and connection state, and shared everything else.

**Honest abstractions.** The Bot API and MTProto genuinely differ, and Yuigram does not pretend
otherwise. Divergence is carried by the type system rather than by documentation caveats —
a member exists on a type only where it actually works. See
[docs/unified-model.md](docs/unified-model.md).

## Independence

**Yuigram implements both protocols itself.** It does not depend on puregram, mtcute, grammY,
or any other Telegram library — at any layer, at any phase. The published packages have **zero
runtime dependencies**.

This is enforced, not asserted. `pnpm invariants` fails the build if a Telegram library appears
in any dependency field, or if a foreign identifier reaches a published declaration file.

Existing implementations were studied during design and are credited in [NOTICE.md](NOTICE.md).
No code from any of them is used.

## Documentation

The research and architecture phase is complete. Start with [docs/README.md](docs/README.md).

| | |
|---|---|
| [Architecture](docs/architecture.md) | System design and subsystem boundaries |
| [Unified model](docs/unified-model.md) | What can and cannot be shared between the two protocols |
| [API design](docs/api-design.md) | The intended public surface |
| [MTProto](docs/mtproto.md) | The protocol implementation specification |
| [Roadmap](docs/roadmap.md) | Phased delivery plan |
| [Migration](docs/migration.md) | What changes between releases, and what to do about it |
| [Feasibility](docs/feasibility.md) | Honest engineering assessment |

## Repository

```
packages/
├── core/      transport-agnostic framework — dispatch, middleware, filters, sessions
├── bot-api/   Bot API subsystem
├── mtproto/   MTProto subsystem
└── yuigram/   the package users install
tools/
└── invariants/ architecture checks enforced in CI
docs/          research, architecture and specifications
schemas/       committed Bot API and TL schema snapshots
```

## Development

```bash
pnpm install
pnpm verify     # lint, typecheck, invariants, tests
```

Node 22+ required. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Security

Yuigram handles Telegram credentials. A leaked MTProto session compromises an entire account.
Report vulnerabilities privately — see [SECURITY.md](SECURITY.md).

## Licence

[MIT](LICENSE)
