// SPDX-License-Identifier: MPL-2.0

/**
 * Validation against Telegram's own JSON rendering of the schema.
 *
 * Telegram publishes the same schemas as JSON at `/schema/json` and
 * `/schema/mtproto-json`. Those are first-party, so the provenance objection
 * that rules out community mirrors does not apply — but they are still a
 * *rendering*, carrying the site's conventions rather than the notation the
 * protocol is specified in. So they are an oracle, never an input.
 *
 * The value of the check is precisely that it does not share a parser with the
 * thing it checks: an error in the TL parser has no reason to appear in
 * Telegram's JSON as well. A divergence fails the update rather than being
 * resolved silently.
 */

import { allCombinators, type TlSchema } from './ir.js'

/** Where each reference document lives. */
const REFERENCE_URLS = {
  mtproto: 'https://core.telegram.org/schema/mtproto-json',
  api: 'https://core.telegram.org/schema/json',
} as const

/** One combinator as Telegram's JSON describes it. */
interface ReferenceEntry {
  readonly id: string
  readonly predicate?: string
  readonly method?: string
}

/** The shape of the published JSON. */
export interface ReferenceSchema {
  readonly constructors?: readonly ReferenceEntry[]
  readonly methods?: readonly ReferenceEntry[]
}

/** What the comparison found. */
export interface CrosscheckResult {
  readonly table: string
  readonly agrees: boolean
  /** Combinators the parser produced that the reference does not list. */
  readonly missingFromReference: readonly string[]
  /** Combinators the reference lists that the parser did not produce. */
  readonly missingFromParse: readonly string[]
  /** Names present in both, with disagreeing identifiers. */
  readonly idMismatches: readonly {
    readonly name: string
    readonly parsed: number
    readonly reference: number
  }[]
  /** How many names were compared. */
  readonly compared: number
}

/** Download one reference document. */
export async function fetchReferenceJson(table: 'mtproto' | 'api'): Promise<ReferenceSchema> {
  const response = await fetch(REFERENCE_URLS[table], { headers: { accept: 'application/json' } })
  if (!response.ok) {
    throw new Error(`${REFERENCE_URLS[table]} responded ${response.status}`)
  }

  return (await response.json()) as ReferenceSchema
}

/**
 * Compare a parsed schema against the reference.
 *
 * Names and identifiers only. The reference describes parameter types in its
 * own vocabulary, and translating between the two would reintroduce exactly the
 * interpretation step the oracle exists to avoid — a translation bug would be
 * indistinguishable from a parser bug.
 */
export function crosscheck(schema: TlSchema, reference: ReferenceSchema): CrosscheckResult {
  const parsed = new Map<string, number>()
  const builtins = new Set<string>()

  for (const combinator of allCombinators(schema)) {
    // The language's own primitives — `int ? = Int;` and the polymorphic vector
    // — are declarations of what TL *is*, not constructors that travel on the
    // wire. Telegram's JSON lists constructors, so it does not carry them, and
    // no generated table does either. Comparing them would report a difference
    // between two documents that describe different things.
    if (combinator.idOrigin === 'builtin') {
      builtins.add(combinator.name)
      continue
    }

    parsed.set(combinator.name, combinator.id)
  }

  const referenced = new Map<string, number>()
  for (const entry of [...(reference.constructors ?? []), ...(reference.methods ?? [])]) {
    const name = entry.predicate ?? entry.method
    if (name === undefined) continue

    // The published JSON writes ids as signed 32-bit decimals.
    referenced.set(name, Number.parseInt(entry.id, 10) >>> 0)
  }

  const missingFromReference: string[] = []
  const missingFromParse: string[] = []
  const idMismatches: { name: string; parsed: number; reference: number }[] = []

  for (const [name, id] of parsed) {
    const other = referenced.get(name)
    if (other === undefined) missingFromReference.push(name)
    else if (other !== id) idMismatches.push({ name, parsed: id, reference: other })
  }

  for (const name of referenced.keys()) {
    // A name the reference publishes as a constructor while this document
    // declares it as a language primitive is not a divergence: the polymorphic
    // vector is declared in both schemas, and the table that carries it is the
    // shared core rather than either of these.
    if (parsed.has(name) || builtins.has(name)) continue

    missingFromParse.push(name)
  }

  return {
    table: schema.table,
    agrees:
      missingFromReference.length === 0 &&
      missingFromParse.length === 0 &&
      idMismatches.length === 0,
    missingFromReference: missingFromReference.sort(),
    missingFromParse: missingFromParse.sort(),
    idMismatches,
    compared: parsed.size,
  }
}

/** A readable report of one comparison. */
export function describeCrosscheck(result: CrosscheckResult): string {
  if (result.agrees) {
    return `${result.table}: ${result.compared} combinators agree with the published JSON\n`
  }

  const lines = [`${result.table}: DIVERGED over ${result.compared} combinators`]
  for (const name of result.missingFromReference) lines.push(`  parsed but not published: ${name}`)
  for (const name of result.missingFromParse) lines.push(`  published but not parsed: ${name}`)
  for (const mismatch of result.idMismatches) {
    lines.push(
      `  id differs for ${mismatch.name}: parsed 0x${mismatch.parsed.toString(16)}, ` +
        `published 0x${mismatch.reference.toString(16)}`,
    )
  }

  return `${lines.join('\n')}\n`
}
