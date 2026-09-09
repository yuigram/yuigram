/**
 * An account with the network replaced and nothing else.
 *
 * Everything between the account and the bytes on the wire is the real
 * implementation: the datacenter layer decides what to authorize and where, a
 * key is exchanged, a temporary key is vouched for, a channel is opened, a
 * session is established, and messages are sealed and opened. Only the socket
 * is substituted, so what a case here proves is what the account does rather
 * than what a stand-in for one does.
 *
 * ```
 *   Account ─> Datacenters ─> Connections ─> Channel ─> Session ─> bytes ─┐
 *                                                                         │
 *              MockDatacenter, answering in this process  <───────────────┘
 * ```
 *
 * The datacenters answer in this process and remember, between connections,
 * exactly what a datacenter remembers about a client. Nothing here implements
 * any of the protocol.
 */

import type { KV } from '@yuigram/core'
import { Account, type AccountOptions } from '../../src/account.js'
import { serverRsaKey } from '../../src/auth/keys.js'
import { REGISTRY as API } from '../../src/generated/api/registry.js'
import { REGISTRY as CORE } from '../../src/generated/core/registry.js'
import { REGISTRY as MTPROTO } from '../../src/generated/mtproto/registry.js'
import type { StreamRequest } from '../../src/network/channel.js'
import type { DcAddress, DcConfiguration } from '../../src/network/dc.js'
import type { ByteStream } from '../../src/network/tcp.js'
import { TlScope, type TlValue } from '../../src/tl/index.js'
import { MockDatacenter } from '../server/datacenter.js'
import { createServerKey, type ServerKey } from '../server/keys.js'
import type { Fault } from '../server/server.js'

/** The tables an account encodes and decodes with. */
const SCOPE = new TlScope('account', [CORE, MTPROTO, API])

/**
 * The moment a harness starts from.
 *
 * Client and datacenter agree on it because a session refuses a message whose
 * identifier falls outside a window around the server's own time. A client on
 * the wall clock against a peer fixed in the past is refused rather than
 * answered, which a case would see as a call that never returns.
 */
const NOW_SECONDS = 1_700_000_000

/**
 * A clock starting there and running at the rate of a real one.
 *
 * It has to run. A call gives up when its deadline passes, and a deadline is
 * passed by comparing it against this — so an account on a clock that never
 * moved would wait forever for an answer that is never coming, and a case about
 * giving up would hang instead of failing.
 */
function clock(): () => number {
  const started = Date.now()

  return () => NOW_SECONDS * 1000 + (Date.now() - started)
}

/** The datacenters a harness stands up unless a case asks for others. */
const ENDPOINTS: ReadonlyArray<{ id: number; host: string }> = [
  { id: 2, host: '127.0.0.2' },
  { id: 4, host: '127.0.0.4' },
]

/** A datacenter's address, as the client names it. Nothing routes to it. */
const address = (datacenter: MockDatacenter): DcAddress => ({
  id: datacenter.id,
  host: datacenter.host,
  port: datacenter.port,
  ipv6: false,
  mediaOnly: false,
  cdn: false,
  secret: undefined,
  tcpoOnly: false,
  thisPortOnly: false,
  static: false,
})

/** How a harness is built. */
export interface MockAccountOptions
  extends Partial<Omit<AccountOptions, 'keys' | 'bootstrap' | 'open' | 'storage'>> {
  /** The datacenters to stand up. Two, at 2 and 4, unless a case says otherwise. */
  readonly endpoints?: ReadonlyArray<{ id: number; host: string }>
  /** The key pair every datacenter offers. Generated when omitted. */
  readonly key?: ServerKey
  /**
   * Datacenters that already exist, rather than fresh ones.
   *
   * For a case about what an account leaves behind: the same datacenters, still
   * remembering the same client, answering a second account raised over the
   * state the first one wrote down.
   */
  readonly datacenters?: ReadonlyMap<number, MockDatacenter>
  /** State to begin from, rather than nothing. */
  readonly stored?: Map<string, unknown>
  /**
   * The store itself, for a case about one that misbehaves.
   *
   * A store is ordinarily built over {@link MockAccountOptions.stored}, which
   * keeps what it is given. A case about what an account does when writing
   * fails supplies its own instead.
   */
  readonly storage?: KV
  /**
   * A session to build the account from, rather than an empty one.
   *
   * The account is made by the public factory instead of the constructor, so a
   * case about a carried session drives the same path a caller would.
   */
  readonly session?: string
  /**
   * Misbehaviour every datacenter here performs.
   *
   * Consulted as each answer is composed rather than read once, so a case that
   * passes a set it keeps can make a datacenter start misbehaving at a moment
   * of its choosing — after an authorization is in hand, for instance.
   */
  readonly faults?: ReadonlySet<Fault>
  /**
   * What every datacenter here answers an API method with.
   *
   * Without one a peer answers `boolTrue`, which proves a call travelled and
   * nothing about what the account did with the answer. A case about the second
   * supplies the answer it wants to see handled.
   */
  readonly api?: (query: TlValue, dcId: number) => TlValue | undefined
}

/** What a case gets to drive and observe. */
export interface MockAccount {
  /** The account under test. Register handlers on it as usual. */
  readonly account: Account
  /** The datacenters answering it, by identifier. */
  readonly datacenters: ReadonlyMap<number, MockDatacenter>
  /** The datacenter with an identifier, for a case that wants to look at one. */
  datacenter(id: number): MockDatacenter
  /** What was stored, so a case can see what survived. */
  readonly stored: Map<string, unknown>
  /** Stop the account and let go of anything still held. */
  dispose(): Promise<void>
}

/**
 * Build an account whose datacenters answer in this process.
 *
 * Nothing is opened until the account is asked to connect, and no connection
 * exists until something needs to travel — the same as against a real network.
 */
export function mockAccount(options: MockAccountOptions = {}): MockAccount {
  const {
    endpoints = ENDPOINTS,
    key: shared,
    datacenters: existing,
    stored = new Map<string, unknown>(),
    storage,
    faults,
    api,
    session,
    ...rest
  } = options
  const key = shared ?? createServerKey()

  const datacenters =
    existing ??
    new Map<number, MockDatacenter>(
      endpoints.map(({ id, host }) => [
        id,
        new MockDatacenter({
          id,
          host,
          key,
          scope: SCOPE,
          serverTime: NOW_SECONDS,
          ...(faults === undefined ? {} : { faults }),
          ...(api === undefined ? {} : { api }),
        }),
      ]),
    )

  const places = [...datacenters.values()]
  const bootstrap: DcConfiguration = {
    // Where a client that has been told nothing else begins.
    thisDc: places[0]?.id ?? 2,
    testMode: true,
    options: places.map(address),
  }

  const settings = {
    apiId: 10_000,
    apiHash: 'mock-api-hash',
    now: clock(),
    ...rest,
    storage: storage ?? {
      get: async (name: string) => stored.get(name),
      set: async (name: string, value: unknown) => {
        stored.set(name, value)
      },
      delete: async (name: string) => {
        stored.delete(name)
      },
    },
    // The public half of the key the datacenters offer. A client selects a
    // server key by fingerprint, so this is what lets the exchange happen at
    // all — nothing here is a credential, and none is committed.
    keys: [serverRsaKey(key)],
    bootstrap,
    open: async (request: StreamRequest): Promise<ByteStream> => {
      for (const datacenter of datacenters.values()) {
        if (datacenter.answers(request)) return datacenter.connect(request)
      }

      throw new Error(`nothing answers at ${request.host}:${request.port}`)
    },
    // Recorded duties are actually run: a connection only acts when its clock
    // is driven, so a scheduler that recorded and never fired would test an
    // account that never sends anything.
    schedule: (run: () => void, delay: number) => {
      const timer = setTimeout(run, delay)

      return () => clearTimeout(timer)
    },
  } satisfies AccountOptions

  const account =
    session === undefined ? new Account(settings) : Account.fromString(session, settings)

  return {
    account,
    datacenters,
    datacenter(id: number): MockDatacenter {
      const found = datacenters.get(id)
      if (found === undefined) throw new Error(`no datacenter ${id} was stood up`)

      return found
    },
    stored,
    async dispose() {
      await account.stop({ timeout: 100 })
    },
  }
}
