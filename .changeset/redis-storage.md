---
'@yuigram/redis': minor
---

`@yuigram/redis` keeps the key-value contract in Redis under a namespace, through the client the
application already has — node-redis, ioredis, or a function that sends one command. Expiry is
the server's, listing and clearing walk only the namespace with SCAN, and nothing connects,
disconnects or flushes on the client's behalf.

`redisCounter()` counts each rate-limit hit in one server-side script, so limits shared between
processes and machines hold exactly and use the server's clock for their windows.
