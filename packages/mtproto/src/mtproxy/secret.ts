// SPDX-License-Identifier: MPL-2.0

/**
 * Reading an MTProxy secret.
 *
 * A proxy is shared as a host, a port and a secret, usually inside a
 * `tg://proxy` or `t.me/proxy` link. The secret is sixteen bytes, and its
 * length and first byte also say how a connection to the proxy is made:
 *
 * ```
 *   16 bytes               obfuscated, intermediate framing
 *   0xdd + 16 bytes        obfuscated, padded intermediate framing
 *   0xee + 16 bytes + host the padded intermediate framing, obfuscated, inside
 *                          what looks like a TLS session with that host
 * ```
 *
 * The first two are Telegram's documented transport obfuscation
 * (`core.telegram.org/mtproto/mtproto-transports`). The third — "fake TLS" —
 * is not documented there; its layout is the one Telegram's own library, TDLib,
 * reads and writes.
 *
 * A secret is written in hexadecimal or in base64, URL-safe or not; a fake-TLS
 * secret is usually base64, because it carries a host name. Anything else — a
 * shorter secret, a longer one with another first byte, a host name past the
 * length a TLS greeting can carry — is refused rather than read as one of these
 * and tried, since a wrong reading is a connection that fails in a way that
 * says nothing about why.
 */

import { ValidationError } from '@yuigram/core'

/** How a connection to a proxy is made. */
export type MtProxyMode = 'obfuscated' | 'padded' | 'fake-tls'

/** A secret, read. */
export interface MtProxySecret {
  readonly mode: MtProxyMode
  /** The sixteen bytes the obfuscation keys are bound to. */
  readonly key: Uint8Array
  /** For fake TLS, the host the session claims to be with. */
  readonly domain?: string
}

/** The longest host a fake-TLS secret may carry: what keeps the greeting within its limits. */
export const MAX_DOMAIN_LENGTH = 182

const KEY_LENGTH = 16
const PADDED = 0xdd
const FAKE_TLS = 0xee

/** Decode text as hexadecimal, or answer nothing. */
function fromHex(text: string): Uint8Array | undefined {
  if (text.length === 0 || text.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(text)) return undefined

  const bytes = new Uint8Array(text.length / 2)
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(text.slice(index * 2, index * 2 + 2), 16)
  }

  return bytes
}

/** Decode base64, URL-safe or standard, padded or not, or answer nothing. */
function fromBase64(text: string): Uint8Array | undefined {
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(text)) return undefined
  // One alphabet or the other, never both in one secret.
  if (/[+/]/.test(text) && /[-_]/.test(text)) return undefined

  const standard = text.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '')
  if (standard.length % 4 === 1) return undefined

  const padded = standard + '='.repeat((4 - (standard.length % 4)) % 4)
  try {
    const binary = atob(padded)
    return Uint8Array.from(binary, (character) => character.charCodeAt(0))
  } catch {
    return undefined
  }
}

/**
 * Read a secret as it is shared.
 *
 * Hexadecimal is tried first, as Telegram's clients do: a string that reads as
 * both is a hexadecimal secret.
 */
export function readProxySecret(secret: string | Uint8Array): MtProxySecret {
  const bytes =
    typeof secret === 'string' ? (fromHex(secret.trim()) ?? fromBase64(secret.trim())) : secret

  if (bytes === undefined) {
    throw new ValidationError('a proxy secret is hexadecimal or base64')
  }

  if (bytes.length === KEY_LENGTH) return { mode: 'obfuscated', key: bytes.slice() }

  if (bytes.length === KEY_LENGTH + 1 && bytes[0] === PADDED) {
    return { mode: 'padded', key: bytes.slice(1) }
  }

  if (bytes.length > KEY_LENGTH + 1 && bytes[0] === FAKE_TLS) {
    const host = bytes.subarray(KEY_LENGTH + 1)
    if (host.length > MAX_DOMAIN_LENGTH) {
      throw new ValidationError(
        `a fake-TLS proxy secret names a host of at most ${MAX_DOMAIN_LENGTH} bytes`,
      )
    }

    let domain: string
    try {
      domain = new TextDecoder('utf-8', { fatal: true }).decode(host)
    } catch {
      throw new ValidationError('a fake-TLS proxy secret names a host that is not text')
    }
    if (!/^[\x21-\x7e]+$/.test(domain)) {
      throw new ValidationError('a fake-TLS proxy secret names a host that is not a host name')
    }

    return { mode: 'fake-tls', key: bytes.slice(1, KEY_LENGTH + 1), domain }
  }

  if (bytes.length < KEY_LENGTH) throw new ValidationError('a proxy secret is at least 16 bytes')

  // The length is never repeated back: a secret is a credential, and a message
  // that described one would be the first place to find it.
  throw new ValidationError('this kind of proxy secret is not supported')
}
