/**
 * Proves each architecture invariant both accepts a conforming workspace and
 * rejects a violating one.
 *
 * The second half matters more than the first. An invariant that never fires
 * is indistinguishable from one that is broken, so every rule here is shown
 * catching the thing it exists to catch.
 */

import { describe, expect, it } from 'vitest'
import {
  declaredImports,
  isForbiddenTelegramPackage,
  layerBoundaries,
  noTelegramDependencies,
  packageOfSpecifier,
  publicSurfaceIsClean,
} from '../src/rules.js'
import type { SourceFile, Workspace, WorkspacePackage } from '../src/types.js'
import { extractImports } from '../src/workspace.js'

function source(path: string, text: string): SourceFile {
  return { path, text, imports: extractImports(text) }
}

function pkg(
  name: string,
  overrides: Partial<Omit<WorkspacePackage, 'name'>> = {},
): WorkspacePackage {
  return {
    name,
    dir: `packages/${name.replace('@yuigram/', '')}`,
    runtimeDependencies: [],
    devDependencies: [],
    sources: [],
    ...overrides,
  }
}

function workspace(...packages: WorkspacePackage[]): Workspace {
  return { root: '/repo', packages }
}

describe('specifier helpers', () => {
  it('reduces specifiers to package names', () => {
    expect(packageOfSpecifier('@yuigram/core')).toBe('@yuigram/core')
    expect(packageOfSpecifier('@yuigram/core/sub/path')).toBe('@yuigram/core')
    expect(packageOfSpecifier('vitest')).toBe('vitest')
    expect(packageOfSpecifier('vitest/config')).toBe('vitest')
  })

  it('ignores relative paths and node builtins', () => {
    expect(packageOfSpecifier('./local.ts')).toBeNull()
    expect(packageOfSpecifier('../sibling.ts')).toBeNull()
    expect(packageOfSpecifier('node:crypto')).toBeNull()
  })

  it('recognises forbidden Telegram packages exactly', () => {
    expect(isForbiddenTelegramPackage('mtcute')).toBe(true)
    expect(isForbiddenTelegramPackage('@mtcute/core')).toBe(true)
    expect(isForbiddenTelegramPackage('puregram')).toBe(true)
    expect(isForbiddenTelegramPackage('@puregram/api')).toBe(true)
    expect(isForbiddenTelegramPackage('grammy')).toBe(true)
  })

  it('does not flag unrelated packages that merely resemble one', () => {
    // Guards against a substring match catching innocent names.
    expect(isForbiddenTelegramPackage('telegram-formatter')).toBe(false)
    expect(isForbiddenTelegramPackage('my-telegram-utils')).toBe(false)
    expect(isForbiddenTelegramPackage('@acme/telegraf-helpers')).toBe(false)
  })
})

describe('extractImports', () => {
  it('finds static, namespace, dynamic and bare imports', () => {
    const refs = extractImports(
      [
        `import { a } from '@yuigram/core'`,
        `import * as b from 'node:fs'`,
        `import 'side-effect'`,
        `export { c } from './local.ts'`,
        `const d = await import('dynamic-pkg')`,
      ].join('\n'),
    )

    expect(refs.map((r) => r.specifier)).toEqual([
      '@yuigram/core',
      'node:fs',
      'side-effect',
      './local.ts',
      'dynamic-pkg',
    ])
  })

  it('records the line each specifier appears on', () => {
    const refs = extractImports(`const x = 1\n\nimport { y } from 'pkg'\n`)
    expect(refs[0]?.line).toBe(3)
  })

  it('ignores specifiers written inside comments', () => {
    // Documentation frequently describes imports. Treating that prose as a
    // real import produced a false positive against this checker's own source.
    const refs = extractImports(
      [
        `/**`,
        ` * Matches bare \`import 'commented-pkg'\` and \`require('other-pkg')\`.`,
        ` */`,
        `// import { z } from 'line-commented-pkg'`,
        `import { a } from 'real-pkg'`,
      ].join('\n'),
    )

    expect(refs.map((r) => r.specifier)).toEqual(['real-pkg'])
  })

  it('keeps line numbers accurate after stripping comments', () => {
    const refs = extractImports(
      [`/* leading`, `   block`, `   comment */`, `import { a } from 'pkg'`].join('\n'),
    )
    expect(refs[0]?.line).toBe(4)
  })
})

describe('no-telegram-dependencies', () => {
  it('passes when no Telegram library is declared', () => {
    const result = noTelegramDependencies(
      workspace(pkg('@yuigram/core', { devDependencies: ['vitest', 'typescript'] })),
    )
    expect(result.violations).toEqual([])
  })

  it('fails on a runtime dependency', () => {
    const result = noTelegramDependencies(
      workspace(pkg('@yuigram/mtproto', { runtimeDependencies: ['@mtcute/core'] })),
    )
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0]?.message).toContain('@mtcute/core')
  })

  it('fails on a dev dependency too', () => {
    // A Telegram library in devDependencies still risks the implementation
    // being shaped by it, so the rule covers both fields.
    const result = noTelegramDependencies(
      workspace(pkg('@yuigram/bot-api', { devDependencies: ['puregram'] })),
    )
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0]?.message).toContain('devDependencies')
  })
})

describe('layer-boundaries', () => {
  it('allows a transport package to import core', () => {
    const result = layerBoundaries(
      workspace(
        pkg('@yuigram/bot-api', {
          runtimeDependencies: ['@yuigram/core'],
          sources: [source('packages/bot-api/src/a.ts', `import { x } from '@yuigram/core'`)],
        }),
      ),
    )
    expect(result.violations).toEqual([])
  })

  it('fails when core imports a transport', () => {
    const result = layerBoundaries(
      workspace(
        pkg('@yuigram/core', {
          sources: [source('packages/core/src/a.ts', `import { x } from '@yuigram/bot-api'`)],
        }),
      ),
    )
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0]?.rationale).toContain('transport-agnostic')
  })

  it('fails when the two transports import each other', () => {
    const result = layerBoundaries(
      workspace(
        pkg('@yuigram/bot-api', {
          sources: [source('packages/bot-api/src/a.ts', `import { x } from '@yuigram/mtproto'`)],
        }),
        pkg('@yuigram/mtproto', {
          sources: [source('packages/mtproto/src/b.ts', `import { y } from '@yuigram/bot-api'`)],
        }),
      ),
    )
    expect(result.violations).toHaveLength(2)
  })

  it('reports the offending line', () => {
    const result = layerBoundaries(
      workspace(
        pkg('@yuigram/core', {
          sources: [
            source('packages/core/src/a.ts', `const a = 1\n\nimport { x } from '@yuigram/mtproto'`),
          ],
        }),
      ),
    )
    expect(result.violations[0]?.line).toBe(3)
  })
})

describe('declared-imports', () => {
  it('passes when every import is declared', () => {
    const result = declaredImports(
      workspace(
        pkg('@yuigram/bot-api', {
          runtimeDependencies: ['@yuigram/core'],
          sources: [source('packages/bot-api/src/a.ts', `import { x } from '@yuigram/core'`)],
        }),
      ),
    )
    expect(result.violations).toEqual([])
  })

  it('ignores relative imports and node builtins', () => {
    const result = declaredImports(
      workspace(
        pkg('@yuigram/core', {
          sources: [
            source(
              'packages/core/src/a.ts',
              `import { x } from './b.ts'\nimport { createHash } from 'node:crypto'`,
            ),
          ],
        }),
      ),
    )
    expect(result.violations).toEqual([])
  })

  it('fails on a phantom dependency', () => {
    const result = declaredImports(
      workspace(
        pkg('@yuigram/core', {
          sources: [source('packages/core/src/a.ts', `import { x } from 'undeclared-pkg'`)],
        }),
      ),
    )
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0]?.message).toContain('undeclared-pkg')
  })
})

describe('public-surface-is-clean', () => {
  it('passes on declarations that name no foreign library', () => {
    const result = publicSurfaceIsClean([
      { path: 'packages/yuigram/dist/index.d.ts', text: 'export declare const a: number\n' },
    ])
    expect(result.violations).toEqual([])
  })

  it('fails when a foreign type reaches the public surface', () => {
    const result = publicSurfaceIsClean([
      {
        path: 'packages/mtproto/dist/index.d.ts',
        text: `import type { TelegramClient } from '@mtcute/core'\n`,
      },
    ])
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0]?.message).toContain('mtcute')
  })

  it('ignores mentions inside comments', () => {
    // Documentation may legitimately discuss other projects; only executable
    // declaration text is a leak of a foreign concept into the public API.
    const result = publicSurfaceIsClean([
      {
        path: 'packages/core/dist/index.d.ts',
        text: '// unlike mtcute, this package is transport-agnostic\nexport declare const a: number\n',
      },
    ])
    expect(result.violations).toEqual([])
  })
  it('ignores mentions inside a block comment', () => {
    // The shape TypeScript actually emits. Stripping comments line by line
    // missed the interior lines, so a JSDoc explaining a design divergence was
    // reported as a leak of a foreign concept.
    const result = publicSurfaceIsClean([
      {
        path: 'packages/core/dist/index.d.ts',
        text: `/**
 * Errors are reported and dispatch continues.
 *
 * puregram rethrows on a microtask instead, which is louder but lets one
 * malformed update end every conversation in flight.
 */
export declare const a: number
`,
      },
    ])
    expect(result.violations).toEqual([])
  })

  it('still catches a foreign type declared after a block comment', () => {
    // Stripping must blank the comment without swallowing the code after it,
    // and must keep the reported line accurate.
    const result = publicSurfaceIsClean([
      {
        path: 'packages/mtproto/dist/index.d.ts',
        text: `/**
 * Docs.
 */
import type { X } from "@mtcute/core"
`,
      },
    ])
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0]?.line).toBe(4)
  })
})
