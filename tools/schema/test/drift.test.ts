// SPDX-License-Identifier: MIT

/**
 * Deciding what a fetch of the documentation means, offline.
 *
 * The load-bearing cases are the quiet ones: a re-fetch that says the same
 * thing must not read as a change, or the scheduled job proposes something on
 * every run; and the staging copy must never be taken for a release.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  classify,
  compareVersions,
  DriftError,
  describeDate,
  latestVersion,
  PREVIEW_URL,
  previewReport,
  proposal,
  STABLE_URL,
  sameContent,
} from '../src/bot-api/drift.js'
import type { BotApiSchema, Method } from '../src/bot-api/ir.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

const committed = JSON.parse(
  readFileSync(join(ROOT, 'schemas', 'bot-api', '10.3.json'), 'utf8'),
) as BotApiSchema

/** The same schema as if read from another page at another time. */
function readFrom(schema: BotApiSchema, url: string, fetchedAt: string): BotApiSchema {
  const relink = (link: string): string => `${url}${link.slice(link.indexOf('#'))}`
  return {
    ...schema,
    source: { url, fetchedAt },
    methods: schema.methods.map((method) => ({
      ...method,
      documentationLink: relink(method.documentationLink),
    })),
    objects: schema.objects.map((object) => ({
      ...object,
      documentationLink: relink(object.documentationLink),
    })),
  }
}

const stable = readFrom(committed, STABLE_URL, '2026-10-28T09:00:00.000Z')

const NEW_METHOD: Method = {
  name: 'sendSomethingNew',
  group: 'Available methods',
  description: 'Sends something new.',
  documentationLink: `${STABLE_URL}#sendsomethingnew`,
  parameters: [],
  returns: { kind: 'boolean' },
  hasFileParameter: false,
}

describe('versions', () => {
  it('orders by number rather than by text', () => {
    expect(compareVersions('10.10', '10.9')).toBeGreaterThan(0)
    expect(compareVersions('10.3', '10.3')).toBe(0)
    expect(compareVersions('9.6', '10.0')).toBeLessThan(0)
    expect(compareVersions('10.3.1', '10.3')).toBeGreaterThan(0)
  })

  it('finds the newest by number', () => {
    expect(latestVersion(['10.2', '10.10', '10.9'])).toBe('10.10')
    expect(latestVersion([])).toBeUndefined()
  })

  it('refuses what is not a version', () => {
    expect(() => compareVersions('unknown', '10.3')).toThrow(DriftError)
  })
})

describe('the same content', () => {
  it('is the same wherever and whenever it was read', () => {
    expect(sameContent(committed, stable)).toBe(true)
    expect(sameContent(stable, readFrom(committed, PREVIEW_URL, '2026-10-29T00:00:00.000Z'))).toBe(
      true,
    )
  })

  it('is the same whatever order its keys were written in', () => {
    const [first, ...rest] = stable.methods
    if (first === undefined) throw new Error('the snapshot has no methods')
    const { name, ...others } = first
    const reordered = Object.fromEntries(
      Object.entries({ ...stable, methods: [{ ...others, name }, ...rest] }).reverse(),
    ) as unknown as BotApiSchema

    expect(Object.keys(reordered)[0]).not.toBe(Object.keys(stable)[0])
    expect(sameContent(stable, reordered)).toBe(true)
  })

  it('differs when a description does', () => {
    const [first, ...rest] = stable.methods
    if (first === undefined) throw new Error('the snapshot has no methods')
    const edited = { ...stable, methods: [{ ...first, description: 'Changed.' }, ...rest] }

    expect(sameContent(stable, edited)).toBe(false)
  })
})

describe('the stable page against the committed snapshot', () => {
  it('is unchanged when it says the same', () => {
    expect(classify(committed, stable)).toEqual({ kind: 'unchanged', version: '10.3' })
  })

  it('is a re-read when it changed under the same version', () => {
    const [first, ...rest] = stable.methods
    if (first === undefined) throw new Error('the snapshot has no methods')
    const edited = { ...stable, methods: [{ ...first, description: 'Changed.' }, ...rest] }

    const drift = classify(committed, edited)

    expect(drift.kind).toBe('resync')
    if (drift.kind !== 'resync') return
    const proposed = proposal(drift, edited)
    expect(proposed.branch).toBe('schema/bot-api-10.3')
    expect(proposed.title).toBe('chore: re-read the Bot API 10.3 schema')
    expect(proposed.body).toContain('without a new version number')
    expect(proposed.body).toContain('Release: patch: documentation text only.')
  })

  it('is a new version when the page states a newer one', () => {
    const next = { ...stable, version: '10.4', methods: [...stable.methods, NEW_METHOD] }

    const drift = classify(committed, next)

    expect(drift.kind).toBe('new-version')
    if (drift.kind !== 'new-version') return
    expect(drift.diff.methodsAdded).toEqual(['sendSomethingNew'])
    const proposed = proposal(drift, next)
    expect(proposed.branch).toBe('schema/bot-api-10.4')
    expect(proposed.title).toBe('chore: update the Bot API schema to 10.4')
    expect(proposed.body).toContain(
      'Telegram published Bot API 10.4; the committed schema is 10.3.',
    )
    expect(proposed.body).toContain('sendSomethingNew')
    expect(proposed.body).toContain('Release: minor: additions only.')
  })

  it('calls for a major release when something existing is removed', () => {
    const next = { ...stable, version: '10.4', methods: stable.methods.slice(1) }

    const drift = classify(committed, next)

    if (drift.kind === 'unchanged') throw new Error('a removal was not seen')
    expect(proposal(drift, next).body).toMatch(/Release: major: 1 change\(s\) break compilation/)
  })

  it('refuses a page older than what is committed', () => {
    expect(() => classify(committed, { ...stable, version: '10.2' })).toThrow(DriftError)
  })
})

describe('the staging copy', () => {
  it('is not reported when it says what the stable page says', () => {
    expect(
      previewReport(stable, readFrom(committed, PREVIEW_URL, '2026-10-28T09:00:01.000Z')),
    ).toBeUndefined()
  })

  it('is reported, against the stable page, when it says more', () => {
    const preview = readFrom(
      { ...committed, methods: [...committed.methods, NEW_METHOD] },
      PREVIEW_URL,
      '2026-10-28T09:00:01.000Z',
    )

    const report = previewReport(stable, preview)

    expect(report).toContain(`| Stable, ${STABLE_URL} | 10.3 |`)
    expect(report).toContain(`| Staging, ${PREVIEW_URL} | 10.3 |`)
    expect(report).toContain('sendSomethingNew')
    expect(report).toContain('Nothing on it is generated')
  })
})

describe('dates', () => {
  it('reads the changelog anchor as a date', () => {
    expect(describeDate('august-24-2026')).toBe('August 24, 2026')
    expect(describeDate(null)).toBe('not stated')
  })
})
