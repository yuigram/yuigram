/**
 * The datacenter configuration that survives a restart.
 *
 * The list of addresses is published by the server and is the only way to reach
 * it, which makes it a bootstrapping problem: fetching the list requires an
 * address, and the address comes from the list. Remembering the last one closes
 * that loop for every start after the first.
 *
 * It is configuration, not session state. Nothing here describes a connection,
 * and nothing stored here becomes wrong because a connection ended — which is
 * why it is kept apart from the authorization state, whose contents are tied to
 * one key and one datacenter.
 *
 * The failure policy matches the authorization store's: a stored configuration
 * that cannot be read is refused rather than treated as absent. Absent means
 * "ask the server", and answering that for a list that is merely damaged would
 * discard addresses that were working.
 */

import { type KV, YuigramError } from '../core.js'
import { fromBase64, toBase64 } from '../crypto/encoding.js'
import type { DcAddress, DcConfiguration } from '../network/dc.js'

/** Where the configuration is kept. */
const KEY = 'datacenters'

/**
 * Addresses a stored configuration may name.
 *
 * Persisted state is attacker-controlled wherever a file can be replaced, so
 * the bound is applied before anything is built from it. A real configuration
 * names a few dozen; a thousand is far past anything the protocol publishes.
 */
const MAX_OPTIONS = 1024

/** A stored configuration that could not be read back. */
export class DatacenterStorageError extends YuigramError {
  override readonly name = 'DatacenterStorageError'
}

/**
 * Durable datacenter configuration.
 *
 * The interface an application implements to supply its own persistence. What
 * is stored, and how, is this layer's business.
 */
export interface DatacenterStore {
  /** The configuration last saved, if one was. */
  load(): Promise<DcConfiguration | undefined>
  /** Replace the configuration wholesale. */
  save(configuration: DcConfiguration): Promise<void>
  /** Forget it, as a client changing networks must. */
  forget(): Promise<void>
}

/**
 * Keep the datacenter configuration in a key-value store.
 *
 * Written as one value rather than one per address. The list is meaningful only
 * as a set — an address missing from a later configuration is one the server
 * has stopped serving — so a partial write would leave a configuration that the
 * server never published and that nothing could detect.
 */
export function datacenterStore(kv: KV<unknown>): DatacenterStore {
  return {
    async load() {
      const stored = await kv.get(KEY)
      if (stored === undefined) return undefined

      return decode(stored)
    },

    async save(configuration) {
      await kv.set(KEY, encode(configuration))
    },

    async forget() {
      await kv.delete(KEY)
    },
  }
}

/** What is written: plain data, with byte strings in a form text can carry. */
interface StoredAddress {
  readonly id: number
  readonly host: string
  readonly port: number
  readonly ipv6: boolean
  readonly mediaOnly: boolean
  readonly tcpoOnly: boolean
  readonly cdn: boolean
  readonly static: boolean
  readonly thisPortOnly: boolean
  readonly secret?: string
}

function encode(configuration: DcConfiguration): unknown {
  return {
    thisDc: configuration.thisDc,
    testMode: configuration.testMode,
    options: configuration.options.map(
      (option): StoredAddress => ({
        id: option.id,
        host: option.host,
        port: option.port,
        ipv6: option.ipv6,
        mediaOnly: option.mediaOnly,
        tcpoOnly: option.tcpoOnly,
        cdn: option.cdn,
        static: option.static,
        thisPortOnly: option.thisPortOnly,
        ...(option.secret === undefined ? {} : { secret: toBase64(option.secret) }),
      }),
    ),
  }
}

function decode(stored: unknown): DcConfiguration {
  const record = asRecord(stored, 'the stored configuration')
  const options = record['options']
  if (!Array.isArray(options)) {
    throw new DatacenterStorageError('the stored configuration names no addresses')
  }
  if (options.length === 0 || options.length > MAX_OPTIONS) {
    throw new DatacenterStorageError(`the stored configuration names ${options.length} addresses`)
  }

  return {
    thisDc: readNumber(record, 'thisDc'),
    testMode: readBoolean(record, 'testMode'),
    options: options.map((option, index) => decodeAddress(option, index)),
  }
}

function decodeAddress(stored: unknown, index: number): DcAddress {
  const record = asRecord(stored, `stored address ${index}`)

  return {
    id: readNumber(record, 'id'),
    host: readString(record, 'host'),
    port: readNumber(record, 'port'),
    ipv6: readBoolean(record, 'ipv6'),
    mediaOnly: readBoolean(record, 'mediaOnly'),
    tcpoOnly: readBoolean(record, 'tcpoOnly'),
    cdn: readBoolean(record, 'cdn'),
    static: readBoolean(record, 'static'),
    thisPortOnly: readBoolean(record, 'thisPortOnly'),
    secret: decodeSecret(record['secret']),
  }
}

/**
 * Recover an obfuscation secret.
 *
 * Base64 accepts input that decodes to nothing, so an empty result is refused
 * rather than stored as a secret of no bytes — which would be offered to the
 * transport as though it were one.
 */
function decodeSecret(stored: unknown): Uint8Array | undefined {
  if (stored === undefined) return undefined
  if (typeof stored !== 'string') {
    throw new DatacenterStorageError('a stored secret is not text')
  }

  const decoded = fromBase64(stored)
  if (decoded.length === 0) {
    throw new DatacenterStorageError('a stored secret decodes to nothing')
  }

  return decoded
}

function asRecord(stored: unknown, what: string): Record<string, unknown> {
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) {
    throw new DatacenterStorageError(`${what} is not a stored record`)
  }

  return stored as Record<string, unknown>
}

function readNumber(record: Record<string, unknown>, field: string): number {
  const raw = record[field]
  if (typeof raw !== 'number' || !Number.isInteger(raw)) {
    throw new DatacenterStorageError(`'${field}' is not a whole number`)
  }
  return raw
}

function readString(record: Record<string, unknown>, field: string): string {
  const raw = record[field]
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new DatacenterStorageError(`'${field}' is not text`)
  }
  return raw
}

function readBoolean(record: Record<string, unknown>, field: string): boolean {
  const raw = record[field]
  if (typeof raw !== 'boolean') {
    throw new DatacenterStorageError(`'${field}' is not a flag`)
  }
  return raw
}
