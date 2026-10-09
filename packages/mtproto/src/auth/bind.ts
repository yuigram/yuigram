// SPDX-License-Identifier: MPL-2.0

/**
 * Binding a temporary authorization key to a permanent one.
 *
 * Perfect forward secrecy rests on the permanent key never encrypting traffic.
 * The client establishes a second, short-lived key and sends everything under
 * that; the permanent key's only job is to vouch for it once. Compromising the
 * connection's traffic key then buys an attacker whatever that key's lifetime
 * covers and nothing before it, because the earlier keys no longer exist.
 *
 * The vouching is this module. It builds a small message naming both keys and
 * encrypts it under the **permanent** key, then hands it to the server inside a
 * request sent under the **temporary** one. Only a client holding both could
 * have produced that pair, which is the whole of the proof.
 *
 * Two details make the construction unusual, and both are the protocol's.
 *
 * The binding message is encrypted with the **older** MTProto 1.0 schedule,
 * alone among everything this subsystem sends. And its envelope is not quite an
 * envelope: the salt and session identifier a message normally carries are
 * replaced by sixteen random bytes, because neither means anything for a message
 * that is never delivered as a message — it travels as a field.
 *
 * Nothing here sends anything. The request is returned encoded, for the layer
 * that owns the connection to send under the identifier it was built for.
 */

import { ValidationError } from '@yuigram/core'
import { igeEncrypt } from '../crypto/ige.js'
import { messageKeyLegacy } from '../crypto/kdf.js'
import { randomBytes as defaultRandom } from '../crypto/random.js'
import type { AuthKey } from '../message/auth-key.js'
import { type TlScope, TlWriter, writeObject } from '../tl/index.js'

/**
 * The bytes standing in for the salt and session identifier.
 *
 * A binding message is carried inside a request rather than delivered on its
 * own, so neither field describes anything. The protocol replaces both with one
 * random `int128` — the same width, so the header the receiver parses is
 * unchanged.
 */
const FILLER_SIZE = 16

/** `bind_auth_key_inner` encodes to exactly this. */
const INNER_SIZE = 40

/** The header the binding message carries: filler, identifier, sequence, length. */
const HEADER_SIZE = 32

/** AES-IGE works on whole blocks. */
const BLOCK_SIZE = 16

/** Auth key identifiers are 64 bits. */
const KEY_ID_SIZE = 8

/** `expires_at` travels as a signed 32-bit integer. */
const MAX_EXPIRES_AT = 2 ** 31 - 1

/** What binding needs. */
export interface BindOptions {
  /** The long-lived key being vouched with. It never encrypts traffic. */
  readonly permanent: AuthKey
  /** The short-lived key being vouched for. Everything is sent under it. */
  readonly temporary: AuthKey
  /** The session the request will be sent in. */
  readonly sessionId: bigint
  /**
   * The identifier the request will be sent under.
   *
   * Named inside the binding message as well as on the request carrying it, so
   * it has to be known before either is built. That is why this is supplied
   * rather than drawn here: a message whose identifier is chosen for it cannot
   * be handed to the layer that allocates identifiers as it composes.
   */
  readonly msgId: bigint
  /** The Unix second the temporary key stops being valid. */
  readonly expiresAt: number
  /** The tables the request is encoded with. */
  readonly scope: TlScope
  /** Randomness for the nonce and the filler. Replaced only to make a test deterministic. */
  readonly random?: (length: number) => Uint8Array
}

/** A binding request, ready to be sent. */
export interface BindRequest {
  /** The encoded `auth.bindTempAuthKey` query. */
  readonly body: Uint8Array
  /**
   * The value the binding message and the request both name.
   *
   * Returned so a caller can check that the two agree — the server compares
   * them, and a mismatch is refused with no indication of which half was wrong.
   */
  readonly nonce: bigint
}

/**
 * Build the request that binds `temporary` to `permanent`.
 *
 * The result is a query like any other and is sent under the temporary key. Its
 * one unusual field is the encrypted binding message, which only a holder of
 * the permanent key could have produced.
 */
export function bindTemporaryKey(options: BindOptions): BindRequest {
  const { permanent, temporary, scope } = options
  const random = options.random ?? defaultRandom

  // Binding a key to itself satisfies the server and defeats the point: the
  // permanent key would be the one encrypting traffic, which is the single
  // thing perfect forward secrecy exists to prevent. Refused here rather than
  // left to be noticed later, because nothing later would notice.
  if (sameKey(permanent.id, temporary.id)) {
    throw new ValidationError('a key cannot be bound to itself')
  }

  if (!Number.isInteger(options.expiresAt) || options.expiresAt <= 0) {
    throw new ValidationError(`expires_at must be a Unix second, received ${options.expiresAt}`)
  }
  if (options.expiresAt > MAX_EXPIRES_AT) {
    throw new ValidationError(`expires_at ${options.expiresAt} does not fit the field carrying it`)
  }

  // Client identifiers are divisible by four. One that is not was produced by
  // the far end or by nothing at all, and the binding would name an identifier
  // the request could never be sent under.
  if (BigInt.asUintN(64, options.msgId) % 4n !== 0n || options.msgId === 0n) {
    throw new ValidationError(`${options.msgId} is not an identifier this end produces`)
  }

  const nonce = drawNonce(random)
  const inner = writeObject(
    {
      _: 'bind_auth_key_inner',
      nonce,
      temp_auth_key_id: readKeyId(temporary.id),
      perm_auth_key_id: readKeyId(permanent.id),
      temp_session_id: options.sessionId,
      expires_at: options.expiresAt,
    },
    scope,
  )

  // The protocol states the size, so a mismatch means the encoding drifted from
  // what the server will parse — and the length travels in the header, so the
  // far end would read the following bytes as something else entirely.
  if (inner.length !== INNER_SIZE) {
    throw new ValidationError(
      `a binding message must be ${INNER_SIZE} bytes, built ${inner.length}`,
    )
  }

  const body = writeObject(
    {
      _: 'auth.bindTempAuthKey',
      perm_auth_key_id: readKeyId(permanent.id),
      nonce,
      expires_at: options.expiresAt,
      encrypted_message: seal(permanent, inner, options.msgId, random, scope),
    },
    scope,
  )

  return { body, nonce }
}

/**
 * Encrypt the binding message under the permanent key.
 *
 * The envelope is the ordinary one with its first sixteen bytes replaced, so the
 * receiver parses a familiar header: filler where the salt and session would be,
 * then the identifier of the request this travels in, a sequence number of zero
 * because this message is not part of any sequence, and the length.
 *
 * The `msg_key` is taken over the header and body **before** padding is added,
 * and covers only those — the older schedule hashes the plaintext alone, where
 * the current one mixes in a slice of the key as well.
 */
function seal(
  permanent: AuthKey,
  inner: Uint8Array,
  msgId: bigint,
  random: (length: number) => Uint8Array,
  scope: TlScope,
): Uint8Array {
  const writer = new TlWriter(scope)
  writer.raw(draw(random, FILLER_SIZE), FILLER_SIZE)
  writer.long(msgId)
  writer.int(0)
  writer.int(inner.length)
  writer.raw(inner, INNER_SIZE)

  const plaintext = writer.finish()
  if (plaintext.length !== HEADER_SIZE + INNER_SIZE) {
    throw new ValidationError(`a binding envelope must be ${HEADER_SIZE + INNER_SIZE} bytes`)
  }

  const msgKey = messageKeyLegacy(plaintext)
  const aes = permanent.deriveLegacy(msgKey, 'client')

  // Padded after the key is taken, to a whole number of blocks. The receiver
  // reads the length out of the header and ignores whatever follows the body,
  // which is why the filler here needs no structure.
  const padding = (BLOCK_SIZE - (plaintext.length % BLOCK_SIZE)) % BLOCK_SIZE
  const padded = new Uint8Array(plaintext.length + padding)
  padded.set(plaintext, 0)
  if (padding > 0) padded.set(draw(random, padding), plaintext.length)

  const out = new Uint8Array(KEY_ID_SIZE + msgKey.length + padded.length)
  out.set(permanent.id, 0)
  out.set(msgKey, KEY_ID_SIZE)
  out.set(igeEncrypt(padded, aes.key, aes.iv), KEY_ID_SIZE + msgKey.length)

  return out
}

/** Read an auth key identifier as the 64-bit value the schema carries. */
function readKeyId(id: Uint8Array): bigint {
  return new DataView(id.buffer, id.byteOffset, id.byteLength).getBigInt64(0, true)
}

/** A nonce the server will compare against the one on the request. */
function drawNonce(random: (length: number) => Uint8Array): bigint {
  const bytes = draw(random, 8)

  return new DataView(bytes.buffer, bytes.byteOffset, 8).getBigInt64(0, true)
}

/**
 * Take randomness, refusing a source that supplied the wrong amount.
 *
 * A short draw would be padded with zeros by whatever consumed it, which is
 * indistinguishable from randomness that happened to be zero.
 */
function draw(random: (length: number) => Uint8Array, length: number): Uint8Array {
  const bytes = random(length)
  if (bytes.length !== length) {
    throw new ValidationError(`expected ${length} random bytes, received ${bytes.length}`)
  }

  return bytes
}

function sameKey(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index])
}
