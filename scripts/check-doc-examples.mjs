// SPDX-License-Identifier: MPL-2.0

/**
 * Type-check the code in the documentation against the built packages.
 *
 * ```sh
 * pnpm check:docs
 * ```
 *
 * Every ```ts block of the pages below is written to a module of its own and compiled with
 * `tsc --noEmit`, strict, one program per page, against `yuigram` as the workspace builds it.
 * The modules live under `examples/.doc-check/`, which `examples/` already resolves the packages
 * from and which is ignored by git.
 *
 * Fragments name things a page made elsewhere — `bot`, `message`, a document an account read.
 * Those are declared in `scripts/doc-examples/`, typed with the package's own exports and
 * nothing looser, so a fragment that misuses one fails here as it would in an application.
 *
 * What passing shows, and what it does not: every sample names APIs that exist, with arguments
 * and results of the right types. Nothing is run. A sample that signs in, connects or sends is
 * compiled, not executed, so its effect on Telegram is not checked by this.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const declarations = join(root, 'scripts', 'doc-examples')
const out = join(root, 'examples', '.doc-check')

/** The pages checked, and what each one's fragments stand on besides `shared.d.ts`. */
const PAGES = [
  { page: 'README.md', context: ['bot.d.ts'] },
  { page: 'README.ru.md', context: ['bot.d.ts'] },
  { page: 'packages/yuigram/README.md', context: ['bot.d.ts', 'package-readme.d.ts'] },
  { page: 'docs/api-design.md', context: ['api-design.d.ts'] },
  ...readdirSync(join(root, 'docs', 'ru'))
    .filter((name) => name.endsWith('.md'))
    .sort()
    .map((name) => ({
      page: `docs/ru/${name}`,
      context: name === 'state.md' ? ['ru-state.d.ts'] : ['bot.d.ts'],
    })),
]

const COMPILER_OPTIONS = {
  target: 'es2023',
  module: 'nodenext',
  moduleResolution: 'nodenext',
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  types: ['node'],
  lib: ['es2023'],
}

if (!existsSync(join(root, 'packages', 'yuigram', 'dist', 'index.d.ts'))) {
  process.stderr.write('the packages are not built; run `pnpm build` first\n')
  process.exit(2)
}

rmSync(out, { recursive: true, force: true })

const tsc = join(root, 'node_modules', 'typescript', 'bin', 'tsc')
let failed = 0
let total = 0

for (const { page, context } of PAGES) {
  const text = readFileSync(join(root, page), 'utf8').replace(/\r\n/g, '\n')
  const directory = join(out, page.replace(/[\\/]/g, '__').replace(/\.md$/, ''))
  mkdirSync(directory, { recursive: true })

  const lines = new Map()
  let count = 0
  for (const block of text.matchAll(/^```ts\n([\s\S]*?)^```/gm)) {
    count += 1
    const line = text.slice(0, block.index).split('\n').length + 1
    const file = `block-${String(count).padStart(3, '0')}.ts`
    const code = block[1]
    const module = /^\s*(import|export)\s/m.test(code) ? code : `${code}\nexport {}\n`
    writeFileSync(join(directory, file), module)
    lines.set(file, line)
  }

  if (count === 0) continue
  total += count

  for (const name of ['shared.d.ts', ...context]) {
    writeFileSync(join(directory, name), readFileSync(join(declarations, name)))
  }
  writeFileSync(join(directory, 'package.json'), '{ "type": "module" }\n')
  writeFileSync(
    join(directory, 'tsconfig.json'),
    `${JSON.stringify({ compilerOptions: COMPILER_OPTIONS, include: ['*.ts'] }, null, 2)}\n`,
  )

  let report = ''
  try {
    execFileSync(process.execPath, [tsc, '-p', directory], { encoding: 'utf8', stdio: 'pipe' })
  } catch (error) {
    report = `${error.stdout ?? ''}${error.stderr ?? ''}`
  }

  const errors = report
    .split('\n')
    .filter((line) => /error TS\d+/.test(line))
    .map((line) =>
      line.replace(/^.*?(block-\d+\.ts)\((\d+),(\d+)\)/, (_, file, row) => {
        const start = lines.get(file)
        return start === undefined ? `${page}: ${file}` : `${page}:${start + Number(row) - 1}`
      }),
    )

  if (errors.length === 0) {
    process.stdout.write(`  ok    ${page} (${count} blocks)\n`)
  } else {
    failed += 1
    process.stdout.write(`  FAIL  ${page} (${count} blocks)\n`)
    for (const error of errors) process.stdout.write(`        ${error}\n`)
  }
}

process.stdout.write(
  failed === 0
    ? `\n${total} documentation samples type-check against the built packages\n`
    : `\n${failed} page(s) have samples that do not type-check\n`,
)
process.exit(failed === 0 ? 0 : 1)
