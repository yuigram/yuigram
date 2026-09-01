/**
 * Ordered, bounded concurrency.
 *
 * Transport-neutral: what a key means is decided by the caller.
 */

export {
  createScheduler,
  type DrainOptions,
  type Scheduler,
  type SchedulerOptions,
} from './scheduler.js'
