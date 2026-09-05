/**
 * The MTProto escape hatch.
 *
 * `docs/architecture.md` §7 and `docs/api-design.md` §12 give both transports a
 * raw surface, and for the same reason: the window between Telegram shipping a
 * feature and Yuigram regenerating is a window in which somebody needs a method
 * this build has never heard of. Without a way through, every Telegram release
 * temporarily blocks whoever needed the new thing first.
 *
 * It carries more weight here than on the Bot API side. `docs/roadmap.md`
 * principle 7 — *"`user.api` is the answer to 'method X is missing' until demand
 * justifies a wrapper"* — is what lets the high-level surface be scheduled
 * rather than blocking, and that argument only holds while this exists.
 *
 * A query is a TL value: the constructor names itself in `_`, and the fields sit
 * beside it.
 *
 * ```ts
 * const config = await account.api.call({ _: 'help.getConfig' })
 * ```
 *
 * The typed form `account.api.messages.sendMessage(…)` that both documents also
 * show is not here yet — it needs a method emitter over the TL schema, which is
 * its own piece of work. This interface is shaped so those namespaces can be
 * added beside `call` without moving anything.
 */

import type { TlValue } from './tl/index.js'

/** How a caller reaches a method this build does not model. */
export interface MtprotoApi {
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

/**
 * Bind the escape hatch to something that can carry a call.
 *
 * Deliberately thin. The writer already rejects a query with no `_`, one whose
 * `_` is not a name, and one naming a constructor outside the table, with
 * messages that say which of the three happened — checking again here would be a
 * second place to keep those in step, saying less.
 */
export function rawApi(invoke: (query: TlValue) => Promise<TlValue>): MtprotoApi {
  return {
    call: async (query) => await invoke(query),
  }
}
