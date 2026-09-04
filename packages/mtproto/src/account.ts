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
  SessionError,
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
import { decodeSession, encodeSession, type PortableSession } from './session.js'
import { type AuthorizationStore, authorizationStore } from './storage/authorization.js'
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
  /**
   * Open the byte stream a connection travels over.
   *
   * The network, and only the network. Everything above it — the handshake, the
   * authorization, the channel, the session, the sequence — runs exactly as it
   * does against Telegram, which is what makes a test of an account a test of
   * the account rather than of something standing in for one.
   */
  readonly open?: Parameters<typeof openDatacenters>[0]['open']
  /**
   * Assemble a channel.
   *
   * A coarser seam than {@link AccountOptions.open}: it replaces the handshake
   * along with the socket, so it suits a case about what an account does with a
   * channel rather than about how one comes to exist.
   */
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
  /**
   * A session this account was built from, until it has been written down.
   *
   * Held rather than applied because reading a session is immediate and writing
   * one is not: a caller finds out that a string is malformed where they passed
   * it, and the store learns about it on the way up, before anything reads an
   * authorization.
   */
  #importing: PortableSession | undefined

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

  /**
   * An account carried in a string.
   *
   * For somewhere with nowhere to write: the authorization travels as
   * configuration and the account is assembled around it. The string **is** a
   * logged-in account — see {@link Account.exportSession}.
   *
   * A store is supplied rather than made here. An account needs one to run at
   * all, not merely to survive a restart: a key with a lifetime, the peers it
   * learns and the addresses it is told are all written while it works. What a
   * caller wants when there is nowhere to write is `memory()`, said out loud,
   * rather than an account quietly holding a store nobody can see.
   *
   * ```ts
   * const me = Account.fromString(process.env.SESSION!, {
   *   apiId,
   *   apiHash,
   *   keys,
   *   bootstrap,
   *   storage: memory(),
   * })
   * ```
   *
   * The string is read here and now, so a malformed one fails where it was
   * passed rather than at the first connection.
   */
  static fromString<Ext = unknown>(session: string, options: AccountOptions): Account<Ext> {
    const imported = decodeSession(session)

    if (imported.testMode !== options.bootstrap.testMode) {
      // Addresses for one network and a key from the other cannot be made to
      // work, and the failure they produce says nothing about why.
      throw new SessionError(
        `a session for the ${imported.testMode ? 'test' : 'production'} network cannot be used ` +
          `with addresses for the ${options.bootstrap.testMode ? 'test' : 'production'} network`,
      )
    }

    const account = new Account<Ext>({
      ...options,
      // The session names the datacenter its key belongs to, which is this
      // account's own. A bootstrap says where to start looking, not whose key
      // this is.
      bootstrap: { ...options.bootstrap, thisDc: imported.dcId },
    })
    account.#importing = imported

    return account
  }

  /**
   * Write this account out as a string.
   *
   * The long-lived key for the datacenter this account belongs to, and enough
   * to place it. Nothing that is obtained again rather than carried: no key with
   * a lifetime, no salt, no peers, no update sequence, and neither of the
   * application's credentials.
   *
   * **The result is a logged-in account.** Anyone who has it is signed in as
   * this account until the authorization is revoked. It is not a configuration
   * value: it does not belong in a repository, in a bug report, or in a message
   * to somebody helping with a problem.
   *
   * Reads what has been written down rather than what is in flight, so it needs
   * no connection, changes nothing, and gives the same answer twice.
   */
  async exportSession(): Promise<string> {
    const storage = this.#options.storage
    const authorization = authorizationStore(namespaced(storage, 'auth:'))
    const configuration = await datacenterStore(namespaced(storage, 'dcs:')).load()
    const dcId = configuration?.thisDc ?? this.#options.bootstrap.thisDc

    const key = await authorization.key(dcId)
    if (key === undefined) {
      throw new SessionError(
        `the account '${this.name}' has no authorization for datacenter ${dcId} to export`,
      )
    }

    return encodeSession({
      dcId,
      testMode: configuration?.testMode ?? this.#options.bootstrap.testMode,
      authKey: key,
    })
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

    await this.#seed(authorizationStore(namespaced(storage, 'auth:')))

    const datacenters = await openDatacenters({
      scope,
      client: { apiId: this.#options.apiId, ...DEVICE, ...this.#options.device },
      keys: this.#options.keys,
      authorization: authorizationStore(namespaced(storage, 'auth:')),
      datacenters: datacenterStore(namespaced(storage, 'dcs:')),
      bootstrap: this.#options.bootstrap,
      ...(this.#options.obfuscated === undefined ? {} : { obfuscated: this.#options.obfuscated }),
      ...(this.#options.open === undefined ? {} : { open: this.#options.open }),
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
   * Put an imported session where the datacenter layer will find it.
   *
   * Once, on the way up and before anything reads an authorization. What a
   * caller passed a string for is to be this account, so the string is
   * authoritative: a key already in the store for another datacenter belongs to
   * whoever was there before, and an account that reached that datacenter would
   * use a stranger's key rather than its own. Every datacenter this account
   * could reach is forgotten first — which is the set it was given addresses
   * for, plus the one the session names.
   *
   * A supplied store is still the caller's. This clears what would conflict
   * with the session it was asked to import, and nothing else.
   */
  async #seed(authorization: AuthorizationStore): Promise<void> {
    const imported = this.#importing
    if (imported === undefined) return

    // Cleared before it is used, so a failure part-way leaves an account that
    // authorizes from nothing rather than one holding somebody else's key.
    this.#importing = undefined

    const reachable = new Set<number>([
      imported.dcId,
      ...this.#options.bootstrap.options.map((address) => address.id),
    ])
    for (const dcId of reachable) await authorization.forget(dcId)

    await authorization.setKey(imported.dcId, imported.authKey)
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
