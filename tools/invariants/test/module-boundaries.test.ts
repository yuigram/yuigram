// SPDX-License-Identifier: MPL-2.0

/**
 * The module-boundary rule.
 *
 * `layer-boundaries` and `declared-imports` resolve a specifier to a package
 * name, so both skip relative imports entirely and neither can see one
 * generated table reaching into another. That edge is what keeps the service
 * and API vocabularies apart: an API constructor is unreachable on the
 * plaintext handshake channel only while the modules stay separate.
 *
 * A rule that passes because nothing violates it is indistinguishable from a
 * rule that never runs, so each direction is checked against a workspace built
 * to violate it.
 */

import { describe, expect, it } from 'vitest'
import { MODULE_BOUNDARIES, moduleBoundaries } from '../src/rules.js'
import type { Workspace } from '../src/types.js'

/** A workspace holding one source file with one import. */
function workspaceWith(path: string, specifier: string): Workspace {
  return {
    root: '/repo',
    packages: [
      {
        name: '@yuigram/mtproto',
        dir: 'packages/mtproto',
        runtimeDependencies: [],
        devDependencies: [],
        sources: [{ path, text: '', imports: [{ specifier, line: 1, kind: 'static' }] }],
      },
    ],
  }
}

describe('forbidden edges', () => {
  it('reports the service table importing the API table', () => {
    const result = moduleBoundaries(
      workspaceWith(
        'packages/mtproto/src/generated/mtproto/tables/root.ts',
        '../../api/registry.js',
      ),
    )

    expect(result.violations).toHaveLength(1)
    expect(result.violations[0]?.message).toContain(
      'resolves into packages/mtproto/src/generated/api/',
    )
    expect(result.violations[0]?.rationale).toContain('plaintext channel')
  })

  it('reports the API table importing the service table', () => {
    const result = moduleBoundaries(
      workspaceWith(
        'packages/mtproto/src/generated/api/registry.ts',
        './tables/../../mtproto/tables/index.js',
      ),
    )

    expect(result.violations).toHaveLength(1)
  })

  it('reports core depending on either of the tables above it', () => {
    for (const target of ['../api/registry.js', '../mtproto/registry.js']) {
      const result = moduleBoundaries(
        workspaceWith('packages/mtproto/src/generated/core/registry.ts', target),
      )

      expect(result.violations).toHaveLength(1)
    }
  })
})

describe('permitted edges', () => {
  it('allows a table to import the shared runtime', () => {
    const result = moduleBoundaries(
      workspaceWith('packages/mtproto/src/generated/api/registry.ts', '../../tl/registry.js'),
    )

    expect(result.violations).toEqual([])
  })

  it('allows a table to import within itself', () => {
    const result = moduleBoundaries(
      workspaceWith('packages/mtproto/src/generated/api/registry.ts', './tables/index.js'),
    )

    expect(result.violations).toEqual([])
  })

  it('allows either table to import the shared core', () => {
    for (const from of ['api', 'mtproto']) {
      const result = moduleBoundaries(
        workspaceWith(`packages/mtproto/src/generated/${from}/registry.ts`, '../core/registry.js'),
      )

      expect(result.violations).toEqual([])
    }
  })

  it('ignores a file outside every declared boundary', () => {
    const result = moduleBoundaries(
      workspaceWith('packages/mtproto/src/tl/reader.ts', '../generated/api/registry.js'),
    )

    expect(result.violations).toEqual([])
  })

  it('ignores a bare specifier, which the package rules already cover', () => {
    const result = moduleBoundaries(
      workspaceWith('packages/mtproto/src/generated/api/registry.ts', '@yuigram/core'),
    )

    expect(result.violations).toEqual([])
  })
})

describe('the declared boundaries', () => {
  it('covers all three tables', () => {
    expect(MODULE_BOUNDARIES.map((rule) => rule.from).sort()).toEqual([
      'packages/mtproto/src/generated/api/',
      'packages/mtproto/src/generated/core/',
      'packages/mtproto/src/generated/mtproto/',
    ])
  })

  it('states why each edge is forbidden', () => {
    for (const rule of MODULE_BOUNDARIES) {
      expect(rule.rationale.length).toBeGreaterThan(40)
      expect(rule.to.length).toBeGreaterThan(0)
    }
  })
})
