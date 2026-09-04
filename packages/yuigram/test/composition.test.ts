/**
 * Both transports, through the one package a user installs.
 *
 * The Bot API and MTProto subsystems never import each other — an invariant
 * enforces it — so this is the only place in the repository where a bot and an
 * account can be held together. That makes these cases the proof of the
 * framework's central claim, not a convenience test: everything here is reached
 * through `yuigram` alone, exactly as a consumer reaches it.
 *
 * ```
 *   yuigram
 *      └── App
 *           ├── Bot      (Bot API)
 *           └── Account  (MTProto)
 * ```
 *
 * No network is touched. An account assembles its layers when it connects and
 * opens nothing until something needs to travel, so a client can be registered,
 * started and stopped without a socket ever existing.
 */

import { describe, expect, it } from 'vitest'
import * as yuigram from '../src/index.js'
import { Account, App, memory } from '../src/index.js'
import { mockBot } from '../src/testing.js'

/**
 * An account built the way a consumer builds one.
 *
 * Only public symbols, and no credentials: an account reaches a datacenter when
 * a call is made, and nothing here makes one.
 */
const account = (name: string) =>
  new Account({
    name,
    apiId: 1,
    apiHash: 'not-a-credential',
    storage: memory(),
    keys: [],
    bootstrap: {
      thisDc: 2,
      testMode: true,
      options: [
        {
          id: 2,
          host: '127.0.0.1',
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
    },
  })

describe('the MTProto surface a consumer receives', () => {
  it('exports the account client', () => {
    expect(typeof yuigram.Account).toBe('function')
  })

  it('names the TL layer the generated surface speaks', () => {
    // Read from the generated schema rather than written down twice, so a
    // regenerated layer cannot leave the façade claiming the old one.
    expect(yuigram.schemaInfo.tlLayer).toBeTypeOf('number')
    expect(yuigram.schemaInfo.tlLayer).toBeGreaterThan(0)
  })

  it('keeps the subsystem package names to themselves', () => {
    // A diagnostic naming an internal package means nothing from out here, and
    // a façade that re-exported one would tell a user which package to blame
    // rather than which framework they are using.
    expect('PACKAGE_NAME' in yuigram).toBe(false)
  })

  it('publishes none of the infrastructure its own tests are built on', () => {
    // The mock datacenter runs a real key exchange. It belongs to the test
    // tree, and a façade that shipped it would put a server implementation in
    // every consumer's dependency graph.
    for (const name of ['mockAccount', 'MockServer', 'MockDatacenter', 'createServerKey']) {
      expect(name in yuigram).toBe(false)
    }
  })

  it('resolves the update shape shared by both subsystems to the Bot API one', () => {
    // Both packages describe a normalized update, and they describe different
    // things. The façade names one deliberately; the MTProto fields are read
    // off the context a handler is given.
    expect(typeof yuigram.normalizeUpdate).toBe('function')
    expect(yuigram.UNKNOWN_KIND).toBeDefined()
  })
})

describe('an application holding both transports', () => {
  it('registers a bot', () => {
    const app = new App()
    const { bot } = mockBot()

    expect(app.add(bot)).toBe(bot)
    expect(app.clients).toHaveLength(1)
  })

  it('registers an account', () => {
    const app = new App()
    const client = account('me')

    expect(app.add(client)).toBe(client)
    expect(app.clients).toHaveLength(1)
  })

  it('holds both at once, in the order they were added', () => {
    const app = new App()
    app.add(mockBot({ name: 'helper' }).bot)
    app.add(account('me'))

    expect(app.clients.map((client) => client.name)).toEqual(['helper', 'me'])
  })

  it('finds either of them by name', () => {
    const app = new App()
    const { bot } = mockBot({ name: 'helper' })
    const user = account('me')
    app.add(bot)
    app.add(user)

    expect(app.client('helper')).toBe(bot)
    expect(app.client('me')).toBe(user)
    expect(app.client('nobody')).toBeUndefined()
  })

  it('brings both up and takes both down', async () => {
    const app = new App()
    const { bot } = mockBot({ name: 'helper' })
    const user = account('me')
    app.add(bot)
    app.add(user)

    expect([bot.state, user.state]).toEqual(['idle', 'idle'])

    // One call reaches a polling bot and an MTProto account alike, because the
    // container's contract is the only thing it knows about either.
    await app.start()

    expect(bot.state).toBe('running')
    expect(user.state).toBe('running')
    expect(user.connected).toBe(true)

    await app.stop()

    expect(bot.state).toBe('idle')
    expect(user.state).toBe('idle')
    expect(user.connected).toBe(false)
  })

  it('leaves each client owning the state only it can own', async () => {
    // The container knows a name, a state and how to start and stop — nothing
    // about datacenters, sessions or polling. An application that held a second
    // copy of any of that would be the fake abstraction the design rejects.
    const app = new App()
    const user = account('me')
    app.add(user)

    await user.connect()
    const reach = user.reach

    expect(typeof reach).toBe('function')
    expect(Object.keys(app)).not.toContain('datacenters')
    // Reaching an account's own surface goes to the account, not through the
    // application, which offers no such thing.
    expect('reach' in app).toBe(false)
    expect('peers' in app).toBe(false)

    await app.stop()
  })
})
