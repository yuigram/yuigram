/**
 * One authenticated connection, as a protocol machine.
 *
 * Everything below this point is a piece: a session numbers messages, a record
 * remembers what was sent, a dispatcher interprets what arrives, a schedule says
 * when to act. None of them can answer a caller, because answering means holding
 * the promise somebody is waiting on and knowing which arriving message belongs
 * to it. That correlation is this module, and it is the whole of what it adds.
 *
 * It owns no socket. Bytes leave through a callback and arrive through a method,
 * and the moment is read from an injected clock — the same discipline the
 * handshake and the schedule already follow. What carries the bytes, which
 * datacenter they go to, and what to do when the link breaks are decisions for
 * the layer above, which is why none of them are represented here.
 *
 * ```
 *   invoke(query) ─┐                            ┌─> onSend(bytes)
 *                  ├──>   Connection   ─────────┤
 *   receive(bytes)─┘                            └─> a promise settles
 * ```
 *
 * Two pieces of state live here and nowhere else. The **pending calls**, because
 * a promise cannot be persisted, resumed, or held by a record that survives the
 * connection. And the **latch** saying whether the server has been told what
 * this client is, because that is something the server remembers per connection
 * rather than per key.
 */

import { CancelledError, NetworkError } from '@yuigram/core'
import { TL_LAYER } from '../generated/schema-info.js'
import type { AuthKey } from '../message/auth-key.js'
import { encodeEncryptedMessage, MAX_BODY_SIZE } from '../message/encrypted.js'
import { type TlScope, type TlValue, writeObject } from '../tl/index.js'
import { rpcErrorToException, SessionDispatcher, type SessionEvent } from './dispatcher.js'
import { OutboundTracker } from './outbound.js'
import {
  CONTAINER_HEADER_SIZE,
  type ComposedMessage,
  compose,
  ELEMENT_HEADER_SIZE,
  MAX_CONTAINER_MESSAGES,
} from './outgoing.js'
import { RequestRegistry } from './requests.js'
import { getFutureSalts, SaltReservoir } from './salts.js'
import { ConnectionSchedule, type Duty, type ScheduleOptions } from './schedule.js'
import { Session } from './session.js'
import { isUnreadVector, readVectorResult } from './vector-result.js'

/**
 * How long a call waits before it is given up on, in milliseconds.
 *
 * A Yuigram default rather than a protocol rule — the protocol says nothing
 * about how long a client should wait. A minute is long enough for a slow
 * server and short enough that a caller is not left holding a promise nothing
 * will ever settle.
 */
const DEFAULT_TIMEOUT = 60_000

/** Salts to ask for when the reserve runs low. */
const SALTS_REQUESTED = 32

/**
 * Identifiers one acknowledgement may name.
 *
 * The protocol's bound, applied where the batch is divided so that a backlog
 * larger than one acknowledgement can carry is split across several rather than
 * refused.
 */
const MAX_ACK_IDS = 8192

/**
 * Bytes reserved for the acknowledgement when one travels with a batch.
 *
 * The most a full acknowledgement can come to, rather than what this one does:
 * the body is built inside the composer, so its exact size is not known while
 * the batch is being divided. Sixty-four kilobytes against a sixteen-megabyte
 * ceiling is a rounding error, and reserving too much only makes a batch
 * slightly smaller than it could have been.
 */
const MAX_ACK_BYTES = 12 + 8 * MAX_ACK_IDS

/** What the server is told about this client, once per connection. */
export interface ClientInfo {
  readonly apiId: number
  readonly deviceModel: string
  readonly systemVersion: string
  readonly appVersion: string
  readonly systemLangCode: string
  readonly langPack: string
  readonly langCode: string
}

/** How a connection is built. */
export interface ConnectionOptions {
  /** The key every message is sealed under. */
  readonly key: AuthKey
  /** The tables this connection encodes and decodes with. */
  readonly scope: TlScope
  /** The salt the handshake derived. */
  readonly salt: bigint
  /** What the server is told this client is. */
  readonly client: ClientInfo
  /** Where sealed messages go. */
  readonly send: (bytes: Uint8Array) => void
  /** Anything the connection does not answer itself, for the layer above. */
  readonly onEvent?: (event: SessionEvent) => void
  /** Milliseconds since the epoch. Replaced only to make a test deterministic. */
  readonly now?: () => number
  /** Randomness for the session identifier. */
  readonly random?: (length: number) => Uint8Array
  /** Correction between the local clock and the server's, in seconds. */
  readonly timeOffset?: number
  /** Milliseconds a call waits before it is given up on. Defaults to 60000. */
  readonly timeout?: number
  /** How the periodic duties are paced. */
  readonly schedule?: ScheduleOptions
}

/** How one call is made. */
export interface InvokeOptions {
  /** Milliseconds to wait before giving up on this call. */
  readonly timeout?: number
}

/** A call that has been made and not yet answered. */
interface Pending {
  readonly id: number
  /** The method named, for the error a failure raises. */
  readonly method: string
  /** The method the answer is the result of: the query inside any wrappers. */
  readonly answers: string
  /** The encoded query, kept so a refused message can be sent again. */
  readonly body: Uint8Array
  readonly resolve: (value: TlValue) => void
  readonly reject: (reason: unknown) => void
}

/** Something waiting to go out in the next batch. */
interface Queued {
  readonly body: Uint8Array
  /** The request this carries, when it carries one. */
  readonly id?: number
  /** The ping identifier this carries, when it is a ping. */
  readonly pingId?: bigint
  /** The message this is being sent in place of. */
  readonly replaces?: bigint
}

export class Connection {
  readonly #key: AuthKey
  readonly #scope: TlScope
  readonly #client: ClientInfo
  readonly #send: (bytes: Uint8Array) => void
  readonly #onEvent: (event: SessionEvent) => void
  readonly #now: () => number
  readonly #timeout: number

  readonly #session: Session
  readonly #dispatcher: SessionDispatcher
  readonly #registry = new RequestRegistry()
  readonly #tracker = new OutboundTracker()
  readonly #salts = new SaltReservoir()
  readonly #schedule: ConnectionSchedule

  readonly #pending = new Map<number, Pending>()

  /**
   * The calls each container carried.
   *
   * A salt and a sequence number travel on the envelope, so when the server
   * refuses a batch it names the *container* — an identifier no request was ever
   * registered under. Without this, a stale salt would strand every call in the
   * batch instead of resending them, and salts rotate every half hour.
   */
  readonly #containers = new Map<bigint, readonly number[]>()
  readonly #queue: Queued[] = []
  readonly #acks: bigint[] = []

  /**
   * Whether the server has been told what this client is.
   *
   * The server keeps this against the connection, not against the key, so it is
   * false again on every new connection — and false again after a temporary key
   * is bound, which the protocol requires.
   */
  #initialised = false

  constructor(options: ConnectionOptions) {
    this.#key = options.key
    this.#scope = options.scope
    this.#client = options.client
    this.#send = options.send
    this.#onEvent = options.onEvent ?? (() => {})
    this.#now = options.now ?? Date.now
    this.#timeout = options.timeout ?? DEFAULT_TIMEOUT

    this.#session = new Session({
      salt: options.salt,
      ...(options.random === undefined ? {} : { random: options.random }),
      ...(options.now === undefined ? {} : { now: options.now }),
      ...(options.timeOffset === undefined ? {} : { timeOffset: options.timeOffset }),
    })

    this.#dispatcher = new SessionDispatcher({
      session: this.#session,
      key: options.key,
      scope: options.scope,
    })

    this.#schedule = new ConnectionSchedule(options.schedule ?? {})
  }

  /** Whether the connection is running. */
  get running(): boolean {
    return this.#schedule.running
  }

  /** How many calls are waiting for an answer. */
  get pending(): number {
    return this.#pending.size
  }

  /** The session identifier the server knows this connection by. */
  get sessionId(): bigint {
    return this.#session.id
  }

  /** The most recent round trip measured, in milliseconds. */
  get roundTrip(): number | undefined {
    return this.#schedule.roundTrip
  }

  /** Whether the server has been told what this client is. */
  get initialised(): boolean {
    return this.#initialised
  }

  /** Begin, on a link that has been established and authenticated. */
  start(): void {
    this.#schedule.start(this.#now())
  }

  /**
   * Stop, refusing everything still waiting.
   *
   * A promise cannot outlive the connection that would have settled it, so a
   * caller is told rather than left holding one. This is a shutdown: what a
   * *reconnect* would preserve is a decision for the layer that owns the link,
   * and there is no link here to lose.
   *
   * The reason is supplied rather than built here, because whether a call died
   * because its caller asked or because the connection failed is not something
   * this layer knows — and it is exactly what decides whether the call is worth
   * making again.
   */
  stop(reason: Error = new CancelledError('the connection was closed')): void {
    for (const pending of [...this.#pending.values()]) {
      this.#pending.delete(pending.id)
      this.#registry.cancel(pending.id)
      this.#release(pending.id, this.#registry.get(pending.id)?.msgId)
      pending.reject(reason)
    }

    this.#queue.length = 0
    this.#acks.length = 0
    this.#containers.clear()
    this.#schedule.stop()
  }

  /**
   * Call a method and wait for its answer.
   *
   * The query is encoded now rather than at send time so that a caller learns
   * immediately that it built something unencodable, rather than through a
   * promise that rejects once a batch is flushed.
   */
  invoke(query: TlValue, options: InvokeOptions = {}): Promise<TlValue> {
    const method = query._
    const body = writeObject(this.#wrap(query), this.#scope)

    return new Promise<TlValue>((resolve, reject) => {
      // Nothing drives a connection that is not running, so a call accepted
      // here would wait for a batch that is never composed. Refusing it is the
      // only answer that ever arrives.
      if (!this.#schedule.running) {
        reject(new NetworkError(`'${method}' cannot be sent: the connection is not running`))
        return
      }

      const id = this.#registry.create({
        deadline: this.#now() + (options.timeout ?? this.#timeout),
      })

      this.#pending.set(id, { id, method, answers: innermost(query), body, resolve, reject })
      this.#schedule.expireAt(this.#registry.earliestDeadline())
      this.#enqueue({ body, id })
    })
  }

  /**
   * Send a query whose body names the identifier it will travel under.
   *
   * One construction needs this. A binding message names the identifier of the
   * request carrying it, and the server compares the two, so the identifier has
   * to exist before the body does — which is the one thing the composing path
   * cannot offer, since that is where identifiers are drawn.
   *
   * It therefore travels on its own: drawn, built, sealed and sent, in no
   * container and with nothing alongside it. Two omissions are deliberate.
   * Nothing wraps it, because a key that has not been vouched for yet may only
   * carry a few named methods and an ordering wrapper is not one of them. And
   * nothing records it for delivery, because that record exists to say whether
   * a message may be sent again and this one may not: a second attempt would
   * travel under a new identifier, which the body it carries would no longer
   * name.
   */
  invokeNaming(
    method: string,
    build: (msgId: bigint) => Uint8Array,
    options: InvokeOptions = {},
  ): Promise<TlValue> {
    return new Promise<TlValue>((resolve, reject) => {
      if (!this.#schedule.running) {
        reject(new NetworkError(`'${method}' cannot be sent: the connection is not running`))
        return
      }

      // In this order, as everywhere else: the sequence number counts the
      // messages created before this one.
      const msgId = this.#session.nextMsgId()
      const seqNo = this.#session.nextSeqNo(true)
      const body = build(msgId)

      const id = this.#registry.create({
        deadline: this.#now() + (options.timeout ?? this.#timeout),
      })

      this.#pending.set(id, { id, method, answers: method, body, resolve, reject })
      this.#schedule.expireAt(this.#registry.earliestDeadline())
      this.#registry.sent(id, msgId)

      this.#send(
        encodeEncryptedMessage({
          key: this.#key,
          from: 'client',
          salt: this.#session.salt,
          sessionId: this.#session.id,
          msgId,
          seqNo,
          body,
        }),
      )
    })
  }

  /**
   * Interpret one sealed message from the server.
   *
   * A message that does not verify is raised rather than reported. Every other
   * refusal here — a duplicate, a stale session, a message outside the
   * acceptance window — is an ordinary condition with a defined answer, but
   * material that fails its integrity check means the stream is not what this
   * connection thinks it is, and continuing to read it would be guessing.
   */
  receive(bytes: Uint8Array): void {
    const result = this.#dispatcher.receive(bytes)

    if (result.acks.length > 0) {
      this.#acks.push(...result.acks)
      this.#schedule.queued(this.#now())
    }

    for (const msgId of result.answered) this.#tracker.acknowledge(msgId)
    for (const event of result.events) this.#handle(event)
  }

  /**
   * Do whatever the schedule says is due.
   *
   * Drained rather than taken once: acting on one duty can arm another — a ping
   * is queued, which owes a flush — and each duty is spent when it is taken, so
   * this settles.
   */
  tick(): void {
    for (;;) {
      const work = this.#schedule.due(this.#now())
      if (work.duties.length === 0) return

      for (const duty of work.duties) this.#act(duty)
    }
  }

  /** The moment the caller's timer should next wake this connection. */
  nextWakeup(): number | undefined {
    return this.#schedule.nextWakeup()
  }

  /** Do one thing the schedule said was due. */
  #act(duty: Duty): void {
    switch (duty) {
      case 'expiry':
        this.#expire()
        break

      case 'salts':
        // Reclaimed first: a reserve that has filled with windows that have
        // since closed has no room for the salts this would ask for, so it
        // would ask again every interval and keep none of them.
        this.#salts.forgetExpired(this.#session.serverNow())
        if (this.#salts.lowOnSalts(this.#session.serverNow())) {
          this.#enqueue({ body: getFutureSalts(this.#scope, SALTS_REQUESTED) })
        }
        break

      case 'state':
        // The trigger exists; what to do with the answer is resend policy, and
        // resend policy belongs to the layer that owns the link.
        break

      case 'ping': {
        const pingId = this.#schedule.nextPingId()
        this.#enqueue({ body: writeObject({ _: 'ping', ping_id: pingId }, this.#scope), pingId })
        break
      }

      case 'flush':
        this.#flush()
        break
    }
  }

  /** Give up on the calls whose deadline has passed. */
  #expire(): void {
    for (const request of this.#registry.expire(this.#now())) {
      const pending = this.#pending.get(request.id)
      if (pending === undefined) continue

      this.#pending.delete(request.id)
      this.#release(request.id, request.msgId)
      pending.reject(new NetworkError(`'${pending.method}' was not answered in time`))
    }

    this.#schedule.expireAt(this.#registry.earliestDeadline())
  }

  /** Put something in the next batch. */
  #enqueue(entry: Queued): void {
    this.#queue.push(entry)
    this.#schedule.queued(this.#now())
  }

  /**
   * Compose everything queued into one message and send it.
   *
   * A call whose deadline passed or whose caller withdrew it while it waited for
   * the batch is dropped rather than sent: nobody is waiting for its answer.
   */
  #flush(): void {
    const live = this.#queue.filter(
      (entry) => entry.id === undefined || this.#pending.has(entry.id),
    )
    const acks = this.#acks.splice(0, MAX_ACK_IDS)

    const batch = takeBatch(live, acks.length)

    this.#queue.length = 0
    this.#queue.push(...live.slice(batch.length))
    this.#schedule.flushed()

    if (batch.length === 0 && acks.length === 0) return
    if (this.#queue.length > 0 || this.#acks.length > 0) this.#schedule.queued(this.#now())

    let composed: ComposedMessage
    try {
      composed = compose({
        session: this.#session,
        scope: this.#scope,
        bodies: batch.map((entry) => entry.body),
        ...(acks.length === 0 ? {} : { acks }),
      })
    } catch (error) {
      // The batch cannot be built, so it cannot be sent, and the queue it came
      // from has already been rewritten. Whatever the reason, the calls in it
      // are told: a promise nothing will ever settle is worse than one that
      // settles with the reason it could not be sent.
      this.#abandon(batch, error)
      return
    }

    // Only what carries a call is tracked. The record exists to answer whether
    // a message may be sent again, and the only messages this layer ever sends
    // again are the ones a caller is waiting on. A ping, a salt request or an
    // acknowledgement has no caller and nothing that would ever resend it, so
    // an entry for one could never be consulted and could never be released.
    const sentAt = this.#session.serverNow()
    const carried: number[] = []

    for (const [index, part] of composed.parts.entries()) {
      const entry = batch[index]
      if (entry === undefined) continue

      if (entry.pingId !== undefined) this.#schedule.pingSent(entry.pingId, this.#now())
      if (entry.id === undefined) continue

      this.#tracker.track({
        msgId: part.msgId,
        seqNo: part.seqNo,
        sentAt,
        ...(entry.replaces === undefined ? {} : { replaces: entry.replaces }),
      })

      this.#registry.sent(entry.id, part.msgId)
      carried.push(entry.id)
    }

    // A container is recorded only when it carries a call, and for the same
    // reason: one carrying nothing but a ping and an acknowledgement is never
    // resent and never released.
    if (composed.contains.length > 0 && carried.length > 0) {
      this.#tracker.track({
        msgId: composed.msgId,
        seqNo: composed.seqNo,
        sentAt,
        contains: composed.contains,
      })

      this.#containers.set(composed.msgId, carried)
    }

    this.#send(
      encodeEncryptedMessage({
        key: this.#key,
        from: 'client',
        salt: this.#session.salt,
        sessionId: this.#session.id,
        msgId: composed.msgId,
        seqNo: composed.seqNo,
        body: composed.body,
      }),
    )
  }

  /** Act on one thing the dispatcher reported. */
  #handle(event: SessionEvent): void {
    switch (event.kind) {
      case 'message':
        // An answer that settled a call is finished with; one that settled
        // nothing is passed on, because a result nobody is waiting for is
        // something the layer above may want to know about rather than nothing
        // at all.
        if (event.message.value._ === 'rpc_result' && this.#settle(event.message.value)) return
        break

      case 'salt-changed':
        this.#resend(event.resend)
        break

      case 'resend':
        this.#resend(event.msgId)
        break

      case 'outcome-unknown':
        this.#giveUp(event.msgId, event.reason)
        break

      case 'salts-offered':
        this.#salts.offer(event.salts, this.#session.serverNow())
        break

      case 'pong':
        this.#schedule.pongReceived(event.pingId, this.#now())
        break

      case 'reset':
      case 'new-session':
        // The session the server knows was replaced, so what was in flight under
        // the old one was never processed. Sending it again is the outbound
        // record's business and the link owner's decision, so the event is
        // passed on rather than acted on here.
        break

      default:
        break
    }

    this.#onEvent(event)
  }

  /**
   * Settle the call an answer belongs to, and say whether it settled one.
   *
   * An answer naming a message no request claims settles nothing rather than
   * failing: a result for a call that was withdrawn, or that timed out while
   * the server was still working on it, arrives after nobody is waiting, and
   * that is ordinary rather than exceptional.
   */
  #settle(value: TlValue): boolean {
    const reqMsgId = value['req_msg_id']
    if (typeof reqMsgId !== 'bigint') return false

    const request = this.#registry.byMessage(reqMsgId)
    const pending = request === undefined ? undefined : this.#pending.get(request.id)
    if (request === undefined || pending === undefined) return false

    this.#pending.delete(pending.id)

    const result = value['result']
    if (isRpcError(result)) {
      this.#registry.fail(reqMsgId)
      this.#release(pending.id, reqMsgId)
      pending.reject(rpcErrorToException(result, pending.method))
      return true
    }

    // A list is read now that the call it answers is known. One that cannot be
    // read as that call declares fails the call, and only the call.
    let answer: unknown = result
    if (isUnreadVector(result)) {
      try {
        answer = readVectorResult(result.raw, pending.answers, this.#scope)
      } catch (error) {
        this.#registry.fail(reqMsgId)
        this.#release(pending.id, reqMsgId)
        pending.reject(error)
        return true
      }
    }

    this.#registry.complete(reqMsgId)
    this.#release(pending.id, reqMsgId)

    // The server keeps what a client told it about itself against the
    // connection, and binding a temporary key discards that — so the next call
    // has to say it again.
    if (pending.method === 'auth.bindTempAuthKey') this.#initialised = false
    else this.#initialised = true

    pending.resolve(answer as TlValue)

    return true
  }

  /**
   * Refuse the calls in a batch that could not be built.
   *
   * Reached only when composition fails for a reason the division into batches
   * did not anticipate. The alternative is a caller left holding a promise
   * against a message that was never sent and is no longer queued.
   */
  #abandon(batch: readonly Queued[], reason: unknown): void {
    for (const entry of batch) {
      if (entry.id === undefined) continue

      const pending = this.#pending.get(entry.id)
      if (pending === undefined) continue

      this.#pending.delete(entry.id)
      this.#registry.cancel(entry.id)
      this.#release(entry.id, this.#registry.get(entry.id)?.msgId)
      pending.reject(reason)
    }
  }

  /**
   * Stop tracking a call that has settled.
   *
   * Both records refuse to grow past a bound rather than evicting, because
   * every entry is there because this end put it there. That makes forgetting a
   * settled call the caller's responsibility, and skipping it turns a bound
   * meant to catch runaway concurrency into a limit on how many calls a
   * connection may ever make.
   */
  #release(id: number, msgId: bigint | undefined): void {
    this.#registry.forget(id)
    if (msgId !== undefined) this.#tracker.forget(msgId)
    this.#pruneContainers()
  }

  /** Drop the containers whose calls have all settled. */
  #pruneContainers(): void {
    for (const [container, members] of this.#containers) {
      if (members.some((member) => this.#pending.has(member))) continue

      this.#containers.delete(container)
      this.#tracker.forget(container)
    }
  }

  /**
   * Give up on a call whose outcome the server could not state.
   *
   * Not a resend. The server has said it cannot tell whether the message ran,
   * and sending it again would run it a second time if it did. The caller is
   * told the outcome is unknown, which is the only true thing there is to say —
   * whether a particular call is worth making again depends on what the call
   * was, and that is the caller's to know.
   */
  #giveUp(msgId: bigint, reason: string): void {
    const request = this.#registry.byMessage(msgId)
    const pending = request === undefined ? undefined : this.#pending.get(request.id)
    if (request === undefined || pending === undefined) return

    this.#pending.delete(pending.id)
    this.#registry.fail(msgId)
    this.#release(pending.id, msgId)
    pending.reject(
      new NetworkError(`'${pending.method}' was not answered for, and ${reason} says why not`),
    )
  }

  /**
   * Send a refused message again, under an identifier it has not used.
   *
   * An identifier is used once, so a resend is a new message carrying the same
   * query. Naming what it replaces is what carries the attempt count across the
   * change, which is the only thing that eventually stops a message the server
   * will never accept.
   */
  #resend(msgId: bigint): void {
    // The identifier the server names is the one it read the envelope under,
    // which for a batch is the container rather than any call inside it.
    const members = this.#containers.get(msgId)
    if (members !== undefined) {
      this.#containers.delete(msgId)
      this.#tracker.forget(msgId)
      for (const member of members) this.#resendRequest(member)
      return
    }

    const request = this.#registry.byMessage(msgId)
    if (request !== undefined) this.#resendRequest(request.id)
  }

  /** Queue one call again, if it is still worth sending. */
  #resendRequest(id: number): void {
    const pending = this.#pending.get(id)
    const msgId = this.#registry.get(id)?.msgId
    if (pending === undefined || msgId === undefined) return
    if (!this.#tracker.canResend(msgId)) return

    this.#enqueue({ body: pending.body, id, replaces: msgId })
  }

  /**
   * Wrap a query in what the server needs before it can answer one.
   *
   * The protocol requires a connection to say which layer it speaks and what
   * client it is, and requires the layer to be announced by wrapping the call
   * that carries the client information rather than on its own.
   *
   * Every call is wrapped until one succeeds, rather than only the first one
   * sent. The server may process a batch in any order it likes, so a bare call
   * that overtook the wrapped one would reach a connection that had not been
   * told anything yet. Wrapping until something is known to have arrived costs
   * a few redundant bytes while a connection opens and removes that ordering
   * hazard entirely.
   */
  #wrap(query: TlValue): TlValue {
    if (this.#initialised) return query

    return {
      _: 'invokeWithLayer',
      layer: TL_LAYER,
      query: {
        _: 'initConnection',
        api_id: this.#client.apiId,
        device_model: this.#client.deviceModel,
        system_version: this.#client.systemVersion,
        app_version: this.#client.appVersion,
        system_lang_code: this.#client.systemLangCode,
        lang_pack: this.#client.langPack,
        lang_code: this.#client.langCode,
        query,
      },
    }
  }
}

/**
 * How much of a queue one message can carry.
 *
 * A batch is bounded twice: by how many messages a container may hold, and by
 * how many bytes one message may be. What does not fit stays queued for the
 * next batch rather than being refused — a caller that made more calls at once
 * than one message can hold has done nothing wrong.
 */
function takeBatch(queue: readonly Queued[], ackCount: number): Queued[] {
  const room = MAX_CONTAINER_MESSAGES - (ackCount === 0 ? 0 : 1)
  const batch: Queued[] = []
  let size = CONTAINER_HEADER_SIZE + (ackCount === 0 ? 0 : ELEMENT_HEADER_SIZE + MAX_ACK_BYTES)

  for (const entry of queue) {
    if (batch.length >= room) break

    const cost = ELEMENT_HEADER_SIZE + entry.body.length
    // The first entry is taken whatever it measures, so that a call too large
    // to travel with anything is refused rather than queued forever.
    if (batch.length > 0 && size + cost > MAX_BODY_SIZE) break

    batch.push(entry)
    size += cost
  }

  return batch
}

function isRpcError(value: unknown): value is TlValue {
  return typeof value === 'object' && value !== null && (value as TlValue)._ === 'rpc_error'
}

/**
 * The method a query is the result of, through the wrappers around it.
 *
 * `invokeWithLayer`, `initConnection`, `invokeWithoutUpdates` and the others
 * carry the call they modify in a `query` field, and what comes back is that
 * call's result.
 */
function innermost(query: TlValue): string {
  let current = query
  for (let depth = 0; depth < 8; depth += 1) {
    const inner = current['query']
    if (typeof inner !== 'object' || inner === null) break
    if (typeof (inner as { _?: unknown })._ !== 'string') break
    current = inner as TlValue
  }

  return current._
}
