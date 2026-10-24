// SPDX-License-Identifier: MIT

/**
 * What the connection does with a message the server sent.
 *
 * The layer where silent loss originates. Every rule here exists because the
 * server's response to getting it wrong is not an error but silence: an
 * unacknowledged message is resent forever, a stale salt makes every message
 * bounce, and a corrected clock that is not adopted makes every identifier
 * wrong in the same direction.
 *
 * The dispatcher owns no transport and opens no connection. It is given the
 * bytes of one encrypted message and reports what happened: which messages must
 * be acknowledged, which must be sent again, and what changed about the session
 * as a result. Deciding when to act on that is the caller's.
 *
 * Nothing here answers the server directly, because a message that must be
 * resent cannot be resent from inside the code that decided it — the original
 * is held by the layer that sent it, which is the layer that must be told.
 */

import { SessionError } from '@yuigram/core'
import type { AuthKey } from '../message/auth-key.js'
import { decodeEncryptedMessage } from '../message/encrypted.js'
import { readObject, type TlScope, type TlValue } from '../tl/index.js'
import { MessageHistory, withinAcceptanceWindow } from './history.js'
import { type InboundMessage, inflatePacked, unpackEnvelope } from './inbound.js'
import { decodeMessageStatuses, type MessageStatus } from './outbound.js'
import { type FutureSalt, readFutureSalts } from './salts.js'
import type { Session } from './session.js'
import { startsWithVector, type UnreadVector } from './vector-result.js'

export {
  isRpcError,
  MigrationError,
  type MigrationKind,
  RpcError,
  rpcErrorToException,
} from './errors.js'

/**
 * Messages that are never acknowledged.
 *
 * Acknowledging an acknowledgement does not terminate, and the notifications
 * are the server's answer to something it already refused — acknowledging one
 * would say the refusal had been delivered, which is not what the server is
 * waiting to hear.
 *
 * A pong and a salt list are exempt for a different reason: each is itself the
 * acknowledgement of the query that asked for it, so the exchange is already
 * complete when it arrives. Everything else the server sends is acknowledged,
 * including a result — answering a query does not excuse the answer.
 */
const NEVER_ACKNOWLEDGED: ReadonlySet<string> = new Set([
  'msgs_ack',
  'http_wait',
  'bad_msg_notification',
  'bad_server_salt',
  'msgs_all_info',
  'msgs_state_info',
  'msg_detailed_info',
  'msg_new_detailed_info',
  'pong',
  'future_salts',
])

/**
 * The notification codes that carry a usable server clock.
 *
 * 16 and 17 both mean the identifier's embedded time was wrong, so the
 * notification's own identifier is the correction. Code 20 means the message
 * was simply too old by the time it was read, which says nothing about the
 * clock — correcting from it would move a clock that was right.
 */
const CORRECTS_THE_CLOCK: ReadonlySet<number> = new Set([16, 17])

/**
 * The notification codes a resend repairs.
 *
 * Both mean the identifier carried the wrong time, which the server states by
 * refusing the message — so it did not run, and sending it again under a
 * corrected identifier is the remedy the protocol names.
 *
 * Everything else — a sequence number the server will not accept, a container
 * it could not read, an identifier whose low bits are wrong — describes a
 * connection whose state the server and client disagree about, and resending
 * one message under that disagreement repeats it.
 */
const REPAIRABLE_BY_RESEND: ReadonlySet<number> = new Set([16, 17])

/**
 * The notification code that reports an outcome nobody can determine.
 *
 * The protocol is explicit that for a message too old, it cannot be verified
 * whether the server received it. Sending it again would be a guess: if it did
 * run, a second copy runs a second time, and the identifier that would have
 * stopped that belongs to a session the message is no longer part of.
 *
 * So the message is finished with, and what happened to it is reported as
 * unknown. Deciding whether a particular call is worth making again needs to
 * know what the call *was*, which is not something this layer holds.
 */
const OUTCOME_UNKNOWN = 20

/** Why a message was not acted on. */
export type DropReason =
  | 'duplicate'
  | 'too-old'
  | 'outside-window'
  | 'wrong-parity'
  | 'other-session'

/** Something the connection must do, or something that changed about it. */
export type SessionEvent =
  /** The server confirmed these identifiers arrived. */
  | { readonly kind: 'acknowledged'; readonly msgIds: readonly bigint[] }
  /** The salt was stale. It has been replaced; the named message must be sent again. */
  | { readonly kind: 'salt-changed'; readonly salt: bigint; readonly resend: bigint }
  /** The named message must be sent again, under the identifier it is given next. */
  | { readonly kind: 'resend'; readonly msgId: bigint; readonly reason: string }
  /**
   * The named message is finished with, and whether it ran is not knowable.
   *
   * Distinct from a resend on purpose: a resend follows the server saying it
   * refused the message, and this follows the server saying it cannot tell.
   */
  | { readonly kind: 'outcome-unknown'; readonly msgId: bigint; readonly reason: string }
  /** The session was replaced. Everything in flight under the old one is lost. */
  | { readonly kind: 'reset'; readonly reason: string }
  /** The server started a new session. Messages before `firstMsgId` never ran. */
  | {
      readonly kind: 'new-session'
      readonly firstMsgId: bigint
      /** Whether updates may have been missed while no session existed. */
      readonly gap: boolean
    }
  /** A message this layer has no rule for, for the layer above. */
  | { readonly kind: 'message'; readonly message: InboundMessage }
  /** The server answered a state query. The statuses are positional. */
  | {
      readonly kind: 'message-states'
      /** The state query these answer. */
      readonly reqMsgId: bigint
      readonly statuses: readonly MessageStatus[]
    }
  /**
   * The server answered a ping.
   *
   * `msgId` names the ping, which is what a round trip is measured against and
   * what the answer acknowledges.
   */
  | { readonly kind: 'pong'; readonly msgId: bigint; readonly pingId: bigint }
  /** The server offered salts to use in future. */
  | {
      readonly kind: 'salts-offered'
      /**
       * The query these answer.
       *
       * Reported rather than checked: matching it against the request that was
       * sent is the protocol's requirement, and the identifier of that request
       * is held by the layer that sent it.
       */
      readonly reqMsgId: bigint
      readonly salts: readonly FutureSalt[]
    }
  /** A message that was refused, and why. */
  | { readonly kind: 'dropped'; readonly msgId: bigint; readonly reason: DropReason }

/** What one inbound encrypted message produced. */
export interface DispatchResult {
  /** In the order they occurred. */
  readonly events: readonly SessionEvent[]
  /** Identifiers the server is waiting to hear were delivered. */
  readonly acks: readonly bigint[]
  /**
   * Messages the server has answered.
   *
   * An answer is itself an acknowledgement: the server does not reply to a
   * message it never processed, and for a ping the answer is the only
   * confirmation there is. The identifiers are reported rather than acted on,
   * because what was sent under them is held by the layer that sent it.
   */
  readonly answered: readonly bigint[]
}

/** How the dispatcher is built. */
export interface DispatcherOptions {
  /** The session whose state inbound messages change. */
  readonly session: Session
  /** The key inbound messages are sealed under. */
  readonly key: AuthKey
  /** The tables this connection may decode. */
  readonly scope: TlScope
  /** Identifiers to retain for duplicate detection. */
  readonly capacity?: number
}

export class SessionDispatcher {
  readonly #session: Session
  readonly #key: AuthKey
  readonly #scope: TlScope
  readonly #history: MessageHistory

  /**
   * The last session the server announced.
   *
   * The announcement is repeated on every connection that shares the session,
   * so acting on it twice would report a gap that did not happen.
   */
  #lastAnnounced: bigint | undefined

  constructor(options: DispatcherOptions) {
    this.#session = options.session
    this.#key = options.key
    this.#scope = options.scope
    this.#history = new MessageHistory(
      options.capacity === undefined ? {} : { capacity: options.capacity },
    )
  }

  /** Identifiers retained for duplicate detection. */
  get remembered(): number {
    return this.#history.size
  }

  /**
   * Process one inbound encrypted message.
   *
   * A single message may carry many, and each carries its own identifier, so
   * acceptance is decided per message rather than per envelope: a container
   * whose elements include a duplicate is not itself a duplicate. The server
   * resends what was not acknowledged, combined with whatever else is due, so
   * refusing a container for one element it already delivered would lose the
   * others.
   *
   * The container is a message too, and its own identifier is checked first,
   * by the same rules. A container refused by them is refused whole, before
   * anything in it has had an effect.
   */
  receive(bytes: Uint8Array): DispatchResult {
    const decoded = decodeEncryptedMessage({ key: this.#key, bytes, from: 'server' })

    // A message for another session is refused, not raised. Replacing the
    // session leaves whatever was already in flight addressed to the old one,
    // so this is an ordinary consequence of a reset rather than a failure — and
    // a caller that had to catch an exception per stale message would be
    // catching the normal case.
    if (decoded.sessionId !== this.#session.id) {
      return {
        events: [{ kind: 'dropped', msgId: decoded.msgId, reason: 'other-session' }],
        acks: [],
        answered: [],
      }
    }

    const envelope = unpackEnvelope(decoded.body, this.#scope, decoded.msgId, decoded.seqNo)

    if (envelope.container) {
      const dropped = this.#refuse(decoded.msgId)
      if (dropped !== undefined) {
        return {
          events: [{ kind: 'dropped', msgId: decoded.msgId, reason: dropped }],
          acks: [],
          answered: [],
        }
      }
    }

    const events: SessionEvent[] = []
    const acks: bigint[] = []
    const answered: bigint[] = []

    for (const message of envelope.messages) this.#handle(message, events, acks, answered)

    return { events, acks, answered }
  }

  /** Forget what has been seen, as a replaced session must. */
  clearHistory(): void {
    this.#history.clear()
  }

  #handle(
    message: InboundMessage,
    events: SessionEvent[],
    acks: bigint[],
    answered: bigint[],
  ): void {
    const dropped = this.#refuse(message.msgId)
    if (dropped !== undefined) {
      events.push({ kind: 'dropped', msgId: message.msgId, reason: dropped })
      return
    }

    if (!NEVER_ACKNOWLEDGED.has(message.value._)) acks.push(message.msgId)

    switch (message.value._) {
      case 'msgs_ack':
        events.push({ kind: 'acknowledged', msgIds: readLongs(message.value, 'msg_ids') })
        return

      case 'bad_server_salt':
        events.push({
          kind: 'salt-changed',
          salt: this.#adoptSalt(message.value),
          resend: readLong(message.value, 'bad_msg_id'),
        })
        return

      case 'bad_msg_notification':
        this.#badMessage(message, events)
        return

      case 'new_session_created':
        this.#newSession(message.value, events)
        return

      case 'rpc_result':
        // The request is answered, which acknowledges it: the server does not
        // reply to a message it never processed. Which request was waiting is
        // still the caller's to know — associating the two needs state this
        // layer deliberately does not hold.
        answered.push(readLong(message.value, 'req_msg_id'))
        events.push({ kind: 'message', message: this.#openResult(message) })
        return

      case 'msgs_state_info':
        events.push({
          kind: 'message-states',
          reqMsgId: readLong(message.value, 'req_msg_id'),
          statuses: decodeMessageStatuses(readBytes(message.value, 'info')),
        })
        return

      case 'pong':
        // A pong is sent only in answer to a ping, and naming the ping is how
        // it says which. That answer is the acknowledgement: nothing else
        // arrives to confirm a ping, so a ping left outstanding would be resent
        // until its attempts ran out.
        answered.push(readLong(message.value, 'msg_id'))
        events.push({
          kind: 'pong',
          msgId: readLong(message.value, 'msg_id'),
          pingId: readLong(message.value, 'ping_id'),
        })
        return

      case 'future_salts': {
        const reqMsgId = readLong(message.value, 'req_msg_id')
        events.push({
          kind: 'salts-offered',
          reqMsgId,
          salts: readFutureSalts(message.value, reqMsgId),
        })
        return
      }

      default:
        events.push({ kind: 'message', message })
    }
  }

  /**
   * Decide whether a message may be acted on.
   *
   * Order matters only for what is reported, not for what is refused: a message
   * failing more than one rule is refused once, and the first rule named is the
   * cheapest to check.
   */
  #refuse(msgId: bigint): DropReason | undefined {
    // Server identifiers are odd. An even one was not produced by the server,
    // whatever else about the message verified.
    if (((msgId % 2n) + 2n) % 2n !== 1n) return 'wrong-parity'

    // The window is the server's clock, and is judged against it only once that
    // clock is known. The protocol asks a client to apply it only when it is
    // certain of its time: a session under a stored key is not, and judging
    // against the local clock would refuse every message from a server more
    // than thirty seconds ahead of it — including the notification that would
    // correct the clock.
    const measured = this.#session.clockMeasured
    if (measured && !withinAcceptanceWindow(msgId, this.#session.serverNow())) {
      return 'outside-window'
    }

    const admission = this.#history.admit(msgId)
    if (admission !== 'accepted') return admission

    // What arrives under this session was made after the session began: its
    // identifier is new, drawn when this connection opened, and the message has
    // already verified under the key. So the time it carries is the server's
    // clock, as a handshake would have measured it.
    if (!measured) this.#session.adoptServerTime(secondsOf(msgId))

    return undefined
  }

  /**
   * Make a result readable.
   *
   * A large answer arrives compressed inside the field that carries it, which
   * the flattening step leaves alone because only this layer knows the field is
   * a result. A failure arrives as `rpc_error`, which is turned into the error
   * the rest of the framework already raises — the same type a Bot API failure
   * produces, because a caller handling one is handling the other.
   */
  #openResult(message: InboundMessage): InboundMessage {
    const result = message.value['result']
    if (typeof result !== 'object' || result === null) return message

    const value = result as TlValue
    if (value._ === 'gzip_packed') {
      const inflated = inflatePacked(readBytes(value, 'packed_data'))
      // A packed list is left unread for the same reason an unpacked one is.
      const unread: UnreadVector | undefined = startsWithVector(inflated)
        ? { _: 'vector', raw: inflated }
        : undefined

      return {
        ...message,
        value: { ...message.value, result: unread ?? readObject(inflated, this.#scope) },
      }
    }

    return message
  }

  /** Adopt a salt the server named, and report it. */
  #adoptSalt(value: TlValue): bigint {
    const salt = readLong(value, 'new_server_salt')
    this.#session.adoptSalt(salt)

    return salt
  }

  /**
   * Act on a rejected message.
   *
   * The notification's own identifier carries the server's clock, which is the
   * only place the correction comes from — the payload names what was wrong,
   * not what would have been right.
   */
  #badMessage(message: InboundMessage, events: SessionEvent[]): void {
    const code = readInt(message.value, 'error_code')
    const badMsgId = readLong(message.value, 'bad_msg_id')

    if (CORRECTS_THE_CLOCK.has(code)) {
      this.#session.adoptServerTime(secondsOf(message.msgId))

      // The corrected clock may sit below identifiers this session already
      // issued, and each one after them would be refused the same way until the
      // clock caught up. A new session starts its identifiers from the clock as
      // it now is; the message named is sent again under it.
      if (this.#session.issuedAhead()) this.#restart(`bad_msg_notification ${code}`, events)
    }

    if (REPAIRABLE_BY_RESEND.has(code)) {
      events.push({ kind: 'resend', msgId: badMsgId, reason: `bad_msg_notification ${code}` })
      return
    }

    if (code === OUTCOME_UNKNOWN) {
      events.push({
        kind: 'outcome-unknown',
        msgId: badMsgId,
        reason: `bad_msg_notification ${code}`,
      })
      return
    }

    this.#reset(`bad_msg_notification ${code}`, events)
  }

  /**
   * Act on a session the server started.
   *
   * The client's own identifier does not change: the server is reporting that
   * *it* has no state for this connection, not asking for a different one. What
   * is lost is everything sent before the identifier it names, and any update
   * that arrived while it had no session to deliver it to.
   */
  #newSession(value: TlValue, events: SessionEvent[]): void {
    const uniqueId = readLong(value, 'unique_id')
    if (this.#lastAnnounced === uniqueId) return

    const first = this.#lastAnnounced === undefined
    this.#lastAnnounced = uniqueId
    this.#session.adoptSalt(readLong(value, 'server_salt'))

    events.push({
      kind: 'new-session',
      firstMsgId: readLong(value, 'first_msg_id'),
      // A connection that has just opened fetches state anyway, so only a
      // replacement mid-connection means something may have been missed.
      gap: !first,
    })
  }

  /**
   * Start a new session for this connection, because the clock moved under it.
   *
   * Unlike a reset for a disagreement, the session the server last announced is
   * remembered: the one it announces next replaces it mid-connection, and what
   * was pushed under the old one in between is reported as possibly missed.
   */
  #restart(reason: string, events: SessionEvent[]): void {
    this.#session.restartFromClock()
    this.#history.clear()

    events.push({ kind: 'reset', reason })
  }

  #reset(reason: string, events: SessionEvent[]): void {
    this.#session.reset()
    this.#history.clear()
    this.#lastAnnounced = undefined

    events.push({ kind: 'reset', reason })
  }
}

/** The second a message identifier was made in, on its sender's clock. */
function secondsOf(msgId: bigint): number {
  return Number(BigInt.asUintN(64, msgId) >> 32n)
}

function readLong(value: TlValue, field: string): bigint {
  const raw = value[field]
  if (typeof raw !== 'bigint') {
    throw new SessionError(`'${value._}.${field}' must be a 64-bit integer`)
  }
  return raw
}

function readBytes(value: TlValue, field: string): Uint8Array {
  const raw = value[field]
  if (!(raw instanceof Uint8Array)) {
    throw new SessionError(`'${value._}.${field}' must be a byte string`)
  }
  return raw
}

function readInt(value: TlValue, field: string): number {
  const raw = value[field]
  if (typeof raw !== 'number') {
    throw new SessionError(`'${value._}.${field}' must be a 32-bit integer`)
  }
  return raw
}

function readLongs(value: TlValue, field: string): readonly bigint[] {
  const raw = value[field]
  if (!Array.isArray(raw) || raw.some((item) => typeof item !== 'bigint')) {
    throw new SessionError(`'${value._}.${field}' must be a vector of 64-bit integers`)
  }
  return raw as readonly bigint[]
}
