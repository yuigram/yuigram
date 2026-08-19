/**
 * Reads the repository into the plain description the invariants consume.
 *
 * All filesystem access lives here, so the rules themselves stay pure and
 * testable against synthetic fixtures.
 */

import type { Dirent } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import type { ImportRef, SourceFile, Workspace, WorkspacePackage } from './types.js'

/** Directories never worth walking. */
const SKIP_DIRECTORIES = new Set(['node_modules', 'dist', '.git', 'coverage', '.pnpm-store'])

/**
 * Matches static, bare, dynamic and `require` module specifiers.
 *
 * A regex rather than a full parse is deliberate: the invariants run on every
 * push and must stay fast, and a specifier is a syntactically trivial thing to
 * find.
 */
const IMPORT_PATTERN =
  /(?:^|\s)(?:import|export)\s+(?:[\w*{},\s]+\s+from\s+)?['"]([^'"]+)['"]|(?:^|[^\w.])(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/gm

/**
 * Blank out comments so prose describing an import is not mistaken for one.
 *
 * Replacement preserves both length and newlines, so line numbers reported
 * against the stripped text still match the original file.
 */
export function stripComments(text: string): string {
  const blanked = text.replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
  return blanked.replace(/\/\/[^\n]*/g, (match) => ' '.repeat(match.length))
}

/** Extract every module specifier from a source file, with line numbers. */
export function extractImports(text: string): ImportRef[] {
  const refs: ImportRef[] = []
  const scannable = stripComments(text)
  const pattern = new RegExp(IMPORT_PATTERN.source, IMPORT_PATTERN.flags)

  let match: RegExpExecArray | null = pattern.exec(scannable)
  while (match !== null) {
    const specifier = match[1] ?? match[2]
    if (specifier !== undefined) {
      // Anchor to the specifier itself, not the match start: the pattern
      // consumes a leading whitespace character, which would otherwise report
      // the previous line. It also gives the more useful line for imports
      // whose bindings span several lines.
      const specifierOffset = match.index + match[0].lastIndexOf(specifier)
      const line = scannable.slice(0, specifierOffset).split('\n').length
      refs.push({ specifier, line })
    }
    match = pattern.exec(scannable)
  }

  return refs
}

/** Read a directory, returning an empty list when it does not exist. */
async function readDirSafe(dir: string): Promise<Dirent[]> {
  try {
    return await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

/** Convert an absolute path to a repository-relative POSIX path. */
function toRepoPath(root: string, absolute: string): string {
  return relative(root, absolute).split(sep).join('/')
}

/** Recursively collect `.ts` files under `dir`. */
async function collectSources(dir: string, root: string): Promise<SourceFile[]> {
  const out: SourceFile[] = []

  for (const entry of await readDirSafe(dir)) {
    if (SKIP_DIRECTORIES.has(entry.name)) continue
    const full = join(dir, entry.name)

    if (entry.isDirectory()) {
      out.push(...(await collectSources(full, root)))
      continue
    }
    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.d.ts')) continue

    const text = await readFile(full, 'utf8')
    out.push({ path: toRepoPath(root, full), text, imports: extractImports(text) })
  }

  return out
}

interface Manifest {
  name?: string
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

/** Load one package directory, or `null` if it has no usable manifest. */
async function loadPackage(dir: string, root: string): Promise<WorkspacePackage | null> {
  const manifestPath = join(dir, 'package.json')
  try {
    await stat(manifestPath)
  } catch {
    return null
  }

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Manifest
  if (manifest.name === undefined) return null

  return {
    name: manifest.name,
    dir: toRepoPath(root, dir),
    runtimeDependencies: [
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
    ],
    devDependencies: Object.keys(manifest.devDependencies ?? {}),
    sources: await collectSources(dir, root),
  }
}

/** Read every workspace package under `packages/` and `tools/`. */
export async function loadWorkspace(root: string): Promise<Workspace> {
  const packages: WorkspacePackage[] = []

  for (const group of ['packages', 'tools']) {
    for (const entry of await readDirSafe(join(root, group))) {
      if (!entry.isDirectory()) continue
      const pkg = await loadPackage(join(root, group, entry.name), root)
      if (pkg !== null) packages.push(pkg)
    }
  }

  return { root, packages }
}

/** Collect built `.d.ts` files, which is what the public-surface check inspects. */
export async function loadDeclarationFiles(
  root: string,
): Promise<Array<{ path: string; text: string }>> {
  const out: Array<{ path: string; text: string }> = []

  async function walk(dir: string): Promise<void> {
    for (const entry of await readDirSafe(dir)) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue
      const full = join(dir, entry.name)

      if (entry.isDirectory()) {
        await walk(full)
      } else if (entry.name.endsWith('.d.ts')) {
        out.push({ path: toRepoPath(root, full), text: await readFile(full, 'utf8') })
      }
    }
  }

  await walk(join(root, 'packages'))
  return out
}
