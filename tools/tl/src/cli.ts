/**
 * The TL pipeline's entry point.
 *
 * ```
 * fetch        download both documents, parse, write .tl and IR snapshots
 * errors       read Telegram's error database, write errors.json
 * emit         IR and errors.json -> generated TypeScript, offline
 * crosscheck   compare the IR against Telegram's own JSON rendering
 * ```
 *
 * `fetch`, `errors` and `crosscheck` touch the network, and are run by a
 * person. `emit` reads only what is committed, so a build never depends on
 * Telegram being reachable.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { crosscheck, describeCrosscheck, fetchReferenceJson } from './crosscheck.js'
import { emitAll } from './emit/index.js'
import {
  ERROR_DATABASE,
  type ErrorSnapshot,
  emitErrors,
  readErrorDatabase,
  serializeErrorSnapshot,
} from './errors.js'
import { download, extractLayer, extractSchemaText, SOURCES } from './fetch.js'
import type { TlSchema } from './ir.js'
import { parseSchema } from './parse.js'
import { serializeSchema } from './serialize.js'
import {
  checkDigest,
  layerFromVersionHeader,
  schemaFromTdlib,
  TDLIB,
  tdlibNotice,
  tdlibUrl,
} from './tdlib.js'

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

/** Where a committed schema document came from, as `sources.json` records it. */
type SourceRecord = Readonly<Record<string, unknown>>

/** What a fetch of the API schema produced. */
interface FetchedApi {
  readonly text: string
  readonly layer: number
  readonly source: SourceRecord
  /** Files written beside the schema, by name. */
  readonly beside: Readonly<Record<string, string>>
}

/**
 * Read the API schema from whichever source was asked for.
 *
 * The documentation page by default. `--from-tdlib` takes it from TDLib at the
 * pinned revision instead, which is where a layer appears before the page
 * describes it: a capability that exists only in the newer layer cannot be
 * implemented from the older document.
 */
async function fetchApi(fromTdlib: boolean, retrieved: string): Promise<FetchedApi> {
  const html = await download(SOURCES.api.url)
  const documentation = extractSchemaText(html, SOURCES.api.url)

  if (!fromTdlib) {
    return {
      text: documentation,
      layer: extractLayer(html),
      source: { from: SOURCES.api.url, retrieved },
      beside: {},
    }
  }

  const schema = await download(tdlibUrl(TDLIB.schema.path))
  checkDigest(schema, TDLIB.schema.sha256, TDLIB.schema.path)
  const version = await download(tdlibUrl(TDLIB.version.path))
  checkDigest(version, TDLIB.version.sha256, TDLIB.version.path)
  const licence = await download(tdlibUrl(TDLIB.licenceText.path))
  checkDigest(licence, TDLIB.licenceText.sha256, TDLIB.licenceText.path)

  const layer = layerFromVersionHeader(version)
  const imported = schemaFromTdlib(schema, documentation)

  return {
    text: imported.text,
    layer,
    source: {
      retrieved,
      schemaProper: {
        from: 'TDLib',
        repository: TDLIB.repository,
        revision: TDLIB.revision,
        path: TDLIB.schema.path,
        sha256: TDLIB.schema.sha256,
        licence: TDLIB.licence,
        notice: 'TDLIB-LICENSE.txt',
        layer: { path: TDLIB.version.path, sha256: TDLIB.version.sha256, states: layer },
      },
      languageOwned: { from: SOURCES.api.url, definitions: imported.languageOwned },
      setAside: imported.setAside.map((one) => ({
        definition: one.text,
        kind: one.kind,
        reason: one.reason,
      })),
    },
    beside: { 'TDLIB-LICENSE.txt': tdlibNotice(version, licence) },
  }
}

/** Record where each document written now came from, keeping what others record. */
function recordSources(entries: Readonly<Record<string, SourceRecord>>): void {
  const path = join(SCHEMA_DIR, 'sources.json')
  const current = existsSync(path)
    ? (JSON.parse(readFileSync(path, 'utf8')) as Record<string, SourceRecord>)
    : {}
  const merged: Record<string, SourceRecord> = { ...current, ...entries }
  const ordered = Object.fromEntries(
    Object.keys(merged)
      .sort()
      .map((key) => [key, merged[key]]),
  )
  writeFileSync(path, `${JSON.stringify(ordered, null, 2)}\n`)
}

async function commandFetch(fromTdlib: boolean): Promise<void> {
  mkdirSync(SCHEMA_DIR, { recursive: true })

  const retrieved = new Date().toISOString().slice(0, 10)
  const fetched = await fetchApi(fromTdlib, retrieved)
  const { text: apiText, layer } = fetched

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
  for (const [name, text] of Object.entries(fetched.beside)) {
    writeFileSync(join(SCHEMA_DIR, name), text)
  }
  recordSources({
    [`api.${layer}.tl`]: fetched.source,
    'mtproto.tl': { from: SOURCES.mtproto.url, retrieved },
  })

  process.stdout.write(
    `fetched layer ${layer}: ` +
      `${api.constructors.length} constructors and ${api.methods.length} methods in api, ` +
      `${mtproto.constructors.length} and ${mtproto.methods.length} in mtproto\n`,
  )
}

function commandEmit(): void {
  const { mtproto, api, layer } = loadSchemas()
  const errors = readErrorSnapshot()
  const files = [
    ...emitAll({ mtproto, api, layer }),
    ...(errors === undefined ? [] : [emitErrors(errors)]),
  ]

  for (const file of files) {
    const target = join(OUTPUT_DIR, file.path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, file.text)
  }

  process.stdout.write(`emitted ${files.length} files from TL layer ${layer}\n`)
}

/** The committed error snapshot, where one has been fetched. */
export function readErrorSnapshot(): ErrorSnapshot | undefined {
  const path = join(SCHEMA_DIR, 'errors.json')
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as ErrorSnapshot) : undefined
}

/**
 * Read Telegram's error database and keep what `readErrorDatabase` keeps.
 *
 * One document. It is refused as a whole if its shape is not the one this
 * reads, so nothing is written from a layout that changed underneath.
 */
async function commandErrors(): Promise<void> {
  const { layer } = loadSchemas()
  const response = await fetch(ERROR_DATABASE, { headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`${ERROR_DATABASE} responded ${response.status}`)
  const database = readErrorDatabase(await response.text(), ERROR_DATABASE)

  const snapshot: ErrorSnapshot = {
    provenance: {
      source: ERROR_DATABASE,
      retrieved: new Date().toISOString().slice(0, 10),
      databaseLayer: database.layer,
      schemaLayer: layer,
      recorded:
        'Error codes, names and the methods listed for each. The descriptions are not recorded. ' +
        'Not exhaustive: Telegram may send a name the database does not list.',
    },
    errors: database.errors,
  }

  writeFileSync(join(SCHEMA_DIR, 'errors.json'), serializeErrorSnapshot(snapshot))
  process.stdout.write(
    `read ${Object.keys(database.errors).length} error names from the database at layer ` +
      `${database.layer}; the schema is at layer ${layer}\n`,
  )
}

async function commandCrosscheck(): Promise<void> {
  const { mtproto, api, layer } = loadSchemas()

  // The oracle renders whatever layer the documentation currently serves. It is
  // an oracle for the parser, so it only answers that question when it is
  // describing the same layer: against an older rendering, every combinator the
  // newer layer changed would be reported as a parser error.
  const publishedLayer = extractLayer(await download(SOURCES.api.url))
  const comparable = publishedLayer === layer

  const results = [
    crosscheck(mtproto, await fetchReferenceJson('mtproto')),
    crosscheck(api, await fetchReferenceJson('api')),
  ]

  let failed = false
  for (const result of results) {
    // The service schema is unversioned, so it is compared either way.
    const strict = comparable || result.table !== 'api'
    process.stdout.write(describeCrosscheck(result))
    if (!result.agrees && strict) failed = true
  }

  if (!comparable) {
    process.stdout.write(
      `
the API rendering is layer ${publishedLayer} and this repository is pinned to ${layer}, ` +
        `so the differences above are the layers apart rather than the parser disagreeing; ` +
        `the check becomes an oracle again when the documentation catches up
`,
    )
  }

  if (failed) process.exitCode = 1
}

const COMMANDS: Record<string, (flags: readonly string[]) => void | Promise<void>> = {
  fetch: async (flags) => await commandFetch(flags.includes('--from-tdlib')),
  errors: commandErrors,
  emit: commandEmit,
  crosscheck: commandCrosscheck,
}

const name = process.argv[2] ?? ''
const flags = process.argv.slice(3)
const command = COMMANDS[name]

if (command === undefined) {
  process.stderr.write(`usage: cli <${Object.keys(COMMANDS).join('|')}> [--from-tdlib]\n`)
  process.exitCode = 1
} else {
  await command(flags)
}
