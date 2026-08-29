/**
 * The TL pipeline's entry point.
 *
 * ```
 * fetch        download both documents, parse, write .tl and IR snapshots
 * emit         IR -> generated TypeScript, offline
 * crosscheck   compare the IR against Telegram's own JSON rendering
 * ```
 *
 * `fetch` is the only command that touches the network, and it is run by a
 * person. `emit` reads only what is committed, so a build never depends on
 * Telegram being reachable.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { crosscheck, describeCrosscheck, fetchReferenceJson } from './crosscheck.js'
import { emitAll } from './emit/index.js'
import { download, extractLayer, extractSchemaText, SOURCES } from './fetch.js'
import type { TlSchema } from './ir.js'
import { parseSchema } from './parse.js'
import { serializeSchema } from './serialize.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const SCHEMA_DIR = join(ROOT, 'schemas', 'tl')
const OUTPUT_DIR = join(ROOT, 'packages', 'mtproto', 'src', 'generated')

/** Read the committed snapshots and parse them. */
export function loadSchemas(): { mtproto: TlSchema; api: TlSchema; layer: number } {
  const layer = readLayer()
  const mtprotoText = readFileSync(join(SCHEMA_DIR, 'mtproto.tl'), 'utf8')
  const apiText = readFileSync(join(SCHEMA_DIR, `api.${layer}.tl`), 'utf8')

  return {
    mtproto: parseSchema(mtprotoText, { document: 'mtproto.tl', table: 'mtproto' }),
    api: parseSchema(apiText, { document: `api.${layer}.tl`, table: 'api', layer }),
    layer,
  }
}

/**
 * The pinned layer, read from the file that records it.
 *
 * A single source, so nothing in the repository can disagree about which layer
 * the generated code speaks.
 */
export function readLayer(): number {
  const pin = JSON.parse(readFileSync(join(SCHEMA_DIR, 'layer.json'), 'utf8')) as { layer: number }
  if (!Number.isInteger(pin.layer)) throw new Error('schemas/tl/layer.json has no integer layer')

  return pin.layer
}

async function commandFetch(): Promise<void> {
  mkdirSync(SCHEMA_DIR, { recursive: true })

  const apiHtml = await download(SOURCES.api.url)
  const layer = extractLayer(apiHtml)
  const apiText = extractSchemaText(apiHtml, SOURCES.api.url)

  const mtprotoHtml = await download(SOURCES.mtproto.url)
  const mtprotoText = extractSchemaText(mtprotoHtml, SOURCES.mtproto.url)

  // Parsed before anything is written: a document that does not parse must not
  // land in the repository at all.
  const mtproto = parseSchema(mtprotoText, { document: 'mtproto.tl', table: 'mtproto' })
  const api = parseSchema(apiText, { document: `api.${layer}.tl`, table: 'api', layer })

  writeFileSync(join(SCHEMA_DIR, 'mtproto.tl'), mtprotoText)
  writeFileSync(join(SCHEMA_DIR, `api.${layer}.tl`), apiText)
  writeFileSync(join(SCHEMA_DIR, 'mtproto.json'), serializeSchema(mtproto))
  writeFileSync(join(SCHEMA_DIR, `api.${layer}.json`), serializeSchema(api))
  writeFileSync(join(SCHEMA_DIR, 'layer.json'), `${JSON.stringify({ layer }, null, 2)}\n`)

  process.stdout.write(
    `fetched layer ${layer}: ` +
      `${api.constructors.length} constructors and ${api.methods.length} methods in api, ` +
      `${mtproto.constructors.length} and ${mtproto.methods.length} in mtproto\n`,
  )
}

function commandEmit(): void {
  const { mtproto, api, layer } = loadSchemas()
  const files = emitAll({ mtproto, api, layer })

  for (const file of files) {
    const target = join(OUTPUT_DIR, file.path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, file.text)
  }

  process.stdout.write(`emitted ${files.length} files from TL layer ${layer}\n`)
}

async function commandCrosscheck(): Promise<void> {
  const { mtproto, api } = loadSchemas()
  const results = [
    crosscheck(mtproto, await fetchReferenceJson('mtproto')),
    crosscheck(api, await fetchReferenceJson('api')),
  ]

  let failed = false
  for (const result of results) {
    process.stdout.write(describeCrosscheck(result))
    if (!result.agrees) failed = true
  }

  if (failed) process.exitCode = 1
}

const COMMANDS: Record<string, () => void | Promise<void>> = {
  fetch: commandFetch,
  emit: commandEmit,
  crosscheck: commandCrosscheck,
}

const name = process.argv[2] ?? ''
const command = COMMANDS[name]

if (command === undefined) {
  process.stderr.write(`usage: cli <${Object.keys(COMMANDS).join('|')}>\n`)
  process.exitCode = 1
} else {
  await command()
}
