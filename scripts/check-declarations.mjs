/**
 * Declaration size budget.
 *
 * A consumer's TypeScript server re-reads declaration files far more often than
 * most people assume, and generation is the one thing in this repository able
 * to produce a file large enough to matter. The measured reference in the
 * ecosystem is a 1.96 MB single declaration; the budget here is 300 KB per
 * file, and it is checked rather than asserted.
 *
 * Runs against built output, because that is what users receive.
 */

import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** Largest a single declaration file may be. */
const BUDGET = 300 * 1024

/** Packages whose built declarations are published. */
const ROOTS = ['packages/core/dist', 'packages/bot-api/dist', 'packages/mtproto/dist', 'packages/yuigram/dist']

/** Every `.d.ts` under a directory. */
function declarations(directory) {
  const found = []
  let entries

  try {
    entries = readdirSync(directory, { withFileTypes: true })
  } catch {
    return found
  }

  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) found.push(...declarations(path))
    else if (entry.name.endsWith('.d.ts')) found.push(path)
  }

  return found
}

const files = ROOTS.flatMap(declarations)

if (files.length === 0) {
  process.stderr.write('no declaration files found; run the build first\n')
  process.exit(1)
}

const measured = files
  .map((path) => ({ path, size: statSync(path).size }))
  .sort((a, b) => b.size - a.size)

const over = measured.filter((file) => file.size > BUDGET)
const kb = (size) => `${(size / 1024).toFixed(0)} KB`

process.stdout.write(`declaration budget: ${kb(BUDGET)} per file\n\n`)

for (const file of measured.slice(0, 5)) {
  process.stdout.write(`  ${kb(file.size).padStart(7)}  ${file.path}\n`)
}

if (over.length > 0) {
  process.stdout.write(`\n${over.length} file(s) over budget:\n`)
  for (const file of over) process.stdout.write(`  ${kb(file.size)}  ${file.path}\n`)
  process.stdout.write(
    '\nSplit the generator output further rather than raising the budget: the cost\n' +
      "is paid by every consumer's editor, on every keystroke.\n",
  )
  process.exit(1)
}

process.stdout.write(`\n${measured.length} declaration files, all within budget\n`)
