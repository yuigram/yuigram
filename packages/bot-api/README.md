# @yuigram/bot-api

[![npm](https://img.shields.io/npm/v/@yuigram/bot-api.svg)](https://www.npmjs.com/package/@yuigram/bot-api)
[![licence](https://img.shields.io/npm/l/@yuigram/bot-api.svg)](https://github.com/yuigram/yuigram/blob/main/LICENSE)

The Telegram Bot API subsystem of [Yuigram](https://github.com/yuigram/yuigram): the `Bot`
client, the generated method surface, long polling, webhooks and their adapters, update
normalization, file downloads, and the testing harness.

> **You probably want [`yuigram`](https://www.npmjs.com/package/yuigram).** It is the package
> applications install, and it re-exports everything here.

Published separately so the Bot API can be used without the MTProto subsystem, and so the
boundary between them is real rather than conventional — this package cannot import the MTProto
one, and CI fails the build if it ever does.

## Entry points

| Import | Contents |
|---|---|
| `@yuigram/bot-api` | The client, context, routing, filters, downloads, errors |
| `@yuigram/bot-api/webhook` | The webhook handler and its framework adapters |
| `@yuigram/bot-api/testing` | `mockBot` and the in-process transport |

Node.js 22 or newer. ESM only. Zero runtime dependencies.

## Licence

[MIT](https://github.com/yuigram/yuigram/blob/main/LICENSE)
