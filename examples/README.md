# Examples

Runnable examples, added as the corresponding capability ships. Each is its own TypeScript
project, the way a real application is laid out, and every one is typechecked by `pnpm verify` —
an example that stops compiling fails the build rather than quietly rotting.

## Running one

```bash
BOT_TOKEN=123456:ABC-DEF pnpm tsx examples/01-basic-bot/index.ts
```

Get a token from [@BotFather](https://t.me/BotFather). Nothing here needs anything else.

## Available now

| | Example | Shows |
|---|---|---|
| 01 | [basic bot](01-basic-bot) | The smallest complete bot: commands, an echo handler, clean shutdown |
| 02 | [keyboards](02-keyboards) | Buttons, files, escaped formatting, filters, and a flood-wait hook |
| 03 | [basic userbot](03-basic-userbot) | An account rather than a bot: a portable session, and answering what it hears |
| 04 | [bot and userbot](04-bot-and-userbot) | One app, both identities, one handler — the unified action surface |
| 05 | [middleware](05-middleware) | Onion ordering, timing, priority bands, ending a chain early |
| 06 | [routing](06-routing) | Selecting updates by kind, command, shorthand and composed filter |
| 07 | [sessions](07-sessions) | Per-user state, typed through a flavour on the client |
| 08 | [storage](08-storage) | The built-in adapters, TTLs, and writing your own |
| 09 | [routers](09-routers) | Features as modules, each with its own scoped middleware |
| 10 | [production](10-production) | Throttling, retry, rate limiting, concurrency, clean shutdown |
| 12 | [multiple clients](12-multiple-clients) | A bot and several accounts in one application, each with its own store and connections |

## The gap at 11

Eleven was held for the raw API across both transports, back when the MTProto surface it would
have needed had not shipped. It has since, and the example is not worth writing: both escape
hatches are one line each, they compose with nothing, and putting them side by side would mean
eighty lines of credentials and shutdown around two calls.

[api-design.md](../docs/api-design.md) §12 shows all four forms together — typed and untyped, on
each transport — in the space this paragraph takes, with the reason the two are shaped
differently. That is the better reference, so the number stays unused rather than filled.
