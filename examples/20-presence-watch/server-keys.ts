/**
 * Telegram's server public keys, taken from where Telegram publishes them.
 *
 * An account authenticates a datacenter by an RSA key it already holds: the
 * keys in the file `SERVER_KEYS` names are what tells Telegram's servers from
 * anything else that answers at their address. So the file must come from
 * Telegram, and from nowhere else — not from a datacenter's own answer, and not
 * from a key that happens to match a fingerprint a server offered.
 *
 * Telegram compiles these keys into its own clients, whose source it
 * publishes. This reads them out of that source at one revision, fixed below,
 * and writes them as the PEM file an account is configured with. Nothing here
 * runs when the example starts: retrieving the keys is a command a person
 * gives, once.
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { serverKeysFromPem } from 'yuigram'
import type { TelegramEnvironment } from './config.js'

/** Where the keys are read from, and what was found there when it was checked. */
export interface KeySource {
  /** The repository, for a person to look at. */
  readonly repository: string
  /** The commit the file is read at. A branch would move; this does not. */
  readonly revision: string
  readonly path: string
  /** SHA-256 of the file at that revision, in hex. Anything else is refused. */
  readonly sha256: string
  /** The table in the file that holds each environment's keys. */
  readonly tables: Readonly<Record<TelegramEnvironment, string>>
  /** The fingerprints of each environment's keys, as a datacenter names them, in hex. */
  readonly fingerprints: Readonly<Record<TelegramEnvironment, readonly string[]>>
}

/**
 * Telegram Desktop's built-in datacenter options.
 *
 * The repository is the one https://telegram.org/apps links as the source of
 * Telegram Desktop. The file keeps the keys of the two environments in two
 * tables and chooses between them by the environment the client runs in, which
 * is what says which key is for which. TDLib — linked from
 * https://core.telegram.org/tdlib — holds the same two keys under `is_test` in
 * `td/telegram/net/PublicRsaKeySharedMain.cpp` (revision 4d06d1ba3a19), and the
 * two were compared when this was written.
 *
 * To move to a later revision, read the file there, compare it with a second
 * of Telegram's sources, and replace the revision, the digest and the
 * fingerprints together.
 */
export const KEY_SOURCE: KeySource = {
  repository: 'https://github.com/telegramdesktop/tdesktop',
  revision: '90c89dcde9aec6974883fd1a270d4ee50d8ba688',
  path: 'Telegram/SourceFiles/mtproto/mtproto_dc_options.cpp',
  sha256: '64a50e0e1650c9313f36eefb16df245085f35718bbd84faa0d99ef9192b43111',
  tables: { production: 'kPublicRSAKeys', test: 'kTestPublicRSAKeys' },
  fingerprints: { production: ['d09d1d85de64fd85'], test: ['b25898df208d2603'] },
}

/** The address the file is retrieved from: the raw file at the fixed revision. */
export const sourceUrl = (source: KeySource = KEY_SOURCE): string =>
  `${source.repository.replace('github.com', 'raw.githubusercontent.com')}/${source.revision}/${source.path}`

/** The key file an environment is configured with unless `SERVER_KEYS` names another. */
export const keyFileFor = (environment: TelegramEnvironment): string =>
  join(import.meta.dirname, `telegram-keys.${environment}.pem`)

/** The fingerprints of the keys in a PEM text, written as a datacenter's refusal writes them. */
export function fingerprintsOf(pem: string): string[] {
  return serverKeysFromPem(pem).map((key) => BigInt.asUintN(64, key.fingerprint).toString(16))
}

const sameSet = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && [...left].sort().join() === [...right].sort().join()

/**
 * The keys of one environment, as PEM, out of the source file's text.
 *
 * The file holds each table as C string literals with their line breaks
 * escaped. Only the table named for the environment is read, so one
 * environment's keys cannot be taken for the other's.
 */
export function keysFromSource(
  text: string,
  environment: TelegramEnvironment,
  source: KeySource = KEY_SOURCE,
): string {
  const name = source.tables[environment]
  const table = new RegExp(`const char \\*${name}\\[\\] = \\{([\\s\\S]*?)\\};`).exec(text)?.[1]
  if (table === undefined) throw new Error(`the source holds no table named ${name}`)

  const unescaped = table.replace(/\\\r?\n/g, '').replace(/\\n/g, '\n')
  const blocks = unescaped.match(
    /-----BEGIN RSA PUBLIC KEY-----[\s\S]*?-----END RSA PUBLIC KEY-----/g,
  )
  if (blocks === null) throw new Error(`the table ${name} holds no key`)

  return `${blocks.join('\n')}\n`
}

export interface PrepareOptions {
  readonly environment: TelegramEnvironment
  /** The file to write. Never replaced where it exists. */
  readonly target: string
  readonly source?: KeySource
  /** Retrieve the source file's bytes. The network, unless given. */
  readonly retrieve?: (url: string) => Promise<Uint8Array>
}

export interface Prepared {
  /** Whether the file was written now or was already there, holding the same keys. */
  readonly status: 'written' | 'present'
  readonly fingerprints: readonly string[]
}

async function download(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { redirect: 'error' })
  if (!response.ok) throw new Error(`${url} answered ${response.status}`)

  return new Uint8Array(await response.arrayBuffer())
}

/**
 * Put an environment's keys where the configuration expects them.
 *
 * A file already there is left as it is: it is accepted where it holds exactly
 * the keys recorded for the environment, and refused — untouched — where it
 * holds anything else. Otherwise the source file is retrieved, required to be
 * byte for byte the one that was checked, and its keys required to be the ones
 * recorded, before anything is written.
 */
export async function prepareServerKeys(options: PrepareOptions): Promise<Prepared> {
  const { environment, target } = options
  const source = options.source ?? KEY_SOURCE
  const expected = source.fingerprints[environment]

  if (existsSync(target)) {
    const held = fingerprintsOf(readFileSync(target, 'utf8'))
    if (sameSet(held, expected)) return { status: 'present', fingerprints: held }
    throw new Error(
      `${target} exists and holds other keys (${held.join(', ')}) than the ${environment} keys of the source ` +
        `(${expected.join(', ')}). It was not changed. Remove it, or name another file.`,
    )
  }

  const url = sourceUrl(source)
  const bytes = await (options.retrieve ?? download)(url)
  const digest = createHash('sha256').update(bytes).digest('hex')
  if (digest !== source.sha256) {
    throw new Error(
      `${url} is not the file that was checked: its SHA-256 is ${digest}, not ${source.sha256}. Nothing was written.`,
    )
  }

  const pem = keysFromSource(new TextDecoder().decode(bytes), environment, source)
  const fingerprints = fingerprintsOf(pem)
  if (!sameSet(fingerprints, expected)) {
    throw new Error(
      `the ${environment} keys read from the source have fingerprints ${fingerprints.join(', ')}, ` +
        `not the recorded ${expected.join(', ')}. Nothing was written.`,
    )
  }

  const header = [
    `Telegram server public keys, ${environment} environment.`,
    `Source: ${source.repository}, revision ${source.revision},`,
    `${source.path} (${source.tables[environment]}).`,
    'These keys are how this client knows Telegram’s servers. Replace them only from that source.',
    '',
    '',
  ].join('\n')
  // `wx`: a file that appeared meanwhile is not replaced either.
  writeFileSync(target, header + pem, { flag: 'wx' })

  return { status: 'written', fingerprints }
}
