# yuigram

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

## Status

The Bot API subsystem is complete and usable: commands and routing, filters, middleware,
sessions, storage, file downloads, long polling, webhooks with framework adapters, a typed
surface generated from Bot API 10.2, and a testing harness that drives the real pipeline with
only the network replaced.

MTProto is next, and is being built bottom-up. Nothing shipped is stubbed.

## Independence

Yuigram implements the protocols itself. It does not depend on puregram, mtcute, grammY, or
any other Telegram library, at any layer. **The published packages have zero runtime
dependencies**, and the build fails if that stops being true.

## Documentation

Full documentation, architecture notes and the roadmap live in the
[repository](https://github.com/yuigram/yuigram).

## Licence

MIT.
