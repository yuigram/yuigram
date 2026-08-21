/**
 * The generated half of what a context can do.
 *
 * An update arrives already addressing something. Every API method that takes
 * those identifiers can therefore be offered with them filled in, which turns
 *
 * ```ts
 * await api.banChatMember({ chat_id: message.chat.id, user_id: 42 })
 * ```
 *
 * into
 *
 * ```ts
 * await message.banChatMember({ user_id: 42 })
 * ```
 *
 * for a hundred-odd methods at once. What makes that affordable is that none of
 * it is written per method:
 *
 * - **Types** are derived from `ApiMethods`, which is already generated. A
 *   bound method is the same signature with the supplied parameters made
 *   optional, computed by {@link BoundApi}. No parameter shape is restated, so
 *   none can drift.
 * - **Runtime** is one binder reading the generated tables. A method Telegram
 *   adds becomes a context method when the schema is regenerated, with no code
 *   written anywhere.
 *
 * The alternative — emitting a function per method — is what a mature reference
 * implementation does, at roughly nine thousand lines of generated declarations
 * for the message surface alone. This reaches the same breadth in a table.
 *
 * ## Supplied, not fixed
 *
 * Bound parameters become **optional**, not absent. The context supplies a
 * value and an explicit argument overrides it, which is what makes
 * `message.sendMessage({ chat_id: elsewhere, text })` still expressible. Naming
 * something the context would have supplied is a deliberate act, and refusing
 * it would send people back to `api` for one field.
 *
 * ## What is inherited, and why it matters
 *
 * Sends inherit `message_thread_id` and `business_connection_id` from the
 * message that arrived. Without the first, a reply inside a forum topic lands
 * in the general chat; without the second, a reply on a business account is
 * sent by the bot instead of by the account. Both are bugs users see, and both
 * are invisible in testing outside a forum or a business account.
 *
 * ## The prototype
 *
 * Bound functions live on a prototype shared by every context built from the
 * same client, so a hundred methods cost one property lookup rather than a
 * hundred closures per update. They read the message from `this`, which is what
 * lets them be built once. Contexts stay plain data: `JSON.stringify` still
 * sees only the update's own fields, which is what a context dumped into an
 * error report should contain.
 */

import { YuigramError } from '@yuigram/core'
import type { RawApi } from '../api.js'
import type { CallOptions } from '../api-options.js'
import type { ApiMethods } from '../generated/api.js'
import {
  CALLBACK_QUERY_BOUND,
  CHAT_BOUND,
  INLINE_QUERY_BOUND,
  MESSAGE_BOUND,
  PRE_CHECKOUT_QUERY_BOUND,
  SHIPPING_QUERY_BOUND,
  SOURCE_BOUND,
} from '../generated/bindings.js'

import type { Message } from '../generated/types/index.js'

/** A generated binding table: method name to the parameters a context supplies. */
export type BindingTable = Readonly<Record<string, readonly string[]>>

/**
 * Keys of `T` that must be provided.
 *
 * Used to decide whether the whole parameters argument may be omitted, so
 * `message.deleteMessage()` needs no empty object once both of its parameters
 * are supplied.
 */
type RequiredKeys<T> = {
  [K in keyof T]-?: Record<string, never> extends Pick<T, K> ? never : K
}[keyof T]

/** `P` with the supplied keys made optional rather than removed. */
type Supplied<P, K extends PropertyKey> = Omit<P, K> & Partial<Pick<P, K & keyof P>>

/** One method of `ApiMethods`, with `K` supplied by the context. */
export type BoundMethod<M extends keyof ApiMethods, K extends string> = ApiMethods[M] extends (
  params: infer P,
  options?: CallOptions,
) => infer R
  ? [RequiredKeys<Supplied<NonNullable<P>, K>>] extends [never]
    ? (params?: Supplied<NonNullable<P>, K>, options?: CallOptions) => R
    : (params: Supplied<NonNullable<P>, K>, options?: CallOptions) => R
  : never

/**
 * The callable surface a binding table describes.
 *
 * Intersecting several of these is how a message context ends up with the
 * message-addressed, chat-addressed and relocation families at once.
 */
export type BoundApi<T extends BindingTable> = {
  [M in keyof T & keyof ApiMethods]: BoundMethod<M, T[M][number] & string>
}

/** Methods a message-bearing context carries, from all three of its tables. */
export type MessageBoundApi = BoundApi<typeof MESSAGE_BOUND> &
  BoundApi<typeof CHAT_BOUND> &
  BoundApi<typeof SOURCE_BOUND>

/** Methods a callback query context carries beyond the message families. */
export type CallbackQueryBoundApi = BoundApi<typeof CALLBACK_QUERY_BOUND>

/** Methods an inline query context carries. */
export type InlineQueryBoundApi = BoundApi<typeof INLINE_QUERY_BOUND>

/** Methods a shipping query context carries. */
export type ShippingQueryBoundApi = BoundApi<typeof SHIPPING_QUERY_BOUND>

/** Methods a pre-checkout query context carries. */
export type PreCheckoutQueryBoundApi = BoundApi<typeof PRE_CHECKOUT_QUERY_BOUND>

/**
 * What a bound function reads from the context it was called on.
 *
 * Structural rather than a context type, because the binder must work for every
 * kind that carries a message without depending on the union of them.
 */
interface BindingSource {
  /** Set on every context whose update carried a message. */
  readonly message?: Message | undefined
  /**
   * The query identifier.
   *
   * Present because a context spreads its payload's own fields, and all four
   * query payloads name theirs `id`. Only query tables read it.
   */
  readonly id?: string | undefined
}

/**
 * How each supplied parameter is read, per table.
 *
 * The mapping is hand-written on purpose. Which value a parameter name means is
 * a judgement — `from_chat_id` is this chat only because the method relocates
 * *out* of it — and a schema cannot express that. Everything else about the
 * surface is generated; this is the part that decides meaning.
 */
type Resolver = (source: BindingSource) => unknown

const MESSAGE_RESOLVERS: Readonly<Record<string, Resolver>> = {
  chat_id: (source) => source.message?.chat.id,
  message_id: (source) => source.message?.message_id,
  message_thread_id: (source) => source.message?.message_thread_id,
  business_connection_id: (source) => source.message?.business_connection_id,
  // A relocation reads *out of* this chat, so the source chat is this one and
  // `chat_id` — the destination — stays the caller's.
  from_chat_id: (source) => source.message?.chat.id,
}

const QUERY_RESOLVERS: Readonly<Record<string, Resolver>> = {
  callback_query_id: (source) => source.id,
  inline_query_id: (source) => source.id,
  shipping_query_id: (source) => source.id,
  pre_checkout_query_id: (source) => source.id,
}

/** Every resolver, by parameter name. */
const RESOLVERS: Readonly<Record<string, Resolver>> = { ...MESSAGE_RESOLVERS, ...QUERY_RESOLVERS }

/**
 * Raised when a table names a parameter nothing knows how to supply.
 *
 * Thrown while the prototype is built rather than when the method is called, so
 * a regenerated table that outgrew the resolvers fails on the first context
 * instead of on the first user who reaches that method.
 */
export class UnresolvedBindingError extends YuigramError {
  override readonly name = 'UnresolvedBindingError'

  constructor(method: string, parameter: string) {
    super(
      `no resolver for '${parameter}', required to bind '${method}'. ` +
        `Add one to the resolver table in events/bound.ts.`,
    )
  }
}

/** Build one bound function. */
function bind(api: RawApi, method: string, injects: readonly string[]): unknown {
  const resolvers = injects.map((parameter) => {
    const resolver = RESOLVERS[parameter]
    if (resolver === undefined) throw new UnresolvedBindingError(method, parameter)
    return [parameter, resolver] as const
  })

  // Resolved once, at build time: the API surface is a proxy, so this also
  // avoids a trap on every call.
  const call = (api as unknown as Record<string, (p: unknown, o?: CallOptions) => unknown>)[method]

  if (typeof call !== 'function') {
    throw new UnresolvedBindingError(method, 'the method itself')
  }

  return function bound(this: BindingSource, params?: object, options?: CallOptions): unknown {
    const supplied: Record<string, unknown> = {}

    for (const [parameter, resolve] of resolvers) {
      const value = resolve(this)
      // Omitted rather than sent as `undefined`: an explicit null value is not
      // the same as an absent parameter to every Bot API server, and the
      // difference has bitten enough clients to be worth avoiding.
      if (value !== undefined) supplied[parameter] = value
    }

    // The caller's arguments land last, so naming a parameter the context would
    // have supplied overrides it.
    return call({ ...supplied, ...params }, options)
  }
}

/**
 * Raised when two tables claim the same method with different parameters.
 *
 * The tables are generated from disjoint rules, so a collision means the
 * classification changed shape — worth failing on rather than resolving by
 * declaration order.
 */
export class BindingConflictError extends YuigramError {
  override readonly name = 'BindingConflictError'

  constructor(method: string) {
    super(`'${method}' is claimed by more than one binding table with different parameters`)
  }
}

/** Build a prototype carrying every method the given tables describe. */
export function createBoundPrototype(
  api: RawApi,
  tables: readonly BindingTable[],
  reserved: ReadonlySet<string> = new Set(),
): object {
  const prototype: Record<string, unknown> = Object.create(null) as Record<string, unknown>
  const claimed = new Map<string, readonly string[]>()

  for (const table of tables) {
    for (const [method, injects] of Object.entries(table)) {
      // A hand-written action of the same name wins: it exists because the
      // generated shape was not the one worth offering.
      if (reserved.has(method)) continue

      const previous = claimed.get(method)
      if (previous !== undefined) {
        if (previous.join() !== injects.join()) throw new BindingConflictError(method)
        continue
      }

      claimed.set(method, injects)
      prototype[method] = bind(api, method, injects)
    }
  }

  return prototype
}

/** Tables a message-bearing context installs. */
export const MESSAGE_TABLES: readonly BindingTable[] = [MESSAGE_BOUND, CHAT_BOUND, SOURCE_BOUND]

/**
 * Tables each query kind installs.
 *
 * A callback query gets only its answer method. The message its button sits on
 * is not this update's message — it may not exist at all, for a button on an
 * inline result — so the message families would be a promise the payload cannot
 * keep. Reaching that chat is what the hand-written callback actions are for,
 * and they say why when it is impossible.
 */
export const QUERY_TABLES: Readonly<Record<string, BindingTable>> = {
  callback_query: CALLBACK_QUERY_BOUND,
  inline_query: INLINE_QUERY_BOUND,
  shipping_query: SHIPPING_QUERY_BOUND,
  pre_checkout_query: PRE_CHECKOUT_QUERY_BOUND,
}

/**
 * Prototypes already built, by client.
 *
 * Keyed by the `RawApi` the methods call through, so two bots in one process
 * never share a prototype and a client that goes away takes its prototypes with
 * it. Building is idempotent, so the cache is an optimization rather than a
 * correctness requirement.
 */
const prototypes = new WeakMap<RawApi, Map<string, object>>()

/**
 * The prototype for one context shape, built at most once per client.
 *
 * `cacheKey` names the shape rather than the kind: every message-bearing kind
 * shares one prototype, because they carry the same tables.
 */
export function boundPrototypeFor(
  api: RawApi,
  cacheKey: string,
  tables: readonly BindingTable[],
  reserved: ReadonlySet<string>,
): object {
  let byShape = prototypes.get(api)
  if (byShape === undefined) {
    byShape = new Map()
    prototypes.set(api, byShape)
  }

  const cached = byShape.get(cacheKey)
  if (cached !== undefined) return cached

  const built = createBoundPrototype(api, tables, reserved)
  byShape.set(cacheKey, built)
  return built
}
