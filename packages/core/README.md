# @yuigram/core

[![npm](https://img.shields.io/npm/v/@yuigram/core.svg)](https://www.npmjs.com/package/@yuigram/core)
[![licence](https://img.shields.io/npm/l/@yuigram/core.svg)](https://github.com/yuigram/yuigram/blob/main/LICENSE)

The transport-agnostic core of [Yuigram](https://github.com/yuigram/yuigram): dispatch,
middleware, filters, the context contract, sessions, storage, errors and logging.

> **You probably want [`yuigram`](https://www.npmjs.com/package/yuigram).** It is the package
> applications install, and it re-exports everything here.

This package is published separately for two reasons. It lets a Telegram transport be built
against the shared layer without pulling in one it does not use, and it makes the architecture
enforceable: the core cannot import either protocol subsystem, and CI fails the build if it
ever does.

Nothing here knows what Telegram is. It knows that a context has a `kind`.

Node.js 22 or newer. ESM only. Zero runtime dependencies.

## Licence

[MIT](https://github.com/yuigram/yuigram/blob/main/LICENSE)
