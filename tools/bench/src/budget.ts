// SPDX-License-Identifier: MIT

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
 *
 * A budget can come with a tolerance, where the specification states one: how
 * far over the budget a measurement may go before the build fails. The budget
 * stays the target, and the report says when a measurement passed only by the
 * tolerance, so passing the gate is never presented as meeting the target.
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
  /**
   * How far over `budget` a measurement may go and still pass, in the same
   * unit. Omitted where the specification states none, which makes the budget
   * itself the limit. Meaningless without a budget.
   */
  readonly tolerance?: number
  /** Where the budget comes from, so a reader can check it. */
  readonly source?: string
  run(): Promise<Measurement> | Measurement
}

/** What a run of the suite concluded. */
export interface Verdict {
  readonly measurement: Measurement
  /** The target. */
  readonly budget: number | undefined
  /** How far over the budget still passes; zero where none was set. */
  readonly tolerance: number
  /** False only when a budget exists and was exceeded by more than the tolerance. */
  readonly within: boolean
}

/**
 * Judge one measurement.
 *
 * A benchmark without a budget is always within: there is nothing to exceed. A
 * measurement exactly at its limit — the budget, plus the tolerance if there is
 * one — passes, because a limit is a limit rather than a value to stay under by
 * some unstated margin.
 */
export function judge(benchmark: Benchmark, measurement: Measurement): Verdict {
  const budget = benchmark.budget
  const tolerance = benchmark.tolerance ?? 0

  return {
    measurement,
    budget,
    tolerance,
    within: budget === undefined || measurement.value <= budget + tolerance,
  }
}

/** Whether a verdict met its budget itself, rather than passing by the tolerance. */
export function onTarget(verdict: Verdict): boolean {
  return verdict.budget === undefined || verdict.measurement.value <= verdict.budget
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
  const { measurement, budget, tolerance, within } = verdict
  const unit = measurement.unit
  const measured = `${round(measurement.value)} ${unit}`
  const against =
    budget === undefined
      ? 'no budget'
      : tolerance === 0
        ? `budget ${round(budget)} ${unit}`
        : `target ${round(budget)} ${unit}, fails above ${round(budget + tolerance)} ${unit}`
  const outcome =
    budget === undefined
      ? ''
      : !within
        ? ' — EXCEEDED'
        : onTarget(verdict)
          ? ' — within'
          : ' — over the target, within the tolerance'
  const note = measurement.note === undefined ? '' : `, ${measurement.note}`

  return `${measurement.name.padEnd(22)} ${measured}${note}  (${against})${outcome}`
}

/** Enough digits to see a change, few enough to read. */
function round(value: number): string {
  if (value >= 100) return String(Math.round(value))

  return value.toFixed(value >= 10 ? 1 : 2)
}
