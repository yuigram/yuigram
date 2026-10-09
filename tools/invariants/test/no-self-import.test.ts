// SPDX-License-Identifier: MPL-2.0

/**
 * The no-self-import rule.
 *
 * A published package's own name, imported from its own source, is what the
 * manifest in `dist/` cannot resolve; everything else is untouched by it.
 */

import { describe, expect, it } from 'vitest'
import { noSelfImport } from '../src/rules.js'
import type { ImportKind, SourceFile, Workspace } from '../src/types.js'

function module(path: string, imports: ReadonlyArray<[string, ImportKind]>): SourceFile {
  return {
    path,
    text: '',
    imports: imports.map(([specifier, kind], index) => ({ specifier, line: index + 1, kind })),
  }
}

function workspace(dir: string, ...sources: readonly SourceFile[]): Workspace {
  return {
    root: '/repo',
    packages: [
      { name: '@yuigram/mtproto', dir, runtimeDependencies: [], devDependencies: [], sources },
    ],
  }
}

describe('a package importing itself', () => {
  it('is reported by name and subpath, in code and in type imports', () => {
    const result = noSelfImport(
      workspace(
        'packages/mtproto',
        module('packages/mtproto/src/filters/index.ts', [
          ['@yuigram/mtproto', 'static'],
          ['@yuigram/mtproto/utils', 'type'],
          ['../index.js', 'static'],
          ['@yuigram/core', 'static'],
        ]),
      ),
    )

    expect(result.violations.map((one) => one.line)).toEqual([1, 2])
    expect(result.violations[0]?.message).toMatch(/imports itself by name/)
  })

  it('leaves tests and private tools alone', () => {
    expect(
      noSelfImport(
        workspace(
          'packages/mtproto',
          module('packages/mtproto/test/x.test.ts', [['@yuigram/mtproto', 'static']]),
        ),
      ).violations,
    ).toEqual([])
    expect(
      noSelfImport(
        workspace('tools/live', module('tools/live/src/x.ts', [['@yuigram/mtproto', 'static']])),
      ).violations,
    ).toEqual([])
  })
})
