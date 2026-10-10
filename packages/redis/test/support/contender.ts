// SPDX-License-Identifier: MIT

/**
 * One contender: its own connection to the server, the agreed start, its hits
 * on the shared bucket, and what each was told.
 */

import { limiter } from '@yuigram/core'
import { Redis } from 'ioredis'
import { redisCounter } from '../../src/index.js'

const [url, namespace, hits, limit, startAt] = process.argv.slice(2)

const client = new Redis(url as string)
const limits = limiter({ counter: redisCounter(client, { namespace: namespace as string }) })
const rule = { limit: Number(limit), windowMs: 60_000, bucket: 'shared' }

await client.ping()
const early = Date.now() < Number(startAt)
while (Date.now() < Number(startAt)) {
  // Spin rather than sleep: a timer's granularity would stagger the starts.
}

const decisions: Array<[number, boolean, number]> = []
for (let index = 0; index < Number(hits); index += 1) {
  const decision = await limits.hit('user:1', rule)
  decisions.push([decision.count, decision.allowed, decision.resetMs])
}

await client.quit()
process.stdout.write(JSON.stringify({ pid: process.pid, early, decisions }))
