/**
 * Holding several clients as one application.
 *
 * A program that talks to Telegram as more than one identity — a bot and the
 * account that administers it, or several accounts — has one set of concerns
 * that belong to all of them and one set that belongs to each. Logging, rate
 * limiting and metrics are the first kind. Which credential answers a message
 * is the second. A container exists to hold the first without pretending the
 * second does not matter.
 *
 * ```
 *   App middleware  ─────────────────────────────┐  every client, every update
 *     Client middleware  ──────────────┐         │  one client
 *       Router middleware  ──┐         │         │  updates that router handles
 *         Handler           │         │         │
 * ```
 *
 * **What it owns:** which clients exist, what surrounds them, what they are
 * called, bringing them up and down together, and where the application's own
 * state is kept. **What it does not own:** anything a client owns. It holds no
 * transport, no session, no credential and no protocol state, and it cannot —
 * the contract it holds clients through mentions none of those things.
 *
 * Storage follows the same line. A container keeps framework state — what
 * handlers and plugins accumulate — in areas of one store:
 *
 * ```
 *   app:                  the application's own
 *   clients:<name>:       one per client it holds
 * ```
 *
 * An account's authorization is not in there and never will be. It is a
 * different contract with a different threat model, a different lifetime and a
 * different answer to losing it, and it is given to the account directly.
 *
 * **Clients stay independent.** A container is a convenience over doing the
 * same thing to each, not a supervisor that couples them: one client failing to
 * start leaves the others running and separately controllable, because a bot
 * that cannot reach Telegram is no reason for an unrelated account to stop.
 */

import type { Dispatchable } from '../dispatch/dispatcher.js'
import { YuigramError } from '../errors/errors.js'
import type { StopOptions } from '../lifecycle/lifecycle.js'
import { compose, type Middleware } from '../middleware/compose.js'
import { namespaced } from '../storage/compose.js'
import { memory } from '../storage/memory.js'
import type { KV } from '../storage/types.js'
import type { AppClient } from './client.js'

/**
 * Where the application's own state is kept.
 *
 * Two areas, and they cannot overlap: neither prefix begins the other, so no
 * key written under one is reachable under the other.
 */
const OWN = 'app:'
const PER_CLIENT = 'clients:'

/** Raised when a container is asked for something it cannot do. */
export class AppError extends YuigramError {
  override readonly name = 'AppError'
}

/** What a container is told when a client could not be brought up or down. */
export interface ClientFailure<C extends Dispatchable = Dispatchable> {
  /** The client the failure belongs to. */
  readonly client: AppClient<C>
  /** What went wrong. */
  readonly error: unknown
}

/** How a container is built. */
export interface AppOptions {
  /** What to call the application in logs. */
  readonly name?: string
  /**
   * Where state belonging to the application is kept.
   *
   * Framework state: what handlers and plugins accumulate, and what a container
   * wants to survive a restart. Not protocol state — an MTProto account's
   * authorization is a different contract with a different threat model, a
   * different lifetime and a different answer to losing it, and it is supplied
   * to the account rather than taken from here.
   *
   * Defaults to a store of this application's own, which is enough to develop
   * against and vanishes with the process. One is made per application, so two
   * of them never see each other's keys.
   */
  readonly storage?: KV
}

/**
 * The area of a store belonging to one client.
 *
 * The name is encoded rather than pasted in. Names are unique within an
 * application, but uniqueness alone does not make the mapping safe: a client
 * called `a` writing `b:x` and a client called `a:b` writing `x` would land on
 * the same key. Encoding leaves no `:` inside a name, so the segment boundary
 * is unambiguous and the mapping from name to area is one-to-one.
 */
const areaOf = (name: string): string => `${PER_CLIENT}${encodeURIComponent(name)}:`

/**
 * Several clients, held together.
 *
 * Registration order is kept, because starting and stopping visit clients in
 * the order they were added and a container that reordered them would make a
 * dependency between two clients impossible to express by adding them in order.
 */
export class App<C extends Dispatchable = Dispatchable> {
  readonly name: string

  readonly #clients: Array<AppClient<C>> = []
  readonly #byName = new Map<string, AppClient<C>>()
  readonly #middleware: Array<Middleware<C>> = []
  readonly #onError: Array<(failure: ClientFailure<C>) => unknown> = []
  /** The store as given. Never handed out: what leaves here is always an area. */
  readonly #store: KV
  readonly #own: KV

  constructor(options: AppOptions = {}) {
    this.name = options.name ?? 'app'
    // Made here rather than shared from a module, so two applications built the
    // same way still keep their state apart.
    this.#store = options.storage ?? memory()
    this.#own = namespaced(this.#store, OWN)
  }

  /**
   * The application's own state.
   *
   * An area of the store rather than the store itself, so what a container
   * keeps cannot be reached by asking a client for its own.
   */
  get storage(): KV {
    return this.#own
  }

  /**
   * The area of the store belonging to one client.
   *
   * Handed out on request rather than pushed into the client, because a client
   * is usable without an application and one that had been given storage by a
   * container would stop being. What a client keeps here is framework state; a
   * client's protocol state is its own and never passes through this.
   *
   * Only for a client this application holds. A container has no area for a
   * client it was never given, and inventing one would let two applications
   * silently write to the same place.
   */
  storageFor(client: AppClient<C>): KV {
    if (this.#byName.get(client.name) !== client) {
      throw new AppError(`the client '${client.name}' is not in this application`)
    }

    return namespaced(this.#store, areaOf(client.name))
  }

  /** The clients this container holds, in the order they were added. */
  get clients(): readonly AppClient<C>[] {
    return [...this.#clients]
  }

  /**
   * Hold a client.
   *
   * Returns the client, so a caller can name it and use it in one expression.
   * A name is how a client is found later, so two clients sharing one is a
   * mistake that would make a lookup answer arbitrarily.
   */
  add<T extends AppClient<C>>(client: T): T {
    if (this.#byName.has(client.name)) {
      throw new AppError(`a client named '${client.name}' is already in this application`)
    }

    this.#clients.push(client)
    this.#byName.set(client.name, client)

    // One chain per client, installed once. Middleware added later reaches it
    // because the chain reads the list rather than closing over its contents.
    client.surround(async (context, next) => {
      await compose<C>(this.#middleware)(context, next)
    })

    return client
  }

  /** The client with a name, or nothing when no client has it. */
  client(name: string): AppClient<C> | undefined {
    return this.#byName.get(name)
  }

  /**
   * Add middleware that surrounds every client.
   *
   * It reaches clients added afterwards as well as those already held: a
   * container whose middleware depended on registration order would make
   * `app.use` before `app.add` mean something different from the reverse, and
   * neither reading is more obviously right than the other.
   */
  use(middleware: Middleware<C>): this {
    this.#middleware.push(middleware)

    return this
  }

  /** Be told when a client fails to start or stop. */
  onError(handler: (failure: ClientFailure<C>) => unknown): this {
    this.#onError.push(handler)

    return this
  }

  /**
   * Bring every client up.
   *
   * A client that fails does not stop the others: each is started on its own
   * and its failure is reported rather than thrown, because a container that
   * gave up on the first failure would leave the clients after it untouched and
   * the ones before it running, which is a state nobody asked for.
   */
  async start(): Promise<void> {
    for (const client of this.#clients) {
      try {
        await client.start()
      } catch (error) {
        await this.#report(client, error)
      }
    }
  }

  /**
   * Take every client down, draining each.
   *
   * In the order they were added, and every one of them: a client that fails to
   * stop must not leave the rest running, so a failure is reported and the next
   * client is still asked to stop.
   */
  async stop(options: StopOptions = {}): Promise<boolean> {
    let drained = true

    for (const client of this.#clients) {
      try {
        if (!(await client.stop(options))) drained = false
      } catch (error) {
        drained = false
        await this.#report(client, error)
      }
    }

    return drained
  }

  /**
   * Hand a failure to whoever is listening.
   *
   * A failure nobody is listening for is re-thrown rather than dropped: a
   * container that swallowed it would turn a client that never started into a
   * silence, which is the failure mode a container is most likely to hide.
   */
  async #report(client: AppClient<C>, error: unknown): Promise<void> {
    if (this.#onError.length === 0) throw error

    for (const handler of this.#onError) await handler({ client, error })
  }
}
