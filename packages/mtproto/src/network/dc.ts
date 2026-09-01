/**
 * Where a datacenter can be reached, and which address to use.
 *
 * A datacenter is not one address. The server publishes several per identifier
 * — an IPv4 and an IPv6 form, a media-only variant, a CDN variant — and which
 * one applies depends on what the connection is being opened for. Choosing
 * wrongly does not fail cleanly: a media-only address answers ordinary calls
 * with errors that name nothing about addressing, and a CDN address holds no
 * authorization at all.
 *
 * Two things are separated here on purpose. An address is durable
 * configuration: it describes the network and outlives any process that reads
 * it. A connection is not, and nothing in this module opens, counts, pools or
 * closes one. What is here answers a question — *given an identifier and a
 * purpose, which address* — and holds no state that changes while it answers.
 */

import { ValidationError } from '@yuigram/core'
import type { TlValue } from '../tl/index.js'

/** Ports are 16-bit. */
const MAX_PORT = 65_535

/** Dotted-quad, each octet within range. */
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

/** The characters an address literal may contain once it claims to be IPv6. */
const IPV6_CHARS = /^[0-9a-fA-F:.]+$/

/** What a connection is being opened for. */
export type DcPurpose =
  /** Ordinary calls and the update stream. */
  | 'main'
  /** Uploading and downloading files. */
  | 'media'
  /** Content served from a cache that holds no authorization. */
  | 'cdn'

/**
 * One address a datacenter answers on.
 *
 * The flags are the wire's, renamed but not reinterpreted. Three of them decide
 * whether an address may be used at all — `mediaOnly`, `cdn` and the identifier
 * — and the rest describe how to connect once one is chosen, which is the
 * transport's concern rather than this module's.
 */
export interface DcAddress {
  /** The datacenter this address belongs to. */
  readonly id: number
  /** Literal address. Never a hostname: the protocol publishes addresses. */
  readonly host: string
  readonly port: number
  /** Whether `host` is an IPv6 literal. */
  readonly ipv6: boolean
  /** Serves file transfers only. Ordinary calls do not belong here. */
  readonly mediaOnly: boolean
  /** Accepts obfuscated transport only. */
  readonly tcpoOnly: boolean
  /** A content cache, which holds no authorization of ours. */
  readonly cdn: boolean
  /** The address is fixed and may be remembered. */
  readonly static: boolean
  /** Only the port named here; other ports on this address are not open. */
  readonly thisPortOnly: boolean
  /** Obfuscation secret, when the address requires one. */
  readonly secret: Uint8Array | undefined
}

/** The datacenter configuration a server published. */
export interface DcConfiguration {
  /** In the order the server gave them, which is its order of preference. */
  readonly options: readonly DcAddress[]
  /** The datacenter that answered, which is the one this client belongs to. */
  readonly thisDc: number
  /** Whether these addresses are the test network's. */
  readonly testMode: boolean
}

/** What is being looked for. */
export interface DcQuery {
  readonly id: number
  /** Defaults to `main`. */
  readonly purpose?: DcPurpose
  /** Prefer an IPv6 address. Defaults to preferring IPv4. */
  readonly ipv6?: boolean
}

/**
 * Read one `dcOption`.
 *
 * Every field is checked before it is kept. An address arrives from the network
 * and is then remembered, so one that is malformed is not a transient failure —
 * it is stored and returned to every later query until something replaces it.
 */
export function readDcOption(value: TlValue): DcAddress {
  if (value._ !== 'dcOption') {
    throw new ValidationError(`'${value._}' is not a datacenter address`)
  }

  const id = readInt(value, 'id')
  if (id <= 0) {
    throw new ValidationError(`datacenter identifier ${id} is not positive`)
  }

  const port = readInt(value, 'port')
  if (port <= 0 || port > MAX_PORT) {
    throw new ValidationError(`port ${port} is outside the range a port may take`)
  }

  const host = readString(value, 'ip_address')
  const ipv6 = flag(value, 'ipv6')
  checkHost(host, ipv6)

  return {
    id,
    host,
    port,
    ipv6,
    mediaOnly: flag(value, 'media_only'),
    tcpoOnly: flag(value, 'tcpo_only'),
    cdn: flag(value, 'cdn'),
    static: flag(value, 'static'),
    thisPortOnly: flag(value, 'this_port_only'),
    secret: readSecret(value),
  }
}

/**
 * Read the datacenter configuration out of a `config`.
 *
 * The whole list is read or none of it is. A configuration accepted with some
 * addresses dropped would be indistinguishable from one the server published
 * that way, and the missing entries would only be noticed as a datacenter that
 * cannot be reached.
 */
export function readDcConfiguration(value: TlValue): DcConfiguration {
  if (value._ !== 'config') {
    throw new ValidationError(`'${value._}' does not carry a datacenter configuration`)
  }

  const raw = value['dc_options']
  if (!Array.isArray(raw)) {
    throw new ValidationError("'config.dc_options' must be a vector")
  }
  if (raw.length === 0) {
    throw new ValidationError('a configuration names no datacenter addresses')
  }

  const options = raw.map((option, index) => {
    if (typeof option !== 'object' || option === null) {
      throw new ValidationError(`datacenter address ${index} is not a stated address`)
    }
    return readDcOption(option as TlValue)
  })

  const thisDc = readInt(value, 'this_dc')
  if (thisDc <= 0) {
    throw new ValidationError(`datacenter identifier ${thisDc} is not positive`)
  }

  return { options, thisDc, testMode: readBool(value, 'test_mode') }
}

/**
 * The addresses a client knows, and the rule for choosing between them.
 *
 * Immutable. A configuration is replaced wholesale rather than amended, because
 * the server publishes the list as a set: an address removed from a later
 * configuration is one the server has stopped serving, and merging would keep
 * it forever.
 */
export class DcDirectory {
  readonly #configuration: DcConfiguration

  constructor(configuration: DcConfiguration) {
    if (configuration.options.length === 0) {
      throw new ValidationError('a directory needs at least one address')
    }

    this.#configuration = {
      options: [...configuration.options],
      thisDc: configuration.thisDc,
      testMode: configuration.testMode,
    }
  }

  /** The datacenter this client belongs to. */
  get thisDc(): number {
    return this.#configuration.thisDc
  }

  /** Whether these are the test network's addresses. */
  get testMode(): boolean {
    return this.#configuration.testMode
  }

  /** Everything known, in the order the server published it. */
  get options(): readonly DcAddress[] {
    return this.#configuration.options
  }

  /** What this directory holds, as it would be stored. */
  toConfiguration(): DcConfiguration {
    return this.#configuration
  }

  /** The identifiers that can be reached at all, ascending. */
  identifiers(): readonly number[] {
    return [...new Set(this.#configuration.options.map((option) => option.id))].sort(
      (a, b) => a - b,
    )
  }

  /**
   * Every address that could serve a query, in preference order.
   *
   * Preference is the server's own ordering, narrowed twice: first to the
   * addresses that *may* serve the purpose, then to the preferred address
   * family. The family is a preference rather than a requirement — a client
   * with no route to one family still needs an answer, and whether a route
   * exists is not something this module can know.
   */
  candidates(query: DcQuery): readonly DcAddress[] {
    const purpose = query.purpose ?? 'main'
    const usable = this.#configuration.options.filter(
      (option) => option.id === query.id && serves(option, purpose),
    )

    const preferred = usable.filter((option) => option.ipv6 === (query.ipv6 ?? false))

    return preferred.length > 0 ? preferred : usable
  }

  /**
   * The address to use, or `undefined` when the datacenter serves no such
   * purpose.
   *
   * Deterministic: the same directory and the same query always give the same
   * answer, because the choice is the first candidate rather than one drawn at
   * random. Spreading load across addresses is the connection layer's decision
   * and needs to know what is already open, which is exactly the state this
   * module does not hold.
   */
  select(query: DcQuery): DcAddress | undefined {
    return this.candidates(query)[0]
  }
}

/**
 * Whether two configurations say the same thing.
 *
 * Compared field by field rather than by identity, because the point of asking
 * is to tell a configuration that arrived from the server apart from the one
 * already in force — two objects that never shared an origin.
 *
 * Order matters: the server publishes its addresses in its own order of
 * preference, so a list with the same entries rearranged is a different
 * configuration and is adopted as one.
 */
export function sameConfiguration(left: DcConfiguration, right: DcConfiguration): boolean {
  return (
    left.thisDc === right.thisDc &&
    left.testMode === right.testMode &&
    left.options.length === right.options.length &&
    left.options.every((option, index) => sameAddress(option, right.options[index]))
  )
}

function sameAddress(left: DcAddress, right: DcAddress | undefined): boolean {
  return (
    right !== undefined &&
    left.id === right.id &&
    left.host === right.host &&
    left.port === right.port &&
    left.ipv6 === right.ipv6 &&
    left.mediaOnly === right.mediaOnly &&
    left.tcpoOnly === right.tcpoOnly &&
    left.cdn === right.cdn &&
    left.static === right.static &&
    left.thisPortOnly === right.thisPortOnly &&
    sameSecret(left.secret, right.secret)
  )
}

function sameSecret(left: Uint8Array | undefined, right: Uint8Array | undefined): boolean {
  if (left === undefined || right === undefined) return left === right

  return left.length === right.length && left.every((byte, index) => byte === right[index])
}

/**
 * Whether an address may serve a purpose.
 *
 * A CDN address holds no authorization of ours, so it can serve only what needs
 * none. A media-only address is refused for ordinary calls rather than tried
 * and allowed to fail, because what comes back names nothing about addressing.
 * For media the media-only addresses are preferred, but an ordinary address
 * serves files too, so both remain candidates.
 */
function serves(option: DcAddress, purpose: DcPurpose): boolean {
  if (purpose === 'cdn') return option.cdn
  if (option.cdn) return false

  return purpose === 'media' || !option.mediaOnly
}

/**
 * Refuse an address literal that does not match the family it claims.
 *
 * The flag decides how the transport opens a socket, so an IPv4 literal behind
 * the IPv6 flag is not a cosmetic mismatch: it produces a connection attempt
 * against an address that was never published.
 */
function checkHost(host: string, ipv6: boolean): void {
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

/** An optional `true` flag, absent when unset. */
function flag(value: TlValue, field: string): boolean {
  const raw = value[field]
  if (raw === undefined) return false
  if (raw !== true) {
    throw new ValidationError(`'dcOption.${field}' must be absent or true`)
  }

  return true
}

function readInt(value: TlValue, field: string): number {
  const raw = value[field]
  if (typeof raw !== 'number' || !Number.isInteger(raw)) {
    throw new ValidationError(`'${value._}.${field}' must be a 32-bit integer`)
  }
  return raw
}

function readString(value: TlValue, field: string): string {
  const raw = value[field]
  if (typeof raw !== 'string') {
    throw new ValidationError(`'${value._}.${field}' must be a string`)
  }
  return raw
}

function readBool(value: TlValue, field: string): boolean {
  const raw = value[field]
  if (typeof raw !== 'boolean') {
    throw new ValidationError(`'${value._}.${field}' must be a boolean`)
  }
  return raw
}

/** The obfuscation secret, refused when present but carrying nothing. */
function readSecret(value: TlValue): Uint8Array | undefined {
  const raw = value['secret']
  if (raw === undefined) return undefined
  if (!(raw instanceof Uint8Array)) {
    throw new ValidationError("'dcOption.secret' must be a byte string")
  }
  if (raw.length === 0) {
    throw new ValidationError("'dcOption.secret' is present but empty")
  }

  return raw
}
