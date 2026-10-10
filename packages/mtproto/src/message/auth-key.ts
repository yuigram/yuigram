// SPDX-License-Identifier: MIT

/**
 * An established authorization key.
 *
 * The 2048-bit shared secret every encrypted message is keyed from. It is held
 * here rather than passed around as bytes so that the material has one owner
 * and one set of operations: nothing outside this module reads it, and the
 * message layer asks it to derive rather than borrowing it to derive itself.
 *
 * The key is deliberately awkward to leak. It is not a field, not enumerable,
 * and not reachable from the object's string, JSON or inspected forms — all
 * three report the key's identifier instead, which is public and appears in the
 * clear on every message anyway. A key that reaches a log through a spread, a
 * template literal or a serialized error is the failure this shape exists to
 * prevent.
 */

import { ValidationError } from '@yuigram/core'
import type { AesParameters, MessageDirection } from '../crypto/kdf.js'
import {
  authKeyAuxHash,
  authKeyId,
  deriveMessageKeys,
  deriveMessageKeysLegacy,
  messageKey,
  newNonceHash,
} from '../crypto/kdf.js'

/** Auth keys are 2048 bits. */
const AUTH_KEY_SIZE = 256

/** The shared secret, and the derivations that use it. */
export class AuthKey {
  readonly #key: Uint8Array

  /** The 64-bit identifier that travels in the clear on every message. */
  readonly id: Uint8Array

  /**
   * The high 64 bits of `SHA1(auth_key)`.
   *
   * Named by the protocol as `auth_key_aux_hash`. It identifies a key without
   * revealing it, which is what lets a handshake retry refer to the attempt
   * that failed.
   */
  readonly auxHash: Uint8Array

  private constructor(key: Uint8Array) {
    this.#key = key
    this.id = authKeyId(key)
    this.auxHash = authKeyAuxHash(key)
  }

  /** Adopt key material produced by a handshake or read from storage. */
  static from(key: Uint8Array): AuthKey {
    if (key.length !== AUTH_KEY_SIZE) {
      throw new ValidationError(
        `an auth key must be ${AUTH_KEY_SIZE} bytes, received ${key.length}`,
      )
    }

    return new AuthKey(Uint8Array.from(key))
  }

  /** The `msg_key` binding a plaintext to this key and a direction. */
  messageKey(plaintext: Uint8Array, direction: MessageDirection): Uint8Array {
    return messageKey(this.#key, plaintext, direction)
  }

  /** The AES key and IV for one message. */
  derive(msgKey: Uint8Array, direction: MessageDirection): AesParameters {
    return deriveMessageKeys(this.#key, msgKey, direction)
  }

  /**
   * The AES key and IV for one message under the older schedule.
   *
   * Needed for the message that binds a temporary key to this one, which the
   * protocol specifies in MTProto 1.0's terms. It is here rather than beside
   * that construction for the same reason the current schedule is: the key
   * derives, and does not leave.
   */
  deriveLegacy(msgKey: Uint8Array, direction: MessageDirection): AesParameters {
    return deriveMessageKeysLegacy(this.#key, msgKey, direction)
  }

  /**
   * The acknowledgement hash the handshake's last message carries.
   *
   * The variant distinguishes success from the two failure outcomes. Computed
   * here because it covers the key, and the key does not leave this object.
   */
  nonceHash(newNonce: Uint8Array, variant: 1 | 2 | 3): Uint8Array {
    return newNonceHash(newNonce, variant, this.#key)
  }

  /**
   * The key material, for storing it.
   *
   * The one deliberate way out, and the only one. Everything else about this
   * object exists to stop the key leaving by accident — it is not a field, not
   * enumerable, and not reachable from the string, JSON or inspected forms — but
   * a key that cannot be written down has to be negotiated again on every start,
   * and a client that does that looks like an intruder.
   *
   * A copy, so that what is handed out cannot be used to reach back in.
   */
  toBytes(): Uint8Array {
    return Uint8Array.from(this.#key)
  }

  /** Identify the key without exposing it. */
  toString(): string {
    return `AuthKey(${hex(this.id)})`
  }

  /** What a serializer sees. Never the key. */
  toJSON(): string {
    return this.toString()
  }

  /** What `console.log` and `util.inspect` see. Never the key. */
  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return this.toString()
  }
}

function hex(value: Uint8Array): string {
  return [...value].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
