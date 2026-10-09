// SPDX-License-Identifier: MPL-2.0

/**
 * The worker protocol, across a real structured-clone boundary.
 *
 * Each case puts a host on one end of a `MessageChannel` and a caller on the
 * other, so every value is genuinely cloned and every class genuinely loses its
 * prototype on the way — which is the property the codec exists for. The host
 * holds a real account connected to in-process datacenters, so a call is a
 * real encrypted call and an update is a real pushed update.
 *
 * These are protocol tests: one thread, one event loop. What a real worker, a
 * real `SharedWorker` and two real tabs do is checked where those exist — the
 * browser check and the Node worker suite.
 */

import {
  CancelledError,
  FloodError,
  LifecycleError,
  TelegramError,
  ValidationError,
} from '@yuigram/core'
import { afterEach, describe, expect, it } from 'vitest'
import type { Account } from '../src/account.js'
import { ChatView, UserView } from '../src/entities/peer.js'
import { StickerSetView } from '../src/entities/sticker-set.js'
import type { TlValue } from '../src/tl/index.js'
import {
  type AttachedAccount,
  type AttachOptions,
  attachAccount,
  type HostOptions,
  HostUnavailableError,
  type LockManagerLike,
  PROTOCOL_VERSION,
  portEndpoint,
  RemoteError,
  WorkerHost,
} from '../src/worker/index.js'
import {
  decodeValue,
  encodeValue,
  readCallerMessage,
  readHostMessage,
} from '../src/worker/protocol.js'
import type { MockConnection } from './server/datacenter.js'
import { type MockAccount, mockAccount } from './support/mock-account.js'

/** Everything a case made, so it can all be let go afterwards. */
const opened: { close(): Promise<void> | void }[] = []

afterEach(async () => {
  for (const one of opened.splice(0).reverse()) await one.close()
})

/**
 * A host serving accounts made by `api`, and a way to attach callers to it.
 *
 * Each account the host makes is recorded, so a case can push an update down
 * its session or look at what it was asked.
 */
function hosting(
  api: (query: TlValue, account: string) => TlValue | undefined = () => undefined,
  options: Partial<HostOptions> = {},
) {
  const made = new Map<string, MockAccount>()
  const host = new WorkerHost({
    create: (name) => {
      const mock = mockAccount({ name, api: (query: TlValue) => api(query, name) } as never)
      made.set(name, mock)
      opened.push({ close: () => mock.dispose() })

      return mock.account as Account
    },
    ...options,
  })
  opened.push({ close: () => host.close() })

  const attach = async (options: AttachOptions): Promise<AttachedAccount> => {
    const channel = new MessageChannel()
    host.accept(portEndpoint(channel.port1))
    const caller = await attachAccount(portEndpoint(channel.port2), options)
    opened.push({
      close: async () => {
        await caller.detach()
        channel.port1.close()
        channel.port2.close()
      },
    })

    return caller
  }

  return { host, made, attach }
}

/** Seal a value on the newest connection that can carry one, and send it down. */
async function push(mock: MockAccount, value: TlValue): Promise<void> {
  const datacenter = mock.datacenter(2)
  const deadline = Date.now() + 5_000

  for (;;) {
    for (const connection of [...datacenter.connections].reverse() as MockConnection[]) {
      if (!connection.open()) continue
      const bytes = connection.peer.push(value)
      if (bytes !== undefined) {
        connection.push(bytes)

        return
      }
    }
    if (Date.now() > deadline) throw new Error('no connection could carry the update')
    await settle(20)
  }
}

const settle = (ms = 30): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Connect, and make one call so the session updates travel on exists.
 *
 * An account opens no connection until something needs to travel, so without
 * a call first there is nothing for a pushed update to arrive on.
 */
async function online(caller: AttachedAccount): Promise<void> {
  await caller.connect()
  await caller.api.help.getNearestDc()
}

async function until(condition: () => boolean, what: string, ms = 5_000): Promise<void> {
  const deadline = Date.now() + ms
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`)
    await settle(10)
  }
}

const typing = (userId: bigint): TlValue => ({
  _: 'updateShort',
  update: { _: 'updateUserTyping', user_id: userId, action: { _: 'sendMessageTypingAction' } },
  date: 1_700_000_000,
})

describe('the codec', () => {
  it('carries bigint, bytes, maps and nested data unchanged', () => {
    const value = {
      id: 1n,
      bytes: Uint8Array.of(1, 2),
      list: [{ n: -5n }],
      map: new Map([[1, 'a']]),
    }

    expect(decodeValue(encodeValue(value))).toEqual(value)
  })

  it('carries a view as its raw value and rebuilds it as the view', () => {
    const user = new UserView({ _: 'user', id: 7n, first_name: 'Ada' } as never)
    const rebuilt = decodeValue(structuredClone(encodeValue({ user }))) as { user: UserView }

    expect(rebuilt.user).toBeInstanceOf(UserView)
    expect(rebuilt.user.firstName).toBe('Ada')
  })

  it('carries a sticker set read on the other side, stickers and all', () => {
    const set = new StickerSetView({
      _: 'messages.stickerSet',
      set: {
        _: 'stickerSet',
        id: 9n,
        access_hash: 1n,
        title: 'Cats',
        short_name: 'cats',
        count: 1,
        hash: 0,
      },
      packs: [{ _: 'stickerPack', emoticon: '🐱', documents: [3n] }],
      keywords: [],
      documents: [{ _: 'document', id: 3n, attributes: [] } as never],
    })
    const rebuilt = decodeValue(structuredClone(encodeValue({ set }))) as { set: StickerSetView }

    expect(rebuilt.set).toBeInstanceOf(StickerSetView)
    expect(rebuilt.set.byEmoji('🐱').map((item) => item.document.id)).toEqual([3n])
  })

  it('refuses what cannot cross, naming where it was', () => {
    class Custom {}

    expect(() => encodeValue({ nested: { fn: () => 1 } })).toThrow(
      /value\.nested\.fn is a function/,
    )
    expect(() => encodeValue({ thing: new Custom() })).toThrow(/value\.thing is a Custom/)
    const loop: Record<string, unknown> = {}
    loop['self'] = loop
    expect(() => encodeValue(loop)).toThrow(/refers back to itself/)
  })

  it('rebuilds only the records a side expects, and nothing it was not told of', () => {
    expect(() => decodeValue({ '@yuigram': 'view', view: 'Account', raw: {} })).toThrow(
      /view this side does not have/,
    )
    expect(() => decodeValue({ '@yuigram': 'callback', id: 1 })).toThrow(/cannot rebuild/)
  })

  it('reads only messages of this protocol', () => {
    expect(readCallerMessage({ type: 'hello', connection: 'c', v: 1 })).toBeDefined()
    expect(readCallerMessage({ type: 'hello', connection: 'c' })).toBeUndefined()
    expect(
      readCallerMessage({ type: 'call', connection: 'c', id: 1, method: '', args: [] }),
    ).toBeUndefined()
    expect(
      readCallerMessage({ type: 'pull', connection: 'c', stream: 1, credit: 0 }),
    ).toBeUndefined()
    expect(readCallerMessage({ type: 'constructor', connection: 'c' })).toBeUndefined()
    expect(readCallerMessage('hello')).toBeUndefined()
    expect(readHostMessage({ type: 'failure', connection: 'c', id: 1, error: {} })).toBeUndefined()
  })
})

describe('calls', () => {
  it('runs a method on the host account and answers with its result', async () => {
    const { attach } = hosting((query) =>
      query._ === 'help.getNearestDc'
        ? { _: 'nearestDc', country: 'NL', this_dc: 2, nearest_dc: 2 }
        : undefined,
    )
    const caller = await attach({ account: 'main' })

    await caller.connect()
    const answer = (await caller.api.help.getNearestDc()) as { country: string }

    expect(answer.country).toBe('NL')
  })

  it('pairs concurrent answers with the calls that asked', async () => {
    const { attach } = hosting((query) =>
      query._ === 'help.getAppConfig'
        ? {
            _: 'help.appConfig',
            hash: (query as unknown as { hash: number }).hash,
            config: { _: 'jsonNull' },
          }
        : undefined,
    )
    const caller = await attach({ account: 'main' })
    await caller.connect()

    const answers = await Promise.all(
      Array.from({ length: 12 }, (_, hash) => caller.api.help.getAppConfig({ hash })),
    )

    expect(answers.map((one) => (one as { hash: number }).hash)).toEqual(
      Array.from({ length: 12 }, (_, hash) => hash),
    )
  })

  it('carries bigint and bytes to the host and back unchanged', async () => {
    const seen: TlValue[] = []
    const { attach } = hosting((query) => {
      if (query._ !== 'upload.getFile') return undefined
      seen.push(query)

      return {
        _: 'upload.file',
        type: { _: 'storage.filePartial' },
        bytes: Uint8Array.of(9, 8, 7),
        mtime: 0,
      }
    })
    const caller = await attach({ account: 'main' })
    await caller.connect()

    const bytes = await caller.downloadChunk({
      location: {
        _: 'inputDocumentFileLocation',
        id: 2n ** 62n,
        access_hash: -5n,
        file_reference: Uint8Array.of(1, 2),
        thumb_size: '',
      } as never,
      dcId: 2,
      offset: 0,
      length: 1024,
    })

    expect([...bytes]).toEqual([9, 8, 7])
    const location = seen[0]?.['location'] as { id: bigint; file_reference: Uint8Array }
    expect(location.id).toBe(2n ** 62n)
    expect([...location.file_reference]).toEqual([1, 2])
  })

  it('rebuilds a view the host answered with', async () => {
    const { attach } = hosting((query) =>
      query._ === 'communities.getJoinedCommunities'
        ? {
            _: 'messages.chats',
            chats: [
              {
                _: 'community',
                id: 500n,
                access_hash: 501n,
                title: 'Builders',
                photo: { _: 'chatPhotoEmpty' },
                date: 1,
              },
            ],
          }
        : undefined,
    )
    const caller = await attach({ account: 'main' })
    await caller.connect()

    const [community] = await caller.getJoinedCommunities()

    // The class and its behaviour are rebuilt here, not merely its fields.
    expect(community).toBeInstanceOf(ChatView)
    expect(community?.isCommunity).toBe(true)
    expect(community?.title).toBe('Builders')
  })

  it('refuses to read anything that is not a listed property', async () => {
    const { attach } = hosting()
    const caller = await attach({ account: 'main' })

    await expect(
      (caller as unknown as { read(name: string): Promise<unknown> }).read('api'),
    ).rejects.toThrow(/not something a caller may read/)
  })

  it('refuses a function anywhere a method did not declare one', async () => {
    const { attach } = hosting()
    const caller = await attach({ account: 'main' })

    await expect(caller.sendText('@someone', (() => 'x') as never)).rejects.toThrow(
      /value\[1\] is not a place 'sendText' takes a function/,
    )
  })
})

describe('errors', () => {
  it('arrive as the class they were, with their fields', async () => {
    const { attach } = hosting((query) => {
      if (query._ === 'help.getNearestDc') throw new TelegramError('FLOOD_WAIT_5 (420)')
      if (query._ === 'help.getAppConfig') throw new TelegramError('CHAT_ADMIN_REQUIRED (400)')

      return undefined
    })
    const caller = await attach({ account: 'main' })
    await caller.connect()

    const flood = await caller.api.help.getNearestDc().catch((error: unknown) => error)
    expect(flood).toBeInstanceOf(FloodError)
    expect((flood as FloodError).retryAfter).toBe(5)

    const refused = await caller.api.help.getAppConfig({ hash: 0 }).catch((error: unknown) => error)
    expect(refused).toBeInstanceOf(TelegramError)
    expect((refused as Error).message).toMatch(/CHAT_ADMIN_REQUIRED/)
  })

  it('keep the name of a class this side does not have', async () => {
    const { attach } = hosting()
    const caller = await attach({ account: 'main' })

    // Never connected, so the account refuses with its own error class.
    const failure = await caller.api.help.getNearestDc().catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).name).toMatch(/LifecycleError|RemoteError/)
    expect((failure as Error).message).toMatch(/not connected/)
  })

  it('rebuild an unfamiliar class as a remote error carrying its name', () => {
    const rebuilt = decodeValue(structuredClone({})) // a plain value passes untouched
    expect(rebuilt).toEqual({})
    const remote = new RemoteError({
      name: 'StorageOwnershipError',
      message: 'held',
      fields: { area: 'x' },
    })
    expect(remote.name).toBe('StorageOwnershipError')
    expect((remote as unknown as { area: string }).area).toBe('x')
  })
})

describe('cancellation', () => {
  it('stops the operation on the host, not only the wait for it', async () => {
    let asked = 0
    const { attach, host } = hosting((query) => {
      if (query._ !== 'upload.getFile') return undefined
      asked += 1

      return {
        _: 'upload.file',
        type: { _: 'storage.filePartial' },
        bytes: new Uint8Array(4096),
        mtime: 0,
      }
    })
    const caller = await attach({ account: 'main' })
    await caller.connect()

    const giveUp = new AbortController()
    const download = caller.download({
      location: {
        _: 'inputDocumentFileLocation',
        id: 1n,
        access_hash: 1n,
        file_reference: new Uint8Array(),
        thumb_size: '',
      } as never,
      dcId: 2,
      size: 4096 * 400,
      limit: 4096,
      concurrency: 1,
      signal: giveUp.signal,
    })
    await until(() => asked > 2, 'the download to start')
    giveUp.abort()

    await expect(download).rejects.toThrow(CancelledError)
    // What was already in flight may land; after that, nothing more is asked.
    await settle(100)
    const settled = asked
    await settle(200)

    expect(asked).toBe(settled)
    expect(asked).toBeLessThan(20)
    expect(host.info().pendingCalls).toBe(0)
  })
})

describe('streams', () => {
  const serving = (size: number) => (query: TlValue) => {
    if (query._ !== 'upload.getFile') return undefined
    const offset = Number(query['offset'])
    const end = Math.min(offset + Number(query['limit']), size)
    const bytes = new Uint8Array(Math.max(0, end - offset))
    for (let at = 0; at < bytes.length; at += 1) bytes[at] = (offset + at) % 251

    return { _: 'upload.file', type: { _: 'storage.filePartial' }, bytes, mtime: 0 }
  }
  const location = {
    _: 'inputDocumentFileLocation',
    id: 1n,
    access_hash: 1n,
    file_reference: new Uint8Array(),
    thumb_size: '',
  } as never

  it('delivers a whole file in order, pulled across the port', async () => {
    const { attach } = hosting(serving(4096 * 3 + 7))
    const caller = await attach({ account: 'main' })
    await caller.connect()

    const parts: Uint8Array[] = []
    for await (const chunk of caller.downloadIterable({
      location,
      dcId: 2,
      size: 4096 * 3 + 7,
      limit: 4096,
      concurrency: 1,
    })) {
      parts.push(chunk as Uint8Array)
    }

    const whole = parts.flatMap((part) => [...part])
    expect(whole).toHaveLength(4096 * 3 + 7)
    expect(whole.every((byte, index) => byte === index % 251)).toBe(true)
  })

  it('stops the host reading when the caller stops', async () => {
    let asked = 0
    const serve = serving(4096 * 200)
    const { attach, host } = hosting((query) => {
      if (query._ === 'upload.getFile') asked += 1

      return serve(query)
    })
    const caller = await attach({ account: 'main', streamCredit: 2 })
    await caller.connect()

    for await (const chunk of caller.downloadIterable({
      location,
      dcId: 2,
      size: 4096 * 200,
      limit: 4096,
      concurrency: 1,
    })) {
      void chunk
      break
    }
    await settle(100)

    // One batch of credit ahead at most, and nothing left open on the host.
    expect(asked).toBeLessThan(10)
    expect(host.info().streams).toBe(0)
  })

  it('wears the web stream shape over the same stream', async () => {
    const { attach } = hosting(serving(4096 * 2))
    const caller = await attach({ account: 'main' })
    await caller.connect()

    const stream = await caller.downloadAsStream({
      location,
      dcId: 2,
      size: 4096 * 2,
      limit: 4096,
      concurrency: 1,
    })
    let total = 0
    for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>) total += chunk.length

    expect(total).toBe(4096 * 2)
  })
})

describe('callbacks', () => {
  const SENT: TlValue = {
    _: 'auth.sentCode',
    type: { _: 'auth.sentCodeTypeApp', length: 5 },
    phone_code_hash: 'hash-of-the-code',
    timeout: 60,
  }

  it('asks the caller for what only the caller knows, and nothing else crosses', async () => {
    const { attach } = hosting((query) => {
      if (query._ === 'updates.getState') throw new TelegramError('AUTH_KEY_UNREGISTERED (401)')
      if (query._ === 'auth.sendCode') return SENT
      if (query._ === 'auth.signIn')
        return { _: 'auth.authorization', user: { _: 'user', id: 7n, access_hash: 11n } }

      return undefined
    })
    const caller = await attach({ account: 'main' })
    await caller.connect()
    const asked: string[] = []

    await caller.signIn({
      phone: () => {
        asked.push('phone')

        return '+70000000000'
      },
      code: async () => {
        asked.push('code')

        return '12345'
      },
    })

    expect(asked).toEqual(['phone', 'code'])
  })

  it('hands each chunk to a sink here, and the transfer waits for it', async () => {
    const serve = (query: TlValue) =>
      query._ === 'upload.getFile'
        ? {
            _: 'upload.file',
            type: { _: 'storage.filePartial' },
            bytes: new Uint8Array(4096).fill(3),
            mtime: 0,
          }
        : undefined
    const { attach } = hosting(serve)
    const caller = await attach({ account: 'main' })
    await caller.connect()

    const written: number[] = []
    const outcome = await caller.downloadTo({
      location: {
        _: 'inputDocumentFileLocation',
        id: 1n,
        access_hash: 1n,
        file_reference: new Uint8Array(),
        thumb_size: '',
      } as never,
      dcId: 2,
      size: 4096 * 3,
      limit: 4096,
      concurrency: 1,
      write: async (bytes: Uint8Array, offset: number) => {
        await settle(5)
        written.push(offset, bytes.length)
      },
    } as never)

    expect(written).toEqual([0, 4096, 4096, 4096, 8192, 4096])
    expect(outcome.size).toBe(4096 * 3)
  })

  it('reports a callback that failed as the failure of the call', async () => {
    const { attach } = hosting((query) => {
      if (query._ === 'updates.getState') throw new TelegramError('AUTH_KEY_UNREGISTERED (401)')

      return undefined
    })
    const caller = await attach({ account: 'main' })
    await caller.connect()

    await expect(
      caller.signIn({
        phone: () => {
          throw new Error('the user closed the dialog')
        },
        code: () => '1',
      }),
    ).rejects.toThrow(/the user closed the dialog/)
  })
})

describe('handles', () => {
  it('stops what a handle started, and releases orphaned ones when the caller leaves', async () => {
    let online = 0
    const { attach, host } = hosting((query) => {
      if (query._ === 'account.updateStatus')
        online += (query as { offline?: boolean }).offline === true ? 0 : 1

      return undefined
    })
    const caller = await attach({ account: 'main' })
    await caller.connect()

    const stop = await caller.stayOnline()
    await until(() => online > 0, 'the presence to be said')
    expect(host.info().handles).toBe(1)
    await stop()
    // Stopped, so the host no longer holds it; stopping again does nothing.
    expect(host.info().handles).toBe(0)
    await stop()

    await caller.stayOnline()
    expect(host.info().handles).toBe(1)
    await caller.detach()
    await settle()

    // The caller that asked for the presence is gone, so the host stopped it.
    expect(host.info().handles).toBe(0)
  })
})

describe('updates', () => {
  it('reach a handler here, in the order they arrived there', async () => {
    const { attach, made } = hosting()
    const caller = await attach({ account: 'main' })
    const seen: bigint[] = []
    caller.on('mtproto:typing', (event) => {
      seen.push(event.sender?.id ?? 0n)
    })
    await online(caller)

    const mock = made.get('main') as MockAccount
    for (const id of [1n, 2n, 3n, 4n]) await push(mock, typing(id))
    await until(() => seen.length === 4, 'four updates')

    expect(seen).toEqual([1n, 2n, 3n, 4n])
  })

  it('go to every caller of the account, and a throwing handler hurts nobody else', async () => {
    const { attach, made } = hosting()
    const first = await attach({ account: 'main' })
    const second = await attach({ account: 'main' })
    const reached: string[] = []
    first.on('mtproto:typing', () => {
      reached.push('first')
      throw new Error('this handler is broken')
    })
    first.catch(() => {})
    second.on('mtproto:typing', () => {
      reached.push('second')
    })
    await online(first)
    await second.connect()

    await push(made.get('main') as MockAccount, typing(9n))
    await until(() => reached.length === 2, 'both callers')

    expect(reached.sort()).toEqual(['first', 'second'])
    // Both callers share one account: it was made once and connected once.
    expect(made.size).toBe(1)
  })

  it('stay with the account they arrived on', async () => {
    const { attach, made, host } = hosting()
    const main = await attach({ account: 'main' })
    const other = await attach({ account: 'other' })
    const reached: string[] = []
    main.on('mtproto:typing', () => reached.push('main'))
    other.on('mtproto:typing', () => reached.push('other'))
    await online(main)
    await online(other)

    await push(made.get('main') as MockAccount, typing(1n))
    await until(() => reached.length > 0, 'the update')
    await settle(100)

    expect(reached).toEqual(['main'])
    expect(host.info().accounts.map((one) => [one.id, one.created])).toEqual([
      ['main', 1],
      ['other', 1],
    ])
  })

  it('let a caller that stops acknowledging go, and say so, rather than dropping its updates', async () => {
    const { host, made } = hosting(undefined, { window: 2, backlog: 3 })
    const channel = new MessageChannel()
    host.accept(portEndpoint(channel.port1))
    opened.push({ close: () => void channel.port1.close() })

    // A caller that attaches and then never acknowledges anything.
    const received: { type: string }[] = []
    channel.port2.onmessage = (event: MessageEvent) => received.push(event.data as { type: string })
    channel.port2.postMessage({ type: 'hello', connection: 'silent', v: PROTOCOL_VERSION })
    await until(() => received.some((one) => one.type === 'welcome'), 'a welcome')
    channel.port2.postMessage({
      type: 'attach',
      connection: 'silent',
      account: 'main',
      updates: true,
    })
    await until(() => received.some((one) => one.type === 'attached'), 'the attach')
    channel.port2.postMessage({
      type: 'call',
      connection: 'silent',
      id: 1,
      method: 'connect',
      args: [],
    })
    await until(() => received.filter((one) => one.type === 'result').length === 1, 'connecting')
    channel.port2.postMessage({
      type: 'call',
      connection: 'silent',
      id: 2,
      method: '@call',
      args: [{ _: 'help.getNearestDc' }],
    })
    await until(() => received.filter((one) => one.type === 'result').length === 2, 'a session')

    for (let id = 1n; id <= 8n; id += 1n) await push(made.get('main') as MockAccount, typing(id))
    await until(() => received.some((one) => one.type === 'lagged'), 'the lag notice')

    // Two within the window were sent; the rest were held, then the caller was
    // let go with a count rather than quietly losing them.
    expect(received.filter((one) => one.type === 'update')).toHaveLength(2)
    expect(host.info().callers).toBe(0)
    channel.port2.close()
  })
})

describe('lifecycle', () => {
  it('lets one caller leave without disturbing another', async () => {
    const { attach, host } = hosting()
    const first = await attach({ account: 'main' })
    const second = await attach({ account: 'main' })
    await first.connect()

    await first.detach()
    await settle()

    expect(host.info().callers).toBe(1)
    await expect(second.read('state')).resolves.toBe('running')
    await expect(first.read('state')).rejects.toThrow(/detached/)
  })

  it('tells every caller when the account is stopped', async () => {
    const { attach } = hosting()
    const first = await attach({ account: 'main' })
    const second = await attach({ account: 'main' })
    const told: string[] = []
    second.onEvent((event) => told.push(event.kind))
    await first.connect()

    await first.stop()
    await until(() => told.length > 0, 'the stop notice')

    expect(told).toEqual(['stopped'])
    await expect(second.read('state')).resolves.toBe('idle')
  })

  it('stops the account when its last caller leaves, if told to', async () => {
    const { attach, host } = hosting(undefined, { onLastDetached: 'stop' })
    const caller = await attach({ account: 'main' })
    await caller.connect()

    await caller.detach()
    await until(() => host.info().accounts[0]?.state === 'idle', 'the account to stop')

    expect(host.info().accounts[0]?.state).toBe('idle')
  })

  it('refuses a caller speaking another version', async () => {
    const host = new WorkerHost({ create: () => mockAccount().account as Account })
    opened.push({ close: () => host.close() })
    const channel = new MessageChannel()
    host.accept(portEndpoint(channel.port1))
    const received: { type: string }[] = []
    channel.port2.onmessage = (event: MessageEvent) => received.push(event.data as { type: string })

    channel.port2.postMessage({ type: 'hello', connection: 'old', v: PROTOCOL_VERSION + 1 })
    await until(() => received.length > 0, 'an answer')

    expect(received[0]?.type).toBe('mismatch')
    channel.port1.close()
    channel.port2.close()
  })

  it('drops what is not this protocol, and keeps serving', async () => {
    const { attach, host } = hosting()
    const channel = new MessageChannel()
    host.accept(portEndpoint(channel.port1))

    channel.port2.postMessage('garbage')
    channel.port2.postMessage({ type: 'call', connection: 'x' })
    channel.port2.postMessage({ type: 'invented', connection: 'x' })
    await settle(50)

    expect(host.info().malformed).toBe(3)
    const caller = await attach({ account: 'main' })
    await expect(caller.read('state')).resolves.toBe('idle')
    channel.port1.close()
    channel.port2.close()
  })

  it('fails every waiting call when the host stops answering', async () => {
    // A host that greets and attaches, then goes silent.
    const channel = new MessageChannel()
    channel.port1.onmessage = (event: MessageEvent) => {
      const message = event.data as { type: string; connection: string; account?: string }
      if (message.type === 'hello')
        channel.port1.postMessage({
          type: 'welcome',
          connection: message.connection,
          v: PROTOCOL_VERSION,
        })
      if (message.type === 'attach')
        channel.port1.postMessage({
          type: 'attached',
          connection: message.connection,
          account: message.account,
          status: 'connected',
        })
    }
    const timers: (() => void)[] = []
    let now = 0
    const caller = await attachAccount(portEndpoint(channel.port2), {
      account: 'main',
      pingEvery: 1_000,
      hostTimeout: 3_000,
      schedule: (run) => {
        timers.push(run)

        return () => {}
      },
      now: () => now,
    })
    const told: string[] = []
    caller.onEvent((event) => told.push(event.kind))

    const waiting = caller.me()
    // The first timers belong to the opening exchanges; the ping round is the
    // last. The first round sends a ping; only a later round finding it still
    // unanswered past the timeout counts the host as gone.
    now = 1_000
    timers.at(-1)?.()
    now = 3_500
    timers.at(-1)?.()
    expect(told).toEqual([])
    now = 4_500
    timers.at(-1)?.()

    await expect(waiting).rejects.toThrow(HostUnavailableError)
    expect(told).toEqual(['host-lost'])
    channel.port1.close()
    channel.port2.close()
  })

  it('lets a caller that goes quiet expire, and releases what it held', async () => {
    const timers: (() => void)[] = []
    let now = 0
    const { host } = hosting(undefined, {
      expireAfter: 1_000,
      sweepEvery: 500,
      schedule: (run) => {
        timers.push(run)

        return () => {}
      },
      now: () => now,
    })
    const channel = new MessageChannel()
    host.accept(portEndpoint(channel.port1))
    const received: { type: string }[] = []
    channel.port2.onmessage = (event: MessageEvent) => received.push(event.data as { type: string })
    channel.port2.postMessage({ type: 'hello', connection: 'quiet', v: PROTOCOL_VERSION })
    await until(() => received.length > 0, 'a welcome')

    now = 2_000
    timers.shift()?.()
    await until(() => received.some((one) => one.type === 'expired'), 'the expiry')

    expect(host.info().callers).toBe(0)
    channel.port1.close()
    channel.port2.close()
  })
})

describe('what the boundary refuses', () => {
  it('refuses a caller that has not said hello', async () => {
    const { host } = hosting()
    const channel = new MessageChannel()
    host.accept(portEndpoint(channel.port1))
    const received: { type: string; reason?: string }[] = []
    channel.port2.onmessage = (event: MessageEvent) => received.push(event.data as { type: string })

    channel.port2.postMessage({
      type: 'call',
      connection: 'stranger',
      id: 1,
      method: 'me',
      args: [],
    })
    await until(() => received.length > 0, 'a refusal')

    expect(received[0]).toMatchObject({
      type: 'protocol-error',
      reason: /has not said hello/ as never,
    })
    channel.port1.close()
    channel.port2.close()
  })

  it('refuses a call before attaching', async () => {
    const { host } = hosting()
    const channel = new MessageChannel()
    host.accept(portEndpoint(channel.port1))
    const received: { type: string; error?: { message: string } }[] = []
    channel.port2.onmessage = (event: MessageEvent) => received.push(event.data as never)
    channel.port2.postMessage({ type: 'hello', connection: 'early', v: PROTOCOL_VERSION })
    await until(() => received.length > 0, 'a welcome')

    channel.port2.postMessage({ type: 'call', connection: 'early', id: 1, method: 'me', args: [] })
    await until(() => received.length > 1, 'a refusal')

    expect(received[1]).toMatchObject({ type: 'failure', error: { name: 'LifecycleError' } })
    channel.port1.close()
    channel.port2.close()
  })

  it('refuses an unlisted method by name', async () => {
    const { host } = hosting()
    const channel = new MessageChannel()
    host.accept(portEndpoint(channel.port1))
    const received: { type: string; error?: { message: string; name: string } }[] = []
    channel.port2.onmessage = (event: MessageEvent) => received.push(event.data as never)
    channel.port2.postMessage({ type: 'hello', connection: 'c', v: PROTOCOL_VERSION })
    channel.port2.postMessage({ type: 'attach', connection: 'c', account: 'main', updates: false })
    await until(() => received.length > 1, 'the attach')

    for (const [id, method] of [
      [2, 'deliver'],
      [3, 'constructor'],
      [4, '__proto__'],
      [5, 'surround'],
    ] as const) {
      channel.port2.postMessage({ type: 'call', connection: 'c', id, method, args: [] })
    }
    await until(() => received.length > 5, 'four refusals')

    const refusals = received.slice(2)
    expect(
      refusals.every((one) => one.type === 'failure' && one.error?.name === 'ValidationError'),
    ).toBe(true)
    channel.port1.close()
    channel.port2.close()
  })

  it('reports refusals as the errors they are', () => {
    expect(new ValidationError('x')).toBeInstanceOf(Error)
    expect(new LifecycleError('x').name).toBe('LifecycleError')
  })
})

/**
 * An account with only the parts the host touches, each one observable.
 *
 * For the branches a real account cannot be made to reach on demand: a call
 * that never settles, a handle whose methods record their use, a property the
 * getter list does not name.
 */
function scriptedAccount() {
  const stopped: string[] = []
  const takeout = {
    id: 5n,
    finished: false,
    call: async (query: TlValue) => ({ _: 'echo', of: query._ }),
    finish: async (succeeded: boolean) => {
      takeout.finished = succeeded
    },
  }
  const account = {
    name: 'scripted',
    state: 'running',
    unlisted: 'a plain value the getter list does not name',
    connectionStatus: 'connected',
    onConnectionStatus: () => () => {},
    surround: () => {},
    stop: async () => true,
    download: () => new Promise(() => {}),
    stayOnline: () => () => {
      stopped.push('presence')
    },
    initTakeoutSession: async () => takeout,
    history: async function* () {
      for (let at = 0; at < 50; at += 1) yield { n: at }
    },
    exportSession: async () => 'not-a-real-session',
  }

  return { account: account as unknown as Account, stopped, takeout }
}

/** A host serving `make`, closed when the case ends. */
function scriptedHost(make: (name: string) => Account | Promise<Account>): WorkerHost {
  const host = new WorkerHost({ create: make })
  opened.push({ close: () => host.close() })

  return host
}

/** A port to `host` driven by hand, recording everything the host says. */
function rawCaller(host: WorkerHost, connection = 'raw') {
  const channel = new MessageChannel()
  host.accept(portEndpoint(channel.port1))
  const received: Record<string, unknown>[] = []
  channel.port2.onmessage = (event: MessageEvent) => received.push(event.data as never)
  opened.push({
    close: () => {
      channel.port1.close()
      channel.port2.close()
    },
  })

  const send = (message: Record<string, unknown>): void =>
    channel.port2.postMessage({ connection, ...message })
  const answered = (id: number) => (one: Record<string, unknown>) =>
    one['id'] === id && (one['type'] === 'result' || one['type'] === 'failure')

  return {
    received,
    send,
    async greet(account = 'main'): Promise<void> {
      send({ type: 'hello', v: PROTOCOL_VERSION })
      send({ type: 'attach', account, updates: true })
      await until(() => received.some((one) => one['type'] === 'attached'), 'the attach')
    },
    async answerTo(id: number): Promise<Record<string, unknown>> {
      await until(() => received.some(answered(id)), `an answer to call ${id}`)

      return received.find(answered(id)) as Record<string, unknown>
    },
  }
}

describe('the boundary, against a scripted account', () => {
  it('refuses a connection name spoken for on another port', async () => {
    const host = scriptedHost(() => scriptedAccount().account)
    const owner = rawCaller(host, 'owned')
    await owner.greet()

    // The same connection name from a port that never said hello on it.
    const impostor = rawCaller(host, 'owned')
    impostor.send({ type: 'call', id: 1, method: 'exportSession', args: [] })
    await until(() => impostor.received.length > 0, 'a refusal')
    await settle(50)

    expect(impostor.received[0]).toMatchObject({ type: 'protocol-error' })
    expect(owner.received.some((one) => one['id'] === 1)).toBe(false)
  })

  it('refuses a function at a place the method does not take one', async () => {
    const host = scriptedHost(() => scriptedAccount().account)
    const raw = rawCaller(host)
    await raw.greet()

    raw.send({
      type: 'call',
      id: 7,
      method: 'sendText',
      args: ['@someone', { '@yuigram': 'callback', id: 1 }],
    })
    const answer = await raw.answerTo(7)

    expect(answer).toMatchObject({ type: 'failure', error: { name: 'ValidationError' } })
    expect((answer['error'] as { message: string }).message).toMatch(
      /value\[1\] is not a place 'sendText' takes a function/,
    )
  })

  it('makes an account once, however many callers attach at the same moment', async () => {
    let made = 0
    const { account } = scriptedAccount()
    const host = scriptedHost(async () => {
      made += 1
      await settle(50)

      return account
    })

    await Promise.all(['a', 'b', 'c'].map((name) => rawCaller(host, name).greet()))

    expect(made).toBe(1)
    expect(host.info().accounts).toEqual([
      expect.objectContaining({ id: 'main', created: 1, callers: 3 }),
    ])
  })

  it('sends a stream no further ahead than the credit it was given', async () => {
    const host = scriptedHost(() => scriptedAccount().account)
    const raw = rawCaller(host)
    await raw.greet()

    raw.send({ type: 'call', id: 1, method: 'history', args: ['@someone'] })
    const opening = await raw.answerTo(1)
    const stream = (opening['value'] as { id: number }).id
    raw.send({ type: 'pull', stream, credit: 3 })
    const items = () => raw.received.filter((one) => one['type'] === 'item')
    await until(() => items().length === 3, 'three items')
    await settle(100)

    expect(items().map((one) => one['value'])).toEqual([{ n: 0 }, { n: 1 }, { n: 2 }])
  })

  it('stops what a handle started when the caller holding it leaves', async () => {
    const { account, stopped } = scriptedAccount()
    const host = scriptedHost(() => account)
    const raw = rawCaller(host)
    await raw.greet()

    raw.send({ type: 'call', id: 1, method: 'stayOnline', args: [] })
    await raw.answerTo(1)
    expect(stopped).toEqual([])

    raw.send({ type: 'release' })
    await until(() => stopped.length > 0, 'the presence to stop')

    expect(stopped).toEqual(['presence'])
  })

  it('refuses to read a property the getter list does not name', async () => {
    const host = scriptedHost(() => scriptedAccount().account)
    const raw = rawCaller(host)
    await raw.greet()

    raw.send({ type: 'call', id: 3, method: '@get', args: ['unlisted'] })
    const answer = await raw.answerTo(3)

    expect(answer).toMatchObject({ type: 'failure', error: { name: 'ValidationError' } })
    expect(JSON.stringify(answer)).not.toContain('a plain value')
  })

  it('forgets an aborted call at once, even one that never finishes', async () => {
    const host = scriptedHost(() => scriptedAccount().account)
    const raw = rawCaller(host)
    await raw.greet()

    raw.send({ type: 'call', id: 9, method: 'download', args: [{}] })
    await until(() => host.info().pendingCalls === 1, 'the call to be pending')
    raw.send({ type: 'abort', id: 9 })
    await until(() => host.info().pendingCalls === 0, 'the call to be forgotten', 1_000)

    expect(host.info().pendingCalls).toBe(0)
  })

  it('keeps two callers on one port apart, though their call numbers collide', async () => {
    const host = scriptedHost(
      (name) =>
        ({
          ...(scriptedAccount().account as object),
          exportSession: async () => `session-${name}`,
        }) as unknown as Account,
    )
    const channel = new MessageChannel()
    host.accept(portEndpoint(channel.port1))
    opened.push({
      close: () => {
        channel.port1.close()
        channel.port2.close()
      },
    })

    const one = await attachAccount(portEndpoint(channel.port2), { account: 'one' })
    const two = await attachAccount(portEndpoint(channel.port2), { account: 'two' })
    const answers = await Promise.all([one.exportSession(), two.exportSession()])

    expect(answers).toEqual(['session-one', 'session-two'])
    await one.detach()
    await two.detach()
  })

  it('calls a handle’s methods by name', async () => {
    const { account, takeout } = scriptedAccount()
    const host = scriptedHost(() => account)
    const channel = new MessageChannel()
    host.accept(portEndpoint(channel.port1))
    opened.push({
      close: () => {
        channel.port1.close()
        channel.port2.close()
      },
    })
    const caller = await attachAccount(portEndpoint(channel.port2), { account: 'main' })

    const remote = await caller.initTakeoutSession()
    const echoed = await remote.call({ _: 'messages.getHistory' } as TlValue)
    await remote.finish(true)

    expect(remote.id).toBe(5n)
    expect(echoed).toEqual({ _: 'echo', of: 'messages.getHistory' })
    expect(takeout.finished).toBe(true)
    await caller.detach()
  })
})

describe('update flow control, end to end', () => {
  it('keeps a caller that acknowledges, however far past its window updates run', async () => {
    const { attach, made, host } = hosting(undefined, { window: 2, backlog: 100 })
    const caller = await attach({ account: 'main', ackEvery: 1 })
    const seen: bigint[] = []
    caller.on('mtproto:typing', (event) => {
      seen.push(event.sender?.id ?? 0n)
    })
    await online(caller)

    for (let id = 1n; id <= 8n; id += 1n) await push(made.get('main') as MockAccount, typing(id))
    await until(() => seen.length === 8, 'all eight updates')

    // Two at a time were let out; each acknowledgement made room for the next.
    expect(seen).toEqual([1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n])
    expect(host.info().callers).toBe(1)
  })
})

describe('connection status across the boundary', () => {
  it('tells a caller each change the hosted account makes, in order', async () => {
    const { attach } = hosting()
    const caller = await attach({ account: 'main' })
    const told: string[] = []
    caller.onConnectionStatus((status) => told.push(status))
    expect(caller.connectionStatus).toBe('offline')

    await online(caller)
    await until(() => told.includes('connected'), 'the account to be connected')
    await caller.stop()
    await until(() => told.at(-1) === 'offline', 'the account to go offline')

    expect(told).toEqual(['connecting', 'connected', 'offline'])
  })

  it('gives a caller attaching later the status as it is', async () => {
    const { attach } = hosting()
    const first = await attach({ account: 'main' })
    await online(first)
    await until(() => first.connectionStatus === 'connected', 'the first caller to see it')

    const second = await attach({ account: 'main' })

    expect(second.connectionStatus).toBe('connected')
  })

  it('stops telling a listener that stopped listening, and says offline once a caller ends', async () => {
    const { attach } = hosting()
    const caller = await attach({ account: 'main' })
    const kept: string[] = []
    const dropped: string[] = []
    caller.onConnectionStatus((status) => kept.push(status))
    const stop = caller.onConnectionStatus((status) => dropped.push(status))
    stop()

    await online(caller)
    await until(() => kept.includes('connected'), 'the account to be connected')
    await caller.detach()

    expect(dropped).toEqual([])
    expect(kept).toEqual(['connecting', 'connected', 'offline'])
    expect(caller.connectionStatus).toBe('offline')
  })
})

/**
 * Web Locks, in one process.
 *
 * A lock is granted to the first request for its name and to each waiting one
 * in turn as the holder lets go. `destroy` is what closing the context that
 * holds a lock does: the lock goes, and the holder runs nothing more.
 */
class ContextLocks implements LockManagerLike {
  readonly #queues = new Map<string, (() => void)[]>()
  readonly #releases = new Map<string, () => void>()

  request(name: string, callback: () => Promise<unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const queue = this.#queues.get(name) ?? []
      this.#queues.set(name, queue)
      queue.push(() => {
        let released = false
        const release = (): void => {
          if (released) return
          released = true
          this.#releases.delete(name)
          queue.shift()
          queue[0]?.()
        }
        this.#releases.set(name, release)
        callback().then(
          (value) => {
            resolve(value)
            release()
          },
          (error: unknown) => {
            reject(error)
            release()
          },
        )
      })
      if (queue.length === 1) queue[0]?.()
    })
  }

  destroy(name: string): void {
    this.#releases.get(name)?.()
  }

  held(name: string): boolean {
    return this.#releases.has(name)
  }
}

describe('a caller whose context is watched through a lock', () => {
  /** A host on manual time over a scripted account, and callers attached to it. */
  function watched() {
    const locks = new ContextLocks()
    const sweeps: (() => void)[] = []
    let now = 0
    const scripted = scriptedAccount()
    // A stream that says when it is closed, as a history read over the network would.
    ;(scripted.account as unknown as Record<string, unknown>)['history'] = async function* () {
      try {
        for (let at = 0; ; at += 1) yield { n: at }
      } finally {
        scripted.stopped.push('history')
      }
    }
    const host = new WorkerHost({
      create: () => scripted.account,
      locks,
      expireAfter: 1_000,
      sweepEvery: 500,
      schedule: (run) => {
        sweeps.push(run)

        return () => {}
      },
      now: () => now,
    })
    opened.push({ close: () => host.close() })

    const attach = async (options: Partial<AttachOptions> = {}): Promise<AttachedAccount> => {
      const channel = new MessageChannel()
      host.accept(portEndpoint(channel.port1))
      opened.push({
        close: () => {
          channel.port1.close()
          channel.port2.close()
        },
      })

      return await attachAccount(portEndpoint(channel.port2), {
        account: 'main',
        locks,
        // Its own timers never fire: a page the browser has stopped running timers for.
        schedule: () => () => {},
        ...options,
      })
    }

    return {
      host,
      locks,
      scripted,
      attach,
      /** Move the host's clock on and run its sweep. */
      sweep(to: number): void {
        now = to
        for (const run of sweeps.splice(0)) run()
      },
    }
  }

  it('is let go when its context is destroyed, with everything it held', async () => {
    const { host, locks, scripted, attach } = watched()
    const survivor = await attach()
    const doomed = await attach()
    await doomed.stayOnline()
    const reading = doomed.history('@someone')[Symbol.asyncIterator]()
    await reading.next()
    expect(host.info()).toMatchObject({ callers: 2, handles: 1, streams: 1 })

    // No release, no pagehide, no word over the port: the context is simply gone.
    locks.destroy(`yuigram-caller:${doomed.connection}`)
    await until(() => scripted.stopped.length === 2, 'what the destroyed context held to be let go')

    expect(host.info()).toMatchObject({ callers: 1, handles: 0, streams: 0, pendingCalls: 0 })
    expect(host.info().departures).toMatchObject({ 'context-gone': 1, expired: 0, detached: 0 })
    expect(scripted.stopped.sort()).toEqual(['history', 'presence'])
    await expect(survivor.exportSession()).resolves.toBe('not-a-real-session')
    await survivor.detach()
  })

  it('is kept while its context lives, however long it is silent', async () => {
    const { host, attach, sweep } = watched()
    const quiet = await attach()
    const unwatched = await attach({ locks: false })

    sweep(10 * 60_000)
    await until(() => host.info().callers === 1, 'the unwatched caller to expire')

    await expect(quiet.exportSession()).resolves.toBe('not-a-real-session')
    await expect(unwatched.exportSession()).rejects.toThrow(LifecycleError)
    expect(host.info().departures).toMatchObject({ expired: 1, 'context-gone': 0 })
  })

  it('gives its lock back when it detaches', async () => {
    const { host, locks, attach } = watched()
    const caller = await attach()
    const name = `yuigram-caller:${caller.connection}`
    expect(locks.held(name)).toBe(true)

    await caller.detach()
    await until(() => host.info().callers === 0, 'the caller to be let go')
    await until(() => !locks.held(name), 'the lock to be free')
  })
})

describe('a caller whose timers the browser slows', () => {
  it('does not count its host gone for the time it spent not asking', async () => {
    const timers: (() => void)[] = []
    let now = 0
    const { attach } = hosting()
    const caller = await attach({
      account: 'main',
      pingEvery: 1_000,
      hostTimeout: 3_000,
      locks: false,
      schedule: (run) => {
        timers.push(run)

        return () => {}
      },
      now: () => now,
    })
    const told: string[] = []
    caller.onEvent((event) => told.push(event.kind))

    // One round a minute, as a hidden tab gets; the host answers each ping.
    for (let round = 1; round <= 5; round += 1) {
      now = round * 60_000
      timers.at(-1)?.()
      await settle(20)
    }

    expect(told).toEqual([])
    await expect(caller.read('state')).resolves.toBe('idle')
  })
})
