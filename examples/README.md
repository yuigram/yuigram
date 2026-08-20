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
| 05 | [middleware](05-middleware) | Onion ordering, timing, priority bands, ending a chain early |
| 06 | [routing](06-routing) | Selecting updates by kind, command, shorthand and composed filter |
| 07 | [sessions](07-sessions) | Per-user state, typed through declaration merging |
| 08 | [storage](08-storage) | The built-in adapters, TTLs, and writing your own |

## Planned

Numbering follows [../docs/roadmap.md](../docs/roadmap.md), so the gaps are deliberate — those
examples need the MTProto client.

| | Example | Phase |
|---|---|---|
| 02 | basic userbot | 10 |
| 03 | bot and userbot together | 10 |
| 04 | multiple clients | 10 |
| 09 | raw API | 10 |
| 10 | production setup | 11 |
