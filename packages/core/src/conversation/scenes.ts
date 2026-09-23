/**
 * Scenes: a conversation that remembers where it is.
 *
 * A scene is a named sequence of steps and a piece of state that survives
 * between updates. While a conversation is in one, updates go to the scene's
 * current step instead of to the ordinary handlers — which is the whole point,
 * and also the thing to be careful about, because a conversation that enters a
 * scene and never leaves stops answering commands.
 *
 * ```
 *   enter('signup') ──> step 0 ──> next() ──> step 1 ──> next() ──> leave()
 *                         ▲                      │
 *                         └──── reenter() ───────┘
 * ```
 *
 * **Position lives in storage, not in a closure.** A bot that restarts halfway
 * through a form finds the conversation where it left it, because the only
 * thing kept is a scene name, a step number and the state the application put
 * there — all of it serialisable. Nothing here holds a suspended function.
 *
 * **One update advances one step.** A step runs, and whatever it does to the
 * position is written down before the next update is looked at. Two updates
 * arriving together are serialised per conversation, so a form cannot advance
 * twice for one answer. See {@link ConversationLocks}.
 *
 * **Leaving is explicit.** A step that neither advances nor leaves is waiting
 * for another update, which is the ordinary case for a question. `leave()`
 * runs the scene's exit handler and clears the position; cancelling does the
 * same and tells the exit handler it was a cancellation.
 */

import { ValidationError } from '../errors/errors.js'
import type { KV } from '../storage/types.js'
import type { Addressed } from './identity.js'

/** Where a conversation is, as it is stored. */
export interface ScenePosition<S = unknown> {
  /** The scene's name. */
  readonly scene: string
  /** Which step is current, counted from zero. */
  readonly step: number
  /** Whatever the application is keeping for this run of the scene. */
  readonly state: S
  /** Whether the current step has yet to see an update. */
  readonly fresh: boolean
}

/** What a step can do to the conversation it is running in. */
export interface SceneControls<S> {
  /** The scene's name. */
  readonly scene: string
  /** Which step is running, counted from zero. */
  readonly step: number
  /**
   * Whether this step is running for the first time.
   *
   * True on the update that moved into the step — the one that should ask the
   * question — and false on the updates that follow, which carry the answer.
   * A step that does not check this asks its question again for every answer.
   */
  readonly fresh: boolean
  /** The state for this run. Mutating it is kept. */
  state: S
  /** Move to another scene, starting at its first step. */
  enter(scene: string, state?: unknown): void
  /** Start this scene again from its first step, keeping nothing. */
  reenter(state?: unknown): void
  /** Move to the next step. */
  next(): void
  /** Move to the previous step. Refuses to go before the first. */
  previous(): void
  /** Move to a step by number. */
  go(step: number): void
  /** Leave the scene. The exit handler runs. */
  leave(): void
  /** Leave the scene, telling the exit handler it was cancelled. */
  cancel(): void
}

/** A step, and the handlers around the scene it belongs to. */
export type SceneStep<C, S> = (context: C, scene: SceneControls<S>) => unknown

/** How a scene is defined. */
export interface SceneDefinition<C, S> {
  readonly name: string
  /** The steps, in order. A scene needs at least one. */
  readonly steps: readonly SceneStep<C, S>[]
  /** The state a run starts with, where the caller named none. */
  readonly initial?: () => S
  /** Runs when the scene is entered, before its first step. */
  readonly onEnter?: SceneStep<C, S>
  /**
   * Runs when the scene is left, however it was left.
   *
   * `cancelled` says which: `leave()` or the last step finishing, against
   * `cancel()` or the conversation being reset.
   */
  readonly onLeave?: (
    context: C,
    scene: SceneControls<S> & { readonly cancelled: boolean },
  ) => unknown
  /** Runs before every step, and can leave or navigate instead of it. */
  readonly beforeStep?: SceneStep<C, S>
  /** Runs after a step that neither navigated nor left. */
  readonly afterStep?: SceneStep<C, S>
}

/** What a scene run asked to happen next. */
type Move =
  | { readonly kind: 'stay' }
  | { readonly kind: 'go'; readonly step: number; readonly fresh: boolean }
  | { readonly kind: 'enter'; readonly scene: string; readonly state: unknown }
  | { readonly kind: 'leave'; readonly cancelled: boolean }

/** Build the controls a step is handed, recording what it asks for. */
function controls<S>(
  position: ScenePosition<S>,
  steps: number,
): { readonly api: SceneControls<S>; move(): Move; state(): S } {
  let move: Move = { kind: 'stay' }
  let state = position.state

  const api: SceneControls<S> = {
    scene: position.scene,
    step: position.step,
    fresh: position.fresh,
    get state() {
      return state
    },
    set state(next: S) {
      state = next
    },
    enter: (scene, entering) => {
      move = { kind: 'enter', scene, state: entering }
    },
    reenter: (entering) => {
      move = { kind: 'enter', scene: position.scene, state: entering }
    },
    next: () => {
      move = { kind: 'go', step: position.step + 1, fresh: true }
    },
    previous: () => {
      if (position.step === 0) {
        throw new ValidationError('there is no step before the first one')
      }
      move = { kind: 'go', step: position.step - 1, fresh: true }
    },
    go: (step) => {
      if (!Number.isInteger(step) || step < 0 || step >= steps) {
        throw new ValidationError(`this scene has steps 0 to ${steps - 1}, not ${step}`)
      }
      move = { kind: 'go', step, fresh: true }
    },
    leave: () => {
      move = { kind: 'leave', cancelled: false }
    },
    cancel: () => {
      move = { kind: 'leave', cancelled: true }
    },
  }

  return { api, move: () => move, state: () => state }
}

/** What running one update against a scene produced. */
export interface SceneOutcome {
  /** Whether a scene handled this update at all. */
  readonly handled: boolean
  /** Whether the conversation is still in a scene afterwards. */
  readonly inScene: boolean
}

/**
 * The scenes an application has defined, and the conversations inside them.
 *
 * Storage holds one record per conversation: a scene name, a step and the
 * state. Nothing else survives an update, which is what makes a restart
 * resume rather than start over.
 */
export class SceneRegistry<C extends Addressed, S = unknown> {
  readonly #scenes = new Map<string, SceneDefinition<C, S>>()
  readonly #storage: KV<ScenePosition<S>>
  readonly #ttl: number | undefined

  constructor(options: { readonly storage: KV<ScenePosition<S>>; readonly ttl?: number }) {
    this.#storage = options.storage
    this.#ttl = options.ttl
  }

  /** Define a scene. Two scenes may not share a name. */
  add(definition: SceneDefinition<C, S>): this {
    if (definition.steps.length === 0) {
      throw new ValidationError(`the scene '${definition.name}' has no steps`)
    }
    if (this.#scenes.has(definition.name)) {
      throw new ValidationError(`a scene named '${definition.name}' is already defined`)
    }

    this.#scenes.set(definition.name, definition)

    return this
  }

  /** Every scene's name, in the order they were defined. */
  get names(): readonly string[] {
    return [...this.#scenes.keys()]
  }

  /** Where a conversation is, or `undefined` when it is in no scene. */
  async positionOf(key: string): Promise<ScenePosition<S> | undefined> {
    return await this.#storage.get(key)
  }

  /**
   * Put a conversation into a scene.
   *
   * The scene's `onEnter` and its first step both run against the update that
   * entered, which is what lets a command enter a form and have the form ask
   * its first question in the same turn.
   */
  async enter(key: string, context: C, scene: string, state?: S): Promise<SceneOutcome> {
    const definition = this.#require(scene)

    // A conversation already in a scene is leaving it, and its exit handler
    // runs before the new scene's entry handler — the same order a step that
    // enters another scene produces. Without this, moving between scenes from
    // outside a step would skip the exit handler and whatever it cleans up.
    const current = await this.#storage.get(key)
    if (current !== undefined) {
      await this.#storage.delete(key)
      await this.#leaving(context, current, false)
    }

    const position: ScenePosition<S> = {
      scene,
      step: 0,
      state: state ?? definition.initial?.() ?? ({} as S),
      fresh: true,
    }

    await this.#write(key, position)

    return await this.#run(key, context, position, { entering: true })
  }

  /** Take a conversation out of whatever scene it is in, running the exit handler. */
  async leave(
    key: string,
    context: C,
    options: { readonly cancelled?: boolean } = {},
  ): Promise<boolean> {
    const position = await this.#storage.get(key)
    if (position === undefined) return false

    await this.#storage.delete(key)
    await this.#leaving(context, position, options.cancelled === true)

    return true
  }

  /**
   * Forget where a conversation is, without running the exit handler.
   *
   * For a caller cleaning up after a failure, where running application code
   * against a conversation that is already broken would only fail again.
   */
  async reset(key: string): Promise<void> {
    await this.#storage.delete(key)
  }

  /**
   * Offer an update to the scene a conversation is in.
   *
   * Answers `handled: false` when it is in none, which is what the middleware
   * uses to decide whether the ordinary handlers should see it.
   */
  async offer(key: string, context: C): Promise<SceneOutcome> {
    const position = await this.#storage.get(key)
    if (position === undefined) return { handled: false, inScene: false }

    return await this.#run(key, context, position, { entering: false })
  }

  #require(name: string): SceneDefinition<C, S> {
    const definition = this.#scenes.get(name)
    if (definition === undefined) throw new ValidationError(`no scene named '${name}' is defined`)

    return definition
  }

  async #write(key: string, position: ScenePosition<S>): Promise<void> {
    await this.#storage.set(key, position, this.#ttl === undefined ? undefined : { ttl: this.#ttl })
  }

  /** Run one update against a position, following wherever it moves. */
  async #run(
    key: string,
    context: C,
    start: ScenePosition<S>,
    options: { readonly entering: boolean },
  ): Promise<SceneOutcome> {
    let position = start
    let entering = options.entering

    // A scene that enters another that enters another is a chain, not a loop,
    // and a bound turns a mistake into a failure rather than a hang.
    for (let hop = 0; hop <= MAX_HOPS; hop += 1) {
      const definition = this.#require(position.scene)

      if (definition.steps[position.step] === undefined) {
        // Off the end: the scene is finished, which is a leave rather than an
        // error, because `next()` on the last step is how a form ends.
        return await this.#finish(key, context, position, false)
      }

      const { move, state } = await this.#step(context, definition, position, entering)
      position = { ...position, state }

      if (move.kind === 'stay') {
        // Waiting for another update. The step has run once now, so the next
        // update is not the first time.
        position = { ...position, fresh: false }
        await this.#write(key, position)

        return { handled: true, inScene: true }
      }

      if (move.kind === 'leave') {
        return await this.#finish(key, context, position, move.cancelled)
      }

      if (move.kind === 'enter') {
        const next = this.#require(move.scene)
        // Leaving the old scene before entering the new one, so an exit
        // handler cannot run after its successor's entry handler.
        await this.#leaving(context, position, false)
        position = {
          scene: move.scene,
          step: 0,
          state: (move.state ?? next.initial?.() ?? {}) as S,
          fresh: true,
        }
        entering = true
      } else {
        position = { ...position, step: move.step, fresh: move.fresh }
        entering = false
      }

      await this.#write(key, position)
    }

    throw new ValidationError(`a scene moved ${MAX_HOPS} times for one update without settling`)
  }

  /**
   * Run one step, with whatever surrounds it, and report where it asked to go.
   *
   * `onEnter` and `beforeStep` each run only while nothing has navigated yet,
   * so either of them can replace the step rather than merely precede it —
   * which is what makes `beforeStep` the place to handle `/cancel`.
   */
  async #step(
    context: C,
    definition: SceneDefinition<C, S>,
    position: ScenePosition<S>,
    entering: boolean,
  ): Promise<{ readonly move: Move; readonly state: S }> {
    const step = definition.steps[position.step] as SceneStep<C, S>
    const bound = controls(position, definition.steps.length)
    const staying = (): boolean => bound.move().kind === 'stay'

    if (entering && definition.onEnter !== undefined) {
      await definition.onEnter(context, bound.api)
    }

    if (staying() && definition.beforeStep !== undefined) {
      await definition.beforeStep(context, bound.api)
    }

    if (staying()) {
      await step(context, bound.api)

      if (staying() && definition.afterStep !== undefined) {
        await definition.afterStep(context, bound.api)
      }
    }

    return { move: bound.move(), state: bound.state() }
  }

  /** Clear a conversation's position and run the scene's exit handler. */
  async #finish(
    key: string,
    context: C,
    position: ScenePosition<S>,
    cancelled: boolean,
  ): Promise<SceneOutcome> {
    await this.#storage.delete(key)
    await this.#leaving(context, position, cancelled)

    return { handled: true, inScene: false }
  }

  /** Run a scene's exit handler, if it has one. */
  async #leaving(context: C, position: ScenePosition<S>, cancelled: boolean): Promise<void> {
    const definition = this.#scenes.get(position.scene)
    if (definition?.onLeave === undefined) return

    const bound = controls(position, definition.steps.length)
    await definition.onLeave(context, { ...bound.api, cancelled })
  }
}

/** How many times one update may move a conversation between steps or scenes. */
const MAX_HOPS = 32
