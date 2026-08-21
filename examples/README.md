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
| 05 | [middleware](05-middleware) | Onion ordering, timing, priority bands, ending a chain early |
| 06 | [routing](06-routing) | Selecting updates by kind, command, shorthand and composed filter |
| 07 | [sessions](07-sessions) | Per-user state, typed through a flavour on the client |
| 08 | [storage](08-storage) | The built-in adapters, TTLs, and writing your own |
| 09 | [routers](09-routers) | Features as modules, each with its own scoped middleware |
| 10 | [production](10-production) | Throttling, retry, rate limiting, concurrency, clean shutdown |

## Planned

The gaps are deliberate: the examples below need the MTProto client, and keep the numbers the
[roadmap](../docs/roadmap.md) gives them.

| | Example | Phase |
|---|---|---|
| 03 | basic userbot | 10 |
| 04 | bot and userbot together | 10 |
| 11 | raw API across both transports | 11 |
| 12 | multiple clients | 11 |
