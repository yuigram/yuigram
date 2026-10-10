// SPDX-License-Identifier: MIT

/**
 * The eager-surface rule.
 *
 * What an entry point costs to load is decided by its static import closure,
 * and nothing else about a module says whether it is in that closure — a file
 * can be enormous and free, or one line and expensive, depending only on how it
 * is reached. `docs/performance.md` §2 budgets a cold `import 'yuigram'` at
 * under 100 ms and asks for the codec tables to be resolved on first use, so
 * this rule is what keeps a single static edge from putting 2,300 combinators
 * back into every program's startup.
 *
 * The cases that matter are the three ways a specifier is reached, because the
 * rule is wrong if it treats any two of them alike: a static edge is a
 * violation, a dynamic one is the mechanism, and a type-only one is not an edge
 * at all.
 */

import { describe, expect, it } from 'vitest'
import { EAGER_SURFACES, eagerSurfaces } from '../src/rules.js'
import type { ImportKind, SourceFile, Workspace } from '../src/types.js'

/** One module and the specifiers it reaches, in the form the rule reads. */
function module(path: string, imports: ReadonlyArray<[string, ImportKind]>): SourceFile {
  return {
    path,
    text: '',
    imports: imports.map(([specifier, kind], index) => ({ specifier, line: index + 1, kind })),
  }
}

/** A workspace whose entry is the one the real rule constrains. */
function workspace(...sources: readonly SourceFile[]): Workspace {
  return {
    root: '/repo',
    packages: [
      {
        name: '@yuigram/mtproto',
        dir: 'packages/mtproto',
        runtimeDependencies: [],
        devDependencies: [],
        sources,
      },
    ],
  }
}

const ENTRY = 'packages/mtproto/src/index.ts'
const TABLE = 'packages/mtproto/src/generated/api/tables/index.ts'

describe('what an entry point may reach', () => {
  it('passes when nothing in the closure reaches a table', () => {
    const result = eagerSurfaces(
      workspace(
        module(ENTRY, [['./account.js', 'static']]),
        module('packages/mtproto/src/account.ts', [['./session.js', 'static']]),
        module('packages/mtproto/src/session.ts', []),
      ),
    )

    expect(result.violations).toEqual([])
  })

  it('reports a table imported by the entry point itself', () => {
    const result = eagerSurfaces(
      workspace(module(ENTRY, [['./generated/api/tables/index.js', 'static']])),
    )

    expect(result.violations).toHaveLength(1)
    expect(result.violations[0]?.file).toBe(ENTRY)
    expect(result.violations[0]?.message).toContain('generated/api/tables/')
    expect(result.violations[0]?.rationale).toContain('bot-only')
  })

  it('reports a table reached through another module', () => {
    // The edge that actually regresses. Nobody imports a table from an entry
    // point; they import something reasonable that happens to import one.
    const result = eagerSurfaces(
      workspace(
        module(ENTRY, [['./account.js', 'static']]),
        module('packages/mtproto/src/account.ts', [['./network/pools.js', 'static']]),
        module('packages/mtproto/src/network/pools.ts', [
          ['../generated/api/tables/index.js', 'static'],
        ]),
      ),
    )

    expect(result.violations).toHaveLength(1)
    expect(result.violations[0]?.file).toBe('packages/mtproto/src/network/pools.ts')
    expect(result.violations[0]?.line).toBe(1)
  })

  it('allows a table reached only when code runs', () => {
    const result = eagerSurfaces(
      workspace(
        module(ENTRY, [['./account.js', 'static']]),
        module('packages/mtproto/src/account.ts', [['./stack.js', 'dynamic']]),
        module('packages/mtproto/src/stack.ts', [['./generated/api/tables/index.js', 'static']]),
      ),
    )

    expect(result.violations).toEqual([])
  })

  it('allows a table named only for its types', () => {
    // `import type` is erased, so the module is never evaluated. Treating it as
    // an edge would push the codebase towards weaker typing to satisfy a
    // performance rule, which is the wrong trade in both directions.
    const result = eagerSurfaces(
      workspace(module(ENTRY, [['./generated/api/tables/index.js', 'type']])),
    )

    expect(result.violations).toEqual([])
  })

  it('ignores a module outside the closure', () => {
    // The stack imports every table by design. It is only a problem where it is
    // reachable, and unreachable modules are the rest of the package.
    const result = eagerSurfaces(
      workspace(
        module(ENTRY, []),
        module('packages/mtproto/src/stack.ts', [['./generated/api/tables/index.js', 'static']]),
      ),
    )

    expect(result.violations).toEqual([])
  })

  it('follows a barrel on the way to a table', () => {
    const result = eagerSurfaces(
      workspace(
        module(ENTRY, [['./normalize/index.js', 'static']]),
        module('packages/mtproto/src/normalize/index.ts', [
          ['../generated/api/tables/index.js', 'static'],
        ]),
      ),
    )

    expect(result.violations).toHaveLength(1)
  })

  it('does not mistake an asset for the module beside it', () => {
    // Resolution rewrites the built extension to the source one. A specifier
    // that is not a built module has no source to rewrite to, and treating it
    // as though it did would attribute a violation to a file nobody imported.
    const result = eagerSurfaces(
      workspace(
        module(ENTRY, [['./config.json', 'static']]),
        module('packages/mtproto/src/config.ts', [['./generated/api/tables/index.js', 'static']]),
      ),
    )

    expect(result.violations).toEqual([])
  })

  it('terminates when two modules import each other', () => {
    const result = eagerSurfaces(
      workspace(
        module(ENTRY, [['./a.js', 'static']]),
        module('packages/mtproto/src/a.ts', [['./b.js', 'static']]),
        module('packages/mtproto/src/b.ts', [['./a.js', 'static']]),
      ),
    )

    expect(result.violations).toEqual([])
  })

  it('says nothing about a package whose entry is absent', () => {
    expect(eagerSurfaces(workspace()).violations).toEqual([])
  })
})

describe('what the rule is configured to protect', () => {
  it('constrains the MTProto entry point', () => {
    expect(EAGER_SURFACES.map((surface) => surface.entry)).toContain(ENTRY)
  })

  it('excludes every generated table, not only the largest', () => {
    // The API table dominates, but a rule naming only it would let the service
    // and core tables back in, and those are what the plaintext channel reads.
    const excluded = EAGER_SURFACES.flatMap((surface) => surface.excluded)

    expect(excluded).toContain('packages/mtproto/src/generated/api/tables/')
    expect(excluded).toContain('packages/mtproto/src/generated/core/tables/')
    expect(excluded).toContain('packages/mtproto/src/generated/mtproto/tables/')
    expect(TABLE.startsWith('packages/mtproto/src/generated/api/tables/')).toBe(true)
  })
})

describe('the optional entry points', () => {
  it('reports an optional entry point of another package imported by name', () => {
    const result = eagerSurfaces(
      workspace(
        module(ENTRY, [['./account.js', 'static']]),
        module('packages/mtproto/src/account.ts', [['@yuigram/core/stream', 'static']]),
      ),
    )

    expect(result.violations).toHaveLength(1)
    expect(result.violations[0]?.file).toBe('packages/mtproto/src/account.ts')
    expect(result.violations[0]?.message).toContain('@yuigram/core/stream')
  })

  it('lets one be loaded on demand or named for its types', () => {
    const result = eagerSurfaces(
      workspace(
        module(ENTRY, [
          ['@yuigram/core/format', 'dynamic'],
          ['@yuigram/mtproto/worker', 'type'],
        ]),
      ),
    )

    expect(result.violations).toEqual([])
  })

  it('reports an optional module of the same package reached by path', () => {
    const result = eagerSurfaces(workspace(module(ENTRY, [['./stream/index.js', 'static']])))

    expect(result.violations[0]?.message).toContain('packages/mtproto/src/stream/')
  })

  it('constrains every main entry point', () => {
    const entries = EAGER_SURFACES.map((surface) => surface.entry)

    for (const entry of [
      'packages/core/src/index.ts',
      'packages/bot-api/src/index.ts',
      'packages/mtproto/src/index.ts',
      'packages/yuigram/src/index.ts',
    ]) {
      expect(entries).toContain(entry)
    }
  })
})
