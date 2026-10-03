/**
 * Results that are lists.
 *
 * A method declared to return `Vector<T>` is answered with a boxed vector in
 * the `Object` slot of `rpc_result`. The identifier there is the vector's own
 * and says nothing of what the elements are. The elements of a vector of
 * objects carry identifiers of their own, but a vector of numbers carries only
 * numbers, so such an answer cannot be read until it is known which call it
 * answers — and the message is flattened before that is known.
 *
 * So the flattening step leaves a vector result unread, as an
 * {@link UnreadVector}, and the connection reads it once it has found the call
 * the answer settles.
 */

import { TlReadError, TlReader, type TlScope, type TlValue, VECTOR_ID } from '../tl/index.js'

/** A vector result kept as bytes until the method it answers is known. */
export interface UnreadVector extends TlValue {
  readonly _: 'vector'
  /** The boxed vector: its identifier, its count and its elements. */
  readonly raw: Uint8Array
}

/** Whether the bytes at an offset begin a boxed vector. */
export function startsWithVector(bytes: Uint8Array, at = 0): boolean {
  if (bytes.length < at + 4) return false

  return (
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(at, true) === VECTOR_ID
  )
}

/** Whether a result is one the flattening step left unread. */
export function isUnreadVector(value: unknown): value is UnreadVector {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { _?: unknown; raw?: unknown }

  return candidate._ === 'vector' && candidate.raw instanceof Uint8Array
}

/**
 * The methods whose result is a vector of numbers, and which numbers.
 *
 * Every other vector result in the schema holds objects. A test checks this
 * list against the generated method signatures, so a method Telegram adds with
 * a result of this kind is noticed rather than misread.
 */
export const NUMBER_VECTOR_RESULTS: Readonly<Record<string, 'int' | 'long'>> = {
  'contacts.getContactIDs': 'int',
  'messages.receivedQueue': 'long',
  'phone.checkGroupCall': 'int',
  'photos.deletePhotos': 'long',
  'stories.deleteStories': 'int',
  'stories.readStories': 'int',
  'stories.togglePinned': 'int',
}

/**
 * Read a vector result as the method it answers declares it.
 *
 * Objects are read by their own identifiers against the scope, as any other
 * result is; numbers are read as the list above says. Bytes left over mean the
 * answer and the declaration disagree, and are refused.
 */
export function readVectorResult(raw: Uint8Array, method: string, scope: TlScope): unknown[] {
  const reader = new TlReader(raw, scope)
  const items = reader.value({ v: NUMBER_VECTOR_RESULTS[method] ?? 'obj' }) as unknown[]

  if (reader.remaining !== 0) {
    throw new TlReadError(`${reader.remaining} bytes remain after the result of '${method}'`)
  }

  return items
}
