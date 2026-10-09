// SPDX-License-Identifier: MIT

/**
 * The address an application names for an account's first connection, and the
 * checks every address passes before it is kept.
 *
 * Apart from the directory in `dc.ts` because this is loaded with the entry
 * point and that is not: an application builds its bootstrap before anything
 * connects, while choosing among published addresses happens once a connection
 * is being opened.
 */

import { ValidationError } from '../core.js'
import type { DcConfiguration } from './dc.js'

/** Ports are 16-bit. */
export const MAX_PORT = 65_535

/** Dotted-quad, each octet within range. */
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

/** The characters an address literal may contain once it claims to be IPv6. */
const IPV6_CHARS = /^[0-9a-fA-F:.]+$/

/**
 * Refuse an address literal that does not match the family it claims.
 *
 * The flag decides how the transport opens a socket, so an IPv4 literal behind
 * the IPv6 flag is not a cosmetic mismatch: it produces a connection attempt
 * against an address that was never published.
 */
export function checkHost(host: string, ipv6: boolean): void {
  if (host.length === 0) {
    throw new ValidationError('a datacenter address is empty')
  }

  if (ipv6) {
    if (!host.includes(':') || !IPV6_CHARS.test(host)) {
      throw new ValidationError(`'${host}' is not an IPv6 literal`)
    }
    return
  }

  const octets = IPV4.exec(host)
  if (octets === null || octets.slice(1).some((octet) => Number(octet) > 255)) {
    throw new ValidationError(`'${host}' is not an IPv4 literal`)
  }
}

/** The one datacenter an application names for an account's first connection. */
export interface BootstrapAddress {
  /** The datacenter's identifier. */
  readonly dc: number
  /** A literal IPv4 or IPv6 address. Never a hostname: the protocol publishes addresses. */
  readonly host: string
  readonly port: number
  /** Whether the address is on Telegram's test network. Production unless given. */
  readonly testMode?: boolean
}

/**
 * The address list an account starts from, given one address.
 *
 * Fetching the list needs an address and the address comes from the list, so
 * the first one is the application's to supply — one of Telegram's known
 * addresses, not compiled in here, because addresses change. One is enough: a redirection to a datacenter it does not
 * name is followed by asking for the whole list, and once the server has
 * published one it is stored and preferred over this.
 *
 * ```ts
 * const account = Account.fromSession('./me.session', {
 *   apiId,
 *   apiHash,
 *   keys,
 *   bootstrap: bootstrapAt({ dc: 2, host: '149.154.167.50', port: 443 }),
 * })
 * ```
 *
 * The address is checked here rather than at the first connection, so a
 * hostname or an out-of-range port is reported where it was written.
 */
export function bootstrapAt(address: BootstrapAddress): DcConfiguration {
  const { dc, host, port, testMode = false } = address

  if (!Number.isInteger(dc) || dc <= 0) {
    throw new ValidationError(`datacenter identifier ${String(dc)} is not a positive integer`)
  }
  if (!Number.isInteger(port) || port <= 0 || port > MAX_PORT) {
    throw new ValidationError(`port ${String(port)} is outside the range a port may take`)
  }

  const ipv6 = host.includes(':')
  checkHost(host, ipv6)

  return {
    thisDc: dc,
    testMode,
    options: [
      {
        id: dc,
        host,
        port,
        ipv6,
        mediaOnly: false,
        tcpoOnly: false,
        cdn: false,
        static: false,
        thisPortOnly: false,
        secret: undefined,
      },
    ],
  }
}
