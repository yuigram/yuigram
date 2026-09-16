/**
 * Which account a store's contents belong to.
 *
 * An account keeps authorization keys, temporary keys, the datacenter list, the
 * peers it has seen and its place in the update stream under names that are the
 * same for every account. Two accounts given one store therefore used to write
 * to the same keys, and the second to reach a datacenter overwrote the first
 * one's authorization for it. Nothing failed at the time; the symptom arrived
 * later and somewhere else, as a sign-in demanded from an account that had
 * already signed in.
 *
 * The cases here are about ownership rather than about the protocol, so most of
 * them run against the store directly. The ones that have to prove an account
 * really writes where this says it does run the exchange, because the point is
 * what reaches storage rather than what a function returns.
 *
 * Nothing here uses a real credential. Every key in these stores is one the
 * mock datacenters negotiated, over parameters generated in the process.
 */

import { memory, namespaced } from '@yuigram/core'
import { describe, expect, it, vi } from 'vitest'
import { areaFor, claimArea, releaseArea, StorageOwnershipError } from '../src/storage/ownership.js'
import type { TlValue } from '../src/tl/index.js'
import { createServerKey } from './server/keys.js'
import { type MockAccount, mockAccount } from './support/mock-account.js'

/** An exchange is real here, and two of them per datacenter is not quick. */
vi.setConfig({ testTimeout: 60_000 })

/** Generated once: which key the datacenters hold is not what any of this is about. */
const KEY = createServerKey()

const harness = (options: Parameters<typeof mockAccount>[0] = {}) =>
  mockAccount({ key: KEY, ...options })

/** Bring an account up and make one call, which is what authorizes it. */
async function reach(instance: MockAccount, id = 2) {
  await instance.account.connect()
  await instance.account.reach(id).invoke({ _: 'ping', ping_id: 1n })
}

/** The keys a store holds, sorted, as the store itself names them. */
const keysOf = (store: Map<string, unknown>) => [...store.keys()].toSorted()

/** A holder token, which only has to differ between runs. */
const run = (label: string) => `run-${label}`

/** An update that advances the common box to a position of its own. */
const arrived = (pts: number): TlValue => ({
  _: 'updateNewMessage',
  message: {
    _: 'message',
    id: pts,
    peer_id: { _: 'peerUser', user_id: 5n },
    from_id: { _: 'peerUser', user_id: 5n },
    message: 'hello',
    date: 1_700_000_000,
  },
  pts,
  pts_count: 1,
})

describe('two accounts sharing one store', () => {
  it('each write inside an area of their own', async () => {
    const shared = new Map<string, unknown>()
    const alice = harness({ name: 'alice', stored: shared })
    const bob = harness({ name: 'bob', stored: shared })

    await reach(alice)
    await reach(bob)

    // Everything in the store says whose it is, and the two sets do not meet.
    const mine = keysOf(shared).filter((key) => key.startsWith(areaFor('alice')))
    const theirs = keysOf(shared).filter((key) => key.startsWith(areaFor('bob')))
    expect(keysOf(shared)).toEqual([...mine, ...theirs].toSorted())
    expect(mine.length).toBeGreaterThan(1)
    expect(theirs.length).toBe(mine.length)

    await alice.account.stop()
    await bob.account.stop()
  })

  it('do not overwrite each other’s authorization for the same datacenter', async () => {
    // The defect this exists to prevent. Both accounts reach datacenter 2, both
    // negotiate a key there, and each must still hold its own afterwards.
    const shared = new Map<string, unknown>()
    const alice = harness({ name: 'alice', stored: shared })
    const bob = harness({ name: 'bob', stored: shared })

    await reach(alice)
    const before = alice.stored.get('auth:dc2:key')
    await reach(bob)

    expect(before).toBeDefined()
    expect(bob.stored.get('auth:dc2:key')).toBeDefined()
    expect(bob.stored.get('auth:dc2:key')).not.toEqual(before)
    // And the first one's key is exactly what it was, not what the second wrote.
    expect(alice.stored.get('auth:dc2:key')).toEqual(before)

    await alice.account.stop()
    await bob.account.stop()
  })

  it('keep separate places in the update stream', async () => {
    const shared = new Map<string, unknown>()
    const alice = harness({ name: 'alice', stored: shared })
    const bob = harness({ name: 'bob', stored: shared })

    // Both start from nothing and see the same first update, so neither opens
    // a gap. Only one of them sees the second, so their positions diverge.
    await alice.account.connect()
    await bob.account.connect()
    await alice.account.feed(arrived(2))
    await bob.account.feed(arrived(2))
    await alice.account.feed(arrived(3))

    const position = (instance: MockAccount) =>
      (instance.stored.get('updates:state') as { pts?: number } | undefined)?.pts

    expect(position(alice)).toBe(3)
    // Not the same record read twice, and not advanced by the other's traffic.
    expect(position(bob)).toBe(2)

    await alice.account.stop()
    await bob.account.stop()
  })
})

describe('an account opened again over the store it left', () => {
  it('resumes from what is there rather than authorizing again', async () => {
    const first = harness({ name: 'alice' })
    await reach(first)
    await first.account.stop()
    const spent = first.datacenter(2).connections.length

    const second = harness({
      name: 'alice',
      datacenters: first.datacenters,
      stored: first.rawStored,
    })
    await reach(second)

    // It opened a connection, and did not negotiate a key on it: the stored
    // authorization was found, which is what reopening an area means.
    const opened = second.datacenter(2).connections.slice(spent)
    expect(opened.length).toBeGreaterThan(0)
    expect(opened.filter((connection) => connection.peer.result !== undefined)).toEqual([])

    await second.account.stop()
  })

  it('is refused while the run that has it open is still running', async () => {
    const shared = new Map<string, unknown>()
    const first = harness({ name: 'alice', stored: shared })
    await first.account.connect()

    const second = harness({ name: 'alice', datacenters: first.datacenters, stored: shared })

    await expect(second.account.connect()).rejects.toThrow(StorageOwnershipError)
    await expect(second.account.connect()).rejects.toThrow(/already open on this storage/)

    await first.account.stop()
  })

  it('is allowed once the first run has stopped', async () => {
    const shared = new Map<string, unknown>()
    const first = harness({ name: 'alice', stored: shared })
    await first.account.connect()
    await first.account.stop()

    const second = harness({ name: 'alice', datacenters: first.datacenters, stored: shared })

    await expect(second.account.connect()).resolves.toBeUndefined()
    await second.account.stop()
  })

  it('takes over a claim a stopped run left behind when told to', async () => {
    // A run that ends without stopping leaves its claim, and the next one
    // cannot tell that from a program running right now. This is how a caller
    // that knows better says so.
    const shared = new Map<string, unknown>()
    await claimArea(memoryOver(shared), { name: 'alice', holder: run('crashed') })

    const second = harness({
      name: 'alice',
      stored: shared,
      takeOverStorage: true,
    })

    await expect(second.account.connect()).resolves.toBeUndefined()
    await second.account.stop()
  })
})

describe('signing an account out', () => {
  it('leaves another account in the same store untouched', async () => {
    const shared = new Map<string, unknown>()
    const alice = harness({ name: 'alice', stored: shared })
    const bob = harness({ name: 'bob', stored: shared })

    await reach(alice)
    await reach(bob)
    const survived = keysOf(bob.stored)
    expect(survived.length).toBeGreaterThan(1)

    await alice.account.logOut()

    // Nothing of the first account's is left, and everything of the second's is.
    expect(keysOf(alice.stored).filter((key) => key !== 'claim')).toEqual([])
    expect(keysOf(bob.stored)).toEqual(survived)
    expect(bob.stored.get('auth:dc2:key')).toBeDefined()

    await bob.account.stop()
  })

  it('leaves the rest of the store alone', async () => {
    // A store an account shares with an application, which keeps its own things
    // in it. Signing out removes what the account wrote and no more.
    const shared = new Map<string, unknown>()
    shared.set('app:greeting', 'hello')
    const alice = harness({ name: 'alice', stored: shared })
    await reach(alice)

    await alice.account.logOut()

    expect(shared.get('app:greeting')).toBe('hello')
  })
})

describe('a store written before accounts had areas', () => {
  it('is not handed to whichever account asks first', async () => {
    // There is nothing in such a store saying whose it was. Adopting it under
    // the name that happens to be asking would give one account another's
    // authorization, which is the failure this whole thing is about.
    const legacy = new Map<string, unknown>([
      ['auth:dc2:key', { id: 1n, key: 'not a real key' }],
      ['dcs:datacenters', { thisDc: 2 }],
    ])
    const instance = harness({ name: 'alice', stored: legacy })

    await expect(instance.account.connect()).rejects.toThrow(StorageOwnershipError)
    await expect(instance.account.connect()).rejects.toThrow(/written before accounts had areas/)
  })

  it('says what to do about it', async () => {
    const legacy = new Map<string, unknown>([['updates:state', { pts: 1 }]])

    await expect(
      claimArea(memoryOver(legacy), { name: 'alice', holder: run('one') }),
    ).rejects.toThrow(/move the existing 'updates:' keys under 'accounts:alice:'/)
  })

  it('is adopted once its keys say whose they are', async () => {
    // The instruction in the refusal, carried out: the keys move into the area
    // named after the account, and the account opens over them.
    const store = new Map<string, unknown>([[`${areaFor('alice')}dcs:datacenters`, { thisDc: 2 }]])

    await expect(
      claimArea(memoryOver(store), { name: 'alice', holder: run('one') }),
    ).resolves.toBeDefined()
  })

  it('does not refuse an unrelated key that merely looks similar', async () => {
    // `authors:` is not `auth:`. A refusal on a prefix match rather than a
    // segment match would turn an application's own key into an unopenable
    // account.
    const store = new Map<string, unknown>([['authors:list', ['someone']]])

    await expect(
      claimArea(memoryOver(store), { name: 'alice', holder: run('one') }),
    ).resolves.toBeDefined()
  })
})

describe('the claim itself', () => {
  const store = () => memory()

  it('is written where the area is, not at the root', async () => {
    const raw = new Map<string, unknown>()
    await claimArea(memoryOver(raw), { name: 'alice', holder: run('one') })

    expect(keysOf(raw)).toEqual([`${areaFor('alice')}claim`])
  })

  it('separates names that would otherwise share a prefix', async () => {
    // `a` and `a:b` both end in a colon once a prefix is pasted together, so the
    // name is encoded rather than pasted.
    const raw = new Map<string, unknown>()
    const backing = memoryOver(raw)
    await claimArea(backing, { name: 'a', holder: run('one') })
    await claimArea(backing, { name: 'a:b', holder: run('two') })

    expect(keysOf(raw).length).toBe(2)
    expect(areaFor('a:b').startsWith(areaFor('a'))).toBe(false)
  })

  it('does not let one run release another’s', async () => {
    const backing = store()
    await claimArea(backing, { name: 'alice', holder: run('one') })
    await claimArea(backing, { name: 'alice', holder: run('two'), takeOver: true })

    // The run that was taken over stopping must not clear the claim of whatever
    // took it over, or the area would look free while it is in use.
    await releaseArea(backing, 'alice', run('one'))

    await expect(claimArea(backing, { name: 'alice', holder: run('three') })).rejects.toThrow(
      StorageOwnershipError,
    )
  })

  it('does not let a take-over reach a different account’s area', async () => {
    // Not a stale claim. A different name is the wrong store, and no flag makes
    // it the right one — it simply opens an empty area of its own.
    const backing = store()
    await claimArea(backing, { name: 'alice', holder: run('one') })

    const area = await claimArea(backing, {
      name: 'bob',
      holder: run('two'),
      takeOver: true,
    })

    expect(await area.get('claim')).toEqual({ name: 'bob', holder: run('two') })
    expect(await namespaced(backing, areaFor('alice')).get('claim')).toEqual({
      name: 'alice',
      holder: run('one'),
    })
  })

  it('refuses a claim that names a different account', async () => {
    // An area's claim names the account whose area it is, and under the
    // encoding above nothing else can write one there. The check is still made,
    // because a claim that is never read is a claim that cannot be relied on —
    // and a store is a file somebody can edit, or restore from a backup of a
    // different account.
    const backing = store()
    await namespaced(backing, areaFor('alice')).set('claim', { name: 'bob' })

    await expect(claimArea(backing, { name: 'alice', holder: run('one') })).rejects.toThrow(
      /belongs to the account 'bob', not to 'alice'/,
    )
  })

  it('refuses a claim that is not a record', async () => {
    const backing = store()
    await namespaced(backing, areaFor('alice')).set('claim', 'mine')

    await expect(claimArea(backing, { name: 'alice', holder: run('one') })).rejects.toThrow(
      /not a record/,
    )
  })

  it('refuses a claim that names no account', async () => {
    const backing = store()
    await namespaced(backing, areaFor('alice')).set('claim', { holder: run('one') })

    await expect(claimArea(backing, { name: 'alice', holder: run('two') })).rejects.toThrow(
      /names no account/,
    )
  })

  it('refuses a claim whose holder is not a token', async () => {
    const backing = store()
    await namespaced(backing, areaFor('alice')).set('claim', { name: 'alice', holder: 7 })

    await expect(claimArea(backing, { name: 'alice', holder: run('two') })).rejects.toThrow(
      /holder that is not a token/,
    )
  })

  it('reclaims what the same run already holds', async () => {
    // Idempotent for one run, so a reconnect does not have to take itself over.
    const backing = store()
    await claimArea(backing, { name: 'alice', holder: run('one') })

    await expect(claimArea(backing, { name: 'alice', holder: run('one') })).resolves.toBeDefined()
  })
})

describe('a store that cannot list what it holds', () => {
  it('is claimed rather than refused', async () => {
    // Legacy contents are found by listing, and a store with no `keys` cannot
    // be asked. Refusing every such store would make a caller's own adapter
    // unusable; the ambiguity it is protecting against is one this store cannot
    // exhibit an answer for either way.
    const kept = new Map<string, unknown>()
    const area = await claimArea(
      {
        get: async (key: string) => kept.get(key),
        set: async (key: string, value: unknown) => {
          kept.set(key, value)
        },
        delete: async (key: string) => {
          kept.delete(key)
        },
      },
      { name: 'alice', holder: run('one') },
    )

    expect(await area.get('claim')).toEqual({ name: 'alice', holder: run('one') })
    // It still separates accounts, which is the part that does not need listing.
    expect(keysOf(kept)).toEqual([`${areaFor('alice')}claim`])
  })
})

/** A store over a map a case can look inside. */
function memoryOver(raw: Map<string, unknown>) {
  return {
    get: (key: string) => Promise.resolve(raw.get(key)),
    set: (key: string, value: unknown) => {
      raw.set(key, value)

      return Promise.resolve()
    },
    delete: (key: string) => {
      raw.delete(key)

      return Promise.resolve()
    },
    async *keys(prefix?: string) {
      for (const key of [...raw.keys()]) {
        if (key.startsWith(prefix ?? '')) yield key
      }
    },
  }
}
