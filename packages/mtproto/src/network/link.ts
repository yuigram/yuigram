// SPDX-License-Identifier: MIT

/**
 * A byte stream carrying whole MTProto messages.
 *
 * Between a socket and everything above it sit three concerns that have to
 * happen in one order and are easy to get subtly wrong: the packet that opens
 * the connection, the envelope around each message, and the obfuscation that
 * hides both. A link owns that order and nothing else.
 *
 * ```
 *   send(payload) ─┐                        ┌─> write(bytes)   to the wire
 *                  ├──>       Link      ────┤
 *   receive(bytes)─┘                        └─> onPayload(payload)
 * ```
 *
 * It owns no socket, exactly as the protocol machine above it owns none: bytes
 * leave through a callback and arrive through a method. What that means in
 * practice is that the whole of this layer — including the opening packet and
 * every fragmentation case — is decidable without a network.
 *
 * It also holds no protocol state. A link does not know a message from a
 * handshake, has no session, and cannot tell an authorized connection from an
 * unauthorized one. It moves whole payloads and reports what the transport
 * itself says.
 */

import { ValidationError } from '@yuigram/core'
import type { Framing } from '../transport/framing.js'
import { FrameBuffer } from '../transport/framing.js'
import type { Obfuscation } from '../transport/obfuscation.js'

/** How a link is built. */
export interface LinkOptions {
  /** The envelope every message travels in. */
  readonly framing: Framing
  /**
   * The obfuscation, when the connection uses one.
   *
   * Its init packet replaces the framing's tag on the wire — the tag travels
   * inside the packet instead, which is how the far end learns the envelope
   * without anything observable being sent in the clear.
   */
  readonly obfuscation?: Obfuscation
  /** Where bytes go. */
  readonly write: (bytes: Uint8Array) => void
  /** One whole message, as it arrived. */
  readonly onPayload: (payload: Uint8Array) => void
  /**
   * A failure the transport itself reported.
   *
   * The far end reports one by sending a negative code framed exactly like a
   * payload. It is surfaced rather than passed on, because a layer that
   * received it would try to decrypt four bytes.
   */
  readonly onTransportError: (code: number) => void
}

/** How far a link has got. */
export type LinkState = 'unopened' | 'open' | 'closed'

export class Link {
  readonly #framing: Framing
  readonly #obfuscation: Obfuscation | undefined
  readonly #write: (bytes: Uint8Array) => void
  readonly #onPayload: (payload: Uint8Array) => void
  readonly #onTransportError: (code: number) => void
  readonly #buffer = new FrameBuffer()

  #state: LinkState = 'unopened'

  constructor(options: LinkOptions) {
    this.#framing = options.framing
    this.#obfuscation = options.obfuscation
    this.#write = options.write
    this.#onPayload = options.onPayload
    this.#onTransportError = options.onTransportError
  }

  get state(): LinkState {
    return this.#state
  }

  /** The envelope this link writes. */
  get framing(): Framing {
    return this.#framing
  }

  /**
   * Send the packet that opens the connection.
   *
   * Exactly once, and before anything else. The far end reads the first bytes
   * without yet knowing what they are and decides from them alone, so a
   * connection opened twice or opened after a message has already gone out is
   * one the far end cannot read at all.
   */
  open(): void {
    if (this.#state !== 'unopened') {
      throw new ValidationError(`a link that is ${this.#state} cannot be opened`)
    }

    this.#state = 'open'

    // The init packet is the one thing that travels in the clear: it carries
    // the material both keystreams are derived from.
    const opening = this.#obfuscation?.init ?? this.#framing.tag()
    if (opening.length > 0) this.#write(opening)
  }

  /** Send one whole message. */
  send(payload: Uint8Array): void {
    this.#expectOpen('send on')

    const framed = this.#framing.encode(payload)
    this.#write(this.#obfuscation === undefined ? framed : this.#obfuscation.encrypt(framed))
  }

  /**
   * Take bytes from the wire.
   *
   * A chunk is not a message. It may carry part of one, several, or the tail of
   * one and the head of the next, so what arrives is decrypted, appended, and
   * drained of every complete frame it now holds. An incomplete frame leaves
   * the buffer as it was.
   */
  receive(bytes: Uint8Array): void {
    this.#expectOpen('receive on')
    if (bytes.length === 0) return

    // Decryption is a keystream, so it must consume every byte exactly once and
    // in order — which is why it happens here rather than per frame.
    this.#buffer.push(this.#obfuscation === undefined ? bytes : this.#obfuscation.decrypt(bytes))

    for (;;) {
      const frame = this.#framing.decode(this.#buffer)
      if (frame === undefined) return

      if (frame.kind === 'error') this.#onTransportError(frame.code)
      else this.#onPayload(frame.bytes)

      // A handler may close the link, and draining a buffer belonging to a
      // connection that is gone would deliver messages nobody is listening for.
      if (this.#state !== 'open') return
    }
  }

  /** Stop the link. Nothing may be sent or received afterwards. */
  close(): void {
    this.#state = 'closed'
  }

  #expectOpen(action: string): void {
    if (this.#state !== 'open') {
      throw new ValidationError(`cannot ${action} a link that is ${this.#state}`)
    }
  }
}
