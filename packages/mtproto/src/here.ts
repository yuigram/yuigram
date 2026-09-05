/**
 * Methods addressed to the peer an event arrived from.
 *
 * `docs/api-decisions.md` Decision 11 draws the line between what a context can
 * do and what a client can: a context holds the identifiers that arrived in the
 * update, and anything needing a peer to be resolved belongs to the client. On
 * the Bot API that distinction is mild — a `chat_id` is a number. Here it is
 * structural. Addressing a peer needs an access hash the account holds because
 * it saw the peer earlier; a peer that arrived in an update needs no lookup at
 * all, and one named out of the blue needs a resolve that reaches the network
 * and can fail.
 *
 * So this surface carries exactly the methods whose peer the update already
 * supplied, and refuses to address anything else. Naming somebody the event did
 * not mention stays on {@link Account.resolve}, where its cost is visible.
 *
 * ```ts
 * account.onMessage(async (event) => {
 *   const history = await event.here.messages.getHistory({ limit: 10 })
 * })
 * ```
 *
 * **Breadth is derived, not written.** Decision 12 settled that: a method per
 * entry is maintenance-free either way, and the difference is what consumers
 * pay to read the declarations. The signatures come from the generated method
 * surface through one type-level mapping, so there is no second list to keep in
 * step and nothing emitted per method. A method the schema does not address by
 * peer is absent rather than present and failing.
 *
 * **Nothing here reaches the network to find a peer.** The reference is built
 * from what the account already wrote down when the update arrived, so a bound
 * call costs exactly the call. An event whose peer was never harvested, or one
 * seen only in passing, is refused with the reason rather than resolved behind
 * the caller's back.
 */

import { PeerError } from '@yuigram/core'
import type { ApiMethods } from './generated/api/methods.js'
import type { TypeInputPeer } from './generated/api/types/index.js'
import type { TlValue } from './tl/index.js'

/** Keys of `T` that a caller must supply. */
type RequiredKeys<T> = { [K in keyof T]-?: object extends Pick<T, K> ? never : K }[keyof T]

/**
 * One method, with the peer taken out.
 *
 * A method that names no peer becomes `never`, which is what removes it from
 * the surface rather than leaving it present and certain to fail.
 */
type BoundMethod<F> = F extends (params: infer P) => infer R
  ? 'peer' extends keyof P
    ? [RequiredKeys<Omit<P, 'peer'>>] extends [never]
      ? (params?: Unpeered<P>) => R
      : (params: Unpeered<P>) => R
    : never
  : never

/**
 * A method's parameters with the peer taken out and kept out.
 *
 * Omitting it is not enough on its own. A method whose only parameter was the
 * peer omits down to `{}`, which accepts any object at all — so passing one
 * would compile and then be silently overwritten. Stating that the peer must be
 * absent turns that into the error it is.
 */
type Unpeered<P> = Omit<P, 'peer'> & { peer?: never }

/** One namespace, keeping only what the update can address. */
type BoundNamespace<T> = {
  [K in keyof T as BoundMethod<T[K]> extends never ? never : K]: BoundMethod<T[K]>
}

/**
 * The generated surface, bound to the peer an update carried.
 *
 * Namespaces are kept and methods at the root are dropped: the root holds the
 * protocol's own wrappers — `invokeWithLayer` and its relatives — which the
 * session layer addresses and a handler has no business calling.
 */
export type BoundApi = {
  [K in keyof ApiMethods as ApiMethods[K] extends (...args: never[]) => unknown
    ? never
    : K]: BoundNamespace<ApiMethods[K]>
}

/** What binding a call to an event's peer needs from the account it arrived on. */
export interface BoundContext {
  /** The reference the update's peer is named by, or why there is none. */
  peer(): Promise<TypeInputPeer>
  /** Make a call. Throws while the account is not connected. */
  invoke(query: TlValue): Promise<TlValue>
}

/**
 * Properties a runtime or library asks for before deciding what an object is.
 *
 * The proxy cannot tell these from a namespace, and answering them with an
 * object turns a serialization or an `await` into something that looks like a
 * call being prepared.
 */
const PROBED: ReadonlySet<string> = new Set([
  'then',
  'toJSON',
  'toString',
  'valueOf',
  'constructor',
  'inspect',
])

/** One node of the method path, carrying the peer in when it is finally called. */
function node(path: string, context: BoundContext): unknown {
  const send = async (params?: Record<string, unknown>): Promise<TlValue> =>
    await context.invoke({ ...params, peer: await context.peer(), _: path })

  return new Proxy(send, {
    get(target, property, receiver) {
      if (typeof property !== 'string' || PROBED.has(property)) {
        return Reflect.get(target, property, receiver)
      }

      return node(`${path}.${property}`, context)
    },
  })
}

/**
 * Bind the generated surface to one event's peer.
 *
 * The peer is read when a call is made rather than when the surface is built,
 * so an event that carries none costs nothing until something tries to use it,
 * and the failure names the peer rather than the construction of the context.
 *
 * The constructor and the peer are written after the caller's parameters, so a
 * value that reached a handler from somewhere else cannot redirect a bound call
 * to another method or another conversation.
 */
export function boundApi(context: BoundContext): BoundApi {
  return new Proxy(
    {},
    {
      get(target, property, receiver) {
        if (typeof property !== 'string' || PROBED.has(property)) {
          return Reflect.get(target, property, receiver)
        }

        return node(property, context)
      },
    },
  ) as BoundApi
}

/** The refusal an event with nothing to address gives. */
export function noPeer(kind: string): PeerError {
  return new PeerError(`an event of kind '${kind}' names no peer to address`)
}
