// SPDX-License-Identifier: MIT

/**
 * Stream obfuscation.
 *
 * The framings above put recognisable bytes at the start of a connection — a
 * fixed tag, then length-prefixed frames. Obfuscation removes that shape: a
 * 64-byte init packet carries the keys for an AES-256-CTR stream, and every
 * byte after it, in both directions, is encrypted under it. What a middlebox
 * sees is indistinguishable from random.
 *
 * ```
 * bytes  0..56   random, constrained so the packet cannot be mistaken for
 *                a plain framing tag or an HTTP request
 * bytes 56..60   the inner framing's tag, repeated to four bytes if shorter
 * bytes 60..62   datacenter id, signed 16-bit little-endian (proxies only)
 * bytes 62..64   random
 * ```
 *
 * The packet encrypts *itself*: keys are taken from its own plaintext, the
 * whole 64 bytes are run through the cipher, and bytes 56..64 of the result
 * replace the plaintext there. The receiver recovers the keys from the
 * plaintext prefix, which is why the first 56 bytes are sent in the clear.
 *
 * The send and receive directions use different keys, and the receive key is
 * derived from the *reversed* init packet. That asymmetry is what stops the
 * same keystream appearing in both directions.
 */

import { ctrStream } from '../crypto/ctr.js'
import { sha256 } from '../crypto/hash.js'
import { randomBytes as defaultRandom } from '../crypto/random.js'
import { type Framing, FramingError } from './framing.js'

/** Length of the init packet. */
const INIT_SIZE = 64
/** Where the framing tag is written. */
const TAG_OFFSET = 56
/** Where the datacenter id is written, for proxied connections. */
const DC_OFFSET = 60

/**
 * First words a plaintext init packet must not begin with.
 *
 * Read little-endian. Four are HTTP verbs, which a server would route to its
 * web handler; two are framing tags, which would be read as an unobfuscated
 * connection. The last is reserved by Telegram's own implementations.
 */
const RESERVED_FIRST_WORDS: ReadonlySet<number> = new Set([
  0x4441_4548, // 'HEAD'
  0x5453_4f50, // 'POST'
  0x2054_4547, // 'GET '
  0x4954_504f, // 'OPTI'
  0xdddd_dddd, // padded intermediate
  0xeeee_eeee, // intermediate
  0x0201_0316,
])

/** Draws before giving up on a packet that satisfies every constraint. */
const MAX_DRAWS = 64

/** How the connection is obfuscated. */
export interface ObfuscationOptions {
  /** Randomness for the init packet. */
  readonly random?: (length: number) => Uint8Array
  /**
   * Shared secret for an MTProxy connection.
   *
   * Mixed into both keys, so a proxy that does not hold it cannot read the
   * stream it forwards.
   */
  readonly secret?: Uint8Array
  /** Datacenter id, written into the packet when a proxy is in use. */
  readonly dcId?: number
}

/** An obfuscated byte stream, and the packet that opens it. */
export interface Obfuscation {
  /** The 64-byte packet that must be the first thing sent. */
  readonly init: Uint8Array
  /** Encrypt bytes on their way out. */
  encrypt(data: Uint8Array): Uint8Array
  /** Decrypt bytes on their way in. */
  decrypt(data: Uint8Array): Uint8Array
}

/**
 * Build the init packet and the two keystreams.
 *
 * The framing's tag goes inside the packet rather than on the wire, which is
 * how the server learns which envelope to expect without anything observable
 * being sent in the clear.
 */
export function createObfuscation(framing: Framing, options: ObfuscationOptions = {}): Obfuscation {
  const random = options.random ?? defaultRandom
  const packet = drawInitPacket(random)

  writeTag(packet, framing.tag())
  if (options.dcId !== undefined) {
    new DataView(packet.buffer, packet.byteOffset).setInt16(DC_OFFSET, options.dcId, true)
  }

  // The receive keys come from the packet read backwards, so the two
  // directions never share a keystream.
  const reversed = packet.slice(8, TAG_OFFSET).reverse()

  const encryptKey = mix(packet.subarray(8, 40), options.secret)
  const encryptIv = packet.slice(40, TAG_OFFSET)
  const decryptKey = mix(reversed.subarray(0, 32), options.secret)
  const decryptIv = reversed.slice(32, 48)

  // One stream per direction, kept for the life of the connection: what
  // arrives from a socket has nothing to do with block boundaries, so a stream
  // that restarted per call would decrypt the first packet and nothing after.
  const encryptor = ctrStream(encryptKey, encryptIv)
  const decryptor = ctrStream(decryptKey, decryptIv)

  // The packet is encrypted under its own keys, and only the tail of the
  // result is sent encrypted — the prefix has to stay readable, because it is
  // where the receiver finds the keys.
  const encrypted = encryptor.process(packet)
  const init = packet.slice()
  init.set(encrypted.subarray(TAG_OFFSET, INIT_SIZE), TAG_OFFSET)

  return {
    init,
    encrypt: (data) => encryptor.process(data),
    decrypt: (data) => decryptor.process(data),
  }
}

/**
 * Draw random bytes until they satisfy every constraint the packet must meet.
 *
 * Rejection rather than correction: forcing a byte to a permitted value would
 * make that position non-uniform, and the whole point of the prefix is that it
 * looks like nothing.
 */
function drawInitPacket(random: (length: number) => Uint8Array): Uint8Array {
  for (let draw = 0; draw < MAX_DRAWS; draw += 1) {
    const packet = random(INIT_SIZE)
    if (packet.length !== INIT_SIZE) {
      throw new FramingError(`init packet must be ${INIT_SIZE} bytes, received ${packet.length}`)
    }

    // A leading 0xef would be read as an abridged connection.
    if (packet[0] === 0xef) continue

    const view = new DataView(packet.buffer, packet.byteOffset)
    if (RESERVED_FIRST_WORDS.has(view.getUint32(0, true))) continue

    // A zero second word is reserved and would be read as a framing tag.
    if (view.getInt32(4, true) === 0) continue

    return packet
  }

  throw new FramingError('failed to draw a usable obfuscation init packet')
}

/**
 * Write the framing tag into the packet.
 *
 * The abridged tag is a single byte; the packet always carries four, so a
 * short tag is repeated to fill the field.
 */
function writeTag(packet: Uint8Array, tag: Uint8Array): void {
  if (tag.length === 4) {
    packet.set(tag, TAG_OFFSET)
    return
  }

  if (tag.length === 1) {
    packet.fill(tag[0] ?? 0, TAG_OFFSET, TAG_OFFSET + 4)
    return
  }

  throw new FramingError(
    `a framing tag must be 1 or 4 bytes to be obfuscated, received ${tag.length}`,
  )
}

/** Bind a key to the proxy secret, when one is in use. */
function mix(key: Uint8Array, secret: Uint8Array | undefined): Uint8Array {
  if (secret === undefined) return key.slice()

  return sha256(key, secret)
}
