// SPDX-License-Identifier: MIT

/**
 * Schema tooling entry point.
 *
 * ```
 * fetch       download the stable documentation, write its snapshot, emit sources
 * regenerate  the same, but only when what the page says changed, with reports
 * emit        re-emit from the newest committed snapshot, without the network
 * ```
 *
 * `regenerate` is what the scheduled workflow runs, as
 * `regenerate --report-dir <dir>`. It never publishes: it updates the committed
 * snapshot when the stable page changed, and writes for the workflow what to
 * propose and what the staging copy says ahead of it, leaving a person to
 * decide whether a new capability deserves a first-class abstraction or only a
 * generated type.
 */

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { formatDiff } from './bot-api/diff.js'
import {
  classify,
  type Drift,
  DriftError,
  latestVersion,
  PREVIEW_URL,
  previewReport,
  proposal,
  STABLE_URL,
} from './bot-api/drift.js'
import type { BotApiSchema } from './bot-api/ir.js'
import { parseBotApi } from './bot-api/parse.js'
import { describeServiceDetection, emitAll, writeGenerated } from './emit/index.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const SCHEMA_DIR = join(ROOT, 'schemas', 'bot-api')
const GENERATED_DIR = join(ROOT, 'packages', 'bot-api', 'src', 'generated')

/** Largest a single generated file may become, in bytes. */
const FILE_BUDGET = 300_000

/** Download one documentation page. */
async function fetchPage(url: string): Promise<string> {
  const response = await fetch(url, { headers: { 'user-agent': 'yuigram-schema' } })
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  return await response.text()
}

/** Download and parse one documentation page. */
async function readPage(url: string): Promise<BotApiSchema> {
  return parseBotApi(await fetchPage(url), url)
}

/** Serialize a schema deterministically, so drift detection stays meaningful. */
function serialize(schema: BotApiSchema): string {
  return `${JSON.stringify(schema, null, 2)}\n`
}

/** Read the committed snapshot for a version, if one exists. */
async function readSnapshot(version: string): Promise<BotApiSchema | undefined> {
  try {
    return JSON.parse(await readFile(join(SCHEMA_DIR, `${version}.json`), 'utf8')) as BotApiSchema
  } catch {
    return undefined
  }
}

/** The newest committed snapshot, by version number rather than by name. */
async function readLatestSnapshot(): Promise<BotApiSchema | undefined> {
  const versions = (await readdir(SCHEMA_DIR))
    .filter((name) => /^\d+\.\d+(?:\.\d+)?\.json$/.test(name))
    .map((name) => name.replace(/\.json$/, ''))
  const latest = latestVersion(versions)
  return latest === undefined ? undefined : await readSnapshot(latest)
}

/** Write a schema's snapshot and the sources generated from it. */
async function writeSchema(schema: BotApiSchema): Promise<void> {
  await mkdir(SCHEMA_DIR, { recursive: true })
  await writeFile(join(SCHEMA_DIR, `${schema.version}.json`), serialize(schema), 'utf8')

  const written = await writeGenerated(GENERATED_DIR, emitAll(schema))
  const total = written.reduce((sum, file) => sum + file.bytes, 0)

  process.stdout.write(`\nGenerated ${written.length} files, ${(total / 1024).toFixed(0)} KB\n`)

  // Surfaced on every run: if a Telegram release adds service messages the
  // description rule does not catch, the counts move and a reviewer sees it.
  process.stdout.write(`  ${describeServiceDetection(schema)}\n`)

  for (const file of [...written].sort((a, b) => b.bytes - a.bytes).slice(0, 8)) {
    process.stdout.write(`  ${(file.bytes / 1024).toFixed(0).padStart(5)} KB  ${file.path}\n`)
  }

  const oversized = written.filter((file) => file.bytes > FILE_BUDGET)

  if (oversized.length > 0) {
    // A large declaration file is a cost paid by every consumer's editor on
    // every keystroke, so exceeding the budget fails rather than warns.
    process.stderr.write(
      `\n${oversized.length} file(s) over the ${FILE_BUDGET / 1024} KB budget:\n`,
    )
    for (const file of oversized) {
      process.stderr.write(`  ${(file.bytes / 1024).toFixed(0)} KB  ${file.path}\n`)
    }
    process.exitCode = 1
  }
}

/** Download the stable page and write it, whether or not it changed. */
async function commandFetch(): Promise<void> {
  const stable = await readPage(STABLE_URL)
  process.stdout.write(`Bot API ${stable.version} from ${STABLE_URL}\n`)
  process.stdout.write(`  ${stable.methods.length} methods, ${stable.objects.length} objects\n`)
  await writeSchema(stable)
}

/** What became of the staging copy on this run. */
type Preview =
  | { readonly state: 'same' }
  | { readonly state: 'differs'; readonly report: string }
  | { readonly state: 'unavailable'; readonly reason: string }

/**
 * Read the staging copy and compare it with the stable page.
 *
 * Its absence is reported rather than fatal: it is a look ahead, and the
 * stable page alone decides what is generated.
 */
async function readPreview(stable: BotApiSchema): Promise<Preview> {
  try {
    const report = previewReport(stable, await readPage(PREVIEW_URL))
    return report === undefined ? { state: 'same' } : { state: 'differs', report }
  } catch (error) {
    return { state: 'unavailable', reason: error instanceof Error ? error.message : String(error) }
  }
}

/** One paragraph for the run's summary. */
function describeRun(drift: Drift, preview: Preview): string {
  const stable =
    drift.kind === 'unchanged'
      ? `The stable page states Bot API ${drift.version}, as committed. Nothing was regenerated.`
      : drift.kind === 'new-version'
        ? `The stable page states Bot API ${drift.to}; ${drift.from} is committed. Regenerated.`
        : `The stable page of Bot API ${drift.version} changed without a new version number. ` +
          'Regenerated.'

  const staging =
    preview.state === 'same'
      ? 'The staging copy agrees with it.'
      : preview.state === 'differs'
        ? 'The staging copy differs from it; see the preview report.'
        : `The staging copy could not be read: ${preview.reason}`

  return `${stable} ${staging}\n`
}

/**
 * Regenerate when the stable page changed, and report.
 *
 * With `--report-dir`, writes there:
 *
 * - `summary.md`, always;
 * - `proposal.json` (`branch`, `title`) and `proposal.md` (the pull request
 *   body), when the stable page changed;
 * - `preview.json` (`state`: `same`, `differs` or `unavailable`) and, when the
 *   staging copy differs, `preview.md`.
 */
async function commandRegenerate(reportDir: string | undefined): Promise<void> {
  const stable = await readPage(STABLE_URL)
  process.stdout.write(`Bot API ${stable.version} from ${STABLE_URL}\n`)
  process.stdout.write(`  ${stable.methods.length} methods, ${stable.objects.length} objects\n`)

  const committed = await readLatestSnapshot()
  if (committed === undefined) {
    throw new DriftError(`no committed snapshot in ${SCHEMA_DIR} to compare with; run fetch`)
  }

  const drift = classify(committed, stable)
  const preview = await readPreview(stable)

  if (drift.kind !== 'unchanged') {
    process.stdout.write(`\n${formatDiff(drift.diff)}\n`)
    await writeSchema(stable)
  }

  const summary = describeRun(drift, preview)
  process.stdout.write(`\n${summary}`)

  if (reportDir === undefined) return

  await mkdir(reportDir, { recursive: true })
  await writeFile(join(reportDir, 'summary.md'), summary, 'utf8')
  await writeFile(
    join(reportDir, 'preview.json'),
    `${JSON.stringify({ state: preview.state })}\n`,
    'utf8',
  )
  if (preview.state === 'differs') {
    await writeFile(join(reportDir, 'preview.md'), preview.report, 'utf8')
  }

  if (drift.kind !== 'unchanged') {
    const proposed = proposal(drift, stable)
    await writeFile(
      join(reportDir, 'proposal.json'),
      `${JSON.stringify({ branch: proposed.branch, title: proposed.title })}\n`,
      'utf8',
    )
    await writeFile(join(reportDir, 'proposal.md'), proposed.body, 'utf8')
  }
}

/**
 * Re-emit from the newest committed snapshot, without touching the network.
 *
 * This is what CI runs to prove the generated sources still match the schema
 * they claim to come from. A hand edit or a stale regeneration then fails on a
 * pull request rather than reaching a release.
 */
async function emitOffline(): Promise<void> {
  const schema = await readLatestSnapshot()

  if (schema === undefined) {
    process.stderr.write(`no committed schema found in ${SCHEMA_DIR}\n`)
    process.exitCode = 1
    return
  }

  const written = await writeGenerated(GENERATED_DIR, emitAll(schema))
  process.stdout.write(`Re-emitted ${written.length} files from Bot API ${schema.version}\n`)
}

/** The value after a flag, if the flag is given. */
function option(args: readonly string[], name: string): string | undefined {
  const at = args.indexOf(name)
  if (at === -1) return undefined
  const value = args[at + 1]
  if (value === undefined || value.startsWith('--')) throw new Error(`${name} needs a value`)
  return value
}

const mode = process.argv[2]
const args = process.argv.slice(3)

switch (mode) {
  case 'fetch':
    await commandFetch()
    break
  case 'regenerate':
    await commandRegenerate(option(args, '--report-dir'))
    break
  case 'emit':
    await emitOffline()
    break
  default:
    process.stderr.write('usage: cli.ts <fetch|regenerate [--report-dir <dir>]|emit>\n')
    process.exitCode = 1
}
