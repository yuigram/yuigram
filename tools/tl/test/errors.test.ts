// SPDX-License-Identifier: MPL-2.0

/**
 * Reading Telegram's error database, and what is emitted from it.
 *
 * The documents here are written for the test in the database's shape rather
 * than saved from it: what matters is which fields are read, and a saved copy
 * would carry descriptions this project does not keep.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  type ErrorSnapshot,
  emitErrors,
  readErrorDatabase,
  serializeErrorSnapshot,
} from '../src/errors.js'
import { TlFetchError } from '../src/fetch.js'

const URL = 'https://core.telegram.org/api/errors.json'

/** A database in the published shape: codes, then names, then methods. */
function database(errors: Record<string, Record<string, unknown>>, extra: object = {}): string {
  return JSON.stringify({
    errors,
    descriptions: { PEER_ID_INVALID: 'Prose that is not kept.' },
    user_only: ['messages.sendMessage'],
    layer: 227,
    ...extra,
  })
}

describe('reading the database', () => {
  it('keeps codes, names and methods, and nothing it was not asked for', () => {
    const read = readErrorDatabase(
      database({
        '400': { PEER_ID_INVALID: ['messages.sendMessage', 'messages.getHistory'] },
        '420': { FLOOD_WAIT_X: [], 'FLOOD_WAIT_%d': [] },
      }),
      URL,
    )

    expect(read.layer).toBe(227)
    expect(read.errors).toEqual({
      'FLOOD_WAIT_%d': { codes: [420], methods: [] },
      FLOOD_WAIT_X: { codes: [420], methods: [] },
      PEER_ID_INVALID: { codes: [400], methods: ['messages.getHistory', 'messages.sendMessage'] },
    })
    expect(JSON.stringify(read)).not.toContain('Prose')
    expect(JSON.stringify(read)).not.toContain('user_only')
  })

  it('merges a name listed under several codes', () => {
    const read = readErrorDatabase(
      database({
        '403': { CHAT_ADMIN_REQUIRED: ['channels.editAdmin'] },
        '400': { CHAT_ADMIN_REQUIRED: ['messages.editChatTitle', 'channels.editAdmin'] },
      }),
      URL,
    )

    expect(read.errors['CHAT_ADMIN_REQUIRED']).toEqual({
      codes: [400, 403],
      methods: ['channels.editAdmin', 'messages.editChatTitle'],
    })
  })

  it('keeps a number wherever the name carries it, and the capitalised names', () => {
    const read = readErrorDatabase(
      database({
        '400': { 'FILE_PART_%d_MISSING': [], 'PREVIOUS_CHAT_IMPORT_ACTIVE_WAIT_%dMIN': [] },
        '401': { '2FA_CONFIRM_WAIT_%d': ['account.deleteAccount'] },
        '-503': { Timeout: [] },
      }),
      URL,
    )

    expect(Object.keys(read.errors)).toEqual([
      '2FA_CONFIRM_WAIT_%d',
      'FILE_PART_%d_MISSING',
      'PREVIOUS_CHAT_IMPORT_ACTIVE_WAIT_%dMIN',
      'Timeout',
    ])
    expect(read.errors['Timeout']?.codes).toEqual([-503])
  })

  it('refuses a document whose shape it does not understand, rather than recording less', () => {
    expect(() => readErrorDatabase('<html>', URL)).toThrow(/not JSON/)
    expect(() => readErrorDatabase('[]', URL)).toThrow(TlFetchError)
    expect(() => readErrorDatabase(database({}, { layer: 'new' }), URL)).toThrow(/no layer/)
    expect(() => readErrorDatabase(JSON.stringify({ layer: 1 }), URL)).toThrow(/no errors/)
    expect(() => readErrorDatabase(database({ bad: {} }), URL)).toThrow(/under 'bad'/)
    expect(() => readErrorDatabase(database({ '400': { 'Two words': [] } }), URL)).toThrow(
      /not a name/,
    )
    expect(() => readErrorDatabase(database({ '400': { X_INVALID: 'all' } }), URL)).toThrow(
      /no methods/,
    )
    expect(() => readErrorDatabase(database({ '400': { X_INVALID: ['<b>'] } }), URL)).toThrow(
      /not a method/,
    )
  })
})

const SNAPSHOT: ErrorSnapshot = {
  provenance: {
    source: URL,
    retrieved: '2026-01-01',
    databaseLayer: 227,
    schemaLayer: 229,
    recorded: 'codes, names and methods',
  },
  errors: {
    'SLOWMODE_WAIT_%d': { codes: [420], methods: ['messages.sendMessage'] },
    PEER_ID_INVALID: { codes: [400], methods: ['messages.sendMessage', 'auth.signIn'] },
    PHONE_CODE_INVALID: { codes: [400], methods: ['auth.signIn'] },
  },
}

describe('the snapshot', () => {
  it('is written the same way however it was assembled', () => {
    const reordered: ErrorSnapshot = {
      ...SNAPSHOT,
      errors: Object.fromEntries(Object.entries(SNAPSHOT.errors).reverse()),
    }

    const text = serializeErrorSnapshot(SNAPSHOT)
    expect(serializeErrorSnapshot(reordered)).toBe(text)
    expect(text.endsWith('}\n')).toBe(true)
    expect(text).toContain('"methods": ["auth.signIn", "messages.sendMessage"]')
    expect(text).toContain('"codes": [400]')
    expect(text.indexOf('PEER_ID_INVALID')).toBeLessThan(text.indexOf('SLOWMODE_WAIT_%d'))
    expect(JSON.parse(text)).toEqual({
      ...SNAPSHOT,
      errors: {
        PEER_ID_INVALID: { codes: [400], methods: ['auth.signIn', 'messages.sendMessage'] },
        PHONE_CODE_INVALID: { codes: [400], methods: ['auth.signIn'] },
        'SLOWMODE_WAIT_%d': { codes: [420], methods: ['messages.sendMessage'] },
      },
    })
  })
})

describe('what is emitted', () => {
  const text = emitErrors(SNAPSHOT).text

  it('is types and nothing else, so importing the client costs nothing', () => {
    expect(text).not.toMatch(/export (const|function|class|let|var|enum)\b/)
    expect(text).toMatch(/export type DocumentedErrorPattern =/)
    expect(text).toMatch(/export type DocumentedErrorText =/)
  })

  it('writes a pattern as it was listed, and its texts as a template', () => {
    expect(text).toContain("  | 'SLOWMODE_WAIT_%d'")
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the expected text is TypeScript source
    expect(text).toContain('  | `SLOWMODE_WAIT_${number}`')
    expect(text).toContain("  | 'PEER_ID_INVALID'")
  })

  it('says where it came from, without a date that would change every fetch', () => {
    expect(text).toMatch(/^\/\/ GENERATED FILE/)
    expect(text).toContain('schemas/tl/errors.json')
    expect(text).toContain('layer 227')
    expect(text).not.toContain('2026-01-01')
  })

  it('emits a type that admits nothing from a snapshot that lists nothing', () => {
    const empty = emitErrors({ ...SNAPSHOT, errors: {} }).text

    expect(empty).toContain('export type DocumentedErrorPattern =\n  never')
  })

  it('matches what is committed', () => {
    const root = join(import.meta.dirname, '..', '..', '..')
    const snapshotPath = join(root, 'schemas', 'tl', 'errors.json')
    if (!existsSync(snapshotPath)) return

    const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8')) as ErrorSnapshot
    const committed = readFileSync(
      join(root, 'packages', 'mtproto', 'src', 'generated', 'errors.ts'),
      'utf8',
    )

    expect(committed.replace(/\r\n/g, '\n')).toBe(emitErrors(snapshot).text)
    expect(readFileSync(snapshotPath, 'utf8').replace(/\r\n/g, '\n')).toBe(
      serializeErrorSnapshot(snapshot),
    )
  })
})
