// SPDX-License-Identifier: MIT

/**
 * What a fetch of the documentation means.
 *
 * Telegram publishes the Bot API documentation twice. `core.telegram.org` is
 * the stable page: it describes what the Bot API serves, and it is what the
 * surface is generated from. `corefork.telegram.org` is Telegram's staging
 * copy of the same page. It carries changes before they are announced — under
 * the version number already released, with no entry in the changelog — so
 * nothing on it is generated. A difference between the two is reported as a
 * preview, for a person to read ahead of the release.
 *
 * A change is decided by content. The fetch time and the host the links point
 * at say where a schema was read, not what it says; comparing them would
 * report a change on every run, and a report that always fires stops being
 * read.
 */

import { diffSchemas, formatDiff, type SchemaDiff } from './diff.js'
import type { BotApiSchema } from './ir.js'

/** The stable documentation: what the Bot API serves. */
export const STABLE_URL = 'https://core.telegram.org/bots/api'

/** The staging copy, which carries changes before they are announced. */
export const PREVIEW_URL = 'https://corefork.telegram.org/bots/api'

/** A schema that cannot be judged against the committed ones. */
export class DriftError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DriftError'
  }
}

/** Read `10.3` as `[10, 3]`, refusing anything else. */
function versionParts(version: string): readonly number[] {
  if (!/^\d+\.\d+(?:\.\d+)?$/.test(version)) {
    throw new DriftError(`'${version}' is not a Bot API version`)
  }
  return version.split('.').map(Number)
}

/** Order two Bot API versions by number: `10.10` comes after `10.9`. */
export function compareVersions(a: string, b: string): number {
  const left = versionParts(a)
  const right = versionParts(b)
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}

/** The newest of several versions, or `undefined` for none. */
export function latestVersion(versions: readonly string[]): string | undefined {
  return [...versions].sort(compareVersions).at(-1)
}

/** A link reduced to its anchor, which is what names the section. */
function anchor(link: string): string {
  const at = link.indexOf('#')
  return at === -1 ? link : link.slice(at)
}

/** JSON with every object's keys in order, so equal content serializes equally. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item !== null && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : item,
  )
}

/** What a schema says, without where or when it was read. */
function content(schema: BotApiSchema): string {
  const { source: _source, ...rest } = schema
  return canonical({
    ...rest,
    methods: schema.methods.map((method) => ({
      ...method,
      documentationLink: anchor(method.documentationLink),
    })),
    objects: schema.objects.map((object) => ({
      ...object,
      documentationLink: anchor(object.documentationLink),
    })),
  })
}

/** Whether two schemas say the same thing, wherever and whenever each was read. */
export function sameContent(a: BotApiSchema, b: BotApiSchema): boolean {
  return content(a) === content(b)
}

/** What the stable page means against the newest committed snapshot. */
export type Drift =
  | { readonly kind: 'unchanged'; readonly version: string }
  | {
      readonly kind: 'new-version'
      readonly from: string
      readonly to: string
      readonly diff: SchemaDiff
    }
  /** The page changed and its version number did not. */
  | { readonly kind: 'resync'; readonly version: string; readonly diff: SchemaDiff }

/**
 * Judge the stable page against the newest committed snapshot.
 *
 * A page stating an older version than the one committed is refused: either a
 * snapshot was committed from somewhere other than the stable page, or the page
 * is not what it appears to be, and either needs a person.
 */
export function classify(committed: BotApiSchema, stable: BotApiSchema): Drift {
  const order = compareVersions(stable.version, committed.version)

  if (order < 0) {
    throw new DriftError(
      `the stable page states Bot API ${stable.version}, older than the committed ` +
        `${committed.version}`,
    )
  }

  if (order > 0) {
    return {
      kind: 'new-version',
      from: committed.version,
      to: stable.version,
      diff: diffSchemas(committed, stable),
    }
  }

  return sameContent(committed, stable)
    ? { kind: 'unchanged', version: stable.version }
    : { kind: 'resync', version: stable.version, diff: diffSchemas(committed, stable) }
}

/** `august-24-2026` as `August 24, 2026`. */
export function describeDate(releasedAt: string | null): string {
  const match = /^([a-z]+)-(\d{1,2})-(\d{4})$/.exec(releasedAt ?? '')
  if (match === null) return 'not stated'
  const [, month = '', day, year] = match
  return `${month.charAt(0).toUpperCase()}${month.slice(1)} ${day}, ${year}`
}

/** Whether a diff changes nothing a program compiles against. */
function proseOnly(diff: SchemaDiff): boolean {
  return (
    diff.methodsAdded.length === 0 &&
    diff.methodsRemoved.length === 0 &&
    diff.methodsChanged.length === 0 &&
    diff.objectsAdded.length === 0 &&
    diff.objectsRemoved.length === 0 &&
    diff.objectsChanged.length === 0
  )
}

/** The release a diff calls for (docs/codegen.md §7). */
function releaseKind(diff: SchemaDiff): string {
  if (diff.breaking.length > 0) {
    return `major: ${diff.breaking.length} change(s) break compilation for an existing user`
  }
  return proseOnly(diff) ? 'patch: documentation text only' : 'minor: additions only'
}

/** The pull request a change of the stable page becomes. */
export interface Proposal {
  readonly branch: string
  readonly title: string
  readonly body: string
}

/** Describe a change of the stable page for review. */
export function proposal(
  drift: Exclude<Drift, { readonly kind: 'unchanged' }>,
  stable: BotApiSchema,
): Proposal {
  const version = drift.kind === 'new-version' ? drift.to : drift.version
  const opening =
    drift.kind === 'new-version'
      ? `Telegram published Bot API ${drift.to}; the committed schema is ${drift.from}.`
      : `The stable documentation of Bot API ${drift.version} changed without a new version ` +
        'number. The committed snapshot is re-read from it.'

  const body = [
    opening,
    '',
    `Read from ${STABLE_URL}; the latest changelog entry is dated ` +
      `${describeDate(stable.releasedAt)}.`,
    '',
    '```text',
    formatDiff(drift.diff),
    '```',
    '',
    `Release: ${releaseKind(drift.diff)}.`,
    '',
    `Regenerated: \`schemas/bot-api/${version}.json\` and \`packages/bot-api/src/generated/\`.`,
    '',
    'Review before merging. A new capability may deserve a first-class abstraction rather than ' +
      'only a generated type, and the judgements the generator cannot make are listed in ' +
      '`docs/codegen.md` §2.6.',
  ]

  return {
    branch: `schema/bot-api-${version}`,
    title:
      drift.kind === 'new-version'
        ? `chore: update the Bot API schema to ${version}`
        : `chore: re-read the Bot API ${version} schema`,
    body: `${body.join('\n')}\n`,
  }
}

/** Describe how the staging copy differs from the stable page, or `undefined` if it does not. */
export function previewReport(stable: BotApiSchema, preview: BotApiSchema): string | undefined {
  if (sameContent(stable, preview)) return undefined

  const lines = [
    'The staging copy of the Bot API documentation differs from the stable page. Nothing on it ' +
      'is generated: it is a look ahead at what a coming release may contain, and it can change ' +
      'or disappear before then.',
    '',
    '| Page | Version | Latest changelog entry |',
    '|---|---|---|',
    `| Stable, ${STABLE_URL} | ${stable.version} | ${describeDate(stable.releasedAt)} |`,
    `| Staging, ${PREVIEW_URL} | ${preview.version} | ${describeDate(preview.releasedAt)} |`,
    '',
    'From the stable page to the staging copy:',
    '',
    '```text',
    formatDiff(diffSchemas(stable, preview)),
    '```',
    '',
    'When the stable page publishes these changes, the drift job opens a pull request for them. ' +
      'This issue is kept up to date by that job and closes when the two pages agree.',
  ]

  return `${lines.join('\n')}\n`
}
