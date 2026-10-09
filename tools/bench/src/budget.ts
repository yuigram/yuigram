// SPDX-License-Identifier: MPL-2.0

/**
 * What a measurement is judged against.
 *
 * `docs/performance.md` §8 asks for benchmarks whose thresholds fail the build,
 * so that performance is a property under test rather than something noticed
 * once it has already gone wrong. The judging is separated from the measuring
 * because the two fail differently: a measurement can be noisy, and a verdict
 * has to be exact.
 *
 * Budgets are absolute and come from the specification — §2 for startup, §3 for
 * update processing — rather than being compared against a previous run. A
 * relative threshold would fail on whatever else the machine was doing, and a
 * benchmark that cries wolf is one people learn to re-run until it passes. The
 * documented budgets sit far enough above what the code costs today to absorb a
 * shared runner while still catching a change that alters the order of
 * magnitude, which is the kind of regression worth stopping a build for.
 *
 * A benchmark with no budget in the specification carries none here. Inventing
 * a number would make the suite assert something nobody decided.
 */

/** What a benchmark measured, in the unit it is budgeted in. */
export interface Measurement {
  /** The name `docs/performance.md` §8 gives it. */
  readonly name: string
  /** What was measured. */
  readonly value: number
  /** The unit `value` is in, for both the budget and the report. */
  readonly unit: string
  /** Anything else worth publishing alongside it, such as a throughput. */
  readonly note?: string
}

/** A benchmark, and how to run it. */
export interface Benchmark {
  readonly name: string
  /**
   * The most this may cost before the build fails.
   *
   * Omitted where the specification states no budget. Such a benchmark is
   * measured and reported but cannot fail: a threshold nobody agreed on would
   * be this file's opinion rather than the project's.
   */
  readonly budget?: number
  /** Where the budget comes from, so a reader can check it. */
  readonly source?: string
  run(): Promise<Measurement> | Measurement
}

/** What a run of the suite concluded. */
export interface Verdict {
  readonly measurement: Measurement
  readonly budget: number | undefined
  /** False only when a budget exists and was exceeded. */
  readonly within: boolean
}

/**
 * Judge one measurement.
 *
 * A benchmark without a budget is always within: there is nothing to exceed. A
 * measurement exactly at its budget passes, because a budget is a limit rather
 * than a value to stay under by some unstated margin.
 */
export function judge(benchmark: Benchmark, measurement: Measurement): Verdict {
  const budget = benchmark.budget

  return {
    measurement,
    budget,
    within: budget === undefined || measurement.value <= budget,
  }
}

/**
 * The middle of several samples.
 *
 * What a benchmark reports when it ran more than once. A mean would carry every
 * descheduled run into the figure a build is judged on, and the slow ones are
 * unbounded while the fast ones are not, so the average of a quiet machine and a
 * busy one is neither. The middle value is what the machine does most of the
 * time, which is what a budget is about.
 */
export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)

  return sorted[(sorted.length - 1) >> 1] ?? Number.NaN
}

/** Whether a whole run passed. Empty runs do not pass: nothing was measured. */
export function passed(verdicts: readonly Verdict[]): boolean {
  return verdicts.length > 0 && verdicts.every((verdict) => verdict.within)
}

/** One line of the report, for a person reading a build log. */
export function describe(verdict: Verdict): string {
  const { measurement, budget, within } = verdict
  const measured = `${round(measurement.value)} ${measurement.unit}`
  const against = budget === undefined ? 'no budget' : `budget ${round(budget)} ${measurement.unit}`
  const outcome = budget === undefined ? '' : within ? ' — within' : ' — EXCEEDED'
  const note = measurement.note === undefined ? '' : `, ${measurement.note}`

  return `${measurement.name.padEnd(22)} ${measured}${note}  (${against})${outcome}`
}

/** Enough digits to see a change, few enough to read. */
function round(value: number): string {
  if (value >= 100) return String(Math.round(value))

  return value.toFixed(value >= 10 ? 1 : 2)
}
