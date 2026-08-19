/**
 * Runs every architecture invariant and reports the result.
 *
 * Exit code 0 when the repository conforms, 1 when it does not. Intended to
 * run on every push; see `.github/workflows/ci.yml`.
 *
 * Output is plain text without colour codes: CI strips them, and the report
 * needs to stay readable in a log file long after the run.
 */

import process from 'node:process'
import { publicSurfaceIsClean, runWorkspaceInvariants } from './rules.js'
import type { InvariantResult } from './types.js'
import { loadDeclarationFiles, loadWorkspace } from './workspace.js'

function report(results: readonly InvariantResult[]): number {
  let failures = 0

  for (const result of results) {
    if (result.violations.length === 0) {
      process.stdout.write(`  PASS  ${result.name}\n`)
      continue
    }

    failures += result.violations.length
    process.stdout.write(`  FAIL  ${result.name}\n`)

    for (const violation of result.violations) {
      const where =
        violation.line === undefined ? violation.file : `${violation.file}:${violation.line}`
      process.stdout.write(`\n        ${where}\n`)
      process.stdout.write(`        ${violation.message}\n`)
      process.stdout.write(`        why: ${violation.rationale}\n`)
    }
    process.stdout.write('\n')
  }

  return failures
}

async function main(): Promise<void> {
  const root = process.cwd()

  process.stdout.write('architecture invariants\n\n')

  const workspace = await loadWorkspace(root)
  const results = [...runWorkspaceInvariants(workspace)]

  // The public-surface check reads built output. Skip it when nothing is built
  // yet, so a fresh clone reports honestly instead of passing vacuously.
  const declarations = await loadDeclarationFiles(root)
  if (declarations.length > 0) {
    results.push(publicSurfaceIsClean(declarations))
  } else {
    process.stdout.write('  SKIP  public-surface-is-clean (no build output; run `pnpm build`)\n')
  }

  const failures = report(results)

  if (failures > 0) {
    process.stdout.write(`\n${failures} violation(s) found\n`)
    process.exitCode = 1
    return
  }

  process.stdout.write(`\nall invariants hold (${workspace.packages.length} packages)\n`)
}

await main()
