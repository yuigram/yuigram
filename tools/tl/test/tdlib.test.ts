// SPDX-License-Identifier: MPL-2.0

/**
 * Reading a layer's API schema from TDLib.
 *
 * Offline: TDLib's file is built here from the recorded prefix and a small
 * schema proper, so each case changes one thing and shows the import refuse it.
 * The import is only worth trusting if a definition it does not recognise, or
 * one that changed shape under a familiar name, stops it.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseSchema } from '../src/parse.js'
import {
  checkDigest,
  LANGUAGE_OWNED,
  layerFromVersionHeader,
  schemaFromTdlib,
  TDLIB,
  TDLIB_PREFIX,
  tdlibNotice,
} from '../src/tdlib.js'

const SCHEMA_DIR = join(import.meta.dirname, '..', '..', '..', 'schemas', 'tl')

const DOCUMENTATION = [
  'boolFalse#bc799737 = Bool;',
  'boolTrue#997275b5 = Bool;',
  '',
  'true#3fedd339 = True;',
  '',
  'vector#1cb5c415 {t:Type} # [ t ] = Vector t;',
  '',
  'error#c4b9f9bb code:int text:string = Error;',
  '',
  'null#56730bcc = Null;',
  '',
  'inputPeerEmpty#7f3b18ea = InputPeer;',
  '',
  '---functions---',
  '',
  'help.getConfig#c4f9186b = Config;',
  '',
].join('\n')

const PROPER = [
  'inputPeerEmpty#7f3b18ea = InputPeer;',
  'inputPeerSelf#7da07ec9 = InputPeer;',
  '',
  '---functions---',
  '',
  'help.getConfig#c4f9186b = Config;',
].join('\n')

/** TDLib's file: its prefix in its own two sections, then the schema proper. */
function tdlibFile(
  options: {
    prefix?: readonly { section: 'types' | 'functions'; text: string }[]
    proper?: string
  } = {},
): string {
  const prefix = options.prefix ?? TDLIB_PREFIX
  const types = prefix.filter((one) => one.section === 'types').map((one) => one.text)
  const functions = prefix.filter((one) => one.section === 'functions').map((one) => one.text)

  return [
    ...types,
    '',
    '---functions---',
    '',
    ...functions,
    '',
    '---types---',
    '',
    options.proper ?? PROPER,
    '',
  ].join('\n')
}

const replacing = (text: string, by: string) =>
  TDLIB_PREFIX.map((one) => (one.text === text ? { ...one, text: by } : one))

describe('the ordinary import', () => {
  const imported = schemaFromTdlib(tdlibFile(), DOCUMENTATION)

  it("puts the documentation's language constructors first, then TDLib's schema proper", () => {
    const definitions = imported.text
      .split('\n')
      .filter((line) => line !== '' && !line.startsWith('//'))

    expect(definitions.slice(0, 6)).toEqual([
      'boolFalse#bc799737 = Bool;',
      'boolTrue#997275b5 = Bool;',
      'true#3fedd339 = True;',
      'vector#1cb5c415 {t:Type} # [ t ] = Vector t;',
      'error#c4b9f9bb code:int text:string = Error;',
      'null#56730bcc = Null;',
    ])
    expect(definitions.slice(6)).toEqual(PROPER.split('\n').filter((line) => line !== ''))
    expect(imported.languageOwned).toHaveLength(LANGUAGE_OWNED.length)
  })

  it('parses, with every identifier still checked', () => {
    const schema = parseSchema(imported.text, { document: 'imported', table: 'api', layer: 229 })

    expect(schema.constructors.map((one) => one.name)).toEqual([
      ...LANGUAGE_OWNED,
      'inputPeerEmpty',
      'inputPeerSelf',
    ])
    expect(schema.methods.map((one) => one.name)).toEqual(['help.getConfig'])
  })

  it("sets aside TDLib's own definitions and the builtins, by their exact text", () => {
    expect(imported.setAside.map((one) => one.kind)).toEqual([
      ...Array(6).fill('builtin'),
      ...Array(12).fill('tdlib'),
    ])
    for (const one of imported.setAside) expect(imported.text).not.toContain(one.text)
  })

  it('names its sources in the text it writes', () => {
    expect(imported.text).toContain(TDLIB.revision)
    expect(imported.text).toContain('https://core.telegram.org/schema')
    expect(imported.text).toContain('TDLIB-LICENSE.txt')
  })
})

describe('what stops the import', () => {
  it('a definition before the schema proper that is not recorded', () => {
    const file = tdlibFile({
      prefix: [...TDLIB_PREFIX, { section: 'types', text: 'ipPortV6#12345678 port:int = IpPort;' }],
    })

    expect(() => schemaFromTdlib(file, DOCUMENTATION)).toThrow(/unexpected 'types ipPortV6/)
  })

  it('a recorded definition that changed shape under its name', () => {
    const file = tdlibFile({
      prefix: replacing(
        'ipPort#d433ad73 ipv4:int port:int = IpPort;',
        'ipPort#d433ad73 ipv4:int port:int tag:int = IpPort;',
      ),
    })

    expect(() => schemaFromTdlib(file, DOCUMENTATION)).toThrow(
      /unexpected .*missing 'types ipPort#d433ad73/,
    )
  })

  it('a recorded definition that moved to the other section', () => {
    const prefix = TDLIB_PREFIX.map((one) =>
      one.text.startsWith('test.useConfigSimple') ? { ...one, section: 'types' as const } : one,
    )

    expect(() => schemaFromTdlib(tdlibFile({ prefix }), DOCUMENTATION)).toThrow(
      /missing 'functions test\.useConfigSimple/,
    )
  })

  it('a recorded definition that is gone', () => {
    const prefix = TDLIB_PREFIX.filter((one) => !one.text.startsWith('accessPointRule'))

    expect(() => schemaFromTdlib(tdlibFile({ prefix }), DOCUMENTATION)).toThrow(
      /missing 'types accessPointRule/,
    )
  })

  it('a language constructor TDLib states differently from the documentation', () => {
    const documentation = DOCUMENTATION.replace(
      'error#c4b9f9bb code:int text:string = Error;',
      'error#c4b9f9bb code:int text:string data:bytes = Error;',
    )

    expect(() => schemaFromTdlib(tdlibFile(), documentation)).toThrow(
      /TDLib's 'error#c4b9f9bb code:int text:string = Error;' is not the documentation's/,
    )
  })

  it('a documentation schema without null', () => {
    const documentation = DOCUMENTATION.replace('null#56730bcc = Null;', '')

    expect(() => schemaFromTdlib(tdlibFile(), documentation)).toThrow(/does not define 'null'/)
  })

  it('a language constructor inside the schema proper as well', () => {
    const file = tdlibFile({ proper: `null#56730bcc = Null;\n${PROPER}` })

    expect(() => schemaFromTdlib(file, DOCUMENTATION)).toThrow(/as well as before it/)
  })

  it('a file whose schema proper is not opened exactly once', () => {
    const none = tdlibFile().replace('---types---', '')
    const twice = tdlibFile({ proper: `${PROPER}\n\n---types---\n` })

    expect(() => schemaFromTdlib(none, DOCUMENTATION)).toThrow(/exactly one ---types---/)
    expect(() => schemaFromTdlib(twice, DOCUMENTATION)).toThrow(/exactly one ---types---/)
  })
})

describe('the identifier check is not relaxed for TDLib', () => {
  it("still refuses TDLib's own definition whose identifier does not compute", () => {
    // It is left out by its exact text; parsing it would fail on its own.
    expect(() =>
      parseSchema('ipPortSecret#37982646 ipv4:int port:int secret:bytes = IpPort;', {
        document: 'tdlib',
        table: 'api',
        layer: 229,
      }),
    ).toThrow(/does not match the computed/)
  })
})

describe('integrity and layer', () => {
  it('refuses bytes that are not the recorded file', () => {
    expect(() => checkDigest('abc', '0'.repeat(64), 'telegram_api.tl')).toThrow(
      /telegram_api\.tl is not the file that was checked/,
    )
    expect(() =>
      checkDigest(
        'abc',
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
        'telegram_api.tl',
      ),
    ).not.toThrow()
  })

  it('reads the layer Version.h states once, and only the pinned one', () => {
    const header = (body: string) => `namespace td {\n\n${body}\n\n}\n`

    expect(layerFromVersionHeader(header('constexpr int32 MTPROTO_LAYER = 229;'))).toBe(229)
    expect(() => layerFromVersionHeader(header('constexpr int32 MTPROTO_LAYER = 230;'))).toThrow(
      /states layer 230, and the pin is for layer 229/,
    )
    expect(() => layerFromVersionHeader(header(''))).toThrow(/0 times/)
    expect(() =>
      layerFromVersionHeader(
        header('constexpr int32 MTPROTO_LAYER = 229;\nconstexpr int32 MTPROTO_LAYER = 229;'),
      ),
    ).toThrow(/2 times/)
  })
})

describe('the notice', () => {
  const header = [
    '//',
    '// Copyright Aliaksei Levin (levlam@telegram.org), Arseny Smirnov (arseny30@gmail.com) 2014-2026',
    '//',
    '// Distributed under the Boost Software License, Version 1.0.',
  ].join('\n')

  it("carries the source's copyright notice and the licence text", () => {
    const notice = tdlibNotice(
      header,
      'Boost Software License - Version 1.0 - August 17th, 2003\n\nPermission…\n',
    )

    expect(notice).toContain(
      'Copyright Aliaksei Levin (levlam@telegram.org), Arseny Smirnov (arseny30@gmail.com) 2014-2026',
    )
    expect(notice).toContain('Boost Software License - Version 1.0 - August 17th, 2003')
    expect(notice).toContain(TDLIB.revision)
  })

  it('refuses a source that states no copyright notice', () => {
    expect(() => tdlibNotice('// nothing here', 'licence')).toThrow(/no copyright notice/)
  })
})

describe('the committed schema', () => {
  const sources = JSON.parse(readFileSync(join(SCHEMA_DIR, 'sources.json'), 'utf8')) as Record<
    string,
    {
      schemaProper?: { revision: string; sha256: string; path: string; notice: string }
      languageOwned?: { from: string; definitions: string[] }
      setAside?: { definition: string }[]
    }
  >
  const entry = sources[`api.${TDLIB.layer}.tl`]

  it('records the revision and the digest the importer is pinned to', () => {
    expect(entry?.schemaProper).toMatchObject({
      revision: TDLIB.revision,
      sha256: TDLIB.schema.sha256,
      path: TDLIB.schema.path,
    })
    expect(entry?.languageOwned?.from).toBe('https://core.telegram.org/schema')
    expect(entry?.setAside?.map((one) => one.definition)).toEqual(
      TDLIB_PREFIX.filter((one) => one.kind !== 'language').map((one) => one.text),
    )
  })

  it('keeps the licence notice beside the copied schema', () => {
    const path = join(SCHEMA_DIR, entry?.schemaProper?.notice ?? 'TDLIB-LICENSE.txt')

    expect(existsSync(path)).toBe(true)
    const notice = readFileSync(path, 'utf8')
    expect(notice).toContain('Boost Software License - Version 1.0')
    expect(notice).toContain('Copyright Aliaksei Levin')
    expect(readFileSync(join(SCHEMA_DIR, `api.${TDLIB.layer}.tl`), 'utf8')).toContain(
      TDLIB.revision,
    )
  })

  it('ships the same notice with the package whose code is generated from it', () => {
    const mtproto = join(SCHEMA_DIR, '..', '..', 'packages', 'mtproto')
    const manifest = JSON.parse(readFileSync(join(mtproto, 'package.json'), 'utf8')) as {
      files: string[]
    }

    expect(manifest.files).toContain('TDLIB-LICENSE.txt')
    expect(readFileSync(join(mtproto, 'TDLIB-LICENSE.txt'), 'utf8')).toBe(
      readFileSync(join(SCHEMA_DIR, 'TDLIB-LICENSE.txt'), 'utf8'),
    )
  })
})
