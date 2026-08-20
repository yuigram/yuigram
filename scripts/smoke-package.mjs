/**
 * Package smoke test.
 *
 * Packs the publishable packages, installs the tarballs into a throwaway
 * project, and uses them the way an application would. It is the only check
 * that sees what a user actually receives: everything else in the repository
 * imports through workspace paths, where a broken `exports` map, a file left
 * out of `files`, or a subpath that resolves at compile time and not at run
 * time are all invisible.
 *
 * Run it before publishing:
 *
 * ```sh
 * pnpm smoke
 * ```
 *
 * `pnpm pack` is used rather than `npm pack` deliberately. The manifests
 * declare `workspace:*` dependencies, which npm cannot resolve; pnpm rewrites
 * them to real versions on the way into the tarball, exactly as publishing
 * does.
 */

import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))

/** Packages that are published, in dependency order. */
const PACKAGES = ['core', 'bot-api', 'mtproto', 'yuigram']

/** Consumer module resolutions worth proving, since each resolves types differently. */
const RESOLUTIONS = [
  ['nodenext', 'nodenext'],
  ['bundler', 'esnext'],
  ['node16', 'node16'],
]

/** Run a command, returning stdout and throwing with its output on failure. */
function run(command, args, cwd) {
  try {
    return execFileSync(command, args, { cwd, encoding: 'utf8', stdio: 'pipe', shell: true })
  } catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim()
    throw new Error(`${command} ${args.join(' ')} failed\n${output}`)
  }
}

const workspace = mkdtempSync(join(tmpdir(), 'yuigram-smoke-'))
let failed = false

try {
  process.stdout.write('building\n')
  run('pnpm', ['build'], root)

  process.stdout.write('packing\n')
  // The archive is named for the version, so its name cannot be assumed: it
  // changes the moment a release bumps the version, which is exactly when this
  // check matters most. Each package reports the file it produced.
  const archives = new Map()

  for (const name of PACKAGES) {
    const manifest = JSON.parse(readFileSync(join(root, 'packages', name, 'package.json'), 'utf8'))
    if (manifest.private === true) continue

    run('pnpm', ['pack', '--pack-destination', JSON.stringify(workspace)], join(root, 'packages', name))

    const archive = readdirSync(workspace).find(
      (file) => file.endsWith('.tgz') && !archives.has(file),
    )
    if (archive === undefined) throw new Error(`no archive was produced for ${manifest.name}`)

    archives.set(archive, manifest.name)
  }

  const dependencies = {}
  for (const [archive, packageName] of archives) {
    dependencies[packageName] = `./${archive}`
  }

  writeFileSync(
    join(workspace, 'package.json'),
    `${JSON.stringify(
      { name: 'yuigram-smoke', private: true, type: 'module', dependencies },
      null,
      2,
    )}\n`,
  )

  process.stdout.write('installing\n')
  run('npm', ['install', '--no-audit', '--no-fund', '--silent'], workspace)

  copyFileSync(join(root, 'scripts/smoke-fixtures/runtime.mjs'), join(workspace, 'runtime.mjs'))
  process.stdout.write('running\n')
  process.stdout.write(run('node', ['runtime.mjs'], workspace))

  copyFileSync(join(root, 'scripts/smoke-fixtures/types.ts'), join(workspace, 'types.ts'))
  run('npm', ['install', '--no-audit', '--no-fund', '--silent', 'typescript@5'], workspace)

  for (const [resolution, module] of RESOLUTIONS) {
    writeFileSync(
      join(workspace, 'tsconfig.json'),
      `${JSON.stringify(
        {
          compilerOptions: {
            target: 'es2023',
            module,
            moduleResolution: resolution,
            strict: true,
            noEmit: true,
            skipLibCheck: true,
            types: [],
          },
          files: ['types.ts'],
        },
        null,
        2,
      )}\n`,
    )

    run('npx', ['tsc', '-p', 'tsconfig.json'], workspace)
    process.stdout.write(`  ok    types resolve under moduleResolution=${resolution}\n`)
  }

  process.stdout.write('\nthe published packages work as installed\n')
} catch (error) {
  failed = true
  process.stderr.write(`\n${error instanceof Error ? error.message : String(error)}\n`)
} finally {
  rmSync(workspace, { recursive: true, force: true })
}

process.exit(failed ? 1 : 0)
