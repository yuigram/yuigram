// SPDX-License-Identifier: MPL-2.0

/**
 * Framework sessions: per-user, per-chat or per-conversation application state.
 *
 * Distinct from MTProto authorization sessions, which hold credentials and use
 * a structured store of their own. These two share a word and nothing else:
 * losing this one forgets a shopping cart, losing that one requires a human to
 * re-authenticate with an SMS code. They degrade differently by design.
 *
 * Four behaviours are load-bearing:
 *
 * - **Read once per update, and only for a subject.** An update the key
 *   function names nobody for — a channel post, say — never reaches the store.
 *   One that does is read once, before the handlers run, so every handler and
 *   middleware after this one sees the same value synchronously.
 * - **Dirty tracking.** An untouched session is not written back, which keeps
 *   read-only traffic from hammering the store. A change anywhere in the value,
 *   however deep, marks it — `session.cart.items.push(x)` included.
 * - **Per-key serialization.** Concurrent updates for the same key queue, so
 *   two rapid messages cannot both read `count: 0` and both write `1`.
 * - **A defined commit point.** What changed is written once, after the
 *   handlers settle; {@link SessionOptions.commit} says whether a handler that
 *   threw or was cancelled commits too, and {@link SessionHandle.save} writes
 *   at once for what must not wait.
 *
 * ```
 *   update ─► key? ─no──────────────────────────────► handlers
 *              │yes
 *              ▼
 *            queue(key) ─► get ─► handlers ─► settled ─► dirty? ─► set/delete
 *                                   │                      │
 *                                   └─ save() ─► set now ──┘ (clean again)
 * ```
 */

import type { BaseContext } from '../context/types.js'
import { type Addressed, type AddressedPeer, addressPart } from '../conversation/identity.js'
import { ValidationError } from '../errors/errors.js'
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
  /** Lifecycle controls: dirty state, replacement, merging, clearing, saving. */
  readonly sessionHandle: SessionHandle<V>
}

/**
 * Derives the storage key for an update, or `undefined` to skip loading.
 *
 * A `bigint` is accepted because an account's peer identifiers are 64-bit; it
 * is written out in full, never through a `number` that would round it.
 */
export type SessionKeyFn<C> = (context: C) => string | number | bigint | undefined

/**
 * When the changes a handler made are written.
 *
 * - `'always'` — once the handlers settle, whether they resolved, threw or were
 *   cancelled. A handler that replied and then failed has still told the user
 *   something, and the state that led to the reply is kept with it.
 * - `'success'` — only when they resolved. A handler that threw or was
 *   cancelled leaves the stored value as it was, as a transaction would, and
 *   anything written with {@link SessionHandle.save} before the failure stays.
 */
export type SessionCommit = 'always' | 'success'

/** Options for {@link createSession}. */
export interface SessionOptions<C, V> {
  /** Where sessions live. */
  readonly storage: KV<V>
  /**
   * Derives the key.
   *
   * Required, so the scope is visible where the session is installed. The
   * usual choice is {@link userChatKey}, per user per chat, because a user's
   * state in a group is rarely the state they want in a direct message, and
   * the reverse mistake leaks one conversation's context into another.
   */
  readonly key: SessionKeyFn<C>
  /** Produces the value for a key with nothing stored. */
  readonly initial: () => V
  /** Time to live in seconds, refreshed on each write. A write may name its own. */
  readonly ttl?: number
  /** Context property to expose the session on. Defaults to `session`. */
  readonly property?: string
  /** When changes are written. `'always'` unless given. */
  readonly commit?: SessionCommit
  /** The time, in milliseconds since the epoch. Replaced only to make a test deterministic. */
  readonly now?: () => number
}

/** How one write is kept. */
export interface SessionWriteOptions {
  /**
   * Time to live in seconds for this write, in place of the session's own.
   * `0` writes without one, for a session whose default would expire it.
   */
  readonly ttl?: number
}

/** A loaded session and the machinery to persist it. */
export interface SessionHandle<V> {
  /** The current value. Mutating it marks the session dirty. */
  readonly value: V
  /** Whether anything changed since load, or since the last {@link save}. */
  readonly dirty: boolean
  /**
   * Whether nothing was stored for this key when the update arrived, so the
   * value began as `initial()`.
   *
   * A stored `null` is a stored value and is not replaced by `initial()`; only
   * a key with nothing under it is new.
   */
  readonly isNew: boolean
  /** Replace the value wholesale. */
  set(next: V, options?: SessionWriteOptions): void
  /**
   * Assign some fields over the current value, leaving the rest.
   *
   * Shallow, like `Object.assign`: a nested object in `patch` replaces the one
   * there rather than merging into it. A field given as `undefined` is written
   * as `undefined`, which a store that serializes to JSON keeps as absent.
   */
  merge(patch: Partial<V>, options?: SessionWriteOptions): void
  /** Mark dirty without replacing, for a change the value cannot report itself. */
  touch(): void
  /**
   * Discard the stored session.
   *
   * The value reads as `initial()` from here on. Left as it is, the key is
   * deleted when the session is written; changed again, the new value is
   * written in its place.
   */
  clear(): void
  /** Keep the next write for this many seconds, in place of the session's own. */
  expireIn(seconds: number): void
  /**
   * Write now rather than when the handlers settle.
   *
   * For state that must survive whatever happens next — a payment recorded
   * before the confirmation is sent. The session is clean afterwards and
   * tracks further changes as before. A cleared session is deleted.
   */
  save(options?: SessionWriteOptions): Promise<void>
}

/* -------------------------------------------------------------------------- */
/* Expiring fields                                                            */
/* -------------------------------------------------------------------------- */

/** Marks what {@link expiring} returns, so assigning it can be told from a plain object. */
const EXPIRING = Symbol('yuigram.session.expiring')

/** What assigning `expiring(value, ms)` hands the session. */
interface ExpiringMarker<T> {
  readonly [EXPIRING]: true
  readonly value: T
  readonly ms: number
}

/**
 * How an expiring field is stored: the value and when it stops being one.
 *
 * Plain data, so it survives a store that serializes to JSON and is read back
 * the same way after a restart. `for` is kept so a later assignment to the same
 * field restarts the same allowance.
 */
interface ExpiringEnvelope {
  readonly $expiring: { readonly at: number; readonly for: number }
  readonly value: unknown
}

/**
 * Keep a field for a while.
 *
 * Assigned into a session, the field reads as `value` until `ms` milliseconds
 * after it was last assigned, and as absent from then on:
 *
 * ```ts
 * session.pendingCode = expiring('482913', 5 * 60_000)
 * ```
 *
 * Assigning the field again restarts the same allowance, so a value refreshed
 * by use stays while it is used. `expiring(value, 0)` stores `value` without
 * an expiry, ending one the field had.
 *
 * The expiry is stored with the value, so it holds across updates and across a
 * restart. A field that expired is dropped when it is read, and every expired
 * field is dropped before a session is written.
 */
export function expiring<T>(value: T, ms: number): T {
  if (!Number.isFinite(ms) || ms < 0) {
    throw new ValidationError(`an expiry is a non-negative number of milliseconds, not ${ms}`)
  }

  const marker: ExpiringMarker<T> = { [EXPIRING]: true, value, ms }

  return marker as unknown as T
}

function isMarker(value: unknown): value is ExpiringMarker<unknown> {
  return typeof value === 'object' && value !== null && EXPIRING in value
}

function isEnvelope(value: unknown): value is ExpiringEnvelope {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false

  const keys = Object.keys(value)
  if (keys.length !== 2 || !keys.includes('$expiring') || !keys.includes('value')) return false

  const meta = (value as { readonly $expiring: unknown }).$expiring

  return (
    typeof meta === 'object' &&
    meta !== null &&
    typeof (meta as { at?: unknown }).at === 'number' &&
    typeof (meta as { for?: unknown }).for === 'number'
  )
}

/** What a marker is stored as. */
function envelope(marker: ExpiringMarker<unknown>, now: number): unknown {
  const value = settle(marker.value, now)

  return marker.ms === 0
    ? value
    : ({ $expiring: { at: now + marker.ms, for: marker.ms }, value } satisfies ExpiringEnvelope)
}

/**
 * Turn every `expiring(...)` inside a value into what is stored for it.
 *
 * A marker can arrive nested — `session.cart = { note: expiring(text, ms) }` —
 * and assigning the outer object is the only write the session sees, so the
 * whole of what was assigned is looked through. Plain objects and arrays only,
 * changed in place: the value becomes the session's own once assigned.
 */
function settle(value: unknown, now: number, seen = new Set<object>()): unknown {
  if (isMarker(value)) return envelope(value, now)
  if (typeof value !== 'object' || value === null || seen.has(value)) return value
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) return value
  seen.add(value)

  for (const key of Object.keys(value)) {
    const inner = (value as Record<string, unknown>)[key]
    const settled = settle(inner, now, seen)
    if (settled !== inner) (value as Record<string, unknown>)[key] = settled
  }

  return value
}

/**
 * Drop every expired field, however deep.
 *
 * Returns whether anything was dropped. Walks plain objects and arrays only;
 * anything else is a leaf the session does not look inside.
 */
function prune(value: unknown, now: number, seen = new Set<object>()): boolean {
  if (typeof value !== 'object' || value === null || seen.has(value)) return false
  seen.add(value)

  let dropped = false

  for (const key of Object.keys(value)) {
    const inner = (value as Record<string, unknown>)[key]
    if (isEnvelope(inner)) {
      if (inner.$expiring.at <= now) {
        delete (value as Record<string, unknown>)[key]
        dropped = true
        continue
      }
      if (prune(inner.value, now, seen)) dropped = true
      continue
    }
    if (prune(inner, now, seen)) dropped = true
  }

  return dropped
}

/* -------------------------------------------------------------------------- */
/* One session, within one update                                             */
/* -------------------------------------------------------------------------- */

/** Tracks one session's lifecycle within a single update. */
class Session<V> implements SessionHandle<V> {
  #value: V
  #dirty = false
  #cleared = false
  #tracked: V | undefined
  #ttl: number | undefined
  readonly #isNew: boolean
  readonly #initial: () => V
  readonly #now: () => number
  readonly #write: (session: Session<V>) => Promise<void>

  constructor(
    value: V,
    isNew: boolean,
    initial: () => V,
    now: () => number,
    write: (session: Session<V>) => Promise<void>,
  ) {
    this.#value = value
    this.#isNew = isNew
    this.#initial = initial
    this.#now = now
    this.#write = write
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

    this.#tracked ??= track(this.#value, this.#markDirty, this.#now)

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

  get isNew(): boolean {
    return this.#isNew
  }

  /** The time to live the next write carries, if this update named one. */
  get ttl(): number | undefined {
    return this.#ttl
  }

  // Any change after a clear is a new value to keep, not one to delete with it.
  readonly #markDirty = (): void => {
    this.#dirty = true
    this.#cleared = false
  }

  set(next: V, options?: SessionWriteOptions): void {
    this.#value = next
    this.#tracked = undefined
    this.#dirty = true
    this.#cleared = false
    if (options?.ttl !== undefined) this.expireIn(options.ttl)
  }

  merge(patch: Partial<V>, options?: SessionWriteOptions): void {
    const current = this.#value

    if (typeof current === 'object' && current !== null && !Array.isArray(current)) {
      // Through the wrapper, so an expiring field in the patch is stored as one
      // and a field that had an expiry keeps it.
      Object.assign(this.value as object, patch)
    } else {
      // Nothing to merge into — a session whose value is `null` — so the patch
      // is the whole of the new value.
      this.set({ ...patch } as V)
    }

    this.#markDirty()
    if (options?.ttl !== undefined) this.expireIn(options.ttl)
  }

  touch(): void {
    this.#markDirty()
  }

  clear(): void {
    this.#value = this.#initial()
    this.#tracked = undefined
    this.#cleared = true
    this.#dirty = true
  }

  expireIn(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds < 0) {
      throw new ValidationError(
        `a time to live is a non-negative number of seconds, not ${seconds}`,
      )
    }
    this.#ttl = seconds
  }

  async save(options?: SessionWriteOptions): Promise<void> {
    if (options?.ttl !== undefined) this.expireIn(options.ttl)
    // Written even when nothing changed: asking to save is asking for the
    // store to hold this value now, which a store that expires entries may no
    // longer do.
    this.#dirty = true
    await this.#write(this)
  }

  /** After a write: clean, and what was deleted stays deleted until changed. */
  written(): void {
    this.#dirty = false
  }

  /**
   * Ready the value for a write: markers stored as what they stand for, and
   * expired fields dropped, so the store never keeps either.
   */
  prune(): void {
    this.#value = settle(this.#value, this.#now()) as V
    prune(this.#value, this.#now())
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
 * both go through the set trap. An expiring field reads as its value while it
 * lasts and as absent once it has not; assigning one stores it with its expiry.
 */
function track<T>(value: T, onChange: () => void, now: () => number): T {
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
      let inner = Reflect.get(target, property, receiver) as unknown

      if (isEnvelope(inner)) {
        if (inner.$expiring.at <= now()) {
          // Gone, and said so: the store forgets it with the next write.
          Reflect.deleteProperty(target, property)
          onChange()
          return undefined
        }
        inner = inner.value
      }

      return typeof inner === 'object' && inner !== null ? track(inner, onChange, now) : inner
    },
    set(target, property, next, receiver) {
      onChange()

      if (isMarker(next)) return Reflect.set(target, property, envelope(next, now()), receiver)
      next = settle(next, now())

      const current = Reflect.get(target, property, receiver) as unknown
      if (next !== undefined && isEnvelope(current) && current.$expiring.at > now()) {
        // A field with an expiry keeps it: assigning it again restarts the
        // same allowance rather than making it permanent by accident.
        const kept = current.$expiring.for
        return Reflect.set(
          target,
          property,
          { $expiring: { at: now() + kept, for: kept }, value: next } satisfies ExpiringEnvelope,
          receiver,
        )
      }

      return Reflect.set(target, property, next, receiver)
    },
    deleteProperty(target, property) {
      onChange()
      return Reflect.deleteProperty(target, property)
    },
    has(target, property) {
      const inner = Reflect.get(target, property) as unknown
      if (isEnvelope(inner) && inner.$expiring.at <= now()) return false
      return Reflect.has(target, property)
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
  const commit = options.commit ?? 'always'
  const now = options.now ?? (() => Date.now())
  const queue = new KeyedQueue()

  if (commit !== 'always' && commit !== 'success') {
    throw new ValidationError(`a session commits 'always' or on 'success', not '${String(commit)}'`)
  }

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

      // Only a key with nothing under it is new. A stored `null` is a value the
      // application wrote, and replacing it with `initial()` would undo that.
      const isNew = stored === undefined
      const session = new Session<V>(
        isNew ? options.initial() : (stored as V),
        isNew,
        options.initial,
        now,
        (s) => write(s, key, options, context, true),
      )

      // Expired fields a previous update left behind go now, and the session
      // is written without them even if this update changes nothing else.
      if (!isNew && prune(session.raw, now())) session.touch()

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

      let settled = false
      try {
        await next()
        settled = true
      } finally {
        if (settled || commit === 'always') await write(session, key, options, context, false)
      }
    })
  }
}

/**
 * Write a session back, if anything changed.
 *
 * A forced write reports a failure to its caller, who asked for it and can act
 * on it. The write at the end of an update only logs one: the update has
 * already done what it did, and failing it now would report a delivery problem
 * for what is a storage problem.
 */
async function write<C extends BaseContext & SessionFlavor<V>, V>(
  session: Session<V>,
  key: string,
  options: SessionOptions<C, V>,
  context: C,
  forced: boolean,
): Promise<void> {
  if (!session.dirty) return

  try {
    if (session.cleared) {
      await options.storage.delete(key)
      session.written()
      return
    }

    session.prune()

    const ttl = session.ttl ?? options.ttl
    await options.storage.set(
      key,
      // The stored value is the raw one: a store that keeps references — the
      // in-memory one — would otherwise hold a proxy alive for the lifetime of
      // the process.
      session.raw,
      ttl === undefined || ttl === 0 ? undefined : { ttl },
    )
    session.written()
  } catch (error) {
    if (forced) throw error
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
    chat?: AddressedPeer | undefined
    sender?: AddressedPeer | undefined
  },
): string | undefined {
  // The same rule a conversation key writes a peer by, so an account's user 5
  // and its basic group 5 get two sessions, and a 64-bit id keeps every digit.
  const chat = addressPart(context.chat)
  const sender = addressPart(context.sender)

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
 * A key of your own reads the chat and the sender an update carries, where it
 * carries them, so a different scope needs no context type named:
 *
 * ```ts
 * session<Cart>({ storage, key: (event) => event.sender?.id, initial })   // per user, across chats
 * ```
 *
 * `createSession` still exists and is what this calls. Use it directly when the
 * context type needs stating — writing middleware generic over the client, or
 * installing two sessions under different properties. For the ordinary case,
 * naming `Cart` once is the whole difference, and repeating the flavour in a
 * second type argument only ever produced a mismatch to debug.
 */
export function session<V>(
  options: SessionOptions<BaseContext & Pick<Addressed, 'chat' | 'sender'> & SessionFlavor<V>, V>,
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
