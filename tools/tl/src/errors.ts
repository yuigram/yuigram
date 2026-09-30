/**
 * The names Telegram documents for its refusals.
 *
 * The TL schema says what a method takes and returns and nothing about how it
 * fails. Telegram publishes that separately, as its Error Database: one JSON
 * document listing, per error code, each error name and the methods that may
 * return it, with an empty list for a name any method may return. This module
 * reads the codes, the names and the method lists — facts about the interface,
 * like a method's name or a field's type — and nothing else. The database's
 * `descriptions` are Telegram's prose and are neither recorded nor emitted
 * (`docs/licensing.md` §5), and no list compiled by anybody else is read (§6).
 *
 * ```
 * errors  core.telegram.org/api/errors.json
 *         -> schemas/tl/errors.json   codes, names and methods, with provenance
 * emit    schemas/tl/errors.json
 *         -> generated/errors.ts      types only; nothing at runtime
 * ```
 *
 * What comes out is the set of names Telegram documents, which is not the set
 * it sends: the database trails the layers, and a method may fail with a name
 * it does not list. The emitted types therefore keep every other string usable.
 */

import { type EmittedFile, header } from './emit/render.js'
import { TlFetchError } from './fetch.js'

/** Where Telegram publishes the database. */
export const ERROR_DATABASE = 'https://core.telegram.org/api/errors.json'

/** One documented name: the codes it is listed under and the methods listing it. */
export interface DocumentedError {
  readonly codes: readonly number[]
  /** Empty where the database says any method may return it. */
  readonly methods: readonly string[]
}

/** What the database says, reduced to what is kept. */
export interface ErrorDatabase {
  readonly layer: number
  readonly errors: Readonly<Record<string, DocumentedError>>
}

/** The committed snapshot a fetch writes and the emitter reads. */
export interface ErrorSnapshot {
  readonly provenance: {
    readonly source: string
    readonly retrieved: string
    /** The layer the database says it describes. */
    readonly databaseLayer: number
    /** The layer the generated API speaks, for comparison. */
    readonly schemaLayer: number
    readonly recorded: string
  }
  readonly errors: Readonly<Record<string, DocumentedError>>
}

/**
 * What a name may look like.
 *
 * Upper-case words and digits joined by underscores, with `%d` where the name
 * carries a number — at the end, in the middle, or written into a word, as
 * `PREVIOUS_CHAT_IMPORT_ACTIVE_WAIT_%dMIN` does. Or one capitalised word: the
 * few server-side failures are named that way, `Timeout` among them. Anything
 * else is a layout this reader does not understand, and is refused rather
 * than recorded.
 */
const NAME = /^(?:(?:[A-Z0-9]|%d)+(?:_(?:[A-Z0-9]|%d)+)*|[A-Z][a-z]+)$/

/** A TL method name: `messages.sendMessage`, `invokeWithLayer`. */
const METHOD = /^(?:[a-z][A-Za-z0-9]*\.)?[a-z][A-Za-z0-9_]*$/

/**
 * Read the database, keeping codes, names and methods.
 *
 * Everything the shape depends on is checked, and a document that does not
 * have it is refused as a whole: a snapshot that silently lost a code's names
 * would narrow nothing and say nothing about why.
 */
export function readErrorDatabase(text: string, url: string): ErrorDatabase {
  const document = parseDocument(text, url)

  const found = new Map<string, { codes: Set<number>; methods: Set<string> }>()
  for (const [code, names] of Object.entries(document.errors)) {
    for (const [name, methods] of readCode(code, names, url)) {
      const entry = found.get(name) ?? { codes: new Set<number>(), methods: new Set<string>() }
      entry.codes.add(Number(code))
      for (const method of methods) entry.methods.add(method)
      found.set(name, entry)
    }
  }

  const errors: Record<string, DocumentedError> = {}
  for (const [name, entry] of [...found.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    errors[name] = {
      codes: [...entry.codes].sort((a, b) => a - b),
      methods: [...entry.methods].sort(),
    }
  }

  return { layer: document.layer, errors }
}

/** The document's two fields this reads, checked. */
function parseDocument(
  text: string,
  url: string,
): { readonly layer: number; readonly errors: Record<string, unknown> } {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new TlFetchError(`${url} is not JSON`)
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new TlFetchError(`${url} is not an object`)
  }
  const document = parsed as { readonly errors?: unknown; readonly layer?: unknown }
  if (typeof document.layer !== 'number' || !Number.isInteger(document.layer)) {
    throw new TlFetchError(`${url} states no layer`)
  }
  if (typeof document.errors !== 'object' || document.errors === null) {
    throw new TlFetchError(`${url} has no errors to read`)
  }

  return { layer: document.layer, errors: document.errors as Record<string, unknown> }
}

/** The names listed under one code, each with the methods listed for it, checked. */
function readCode(
  code: string,
  names: unknown,
  url: string,
): (readonly [string, readonly string[]])[] {
  if (!/^-?\d+$/.test(code)) throw new TlFetchError(`${url} lists errors under '${code}'`)
  if (typeof names !== 'object' || names === null) {
    throw new TlFetchError(`${url} lists no names under ${code}`)
  }

  return Object.entries(names as Record<string, unknown>).map(([name, methods]) => {
    if (!NAME.test(name)) throw new TlFetchError(`${url} lists '${name}', which is not a name`)
    if (!Array.isArray(methods) || !methods.every((one) => typeof one === 'string')) {
      throw new TlFetchError(`${url} lists no methods for ${name}`)
    }
    const invalid = (methods as string[]).find((method) => !METHOD.test(method))
    if (invalid !== undefined) {
      throw new TlFetchError(`${url} lists '${invalid}' for ${name}, which is not a method`)
    }

    return [name, methods as string[]] as const
  })
}

/** Render a snapshot as the file that is committed: stable key order, LF, one trailing newline. */
export function serializeErrorSnapshot(snapshot: ErrorSnapshot): string {
  const errors = Object.fromEntries(
    Object.keys(snapshot.errors)
      .sort()
      .map((name) => {
        const entry = snapshot.errors[name] ?? { codes: [], methods: [] }
        return [
          name,
          {
            codes: [...entry.codes].sort((a, b) => a - b),
            methods: [...entry.methods].sort(),
          },
        ]
      }),
  )

  // One name per entry and each list on one line, so a later fetch diffs by name.
  const text = JSON.stringify({ provenance: snapshot.provenance, errors }, null, 2).replace(
    /\[\n\s+([^\]]*?)\n\s+\]/g,
    (_, inner: string) => `[${inner.split(/,\n\s+/).join(', ')}]`,
  )
  return `${text}\n`
}

/**
 * The generated module: two unions of string types, and no values.
 *
 * `DocumentedErrorPattern` is each name as the database writes it, `%d`
 * included — what `RpcError.is` takes. `DocumentedErrorText` is the same names
 * as they arrive, with a number where `%d` was — what `RpcError.text` holds. A
 * type costs nothing at runtime, so nothing importing the client pays for the
 * list.
 */
export function emitErrors(snapshot: ErrorSnapshot): EmittedFile {
  const names = Object.keys(snapshot.errors).sort()
  const source =
    `schemas/tl/errors.json, Telegram's error database at layer ` +
    `${snapshot.provenance.databaseLayer}: codes, names and methods only`

  const union = (values: readonly string[]) =>
    values.length === 0 ? '  never' : values.map((value) => `  | ${value}`).join('\n')

  const text = [
    header('Documented RPC error names', source),
    '/**',
    " * Every error name Telegram's error database lists, as it writes them: `%d`",
    ' * where the name carries a number.',
    ' *',
    ' * Not every name Telegram sends. A method may fail with a name the database',
    ' * does not list, and the database trails the layers; this is for completion',
    ' * and for narrowing, never for deciding that an error is impossible.',
    ' */',
    'export type DocumentedErrorPattern =',
    union(names.map((name) => `'${name}'`)),
    '',
    '/** The same names as they arrive, with a number where the pattern has `%d`. */',
    'export type DocumentedErrorText =',
    union(names.map((name) => (name.includes('%d') ? templateOf(name) : `'${name}'`))),
    '',
  ].join('\n')

  return { path: 'errors.ts', text }
}

/**
 * A pattern as a template literal type: `FLOOD_WAIT_%d` becomes
 * `` `FLOOD_WAIT_${number}` ``, which is every text Telegram sends for it.
 */
function templateOf(pattern: string): string {
  // biome-ignore lint/suspicious/noTemplateCurlyInString: this writes TypeScript source, not a template
  return `\`${pattern.replaceAll('%d', '${number}')}\``
}
