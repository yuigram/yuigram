// SPDX-License-Identifier: MPL-2.0

/**
 * A handler that fails, on an account nobody gave an error handler.
 *
 * Updates reach handlers off the back of the connection, with nobody awaiting
 * them, so an error there has no caller to propagate to. The dispatcher's rule
 * is that an error is handled or reported and never silent; these hold an
 * account to it.
 */

import { createLogger, type LogRecord, processGuard } from '@yuigram/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Account } from '../src/account.js'
import { AuthKey } from '../src/message/auth-key.js'
import type { Channel } from '../src/network/channel.js'
import type { DcConfiguration } from '../src/network/dc.js'
import type { TlValue } from '../src/tl/index.js'

const BOOTSTRAP: DcConfiguration = {
  thisDc: 2,
  testMode: false,
  options: [
    {
      id: 2,
      host: '10.0.0.2',
      port: 443,
      ipv6: false,
      mediaOnly: false,
      cdn: false,
      secret: undefined,
      tcpoOnly: false,
      thisPortOnly: false,
      static: false,
    },
  ],
}

function memory() {
  const entries = new Map<string, unknown>()

  return {
    get: async (key: string) => entries.get(key),
    set: async (key: string, value: unknown) => {
      entries.set(key, value)
    },
    delete: async (key: string) => {
      entries.delete(key)
    },
  }
}

function account(records: LogRecord[]): Account {
  return new Account({
    apiId: 1,
    apiHash: 'hash',
    storage: memory(),
    keys: [],
    bootstrap: BOOTSTRAP,
    storageGuard: processGuard(),
    log: createLogger({ sink: { write: (record) => records.push(record) } }),
    openChannel: async (options) =>
      ({
        dcId: options.address.id,
        authorization: options.authorization ?? {
          key: AuthKey.from(new Uint8Array(256)),
          salt: 0n,
          ...(options.expiresIn === undefined ? {} : { expiresAt: 2_000_000_000 }),
        },
        state: 'ready',
        // Where a fresh account stands, which it asks once its first update
        // arrives; anything else is answered as a peer modelling no API would.
        invoke: async (query: TlValue) =>
          (query._ === 'updates.getState'
            ? { _: 'updates.state', pts: 1, qts: 1, date: 1_700_000_000, seq: 0, unread_count: 0 }
            : { _: 'boolTrue' }) as TlValue,
        bind: async () => {},
        close() {},
      }) as unknown as Channel,
    schedule: () => () => {},
  })
}

/** Someone typing, as the stream carries it: an update with no place in the sequence to wait for. */
const pushed = (): TlValue => ({
  _: 'updateShort',
  update: { _: 'updateUserTyping', user_id: 5n, action: { _: 'sendMessageTypingAction' } },
  date: 1_700_000_000,
})

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 30))

describe('a handler that fails with no error handler registered', () => {
  const unhandled: unknown[] = []
  const listener = (reason: unknown): void => {
    unhandled.push(reason)
  }

  beforeEach(() => {
    unhandled.length = 0
    process.on('unhandledRejection', listener)
  })

  afterEach(() => {
    process.off('unhandledRejection', listener)
  })

  it('is logged as an error, neither swallowed nor left as an unhandled rejection', async () => {
    const records: LogRecord[] = []
    const client = account(records)
    client.on('mtproto:typing', () => {
      throw new Error('the handler broke')
    })
    await client.connect()

    await client.feed(pushed())
    await settle()

    const failures = records.filter((record) => record.level === 'error')
    expect(failures).toHaveLength(1)
    expect(JSON.stringify(failures[0]?.fields)).toMatch(/the handler broke/)
    expect(unhandled).toEqual([])
    await client.stop()
  })

  it('goes to the error handler instead when one is registered', async () => {
    const records: LogRecord[] = []
    const caught: unknown[] = []
    const client = account(records)
    client.on('mtproto:typing', () => {
      throw new Error('the handler broke')
    })
    client.catch((error) => {
      caught.push(error)
    })
    await client.connect()

    await client.feed(pushed())
    await settle()

    expect(caught).toHaveLength(1)
    expect(records.filter((record) => record.level === 'error')).toEqual([])
    await client.stop()
  })
})
