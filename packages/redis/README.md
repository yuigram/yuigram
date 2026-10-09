# @yuigram/redis

Redis storage for [Yuigram](https://github.com/yuigram/yuigram): a key-value store under a
namespace, for sessions, conversation state, caches and an account's own state, and an atomic
counter for rate limits shared between processes and machines.

```bash
npm install @yuigram/redis
```

> Published from `1.0.0` on. Until that release is on npm, the package is built from a
> [checkout of the repository](https://github.com/yuigram/yuigram#install).

The package opens no connection and installs no client. It sends commands through the client the
application already has — node-redis's `sendCommand`, ioredis's `call`, or a function that sends
one command.

```ts
import { Redis } from 'ioredis'
import { limiter, session, userChatKey } from 'yuigram'
import { redisCounter, redisStore } from '@yuigram/redis'

const client = new Redis(process.env.REDIS_URL)

bot.extend(
  session<Cart>({
    storage: redisStore<Cart>(client, { namespace: 'bot:sessions:' }),
    key: userChatKey,
    initial: () => ({ items: [] }),
  }),
)

// Exact across every process and machine using this server.
const limits = limiter({ counter: redisCounter(client) })
bot.use(limits.middleware({ limit: 20, windowMs: 60_000 }))
```

## What it guarantees

- **A namespace is a boundary.** Every key the store reads, writes, lists or clears begins with
  it; pattern characters in it are escaped for SCAN; `clear()` never touches another namespace
  and never flushes the database.
- **Expiry is the server's.** A time to live becomes `PX` on the write, and a write without one
  removes any the key had.
- **The counter is one script per hit** — `INCR`, `PTTL`, and `PEXPIRE` when the key has no
  expiry — which the server runs as one step, so each client counting a key is told its own
  count, and the window is the server's rather than any client's clock.
- **Values are JSON data**, with the same rules as the other persistent stores; a value that is
  not is refused with an error naming the key and never the value.
- **The client stays yours.** Nothing here connects, disconnects or selects a database.

It does **not** stop two processes from running one MTProto account against the same server.

Node.js 22 or newer. ESM only. Licensed under MPL-2.0.
