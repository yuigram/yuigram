<div align="center">

# Yuigram

**An independent TypeScript framework for the Telegram Bot API and MTProto.**

One package. Bots and user accounts. One programming model.

</div>

---

> **Status: early development.** The architecture is settled and documented; the implementation
> is being built bottom-up. There is no public API yet. See [the roadmap](docs/roadmap.md).

## What it is

Yuigram is a framework for Telegram applications that need more than a bot — a bot and a user
account in one process, sharing middleware, routing, sessions and error handling.

```ts
import { App, Bot, User } from 'yuigram'

const app = new App()

const bot = app.add(new Bot(process.env.BOT_TOKEN))
const me = app.add(new User({ apiId, apiHash, session: './me.session' }))

// Shared middleware across both clients.
app.use(async (ctx, next) => {
  ctx.log.info({ client: ctx.client.name, kind: ctx.kind })
  await next()
})

bot.command('start', (ctx) => ctx.reply('Hello!'))
me.on('message', (ctx) => archive(ctx.text))

await app.start()
```

*The API above is the design target, not yet shipped. See [docs/api-design.md](docs/api-design.md).*

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
