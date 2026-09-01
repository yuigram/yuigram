/**
 * Turning what the client wants to send into one message the server will read.
 *
 * The mirror of the flattening step. A connection does not send one protocol
 * message per encrypted message: several queries and the acknowledgements owed
 * for what has already arrived travel together in a container, which is what
 * keeps a busy connection from spending a round trip per call.
 *
 * Composing is where the two sequences the session owns are actually spent, so
 * it is the one place identifiers and sequence numbers are drawn for outgoing
 * traffic. Nothing here sends anything, seals anything, or decides *when* a
 * batch should go out; it is given the batch and returns the body, along with
 * the record of what that body carries so the layer tracking delivery can enter
 * it.
 *
 * Two things it deliberately does not do. It does not wrap a query in
 * `invokeAfterMsg`: that is a function of the API schema rather than the
 * service one, so the ordering wrapper is part of building the query, and which
 * message it names is resolved by the record that owns the ordering. And it
 * does not compress: the protocol permits a compressed query but never requires
 * one, so compression outbound is a cost with no correctness attached to it.
 */

import { ValidationError } from '@yuigram/core'
import { MAX_BODY_SIZE } from '../message/encrypted.js'
import { type TlScope, TlWriter, writeObject } from '../tl/index.js'
import { NEVER_CONTENT_RELATED, type Session } from './session.js'

/** `msg_container#73f1f8dc messages:vector<%Message> = MessageContainer` */
const MSG_CONTAINER_ID = 0x73f1_f8dc

/**
 * Fixed part of a container element: identifier, sequence number, length.
 *
 * Exported with the container's own header because a caller dividing a backlog
 * into batches has to measure what a batch would come to, and measuring it
 * against different numbers than this writes would divide it wrongly.
 */
export const ELEMENT_HEADER_SIZE = 16

/** Constructor identifier and element count. */
export const CONTAINER_HEADER_SIZE = 8

/**
 * Messages one container may carry.
 *
 * The protocol states the limit; it is enforced here rather than left to the
 * server, whose remedy for a container it will not read is to drop it.
 *
 * Exported because a caller with more than this queued has to divide it into
 * batches, and it can only do that against the same number.
 */
export const MAX_CONTAINER_MESSAGES = 1024

/**
 * Identifiers one acknowledgement may name.
 *
 * Also the protocol's. A caller owing more than this acknowledges in batches,
 * which is why the excess is refused rather than quietly truncated: a truncated
 * acknowledgement leaves the server resending messages the client has already
 * processed, and says nothing about which ones.
 */
const MAX_ACK_IDS = 8192

/** Where one part of a composed message ended up. */
export interface ComposedPart {
  /** The identifier this part was sent under. */
  readonly msgId: bigint
  /** The sequence number this part was sent under. */
  readonly seqNo: number
}

/** What a batch became. */
export interface ComposedMessage {
  /**
   * The identifier the whole message is sent under.
   *
   * The container's own when there is one, and the single part's when there is
   * not — an unnecessary container costs sixteen bytes and gives the server
   * nothing to do with them.
   */
  readonly msgId: bigint
  readonly seqNo: number
  /** The plaintext body, ready to be sealed. */
  readonly body: Uint8Array
  /** One per supplied body, in the order they were supplied. */
  readonly parts: readonly ComposedPart[]
  /** The acknowledgement that travelled with them, if any did. */
  readonly acknowledgement: ComposedPart | undefined
  /**
   * Every identifier a container carries; empty when the message is not one.
   *
   * The server acknowledges a container by acknowledging what it read, so the
   * layer tracking delivery needs to know which identifiers one stands for.
   */
  readonly contains: readonly bigint[]
}

/** What to compose. */
export interface ComposeOptions {
  /** The session whose identifiers and sequence numbers this spends. */
  readonly session: Session
  /** The tables this connection may encode. */
  readonly scope: TlScope
  /** Encoded queries, in the order the server should see them. */
  readonly bodies: readonly Uint8Array[]
  /** Identifiers the server is waiting to hear were delivered. */
  readonly acks?: readonly bigint[]
}

/** One message, paired with the identifiers drawn for it. */
interface Placed {
  readonly part: ComposedPart
  readonly body: Uint8Array
}

/**
 * Compose one message from a batch.
 *
 * The acknowledgement is placed ahead of the work it accompanies: the server
 * resends what it has not heard about, so telling it first stops a resend that
 * working through the queries would otherwise race.
 */
export function compose(options: ComposeOptions): ComposedMessage {
  const { session, scope, bodies } = options
  const acks = options.acks ?? []

  if (bodies.length === 0 && acks.length === 0) {
    throw new ValidationError('nothing to compose')
  }
  if (acks.length > MAX_ACK_IDS) {
    throw new ValidationError(
      `an acknowledgement carries at most ${MAX_ACK_IDS} identifiers, received ${acks.length}`,
    )
  }

  const reserved = reservedIds(scope)
  for (const [index, body] of bodies.entries()) check(body, index, reserved)

  // The acknowledgement is a message like any other and counts toward the
  // bound, because the container has to carry it too.
  const total = bodies.length + (acks.length === 0 ? 0 : 1)
  if (total > MAX_CONTAINER_MESSAGES) {
    throw new ValidationError(
      `a container carries at most ${MAX_CONTAINER_MESSAGES} messages, received ${total}`,
    )
  }

  const placed: Placed[] = []
  let acknowledgement: ComposedPart | undefined

  if (acks.length > 0) {
    acknowledgement = draw(session, false)
    placed.push({
      part: acknowledgement,
      body: writeObject({ _: 'msgs_ack', msg_ids: [...acks] }, scope),
    })
  }

  const parts: ComposedPart[] = []
  for (const body of bodies) {
    const part = draw(session, true)
    parts.push(part)
    placed.push({ part, body })
  }

  const only = placed.length === 1 ? placed[0] : undefined
  if (only !== undefined) {
    limit(only.body.length)

    return {
      msgId: only.part.msgId,
      seqNo: only.part.seqNo,
      body: only.body,
      parts,
      acknowledgement,
      contains: [],
    }
  }

  // Drawn after everything it carries, which is what makes its identifier
  // greater than all of theirs — the server refuses a container whose is not.
  const envelope = draw(session, false)

  return {
    msgId: envelope.msgId,
    seqNo: envelope.seqNo,
    body: container(scope, placed, envelope.msgId),
    parts,
    acknowledgement,
    contains: placed.map((entry) => entry.part.msgId),
  }
}

/** Draw one identifier and one sequence number. */
function draw(session: Session, contentRelated: boolean): ComposedPart {
  // In this order: the sequence number counts the messages created before this
  // one, so drawing it first would number this message as its own predecessor.
  const msgId = session.nextMsgId()
  return { msgId, seqNo: session.nextSeqNo(contentRelated) }
}

/**
 * Write the container.
 *
 * The elements are bare — no constructor identifier precedes them — so the
 * layout is written directly rather than through the codec, which is also how
 * it is read back.
 */
function container(scope: TlScope, placed: readonly Placed[], envelope: bigint): Uint8Array {
  const writer = new TlWriter(scope)
  writer.uint(MSG_CONTAINER_ID)
  writer.uint(placed.length)

  let size = CONTAINER_HEADER_SIZE
  for (const { part, body } of placed) {
    // Compared unsigned, because an identifier is carried as a signed 64-bit
    // value and wraps to negative in 2038. Comparing the signed forms would
    // start reporting every container as malformed on that day.
    if (BigInt.asUintN(64, part.msgId) >= BigInt.asUintN(64, envelope)) {
      throw new ValidationError(
        `container element ${part.msgId} is not below the container's ${envelope}`,
      )
    }

    writer.long(part.msgId)
    writer.int(part.seqNo)
    writer.int(body.length)
    writer.raw(body)

    size += ELEMENT_HEADER_SIZE + body.length
  }

  limit(size)

  return writer.finish()
}

/** Refuse a body that could not be sealed. */
function limit(size: number): void {
  if (size > MAX_BODY_SIZE) {
    throw new ValidationError(`a message body of ${size} bytes is too large to send`)
  }
}

/**
 * Refuse a body this layer cannot number correctly.
 *
 * Content-relatedness is carried in the low bit of the sequence number, and
 * getting it wrong produces no error — the server simply stops treating the
 * message the way the sender intended. Every body a caller supplies is a query
 * and so is content-related; the constructors that never are, are the wrappers
 * this layer builds itself, and one arriving from a caller means the caller is
 * assembling an envelope that is not its to assemble.
 */
function check(body: Uint8Array, index: number, reserved: ReadonlySet<number>): void {
  if (body.length < 4) {
    throw new ValidationError(`message ${index} is ${body.length} bytes and carries no constructor`)
  }

  // Every TL object occupies a whole number of words. One that does not would
  // leave every element after it in the container starting mid-word, and the
  // server would read the remainder as something else entirely rather than
  // reporting the element that was wrong.
  if (body.length % 4 !== 0) {
    throw new ValidationError(`message ${index} is ${body.length} bytes, which is not whole words`)
  }

  const id = new DataView(body.buffer, body.byteOffset, body.byteLength).getUint32(0, true)
  if (reserved.has(id)) {
    throw new ValidationError(`message ${index} is a service wrapper this layer builds itself`)
  }
}

/**
 * The identifiers of the constructors that are never content-related.
 *
 * Resolved from the names the session layer already keeps rather than written
 * out a second time. A name this scope does not carry is one the connection
 * cannot encode, so no body can be it.
 */
function reservedIds(scope: TlScope): ReadonlySet<number> {
  const ids = new Set<number>()

  for (const name of NEVER_CONTENT_RELATED) {
    const found = scope.findByName(name)
    if (found !== undefined) ids.add(found.entry.id)
  }

  return ids
}
