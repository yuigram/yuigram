/**
 * The lifecycle of a request, as distinct from the messages that carry it.
 *
 * A request is what a caller asked for. A message is one attempt at delivering
 * it, and there may be several: an identifier is used once, so every resend is
 * a new message. Everything that must outlive that succession lives here —
 * whether the request has been answered, when it stops being worth waiting for,
 * whether the caller has withdrawn it, and what it must run after.
 *
 * The split matters most for the two things that would otherwise restart on
 * every resend. The attempt count belongs to the outbound record; the deadline
 * belongs here. Both are properties of the request, and a server that could
 * make either restart by refusing a message could hold a request open forever.
 *
 * Nothing here sends anything, allocates an identifier, or serializes a wrapper.
 * It records what the caller has decided and answers what the protocol requires
 * next.
 */

import { ValidationError } from '@yuigram/core'

/** Requests that may be outstanding at once. */
const DEFAULT_CAPACITY = 2000

/**
 * How far a request has progressed.
 *
 * Acknowledgement and completion are separate because the server confirms
 * receipt long before it answers, and the two imply different things: an
 * acknowledged request must not be sent again, but is still waiting.
 */
export type RequestState =
  /** Created; no message carries it yet. */
  | 'pending'
  /** A message carries it and no answer has arrived. */
  | 'sent'
  /** The server confirmed receipt. Resend is no longer required. */
  | 'acknowledged'
  /** The server refused it because something it runs after is not ready. */
  | 'blocked'
  /** Answered. Terminal. */
  | 'completed'
  /** Answered with an error, or abandoned as unrecoverable. Terminal. */
  | 'failed'
  /** Its deadline passed before an answer arrived. Terminal. */
  | 'timed-out'
  /** The caller withdrew it. Terminal. */
  | 'cancelled'

/** States from which nothing further happens. */
const TERMINAL: ReadonlySet<RequestState> = new Set([
  'completed',
  'failed',
  'timed-out',
  'cancelled',
])

/**
 * States that make a request useless as a predecessor.
 *
 * The server has given up on such a message, so a dependent naming it is
 * refused rather than sequenced behind it.
 */
const UNUSABLE: ReadonlySet<RequestState> = new Set(['failed', 'timed-out', 'cancelled'])

/** Whether a request has reached a state it cannot leave. */
export function isTerminal(state: RequestState): boolean {
  return TERMINAL.has(state)
}

/** A request, as this record knows it. */
export interface Request {
  readonly id: number
  readonly state: RequestState
  /** The clock reading past which the request is no longer worth waiting for. */
  readonly deadline: number
  /** The message currently carrying it, once one does. */
  readonly msgId: bigint | undefined
  /** The ordering group it belongs to, if any. */
  readonly chain: string | undefined
  /** The message it must run after, resolved when it was last sent. */
  readonly after: bigint | undefined
}

/** How a request is registered. */
export interface CreateOptions {
  /**
   * The clock reading past which to give up.
   *
   * Absolute rather than a duration, and fixed at creation: it measures how
   * long the caller is prepared to wait, which is not something the server's
   * behaviour should be able to extend.
   */
  readonly deadline: number
  /**
   * An ordering group.
   *
   * Requests sharing one are delivered in the order they were sent. The server
   * enforces that; this records which message each new one must name.
   */
  readonly chain?: string
}

/** How the record is built. */
export interface RegistryOptions {
  /** Requests that may be outstanding at once. Defaults to 2000. */
  readonly capacity?: number
}

interface Entry {
  readonly id: number
  state: RequestState
  readonly deadline: number
  msgId: bigint | undefined
  readonly chain: string | undefined
  after: bigint | undefined
}

export class RequestRegistry {
  readonly #byId = new Map<number, Entry>()
  readonly #byMsgId = new Map<bigint, Entry>()

  /**
   * The requests still being tracked in each ordering group, in the order they
   * joined it.
   *
   * Requests rather than message identifiers. A resend is a new message for a
   * request that already has a place, so recording identifiers would let a
   * retry take a position of its own — putting a request behind one it was
   * meant to precede, and leaving the other waiting on an identifier that was
   * superseded before the server ever saw it. Neither would ever resolve.
   *
   * Only live members are kept. A group that is in continuous use never empties,
   * so retaining the ones already finished would grow it for as long as the
   * connection lasts, and lengthen every predecessor search with it.
   *
   * A line, not a graph: a request can only be told to run after one that
   * joined ahead of it, so a cycle cannot be constructed.
   */
  readonly #chains = new Map<string, number[]>()

  readonly #capacity: number
  #nextId = 1

  constructor(options: RegistryOptions = {}) {
    const capacity = options.capacity ?? DEFAULT_CAPACITY
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new ValidationError(`capacity must be a positive integer, received ${capacity}`)
    }

    this.#capacity = capacity
  }

  /** How many requests are being tracked. */
  get size(): number {
    return this.#byId.size
  }

  /**
   * Register a request the caller intends to send.
   *
   * Refuses once full rather than evicting. Every entry is here because the
   * caller created it, so a full record means the caller has more outstanding
   * than it can account for, and discarding one would strand whatever waits on
   * it.
   */
  create(options: CreateOptions): number {
    if (this.#byId.size >= this.#capacity) {
      throw new ValidationError(`cannot track more than ${this.#capacity} outstanding requests`)
    }

    const id = this.#nextId
    this.#nextId += 1

    this.#byId.set(id, {
      id,
      state: 'pending',
      deadline: options.deadline,
      msgId: undefined,
      chain: options.chain,
      after: undefined,
    })

    return id
  }

  /** What is known about a request. */
  get(id: number): Request | undefined {
    return this.#byId.get(id)
  }

  /** The request a message is carrying, if this record placed it there. */
  byMessage(msgId: bigint): Request | undefined {
    return this.#byMsgId.get(msgId)
  }

  /**
   * Record that a message now carries this request, and say what it must run
   * after.
   *
   * The predecessor is read at this moment because that is when the ordering is
   * fixed: the wrapper names a concrete message, and the message it names is
   * whichever one was last sent in the group. A resend passes through here
   * again and picks up whatever is current then, which is what keeps a chain
   * correct when an earlier member is delivered under a new identifier.
   */
  sent(id: number, msgId: bigint): bigint | undefined {
    const entry = this.#require(id)
    this.#expect(entry, ['pending', 'sent', 'acknowledged', 'blocked'], 'send')

    if (this.#byMsgId.has(msgId)) {
      throw new ValidationError(`message ${msgId} already carries a request`)
    }

    // The identifier that carried the previous attempt stops standing for this
    // request; only the current one does.
    const superseded = entry.msgId
    if (superseded !== undefined) this.#byMsgId.delete(superseded)

    entry.msgId = msgId
    entry.state = 'sent'
    this.#byMsgId.set(msgId, entry)

    if (entry.chain === undefined) return undefined

    const members = this.#chains.get(entry.chain) ?? []
    let place = members.indexOf(entry.id)
    if (place === -1) {
      place = members.length
      members.push(entry.id)
      this.#chains.set(entry.chain, members)
    }

    // Resolved now rather than remembered: the wrapper names a concrete
    // message, and the one to name is whichever attempt of the preceding
    // request is current at this moment. A predecessor resent since this
    // request last went out is named by its new identifier, and the superseded
    // one — which the server never reported on — is never named at all.
    entry.after = this.#predecessor(members, place)

    return entry.after
  }

  /**
   * The message a request at `place` must run after.
   *
   * The nearest earlier member that the server could still be waiting on.
   * Members that failed, were withdrawn, or timed out are stepped over: naming
   * one would ask the server to wait for something it has already given up on,
   * and it answers such a request by refusing it again. A member that has
   * completed is named as readily as one still running — the server knows it
   * finished, so the dependent proceeds at once.
   */
  #predecessor(members: readonly number[], place: number): bigint | undefined {
    for (let index = place - 1; index >= 0; index -= 1) {
      const member = this.#byId.get(members[index] ?? -1)
      // Members leave the group when they are forgotten, so one is missing here
      // only if the two records have drifted. Reading both the same way keeps
      // the search correct either way.
      if (member?.msgId === undefined) continue
      if (UNUSABLE.has(member.state)) continue

      return member.msgId
    }

    return undefined
  }

  /** The server confirmed receipt of the message carrying this request. */
  acknowledge(msgId: bigint): Request | undefined {
    const entry = this.#byMsgId.get(msgId)
    if (entry === undefined || isTerminal(entry.state)) return undefined

    // Blocked outranks acknowledged: the server has the message and has already
    // said it cannot run it yet.
    if (entry.state === 'sent') entry.state = 'acknowledged'

    return entry
  }

  /**
   * The server refused the request because something it runs after is not
   * ready.
   *
   * Recoverable by sending it again once the predecessor has answered, so this
   * is not terminal — the server names the condition, not the outcome.
   */
  block(msgId: bigint): Request | undefined {
    return this.#settleOrMark(msgId, 'blocked')
  }

  /** The request was answered. */
  complete(msgId: bigint): Request | undefined {
    return this.#settleOrMark(msgId, 'completed')
  }

  /** The request was answered with an error, or abandoned. */
  fail(msgId: bigint): Request | undefined {
    return this.#settleOrMark(msgId, 'failed')
  }

  /**
   * Withdraw a request.
   *
   * Idempotent, and never reverses an outcome that already arrived: a request
   * the server has answered is answered, whatever the caller has since decided.
   * A message already sent cannot be recalled, so this stops the request being
   * sent again and stops the caller waiting, and the answer that may still
   * arrive is discarded.
   */
  cancel(id: number): boolean {
    const entry = this.#byId.get(id)
    if (entry === undefined || isTerminal(entry.state)) return false

    entry.state = 'cancelled'
    return true
  }

  /**
   * Requests whose deadline has passed, marked as timed out.
   *
   * Reported once: the second call does not return them again, because a
   * caller acting on the same expiry twice would fail a request it had already
   * failed.
   */
  expire(now: number): Request[] {
    const out: Request[] = []

    for (const entry of this.#byId.values()) {
      if (isTerminal(entry.state)) continue
      if (entry.deadline > now) continue

      entry.state = 'timed-out'
      out.push(entry)
    }

    return out.sort((a, b) => a.id - b.id)
  }

  /**
   * Stop tracking a request.
   *
   * Only a settled one: forgetting a request still in flight would leave its
   * message unaccounted for, and an answer arriving afterwards indistinguishable
   * from one for a request that never existed.
   */
  forget(id: number): void {
    const entry = this.#byId.get(id)
    if (entry === undefined) return

    if (!isTerminal(entry.state)) {
      throw new ValidationError(`request ${id} is ${entry.state} and cannot be forgotten`)
    }

    this.#byId.delete(id)
    if (entry.msgId !== undefined) this.#byMsgId.delete(entry.msgId)

    // The member leaves its group, which keeps the group as long as what is
    // still outstanding rather than as long as the connection. Removing it
    // preserves the order of the rest, so those still waiting keep the places
    // they had relative to one another.
    if (entry.chain === undefined) return

    const members = this.#chains.get(entry.chain)
    if (members === undefined) return

    const place = members.indexOf(id)
    if (place !== -1) members.splice(place, 1)
    if (members.length === 0) this.#chains.delete(entry.chain)
  }

  /**
   * The earliest deadline still outstanding.
   *
   * What a connection arms a single wake against. Without it the alternatives
   * are a timer for every request, or a poll that notices a deadline some
   * interval after it passed — and a deadline noticed late is one the caller
   * waited past.
   *
   * Terminal requests are skipped: a deadline only means anything while
   * something is still waiting on it.
   */
  earliestDeadline(): number | undefined {
    let earliest: number | undefined

    for (const entry of this.#byId.values()) {
      if (isTerminal(entry.state)) continue
      if (earliest === undefined || entry.deadline < earliest) earliest = entry.deadline
    }

    return earliest
  }

  /** Requests in a state that permits nothing further. */
  settled(): Request[] {
    return [...this.#byId.values()].filter((entry) => isTerminal(entry.state))
  }

  /** Forget everything, as a replaced session must. */
  clear(): void {
    this.#byId.clear()
    this.#byMsgId.clear()
    this.#chains.clear()
  }

  /** Move a request to a settled state, if the message still stands for one. */
  #settleOrMark(msgId: bigint, state: RequestState): Request | undefined {
    const entry = this.#byMsgId.get(msgId)
    if (entry === undefined || isTerminal(entry.state)) return undefined

    entry.state = state
    return entry
  }

  #require(id: number): Entry {
    const entry = this.#byId.get(id)
    if (entry === undefined) throw new ValidationError(`request ${id} is not being tracked`)

    return entry
  }

  #expect(entry: Entry, allowed: readonly RequestState[], action: string): void {
    if (!allowed.includes(entry.state)) {
      throw new ValidationError(`cannot ${action} a request that is ${entry.state}`)
    }
  }
}
