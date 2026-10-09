// SPDX-License-Identifier: MIT

/**
 * The benchmark suite.
 *
 * `docs/performance.md` §8 asks for benchmarks tracked in CI whose thresholds
 * fail the build, so that performance is a property under test rather than an
 * occasional investigation. This runs them, judges each against the budget its
 * section of that document states, prints what a release can publish, and exits
 * non-zero if anything is over.
 *
 * ```sh
 * pnpm bench
 * ```
 *
 * It runs against the built packages rather than the sources, because what a
 * program loads is the build — and the cost of loading it is one of the things
 * being measured.
 *
 * Benchmarks §8 names that are not here yet carry no budget in the
 * specification, or need a fixture project of their own. They are listed at the
 * end of the run rather than quietly omitted, so the gap between what is
 * measured and what was asked for stays visible.
 */

import { type Benchmark, describe, judge, onTarget, passed, type Verdict } from './budget.js'
import { BUNDLE } from './cases/bundle.js'
import { DISPATCH } from './cases/dispatch.js'
import { STARTUP } from './cases/startup.js'

const BENCHMARKS: readonly Benchmark[] = [...STARTUP, ...BUNDLE, ...DISPATCH]

/**
 * What §8 asks for and this does not measure yet.
 *
 * Named here so a reader comparing the two does not have to guess whether a
 * missing benchmark was forgotten or deferred.
 */
const NOT_YET: readonly string[] = [
  'context/lazy, tl/serialize, crypto/aes-ige — measurable, but no budget is set',
  'types/check, types/autocomplete — need a fixture project and an editor harness',
  'performance.md §7 also budgets a serverless cold start. It is a property of a',
  '  platform rather than of this package, and the mechanism it names — a small eager',
  '  surface — is what startup/import and the eager-surfaces invariant already hold.',
]

async function main(): Promise<void> {
  process.stdout.write('benchmarks\n\n')

  const verdicts: Verdict[] = []
  for (const benchmark of BENCHMARKS) {
    const verdict = judge(benchmark, await benchmark.run())
    verdicts.push(verdict)
    process.stdout.write(`  ${describe(verdict)}\n`)
  }

  process.stdout.write('\nnot measured yet\n')
  for (const gap of NOT_YET) process.stdout.write(`  ${gap}\n`)

  // Passing by the tolerance is still a missed target, and is annotated as one
  // so that it stays visible on a green build.
  for (const verdict of verdicts.filter((one) => one.within && !onTarget(one))) {
    process.stderr.write(
      `::warning::${verdict.measurement.name} is over its target, within the tolerance\n`,
    )
  }

  if (passed(verdicts)) {
    process.stdout.write(`\nall ${verdicts.length} within their limits\n`)

    return
  }

  for (const verdict of verdicts.filter((one) => !one.within)) {
    process.stderr.write(`::error::${verdict.measurement.name} is over budget\n`)
  }

  process.exitCode = 1
}

await main()
