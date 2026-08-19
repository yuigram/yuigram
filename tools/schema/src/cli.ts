/**
 * Schema tooling entry point.
 *
 * ```
 * pnpm --filter @yuigram/schema fetch        download and commit a snapshot
 * pnpm --filter @yuigram/schema regenerate   re-parse and report any drift
 * ```
 *
 * `regenerate` is what the scheduled workflow runs. It never publishes: it
 * updates the committed snapshot and reports what changed, leaving a human to
 * decide whether a new capability deserves a first-class abstraction or only a
 * generated type.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { diffSchemas, formatDiff } from './bot-api/diff.js'
import type { BotApiSchema } from './bot-api/ir.js'
import { parseBotApi } from './bot-api/parse.js'

/** Documentation sources, most current first. */
const SOURCES: readonly string[] = [
  // corefork publishes ahead of the stable page, which buys lead time on
  // unreleased features at no cost.
  'https://corefork.telegram.org/bots/api',
  'https://core.telegram.org/bots/api',
]

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const SCHEMA_DIR = join(ROOT, 'schemas', 'bot-api')

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

  if (mode === 'regenerate') {
    if (previous === undefined) {
      process.stdout.write(`\nNew schema version ${schema.version}.\n`)
      return
    }

    const diff = diffSchemas(previous, schema)
    process.stdout.write(`\n${formatDiff(diff)}\n`)
  }
}

const mode = process.argv[2]

if (mode !== 'fetch' && mode !== 'regenerate') {
  process.stderr.write('usage: cli.ts <fetch|regenerate>\n')
  process.exitCode = 1
} else {
  await run(mode)
}
