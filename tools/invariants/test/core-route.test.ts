// SPDX-License-Identifier: MIT

/**
 * The core-route rule.
 *
 * Only the modules a main entry point loads are held, and only their runtime
 * imports: a type import is erased, and a module loaded later is not paid for
 * at startup, so flagging either would be consistency for its own sake.
 */

import { describe, expect, it } from 'vitest'
import { CORE_ROUTES, coreRoute } from '../src/rules.js'
import type { ImportKind, SourceFile, Workspace } from '../src/types.js'

function module(path: string, imports: ReadonlyArray<[string, ImportKind]>): SourceFile {
  return {
    path,
    text: '',
    imports: imports.map(([specifier, kind], index) => ({ specifier, line: index + 1, kind })),
  }
}

function workspace(...sources: readonly SourceFile[]): Workspace {
  return {
    root: '/repo',
    packages: [
      {
        name: '@yuigram/mtproto',
        dir: 'packages/mtproto',
        runtimeDependencies: ['@yuigram/core'],
        devDependencies: [],
        sources,
      },
    ],
  }
}

const ENTRY = 'packages/mtproto/src/index.ts'
const LINK = 'packages/mtproto/src/core.ts'
const link = module(LINK, [['@yuigram/core', 'static']])

describe('the modules the main entry point loads', () => {
  it('reach the core through the local module', () => {
    const result = coreRoute(
      workspace(
        module(ENTRY, [['./account.js', 'static']]),
        module('packages/mtproto/src/account.ts', [['./core.js', 'static']]),
        link,
      ),
    )

    expect(result.violations).toEqual([])
  })

  it('are reported when one names the core, with where', () => {
    const result = coreRoute(
      workspace(
        module(ENTRY, [['./account.js', 'static']]),
        module('packages/mtproto/src/account.ts', [
          ['./core.js', 'static'],
          ['@yuigram/core', 'static'],
        ]),
        link,
      ),
    )

    expect(result.violations).toHaveLength(1)
    expect(result.violations[0]).toMatchObject({
      file: 'packages/mtproto/src/account.ts',
      line: 2,
    })
    expect(result.violations[0]?.message).toMatch(/packages\/mtproto\/src\/core\.ts/)
  })

  it('may import types from the core by name, which resolves nothing at run time', () => {
    const result = coreRoute(
      workspace(
        module(ENTRY, [
          ['@yuigram/core', 'type'],
          ['./core.js', 'static'],
        ]),
        link,
      ),
    )

    expect(result.violations).toEqual([])
  })

  it("may use the core's other entry points", () => {
    const result = coreRoute(workspace(module(ENTRY, [['@yuigram/core/format', 'static']]), link))

    expect(result.violations).toEqual([])
  })
})

describe('what is outside the startup', () => {
  it('does not hold a module reached only by import()', () => {
    const result = coreRoute(
      workspace(
        module(ENTRY, [['./session/session.js', 'dynamic']]),
        module('packages/mtproto/src/session/session.ts', [['@yuigram/core', 'static']]),
        link,
      ),
    )

    expect(result.violations).toEqual([])
  })

  it('does not hold an optional entry point nothing on the main entry loads', () => {
    const result = coreRoute(
      workspace(
        module(ENTRY, [['./core.js', 'static']]),
        module('packages/mtproto/src/worker/index.ts', [['@yuigram/core', 'static']]),
        link,
      ),
    )

    expect(result.violations).toEqual([])
  })
})

describe('what the rule is configured to hold', () => {
  it('names a local module for each package whose main entry loads the core widely', () => {
    expect(CORE_ROUTES.map((route) => route.link)).toEqual([
      'packages/bot-api/src/core.ts',
      'packages/mtproto/src/core.ts',
    ])
  })
})
