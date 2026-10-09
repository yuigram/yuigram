// SPDX-License-Identifier: MIT

/**
 * The API schema of a layer the documentation does not yet describe, read from TDLib.
 *
 * Telegram's documentation page is the published contract, but it serves a
 * layer only after the servers speak it. TDLib — Telegram's own client
 * library, distributed under the Boost Software License 1.0 — carries the
 * schema it is built from in `td/generate/scheme/telegram_api.tl`, and states
 * the layer in `td/telegram/Version.h`. That is where a newer layer is read
 * from, at one revision fixed below and checked byte for byte.
 *
 * The file is not the schema alone. Before its first `---types---` it declares
 * the language's builtins, five of the six constructors the TL language owns,
 * and definitions TDLib keeps for its own use. Every one of those is listed
 * below by its exact text, with what becomes of it, so a revision that changes
 * any of them stops the import rather than passing it through or dropping it
 * unseen. The constructors the language owns are taken from the documentation
 * schema instead — it is the one that defines `null` — and TDLib's copies of
 * the other five must match it exactly. Everything after the marker is the
 * schema proper, and is taken as it is.
 */

import { createHash } from 'node:crypto'
import { TlFetchError } from './fetch.js'

/** The revision the schema is read at, and what each file read there must be. */
export const TDLIB = {
  repository: 'https://github.com/tdlib/td',
  revision: '42e6a5259551178d1dab54a22ad96d14bd906e20',
  licence: 'Boost Software License 1.0',
  /** The layer the pin is for. A file stating another is refused. */
  layer: 229,
  schema: {
    path: 'td/generate/scheme/telegram_api.tl',
    sha256: '4c44853dd138f6484281317b2a6da7e778b770014bf2d63db76d4138b33bec4f',
  },
  version: {
    path: 'td/telegram/Version.h',
    sha256: '30a7bb6f94190d0a814d258ca67ccd57b7e4c5a04faa091ade0e43c43129ea63',
  },
  licenceText: {
    path: 'LICENSE_1_0.txt',
    sha256: 'c9bff75738922193e67fa726fa225535870d2aa1059f91452c411736284ad566',
  },
} as const

/** Where a file of the pinned revision is retrieved from. */
export function tdlibUrl(path: string): string {
  return `https://raw.githubusercontent.com/tdlib/td/${TDLIB.revision}/${path}`
}

/** The constructors the TL language owns, in the order the documentation declares them. */
export const LANGUAGE_OWNED = ['boolFalse', 'boolTrue', 'true', 'vector', 'error', 'null'] as const

/** What becomes of a definition TDLib's file declares before its schema proper. */
export interface PrefixDefinition {
  /** The definition exactly as the file states it, spaces collapsed. */
  readonly text: string
  /** Whether it is a constructor or a function in the file's own sections. */
  readonly section: 'types' | 'functions'
  /**
   * - `language` — owned by the TL language; replaced by the documentation's own.
   * - `builtin` — a primitive the codec handles directly; no table carries it.
   * - `tdlib` — TDLib's own; not part of the API layer, and left out.
   */
  readonly kind: 'language' | 'builtin' | 'tdlib'
  readonly reason: string
}

const SIMPLE_CONFIG =
  "TDLib's simple configuration, read from a signed blob outside any API connection; never an answer to a call"
const LEGACY_LOCATION =
  'a legacy file location TDLib keeps for references it stored long ago; not in the layer as Telegram serves or documents it'
const TEST_FUNCTION =
  "a TDLib test entry with no identifier of its own; not a method of Telegram's API"
const PREFIX_FUNCTION =
  "TDLib's encoding of the prefix of a wrapper method, under the wrapper's own identifier; the wrapper itself is in the schema proper"

/** Everything TDLib's file declares before its schema proper, at the pinned revision. */
export const TDLIB_PREFIX: readonly PrefixDefinition[] = [
  { text: 'int ? = Int;', section: 'types', kind: 'builtin', reason: 'a codec primitive' },
  { text: 'long ? = Long;', section: 'types', kind: 'builtin', reason: 'a codec primitive' },
  { text: 'double ? = Double;', section: 'types', kind: 'builtin', reason: 'a codec primitive' },
  { text: 'string ? = String;', section: 'types', kind: 'builtin', reason: 'a codec primitive' },
  { text: 'bytes = Bytes;', section: 'types', kind: 'builtin', reason: 'a codec primitive' },
  { text: 'int256 = Int256;', section: 'types', kind: 'builtin', reason: 'a codec primitive' },
  {
    text: 'true#3fedd339 = True;',
    section: 'types',
    kind: 'language',
    reason: 'owned by the language',
  },
  {
    text: 'boolFalse#bc799737 = Bool;',
    section: 'types',
    kind: 'language',
    reason: 'owned by the language',
  },
  {
    text: 'boolTrue#997275b5 = Bool;',
    section: 'types',
    kind: 'language',
    reason: 'owned by the language',
  },
  {
    text: 'vector#1cb5c415 {t:Type} # [ t ] = Vector t;',
    section: 'types',
    kind: 'language',
    reason: 'owned by the language',
  },
  {
    text: 'error#c4b9f9bb code:int text:string = Error;',
    section: 'types',
    kind: 'language',
    reason: 'owned by the language',
  },
  {
    text: 'ipPort#d433ad73 ipv4:int port:int = IpPort;',
    section: 'types',
    kind: 'tdlib',
    reason: SIMPLE_CONFIG,
  },
  {
    // Its declared identifier is not the one its own text computes to, which
    // the parser rightly refuses; it is excluded here by its exact text, not
    // admitted by relaxing that check.
    text: 'ipPortSecret#37982646 ipv4:int port:int secret:bytes = IpPort;',
    section: 'types',
    kind: 'tdlib',
    reason: SIMPLE_CONFIG,
  },
  {
    text: 'accessPointRule#4679b65f phone_prefix_rules:string dc_id:int ips:vector<IpPort> = AccessPointRule;',
    section: 'types',
    kind: 'tdlib',
    reason: SIMPLE_CONFIG,
  },
  {
    text: 'help.configSimple#5a592a6c date:int expires:int rules:vector<AccessPointRule> = help.ConfigSimple;',
    section: 'types',
    kind: 'tdlib',
    reason: SIMPLE_CONFIG,
  },
  {
    text: 'inputPeerPhotoFileLocationLegacy#27d69997 flags:# big:flags.0?true peer:InputPeer volume_id:long local_id:int = InputFileLocation;',
    section: 'types',
    kind: 'tdlib',
    reason: LEGACY_LOCATION,
  },
  {
    text: 'inputStickerSetThumbLegacy#dbaeae9 stickerset:InputStickerSet volume_id:long local_id:int = InputFileLocation;',
    section: 'types',
    kind: 'tdlib',
    reason: LEGACY_LOCATION,
  },
  {
    text: 'test.useConfigSimple = help.ConfigSimple;',
    section: 'functions',
    kind: 'tdlib',
    reason: TEST_FUNCTION,
  },
  {
    text: 'test.parseInputAppEvent = InputAppEvent;',
    section: 'functions',
    kind: 'tdlib',
    reason: TEST_FUNCTION,
  },
  {
    text: 'invokeWithBusinessConnectionPrefix#dd289f8e connection_id:string = Error;',
    section: 'functions',
    kind: 'tdlib',
    reason: PREFIX_FUNCTION,
  },
  {
    text: 'invokeWithGooglePlayIntegrityPrefix#1df92984 nonce:string token:string = Error;',
    section: 'functions',
    kind: 'tdlib',
    reason: PREFIX_FUNCTION,
  },
  {
    text: 'invokeWithApnsSecretPrefix#0dae54f8 nonce:string secret:string = Error;',
    section: 'functions',
    kind: 'tdlib',
    reason: PREFIX_FUNCTION,
  },
  {
    text: 'invokeWithReCaptchaPrefix#adbb0f94 token:string = Error;',
    section: 'functions',
    kind: 'tdlib',
    reason: PREFIX_FUNCTION,
  },
]

/** Refuse bytes that are not the file that was checked. */
export function checkDigest(bytes: string, expected: string, what: string): void {
  const digest = createHash('sha256').update(bytes, 'utf8').digest('hex')
  if (digest !== expected) {
    throw new TlFetchError(
      `${what} is not the file that was checked: SHA-256 ${digest}, not ${expected}`,
    )
  }
}

/**
 * The layer `Version.h` states, which must be the one the pin is for.
 *
 * Stated once, as `MTPROTO_LAYER`; anything else is refused rather than
 * guessed at, because the number names the snapshot and is sent on every
 * connection.
 */
export function layerFromVersionHeader(text: string, expected: number = TDLIB.layer): number {
  const stated = [...text.matchAll(/^\s*constexpr int32 MTPROTO_LAYER = (\d+);\s*$/gm)]
  if (stated.length !== 1) {
    throw new TlFetchError(`Version.h states MTPROTO_LAYER ${stated.length} times, not once`)
  }
  const layer = Number.parseInt(stated[0]?.[1] ?? '', 10)
  if (layer !== expected) {
    throw new TlFetchError(`Version.h states layer ${layer}, and the pin is for layer ${expected}`)
  }

  return layer
}

/** What the import made of TDLib's file. */
export interface TdlibSchema {
  /** The schema to commit: the language's constructors, then TDLib's schema proper. */
  readonly text: string
  /** The documentation's definitions of the constructors the language owns. */
  readonly languageOwned: readonly string[]
  /** What was left out, with why. */
  readonly setAside: readonly PrefixDefinition[]
}

/** The definitions in a stretch of TL text, by section, comments and blank lines skipped. */
function statements(text: string): { section: 'types' | 'functions'; text: string }[] {
  const out: { section: 'types' | 'functions'; text: string }[] = []
  let section: 'types' | 'functions' = 'types'
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line === '' || line.startsWith('//')) continue
    if (line === '---functions---') section = 'functions'
    else if (line === '---types---') section = 'types'
    else out.push({ section, text: line.replace(/\s+/g, ' ') })
  }

  return out
}

const nameOf = (statement: string): string => /^([A-Za-z_][\w.]*)/.exec(statement)?.[1] ?? ''

/**
 * Turn TDLib's file into the schema to commit.
 *
 * `documentation` is the schema text of Telegram's documentation page, from
 * which the constructors the language owns are taken.
 */
export function schemaFromTdlib(tdlib: string, documentation: string): TdlibSchema {
  const text = tdlib.replace(/\r\n/g, '\n')
  const marker = '\n---types---\n'
  const at = text.indexOf(marker)
  if (at === -1 || text.indexOf(marker, at + 1) !== -1) {
    throw new TlFetchError(
      "TDLib's schema does not open its schema proper with exactly one ---types---",
    )
  }

  const found = statements(text.slice(0, at))
  const expected = TDLIB_PREFIX.map((one) => `${one.section} ${one.text}`)
  const actual = found.map((one) => `${one.section} ${one.text}`)
  const unexpected = actual.filter((one) => !expected.includes(one))
  const absent = expected.filter((one) => !actual.includes(one))
  if (unexpected.length > 0 || absent.length > 0 || actual.length !== expected.length) {
    throw new TlFetchError(
      "TDLib's definitions before its schema proper are not the ones recorded: " +
        [
          ...unexpected.map((one) => `unexpected '${one}'`),
          ...absent.map((one) => `missing '${one}'`),
        ].join('; '),
    )
  }

  const documented = new Map(
    statements(documentation)
      .filter((one) => one.section === 'types')
      .map((one) => [nameOf(one.text), one.text]),
  )
  const languageOwned = LANGUAGE_OWNED.map((name) => {
    const definition = documented.get(name)
    if (definition === undefined) {
      throw new TlFetchError(`the documentation schema does not define '${name}'`)
    }
    return definition
  })
  for (const one of TDLIB_PREFIX.filter((definition) => definition.kind === 'language')) {
    if (!languageOwned.includes(one.text)) {
      throw new TlFetchError(`TDLib's '${one.text}' is not the documentation's definition`)
    }
  }

  const body = text.slice(at + marker.length)
  for (const one of statements(body)) {
    if ((LANGUAGE_OWNED as readonly string[]).includes(nameOf(one.text))) {
      throw new TlFetchError(`'${one.text}' is in TDLib's schema proper as well as before it`)
    }
  }

  const header = [
    `// Telegram API schema, layer ${TDLIB.layer}.`,
    '//',
    "// The first six definitions are the constructors the TL language owns, as Telegram's",
    '// documentation schema states them (https://core.telegram.org/schema). Everything after',
    `// them is TDLib's ${TDLIB.schema.path} at revision`,
    `// ${TDLIB.revision} (${TDLIB.repository}), distributed`,
    '// under the Boost Software License 1.0: see TDLIB-LICENSE.txt beside this file. What TDLib',
    '// declares before its schema proper and what became of it is recorded in sources.json.',
    '',
  ].join('\n')

  return {
    text: `${header}\n${languageOwned.join('\n')}\n\n${body.replace(/^\n+|\n+$/g, '')}\n`,
    languageOwned,
    setAside: TDLIB_PREFIX.filter((one) => one.kind !== 'language'),
  }
}

/**
 * The notice that travels with the copied schema.
 *
 * The licence asks that its text and the copyright notices go with every copy
 * of the work or a part of it. Both are taken from the pinned revision rather
 * than typed here: the notice from the header of the file the layer is read
 * from, the licence from the repository's own copy.
 */
export function tdlibNotice(versionHeader: string, licence: string): string {
  const copyright = versionHeader
    .split('\n')
    .map((line) => line.replace(/^\/\/\s?/, '').trim())
    .filter((line) => line.startsWith('Copyright '))
  if (copyright.length === 0) throw new TlFetchError('Version.h states no copyright notice')

  return [
    `Yuigram's TL schema for layer ${TDLIB.layer} (schemas/tl/api.${TDLIB.layer}.tl in the repository)`,
    `contains ${TDLIB.schema.path} from TDLib (${TDLIB.repository}),`,
    `revision ${TDLIB.revision}. The generated code in @yuigram/mtproto —`,
    'src/generated, and the files built from it — is produced from that schema.',
    '',
    ...copyright,
    '',
    'TDLib is distributed under the Boost Software License, Version 1.0, reproduced below.',
    '',
    licence.replace(/\r\n/g, '\n').replace(/\n+$/, ''),
    '',
  ].join('\n')
}
