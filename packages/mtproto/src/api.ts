// SPDX-License-Identifier: MIT

/**
 * The MTProto API surface.
 *
 * `docs/architecture.md` §7 and `docs/api-design.md` §12 give both transports
 * two forms, for the same reason. The typed one covers everything the committed
 * schema carries. The untyped one covers the window between Telegram shipping a
 * feature and Yuigram regenerating — without it, every Telegram release
 * temporarily blocks whoever needed the new thing first.
 *
 * ```ts
 * await account.api.messages.sendMessage({ peer, message: 'hi', randomId })
 * await account.api.call({ _: 'messages.brandNewMethod', … })
 * ```
 *
 * The untyped form carries more weight here than on the Bot API side.
 * `docs/roadmap.md` principle 7 — *"`user.api` is the answer to 'method X is
 * missing' until demand justifies a wrapper"* — is what lets the high-level
 * surface be scheduled rather than blocking, and that argument only holds while
 * `call` exists. It is not deprecated by the typed surface and never will be.
 *
 * **There is no code per method.** The typed half is 757 signatures and nothing
 * else; dispatch is one proxy that turns a property path into the TL name it
 * spells. A method Telegram adds works as soon as the schema regenerates, with
 * nothing to write by hand, and a program that calls three methods carries no
 * more of this than one that calls three hundred.
 */

import type { ApiMethods } from './generated/api/methods.js'
import type { TlValue } from './tl/index.js'

/** How a caller reaches a method this build does not model. */
export interface MtprotoRaw {
  /**
   * Call a method by naming its constructor.
   *
   * The result is whatever the method returns, decoded — a TL value rather than
   * a type the caller chose. The Bot API's `call<T>()` is generic because its
   * results are arbitrary JSON; TL results are not, and a generic here would be
   * an unchecked assertion wearing the shape of an API.
   *
   * Which datacenter carries it is the pools' decision, as it is for every other
   * call an account makes. A method that must go to a particular one goes
   * through {@link Account.reach} instead.
   *
   * Fails the way any other call fails: `FloodError` for a wait, `MigrationError`
   * where the answer says to go elsewhere, `TelegramError` otherwise, and
   * `TlWriteError` before anything leaves if the query names no constructor or
   * one this build's schema does not carry.
   */
  call(query: TlValue): Promise<TlValue>
}

/** The generated method surface plus the untyped escape hatch. */
export type MtprotoApi = ApiMethods & MtprotoRaw

/**
 * Properties a runtime or library asks for before deciding what an object is.
 *
 * The proxy cannot distinguish these from a TL name, and answering them with a
 * callable turns a serialization, a coercion or an `await` into an API call. No
 * TL method or namespace is named any of them.
 */
const PROBED: ReadonlySet<string> = new Set([
  'then',
  'toJSON',
  'toString',
  'valueOf',
  'constructor',
  'inspect',
])

/**
 * One node of the method path.
 *
 * Both a namespace and a method, because at the point a property is read there
 * is no way to tell which it will turn out to be — and no need to: TL spells a
 * method as a dotted path, and this builds the path as it is walked. Reading
 * `messages` then `sendMessage` produces `messages.sendMessage`, which is
 * exactly the name the writer expects. The types decide what may be called; the
 * proxy only has to spell it.
 */
function node(path: string, invoke: (query: TlValue) => Promise<TlValue>): unknown {
  const send = async (params?: Record<string, unknown>): Promise<TlValue> =>
    await invoke({ ...params, _: path })

  return new Proxy(send, {
    get(target, property, receiver) {
      if (typeof property !== 'string' || PROBED.has(property)) {
        return Reflect.get(target, property, receiver)
      }

      return node(`${path}.${property}`, invoke)
    },
  })
}

/**
 * Bind the surface to something that can carry a call.
 *
 * `call` is a real property on the object the proxy wraps rather than another
 * path, so it reaches the escape hatch instead of trying to invoke a TL method
 * of that name. No TL method is called `call`, and if one ever is it will be
 * reachable the way any unmodelled method is.
 *
 * Nothing else is checked here. The writer already rejects a query with no `_`,
 * one whose `_` is not a name, and one naming a constructor outside the table,
 * with messages that say which of the three happened — checking again would be
 * a second place to keep those in step, saying less.
 */
export function rawApi(invoke: (query: TlValue) => Promise<TlValue>): MtprotoApi {
  const raw: MtprotoRaw = { call: async (query) => await invoke(query) }

  return new Proxy(raw, {
    get(target, property, receiver) {
      if (typeof property !== 'string' || property === 'call' || PROBED.has(property)) {
        return Reflect.get(target, property, receiver)
      }

      return node(property, invoke)
    },
  }) as MtprotoApi
}
