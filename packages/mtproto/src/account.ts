/**
 * An account, as a caller holds one.
 *
 * The protocol subsystems underneath this are each complete and each owns
 * something: the datacenters own authorizations, the connections own channels,
 * the pools decide which connection carries what, the updates manager owns the
 * sequence, the peer store owns access hashes. None of them is a client, and
 * assembling them is what a caller would otherwise have to do.
 *
 * ```
 *   Account ─┬─ Datacenters   authorizations, addresses, migration
 *            ├─ Connections   one channel each, reopened as needed
 *            ├─ Pools         which connection a call travels on
 *            ├─ Updates       the sequence, and catching it up
 *            └─ Dispatcher    normalized events, middleware, handlers
 * ```
 *
 * **It owns the assembly and nothing else.** Every piece of protocol state
 * belongs to the subsystem that already owned it, and this holds references
 * rather than copies: there is no second key store, no second connection
 * registry, no second view of how far the update sequence has got. What is
 * genuinely new here is a name, a lifecycle, a place to register handlers, and
 * the wiring between updates arriving and handlers running.
 *
 * **Connecting and signing in are separate verbs**, because they fail
 * differently. A network that cannot be reached and a code that was mistyped
 * are not the same problem, and a session resumed from disk is already
 * authorized — so its sign-in callbacks are never reached rather than being
 * asked for values nobody needs.
 */

import type { KV } from '@yuigram/core'
import {
  createLogger,
  type Dispatchable,
  Dispatcher,
  type ErrorHandler,
  file,
  type Handler,
  Lifecycle,
  LifecycleError,
  type Logger,
  type Middleware,
  namespaced,
  type StopOptions,
  type UseOptions,
} from '@yuigram/core'
import type { ServerRsaKey } from './auth/keys.js'
import { REGISTRY as API } from './generated/api/registry.js'
import { REGISTRY as CORE } from './generated/core/registry.js'
import { REGISTRY as MTPROTO } from './generated/mtproto/registry.js'
import { type Connections, openConnections } from './network/connections.js'
import { type Datacenters, openDatacenters } from './network/datacenters.js'
import type { DcConfiguration } from './network/dc.js'
import { openPools, type Pools } from './network/pools.js'
import type { Reach } from './network/signin.js'
import { type MtprotoContext, mtprotoContext } from './normalize/index.js'
import type { ClientInfo } from './session/connection.js'
import { authorizationStore } from './storage/authorization.js'
import { datacenterStore } from './storage/datacenters.js'
import { type PeerStore, peerStore } from './storage/peers.js'
import { TlScope } from './tl/index.js'
import { openUpdates, type Updates } from './updates/manager.js'
import { UpdateState } from './updates/state.js'

/** What the server is told about this client when nothing else is said. */
const DEVICE: Omit<ClientInfo, 'apiId'> = {
  deviceModel: 'Yuigram',
  systemVersion: process.version,
  appVersion: '0.0.0',
  systemLangCode: 'en',
  langPack: '',
  langCode: 'en',
}

/** How an account is built. */
export interface AccountOptions {
  /** The application this client is registered as. */
  readonly apiId: number
  /** The secret that goes with it. */
  readonly apiHash: string
  /**
   * Where everything that must survive a restart is kept.
   *
   * One store, divided here. Authorizations, the datacenter list, peers and the
   * update sequence each live under their own prefix, so there is one place a
   * caller points at and one owner for each kind of state inside it.
   */
  readonly storage: KV<unknown>
  /**
   * The server keys a first key exchange may be answered with.
   *
   * Supplied rather than compiled in, and checked by fingerprint when a
   * datacenter answers. Needed only until every datacenter this client reaches
   * has an authorization stored.
   */
  readonly keys: readonly ServerRsaKey[]
  /**
   * The addresses to use until the server has published its own.
   *
   * Fetching the list needs an address and the address comes from the list, so
   * the first one is supplied. Which network an account belongs to — test or
   * production — is a property of this rather than of the account.
   */
  readonly bootstrap: DcConfiguration
  /** What this client is called in logs and in an application's lookup. */
  readonly name?: string
  /** What the server is told this client is. */
  readonly device?: Partial<Omit<ClientInfo, 'apiId'>>
  readonly log?: Logger
  /** Hide the shape of connections. Defaults to hiding them. */
  readonly obfuscated?: boolean
  /** Open a channel. Replaced only to drive the account without a network. */
  readonly openChannel?: Parameters<typeof openDatacenters>[0]['openChannel']
  /** Milliseconds since the epoch. Replaced only to make a test deterministic. */
  readonly now?: () => number
  /** Randomness for nonces, session identifiers and padding. */
  readonly random?: (length: number) => Uint8Array
  /** Run something later, and return the way to cancel it. */
  readonly schedule?: (run: () => void, delayMs: number) => () => void
}

/** What an account is once it has connected. */
interface Network {
  readonly datacenters: Datacenters
  readonly connections: Connections
  readonly pools: Pools
  readonly updates: Updates
}

/**
 * One Telegram account.
 *
 * Satisfies the contract an application holds clients through — a name, a
 * lifecycle, and a way to be surrounded — without that contract knowing what
 * MTProto is.
 */
export class Account<Ext = unknown> {
  /** What this client is called. */
  readonly name: string

  readonly #options: AccountOptions
  readonly #log: Logger
  readonly #dispatcher: Dispatcher<MtprotoContext & Ext>
  readonly #lifecycle: Lifecycle
  readonly #peers: PeerStore
  readonly #state = new UpdateState()

  /** Everything that exists only while connected. */
  #network: Network | undefined
  /** Installed by an application that holds this account. */
  #surrounding: Middleware<MtprotoContext & Ext> | undefined

  constructor(options: AccountOptions) {
    this.#options = options
    this.name = options.name ?? 'account'
    this.#log = options.log ?? createLogger()
    this.#dispatcher = new Dispatcher<MtprotoContext & Ext>()
    this.#peers = peerStore(namespaced(options.storage, 'peers:'))
    this.#lifecycle = new Lifecycle({
      onStart: () => this.#open(),
      onStop: () => {
        this.#close()
      },
    })
  }

  /**
   * An account whose state lives in a directory.
   *
   * The directory holds everything that must survive a restart, which is what
   * makes a second run of the same program the same account rather than a new
   * one asking to sign in again. Named for what a caller has: a session on
   * disk, rather than an options object they have to assemble correctly.
   */
  static fromSession<Ext = unknown>(
    directory: string,
    options: Omit<AccountOptions, 'storage'>,
  ): Account<Ext> {
    return new Account<Ext>({ ...options, storage: file(directory) })
  }

  /** How far through its lifecycle this account has got. */
  get state(): string {
    return this.#lifecycle.state
  }

  /** Whether this account is connected. */
  get connected(): boolean {
    return this.#network !== undefined
  }

  /**
   * Reach a datacenter.
   *
   * The pools decide which connection carries a call, so this is a view onto
   * them rather than a registry of its own. Throws while disconnected: a caller
   * holding a reach that silently did nothing would find out at the first
   * answer that never came.
   */
  get reach(): Reach {
    return (dcId: number) => {
      const network = this.#require()

      return network.pools.get({ id: dcId })
    }
  }

  /** Where peers learned along the way are written down. */
  get peers(): PeerStore {
    return this.#peers
  }

  // ---------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------

  /** Add middleware to this account's own chain. */
  use(middleware: Middleware<MtprotoContext & Ext>, options?: UseOptions): this {
    this.#dispatcher.use(middleware, options)

    return this
  }

  /** Handle events of a kind. */
  on(kind: string | readonly string[], handler: Handler<MtprotoContext & Ext>): this {
    this.#dispatcher.on(kind, handler)

    return this
  }

  /** Handle new messages. */
  onMessage(handler: Handler<MtprotoContext & Ext>): this {
    return this.on('message', handler)
  }

  /** Be told about anything a handler threw. */
  catch(handler: ErrorHandler<MtprotoContext & Ext>): this {
    this.#dispatcher.catch(handler)

    return this
  }

  // ---------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------

  /**
   * Open the connection this account speaks over.
   *
   * Named for what it does, because connecting and signing in fail differently
   * and a caller wants to know which happened. Idempotent: the lifecycle shares
   * one attempt between concurrent callers rather than opening two.
   */
  async connect(): Promise<void> {
    await this.#lifecycle.start()
  }

  /**
   * Bring the account up by the mechanism it runs.
   *
   * What an application calls. For an account that is connecting, so this is
   * the general verb over the specific one rather than a second way to do it.
   */
  async start(): Promise<void> {
    await this.connect()
  }

  /** Stop, draining what is in flight, and close every connection. */
  async stop(options: StopOptions = {}): Promise<boolean> {
    await this.#lifecycle.stop(options)

    return this.#lifecycle.stopped
  }

  /**
   * Put middleware around everything this account dispatches.
   *
   * How an application reaches outside a client. Installed once: an account
   * already held by one application being added to another has two owners, and
   * the second would silently replace the first's middleware.
   */
  surround(middleware: Middleware<MtprotoContext & Ext>): void {
    if (this.#surrounding !== undefined) {
      throw new LifecycleError(`the account '${this.name}' is already held by an application`)
    }

    this.#surrounding = middleware
  }

  // ---------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------

  /**
   * Assemble the network.
   *
   * Each layer is given the one beneath it and owns what it always owned. The
   * updates manager is handed a way to reach a datacenter and somewhere to put
   * what it decides is this account's to see, which is the only wiring between
   * the protocol and the events a caller registered for.
   */
  async #open(): Promise<void> {
    const scope = new TlScope('api', [CORE, MTPROTO, API])
    const storage = this.#options.storage

    const datacenters = await openDatacenters({
      scope,
      client: { apiId: this.#options.apiId, ...DEVICE, ...this.#options.device },
      keys: this.#options.keys,
      authorization: authorizationStore(namespaced(storage, 'auth:')),
      datacenters: datacenterStore(namespaced(storage, 'dcs:')),
      bootstrap: this.#options.bootstrap,
      ...(this.#options.obfuscated === undefined ? {} : { obfuscated: this.#options.obfuscated }),
      ...(this.#options.openChannel === undefined
        ? {}
        : { openChannel: this.#options.openChannel }),
      ...(this.#options.now === undefined ? {} : { now: this.#options.now }),
      ...(this.#options.random === undefined ? {} : { random: this.#options.random }),
      ...(this.#options.schedule === undefined ? {} : { schedule: this.#options.schedule }),
    })

    const connections = openConnections({
      datacenters,
      ...(this.#options.now === undefined ? {} : { now: this.#options.now }),
      ...(this.#options.random === undefined ? {} : { random: this.#options.random }),
      ...(this.#options.schedule === undefined ? {} : { schedule: this.#options.schedule }),
    })

    const pools = openPools({ connections })

    const updates = openUpdates({
      state: this.#state,
      peers: this.#peers,
      invoke: async (query) => await pools.get().invoke(query),
      onUpdate: (update) => {
        // Nothing waits for a handler: the sequence has already decided this
        // update is this account's to see, and holding the stream for whatever
        // a handler does would make one slow handler a gap in the sequence.
        this.#lifecycle.track(this.deliver(update))
      },
      onFailure: (error) => this.#log.error('updates', { error }),
      ...(this.#options.schedule === undefined ? {} : { schedule: this.#options.schedule }),
    })

    this.#network = { datacenters, connections, pools, updates }
  }

  /**
   * Take the network down.
   *
   * Every layer that was opened is closed, in the order that leaves nothing
   * reaching for something already gone: the updates manager stops chasing
   * before the connections it would chase over are closed.
   */
  #close(): void {
    const network = this.#network
    // Cleared first, so anything that arrives while closing finds no network
    // rather than a half-closed one.
    this.#network = undefined
    if (network === undefined) return

    network.updates.close()
    network.connections.close()
  }

  /**
   * Turn one update into an event and run the handlers for it.
   *
   * Where an application's middleware surrounds this account: outside the
   * dispatcher entirely, so what an application installs runs around this
   * account's own middleware rather than sorting into it.
   */
  async deliver(update: Parameters<typeof mtprotoContext>[0]): Promise<void> {
    const context = mtprotoContext(update, {
      client: this,
      log: this.#log,
    }) as MtprotoContext & Ext

    if (this.#surrounding === undefined) {
      await this.#dispatcher.dispatch(context)

      return
    }

    await this.#surrounding(context, async () => {
      await this.#dispatcher.dispatch(context)
    })
  }

  /** Take whatever the connection reported, for the sequence to judge. */
  async feed(value: Parameters<Updates['feed']>[0]): Promise<void> {
    await this.#require().updates.feed(value)
  }

  #require(): Network {
    if (this.#network === undefined) {
      throw new LifecycleError(`the account '${this.name}' is not connected`)
    }

    return this.#network
  }
}

/** What an account's contexts are, for a caller naming the type. */
export type AccountContext<Ext = unknown> = MtprotoContext & Ext

/** So a context is recognisably dispatchable without naming the dispatcher. */
export type { Dispatchable }
