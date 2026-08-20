/**
 * The architecture invariants.
 *
 * These encode the structural claims Yuigram makes about itself. They are
 * build gates rather than review conventions, because an architecture rule
 * that is only written down decays the first time someone is in a hurry.
 *
 * Every rule here is a pure function, so `test/rules.test.ts` can prove each
 * one both accepts a conforming workspace and rejects a violating one.
 */

import type { Invariant, InvariantResult, Violation, Workspace } from './types.js'
import { stripComments } from './workspace.js'

/**
 * Telegram libraries that must never appear in the dependency tree.
 *
 * Yuigram implements both protocols itself. Depending on any of these would
 * make the implementation someone else's work, which is the single thing the
 * project is defined against.
 *
 * Matching is exact on the package name or on a scope prefix, so an unrelated
 * package that merely contains one of these words is not caught by accident.
 */
export const FORBIDDEN_TELEGRAM_PACKAGES: readonly string[] = [
  'puregram',
  'grammy',
  'telegraf',
  'telegram',
  'teleproto',
  'gramio',
  'tgsnake',
  'mtcute',
  'node-telegram-bot-api',
  'telebot',
  'tdl',
  'tdlib',
]

/** Scopes whose every package is forbidden. */
export const FORBIDDEN_SCOPES: readonly string[] = [
  '@puregram',
  '@grammyjs',
  '@mtcute',
  '@gramio',
  '@telegraf',
]

/** Identifiers that must never appear in a published declaration file. */
export const FORBIDDEN_PUBLIC_IDENTIFIERS: readonly string[] = [
  'mtcute',
  'puregram',
  'grammy',
  'telegraf',
  'gramjs',
  'teleproto',
]

/** Runtime dependency licences accepted without review. */
export const ALLOWED_LICENSES: readonly string[] = [
  'MIT',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
  '0BSD',
  'CC0-1.0',
  'Unlicense',
]

/** True when `specifier` names a forbidden Telegram package. */
export function isForbiddenTelegramPackage(specifier: string): boolean {
  if (FORBIDDEN_TELEGRAM_PACKAGES.includes(specifier)) return true
  return FORBIDDEN_SCOPES.some((scope) => specifier.startsWith(`${scope}/`))
}

/** Reduce a module specifier to the package it resolves to, or `null` for a relative path. */
export function packageOfSpecifier(specifier: string): string | null {
  if (specifier.startsWith('.') || specifier.startsWith('/')) return null
  if (specifier.startsWith('node:')) return null

  const segments = specifier.split('/')
  if (specifier.startsWith('@')) {
    const scope = segments[0]
    const name = segments[1]
    return scope !== undefined && name !== undefined ? `${scope}/${name}` : null
  }
  return segments[0] ?? null
}

/**
 * No third-party Telegram library may appear in any dependency field.
 *
 * This is the mechanical statement of the independence policy. A wrapper
 * cannot pass it.
 */
export const noTelegramDependencies: Invariant = (workspace): InvariantResult => {
  const violations: Violation[] = []

  for (const pkg of workspace.packages) {
    const fields: ReadonlyArray<readonly [string, readonly string[]]> = [
      ['dependencies', pkg.runtimeDependencies],
      ['devDependencies', pkg.devDependencies],
    ]

    for (const [field, names] of fields) {
      for (const name of names) {
        if (!isForbiddenTelegramPackage(name)) continue
        violations.push({
          file: `${pkg.dir}/package.json`,
          message: `${pkg.name} declares '${name}' in ${field}`,
          rationale:
            'Yuigram implements the Bot API and MTProto itself. Depending on another Telegram library would make the implementation someone else’s work.',
        })
      }
    }
  }

  return { name: 'no-telegram-dependencies', violations }
}

/**
 * `core` stays transport-agnostic, and the two transports stay independent.
 *
 * Without this, the shared layer accretes Telegram specifics until the
 * "unified core" claim stops being true, and the two subsystems grow a
 * coupling that makes either one impossible to reason about alone.
 */
export const layerBoundaries: Invariant = (workspace): InvariantResult => {
  const violations: Violation[] = []

  /** package name -> packages it must not import */
  const forbidden = new Map<string, readonly string[]>([
    ['@yuigram/core', ['@yuigram/bot-api', '@yuigram/mtproto', '@yuigram/yuigram', 'yuigram']],
    ['@yuigram/bot-api', ['@yuigram/mtproto', 'yuigram']],
    ['@yuigram/mtproto', ['@yuigram/bot-api', 'yuigram']],
  ])

  for (const pkg of workspace.packages) {
    const banned = forbidden.get(pkg.name)
    if (banned === undefined) continue

    for (const source of pkg.sources) {
      for (const ref of source.imports) {
        const target = packageOfSpecifier(ref.specifier)
        if (target === null || !banned.includes(target)) continue

        violations.push({
          file: source.path,
          line: ref.line,
          message: `${pkg.name} imports '${ref.specifier}'`,
          rationale:
            pkg.name === '@yuigram/core'
              ? 'core must stay transport-agnostic; it is the only layer where "unified" is true without qualification.'
              : 'The Bot API and MTProto subsystems are independent by design. Coupling them reintroduces the fake abstraction the architecture rejects.',
        })
      }
    }
  }

  return { name: 'layer-boundaries', violations }
}

/**
 * Every imported package must be declared by the package that imports it.
 *
 * Catches phantom dependencies: imports that happen to resolve through
 * hoisting today and break for a consumer tomorrow.
 */
/** True when the file sits in a test directory or is itself a test. */
function isTestFile(path: string): boolean {
  return /(^|\/)(test|tests)\//.test(path) || /\.test\.ts$/.test(path)
}

/** Context a single import is judged against. */
interface DeclarationContext {
  readonly packageName: string
  readonly declared: ReadonlySet<string>
  readonly workspaceNames: ReadonlySet<string>
  readonly isTest: boolean
}

/** Decide whether one import is permitted, returning the package at fault. */
function undeclaredTarget(specifier: string, context: DeclarationContext): string | null {
  const target = packageOfSpecifier(specifier)

  if (target === null) return null
  if (context.declared.has(target)) return null
  // A package may always import itself by name.
  if (target === context.packageName) return null
  // Test files may reach for root-level dev tooling.
  if (context.isTest && !context.workspaceNames.has(target)) return null

  return target
}

export const declaredImports: Invariant = (workspace): InvariantResult => {
  const violations: Violation[] = []
  const workspaceNames = new Set(workspace.packages.map((p) => p.name))

  for (const pkg of workspace.packages) {
    const declared = new Set([...pkg.runtimeDependencies, ...pkg.devDependencies])

    for (const source of pkg.sources) {
      const context: DeclarationContext = {
        packageName: pkg.name,
        declared,
        workspaceNames,
        isTest: isTestFile(source.path),
      }

      for (const ref of source.imports) {
        const target = undeclaredTarget(ref.specifier, context)
        if (target === null) continue

        violations.push({
          file: source.path,
          line: ref.line,
          message: `${pkg.name} imports '${ref.specifier}' without declaring '${target}'`,
          rationale:
            'An undeclared import resolves only by accident of hoisting. It breaks as soon as the package is installed on its own.',
        })
      }
    }
  }

  return { name: 'declared-imports', violations }
}

/**
 * Published declaration files must not name a third-party Telegram library.
 *
 * This is the guarantee behind long-term independence: whatever the internals
 * ever depend on, no foreign concept reaches the public API. It runs against
 * built `.d.ts` output, so it observes what users actually receive.
 */
export function publicSurfaceIsClean(
  declarationFiles: ReadonlyArray<{ path: string; text: string }>,
): InvariantResult {
  const violations: Violation[] = []

  for (const file of declarationFiles) {
    // Comments are stripped across the whole file before scanning. Doing it
    // line by line missed the middle lines of a block comment, so a JSDoc that
    // merely discussed another project was reported as a leak — which it is
    // not. Only executable declaration text can leak a foreign concept.
    const lines = stripComments(file.text).split('\n')

    lines.forEach((code, index) => {
      for (const identifier of FORBIDDEN_PUBLIC_IDENTIFIERS) {
        if (!code.toLowerCase().includes(identifier)) continue
        violations.push({
          file: file.path,
          line: index + 1,
          message: `public declaration references '${identifier}'`,
          rationale:
            'No third-party Telegram concept may reach the public API. Users should think in Yuigram, not in whatever sits underneath.',
        })
      }
    })
  }

  return { name: 'public-surface-is-clean', violations }
}

/** All invariants that operate purely on the workspace description. */
export const workspaceInvariants: readonly Invariant[] = [
  noTelegramDependencies,
  layerBoundaries,
  declaredImports,
]

/** Run every workspace invariant and collect the results. */
export function runWorkspaceInvariants(workspace: Workspace): readonly InvariantResult[] {
  return workspaceInvariants.map((invariant) => invariant(workspace))
}
