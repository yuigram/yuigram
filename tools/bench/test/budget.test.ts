// SPDX-License-Identifier: MPL-2.0

/**
 * Judging a measurement against what the specification allows.
 *
 * Measuring is noisy and judging is not, which is why they are separate and why
 * only this half is under test. What matters here is that a build fails when a
 * budget is exceeded and does not fail for any other reason: a suite that
 * reported a breach it had not seen would be as useless as one that missed a
 * real one, and both are cheap mistakes to make in a reporting path nobody
 * reads until it goes wrong.
 */

import { describe, expect, it } from 'vitest'
import { type Benchmark, judge, median, passed, describe as report } from '../src/budget.js'

/** A benchmark that reports whatever a case tells it to. */
const benchmark = (budget: number | undefined, value: number): [Benchmark, number] => [
  {
    name: 'dispatch/simple',
    ...(budget === undefined ? {} : { budget }),
    run: () => ({ name: 'dispatch/simple', value, unit: 'µs/update' }),
  },
  value,
]

const measured = (value: number, unit = 'µs/update', note?: string) => ({
  name: 'dispatch/simple',
  value,
  unit,
  ...(note === undefined ? {} : { note }),
})

describe('judging one measurement', () => {
  it('passes a measurement under its budget', () => {
    const [subject] = benchmark(1000, 6.5)

    expect(judge(subject, measured(6.5)).within).toBe(true)
  })

  it('fails a measurement over its budget', () => {
    const [subject] = benchmark(1000, 1200)

    expect(judge(subject, measured(1200)).within).toBe(false)
  })

  it('passes a measurement exactly at its budget', () => {
    // A budget is a limit, not a number to stay under by some margin nobody
    // wrote down. Reporting the boundary as a breach would fail builds for
    // reaching the value the specification permits.
    const [subject] = benchmark(1000, 1000)

    expect(judge(subject, measured(1000)).within).toBe(true)
  })

  it('passes a benchmark with no budget, whatever it measured', () => {
    // A threshold nobody agreed on is this file's opinion. Such a benchmark is
    // measured and reported, and cannot fail a build.
    const [subject] = benchmark(undefined, 1_000_000)

    const verdict = judge(subject, measured(1_000_000))
    expect(verdict.within).toBe(true)
    expect(verdict.budget).toBeUndefined()
  })

  it('carries the measurement and the budget through', () => {
    const [subject] = benchmark(1000, 6.5)
    const verdict = judge(subject, measured(6.5))

    expect(verdict.measurement.value).toBe(6.5)
    expect(verdict.budget).toBe(1000)
  })
})

describe('judging a whole run', () => {
  const within = { measurement: measured(1), budget: 1000, within: true }
  const over = { measurement: measured(2000), budget: 1000, within: false }

  it('passes when every benchmark is within budget', () => {
    expect(passed([within, within])).toBe(true)
  })

  it('fails when any benchmark is over', () => {
    expect(passed([within, over, within])).toBe(false)
  })

  it('fails a run that measured nothing', () => {
    // A suite that found no benchmarks has proved nothing, and a green build
    // from an empty run is the failure that hides every other one.
    expect(passed([])).toBe(false)
  })
})

describe('reducing several samples to one', () => {
  it('reports the middle of an odd number of samples', () => {
    expect(median([80, 74, 300, 76, 78])).toBe(78)
  })

  it('reports the lower middle of an even number', () => {
    // Either middle is defensible; picking one and saying so is what stops the
    // figure moving when a run happens to have an extra sample in it.
    expect(median([70, 80, 90, 100])).toBe(80)
  })

  it('is unmoved by a single slow run', () => {
    // The reason a median is used at all. A machine that descheduled one
    // process must not fail a build, and a mean would let it.
    expect(median([70, 71, 72, 73, 5000])).toBe(72)
  })

  it('does not disturb the samples it was given', () => {
    const samples = [90, 70, 80]
    median(samples)

    expect(samples).toEqual([90, 70, 80])
  })

  it('reports one sample as itself', () => {
    expect(median([42])).toBe(42)
  })

  it('reports nothing measurable when there are no samples', () => {
    // Not zero: a benchmark that measured nothing is within every budget, and
    // that is the one answer it must not give.
    expect(Number.isNaN(median([]))).toBe(true)
  })
})

describe('what the report says', () => {
  it('names the benchmark, what it measured, and what it was allowed', () => {
    const line = report({ measurement: measured(6.5), budget: 1000, within: true })

    expect(line).toContain('dispatch/simple')
    expect(line).toContain('6.50 µs/update')
    expect(line).toContain('budget 1000 µs/update')
    expect(line).toContain('within')
  })

  it('says plainly when a budget was exceeded', () => {
    const line = report({ measurement: measured(1200), budget: 1000, within: false })

    expect(line).toContain('EXCEEDED')
    expect(line).not.toContain('— within')
  })

  it('says there is no budget rather than inventing one', () => {
    const line = report({ measurement: measured(6.5), budget: undefined, within: true })

    expect(line).toContain('no budget')
    expect(line).not.toContain('EXCEEDED')
    expect(line).not.toContain('within')
  })

  it('carries a note where a benchmark has one to publish', () => {
    const line = report({
      measurement: measured(6.5, 'µs/update', '154,000 updates/sec'),
      budget: 1000,
      within: true,
    })

    expect(line).toContain('154,000 updates/sec')
  })

  it('keeps enough digits to see a change at every scale', () => {
    // A run that printed `0` for six microseconds and `0` for sixty would hide
    // the regression between them.
    expect(report({ measurement: measured(6.543), budget: 1000, within: true })).toContain('6.54')
    expect(report({ measurement: measured(65.43), budget: 1000, within: true })).toContain('65.4')
    expect(report({ measurement: measured(654.3), budget: 1000, within: true })).toContain('654')
  })
})
