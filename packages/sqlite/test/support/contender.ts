// SPDX-License-Identifier: MIT

/**
 * One contender: opens its own connection to the shared file, waits for the
 * agreed moment so every process starts together, counts its hits on the same
 * bucket as fast as it can, and prints what each hit was told.
 */

import { limiter } from '@yuigram/core'
import { openDatabase, sqliteCounter } from '../../src/index.js'

const [path, hits, limit, windowMs, startAt] = process.argv.slice(2)

const database = await openDatabase(path as string)
const limits = limiter({ counter: sqliteCounter(database) })
const rule = { limit: Number(limit), windowMs: Number(windowMs), bucket: 'shared' }

// Whether this process was ready before the agreed moment, which is what
// makes the runs overlap rather than follow one another.
const early = Date.now() < Number(startAt)
while (Date.now() < Number(startAt)) {
  // Spin rather than sleep: a timer's granularity would stagger the starts.
}

// A pause between hits, as between one person's messages. Without it one
// process can take the write lock over and over while the others sit in the
// driver's busy back-off, and the runs follow one another instead of meeting.
const pause = () => new Promise((resolve) => setTimeout(resolve, 1))

const decisions: Array<[number, boolean, number]> = []
for (let index = 0; index < Number(hits); index += 1) {
  const decision = await limits.hit('user:1', rule)
  decisions.push([decision.count, decision.allowed, decision.resetMs])
  await pause()
}

database.close?.()
process.stdout.write(JSON.stringify({ pid: process.pid, early, decisions }))
