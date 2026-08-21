/**
 * Framework sessions: per-user, per-chat or per-conversation application state.
 *
 * Distinct from MTProto authorization sessions, which hold credentials and use
 * a structured store of their own. These two share a word and nothing else:
 * losing this one forgets a shopping cart, losing that one requires a human to
 * re-authenticate with an SMS code. They degrade differently by design.
 *
 * Three behaviours are load-bearing:
 *
 * - **Lazy load.** The store is read on first access, not on every update, so
 *   handlers that never touch the session cost nothing.
 * - **Dirty tracking.** An untouched session is not written back, which keeps
 *   read-only traffic from hammering the store.
 * - **Per-key serialization.** Concurrent updates for the same key queue, so
 *   two rapid messages cannot both read `count: 0` and both write `1`.
 */

import type { BaseContext } from '../context/types.js'
import type { Middleware, MiddlewareHost } from '../middleware/compose.js'
import type { Plugin } from '../plugin/plugin.js'
import type { KV } from '../storage/types.js'

/**
 * What the session middleware adds to a context.
 *
 * An application names its own state type and intersects the flavour into the
 * context it hands the client:
 *
 * ```ts
 * interface Cart {
 *   items: string[]
 * }
 *
 * type MyContext = Context & SessionFlavor<Cart>
 *
 * const bot = new Bot<MyContext>(token)
 * bot.use(createSession<MyContext, Cart>({ storage: memory(), key, initial }))
 * ```
 *
 * `createSession` requires the context to carry this flavour, so installing the
 * middleware on a client whose context does not declare it is a compile error
 * rather than an `undefined` at runtime.
 */
export interface SessionFlavor<V> {
  /** The loaded session. Mutating it marks the session dirty. */
  session: V
  /** Lifecycle controls: dirty state, replacement, clearing. */
  readonly sessionHandle: SessionHandle<V>
}

/** Derives the storage key for an update, or `undefined` to skip loading. */
export type SessionKeyFn<C> = (context: C) => string | number | undefined

/** Options for {@link createSession}. */
export interface SessionOptions<C, V> {
  /** Where sessions live. */
  readonly storage: KV<V>
  /**
   * Derives the key.
   *
   * The default is per-user-per-chat, because a user's state in a group is
   * rarely the state they want in a direct message, and the reverse mistake
   * leaks one conversation's context into another.
   */
  readonly key: SessionKeyFn<C>
  /** Produces the value for a key with nothing stored. */
  readonly initial: () => V
  /** Time to live in seconds, refreshed on each write. */
  readonly ttl?: number
  /** Context property to expose the session on. Defaults to `session`. */
  readonly property?: string
}

/** A loaded session and the machinery to persist it. */
export interface SessionHandle<V> {
  /** The current value. Mutating it marks the session dirty. */
  readonly value: V
  /** Whether anything changed since load. */
  readonly dirty: boolean
  /** Replace the value wholesale. */
  set(next: V): void
  /** Mark dirty without replacing, for in-place mutation of a nested field. */
  touch(): void
  /** Discard the stored session. */
  clear(): void
}

/** Tracks one session's lifecycle within a single update. */
class Session<V> implements SessionHandle<V> {
  #value: V
  #dirty = false
  #cleared = false
  #tracked: V | undefined

  constructor(initial: V) {
    this.#value = initial
  }

  /**
   * The value, wrapped so that changing it marks the session dirty.
   *
   * Without the wrapper `session.count += 1` reads the object, mutates it and
   * never says so, and the change is lost at the end of the update — which is
   * the single most surprising thing a session can do, because the code looks
   * exactly like code that works.
   *
   * The wrapper is built on first access and reused, so a handler that only
   * reads pays for one proxy and a handler that never touches the session pays
   * for nothing.
   */
  get value(): V {
    if (typeof this.#value !== 'object' || this.#value === null) return this.#value

    this.#tracked ??= track(this.#value, () => {
      this.#dirty = true
    })

    return this.#tracked
  }

  /** The value as stored, without the tracking wrapper. */
  get raw(): V {
    return this.#value
  }

  get dirty(): boolean {
    return this.#dirty
  }

  get cleared(): boolean {
    return this.#cleared
  }

  set(next: V): void {
    this.#value = next
    this.#tracked = undefined
    this.#dirty = true
    this.#cleared = false
  }

  touch(): void {
    this.#dirty = true
  }

  clear(): void {
    this.#cleared = true
    this.#dirty = true
  }
}

/**
 * Proxies already built, so repeated access returns the same object.
 *
 * Identity matters: `session.items === session.items` should hold, and a
 * handler that captures a nested object should keep watching the same one.
 */
const proxies = new WeakMap<object, WeakMap<object, unknown>>()

/**
 * Wrap a value so that any change to it, however deep, reports back.
 *
 * Arrays work by the same mechanism: `push` writes an index and a length, and
 * both go through the set trap.
 */
function track<T>(value: T, onChange: () => void): T {
  if (typeof value !== 'object' || value === null) return value

  const marker = onChange as unknown as object
  let byValue = proxies.get(marker)

  if (byValue === undefined) {
    byValue = new WeakMap()
    proxies.set(marker, byValue)
  }

  const existing = byValue.get(value as object)
  if (existing !== undefined) return existing as T

  const proxy = new Proxy(value as object, {
    get(target, property, receiver) {
      const inner = Reflect.get(target, property, receiver) as unknown
      return typeof inner === 'object' && inner !== null ? track(inner, onChange) : inner
    },
    set(target, property, next, receiver) {
      onChange()
      return Reflect.set(target, property, next, receiver)
    },
    deleteProperty(target, property) {
      onChange()
      return Reflect.deleteProperty(target, property)
    },
  }) as T

  byValue.set(value as object, proxy)
  return proxy
}

/**
 * Serializes work per key.
 *
 * Without this, two updates for the same user interleave between read and
 * write and one increment is lost — the classic lost-update race, and one
 * users hit immediately by sending two messages quickly.
 */
export class KeyedQueue {
  readonly #tails = new Map<string, Promise<unknown>>()

  async run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.#tails.get(key) ?? Promise.resolve()
    // Swallow the predecessor's rejection: one update's failure must not
    // cascade into the next update for the same key.
    const result = previous.then(task, task)

    const tail = result.catch(() => undefined)
    this.#tails.set(key, tail)

    try {
      return await result
    } finally {
      // Drop the entry only when this task is still the tail, meaning nothing
      // queued behind it. Comparing against the tail we installed is what makes
      // that check correct: a later task replaces the entry, and deleting it
      // then would let the next update for this key run unserialized.
      if (this.#tails.get(key) === tail) this.#tails.delete(key)
    }
  }

  /** Number of keys with work in flight. */
  get size(): number {
    return this.#tails.size
  }
}

/**
 * Build session middleware.
 *
 * Registers in the `high` band, so the session is available to application
 * middleware and handlers regardless of installation order.
 */
export function createSession<C extends BaseContext & SessionFlavor<V>, V>(
  options: SessionOptions<C, V>,
): Middleware<C> {
  const property = options.property ?? 'session'
  const queue = new KeyedQueue()

  return async (context, next) => {
    const rawKey = options.key(context)

    // No meaningful subject — a channel post, say. Skip loading entirely
    // rather than inventing a key.
    if (rawKey === undefined) {
      await next()
      return
    }

    const key = String(rawKey)

    await queue.run(key, async () => {
      let stored: V | undefined
      try {
        stored = await options.storage.get(key)
      } catch (error) {
        // Framework state degrades gracefully: a store outage must not stop a
        // bot from replying.
        context.log.warn('failed to load session, starting fresh', { key, error })
      }

      const session = new Session<V>(stored ?? options.initial())

      Object.defineProperty(context, property, {
        configurable: true,
        enumerable: true,
        get: () => session.value,
        set: (next: V) => session.set(next),
      })

      Object.defineProperty(context, `${property}Handle`, {
        configurable: true,
        enumerable: false,
        value: session,
      })

      try {
        await next()
      } finally {
        await persist(session, key, options, context)
      }
    })
  }
}

/** Write a session back, if anything changed. */
async function persist<C extends BaseContext & SessionFlavor<V>, V>(
  session: Session<V>,
  key: string,
  options: SessionOptions<C, V>,
  context: C,
): Promise<void> {
  if (!session.dirty) return

  try {
    if (session.cleared) {
      await options.storage.delete(key)
      return
    }

    await options.storage.set(
      key,
      // The stored value is the raw one: a store that keeps references — the
      // in-memory one — would otherwise hold a proxy alive for the lifetime of
      // the process.
      session.raw,
      options.ttl === undefined ? undefined : { ttl: options.ttl },
    )
  } catch (error) {
    context.log.warn('failed to persist session', { key, error })
  }
}

/**
 * Default key: per user, per chat.
 *
 * Supplied as a helper rather than a hardcoded default so the choice stays
 * visible at the call site — getting the scope wrong is the most common
 * session bug.
 *
 * The parameter is anchored on `kind` rather than being two optional fields
 * alone. A type made only of optional properties is a weak type, and an event
 * carrying neither a chat nor a sender — a poll update, say — would be rejected
 * outright instead of simply yielding no key. One required member is enough to
 * defeat that rule, and every context has this one.
 */
export function userChatKey(
  context: Pick<BaseContext, 'kind'> & {
    chat?: { id?: number | undefined } | undefined
    sender?: { id?: number | undefined } | undefined
  },
): string | undefined {
  const chat = context.chat?.id
  const sender = context.sender?.id

  if (chat === undefined && sender === undefined) return undefined
  return `${chat ?? 'nochat'}:${sender ?? 'nosender'}`
}

/**
 * What installing the session plugin needs of its host.
 *
 * The general contract lives in core as {@link MiddlewareHost}: a plugin that
 * only registers middleware should be installable on anything that accepts
 * middleware, which includes both a client and a router.
 */
export type SessionHost = MiddlewareHost

/**
 * The session middleware, as a plugin.
 *
 * The same thing `createSession` builds, installed through `extend` and typed
 * with one parameter instead of two:
 *
 * ```ts
 * const bot = Bot.fromToken<SessionFlavor<Cart>>(token).extend(
 *   session<Cart>({ storage: file('./sessions'), key: userChatKey, initial: () => ({ items: [] }) }),
 * )
 * ```
 *
 * `createSession` still exists and is what this calls. Use it directly when the
 * context type needs stating — writing middleware generic over the client, or
 * installing two sessions under different properties. For the ordinary case,
 * naming `Cart` once is the whole difference, and repeating the flavour in a
 * second type argument only ever produced a mismatch to debug.
 */
export function session<V>(
  options: SessionOptions<BaseContext & SessionFlavor<V>, V>,
): Plugin<string, undefined, SessionHost> {
  const middleware = createSession(options) as Middleware<never>

  return {
    // Two sessions under different properties are two plugins, so the name
    // carries the property: installing both must not read as a conflict.
    name: options.property === undefined ? 'session' : `session:${options.property}`,
    install(host: SessionHost) {
      host.use(middleware)
      return undefined
    },
  }
}
