/**
 * What an account does with the handlers registered on it.
 *
 * Every update here arrives the way one does in production: sealed by the
 * mock datacenter under the negotiated key, decrypted, judged by the sequence,
 * normalized and dispatched. The registrations are made through the public
 * account surface only.
 */

import {
  ConfigError,
  conversation,
  createLogger,
  defineAsyncFilter,
  defineEvent,
  defineFilter,
  defineFlow,
  type LogRecord,
  limiter,
  memory,
  Propagation,
  ValidationError,
  WaitCancelledError,
} from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { AccountRouter } from '../src/index.js'
import type { MtprotoContext } from '../src/normalize/context.js'
import type { TlValue } from '../src/tl/index.js'
import type { MockConnection } from './server/datacenter.js'
import { type MockAccount, type MockAccountOptions, mockAccount } from './support/mock-account.js'

/**
 * A new message from a user in their private chat, advancing the box by one.
 *
 * The compact form, which is what a datacenter sends for a private chat when
 * the message needs no accompanying peers.
 */
function message(pts: number, text: string, from = 5n): TlValue {
  return {
    _: 'updateShortMessage',
    id: pts,
    user_id: from,
    message: text,
    pts,
    pts_count: 1,
    date: 1_700_000_000,
  }
}

/** Several messages, sent one after another without waiting between them. */
async function burst(instance: MockAccount, ...values: TlValue[]): Promise<void> {
  for (const value of values) await push(instance, value)
}

/** Seal a value on a connection that can carry it, and send it. */
async function push(instance: MockAccount, value: TlValue): Promise<void> {
  const deadline = Date.now() + 5000

  for (;;) {
    const connections: readonly MockConnection[] = instance.datacenter(2).connections
    for (const connection of [...connections].reverse()) {
      if (!connection.open()) continue
      const bytes = connection.peer.push(value)
      if (bytes !== undefined) {
        connection.push(bytes)

        return
      }
    }
    if (Date.now() > deadline) throw new Error('no connection could carry the update')
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

/** Let what the connection delivered run. */
const settle = async (ms = 150): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

/** An account that is connected and has a session carrying its updates. */
async function connected(options: MockAccountOptions = {}): Promise<MockAccount> {
  const instance = mockAccount(options)
  await instance.account.connect()
  await instance.account.api.call({ _: 'help.getConfig' })

  return instance
}

/** Where an account's error records go, for a case that reads them. */
function recording(records: LogRecord[]) {
  return createLogger({ sink: { write: (record) => records.push(record) } })
}

describe('registering on an account', () => {
  it('runs a handler behind a kind and a filter only when both hold', async () => {
    const instance = await connected()
    const seen: string[] = []
    const greeting = defineFilter<MtprotoContext, { text: string }>(
      'greeting',
      (value) => (value as MtprotoContext).text?.startsWith('hi') === true,
    )

    try {
      instance.account.on('message', greeting, (event) => {
        // The filter's proof reaches the context: `text` is a string here.
        seen.push(event.text.toUpperCase())
      })

      await burst(instance, message(2, 'hi there'), message(3, 'bye'))
      await settle()

      expect(seen).toEqual(['HI THERE'])
    } finally {
      await instance.dispose()
    }
  }, 30_000)

  it('refuses a kind nothing produces, and a bare predicate in a filter’s place', () => {
    const instance = mockAccount()

    expect(() => instance.account.on('mesage' as never, () => {})).toThrow(ValidationError)
    expect(() => instance.account.on('mesage' as never, () => {})).toThrow(/'mesage' is not a kind/)
    expect(() =>
      instance.account.on('message', ((value: unknown) => value !== undefined) as never, () => {}),
    ).toThrow(/is not a filter/)
  })

  it('runs a once-handler a single time when two updates arrive together', async () => {
    const instance = await connected()
    let runs = 0
    const slow = defineAsyncFilter('slow', async () => {
      await settle(20)

      return true
    })

    try {
      instance.account.once('message', slow, () => {
        runs += 1
      })

      await burst(instance, message(2, 'one'), message(3, 'two'))
      await settle(300)

      expect(runs).toBe(1)
    } finally {
      await instance.dispose()
    }
  }, 30_000)

  it('stops a removed handler, and keeps group exclusivity and propagation', async () => {
    const instance = await connected()
    const seen: string[] = []
    const removed = (): void => {
      seen.push('removed')
    }

    try {
      instance.account
        .on('message', removed)
        .on('message', () => void seen.push('group 1, first'), { group: 1 })
        .on('message', () => void seen.push('group 1, second'), { group: 1 })
        .on(
          'message',
          () => {
            seen.push('group 2, continues')

            return Propagation.Continue
          },
          { group: 2 },
        )
        .on('message', () => void seen.push('group 2, next'), { group: 2 })
      expect(instance.account.off(removed)).toBe(true)

      await push(instance, message(2, 'x'))
      await settle()

      expect(seen).toEqual(['group 1, first', 'group 2, continues', 'group 2, next'])
    } finally {
      await instance.dispose()
    }
  }, 30_000)
})

describe('routers on an account', () => {
  it('run after the account’s handlers, each inside its own middleware', async () => {
    const instance = await connected()
    const trail: string[] = []
    const router = new AccountRouter()
    router.use(async (_event, next) => {
      trail.push('>router')
      await next()
      trail.push('<router')
    })
    router.on('message', () => void trail.push('router handler'))

    try {
      instance.account.on('message', () => void trail.push('account handler'))
      instance.account.addChild(router)

      await push(instance, message(2, 'x'))
      await settle()

      expect(trail).toEqual(['account handler', '>router', 'router handler', '<router'])

      expect(instance.account.removeChild(router)).toBe(true)
      trail.length = 0
      await push(instance, message(3, 'y'))
      await settle()
      expect(trail).toEqual(['account handler'])
    } finally {
      await instance.dispose()
    }
  }, 30_000)

  it('hand an error they decline to the account, and the account logs one nobody takes', async () => {
    const records: LogRecord[] = []
    const instance = await connected({ log: recording(records) })
    const router = new AccountRouter()
    const declined: unknown[] = []
    const failure = new Error('the router’s handler broke')
    router.catch((error) => {
      declined.push(error)

      return false
    })
    router.on('message', () => {
      throw failure
    })

    try {
      instance.account.extend(router)

      await push(instance, message(2, 'x'))
      await settle()

      expect(declined).toEqual([failure])
      const logged = records.filter((record) => record.level === 'error')
      expect(logged.map((record) => record.message)).toEqual([
        'unhandled error while dispatching an update',
      ])
      // The record carries the error itself, written out by the logger.
      expect(logged[0]?.fields?.['error']).toMatchObject({ message: failure.message })

      const caught: unknown[] = []
      instance.account.catch((error) => void caught.push(error))
      await push(instance, message(3, 'y'))
      await settle()
      expect(caught).toEqual([failure])
    } finally {
      await instance.dispose()
    }
  }, 30_000)
})

describe('dependencies on an account', () => {
  it('reach its routers, stay apart between accounts, and name one that is missing', async () => {
    const one = mockAccount({ name: 'one' })
    const two = mockAccount({ name: 'two' })
    const router = new AccountRouter()
    one.account.addChild(router)
    one.account.inject('db' as never, 'the first database' as never)
    two.account.inject({ db: 'the second database' } as never)

    const read = (deps: unknown, name: string): unknown => (deps as Record<string, unknown>)[name]

    expect(read(router.deps, 'db')).toBe('the first database')
    expect(read(two.account.deps, 'db')).toBe('the second database')
    expect(() => read(one.account.deps, 'cache')).toThrow(ConfigError)
    expect(() => read(one.account.deps, 'cache')).toThrow(/no dependency named 'cache'/)
  })
})

describe('a plugin on an account', () => {
  it('is installed when the account starts, before any update is handled', async () => {
    const instance = mockAccount()
    const installed: string[] = []
    instance.account.extend({
      name: 'marker',
      install(host) {
        installed.push('installed')
        host.use(async (event: MtprotoContext, next) => {
          ;(event as unknown as { marked: boolean }).marked = true
          await next()
        })
      },
    })
    const marked: boolean[] = []
    instance.account.on('message', (event) => {
      marked.push((event as unknown as { marked?: boolean }).marked === true)
    })

    try {
      expect(installed).toEqual([])
      await instance.account.connect()
      await instance.account.api.call({ _: 'help.getConfig' })
      expect(installed).toEqual(['installed'])

      await push(instance, message(2, 'x'))
      await settle()
      expect(marked).toEqual([true])
    } finally {
      await instance.dispose()
    }
  }, 30_000)
})

describe('a conversation on an account', () => {
  type Talking = MtprotoContext & {
    readonly conversation: {
      wait<T>(spec: {
        match(event: MtprotoContext): boolean
        transform(event: MtprotoContext): T
      }): Promise<T | undefined>
      start(flow: string): Promise<unknown>
    }
  }

  /** Ask for a name and wait, in memory, for the answer. */
  function asking(answers: string[]) {
    return async (event: MtprotoContext): Promise<void> => {
      if (event.text !== '/name') return
      const answer = await (event as Talking).conversation.wait({
        match: (next) => next.text !== undefined,
        transform: (next) => next.text ?? '',
      })
      if (answer !== undefined) answers.push(answer)
    }
  }

  it('takes the answer from the same person without blocking on its own turn', async () => {
    const instance = await connected()
    const answers: string[] = []

    try {
      instance.account.extend(conversation<MtprotoContext>({ storage: memory() }))
      instance.account.on('message', asking(answers))
      // Installed by dispatch, since the account had already started.
      await push(instance, message(2, '/name'))
      await settle()
      await push(instance, message(3, 'Ada', 6n))
      await settle()
      await push(instance, message(4, 'Grace'))
      await settle()

      // Somebody else's message is not this conversation's answer.
      expect(answers).toEqual(['Grace'])
    } finally {
      await instance.dispose()
    }
  }, 30_000)

  it('is let go when the account stops, so the stop is clean, and works again after a restart', async () => {
    const instance = await connected()
    const answers: string[] = []
    const reported: unknown[] = []

    try {
      instance.account.extend(conversation<MtprotoContext>({ storage: memory() }))
      instance.account.on('message', asking(answers))
      instance.account.catch((error) => void reported.push(error))

      await push(instance, message(2, '/name'))
      await settle()

      const began = Date.now()
      const clean = await instance.account.stop({ timeout: 5000 })

      // Without the account telling the conversation it is stopping, the drain
      // waits for a handler that is waiting for a message that cannot arrive,
      // and the stop ends at its deadline, unclean.
      expect(clean).toBe(true)
      expect(Date.now() - began).toBeLessThan(2000)
      expect(reported).toHaveLength(1)
      expect(reported[0]).toBeInstanceOf(WaitCancelledError)

      await instance.account.connect()
      await instance.account.api.call({ _: 'help.getConfig' })
      await push(instance, message(3, '/name'))
      await settle()
      await push(instance, message(4, 'Grace'))
      await settle()

      expect(answers).toEqual(['Grace'])
    } finally {
      await instance.dispose()
    }
  }, 30_000)

  it('walks a scene one step per message, and keeps its place across a restart', async () => {
    const trail: string[] = []
    const positions = memory()
    const plugin = () =>
      conversation<MtprotoContext, { name?: string }>({
        storage: positions as never,
        scenes: [
          {
            name: 'form',
            initial: () => ({}),
            steps: [
              (event, scene) => {
                if (scene.fresh) {
                  trail.push('asked for a name')
                  return
                }
                scene.state.name = event.text ?? ''
                scene.next()
              },
              (event, scene) => {
                if (scene.fresh) {
                  trail.push(`asked ${scene.state.name} for an age`)
                  return
                }
                trail.push(`${scene.state.name} is ${event.text}`)
                scene.leave()
              },
            ],
          },
        ],
      })
    const entering = async (event: MtprotoContext): Promise<void> => {
      if (event.text === '/form') {
        await (
          event as unknown as { conversation: { enter(scene: string): Promise<void> } }
        ).conversation.enter('form')
      }
    }

    const first = await connected()
    first.account.extend(plugin())
    first.account.on('message', entering)
    await push(first, message(2, '/form'))
    await settle()
    await push(first, message(3, 'Ada'))
    await settle()
    await first.account.stop()

    // A second run of the same account, with the scene's place in the store.
    const second = await connected({ datacenters: first.datacenters, stored: first.rawStored })

    try {
      second.account.extend(plugin())
      second.account.on('message', entering)
      await push(second, message(4, '36'))
      await settle()

      expect(trail).toEqual(['asked for a name', 'asked Ada for an age', 'Ada is 36'])
    } finally {
      await first.dispose()
      await second.dispose()
    }
  }, 30_000)

  it('continues a durable flow in a fresh runtime, kept apart from the account’s own store', async () => {
    const runs = memory()
    const finished: string[] = []
    const signup = defineFlow<MtprotoContext, undefined, string>({
      name: 'signup',
      async run(flow) {
        const name = await flow.wait('name', {
          match: (event) => event.text !== undefined,
          transform: (event) => event.text ?? '',
        })
        await flow.effect('record', () => {
          finished.push(name)
        })

        return name
      },
    })
    const plugin = () =>
      conversation<MtprotoContext>({
        storage: memory(),
        flows: { storage: runs as never, define: [signup as never] },
      })
    const starting = async (event: MtprotoContext): Promise<void> => {
      if (event.text === '/signup') await (event as Talking).conversation.start('signup')
    }

    const first = await connected()
    first.account.extend(plugin())
    first.account.on('message', starting)
    await push(first, message(2, '/signup'))
    await settle()
    await first.account.stop()

    const second = await connected({ datacenters: first.datacenters, stored: first.rawStored })

    try {
      second.account.extend(plugin())
      second.account.on('message', starting)
      await push(second, message(3, 'Ada'))
      await settle(300)

      expect(finished).toEqual(['Ada'])
      // The run lives where the application put it, not in the account's area.
      expect([...second.rawStored.keys()].some((key) => key.includes('signup'))).toBe(false)
      const kept: string[] = []
      for await (const key of runs.keys?.() ?? []) kept.push(key)
      expect(kept).toEqual(['account:c:user:5:u:user:5'])
    } finally {
      await first.dispose()
      await second.dispose()
    }
  }, 30_000)
})

describe('a rate limit on an account', () => {
  it('counts each sender by their own peer, in the middleware and the filter alike', async () => {
    const instance = await connected()
    const limits = limiter<MtprotoContext>()
    const handled: string[] = []
    const refused: Array<[string, number]> = []

    try {
      instance.account.use(
        limits.middleware({
          limit: 2,
          windowMs: 60_000,
          onLimited: (_event, info) => void refused.push([info.key, info.count]),
        }),
      )
      instance.account.on(
        'message',
        limits.filter({ limit: 1, windowMs: 60_000, bucket: 'report' }),
        (event) => void handled.push(`report ${event.text}`),
      )
      instance.account.on('message', (event) => void handled.push(event.text ?? ''))

      await burst(instance, message(2, 'a'), message(3, 'b'), message(4, 'c'), message(5, 'd', 6n))
      await settle()

      // Two private chats are dispatched side by side; each keeps its own order.
      const of = (sender: readonly string[]) =>
        handled.filter((entry) => sender.includes(entry.replace('report ', '')))
      expect(of(['a', 'b', 'c'])).toEqual(['report a', 'a', 'b'])
      expect(of(['d'])).toEqual(['report d', 'd'])
      // A user's key names the kind of peer, so it cannot meet a chat's.
      expect(refused).toEqual([['user:5', 3]])
    } finally {
      await instance.dispose()
    }
  }, 30_000)
})

describe('an application’s own events on an account', () => {
  const reminder = defineEvent<{ text: string }>('reminder_due')

  it('reach the handlers under the account’s middleware, and move none of its update state', async () => {
    const instance = mockAccount()
    const trail: string[] = []
    const before = [...instance.rawStored.keys()].sort()

    try {
      instance.account.use(async (event, next) => {
        trail.push(`> ${event.transport}`)
        await next()
      })
      instance.account.on(reminder, (event) => void trail.push(`reminder: ${event.payload.text}`))
      instance.account.on('message', () => void trail.push('a message handler'))

      await instance.account.emit(
        reminder,
        { text: 'stand up' },
        { sender: { id: 5n, kind: 'user' } },
      )

      expect(trail).toEqual(['> custom', 'reminder: stand up'])
      expect([...instance.rawStored.keys()].sort()).toEqual(before)
    } finally {
      await instance.dispose()
    }
  })

  it('refuse a kind the account produces from updates', () => {
    const instance = mockAccount()

    expect(() => instance.account.on(defineEvent('message'), () => undefined)).toThrow(
      /a kind of event an account produces/,
    )
  })
})
