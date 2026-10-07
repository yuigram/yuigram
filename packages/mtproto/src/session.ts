/**
 * A session an account can be carried in.
 *
 * An account normally keeps its authorization in a store. Somewhere without a
 * writable disk — a container, a scheduled job, a platform whose only
 * configuration is an environment variable — there is nowhere to put one, so
 * the same state travels as a string instead.
 *
 * The string **is** a logged-in account. Anyone holding it is signed in as that
 * account until the authorization is revoked. It is not configuration: it does
 * not belong in a repository, in a bug report, or in a message to somebody
 * helping with a problem.
 *
 * ```
 *   0       1     version   0x01
 *   1       1     flags     bit 0 = test network; 1..7 reserved
 *   2       1     dcId      1..255
 *   3     256     authKey
 *                 259 bytes, then standard base64 — 348 characters
 * ```
 *
 * What it carries is one datacenter's long-lived key and enough to place it:
 * which datacenter it belongs to, and which network that datacenter is on.
 * Everything else an account holds is left out because it is obtained again
 * rather than carried — a key with a lifetime is negotiated on connecting, a
 * salt is named by the server on the first message that lacks one, addresses
 * are supplied to the account and republished by the server, and the peers and
 * the update sequence are caches of what the network already knows.
 *
 * There is no checksum. A session damaged in a way that survives decoding is
 * refused by the datacenter, which is where a revoked one is refused too — and
 * a checksum that cannot tell those apart, while looking as though it protects
 * the string, would be worse than none.
 */

import { SessionError } from './core.js'
import { fromBase64, toBase64 } from './crypto/encoding.js'
import { readTlSession, type SessionAddress, writeTlSession } from './session-tl.js'

export type { SessionAddress } from './session-tl.js'

/** The only layout this build writes, and the only one it reads. */
const VERSION = 0x01

/** Bit 0 of the flags byte. The rest are reserved and must be zero. */
const TEST_NETWORK = 0b0000_0001
const RESERVED = 0b1111_1110

/** Where each field sits, and how long the whole thing is. */
const VERSION_AT = 0
const FLAGS_AT = 1
const DC_AT = 2
const KEY_AT = 3
const KEY_SIZE = 256
const PAYLOAD_SIZE = KEY_AT + KEY_SIZE

/**
 * The length of the encoded form.
 *
 * 259 bytes is 86 whole groups of three and one byte over, so the last group
 * carries a single byte and is padded to four characters. Nothing else encodes
 * to this length, which is what makes the check worth making.
 */
const ENCODED_SIZE = 348

/** Where the final group begins, and the character carrying the spare bits. */
const LAST_GROUP_AT = 344
const TRAILING_BITS_AT = 345

/** Standard base64, as the encoding this is written in defines it. */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** What a session says once it has been read and found to make sense. */
export interface PortableSession {
  /** The datacenter the key belongs to, which is the account's own. */
  readonly dcId: number
  /** Whether the key was established on the test network. */
  readonly testMode: boolean
  /** The long-lived key. */
  readonly authKey: Uint8Array
}

/**
 * Write a session out.
 *
 * Deterministic: the same state produces the same string, every time, on every
 * machine. Nothing here is timestamped, ordered by a map, or padded at random.
 */
export function encodeSession(session: PortableSession): string {
  if (!Number.isInteger(session.dcId) || session.dcId < 1 || session.dcId > 255) {
    throw new SessionError(`a datacenter identifier must be 1 to 255, received ${session.dcId}`)
  }

  if (session.authKey.length !== KEY_SIZE) {
    // The length is stated; the key is not. An error that echoed the material
    // it was complaining about would put it wherever the error goes.
    throw new SessionError(
      `an authorization key must be ${KEY_SIZE} bytes, received ${session.authKey.length}`,
    )
  }

  const payload = new Uint8Array(PAYLOAD_SIZE)
  payload[VERSION_AT] = VERSION
  payload[FLAGS_AT] = session.testMode ? TEST_NETWORK : 0
  payload[DC_AT] = session.dcId
  payload.set(session.authKey, KEY_AT)

  return toBase64(payload)
}

/**
 * Read a session, refusing anything that is not exactly one.
 *
 * Every check is on the shape rather than on the content, because the content
 * is a key and nothing here can tell a good one from a bad one — only the
 * datacenter can. What this can do is make sure that whatever reaches the
 * datacenter is what somebody meant to send, and say plainly when it is not.
 *
 * The order matters. Length is settled before any byte is read, so a string cut
 * short is reported as a string cut short rather than as whatever the surviving
 * bytes happen to spell.
 */
export function decodeSession(session: string): PortableSession {
  if (session.trim().length === 0) {
    throw new SessionError('a session string is empty')
  }

  const payload = decodeBase64(session)

  // Belt and braces. The encoded length and the padding already settle this
  // between them, so nothing reaching here can fail it — but they are separate
  // rules about untrusted input, and a decoder that let one of them stand in
  // for the other would be resting on an argument rather than on a check.
  if (payload.length !== PAYLOAD_SIZE) {
    throw new SessionError(
      `a session is ${PAYLOAD_SIZE} bytes, received ${payload.length} — it may be incomplete`,
    )
  }

  const version = payload[VERSION_AT]
  if (version !== VERSION) {
    throw new SessionError(
      `a session of version ${version} cannot be read by this build, which writes version ${VERSION}`,
    )
  }

  const flags = payload[FLAGS_AT] ?? 0
  if ((flags & RESERVED) !== 0) {
    // Reserved bits are how a later layout announces itself. A build that
    // ignored them would read a session it does not understand as one it does.
    throw new SessionError('a session sets flags this build does not know about')
  }

  const dcId = payload[DC_AT] ?? 0
  if (dcId === 0) {
    throw new SessionError('a session names no datacenter')
  }

  return {
    dcId,
    testMode: (flags & TEST_NETWORK) !== 0,
    authKey: payload.slice(KEY_AT, KEY_AT + KEY_SIZE),
  }
}

/**
 * Decode strictly, so one session has exactly one string.
 *
 * The platform's decoder is forgiving: it accepts a wrong alphabet, missing
 * padding, and spare bits set to anything. Each of those would let the same
 * session be written more than one way, and a session that can be written two
 * ways is one that compares unequal to itself after a round trip.
 */
function decodeBase64(session: string): Uint8Array {
  if (session.length !== ENCODED_SIZE) {
    throw new SessionError(
      `a session is ${ENCODED_SIZE} characters, received ${session.length} — it may be incomplete`,
    )
  }

  for (let at = 0; at < LAST_GROUP_AT + 2; at += 1) {
    if (!ALPHABET.includes(session[at] as string)) {
      throw new SessionError(`a session carries a character at ${at} that is not base64`)
    }
  }

  if (session.slice(LAST_GROUP_AT + 2) !== '==') {
    throw new SessionError('a session does not end with the padding its length requires')
  }

  // The last group carries one byte in two characters. The second contributes
  // two bits and has four to spare, and a session that set them would decode to
  // the same bytes as one that did not.
  const spare = ALPHABET.indexOf(session[TRAILING_BITS_AT] as string)
  if ((spare & 0b1111) !== 0) {
    throw new SessionError('a session ends with bits that are not part of it')
  }

  return fromBase64(session)
}

/* -------------------------------------------------------------------------- */
/* Formats                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The layouts a session string can be in.
 *
 * - `'portable'` — this library's own: a fixed 348 characters, the key and
 *   where it belongs, and nothing else.
 * - `'tl-v3'` — the version-3 TL record mtcute writes: URL-safe base64, with
 *   the datacenter's address and, optionally, the account's user.
 */
export type SessionFormat = 'portable' | 'tl-v3'

/** What a session string carries, in whichever layout it came. */
export interface TransferredSession extends PortableSession {
  /** Addresses of the account's datacenter the string named, if it named any. */
  readonly addresses: readonly SessionAddress[]
  /** Which user the account is, if the string said. */
  readonly self?: { readonly id: bigint; readonly isBot: boolean } | undefined
}

/**
 * Read a session string in a named layout.
 *
 * The layout is named rather than guessed: a string is an account, and one
 * read as a layout it is not in would be somebody else's. Reading one in the
 * wrong layout fails with a message saying which layout it looks like.
 */
export function readSession(
  text: string,
  options: { readonly format?: SessionFormat } = {},
): TransferredSession {
  const format = options.format ?? 'portable'

  if (format === 'tl-v3') {
    try {
      return readTlSession(text)
    } catch (error) {
      if (looksPortable(text)) {
        throw new SessionError(
          "this is not a version-3 session string; it looks like this library's own, read with format 'portable'",
          { cause: error },
        )
      }
      throw error
    }
  }

  try {
    return { ...decodeSession(text), addresses: [] }
  } catch (error) {
    if (looksTl(text)) {
      throw new SessionError(
        "this session string looks like a version-3 TL session; read it with format 'tl-v3'",
        { cause: error },
      )
    }
    throw error
  }
}

/** Write a session string in a named layout. */
export function writeSession(
  session: TransferredSession,
  options: { readonly format: SessionFormat },
): string {
  if (options.format === 'tl-v3') return writeTlSession(session)
  return encodeSession(session)
}

/** Whether text has the shape of this library's own layout. */
function looksPortable(text: string): boolean {
  return text.length === ENCODED_SIZE && text.startsWith('A') && text.endsWith('==')
}

/** Whether text has the shape of a version-3 TL string: URL-safe, starting with byte 3. */
function looksTl(text: string): boolean {
  return /^Aw[A-Za-z0-9_-]+$/.test(text.trim())
}
