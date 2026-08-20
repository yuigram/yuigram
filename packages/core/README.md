# @yuigram/core

Transport-agnostic framework core for [Yuigram](https://github.com/yuigram/yuigram): dispatch,
middleware, filters, context, sessions, storage, errors and logging.

**You probably want [`yuigram`](https://www.npmjs.com/package/yuigram) instead** — it is the
package applications install, and it re-exports everything here.

This package exists so the shared layer can be depended on without a transport, and so the
architecture can enforce that the core knows nothing about either protocol.

Zero runtime dependencies. MIT.
