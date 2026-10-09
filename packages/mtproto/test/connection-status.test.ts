// SPDX-License-Identifier: MPL-2.0

/**
 * An account's connection status, driven through the network it builds.
 *
 * Channels are scripted: each case holds the options a channel was opened
 * with, so it can end the channel or report a new session the way the layer
 * below would, and every timer is fired by hand. What is asserted is the
 * sequence of statuses a listener was told, not how long anything took.
 */

import { processGuard } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { Account, type ConnectionStatus } from '../src/account.js'
import { AuthKey } from '../src/message/auth-key.js'
import type { Channel, ChannelOptions } from '../src/network/channel.js'
import type { DcConfiguration } from '../src/network/dc.js'
import type { TlValue } from '../src/tl/index.js'

const address = (id: number) => ({
  id,
  host: `10.0.0.${id}`,
  port: 443,
  ipv6: false,
  mediaOnly: false,
  cdn: false,
  secret: undefined,
  tcpoOnly: false,
  thisPortOnly: false,
  static: false,
})

const BOOTSTRAP: DcConfiguration = {
  thisDc: 2,
  testMode: false,
  options: [address(2), address(4)],
}

interface Opened {
  readonly options: ChannelOptions
  readonly channel: Channel
}

interface Timer {
  readonly run: () => void
  cancelled: boolean
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

function harness(storage = memory()) {
  const opened: Opened[] = []
  const timers: Timer[] = []
  const held: { query: TlValue; answer: (value: TlValue) => void }[] = []
  let holding: ((query: TlValue) => boolean) | undefined

  const account = new Account({
    apiId: 1234,
    apiHash: 'hash',
    storage,
    keys: [],
    bootstrap: BOOTSTRAP,
    storageGuard: processGuard(),
    openChannel: async (options) => {
      const record = { closed: false }
      const channel = {
        dcId: options.address.id,
        authorization: options.authorization ?? {
          key: AuthKey.from(new Uint8Array(256)),
          salt: 0n,
          // A key with a lifetime has to say when it ends, or the datacenter
          // layer keeps asking for another.
          ...(options.expiresIn === undefined ? {} : { expiresAt: 2_000_000_000 }),
        },
        get state() {
          return record.closed ? ('closed' as const) : ('ready' as const)
        },
        invoke: async (query: TlValue) => {
          if (holding?.(query) === true) {
            return await new Promise<TlValue>((answer) => held.push({ query, answer }))
          }
          if (query._ === 'updates.getDifference') {
            return { _: 'updates.differenceEmpty', date: 1_700_000_000, seq: 0 } as TlValue
          }

          return { _: 'boolTrue' } as TlValue
        },
        bind: async () => {},
        close() {
          record.closed = true
        },
      } as unknown as Channel
      opened.push({ options, channel })

      return channel
    },
    schedule: (run) => {
      const timer: Timer = { run, cancelled: false }
      timers.push(timer)

      return () => {
        timer.cancelled = true
      }
    },
  })

  const told: ConnectionStatus[] = []
  const stop = account.onConnectionStatus((status) => told.push(status))

  return {
    account,
    storage,
    opened,
    timers,
    held,
    told,
    stop,
    hold(match: (query: TlValue) => boolean) {
      holding = match
    },
    /** Fire every timer armed and not cancelled. */
    fire() {
      for (const timer of timers.splice(0)) if (!timer.cancelled) timer.run()
    },
  }
}

async function settle(): Promise<void> {
  for (let round = 0; round < 10; round += 1) await new Promise((resolve) => setImmediate(resolve))
}

/** The channel carrying the account's updates: the first main one at its datacenter. */
const primary = (opened: readonly Opened[]): Opened | undefined =>
  opened.filter((one) => one.options.address.id === 2).at(-1)

describe("an account's connection status", () => {
  it('is offline until the connection carrying updates opens, then connected', async () => {
    const { account, told } = harness()
    expect(account.connectionStatus).toBe('offline')

    await account.connect()
    await account.api.help.getConfig()
    await settle()

    expect(told).toEqual(['connecting', 'connected'])
    expect(account.connectionStatus).toBe('connected')
    await account.stop()
  })

  it('goes offline when that connection is lost, and back through connecting when it returns', async () => {
    const { account, opened, told, fire } = harness()
    await account.connect()
    await account.api.help.getConfig()
    await settle()

    primary(opened)?.options.onClosed?.(new Error('the socket ended'))
    await settle()
    expect(account.connectionStatus).toBe('offline')

    fire()
    await settle()

    expect(told).toEqual(['connecting', 'connected', 'offline', 'connecting', 'connected'])
    await account.stop()
  })

  it('is updating while it asks what was missed, and connected once it knows', async () => {
    const storage = memory()
    // A first run leaves a place in the stream behind, which is what makes a
    // later session's gap something to catch up on.
    const first = harness(storage)
    await first.account.connect()
    await first.account.feed({ _: 'updates', updates: [], users: [], chats: [], date: 1, seq: 0 })
    await first.account.stop()

    const { account, opened, told, held, hold } = harness(storage)
    await account.connect()
    await account.api.help.getConfig()
    await settle()

    hold((query) => query._ === 'updates.getDifference')
    primary(opened)?.options.onEvent?.({ kind: 'new-session', firstMsgId: 1n, gap: true })
    await settle()
    expect(account.connectionStatus).toBe('updating')

    for (const { answer } of held.splice(0)) {
      answer({ _: 'updates.differenceEmpty', date: 1_700_000_000, seq: 0 } as TlValue)
    }
    await settle()

    expect(told).toEqual(['connecting', 'connected', 'updating', 'connected'])
    await account.stop()
  })

  it('is decided by the connection carrying updates alone', async () => {
    const { account, opened, told } = harness()
    await account.connect()
    await account.api.help.getConfig()
    await account.reach(4).invoke({ _: 'help.getConfig' })
    await settle()

    opened.find((one) => one.options.address.id === 4)?.options.onClosed?.(new Error('gone'))
    await settle()

    expect(told).toEqual(['connecting', 'connected'])
    await account.stop()
  })

  it('is offline once stopped, and tells each listener each change once', async () => {
    const { account, told } = harness()
    await account.connect()
    await account.api.help.getConfig()
    await account.stop()
    await account.stop()

    expect(told).toEqual(['connecting', 'connected', 'offline'])
    expect(account.connectionStatus).toBe('offline')
  })

  it('stops telling a listener that stopped listening', async () => {
    const { account, told, stop } = harness()
    await account.connect()
    await account.api.help.getConfig()
    stop()
    await account.stop()

    expect(told).toEqual(['connecting', 'connected'])
  })

  it('tells the other listeners when one throws', async () => {
    const { account } = harness()
    const others: ConnectionStatus[] = []
    account.onConnectionStatus(() => {
      throw new Error('a listener that fails')
    })
    account.onConnectionStatus((status) => others.push(status))

    await account.connect()
    await account.api.help.getConfig()
    await account.stop()

    expect(others).toEqual(['connecting', 'connected', 'offline'])
  })

  it('starts over from offline when the account is started again', async () => {
    const { account, told } = harness()
    await account.connect()
    await account.api.help.getConfig()
    await account.stop()
    await account.connect()
    await account.api.help.getConfig()
    await settle()

    expect(told).toEqual(['connecting', 'connected', 'offline', 'connecting', 'connected'])
    await account.stop()
  })
})
