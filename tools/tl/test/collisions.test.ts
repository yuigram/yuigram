// SPDX-License-Identifier: MIT

/**
 * Names both schemas declare, and whether a client could ever have to write one.
 *
 * The writer resolves a constructor by name and refuses a name two tables in
 * its scope share. That is only safe for a client if no call it makes can
 * carry such a constructor, which is a property of the schema: checked here
 * against the committed snapshots, so a layer that makes a shared name
 * reachable from an API method's parameters fails this rather than a call.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

interface Param {
  readonly name: string
  readonly type?: unknown
}
interface Combinator {
  readonly name: string
  readonly params: readonly Param[]
  readonly result: unknown
}
interface Snapshot {
  readonly constructors: readonly Combinator[]
  readonly methods: readonly Combinator[]
}

const SCHEMA_DIR = join(import.meta.dirname, '..', '..', '..', 'schemas', 'tl')
const layer = (
  JSON.parse(readFileSync(join(SCHEMA_DIR, 'layer.json'), 'utf8')) as { layer: number }
).layer
const api = JSON.parse(readFileSync(join(SCHEMA_DIR, `api.${layer}.json`), 'utf8')) as Snapshot
const mtproto = JSON.parse(readFileSync(join(SCHEMA_DIR, 'mtproto.json'), 'utf8')) as Snapshot

/** Names the TL language owns, which the emitter lifts into a table of their own. */
const CORE = new Set(['boolFalse', 'boolTrue', 'true', 'vector', 'error', 'null'])

const namesOf = (schema: Snapshot) =>
  new Set([...schema.constructors, ...schema.methods].map((one) => one.name))

/** The boxed type names a field type refers to. A bare `%Type` is written in place. */
function referenced(type: unknown): string[] {
  if (typeof type === 'string') return type.startsWith('%') ? [] : [type]
  if (typeof type === 'object' && type !== null) return Object.values(type).flatMap(referenced)
  return []
}

/** Every API constructor a method's parameters can carry, however deeply. */
function reachableFromCalls(): Set<string> {
  const byResult = new Map<string, Combinator[]>()
  for (const one of api.constructors) {
    const result = String(one.result).toLowerCase()
    byResult.set(result, [...(byResult.get(result) ?? []), one])
  }

  const types = new Set<string>()
  const constructors = new Set<string>()
  const pending = api.methods.flatMap((method) => method.params.flatMap((p) => referenced(p.type)))
  for (let type = pending.pop(); type !== undefined; type = pending.pop()) {
    const key = type.toLowerCase()
    if (types.has(key)) continue
    types.add(key)
    for (const one of byResult.get(key) ?? []) {
      constructors.add(one.name)
      pending.push(...one.params.flatMap((p) => referenced(p.type)))
    }
  }
  return constructors
}

describe('names the API and service schemas share', () => {
  const shared = [...namesOf(api)].filter((name) => namesOf(mtproto).has(name) && !CORE.has(name))

  it('are only the ones known', () => {
    // A new one is worth knowing about before it is worth anything else.
    expect(shared).toEqual(['message'])
  })

  it('are never carried by a call, so a client never writes one by name', () => {
    const reachable = reachableFromCalls()

    expect(reachable.size).toBeGreaterThan(500)
    expect(shared.filter((name) => reachable.has(name))).toEqual([])
  })
})
