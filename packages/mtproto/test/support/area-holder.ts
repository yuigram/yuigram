/**
 * One run of an account, as far as its storage is concerned, in a process of
 * its own.
 *
 * Takes the account's area through the same claim an account makes when it
 * starts, over a real SQLite file or a real Redis server, and then does what
 * the parent says, one line of JSON at a time on standard input:
 *
 * ```
 *   { id, do: 'claim', takeOver? }   take the area
 *   { id, do: 'write', key, value }  write through the claimed area
 *   { id, do: 'read', key }          read through it
 *   { id, do: 'freeze', ms }         block the event loop, as a debugger or a
 *                                    stalled machine would: no timer fires
 *   { id, do: 'release' }            give the area up
 *   { id, do: 'crash' }              exit at once, releasing nothing
 * ```
 *
 * Each answer is one line on standard output, and so is a lost lease when the
 * claim reports one.
 */

import { createInterface } from 'node:readline'
import type { KV } from '@yuigram/core'
import { type AreaLease, claimArea } from '../../src/storage/ownership.js'

const [backend, location, namespace, name, holder, leaseMs] = process.argv.slice(2) as [
  string,
  string,
  string,
  string,
  string,
  string,
]

const say = (message: Record<string, unknown>): void => {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

async function open(): Promise<{ store: KV<unknown>; close(): Promise<void> }> {
  if (backend === 'sqlite') {
    const { openDatabase, sqliteStore } = await import('@yuigram/sqlite')
    const store = sqliteStore(await openDatabase(location), { ownsConnection: true })
    return { store, close: () => store.close() }
  }
  const { Redis } = await import('ioredis')
  const { redisStore } = await import('@yuigram/redis')
  const client = new Redis(location)
  const store = redisStore(client, {
    namespace: `${namespace}kv:`,
    leaseNamespace: `${namespace}lease:`,
  })
  return {
    store,
    close: async () => {
      await client.quit()
    },
  }
}

const { store, close } = await open()
let lease: AreaLease | undefined

const commands: Record<string, (command: Record<string, unknown>) => Promise<unknown>> = {
  async claim(command) {
    lease = await claimArea(store, {
      name,
      holder,
      leaseMs: Number(leaseMs),
      ...(command['takeOver'] === true ? { takeOver: true } : {}),
      onLost: (error) => say({ event: 'lost', message: error.message }),
    })
    return { scope: lease.scope }
  },
  async write(command) {
    await lease?.storage.set(command['key'] as string, command['value'])
    return {}
  },
  async read(command) {
    return { value: (await (lease?.storage ?? store).get(command['key'] as string)) ?? null }
  },
  async freeze(command) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, command['ms'] as number)
    return { held: lease?.held ?? false }
  },
  async release() {
    await lease?.release()
    return {}
  },
  async crash() {
    process.exit(0)
  },
}

say({ event: 'ready', pid: process.pid })

for await (const line of createInterface({ input: process.stdin })) {
  const command = JSON.parse(line) as Record<string, unknown>
  try {
    const answer = await commands[command['do'] as string]?.(command)
    say({ id: command['id'], ok: true, ...(answer as object) })
  } catch (error) {
    say({
      id: command['id'],
      ok: false,
      error: (error as Error).name,
      message: (error as Error).message,
    })
  }
}

await close()
