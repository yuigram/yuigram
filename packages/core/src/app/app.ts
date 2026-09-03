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
 * called, and bringing them up and down together. **What it does not own:**
 * anything a client owns. It holds no transport, no session, no credential and
 * no protocol state, and it cannot — the contract it holds clients through
 * mentions none of those things.
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
import type { AppClient } from './client.js'

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
}

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

  constructor(options: AppOptions = {}) {
    this.name = options.name ?? 'app'
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
