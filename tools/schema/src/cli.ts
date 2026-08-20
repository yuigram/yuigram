/**
 * Schema tooling entry point.
 *
 * ```
 * fetch       download the documentation, commit a snapshot, emit sources
 * regenerate  the same, plus a report of what changed about the surface
 * emit        re-emit from the committed schema, without the network
 * ```
 *
 * `regenerate` is what the scheduled workflow runs. It never publishes: it
 * updates the committed snapshot and reports what changed, leaving a human to
 * decide whether a new capability deserves a first-class abstraction or only a
 * generated type.
 */

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { diffSchemas, formatDiff } from './bot-api/diff.js'
import type { BotApiSchema } from './bot-api/ir.js'
import { parseBotApi } from './bot-api/parse.js'
import { describeServiceDetection, emitAll, writeGenerated } from './emit/index.js'

/** Documentation sources, most current first. */
const SOURCES: readonly string[] = [
  // corefork publishes ahead of the stable page, which buys lead time on
  // unreleased features at no cost.
  'https://corefork.telegram.org/bots/api',
  'https://core.telegram.org/bots/api',
]

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const SCHEMA_DIR = join(ROOT, 'schemas', 'bot-api')
const GENERATED_DIR = join(ROOT, 'packages', 'bot-api', 'src', 'generated')

/** Largest a single generated file may become, in bytes. */
const FILE_BUDGET = 300_000

/** Fetch the documentation, falling back through the source list. */
async function fetchDocumentation(): Promise<{ html: string; url: string }> {
  const failures: string[] = []

  for (const url of SOURCES) {
    try {
      const response = await fetch(url, { headers: { 'user-agent': 'yuigram-schema' } })
      if (!response.ok) {
        failures.push(`${url}: HTTP ${response.status}`)
        continue
      }
      return { html: await response.text(), url }
    } catch (error) {
      failures.push(`${url}: ${String(error)}`)
    }
  }

  throw new Error(`could not fetch the Bot API documentation:\n  ${failures.join('\n  ')}`)
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

/** Fetch, parse and write the snapshot. Returns the schema and any drift report. */
async function run(mode: 'fetch' | 'regenerate'): Promise<void> {
  const { html, url } = await fetchDocumentation()
  const schema = parseBotApi(html, url)

  process.stdout.write(`Bot API ${schema.version} from ${url}\n`)
  process.stdout.write(`  ${schema.methods.length} methods, ${schema.objects.length} objects\n`)

  const previous = await readSnapshot(schema.version)

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

  if (mode === 'regenerate') {
    if (previous === undefined) {
      process.stdout.write(`\nNew schema version ${schema.version}.\n`)
      return
    }

    const diff = diffSchemas(previous, schema)
    process.stdout.write(`\n${formatDiff(diff)}\n`)
  }
}

/**
 * Re-emit from the committed schema, without touching the network.
 *
 * This is what CI runs to prove the generated sources still match the schema
 * they claim to come from. A hand edit or a stale regeneration then fails on a
 * pull request rather than reaching a release.
 */
async function emitOffline(): Promise<void> {
  const versions = (await readdir(SCHEMA_DIR))
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.replace(/\.json$/, ''))
    .sort()

  const latest = versions.at(-1)

  if (latest === undefined) {
    process.stderr.write(`no committed schema found in ${SCHEMA_DIR}\n`)
    process.exitCode = 1
    return
  }

  const schema = await readSnapshot(latest)
  if (schema === undefined) {
    process.stderr.write(`could not read the committed schema for ${latest}\n`)
    process.exitCode = 1
    return
  }

  const written = await writeGenerated(GENERATED_DIR, emitAll(schema))
  process.stdout.write(`Re-emitted ${written.length} files from Bot API ${schema.version}\n`)
}

const mode = process.argv[2]

switch (mode) {
  case 'fetch':
  case 'regenerate':
    await run(mode)
    break
  case 'emit':
    await emitOffline()
    break
  default:
    process.stderr.write('usage: cli.ts <fetch|regenerate|emit>\n')
    process.exitCode = 1
}
