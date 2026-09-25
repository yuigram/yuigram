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

import type { Invariant, InvariantResult, SourceFile, Violation, Workspace } from './types.js'
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
    // Storage adapters serve both transports through core's contracts, so
    // either transport importing one, or one importing a transport, would tie
    // a database to a protocol.
    ['@yuigram/sqlite', ['@yuigram/bot-api', '@yuigram/mtproto', 'yuigram']],
    ['@yuigram/redis', ['@yuigram/bot-api', '@yuigram/mtproto', 'yuigram']],
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

/**
 * Directory edges that must not exist inside a package.
 *
 * The two rules above resolve a specifier to a package name and skip relative
 * imports entirely, so neither can see one generated table reaching into
 * another. That edge is exactly what keeps the service and API vocabularies
 * apart: the plaintext handshake channel decodes with the service table alone,
 * and an API constructor is unreachable there only while the modules stay
 * separate.
 *
 * Branded identifiers stop a *value* crossing between tables. This stops a
 * *module* crossing, which branding cannot express.
 */
interface ModuleBoundary {
  /** Directory prefix, relative to the repository root. */
  readonly from: string
  /** Prefixes it must not reach. */
  readonly to: readonly string[]
  /** Why the edge is forbidden, shown when one appears. */
  readonly rationale: string
}

export const MODULE_BOUNDARIES: readonly ModuleBoundary[] = [
  {
    from: 'packages/mtproto/src/generated/mtproto/',
    to: ['packages/mtproto/src/generated/api/'],
    rationale:
      'The service table is decoded before an auth key exists. Reaching the API table from it would make an API constructor readable on the plaintext channel.',
  },
  {
    from: 'packages/mtproto/src/generated/api/',
    to: ['packages/mtproto/src/generated/mtproto/'],
    rationale:
      'The API layer travels only inside an encrypted session. Depending on the service table would couple a layer bump to the transport vocabulary.',
  },
  {
    from: 'packages/mtproto/src/generated/core/',
    to: ['packages/mtproto/src/generated/api/', 'packages/mtproto/src/generated/mtproto/'],
    rationale:
      'The core table holds the TL language itself. It is what the other two share, so it may not depend on either.',
  },
]

/** Resolve a relative specifier against the importing file. */
function resolveRelative(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null

  const segments = fromFile.split('/').slice(0, -1)
  for (const part of specifier.split('/')) {
    if (part === '.' || part === '') continue
    if (part === '..') segments.pop()
    else segments.push(part)
  }

  return segments.join('/')
}

export const moduleBoundaries: Invariant = (workspace): InvariantResult => {
  const violations: Violation[] = []

  for (const pkg of workspace.packages) {
    for (const source of pkg.sources) {
      const boundary = MODULE_BOUNDARIES.find((rule) => source.path.startsWith(rule.from))
      if (boundary === undefined) continue

      for (const ref of source.imports) {
        const target = resolveRelative(source.path, ref.specifier)
        if (target === null) continue

        const crossed = boundary.to.find((prefix) => target.startsWith(prefix))
        if (crossed === undefined) continue

        violations.push({
          file: source.path,
          line: ref.line,
          message: `${boundary.from} imports '${ref.specifier}', which resolves into ${crossed}`,
          rationale: boundary.rationale,
        })
      }
    }
  }

  return { name: 'module-boundaries', violations }
}

/**
 * What an entry point costs merely to load.
 *
 * Importing a module evaluates everything it statically imports, transitively,
 * whether or not the program goes on to use any of it. `docs/performance.md` §2
 * budgets a cold `import 'yuigram'` at under 100 ms and asks for the TL codec
 * tables — some 2,300 combinators — to be resolved on first use rather than
 * built eagerly. A single static edge from an entry point into a table puts all
 * of them back into every program's startup, including the ones that only ever
 * run a bot.
 *
 * The benchmark measures the consequence; this states the rule. A measurement
 * says a number moved, and leaves the next person to work out which import did
 * it.
 *
 * Only static edges are followed. A module reached through `import(...)` is
 * loaded when the code that needs it runs, and one reached by `import type` is
 * not loaded at all — which is the whole point of writing either.
 */
interface EagerSurface {
  /** Entry module, repository-relative. */
  readonly entry: string
  /** Prefixes its static closure must not reach. */
  readonly excluded: readonly string[]
  /**
   * Package entry points its static closure must not import by name.
   *
   * The walk follows relative imports only, so an optional entry point of
   * another package — `@yuigram/core/format` — is named here to be caught.
   */
  readonly forbidden?: readonly string[]
  /** Why the weight is kept out, shown when it appears. */
  readonly rationale: string
}

/** The optional entry points no main entry point may load by importing it. */
const OPTIONAL_ENTRIES: readonly string[] = [
  '@yuigram/core/format',
  '@yuigram/core/stream',
  '@yuigram/bot-api/markup',
  '@yuigram/bot-api/rich',
  '@yuigram/bot-api/stream',
  '@yuigram/mtproto/stream',
  '@yuigram/mtproto/worker',
  '@yuigram/mtproto/filters',
  '@yuigram/mtproto/utils',
]

const OPTIONAL_RATIONALE =
  'Formatting, rich messages, streaming, account filters and utilities, and the worker are entry points of their own, loaded by the programs that ask for them. A static edge from a main entry point puts them into the startup of every program that imports it.'

export const EAGER_SURFACES: readonly EagerSurface[] = [
  {
    entry: 'packages/mtproto/src/index.ts',
    excluded: [
      'packages/mtproto/src/generated/api/tables/',
      'packages/mtproto/src/generated/core/tables/',
      'packages/mtproto/src/generated/mtproto/tables/',
    ],
    rationale:
      'The codec tables are resolved when an account connects, not when the package is imported. A static edge to one of them is paid by every program that loads the framework, including bot-only programs that never speak MTProto.',
  },
  {
    entry: 'packages/core/src/index.ts',
    excluded: ['packages/core/src/format/', 'packages/core/src/stream/'],
    forbidden: OPTIONAL_ENTRIES,
    rationale: OPTIONAL_RATIONALE,
  },
  {
    entry: 'packages/bot-api/src/index.ts',
    excluded: [
      'packages/bot-api/src/markup/',
      'packages/bot-api/src/rich/',
      'packages/bot-api/src/stream/',
    ],
    forbidden: OPTIONAL_ENTRIES,
    rationale: OPTIONAL_RATIONALE,
  },
  {
    entry: 'packages/mtproto/src/index.ts',
    excluded: [
      'packages/mtproto/src/stream/',
      'packages/mtproto/src/worker/',
      'packages/mtproto/src/filters/',
      'packages/mtproto/src/utils/',
    ],
    forbidden: OPTIONAL_ENTRIES,
    rationale: OPTIONAL_RATIONALE,
  },
  {
    entry: 'packages/yuigram/src/index.ts',
    excluded: [],
    forbidden: OPTIONAL_ENTRIES,
    rationale: OPTIONAL_RATIONALE,
  },
]

/**
 * The source file a relative specifier names, or null when it names none.
 *
 * A specifier carries the extension of the built file rather than the source
 * one. `nodenext` resolution requires the extension, so every relative import
 * in the repository ends in `.js` and none names a bare directory — rewriting
 * the extension is the whole of the mapping.
 */
function sourceAt(target: string, sources: ReadonlyMap<string, SourceFile>): SourceFile | null {
  return sources.get(target.replace(/\.js$/, '.ts')) ?? null
}

/** One edge out of the permitted set, as the walk found it. */
interface Crossing {
  readonly file: string
  readonly line: number
  readonly specifier: string
  /** The excluded prefix it resolved into. */
  readonly crossed: string
}

/**
 * Walk what loading `entry` would load, reporting the edges that leave the set.
 *
 * A module that crosses is reported and not descended into. Everything under it
 * crosses too, and the edge that reached it is the one thing to fix.
 */
function crossings(
  entry: SourceFile,
  sources: ReadonlyMap<string, SourceFile>,
  excluded: readonly string[],
  forbidden: readonly string[] = [],
): Crossing[] {
  const found: Crossing[] = []
  const seen = new Set<string>([entry.path])
  const pending: SourceFile[] = [entry]

  for (let source = pending.pop(); source !== undefined; source = pending.pop()) {
    for (const ref of source.imports) {
      if (ref.kind !== 'static') continue

      const target = resolveRelative(source.path, ref.specifier)
      if (target === null) {
        const named = forbidden.find((entry) => ref.specifier === entry)
        if (named !== undefined) {
          found.push({
            file: source.path,
            line: ref.line,
            specifier: ref.specifier,
            crossed: named,
          })
        }
        continue
      }

      const crossed = excluded.find((prefix) => target.startsWith(prefix))
      if (crossed !== undefined) {
        found.push({ file: source.path, line: ref.line, specifier: ref.specifier, crossed })
        continue
      }

      const next = sourceAt(target, sources)
      if (next === null || seen.has(next.path)) continue

      seen.add(next.path)
      pending.push(next)
    }
  }

  return found
}

export const eagerSurfaces: Invariant = (workspace): InvariantResult => {
  const violations: Violation[] = []
  const sources = new Map<string, SourceFile>()
  for (const pkg of workspace.packages) {
    for (const source of pkg.sources) sources.set(source.path, source)
  }

  for (const surface of EAGER_SURFACES) {
    const entry = sources.get(surface.entry)
    if (entry === undefined) continue

    for (const crossing of crossings(entry, sources, surface.excluded, surface.forbidden)) {
      violations.push({
        file: crossing.file,
        line: crossing.line,
        message: `'${crossing.specifier}' is reachable from ${surface.entry} without running anything, and resolves into ${crossing.crossed}`,
        rationale: surface.rationale,
      })
    }
  }

  return { name: 'eager-surfaces', violations }
}

/**
 * What a template must refuse to commit.
 *
 * `docs/security.md` §3 lists "never in git" as a control that is on by
 * default, held by documentation and by a `.gitignore` in every template, and
 * calls it the realistic leak path — realistic because nothing about it fails
 * loudly. A session string is one line of text that is a logged-in account, and
 * the way it reaches a public repository is not that somebody decided to commit
 * it. It is that they copied a template, ran it, and committed everything the
 * run produced.
 *
 * So the rule is about the templates rather than about this repository: the
 * root ignore file protects what is checked out here, and protects nothing at
 * all once a directory has been copied somewhere else. Each pattern below
 * corresponds to something an example actually reads or writes.
 */
const TEMPLATE_IGNORES: readonly string[] = [
  'node_modules/',
  'dist/',
  '.env',
  '*.session',
  'state/',
]

/** One template, as the checker reads it. */
export interface Template {
  /** Repository-relative directory, e.g. `examples/08-storage`. */
  readonly path: string
  /** Contents of its `.gitignore`, or undefined when it has none. */
  readonly gitignore: string | undefined
}

/**
 * Every template ignores what running it produces.
 *
 * Checked against the patterns rather than the file, so a template that needs
 * more may say more. A template that is missing one is reported by name: the
 * point of the control is that somebody copying it inherits the protection,
 * and a template silently short of a rule inherits nothing.
 */
export function templatesIgnoreSecrets(templates: readonly Template[]): InvariantResult {
  const violations: Violation[] = []

  for (const template of templates) {
    if (template.gitignore === undefined) {
      violations.push({
        file: `${template.path}/.gitignore`,
        message: `${template.path} is a template with no '.gitignore'`,
        rationale:
          'A template is copied whole. Whoever copies it inherits its ignore rules and nothing else, and what they run writes credentials and session state beside the code.',
      })
      continue
    }

    const lines = new Set(
      template.gitignore
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('#')),
    )

    for (const pattern of TEMPLATE_IGNORES) {
      if (lines.has(pattern)) continue

      violations.push({
        file: `${template.path}/.gitignore`,
        message: `${template.path} does not ignore '${pattern}'`,
        rationale:
          'Each pattern names something an example reads or writes: dependencies, build output, credentials, a session, or the state a run leaves behind.',
      })
    }
  }

  return { name: 'templates-ignore-secrets', violations }
}

/** All invariants that operate purely on the workspace description. */
export const workspaceInvariants: readonly Invariant[] = [
  noTelegramDependencies,
  layerBoundaries,
  declaredImports,
  moduleBoundaries,
  eagerSurfaces,
]

/** Run every workspace invariant and collect the results. */
export function runWorkspaceInvariants(workspace: Workspace): readonly InvariantResult[] {
  return workspaceInvariants.map((invariant) => invariant(workspace))
}
