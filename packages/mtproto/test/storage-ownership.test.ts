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

import {
  createLogger,
  type Guard,
  type LogRecord,
  memory,
  namespaced,
  processGuard,
} from '@yuigram/core'
import { describe, expect, it, vi } from 'vitest'
import { areaFor, claimArea, StorageOwnershipError } from '../src/storage/ownership.js'
import type { TlValue } from '../src/tl/index.js'
import { createServerKey } from './server/keys.js'
import { type MockAccount, mockAccount } from './support/mock-account.js'

/** An exchange is real here, and two of them per datacenter is not quick. */
vi.setConfig({ testTimeout: 60_000 })

/** Generated once: which key the datacenters hold is not what any of this is about. */
const KEY = createServerKey()

/**
 * What excludes two runs, for one case.
 *
 * A guard is per process in production — two `Account`s in one program must
 * exclude each other, which is the whole point — so a shared one is what ships.
 * Each case here gets its own instead, because a case is a program: one that
 * left a name held would refuse the next case rather than testing it.
 *
 * Where a case is *about* two contenders, it passes the same guard to both.
 */
const aProcess = (): Guard => processGuard()

const harness = (options: Parameters<typeof mockAccount>[0] = {}) =>
  mockAccount({ key: KEY, storageGuard: aProcess(), ...options })

/** Bring an account up and make one call, which is what authorizes it. */
async function reach(instance: MockAccount, id = 2) {
  await instance.account.connect()
  await instance.account.reach(id).invoke({ _: 'ping', ping_id: 1n })
}

/** The keys a store holds, sorted, as the store itself names them. */
const keysOf = (store: Map<string, unknown>) => [...store.keys()].toSorted()

/** Let a suspended read resume before the case looks at the outcome. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 10))

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
    const guard = aProcess()
    const alice = harness({ name: 'alice', stored: shared, storageGuard: guard })
    const bob = harness({ name: 'bob', stored: shared, storageGuard: guard })

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
    const guard = aProcess()
    const alice = harness({ name: 'alice', stored: shared, storageGuard: guard })
    const bob = harness({ name: 'bob', stored: shared, storageGuard: guard })

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
    const guard = aProcess()
    const alice = harness({ name: 'alice', stored: shared, storageGuard: guard })
    const bob = harness({ name: 'bob', stored: shared, storageGuard: guard })

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
    const guard = aProcess()
    const first = harness({ name: 'alice', stored: shared, storageGuard: guard })
    await first.account.connect()

    const second = harness({
      name: 'alice',
      datacenters: first.datacenters,
      stored: shared,
      storageGuard: guard,
    })

    await expect(second.account.connect()).rejects.toThrow(StorageOwnershipError)
    await expect(second.account.connect()).rejects.toThrow(/already open on this storage/)

    await first.account.stop()
  })

  it('is allowed once the first run has stopped', async () => {
    const shared = new Map<string, unknown>()
    const guard = aProcess()
    const first = harness({ name: 'alice', stored: shared, storageGuard: guard })
    await first.account.connect()
    await first.account.stop()

    const second = harness({
      name: 'alice',
      datacenters: first.datacenters,
      stored: shared,
      storageGuard: guard,
    })

    await expect(second.account.connect()).resolves.toBeUndefined()
    await second.account.stop()
  })

  it('takes over a claim a stopped run left behind when told to', async () => {
    // A run that ends without stopping leaves its claim, and the next one
    // cannot tell that from a program running right now. This is how a caller
    // that knows better says so.
    // The claim is written by a guard this process no longer holds, which is
    // what a crashed run leaves behind: a record naming a holder, and nothing
    // excluding anybody.
    const shared = new Map<string, unknown>()
    const gone = await claimArea(memoryOver(shared), {
      name: 'alice',
      holder: run('crashed'),
      guard: aProcess(),
    })
    void gone

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
    const guard = aProcess()
    const alice = harness({ name: 'alice', stored: shared, storageGuard: guard })
    const bob = harness({ name: 'bob', stored: shared, storageGuard: guard })

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

  it('stops a superseded run writing the peers an answer described', async () => {
    // The peer store is built at construction and outlives the moment the area
    // becomes a leased one, so it has to reach the area rather than hold it. A
    // run whose area was taken must not keep writing peers into it.
    const records: LogRecord[] = []
    const shared = new Map<string, unknown>()
    const guard = aProcess()
    const instance = harness({
      name: 'alice',
      stored: shared,
      storageGuard: guard,
      log: createLogger({ sink: { write: (record) => records.push(record) } }),
      api: (query) =>
        query._ === 'contacts.resolveUsername'
          ? {
              _: 'contacts.resolvedPeer',
              peer: { _: 'peerUser', user_id: 5n },
              chats: [],
              users: [{ _: 'user', id: 5n, access_hash: 9n, username: 'someone' }],
            }
          : undefined,
    })
    await reach(instance)

    // Somebody else takes the area while this account is still running.
    await claimArea(memoryOver(shared), {
      name: 'alice',
      holder: run('two'),
      takeOver: true,
      guard,
    })

    // A call whose answer describes people. The call itself still succeeds —
    // the answer is the caller's — and writing the peers down is refused.
    await instance.account.api.contacts.resolveUsername({ username: 'someone' })

    const warned = records.filter(
      (record) => record.message === 'could not write down the peers an answer described',
    )
    expect(warned.length).toBeGreaterThan(0)

    await instance.account.stop()
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
      claimArea(memoryOver(legacy), { name: 'alice', holder: run('one'), guard: aProcess() }),
    ).rejects.toThrow(/move the existing 'updates:' keys under 'accounts:alice:'/)
  })

  it('is adopted once its keys say whose they are', async () => {
    // The instruction in the refusal, carried out: the keys move into the area
    // named after the account, and the account opens over them.
    const store = new Map<string, unknown>([[`${areaFor('alice')}dcs:datacenters`, { thisDc: 2 }]])

    await expect(
      claimArea(memoryOver(store), { name: 'alice', holder: run('one'), guard: aProcess() }),
    ).resolves.toBeDefined()
  })

  it('does not refuse an unrelated key that merely looks similar', async () => {
    // `authors:` is not `auth:`. A refusal on a prefix match rather than a
    // segment match would turn an application's own key into an unopenable
    // account.
    const store = new Map<string, unknown>([['authors:list', ['someone']]])

    await expect(
      claimArea(memoryOver(store), { name: 'alice', holder: run('one'), guard: aProcess() }),
    ).resolves.toBeDefined()
  })
})

describe('the claim itself', () => {
  const store = () => memory()

  it('is written where the area is, not at the root', async () => {
    const raw = new Map<string, unknown>()
    await claimArea(memoryOver(raw), { name: 'alice', holder: run('one'), guard: aProcess() })

    expect(keysOf(raw)).toEqual([`${areaFor('alice')}claim`])
  })

  it('separates names that would otherwise share a prefix', async () => {
    // `a` and `a:b` both end in a colon once a prefix is pasted together, so the
    // name is encoded rather than pasted.
    const raw = new Map<string, unknown>()
    const backing = memoryOver(raw)
    const guard = aProcess()
    await claimArea(backing, { name: 'a', holder: run('one'), guard })
    await claimArea(backing, { name: 'a:b', holder: run('two'), guard })

    expect(keysOf(raw).length).toBe(2)
    expect(areaFor('a:b').startsWith(areaFor('a'))).toBe(false)
  })

  it('does not let one run release another’s', async () => {
    const backing = store()
    const guard = aProcess()
    const superseded = await claimArea(backing, { name: 'alice', holder: run('one'), guard })
    const taken = await claimArea(backing, {
      name: 'alice',
      holder: run('two'),
      takeOver: true,
      guard,
    })

    // The run that was taken over stopping must not clear the claim of whatever
    // took it over, or the area would look free while it is in use.
    expect(superseded.held).toBe(false)
    await superseded.release()

    expect(taken.held).toBe(true)
    await expect(
      claimArea(backing, { name: 'alice', holder: run('three'), guard }),
    ).rejects.toThrow(StorageOwnershipError)
  })

  it('stops accepting writes from a run that was taken over', async () => {
    // The fence. A write begun before a takeover must not land after one, so
    // the area a superseded run holds refuses rather than trusting that nothing
    // is in flight.
    const backing = store()
    const guard = aProcess()
    const superseded = await claimArea(backing, { name: 'alice', holder: run('one'), guard })

    await superseded.storage.set('auth:dc2:key', 'from the old run')
    await claimArea(backing, { name: 'alice', holder: run('two'), takeOver: true, guard })

    await expect(superseded.storage.set('auth:dc2:key', 'later')).rejects.toThrow(
      /no longer owns the storage/,
    )
    await expect(superseded.storage.delete('auth:dc2:key')).rejects.toThrow(
      /no longer owns the storage/,
    )
    // Reading is still answered: it is this account's own data, and a
    // diagnostic that cannot read is one nobody writes.
    expect(await superseded.storage.get('auth:dc2:key')).toBe('from the old run')
  })

  it('says how far the exclusion it established actually reaches', async () => {
    // Nothing downstream may assume more than was established, so the lease
    // carries the reach rather than leaving it to be inferred.
    const lease = await claimArea(store(), { name: 'alice', holder: run('one'), guard: aProcess() })

    expect(lease.scope).toBe('process')
    expect(lease.held).toBe(true)
    await lease.release()
    expect(lease.held).toBe(false)
  })

  it('does not let a take-over reach a different account’s area', async () => {
    // Not a stale claim. A different name is the wrong store, and no flag makes
    // it the right one — it simply opens an empty area of its own.
    const backing = store()
    const guard = aProcess()
    await claimArea(backing, { name: 'alice', holder: run('one'), guard })

    const area = await claimArea(backing, {
      name: 'bob',
      holder: run('two'),
      takeOver: true,
      guard,
    })

    expect(await area.storage.get('claim')).toEqual({ name: 'bob', holder: run('two') })
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

    await expect(
      claimArea(backing, { name: 'alice', holder: run('one'), guard: aProcess() }),
    ).rejects.toThrow(/belongs to the account 'bob', not to 'alice'/)
  })

  it('refuses a claim that is not a record', async () => {
    const backing = store()
    await namespaced(backing, areaFor('alice')).set('claim', 'mine')

    await expect(
      claimArea(backing, { name: 'alice', holder: run('one'), guard: aProcess() }),
    ).rejects.toThrow(/not a record/)
  })

  it('refuses a claim that names no account', async () => {
    const backing = store()
    await namespaced(backing, areaFor('alice')).set('claim', { holder: run('one') })

    await expect(
      claimArea(backing, { name: 'alice', holder: run('two'), guard: aProcess() }),
    ).rejects.toThrow(/names no account/)
  })

  it('refuses a claim whose holder is not a token', async () => {
    const backing = store()
    await namespaced(backing, areaFor('alice')).set('claim', { name: 'alice', holder: 7 })

    await expect(
      claimArea(backing, { name: 'alice', holder: run('two'), guard: aProcess() }),
    ).rejects.toThrow(/holder that is not a token/)
  })

  it('reclaims what the same run already holds', async () => {
    // Idempotent for one run, so a reconnect does not have to take itself over.
    const backing = store()
    await claimArea(backing, { name: 'alice', holder: run('one'), guard: aProcess() })

    await expect(
      claimArea(backing, { name: 'alice', holder: run('one'), guard: aProcess() }),
    ).resolves.toBeDefined()
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
      { name: 'alice', holder: run('one'), guard: aProcess() },
    )

    expect(await area.storage.get('claim')).toEqual({ name: 'alice', holder: run('one') })
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

/**
 * Two runs arriving together.
 *
 * A sequential refusal — start one, stop it, start another — proves only that
 * a claim can be read. What it never exercises is the window the claim record
 * cannot close by itself: reading it, finding it free and writing your own is
 * three steps, and two runs doing that together both read "free" before either
 * writes.
 *
 * So the store here can hold its reads, which is how the interleaving is chosen
 * rather than hoped for.
 */
describe('two runs starting at the same moment', () => {
  /** A store whose reads can be suspended, so an interleaving is chosen. */
  function gated(raw = new Map<string, unknown>()) {
    const waiting: Array<() => void> = []
    let holding = false

    return {
      raw,
      hold() {
        holding = true
      },
      releaseAll() {
        holding = false
        for (const resume of waiting.splice(0)) resume()
      },
      store: {
        async get(key: string) {
          if (holding) await new Promise<void>((resolve) => waiting.push(resolve))

          return raw.get(key)
        },
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
      },
    }
  }

  it('does not both find the area free and both start', async () => {
    const gate = gated()
    const guard = aProcess()

    // Both read before either writes. Without a primitive that holds the name
    // across all three steps, both would proceed and both would believe they
    // owned the area.
    gate.hold()
    const first = claimArea(gate.store, { name: 'alice', holder: run('one'), guard })
    const second = claimArea(gate.store, { name: 'alice', holder: run('two'), guard })
    await settle()
    gate.releaseAll()

    const outcomes = await Promise.allSettled([first, second])
    const started = outcomes.filter((one) => one.status === 'fulfilled')
    const refused = outcomes.filter((one) => one.status === 'rejected')

    expect(started).toHaveLength(1)
    expect(refused).toHaveLength(1)
    expect((refused[0] as PromiseRejectedResult).reason).toBeInstanceOf(StorageOwnershipError)
  })

  it('does not let a superseded run clear the claim of what took over', async () => {
    const gate = gated()
    const guard = aProcess()
    const old = await claimArea(gate.store, { name: 'alice', holder: run('one'), guard })

    // The old run begins giving the area up; the new one takes it over in the
    // window between that read and its write.
    gate.hold()
    const releasing = old.release()
    await settle()
    gate.releaseAll()
    const taken = await claimArea(gate.store, {
      name: 'alice',
      holder: run('two'),
      takeOver: true,
      guard,
    })
    await releasing

    const claim = gate.raw.get(`${areaFor('alice')}claim`) as { holder?: string }
    expect(claim.holder).toBe(run('two'))
    expect(taken.held).toBe(true)
  })

  it('gives the name back when the claim it found refuses the area', async () => {
    // A refusal must not leave the guard held, or a caller that handles it and
    // points the account at a different store would find its own name taken by
    // the attempt that failed.
    const guard = aProcess()
    const legacy = new Map<string, unknown>([['auth:dc2:key', { id: 1n }]])

    await expect(
      claimArea(memoryOver(legacy), { name: 'alice', holder: run('one'), guard }),
    ).rejects.toThrow(/written before accounts had areas/)

    // The same name, a store that is not ambiguous: it must be available.
    const lease = await claimArea(memoryOver(new Map()), {
      name: 'alice',
      holder: run('two'),
      guard,
    })
    expect(lease.held).toBe(true)
  })

  it('frees the name when an account fails to start', async () => {
    // The area is taken before anything else on the way up is read, so a start
    // that fails after that point has already taken it. Leaving it held would
    // make one bad start poison every later one in the process.
    const guard = aProcess()
    const kept = new Map<string, unknown>()
    let failReads = false

    const brittle = {
      get: (key: string) => {
        if (failReads && key.endsWith('datacenters')) {
          return Promise.reject(new Error('the disk went away'))
        }

        return Promise.resolve(kept.get(key))
      },
      set: (key: string, value: unknown) => {
        kept.set(key, value)

        return Promise.resolve()
      },
      delete: (key: string) => {
        kept.delete(key)

        return Promise.resolve()
      },
      async *keys(prefix?: string) {
        for (const key of [...kept.keys()]) {
          if (key.startsWith(prefix ?? '')) yield key
        }
      },
    }

    failReads = true
    const doomed = harness({ name: 'alice', storage: brittle, storageGuard: guard })
    await expect(doomed.account.connect()).rejects.toThrow(/the disk went away/)

    // The next run gets the name, without anybody stopping the first.
    failReads = false
    const next = harness({ name: 'alice', storage: brittle, storageGuard: guard })
    await expect(next.account.connect()).resolves.toBeUndefined()
    await next.account.stop()
  })
})

describe('a store that offers no way to take a name', () => {
  it('is held only as far as the guard actually reaches', async () => {
    // The honest case. A plain adapter has no compare-and-set and no lock, so
    // what excludes two runs is the guard — and a process-wide guard says this
    // process and nothing about another opened over the same directory. The
    // lease reports that rather than implying more.
    const lease = await claimArea(memoryOver(new Map()), {
      name: 'alice',
      holder: run('one'),
      guard: aProcess(),
    })

    expect(lease.scope).toBe('process')
  })

  it('refuses a claim left by a run this process cannot see', async () => {
    // A persistent store plus a process-wide guard cannot tell a crashed run
    // from a live one in another process, so it refuses rather than guessing.
    // That is the case `takeOverStorage` exists for.
    const raw = new Map<string, unknown>([
      [`${areaFor('alice')}claim`, { name: 'alice', holder: 'a-run-elsewhere' }],
    ])
    const persistent = { ...memoryOver(raw), info: { driver: 'file', persistent: true } }

    await expect(
      claimArea(persistent, { name: 'alice', holder: run('one'), guard: aProcess() }),
    ).rejects.toThrow(/this process cannot see/)

    await expect(
      claimArea(persistent, {
        name: 'alice',
        holder: run('two'),
        takeOver: true,
        guard: aProcess(),
      }),
    ).resolves.toBeDefined()
  })

  it('adopts one automatically where the guard covers everyone who could hold it', async () => {
    // A store that cannot outlive its process cannot be reached from another
    // one, so a process-wide guard covers every possible holder. Being granted
    // the name is then the evidence that the run which left the claim is gone,
    // and an account that crashed reopens without anybody being asked.
    const raw = new Map<string, unknown>([
      [`${areaFor('alice')}claim`, { name: 'alice', holder: 'the-run-that-crashed' }],
    ])
    const ephemeral = { ...memoryOver(raw), info: { driver: 'memory', persistent: false } }

    const lease = await claimArea(ephemeral, {
      name: 'alice',
      holder: run('one'),
      guard: aProcess(),
    })

    expect(lease.held).toBe(true)
    expect(raw.get(`${areaFor('alice')}claim`)).toEqual({ name: 'alice', holder: run('one') })
  })
})
