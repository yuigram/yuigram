/**
 * Copying routers and taking one into another.
 *
 * A copy and a snapshot are promises about independence: what happens to one
 * router afterwards does not happen to the other. Each case changes one side
 * after the copy and reads the other, through the dispatcher an account would
 * run, and one case runs a copy and its source on a connected account.
 */

import { Propagation } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import type { MtprotoContext } from '../src/normalize/context.js'
import { AccountRouter, dispatcherOf } from '../src/router.js'
import type { TlValue } from '../src/tl/index.js'
import type { MockConnection } from './server/datacenter.js'
import { type MockAccount, mockAccount } from './support/mock-account.js'

interface Probe {
  readonly kind: string
  readonly text?: string
  readonly trail: string[]
}

const event = (kind = 'message', text?: string): Probe =>
  text === undefined ? { kind, trail: [] } : { kind, text, trail: [] }

async function run(router: AccountRouter, probe: Probe): Promise<string[]> {
  await dispatcherOf<Probe>(router as AccountRouter<never>).dispatch(probe)
  return probe.trail
}

const mark = (label: string) => (probe: MtprotoContext) =>
  void (probe as unknown as Probe).trail.push(label)

describe('clone', () => {
  it('copies what the router has now, and nothing registered on either afterwards', async () => {
    const source = new AccountRouter()
    source.use(async (probe, next) => {
      ;(probe as unknown as Probe).trail.push('mw')
      await next()
    })
    source.on('message', mark('a'))

    const copy = source.clone()
    source.on('message', mark('added to the source'))
    copy.on('message', mark('added to the copy'))

    expect(await run(copy, event())).toEqual(['mw', 'a', 'added to the copy'])
    expect(await run(source, event())).toEqual(['mw', 'a', 'added to the source'])
  })

  it('leaves a router made afterwards empty and its own', async () => {
    const source = new AccountRouter()
    source.on('message', mark('source'))
    source.clone()

    const fresh = new AccountRouter()
    fresh.on('message', mark('fresh'))

    expect(await run(fresh, event())).toEqual(['fresh'])
    expect(await run(source, event())).toEqual(['source'])
  })

  it('removes a handler from one side only', async () => {
    const shared = mark('shared')
    const source = new AccountRouter()
    source.on('message', shared)

    const copy = source.clone()
    expect(copy.off(shared as never)).toBe(true)

    expect(await run(copy, event())).toEqual([])
    expect(await run(source, event())).toEqual(['shared'])
  })

  it('runs a once-handler once on each side, and not at all in a copy made after it ran', async () => {
    const source = new AccountRouter()
    source.once('message', mark('once'))

    const before = source.clone()
    expect(await run(source, event())).toEqual(['once'])
    const after = source.clone()

    expect(await run(before, event())).toEqual(['once'])
    expect(await run(before, event())).toEqual([])
    expect(await run(source, event())).toEqual([])
    expect(await run(after, event())).toEqual([])
  })

  it('keeps groups and their order, and the hooks and catchers', async () => {
    const source = new AccountRouter()
    const caught: unknown[] = []
    source.before((probe) => {
      ;(probe as unknown as Probe).trail.push('before')
    })
    source.on('message', mark('group 1'), { group: 1 })
    source.on('message', mark('first of group 0'), { group: 0 })
    source.on('message', mark('second of group 0'), { group: 0 })
    source.on('message', (probe) => {
      if (probe.text === 'boom') throw new Error('broken')
    })
    source.catch((error) => void caught.push(error))

    const copy = source.clone()

    // A group takes one handler's turn: the first match in group 0, then group 1.
    expect(await run(copy, event())).toEqual(['before', 'first of group 0', 'group 1'])
    await run(copy, event('message', 'boom'))
    expect(caught).toHaveLength(1)
  })

  it('carries dependencies as they stand, and each side injects its own afterwards', () => {
    const source = new AccountRouter()
    source.inject('db' as never, 'first' as never)
    const copy = source.clone()
    copy.inject('db' as never, 'second' as never)

    const read = (router: AccountRouter) =>
      (router.deps as unknown as Record<string, unknown>)['db']

    expect(read(source)).toBe('first')
    expect(read(copy)).toBe('second')
  })

  it('copies children only when asked, and a copied child is a copy', async () => {
    const child = new AccountRouter()
    child.on('message', mark('child'))
    const source = new AccountRouter()
    source.addChild(child)

    const alone = source.clone()
    const withChildren = source.clone(true)
    child.on('message', mark('added to the child'))

    expect(await run(alone, event())).toEqual([])
    expect(await run(withChildren, event())).toEqual(['child'])
    expect(await run(source, event())).toEqual(['child', 'added to the child'])
    // The original child still belongs to the source alone.
    expect(source.removeChild(child)).toBe(true)
  })
})

describe('extend', () => {
  it('takes in the other router as it stands, after its own handlers and under its middleware', async () => {
    const target = new AccountRouter()
    target.use(async (probe, next) => {
      ;(probe as unknown as Probe).trail.push('target mw')
      await next()
    })
    target.on('message', mark('target'))

    const other = new AccountRouter()
    other.use(async (probe, next) => {
      ;(probe as unknown as Probe).trail.push('other mw')
      await next()
    })
    other.on('message', mark('other'))

    target.extend(other)
    other.on('message', mark('registered on the other later'))

    expect(await run(target, event())).toEqual(['target mw', 'other mw', 'target', 'other'])
    expect(await run(other, event())).toEqual([
      'other mw',
      'other',
      'registered on the other later',
    ])
  })

  it('takes in the other router’s dependencies, catchers and hooks', async () => {
    const other = new AccountRouter()
    const caught: unknown[] = []
    other.inject('cache' as never, 'from the other' as never)
    other.catch((error) => void caught.push(error))
    other.before(() => Propagation.Stop)

    const target = new AccountRouter()
    target.on('message', mark('stopped before it ran'))
    target.extend(other)

    expect((target.deps as unknown as Record<string, unknown>)['cache']).toBe('from the other')
    expect(await run(target, event())).toEqual([])
  })

  it('refuses to extend a router with itself', () => {
    const router = new AccountRouter()

    expect(() => router.extend(router)).toThrow(/cannot extend itself/)
  })
})

describe('on an account', () => {
  function message(pts: number, text: string): TlValue {
    return {
      _: 'updateShortMessage',
      id: pts,
      user_id: 5n,
      message: text,
      pts,
      pts_count: 1,
      date: 1_700_000_000,
    }
  }

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

  const settle = () => new Promise((resolve) => setTimeout(resolve, 150))

  it('runs a copy added to one account without its source, and keeps running after the source is removed', async () => {
    const one = mockAccount({ name: 'one' })
    const two = mockAccount({ name: 'two' })
    const seen: string[] = []
    const feature = new AccountRouter()
    feature.on('message', (probe) => void seen.push(`${probe.client.name}: ${probe.text}`))

    try {
      one.account.addChild(feature)
      two.account.addChild(feature.clone())
      for (const instance of [one, two]) {
        await instance.account.connect()
        await instance.account.api.call({ _: 'help.getConfig' })
      }

      await push(one, message(2, 'a'))
      await push(two, message(2, 'b'))
      await settle()
      expect(seen.sort()).toEqual(['one: a', 'two: b'])

      one.account.removeChild(feature)
      seen.length = 0
      await push(one, message(3, 'c'))
      await push(two, message(3, 'd'))
      await settle()
      expect(seen).toEqual(['two: d'])
    } finally {
      await one.dispose()
      await two.dispose()
    }
  }, 30_000)
})
