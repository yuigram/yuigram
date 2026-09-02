/**
 * Reaching a datacenter, from an identifier to a usable connection.
 *
 * Three things have to come together before a channel can be opened, and each
 * is owned somewhere else: which address serves the purpose, whether an
 * authorization already exists for that datacenter, and what to do with one
 * that has just been negotiated. This is where they meet.
 *
 * ```
 *   directory ──> address ──┐
 *   store     ──> key    ───┼──> channel
 *                           │
 *   store     <── new key ──┘
 * ```
 *
 * **It is a factory, not a pool.** A channel it opens belongs to whoever asked
 * for it, and nothing here remembers it. Holding them would mean asking twice
 * gives the same connection back, which is pooling — and pooling has to decide
 * how many, for what, and what happens when one dies, none of which can be
 * answered without the layer that will own reconnection. Keeping ownership with
 * the caller is what lets that layer be added above rather than unpicked out of
 * this one.
 *
 * The two stores stay behind it. Nothing above needs to know that a key is
 * loaded before a connection is opened and written after one is negotiated, and
 * nothing below is allowed to reach persistence at all.
 */

import { CancelledError, NetworkError } from '@yuigram/core'
import type { ServerRsaKey } from '../auth/keys.js'
import { equalBytes } from '../crypto/bytes.js'
import { authKeyId } from '../crypto/kdf.js'
import { AuthKey } from '../message/auth-key.js'
import type { ClientInfo } from '../session/connection.js'
import type { SessionEvent } from '../session/dispatcher.js'
import type { AuthorizationStore } from '../storage/authorization.js'
import type { DatacenterStore } from '../storage/datacenters.js'
import type { TlScope } from '../tl/index.js'
import type { Framing } from '../transport/framing.js'
import type { Channel, ChannelOptions, KnownAuthorization, StreamRequest } from './channel.js'
import { openChannel as defaultOpenChannel } from './channel.js'
import {
  type DcAddress,
  type DcConfiguration,
  DcDirectory,
  type DcPurpose,
  readDcConfiguration,
  sameConfiguration,
} from './dc.js'
import type { ByteStream } from './tcp.js'

/** How the layer is built. */
export interface DatacentersOptions {
  /** The tables every connection encodes and decodes with. */
  readonly scope: TlScope
  /** What the server is told this client is. */
  readonly client: ClientInfo
  /**
   * The server keys a first key exchange may be answered with.
   *
   * Needed only until every datacenter this client reaches has an
   * authorization stored. A fingerprint outside this set is refused.
   */
  readonly keys: readonly ServerRsaKey[]
  /** Where authorizations are kept. */
  readonly authorization: AuthorizationStore
  /** Where the datacenter configuration is kept. */
  readonly datacenters: DatacenterStore
  /**
   * The addresses to use until the server has published its own.
   *
   * Fetching the list needs an address and the address comes from the list, so
   * the first one is supplied rather than discovered. Published addresses
   * change, so this is configuration rather than something compiled in.
   */
  readonly bootstrap: DcConfiguration
  /** The envelope messages travel in. */
  readonly framing?: Framing
  /** Hide the shape of connections. */
  readonly obfuscated?: boolean
  /** Milliseconds to wait for a socket handshake. */
  readonly connectTimeout?: number
  /** Milliseconds since the epoch. Replaced only to make a test deterministic. */
  readonly now?: () => number
  /** Randomness for nonces, session identifiers and padding. */
  readonly random?: (length: number) => Uint8Array
  /** Open the byte stream. Replaced to route through a proxy, or in a test. */
  readonly open?: (request: StreamRequest) => Promise<ByteStream>
  /** Run something later, and return the way to cancel it. */
  readonly schedule?: (run: () => void, delayMs: number) => () => void
  /** Assemble a channel. Replaced only to drive the layer without a network. */
  readonly openChannel?: (options: ChannelOptions) => Promise<Channel>
}

/** What to connect to. */
export interface ConnectOptions {
  /** Defaults to the datacenter this client belongs to. */
  readonly id?: number
  /** Defaults to ordinary calls and updates. */
  readonly purpose?: DcPurpose
  /** Prefer an IPv6 address. */
  readonly ipv6?: boolean
  /** Abandon the attempt. */
  readonly signal?: AbortSignal
  /** The channel ended on its own. */
  readonly onClosed?: (error?: Error) => void
  /** Anything the connection does not answer itself. */
  readonly onEvent?: (event: SessionEvent) => void
}

/** The datacenters this client knows, and how to reach them. */
export interface Datacenters {
  /** What is currently known. Replaced wholesale when the server publishes. */
  readonly directory: DcDirectory
  /**
   * Open a channel to a datacenter.
   *
   * The channel belongs to the caller: closing it, and deciding whether to open
   * another, are decisions this layer does not make.
   */
  connect(options?: ConnectOptions): Promise<Channel>
  /**
   * Discard an authorization the datacenter has refused.
   *
   * Named by the identifier of the key that was refused, and does nothing
   * unless that is still the key being kept. A datacenter serves more than one
   * connection, so by the time a refusal is acted on another connection may
   * already have obtained a replacement — and removing that replacement would
   * leave a live connection authorized against a key stored nowhere, which is
   * the same damage this guards everywhere else.
   */
  forget(id: number, keyId: Uint8Array): Promise<void>
  /** Ask the server for the current configuration, and adopt what it says. */
  refresh(channel: Channel): Promise<DcConfiguration>
  /** Take a configuration as the one in force, and remember it. */
  adopt(configuration: DcConfiguration): Promise<void>
}

/**
 * Build the layer, using whatever was stored last.
 *
 * The stored configuration is preferred over the supplied one: it came from the
 * server, and the supplied addresses exist only to reach a server in the first
 * place.
 */
export async function openDatacenters(options: DatacentersOptions): Promise<Datacenters> {
  const stored = await options.datacenters.load()
  let persisted = stored
  let directory = new DcDirectory(stored ?? options.bootstrap)

  const openTheChannel = options.openChannel ?? defaultOpenChannel

  /**
   * Exchanges under way, one per datacenter.
   *
   * A datacenter has one authorization, and only one can be kept. Two
   * connections opened at the same moment would otherwise each obtain a key and
   * the second would be written over the first — leaving a live connection
   * holding an authorization that no longer exists anywhere, and, once signing
   * in exists, an account authorized against a key that is discarded on the
   * next start.
   *
   * Only the obtaining is shared. Each caller still gets a connection of its
   * own, so this is not a cache of channels.
   */
  const obtaining = new Map<number, Promise<KnownAuthorization>>()

  /**
   * The last authorization operation queued for a datacenter.
   *
   * A datacenter's authorization is read, compared and written across several
   * store calls, and the store is free to take as long as it likes over any of
   * them. Two operations left to interleave can therefore act on what the other
   * has already replaced: a discard that read a key before another connection
   * replaced it would compare against what it read and delete what is there
   * now, which is the replacement.
   *
   * The store is a key-value store, so it cannot be asked to compare and delete
   * in one step; the ordering has to be supplied here. Every operation that
   * reads or writes a datacenter's authorization runs in this queue, so none of
   * them can observe another halfway through. Datacenters have queues of their
   * own, and nothing else is serialized — a connection being opened is not an
   * authorization operation once the key is in hand.
   */
  const authorizing = new Map<number, Promise<unknown>>()

  /**
   * Run something with a datacenter's authorization to itself.
   *
   * Queued rather than locked, so nothing can hold the queue by failing to
   * release it. What is queued behind is whether the previous operation
   * finished, not what it produced — one that failed must not stop the next,
   * which is not the one that failed and will read the store for itself.
   */
  function authorize<T>(id: number, work: () => Promise<T>): Promise<T> {
    const queued = (authorizing.get(id) ?? Promise.resolve()).then(work)
    const settled = queued.then(
      () => undefined,
      () => undefined,
    )

    authorizing.set(id, settled)
    void settled.then(() => {
      if (authorizing.get(id) === settled) authorizing.delete(id)
    })

    return queued
  }

  /**
   * Take a configuration as the one in force.
   *
   * Written down before it is adopted. A configuration held in memory that was
   * never stored reverts on the next start, and reporting the failure while
   * having changed anyway leaves a caller unable to say what is in force — so
   * nothing changes here until the store has accepted it.
   *
   * A configuration the store already holds is not written again. The server
   * publishes the same list on every call that changes nothing, and rewriting
   * it would spend a write per refresh for no difference.
   */
  const adopt = async (configuration: DcConfiguration): Promise<void> => {
    if (persisted !== undefined && sameConfiguration(configuration, persisted)) return

    await options.datacenters.save(configuration)
    persisted = configuration
    directory = new DcDirectory(configuration)
  }

  /**
   * The authorization for a datacenter, obtained once.
   *
   * Registered before anything is awaited, so two callers arriving together
   * share one exchange rather than each starting their own. A failure is not
   * remembered: the next caller tries again.
   */
  function authorizationFor(id: number, address: DcAddress): Promise<KnownAuthorization> {
    const running = obtaining.get(id)
    if (running !== undefined) return running

    const attempt = authorize(id, async () => {
      const stored = await loadAuthorization(options.authorization, id)
      if (stored !== undefined) return stored

      // Opened for the exchange alone, carrying nothing belonging to any one
      // caller — no cancellation, no reports. The exchange is shared, so a
      // caller that walks away must not take it from the others, and a caller
      // that stays must not receive reports about a connection it never asked
      // for. Each caller opens its own once the key exists.
      const channel = await openTheChannel({
        address,
        scope: options.scope,
        client: options.client,
        keys: options.keys,
        ...pass(options),
      })

      try {
        // A key that cannot be written down has to be obtained again on every
        // start, so failing to store one fails the connection rather than
        // leaving a client that quietly re-authorizes forever.
        await options.authorization.setKey(id, channel.authorization.key.toBytes())
        await options.authorization.setSalt(id, channel.authorization.salt)
      } finally {
        channel.close()
      }

      return channel.authorization
    })

    obtaining.set(id, attempt)
    void attempt
      .catch(() => undefined)
      .then(() => {
        if (obtaining.get(id) === attempt) obtaining.delete(id)
      })

    return attempt
  }

  return {
    get directory() {
      return directory
    },

    async connect(query = {}) {
      const id = query.id ?? directory.thisDc
      const address = directory.select({
        id,
        ...(query.purpose === undefined ? {} : { purpose: query.purpose }),
        ...(query.ipv6 === undefined ? {} : { ipv6: query.ipv6 }),
      })

      if (address === undefined) {
        throw new NetworkError(
          `no address is known for datacenter ${id} serving ${query.purpose ?? 'main'}`,
        )
      }

      const authorization = await abandonable(authorizationFor(id, address), query.signal)

      return openTheChannel({
        address,
        scope: options.scope,
        client: options.client,
        authorization,
        ...pass(options),
        ...(query.signal === undefined ? {} : { signal: query.signal }),
        ...(query.onClosed === undefined ? {} : { onClosed: query.onClosed }),
        ...(query.onEvent === undefined ? {} : { onEvent: query.onEvent }),
      })
    },

    async forget(id, keyId) {
      // Read, compare, remove — with nothing else touching this datacenter's
      // authorization in between, which is what makes the comparison still
      // true at the removal. Without that, a discard whose read was slow would
      // compare against a key that has since been replaced and delete the
      // replacement, leaving a live connection authorized against a key stored
      // nowhere.
      await authorize(id, async () => {
        const stored = await options.authorization.key(id)
        if (stored === undefined) return
        if (!equalBytes(authKeyId(stored), keyId)) return

        await options.authorization.forget(id)
      })
    },

    async refresh(channel) {
      // Read and checked in full before anything is adopted: a configuration
      // accepted in part would be indistinguishable from one the server
      // published that way.
      const configuration = readDcConfiguration(await channel.invoke({ _: 'help.getConfig' }))
      await adopt(configuration)

      return configuration
    },

    adopt,
  }
}

/**
 * Wait for something shared, but only for as long as this caller wants to.
 *
 * The work carries on: it is being done for everyone who asked, and one of them
 * losing interest is not a reason to stop. What ends is this caller's wait.
 */
function abandonable<T>(work: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (signal === undefined) return work
  if (signal.aborted) return Promise.reject(new CancelledError('the connection was abandoned'))

  return new Promise<T>((resolve, reject) => {
    const abandon = () => reject(new CancelledError('the connection was abandoned'))
    signal.addEventListener('abort', abandon, { once: true })

    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', abandon))
  })
}

/**
 * The authorization stored for a datacenter, if there is one.
 *
 * A key without a salt is still usable: the server refuses the first message
 * and names the salt to use, which costs one round trip and is self-correcting.
 * The clock correction is deliberately not stored — it is only true relative to
 * the clock it was measured against — so a resumed connection learns it the
 * same way a new one does.
 */
async function loadAuthorization(store: AuthorizationStore, id: number) {
  const key = await store.key(id)
  if (key === undefined) return undefined

  return { key: AuthKey.from(key), salt: (await store.salt(id)) ?? 0n }
}

/** The channel settings that are the same for every datacenter. */
function pass(options: DatacentersOptions) {
  return {
    ...(options.framing === undefined ? {} : { framing: options.framing }),
    ...(options.obfuscated === undefined ? {} : { obfuscated: options.obfuscated }),
    ...(options.connectTimeout === undefined ? {} : { connectTimeout: options.connectTimeout }),
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.random === undefined ? {} : { random: options.random }),
    ...(options.open === undefined ? {} : { open: options.open }),
    ...(options.schedule === undefined ? {} : { schedule: options.schedule }),
  }
}
