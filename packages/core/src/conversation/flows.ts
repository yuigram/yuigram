// SPDX-License-Identifier: MPL-2.0

/**
 * Durable flows: a conversation written as one function, resumed after a restart.
 *
 * A scene survives a restart because its position is plain data. A flow keeps
 * the ergonomics of writing the conversation top to bottom — ask, wait, act,
 * ask again — and survives a restart the same way: nothing it keeps is a
 * closure. What is kept is a journal of what each step produced.
 *
 * ```
 *   run(flow, input)
 *     ├── flow.ask('name', …)     journal[0] question sent   journal[1] 'Ada'
 *     ├── flow.effect('save', …)  journal[2] started → done, with its result
 *     └── flow.ask('age', …)      journal[3] question sent   ── waiting at 4
 * ```
 *
 * **Resuming is replaying.** When an update arrives for a conversation whose
 * flow is waiting, the flow's function runs again from the top, in whatever
 * process is running now, with definitions registered again under the same
 * names. Every step already in the journal returns what it returned the first
 * time without doing anything, and the step the flow was waiting at is offered
 * the update. From there on the function runs for real until it waits again,
 * which unwinds it, or finishes.
 *
 * That makes one rule non-negotiable: **the function must take the same path
 * given the same journal.** Anything that reaches outside — a message, a
 * database write, the clock, a random number — goes through `flow.effect`,
 * whose result is recorded. Code between steps runs again on every resume and
 * must not do anything that matters twice. A resume that finds a different
 * step where the journal has one stops without writing and reports it: the
 * definition changed without its version changing, and guessing would mean
 * running someone's conversation down a path it never took.
 *
 * **What an effect promises.** Before an effect runs, the flow records that it
 * started; after it returns, the flow records its result. A stop between the
 * two — a crash, a deployment, a store that failed — leaves an effect whose
 * outcome nobody can know. It is not quietly run again: the flow is handed an
 * {@link EffectUncertainError} at that step, unless the effect was declared
 * safe to repeat, in which case it runs again with the same idempotency key.
 * Nothing here is exactly-once delivery to Telegram; it is at-most-once by
 * default and at-least-once where the application says repeating is safe.
 *
 * **What is serialised and what is not.** Updates for one conversation are
 * handled one at a time within one process, so two answers arriving together
 * cannot both advance one wait. Two processes sharing a store are not
 * coordinated: the storage contract has no compare-and-set, and nothing here
 * pretends otherwise. Run one process per conversation, or route each
 * conversation to one process.
 */

import { ConfigError, ValidationError } from '../errors/errors.js'
import { LifecycleError } from '../lifecycle/lifecycle.js'
import { createLogger, type Logger } from '../log/logger.js'
import type { KV } from '../storage/types.js'
import type { Addressed, ConversationLocks } from './identity.js'
import {
  EffectUncertainError,
  FlowStepError,
  WaitCancelledError,
  WaitTimeoutError,
} from './waiters.js'

/** The layout a stored run is written in. A run in another layout is not guessed at. */
export const FLOW_FORMAT = 1

/** Where a run was started: enough to reach the conversation without an update. */
export interface FlowAddress {
  readonly client: string
  readonly chat?: number | string
  readonly user?: number | string
  readonly topic?: number
}

/** A failure as it is kept: what it was called and what it said. */
export interface FlowFailure {
  readonly name: string
  readonly message: string
}

/** One step's outcome, as the journal keeps it. */
export type FlowEntry =
  | {
      readonly kind: 'effect'
      readonly label: string
      readonly state: 'started'
      readonly attempt: number
    }
  | {
      readonly kind: 'effect'
      readonly label: string
      readonly state: 'done'
      readonly attempt: number
      readonly value?: unknown
    }
  | {
      readonly kind: 'effect'
      readonly label: string
      readonly state: 'failed'
      readonly attempt: number
      readonly error: FlowFailure
    }
  | {
      readonly kind: 'answer'
      readonly label: string
      readonly value?: unknown
      readonly by?: string
    }
  | { readonly kind: 'timeout'; readonly label: string }
  | { readonly kind: 'cancelled'; readonly label: string; readonly reason: string }
  | { readonly kind: 'error'; readonly label: string; readonly error: FlowFailure }

/** The wait a run is suspended at. */
export interface FlowWaiting {
  /** Its place in the journal, which is always the journal's length. */
  readonly at: number
  readonly label: string
  /** When it was armed. */
  readonly since: number
  /** When it stops waiting, in milliseconds since the epoch. */
  readonly deadline?: number
  /** How many answers were rejected by its validation. */
  readonly attempts: number
}

/** Where a run is in its life. */
export type FlowState = 'active' | 'done' | 'cancelled' | 'failed'

/** A run, as it is stored. Plain data throughout. */
export interface FlowRecord {
  readonly format: typeof FLOW_FORMAT
  /** This run's identity, unique across runs. */
  readonly run: string
  /** The definition's name. */
  readonly flow: string
  /** The definition's version when the run started. */
  readonly version: number
  /** The conversation it belongs to. */
  readonly key: string
  readonly address: FlowAddress
  readonly input?: unknown
  readonly status: FlowState
  readonly journal: readonly FlowEntry[]
  readonly waiting?: FlowWaiting
  /** The update that started it, so a redelivery does not start it again. */
  readonly startedBy?: string
  readonly started: number
  readonly updated: number
  readonly result?: unknown
  readonly reason?: string
  readonly error?: FlowFailure
}

/** What a caller is told about a run. */
export interface FlowStatus {
  readonly run: string
  readonly flow: string
  readonly version: number
  readonly status: FlowState
  readonly waitingFor?: {
    readonly label: string
    readonly deadline?: number
    readonly attempts: number
  }
  readonly result?: unknown
  readonly reason?: string
  readonly error?: FlowFailure
  readonly started: number
  readonly updated: number
}

/**
 * What a flow waits for.
 *
 * The same shape as an in-memory wait, with one difference: `transform` is
 * required, because what it returns is written down and replayed, and an
 * update — a context with a client and methods on it — is not something that
 * can be written down.
 */
export interface FlowWaitSpec<C, T> {
  /** Whether this update is the answer. */
  match(context: C): boolean | Promise<boolean>
  /** What of it the flow keeps. Plain data. */
  transform(context: C): T | Promise<T>
  /** Reject an answer; a string says why. The wait stays open. */
  validate?(value: T, context: C): boolean | string | Promise<boolean | string>
  /** Told about a rejected answer, as it arrives. Not replayed. */
  onInvalid?(reason: string | undefined, context: C): unknown
  /** Milliseconds before the wait gives up with a `WaitTimeoutError`. */
  readonly timeout?: number
  /** Whether the answer stops here. Defaults to true. */
  readonly consume?: boolean
  /** Whether an update that is not the answer stops here too. Defaults to false. */
  readonly exclusive?: boolean
}

/** What an effect is handed. */
export interface EffectOnce {
  /** Stable for this step of this run, across attempts and restarts. */
  readonly key: string
  /**
   * A 64-bit identifier derived from {@link EffectOnce.key}.
   *
   * Shaped for the places Telegram deduplicates by a client-chosen number,
   * such as the `random_id` of an MTProto send, so that a repeated effect
   * reaches Telegram as the same request rather than a second one.
   */
  readonly id: bigint
  /** 1, or more when the effect is being run again after an uncertain stop. */
  readonly attempt: number
}

/** How an effect behaves when its outcome is unknown after a stop. */
export interface EffectOptions {
  /**
   * Whether running it again is safe.
   *
   * False by default: the flow is told the outcome is uncertain instead. True
   * for effects that are idempotent — ones keyed by {@link EffectOnce.key} or
   * {@link EffectOnce.id}, or that only read.
   */
  readonly repeat?: boolean
}

/** Why the function is running this time. */
export type FlowDrive = 'start' | 'update' | 'deadline' | 'cancel'

/** What a flow's function is handed. */
export interface Flow<C> {
  readonly name: string
  /** This run's identity. */
  readonly run: string
  /** The conversation it belongs to. */
  readonly key: string
  /** Where it was started, for acting without an update. */
  readonly address: FlowAddress
  /** Why the function is running now. */
  readonly resumedBy: FlowDrive
  /** Whether an update is driving this run of the function. */
  readonly hasContext: boolean
  /**
   * The update driving this run of the function.
   *
   * Changes from one resume to the next, so it is for acting — inside an
   * effect — and never for deciding which way the flow goes: a decision made
   * on it would not be made the same way when the journal is replayed under a
   * different update. Throws when a deadline or an outside cancellation is
   * what is driving the function, because there is then no update.
   */
  readonly context: C
  /** Wait for an answer in this conversation. */
  wait<T>(label: string, spec: FlowWaitSpec<C, T>): Promise<T>
  /**
   * Say something, then wait for the answer.
   *
   * The question is an effect, sent once; after an uncertain stop it is sent
   * again unless `repeatQuestion` is false, because a question asked twice is
   * recoverable and a question never asked strands the person answering it.
   */
  ask<T>(
    label: string,
    question: (context: C, once: EffectOnce) => unknown,
    spec: FlowWaitSpec<C, T> & { readonly repeatQuestion?: boolean },
  ): Promise<T>
  /** Do something outside, and keep what it produced. */
  effect<T>(
    label: string,
    run: (once: EffectOnce) => T | Promise<T>,
    options?: EffectOptions,
  ): Promise<T>
}

/** A flow, registered by name. */
export interface FlowDefinition<C = never, I = unknown, R = unknown> {
  readonly name: string
  /** Raise it whenever the steps change. Defaults to 1. */
  readonly version?: number
  /**
   * The versions whose runs this definition can resume.
   *
   * Defaults to its own version alone. A change that only appends steps after
   * the last one leaves older runs replayable, and saying so here lets them
   * continue.
   */
  readonly accepts?: readonly number[]
  run(flow: Flow<C>, input: I): R | Promise<R>
}

/** Something that stopped a run from being resumed, reported rather than thrown. */
export interface FlowProblem {
  readonly kind: 'missing' | 'incompatible' | 'invalid' | 'diverged' | 'failed'
  readonly key: string
  readonly flow?: string
  readonly run?: string
  readonly detail: string
  readonly error?: unknown
}

/** How flows are configured on the conversation plugin. */
export interface FlowOptions<C> {
  /** Where runs are kept. A store that survives a restart, for a flow that has to. */
  readonly storage: KV<FlowRecord>
  /** The flows this application has. */
  readonly define?: readonly FlowDefinition<C, never, unknown>[]
  /** Seconds a finished run is kept, for inspection and redelivered updates. Defaults to a day. */
  readonly retain?: number
  /** The most steps one run may take. Defaults to 1000. */
  readonly maxSteps?: number
  /** The identity of an update, to recognise one delivered twice. */
  readonly identify?: (context: C) => string | undefined
  /** Told when a run cannot be resumed or a deadline's continuation fails. */
  readonly onProblem?: (problem: FlowProblem) => void
  /** Where problems are logged when nobody is told. */
  readonly log?: Logger
  /** The clock. Supplied so tests need not wait in real time. */
  readonly now?: () => number
}

/** What looking through the store at startup found. */
export interface FlowResumeReport {
  /** Runs still in progress. */
  readonly active: number
  /** Deadlines scheduled in this process. */
  readonly scheduled: number
  /** Deadlines that passed while nothing was running, acted on now. */
  readonly expired: number
  /** Runs that cannot be resumed here, each reported. */
  readonly problems: number
}

/** What an engine is built with. */
export interface FlowEngineOptions<C> extends FlowOptions<C> {
  readonly locks: ConversationLocks
  readonly schedule: (run: () => void, delayMs: number) => () => void
}

/**
 * What a step hands back when the function has to stop where it is.
 *
 * A promise that never settles, rather than something thrown: a `catch` or a
 * `.catch(...)` around a wait — the ordinary way to handle its timeout — would
 * otherwise catch the stop too and carry on as though the wait had failed. The
 * function's frame is left suspended and nothing refers to it once the pass is
 * over, so it is collected like any other unreachable promise.
 */
const halt = <T>(): Promise<T> => new Promise<T>(() => {})

const DEFAULT_RETAIN = 24 * 60 * 60
const DEFAULT_MAX_STEPS = 1000

/** What a pass needs from the engine that runs it. */
interface PassHost {
  now(): number
  readonly maxSteps: number
  save(record: FlowRecord): Promise<void>
}

/** What is driving one run of a flow's function. */
interface Drive<C> {
  readonly kind: FlowDrive
  readonly context?: C
  readonly identity?: string
  readonly reason?: string
}

/**
 * One run of a flow's function, from the top to its next wait or its end.
 *
 * Holds the journal as it grows, and writes it down at every point after
 * which a stop must not lose what happened: before an effect, after it, and
 * when a wait is answered or armed.
 */
class Pass<C> {
  readonly flow: Flow<C>
  readonly journal: FlowEntry[]
  /** The wait the stored run was suspended at, if any. */
  readonly pending: FlowWaiting | undefined
  waiting: FlowWaiting | undefined
  cursor = 0
  suspended = false
  diverged: string | undefined
  /** Settles when the function stops at a wait or on a divergence. */
  readonly halted: Promise<void>
  #halted: () => void = () => {}
  /** Whether the driving update has been dealt with: answered, rejected or passed over. */
  used: boolean
  consumed = false
  /** Why the run is ending, once it is being cancelled. */
  cancelled: string | undefined
  saved: FlowRecord
  #inEffect = false

  constructor(
    readonly host: PassHost,
    readonly record: FlowRecord,
    readonly drive: Drive<C>,
  ) {
    this.halted = new Promise<void>((resolve) => {
      this.#halted = resolve
    })
    this.journal = [...record.journal]
    this.pending = record.waiting
    this.waiting = record.waiting
    this.saved = record
    this.used = drive.kind !== 'update'
    this.cancelled =
      drive.kind === 'cancel' ? (drive.reason ?? 'the flow was cancelled') : undefined

    this.flow = {
      name: record.flow,
      run: record.run,
      key: record.key,
      address: record.address,
      resumedBy: drive.kind,
      get hasContext() {
        return drive.context !== undefined
      },
      get context(): C {
        if (drive.context === undefined) {
          throw new LifecycleError(
            `'${record.flow}' is running because ${drive.kind === 'deadline' ? 'a deadline passed' : 'it was cancelled from outside a conversation'}, so there is no update to act on`,
          )
        }

        return drive.context
      },
      wait: (label, spec) => this.wait(label, spec),
      ask: (label, question, spec) => this.ask(label, question, spec),
      effect: (label, run, options) => this.effect(label, run, options),
    }
  }

  /**
   * Whether the function ended before reaching everything the run recorded.
   *
   * A definition with steps removed would otherwise finish a run that was
   * waiting at a step it no longer has.
   */
  endedEarly(): boolean {
    const recorded = this.pending === undefined ? this.record.journal.length : this.pending.at + 1

    return this.cursor < recorded
  }

  /** The run as it stands, ready to write. */
  snapshot(): FlowRecord {
    const { waiting: _waiting, ...rest } = this.record

    return {
      ...rest,
      journal: [...this.journal],
      ...(this.waiting === undefined ? {} : { waiting: this.waiting }),
      updated: this.host.now(),
    }
  }

  async wait<T>(label: string, spec: FlowWaitSpec<C, T>): Promise<T> {
    if (this.#stopped) return await halt()
    this.#guard(label)
    const at = this.cursor++
    const entry = this.journal[at]

    return entry === undefined
      ? await this.#arriveAt(at, label, spec)
      : await this.#replayWait<T>(at, label, entry)
  }

  async ask<T>(
    label: string,
    question: (context: C, once: EffectOnce) => unknown,
    spec: FlowWaitSpec<C, T> & { readonly repeatQuestion?: boolean },
  ): Promise<T> {
    await this.effect(
      `${label}?`,
      async (once) => {
        await question(this.flow.context, once)

        return null
      },
      { repeat: spec.repeatQuestion !== false },
    )

    return await this.wait(label, spec)
  }

  async effect<T>(
    label: string,
    run: (once: EffectOnce) => T | Promise<T>,
    options: EffectOptions = {},
  ): Promise<T> {
    if (this.#stopped) return await halt()
    this.#guard(label)
    const at = this.cursor++
    const entry = this.journal[at]
    let attempt = 1

    if (entry !== undefined) {
      if (entry.kind !== 'effect' || entry.label !== label) {
        return await this.#diverge(at, `the effect '${label}'`, entry)
      }
      if (entry.state === 'done') return copy(entry.value) as T
      if (entry.state === 'failed') {
        if (entry.error.name === 'EffectUncertainError') throw new EffectUncertainError(label)
        throw new FlowStepError(label, entry.error.name, entry.error.message)
      }

      // Started and never finished: the run stopped in between, and whether
      // the effect reached the outside world is unknown.
      if (options.repeat !== true) {
        await this.#record(at, {
          kind: 'effect',
          label,
          state: 'failed',
          attempt: entry.attempt,
          error: { name: 'EffectUncertainError', message: 'the outcome is unknown' },
        })
        throw new EffectUncertainError(label)
      }
      attempt = entry.attempt + 1
    } else {
      // The run was waiting here, and this definition does something else.
      if (this.pending?.at === at) {
        return await this.#diverge(at, `the effect '${label}'`, this.pending)
      }
      this.#roomFor(label)
    }

    // Written before the effect runs, so a stop from here on is known to have
    // happened after it began.
    await this.#record(at, { kind: 'effect', label, state: 'started', attempt })

    const key = `${this.record.run}:${at}`
    let value: unknown
    this.#inEffect = true
    try {
      value = keep(await run({ key, id: idOf(key), attempt }), `what '${label}' produced`)
    } catch (error) {
      const failure = failureOf(error)
      await this.#record(at, { kind: 'effect', label, state: 'failed', attempt, error: failure })
      throw new FlowStepError(label, failure.name, failure.message, { cause: error })
    } finally {
      this.#inEffect = false
    }

    await this.#record(at, {
      kind: 'effect',
      label,
      state: 'done',
      attempt,
      ...(value === undefined ? {} : { value }),
    })

    return copy(value) as T
  }

  get #stopped(): boolean {
    return this.suspended || this.diverged !== undefined
  }

  #guard(label: string): void {
    if (this.#inEffect) {
      throw new ValidationError(
        `'${label}' was reached from inside an effect, which cannot wait or run steps`,
      )
    }
    if (typeof label !== 'string' || label.length === 0) {
      throw new ValidationError('a step needs a label: a non-empty string naming it')
    }
  }

  #roomFor(label: string): void {
    if (this.journal.length < this.host.maxSteps) return

    throw new ValidationError(
      `'${this.record.flow}' reached ${this.host.maxSteps} steps at '${label}'; a flow is a bounded conversation, and one that loops for ever belongs in a scene`,
    )
  }

  async #replayWait<T>(at: number, label: string, entry: FlowEntry): Promise<T> {
    if (entry.label !== label) return await this.#diverge(at, `the wait '${label}'`, entry)

    switch (entry.kind) {
      case 'answer':
        return copy(entry.value) as T
      case 'timeout':
        throw new WaitTimeoutError(`'${label}' was not answered in time`)
      case 'cancelled':
        this.cancelled ??= entry.reason
        throw new WaitCancelledError(entry.reason)
      case 'error':
        throw new FlowStepError(label, entry.error.name, entry.error.message)
      default:
        return await this.#diverge(at, `the wait '${label}'`, entry)
    }
  }

  /** The first step past the journal: answer the wait, or arm a new one. */
  async #arriveAt<T>(at: number, label: string, spec: FlowWaitSpec<C, T>): Promise<T> {
    // A run being cancelled waits for nothing more. The code is told at the
    // wait it reaches, so whatever it does to clean up runs now.
    if (this.cancelled !== undefined) {
      await this.#record(at, { kind: 'cancelled', label, reason: this.cancelled })
      throw new WaitCancelledError(this.cancelled)
    }

    const pending = this.pending
    if (pending !== undefined && pending.at === at) {
      if (pending.label !== label) return await this.#diverge(at, `the wait '${label}'`, pending)

      const overdue = pending.deadline !== undefined && this.host.now() >= pending.deadline
      if (overdue && (this.drive.kind === 'deadline' || !this.used)) {
        // An update that arrives after the deadline is not an answer. The
        // wait times out, the code carries on with that update as its
        // context, and the update then reaches the ordinary handlers.
        this.used = true
        await this.#record(at, { kind: 'timeout', label })
        throw new WaitTimeoutError(
          `'${label}' was not answered within ${(pending.deadline as number) - pending.since}ms`,
        )
      }

      if (!this.used) return await this.#offer(at, label, spec, pending)

      // Resumed for some other reason while still waiting here.
      return await this.#suspend()
    }

    this.#roomFor(label)
    const now = this.host.now()
    this.waiting = {
      at,
      label,
      since: now,
      attempts: 0,
      ...(spec.timeout === undefined ? {} : { deadline: now + spec.timeout }),
    }
    await this.#save()

    return await this.#suspend()
  }

  /** Offer the driving update to the wait the run was suspended at. */
  async #offer<T>(
    at: number,
    label: string,
    spec: FlowWaitSpec<C, T>,
    pending: FlowWaiting,
  ): Promise<T> {
    const context = this.drive.context as C
    this.used = true

    let matched: boolean
    try {
      matched = await spec.match(context)
    } catch (error) {
      return await this.#failWait(at, label, spec, error)
    }

    if (!matched) {
      this.consumed = spec.exclusive === true

      return await this.#suspend()
    }

    this.consumed = spec.consume !== false

    let value: unknown
    let verdict: boolean | string = true
    try {
      const transformed = await spec.transform(context)
      if (spec.validate !== undefined) verdict = await spec.validate(transformed, context)
      value = verdict === true ? keep(transformed, `the answer to '${label}'`) : undefined
      if (verdict !== true) {
        await spec.onInvalid?.(typeof verdict === 'string' ? verdict : undefined, context)
      }
    } catch (error) {
      return await this.#failWait(at, label, spec, error)
    }

    if (verdict !== true) {
      this.waiting = { ...pending, attempts: pending.attempts + 1 }
      await this.#save()

      return await this.#suspend()
    }

    await this.#record(at, {
      kind: 'answer',
      label,
      ...(value === undefined ? {} : { value }),
      ...(this.drive.identity === undefined ? {} : { by: this.drive.identity }),
    })

    return copy(value) as T
  }

  /** A wait's own code failed: kept, so a replay fails the same way. */
  async #failWait(
    at: number,
    label: string,
    spec: FlowWaitSpec<C, unknown>,
    error: unknown,
  ): Promise<never> {
    this.consumed = spec.consume !== false
    const failure = failureOf(error)
    await this.#record(at, { kind: 'error', label, error: failure })

    throw new FlowStepError(label, failure.name, failure.message, { cause: error })
  }

  /** Stop without writing: this definition is not the one the run was recorded under. */
  #diverge(at: number, found: string, recorded: FlowEntry | FlowWaiting): Promise<never> {
    const was =
      'kind' in recorded ? `${recorded.kind} '${recorded.label}'` : `the wait '${recorded.label}'`
    this.diverged = `step ${at} of '${this.record.flow}' is ${found} in this definition, but this run recorded ${was} there; the definition changed without its version changing`
    this.#halted()

    return halt()
  }

  /** Stop at a wait. What had to be written has been. */
  #suspend(): Promise<never> {
    this.suspended = true
    this.#halted()

    return halt()
  }

  async #record(at: number, entry: FlowEntry): Promise<void> {
    this.journal[at] = entry
    // Whatever was waiting here has been answered, timed out or cancelled.
    if (this.waiting?.at === at) this.waiting = undefined
    await this.#save()
  }

  async #save(): Promise<void> {
    const record = this.snapshot()
    await this.host.save(record)
    this.saved = record
  }
}

/**
 * The flows of one conversation plugin, and the runs in its store.
 *
 * Every method that touches a run expects the caller to hold that
 * conversation's turn, which the plugin's middleware and controls arrange.
 */
export class FlowEngine<C extends Addressed> {
  readonly #definitions = new Map<string, FlowDefinition<C, never, unknown>>()
  readonly #timers = new Map<string, () => void>()
  readonly #storage: KV<FlowRecord>
  readonly #locks: ConversationLocks
  readonly #schedule: (run: () => void, delayMs: number) => () => void
  readonly #now: () => number
  readonly #retain: number
  readonly #identify: (context: C) => string | undefined
  readonly #onProblem: ((problem: FlowProblem) => void) | undefined
  readonly #log: Logger
  readonly #host: PassHost

  constructor(options: FlowEngineOptions<C>) {
    this.#storage = options.storage
    this.#locks = options.locks
    this.#schedule = options.schedule
    this.#now = options.now ?? Date.now
    this.#retain = options.retain ?? DEFAULT_RETAIN
    this.#identify = options.identify ?? identityOf
    this.#onProblem = options.onProblem
    this.#log = options.log ?? createLogger({ name: 'flows' })

    const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS
    this.#host = {
      now: () => this.#now(),
      maxSteps,
      save: async (record) => {
        await this.#storage.set(record.key, record)
        this.#arm(record.key, record.waiting)
      },
    }

    for (const definition of options.define ?? []) this.define(definition)
  }

  /** Register a flow. Two may not share a name. */
  define(definition: FlowDefinition<C, never, unknown>): void {
    if (typeof definition.name !== 'string' || definition.name.length === 0) {
      throw new ValidationError('a flow needs a name')
    }
    const version = definition.version ?? 1
    if (!Number.isInteger(version) || version < 1) {
      throw new ValidationError(
        `the flow '${definition.name}' has version ${version}; a version is a positive integer`,
      )
    }
    if (this.#definitions.has(definition.name)) {
      throw new ValidationError(`a flow named '${definition.name}' is already defined`)
    }

    this.#definitions.set(definition.name, definition)
  }

  /** How many deadlines this process is holding a timer for. */
  get scheduled(): number {
    return this.#timers.size
  }

  /**
   * Offer an update to the run this conversation is in, if any.
   *
   * A run that cannot be resumed here — its definition is missing, a version
   * it does not accept, a record that is not one — is reported and left as it
   * is, and the update goes on to the handlers. Nothing is reset, so deploying
   * a definition that can resume it lets it continue.
   */
  async offer(key: string, context: C): Promise<{ readonly consumed: boolean }> {
    const record = await this.#storage.get(key)
    if (!isActive(record)) return { consumed: false }

    const definition = this.#usable(key, record)
    if (definition === undefined) return { consumed: false }

    // An update delivered a second time has already done what it was for.
    const identity = this.#identify(context)
    if (identity !== undefined && handled(record, identity)) return { consumed: true }

    const { consumed } = await this.#pass(record, definition, {
      kind: 'update',
      context,
      ...(identity === undefined ? {} : { identity }),
    })

    return { consumed }
  }

  /** Start a run in this conversation. */
  async start(
    key: string,
    context: C,
    which: string | FlowDefinition<C, never, unknown>,
    input: unknown,
    options: { readonly replace?: boolean } = {},
  ): Promise<FlowStatus> {
    const name = typeof which === 'string' ? which : which.name
    const definition = this.#definitions.get(name)
    if (definition === undefined) throw new ConfigError(`no flow named '${name}' is defined`)
    if (typeof which !== 'string' && which !== definition) {
      throw new ConfigError(`the flow passed as '${name}' is not the one defined under that name`)
    }

    const kept = keep(input, `the input to '${name}'`)
    const identity = this.#identify(context)
    const existing = await this.#storage.get(key)

    if (isActive(existing)) {
      // The update that started it, delivered again.
      if (identity !== undefined && existing.startedBy === identity) return statusOf(existing)
      if (options.replace === false) {
        throw new LifecycleError(`'${existing.flow}' is already running in this conversation`)
      }
      await this.#cancelRun(key, existing, `replaced by '${name}'`, context)
    }

    const now = this.#now()
    const record: FlowRecord = {
      format: FLOW_FORMAT,
      run: runId(),
      flow: name,
      version: definition.version ?? 1,
      key,
      address: addressOf(context),
      ...(kept === undefined ? {} : { input: kept }),
      status: 'active',
      journal: [],
      ...(identity === undefined ? {} : { startedBy: identity }),
      started: now,
      updated: now,
    }
    // Written before any of its code runs, so a stop inside the first step
    // leaves a run to resume rather than nothing.
    await this.#storage.set(key, record)

    return statusOf((await this.#pass(record, definition, { kind: 'start', context })).record)
  }

  /**
   * End this conversation's run for good.
   *
   * A run suspended at a wait is told there — the wait raises
   * `WaitCancelledError` — so the code can clean up before it ends. A run that
   * cannot be resumed here is marked cancelled without running any of it.
   */
  async cancel(key: string, reason: string, context?: C): Promise<boolean> {
    const record = await this.#storage.get(key)
    if (!isActive(record)) return false

    await this.#cancelRun(key, record, reason, context)

    return true
  }

  /** What this conversation's run is doing, or what the last one did. */
  async status(key: string): Promise<FlowStatus | undefined> {
    const record = await this.#storage.get(key)
    if (record === undefined || invalidity(record) !== undefined) return undefined

    return statusOf(record)
  }

  /**
   * Find every run waiting on a deadline, after a restart.
   *
   * A deadline in the future gets a timer in this process; one that passed
   * while nothing was running is acted on now. Without this, a deadline is
   * still noticed — on the next update in its conversation.
   */
  async resume(): Promise<FlowResumeReport> {
    if (this.#storage.keys === undefined) {
      throw new ConfigError(
        'this store cannot list what it holds, so waiting runs cannot be found; each is still resumed by the next update in its conversation',
      )
    }

    let active = 0
    let scheduled = 0
    let problems = 0
    const due: string[] = []

    for await (const key of this.#storage.keys()) {
      const record = await this.#storage.get(key)
      if (!isActive(record)) continue
      active += 1

      if (this.#usable(key, record) === undefined) {
        problems += 1
        continue
      }

      const deadline = record.waiting?.deadline
      if (deadline === undefined) continue
      if (deadline <= this.#now()) {
        due.push(key)
      } else {
        this.#arm(key, record.waiting)
        scheduled += 1
      }
    }

    for (const key of due) await this.#locks.run(key, () => this.#expire(key))

    return { active, scheduled, expired: due.length, problems }
  }

  /**
   * Stop acting on deadlines in this process.
   *
   * For a runtime that is going away. Runs stay exactly as they are stored —
   * this is not cancellation — and the next process to call `resume` picks
   * their deadlines up again.
   */
  shutdown(): void {
    for (const cancel of this.#timers.values()) cancel()
    this.#timers.clear()
  }

  async #cancelRun(key: string, record: FlowRecord, reason: string, context?: C): Promise<void> {
    const definition = this.#usable(key, record, false)

    if (definition !== undefined && record.waiting !== undefined) {
      await this.#pass(record, definition, {
        kind: 'cancel',
        reason,
        ...(context === undefined ? {} : { context }),
      })

      return
    }

    if (invalidity(record) !== undefined) {
      await this.#storage.delete(key)
      this.#arm(key, undefined)

      return
    }

    await this.#finish(record, { status: 'cancelled', reason })
  }

  /** Act on a deadline, if the run is still waiting on it. */
  async #expire(key: string): Promise<void> {
    const record = await this.#storage.get(key)
    if (!isActive(record)) return

    const waiting = record.waiting
    if (waiting?.deadline === undefined) return
    if (waiting.deadline > this.#now()) {
      this.#arm(key, waiting)

      return
    }

    const definition = this.#usable(key, record)
    if (definition === undefined) return

    await this.#pass(record, definition, { kind: 'deadline' })
  }

  /** Keep a timer for a run's deadline, replacing any it had. */
  #arm(key: string, waiting: FlowWaiting | undefined): void {
    this.#timers.get(key)?.()
    this.#timers.delete(key)

    const deadline = waiting?.deadline
    if (deadline === undefined) return

    const cancel = this.#schedule(
      () => {
        this.#timers.delete(key)
        this.#locks
          .run(key, () => this.#expire(key))
          .catch((error: unknown) => {
            this.#report({ kind: 'failed', key, detail: 'a deadline could not be acted on', error })
          })
      },
      Math.max(0, deadline - this.#now()),
    )
    this.#timers.set(key, cancel)
  }

  /** Run a flow's function once, and write down how it ended if it did. */
  async #pass(
    record: FlowRecord,
    definition: FlowDefinition<C, never, unknown>,
    drive: Drive<C>,
  ): Promise<{ readonly consumed: boolean; readonly record: FlowRecord }> {
    const pass = new Pass<C>(this.#host, record, drive)
    const running = (async () => await definition.run(pass.flow, copy(record.input) as never))()
    const ending = await Promise.race([
      running.then(
        (returned) => ({ returned }),
        (thrown: unknown) => ({ thrown }),
      ),
      pass.halted.then(() => undefined),
    ])

    const about = { key: record.key, flow: record.flow, run: record.run }

    if (pass.diverged !== undefined) {
      // Nothing was written: a divergence is found while replaying, before any
      // step runs for real.
      this.#report({ kind: 'diverged', ...about, detail: pass.diverged })

      return { consumed: false, record }
    }

    // Stopped at a wait: the function is left where it is, and what it had to
    // write has been written.
    if (ending === undefined || pass.suspended) {
      return { consumed: pass.consumed, record: pass.saved }
    }

    if (pass.endedEarly()) {
      this.#report({
        kind: 'diverged',
        ...about,
        detail: `'${record.flow}' ended at step ${pass.cursor}, before steps this run recorded; the definition changed without its version changing`,
      })

      return { consumed: false, record }
    }

    const current = pass.snapshot()

    if (pass.cancelled !== undefined) {
      return {
        consumed: pass.consumed,
        record: await this.#finish(current, { status: 'cancelled', reason: pass.cancelled }),
      }
    }

    let failed = 'thrown' in ending
    let failure: unknown = 'thrown' in ending ? ending.thrown : undefined
    let result: unknown
    if (!failed) {
      try {
        result = keep(
          (ending as { readonly returned: unknown }).returned,
          `what '${record.flow}' returned`,
        )
      } catch (error) {
        failed = true
        failure = error
      }
    }

    if (failed) {
      const finished = await this.#finish(current, { status: 'failed', error: failureOf(failure) })
      // An update or a start has somebody to tell: the error goes where every
      // other handler's error goes. A deadline or an outside cancellation does
      // not, and is reported instead.
      if (drive.kind === 'update' || drive.kind === 'start') throw failure
      this.#report({ kind: 'failed', ...about, detail: 'the run failed', error: failure })

      return { consumed: pass.consumed, record: finished }
    }

    return {
      consumed: pass.consumed,
      record: await this.#finish(current, {
        status: 'done',
        ...(result === undefined ? {} : { result }),
      }),
    }
  }

  async #finish(
    record: FlowRecord,
    end: Pick<FlowRecord, 'status'> & Partial<Pick<FlowRecord, 'result' | 'reason' | 'error'>>,
  ): Promise<FlowRecord> {
    const { waiting: _waiting, ...rest } = record
    const finished: FlowRecord = { ...rest, ...end, updated: this.#now() }

    this.#arm(record.key, undefined)
    if (this.#retain === 0) await this.#storage.delete(record.key)
    else await this.#storage.set(record.key, finished, { ttl: this.#retain })

    return finished
  }

  /** The definition a stored run can be resumed with, or why there is none. */
  #usable(
    key: string,
    record: FlowRecord,
    report = true,
  ): FlowDefinition<C, never, unknown> | undefined {
    const problem = this.#problemWith(key, record)
    if (problem === undefined) return this.#definitions.get(record.flow)

    if (report) this.#report(problem)

    return undefined
  }

  #problemWith(key: string, record: FlowRecord): FlowProblem | undefined {
    const invalid = invalidity(record)
    if (invalid !== undefined) return { kind: 'invalid', key, detail: invalid }

    const about = { key, flow: record.flow, run: record.run }
    const definition = this.#definitions.get(record.flow)
    if (definition === undefined) {
      return {
        kind: 'missing',
        ...about,
        detail: `the run is of '${record.flow}', which this process does not define`,
      }
    }

    const version = definition.version ?? 1
    if (!(definition.accepts ?? [version]).includes(record.version)) {
      return {
        kind: 'incompatible',
        ...about,
        detail: `the run started under version ${record.version}, and version ${version} does not accept it`,
      }
    }

    return undefined
  }

  #report(problem: FlowProblem): void {
    if (this.#onProblem !== undefined) {
      this.#onProblem(problem)

      return
    }

    this.#log.warn(`a flow run could not go on: ${problem.detail}`, {
      kind: problem.kind,
      key: problem.key,
      ...(problem.flow === undefined ? {} : { flow: problem.flow }),
      ...(problem.run === undefined ? {} : { run: problem.run }),
    })
  }
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function isActive(record: FlowRecord | undefined): record is FlowRecord {
  return record !== undefined && record.status === 'active'
}

/** Whether this update has already been used by the run. */
function handled(record: FlowRecord, identity: string): boolean {
  if (record.startedBy === identity) return true

  return record.journal.some((entry) => entry.kind === 'answer' && entry.by === identity)
}

/** What a stored value lacks to be a run this layout can read, if anything. */
function invalidity(value: unknown): string | undefined {
  const record = value as Partial<FlowRecord> | null
  if (record === null || typeof record !== 'object') return 'the stored value is not a run'
  if (record.format !== FLOW_FORMAT) {
    return `the run is in layout ${String(record.format)}, and this version reads layout ${FLOW_FORMAT}`
  }
  if (typeof record.run !== 'string' || typeof record.flow !== 'string') {
    return 'the run has no identity or no flow name'
  }
  if (!Number.isInteger(record.version)) return 'the run has no version'
  if (!['active', 'done', 'cancelled', 'failed'].includes(record.status as string)) {
    return `the run's status '${String(record.status)}' is not one of this layout's`
  }
  if (!Array.isArray(record.journal)) return 'the run has no journal'

  const waiting = record.waiting
  if (
    waiting !== undefined &&
    (waiting.at !== record.journal.length || typeof waiting.label !== 'string')
  ) {
    return 'the run is waiting somewhere other than the end of its journal'
  }

  return undefined
}

function statusOf(record: FlowRecord): FlowStatus {
  const waiting = record.waiting

  return {
    run: record.run,
    flow: record.flow,
    version: record.version,
    status: record.status,
    ...(waiting === undefined
      ? {}
      : {
          waitingFor: {
            label: waiting.label,
            attempts: waiting.attempts,
            ...(waiting.deadline === undefined ? {} : { deadline: waiting.deadline }),
          },
        }),
    ...(record.result === undefined ? {} : { result: copy(record.result) }),
    ...(record.reason === undefined ? {} : { reason: record.reason }),
    ...(record.error === undefined ? {} : { error: record.error }),
    started: record.started,
    updated: record.updated,
  }
}

/** Where an update came from, as plain data. */
function addressOf(context: Addressed): FlowAddress {
  const chat = plainId(context.chat?.id)
  const user = plainId(context.sender?.id)

  return {
    client: context.client.name,
    ...(chat === undefined ? {} : { chat }),
    ...(user === undefined ? {} : { user }),
    ...(context.topicId === undefined ? {} : { topic: context.topicId }),
  }
}

/** An identifier a store can keep. A 64-bit one is kept as its decimal string. */
function plainId(id: unknown): number | string | undefined {
  if (typeof id === 'number' || typeof id === 'string') return id
  if (typeof id === 'bigint') return id.toString()

  return undefined
}

/**
 * The identity of an update, where the transport provides one.
 *
 * A Bot API update carries its `update_id`. An MTProto event carries the
 * message it is about, whose number is unique within the conversation the key
 * already names; the kind is part of it, so an edit is not taken for the
 * message it edits.
 */
function identityOf(context: unknown): string | undefined {
  const update = context as {
    readonly updateId?: unknown
    readonly kind?: unknown
    readonly message?: { readonly id?: unknown } | undefined
  }
  if (typeof update.updateId === 'number') return `update:${update.updateId}`
  if (typeof update.kind === 'string' && typeof update.message?.id === 'number') {
    return `${update.kind}:${update.message.id}`
  }

  return undefined
}

function failureOf(error: unknown): FlowFailure {
  if (error instanceof Error) return { name: error.name, message: error.message }

  return { name: 'Error', message: String(error) }
}

/** A fresh identity for a run: 96 random bits. */
function runId(): string {
  const bytes = new Uint8Array(12)
  globalThis.crypto.getRandomValues(bytes)

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** FNV-1a over the key, as a signed 64-bit number. Stable, not secret. */
function idOf(key: string): bigint {
  let hash = 0xcbf29ce484222325n
  for (const byte of new TextEncoder().encode(key)) {
    hash ^= BigInt(byte)
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn
  }

  return BigInt.asIntN(64, hash)
}

/**
 * Check that a value is plain data, and return a copy of it.
 *
 * What a flow keeps is written to a store and read back after a restart, so
 * it has to survive that unchanged: `null`, booleans, finite numbers, strings,
 * arrays and plain objects. A copy, so that code changing a value after
 * handing it over does not change what was recorded — which an in-memory
 * store would otherwise let it do, and a file store would not.
 */
function keep(value: unknown, what: string): unknown {
  if (value === undefined) return undefined
  check(value, what, new Set())

  return copy(value)
}

function check(value: unknown, path: string, seen: Set<object>): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return
    throw new ValidationError(`${path} is ${value}, which a store cannot keep`)
  }
  if (typeof value !== 'object') {
    throw new ValidationError(`${path} is a ${typeof value}; a flow keeps plain data only`)
  }
  if (seen.has(value)) throw new ValidationError(`${path} refers back to itself`)

  seen.add(value)
  if (Array.isArray(value)) {
    value.forEach((item: unknown, index) => {
      if (item === undefined) {
        throw new ValidationError(`${path}[${index}] is undefined, which a store keeps as null`)
      }
      check(item, `${path}[${index}]`, seen)
    })
  } else {
    const prototype: unknown = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      const name = (prototype as { constructor?: { name?: string } }).constructor?.name ?? 'object'
      throw new ValidationError(`${path} is a ${name}; a flow keeps plain data only`)
    }
    for (const [field, item] of Object.entries(value)) {
      if (item !== undefined) check(item, `${path}.${field}`, seen)
    }
  }
  seen.delete(value)
}

function copy<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T)
}
