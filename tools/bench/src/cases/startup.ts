// SPDX-License-Identifier: MPL-2.0

/**
 * What it costs to load the framework.
 *
 * `docs/performance.md` §2 budgets a cold `import 'yuigram'` at under 100 ms and
 * says the mechanism is keeping the eager surface small. That is a budget on
 * module evaluation, so it is measured the only way it is honestly measurable:
 * a fresh process per sample, timing one dynamic import of the built entry
 * point and nothing else. Importing twice in one process measures the module
 * cache.
 *
 * The first sample is discarded. A file the operating system has never read
 * costs a disk seek rather than a parse, and the entry point reaches several
 * hundred files — enough for the first run on a cold cache to take seconds and
 * say nothing about the framework. Every sample after it reads the same files
 * from the page cache, which is the state a process on a working machine
 * actually starts in. The median of the rest is reported, so one descheduled
 * process cannot move the figure either way.
 */

import { execFileSync } from 'node:child_process'
import { type Benchmark, type Measurement, median } from '../budget.js'

/** The budget §2 sets for loading the entry point, in milliseconds. */
const BUDGET = 100
const SOURCE = 'performance.md §2'

/** One discarded, the rest reported. */
const WARMUP = 1
const SAMPLES = 7

/**
 * The entry point a user installs, as it is built.
 *
 * Passed to the child as a URL rather than a path: a Windows path is not a
 * specifier `import()` accepts, and the failure it produces names the scheme
 * rather than the mistake.
 */
const ENTRY = new URL('../../../../packages/yuigram/dist/index.js', import.meta.url).href

/**
 * Time one import in a process that has done nothing else.
 *
 * The child times itself rather than being timed from here, so the figure
 * excludes starting Node — which a user pays once for their program, not for
 * this import.
 */
const CHILD = `
const started = performance.now()
await import(process.env.YUIGRAM_BENCH_ENTRY)
process.stdout.write(String(performance.now() - started))
`

function sample(entry: string): number {
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', CHILD], {
    encoding: 'utf8',
    env: { ...process.env, YUIGRAM_BENCH_ENTRY: entry },
  })

  const value = Number(output)
  if (!Number.isFinite(value)) throw new Error(`the import probe reported '${output}'`)

  return value
}

const entryImport: Benchmark = {
  name: 'startup/import',
  budget: BUDGET,
  source: SOURCE,
  run: (): Measurement => {
    for (let index = 0; index < WARMUP; index += 1) sample(ENTRY)

    const samples: number[] = []
    for (let index = 0; index < SAMPLES; index += 1) samples.push(sample(ENTRY))

    const low = Math.min(...samples)
    const high = Math.max(...samples)

    return {
      name: 'startup/import',
      value: median(samples),
      unit: 'ms',
      note: `${SAMPLES} runs, ${low.toFixed(0)}–${high.toFixed(0)} ms`,
    }
  },
}

export const STARTUP: readonly Benchmark[] = [entryImport]
