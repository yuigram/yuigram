// SPDX-License-Identifier: MIT

/**
 * Conversations: scenes, prompts and flows under one plugin.
 *
 * Capabilities that are usually several packages, built on one idea — that a
 * conversation has an identity, and state belongs to it:
 *
 * ```
 *   conversation()
 *     ├── enter / leave  ──> a scene: numbered steps, position stored
 *     ├── start          ──> a flow: one function, its journal stored
 *     ├── wait           ──> stop here until the next matching update, in memory
 *     └── hears          ──> match text against patterns
 * ```
 *
 * They share the key, the lock and the storage rather than each inventing its
 * own, which is what keeps them consistent with one another: a prompt opened
 * inside a scene belongs to the same conversation the scene does, and leaving
 * the scene cancels the prompt instead of leaving it waiting for an answer
 * nobody will read.
 *
 * **What is durable and what is not.** A scene's position is stored, and so is
 * a flow's journal, so a restart resumes both. A `wait` is a suspended function
 * in memory, so a restart does not: the promise is gone with the process. That
 * difference is real and this package does not paper over it — a form built
 * from scene steps or as a flow survives a deployment, and one built from
 * `await conversation.wait(...)` does not. All three are offered because each
 * is useful, and {@link Conversation.wait} says which it is at the point where
 * a caller chooses.
 *
 * **Order matters.** The plugin installs one middleware which, for each update,
 * offers it to the open waiter first, then to the flow, then to the scene. The
 * more specific goes first: a waiter was opened by code that is still running,
 * and a flow is waiting at one step of one function.
 *
 * **Waiting lets the conversation go.** Updates for one conversation are
 * handled one at a time. A handler that awaits `wait` hands that turn back
 * while it waits — otherwise the answer it is waiting for could never be let
 * in — and takes it again before it carries on.
 */

import type { BaseContext } from '../context/types.js'
import { ConfigError, ValidationError } from '../errors/errors.js'
import type { Middleware, MiddlewareHost, Next } from '../middleware/compose.js'
import type { Plugin } from '../plugin/plugin.js'
import type { KV } from '../storage/types.js'
import type {
  FlowDefinition,
  FlowEngine,
  FlowOptions,
  FlowResumeReport,
  FlowStatus,
} from './flows.js'
import {
  type Addressed,
  type ConversationKeyFn,
  ConversationLocks,
  type ConversationScope,
  checkScope,
  conversationKey,
  DEFAULT_SCOPE,
} from './identity.js'
import {
  type SceneDefinition,
  type ScenePosition,
  SceneRegistry,
  type SceneStep,
} from './scenes.js'
import { WaiterRegister, type WaiterSpec } from './waiters.js'

/** What a context needs to carry for a conversation to be derived from it. */
export type ConversationContext = BaseContext & Addressed

/** What the plugin adds to a context. */
export interface ConversationFlavour<S = unknown> {
  /** This conversation's scenes, prompts and waiters. */
  readonly conversation: Conversation<S>
}

/** What a caller may ask of the conversation an update belongs to. */
export interface Conversation<S = unknown> {
  /** The key this conversation is stored and locked under. */
  readonly key: string
  /** Where this conversation is, or `undefined` when it is in no scene. */
  position(): Promise<ScenePosition<S> | undefined>
  /** Put this conversation into a scene, running its first step now. */
  enter(scene: string, state?: S): Promise<void>
  /** Take it out of whatever scene it is in. */
  leave(options?: { readonly cancelled?: boolean }): Promise<boolean>
  /** Forget where it is without running the scene's exit handler. */
  reset(): Promise<void>
  /**
   * Stop here until the next update in this conversation matches.
   *
   * In memory: a restart loses it. A form that has to survive a deployment is
   * built from scene steps or as a flow, whose position is stored.
   */
  wait<T = unknown>(spec: WaiterSpec<ConversationContext, T>): Promise<T | undefined>
  /** Whether something in this conversation is waiting for an update in memory. */
  readonly waiting: boolean
  /** Cancel whatever this conversation is waiting for in memory. */
  cancelWait(reason?: string): boolean
  /**
   * Start a durable flow here, running it up to its first wait.
   *
   * A flow already running in this conversation is cancelled first — told so
   * at the wait it is suspended in — unless `replace` is false, which refuses
   * instead. The same update delivered twice starts it once.
   */
  start<I>(
    flow: FlowDefinition<never, I, unknown> | string,
    input?: I,
    options?: { readonly replace?: boolean },
  ): Promise<FlowStatus>
  /** The flow this conversation is running, or the last one it finished. */
  flow(): Promise<FlowStatus | undefined>
  /** End the running flow for good. Its code is told at the wait it is in. */
  cancelFlow(reason?: string): Promise<boolean>
}

/** A pattern `hear` matches a message's text against. */
export type HearPattern = string | RegExp | ((text: string) => boolean)

/** How the plugin is configured. */
export interface ConversationOptions<C extends ConversationContext, S> {
  /** Where scene positions live. Memory is fine until a restart has to resume. */
  readonly storage: KV<ScenePosition<S>>
  /** Which parts of an update make up the conversation key. */
  readonly scope?: ConversationScope
  /** A rule of the application's own, instead of a scope. */
  readonly key?: ConversationKeyFn
  /** The scenes this application has. */
  readonly scenes?: readonly SceneDefinition<C, S>[]
  /** How long a scene position survives without an update, in seconds. */
  readonly ttl?: number
  /** Context property to expose the conversation on. Defaults to `conversation`. */
  readonly property?: string
  /** Schedules timeouts and deadlines. Supplied so tests need not wait in real time. */
  readonly schedule?: (run: () => void, delayMs: number) => () => void
  /**
   * Durable flows, and where their runs are kept.
   *
   * The flow machinery is loaded the first time it is needed, so an
   * application that configures none never loads it.
   */
  readonly flows?: FlowOptions<C>
}

/** What the plugin offers for the flows of every conversation at once. */
export interface FlowControls<C> {
  /** Register another flow. */
  define(definition: FlowDefinition<C, never, unknown>): Promise<void>
  /**
   * Pick up the runs a previous process left waiting on a deadline.
   *
   * Call once at startup. Needs a store that can list its keys.
   */
  resume(): Promise<FlowResumeReport>
  /** What a conversation's run is doing. */
  status(key: string): Promise<FlowStatus | undefined>
  /** End a conversation's run for good, from outside any update. */
  cancel(key: string, reason?: string): Promise<boolean>
  /**
   * Stop acting on deadlines in this process, leaving every run as stored.
   *
   * For a runtime that is going away: this is not cancellation, and the next
   * process to call `resume` carries on where this one stopped.
   */
  shutdown(): Promise<void>
}

/**
 * What the plugin hands back, for an application that drives it directly.
 *
 * Mostly for defining scenes after the plugin is installed, and for shutting
 * down: `cancelAll` rejects every open waiter, so a client stopping does not
 * leave suspended handlers holding a promise nobody will settle.
 *
 * On a host that reports its lifecycle — an account does — the plugin does this
 * itself when the host begins to stop: open waiters are cancelled, new ones are
 * refused until it starts again, and flows stop acting on deadlines. None of
 * that cancels a durable flow; a run stays stored and carries on with the next
 * update in its conversation, and `flows.resume()` after a restart re-arms its
 * deadline. On a host that does not report it, the application
 * calls `cancelAll` and `flows.shutdown` when it stops its client.
 */
export interface ConversationControls<C extends ConversationContext, S> {
  /** Define another scene. */
  addScene(definition: SceneDefinition<C, S>): void
  /** Cancel every open in-memory waiter in every conversation. Durable flows are untouched. */
  cancelAll(reason?: string): void
  /** The durable flows, when the plugin was given any. */
  readonly flows: FlowControls<C> | undefined
  /** How many conversations are waiting for an update. */
  readonly waiting: number
  /** How many conversations have an update in flight. */
  readonly running: number
}

/**
 * The middleware, for a host that installs one rather than a plugin.
 *
 * Returns the middleware and the controls together, because a caller that
 * wants the middleware directly usually wants to define scenes on it too.
 */
export function createConversation<C extends ConversationContext, S = unknown>(
  options: ConversationOptions<C, S>,
): { readonly middleware: Middleware<C>; readonly controls: ConversationControls<C, S> } {
  const { middleware, controls } = createParts(options)

  return { middleware, controls }
}

/** What the plugin does when its host starts and stops. */
interface HostLifecycle {
  started(): void
  stopping(): Promise<void>
}

/** The middleware, the controls, and what a host's lifecycle drives. */
function createParts<C extends ConversationContext, S>(
  options: ConversationOptions<C, S>,
): {
  readonly middleware: Middleware<C>
  readonly controls: ConversationControls<C, S>
  readonly lifecycle: HostLifecycle
} {
  const scope = options.scope ?? DEFAULT_SCOPE
  checkScope(scope)

  const scenes = new SceneRegistry<C, S>({
    storage: options.storage,
    ...(options.ttl === undefined ? {} : { ttl: options.ttl }),
  })
  for (const definition of options.scenes ?? []) scenes.add(definition)

  const waiters = new WaiterRegister<C>({
    scope,
    ...(options.key === undefined ? {} : { key: options.key }),
    ...(options.schedule === undefined ? {} : { schedule: options.schedule }),
  })
  const locks = new ConversationLocks()
  const property = options.property ?? 'conversation'
  const schedule = options.schedule ?? unrefSchedule

  // Loaded on first use: an application without flows never pays for them.
  const flowOptions = options.flows
  let engine: Promise<FlowEngine<C>> | undefined
  const flows =
    flowOptions === undefined
      ? undefined
      : (): Promise<FlowEngine<C>> =>
          (engine ??= import('./flows.js').then(
            (module) => new module.FlowEngine<C>({ ...flowOptions, locks, schedule }),
          ))

  const keyOf = (context: C): string | undefined =>
    options.key === undefined ? conversationKey(context, scope) : options.key(context)

  const middleware: Middleware<C> = async (context: C, next: Next) => {
    const key = keyOf(context)

    // An update with no conversation — an inline query, a channel post — has no
    // state to advance and no waiter to answer. It reaches the handlers
    // untouched rather than being held up by machinery that cannot apply.
    if (key === undefined) {
      await next()

      return
    }

    // Serialised per conversation: two updates for the same person cannot both
    // read the position before either writes it. Different conversations are
    // untouched by this and run in parallel.
    const turn = await Turn.take(locks, key)
    const conversation = bind<C, S>({ key, context, scenes, waiters, turn, flows })
    Object.defineProperty(context, property, {
      value: conversation,
      configurable: true,
      enumerable: false,
    })

    try {
      // The most specific first: a waiter was opened by code still running,
      // and a flow is suspended at one step of one function.
      const { consumed } = await waiters.offer(context)
      if (consumed) return

      if (flows !== undefined) {
        const answered = await (await flows()).offer(key, context)
        if (answered.consumed) return
      }

      const outcome = await scenes.offer(key, context)
      if (outcome.handled) return

      await next()
    } finally {
      turn.end()
    }
  }

  return {
    middleware,
    lifecycle: {
      started: () => {
        waiters.open()
      },
      stopping: async () => {
        waiters.close('the client is stopping')
        // Deadlines only: a stored run is not cancelled by its client going
        // away. The next update in its conversation carries it on, and
        // `flows.resume()` after a restart re-arms its deadline.
        if (engine !== undefined) (await engine).shutdown()
      },
    },
    controls: {
      addScene: (definition) => {
        scenes.add(definition)
      },
      cancelAll: (reason) => {
        waiters.cancelAll(reason)
      },
      get waiting() {
        return waiters.size
      },
      get running() {
        return locks.size
      },
      flows:
        flows === undefined
          ? undefined
          : {
              define: async (definition) => {
                ;(await flows()).define(definition)
              },
              resume: async () => await (await flows()).resume(),
              status: async (key) => await (await flows()).status(key),
              cancel: async (key, reason) => {
                const running = await flows()

                return await locks.run(key, () =>
                  running.cancel(key, reason ?? 'the flow was cancelled'),
                )
              },
              shutdown: async () => {
                if (engine !== undefined) (await engine).shutdown()
              },
            },
    },
  }
}

/** Timers that do not keep a process alive for a deadline hours away. */
function unrefSchedule(run: () => void, delayMs: number): () => void {
  const timer = setTimeout(run, delayMs) as unknown as { unref?: () => void }
  timer.unref?.()

  return () => clearTimeout(timer as unknown as ReturnType<typeof setTimeout>)
}

/**
 * One update's turn in its conversation.
 *
 * Held while the update is handled, and handed back while a handler awaits an
 * in-memory wait: the update it is waiting for belongs to the same
 * conversation, and could never be let in while this one held it. The turn is
 * taken again, behind whatever arrived meanwhile, before the handler carries
 * on — so it continues in order rather than alongside what came after.
 */
class Turn {
  #release: (() => void) | undefined
  #open = true
  #waiting = 0

  private constructor(
    private readonly locks: ConversationLocks,
    private readonly key: string,
    release: () => void,
  ) {
    this.#release = release
  }

  static async take(locks: ConversationLocks, key: string): Promise<Turn> {
    return new Turn(locks, key, await locks.acquire(key))
  }

  /** Hand the turn back while `waiting` settles, and take it again afterwards. */
  async during<T>(waiting: Promise<T>): Promise<T> {
    // A handle kept past the update it came with holds no turn to give back.
    if (!this.#open) return await waiting

    this.#waiting += 1
    this.#release?.()
    this.#release = undefined

    try {
      return await waiting
    } finally {
      this.#waiting -= 1
      if (this.#open && this.#waiting === 0) {
        const release = await this.locks.acquire(this.key)
        // The update may have finished while this was queued, or another wait
        // may have begun; either way the turn is not this one's to keep.
        if (this.#open && this.#waiting === 0 && this.#release === undefined) {
          this.#release = release
        } else {
          release()
        }
      }
    }
  }

  /** The update is done with its conversation. */
  end(): void {
    this.#open = false
    this.#release?.()
    this.#release = undefined
  }
}

/** Build the per-update handle a context carries. */
function bind<C extends ConversationContext, S>(options: {
  readonly key: string
  readonly context: C
  readonly scenes: SceneRegistry<C, S>
  readonly waiters: WaiterRegister<C>
  readonly turn: Turn
  readonly flows: (() => Promise<FlowEngine<C>>) | undefined
}): Conversation<S> {
  const { key, context, scenes, waiters, turn, flows } = options

  const engine = (): Promise<FlowEngine<C>> => {
    if (flows === undefined) {
      throw new ConfigError('no flows are configured: pass `flows` to conversation()')
    }

    return flows()
  }

  /** End a running flow because the conversation is moving on to something else. */
  const endFlow = async (reason: string): Promise<void> => {
    if (flows !== undefined) await (await flows()).cancel(key, reason, context)
  }

  return {
    key,
    position: async () => await scenes.positionOf(key),
    enter: async (scene, state) => {
      // Entering a scene ends whatever the conversation was waiting for: the
      // code that opened it belongs to the conversation it is leaving.
      waiters.cancel(key, 'the conversation entered a scene')
      await endFlow('the conversation entered a scene')
      await scenes.enter(key, context, scene, state)
    },
    leave: async (leaving) => {
      waiters.cancel(key, 'the conversation left the scene')

      return await scenes.leave(key, context, leaving ?? {})
    },
    reset: async () => {
      waiters.cancel(key, 'the conversation was reset')
      await endFlow('the conversation was reset')
      await scenes.reset(key)
    },
    wait: async (spec) => await turn.during(waiters.wait(key, spec)),
    get waiting() {
      return waiters.waiting(key)
    },
    cancelWait: (reason) => waiters.cancel(key, reason),
    start: async (flow, input, starting) =>
      await (await engine()).start(
        key,
        context,
        flow as FlowDefinition<C, never, unknown> | string,
        input,
        starting ?? {},
      ),
    flow: async () => await (await engine()).status(key),
    cancelFlow: async (reason) =>
      await (await engine()).cancel(key, reason ?? 'the flow was cancelled', context),
  }
}

/**
 * Define a durable flow.
 *
 * Checks the name and hands the definition back typed, so `start` can check
 * the input it is given against what the flow's function takes.
 */
export function defineFlow<C extends ConversationContext, I = undefined, R = unknown>(
  definition: FlowDefinition<C, I, R>,
): FlowDefinition<C, I, R> {
  if (typeof definition.name !== 'string' || definition.name.length === 0) {
    throw new ValidationError('a flow needs a name')
  }

  return definition
}

/**
 * The conversation plugin.
 *
 * Installable on anything that takes middleware, which includes a client and a
 * router — a plugin should not have to name the client class it ends up on.
 */
export function conversation<C extends ConversationContext, S = unknown>(
  options: ConversationOptions<C, S>,
): Plugin<string, ConversationControls<C, S>, MiddlewareHost> & {
  /**
   * The same controls installing returns, reachable before and after it.
   *
   * A client installs its plugins when it starts, and an application needs
   * these around that — to pick flows up at startup, and to stop acting on
   * their deadlines at shutdown.
   */
  readonly controls: ConversationControls<C, S>
} {
  const { middleware, controls, lifecycle } = createParts(options)

  return {
    // Two conversations under different properties are two plugins, so the
    // name carries the property: installing both must not read as a conflict.
    name: options.property === undefined ? 'conversation' : `conversation:${options.property}`,
    controls,
    install(host: MiddlewareHost) {
      host.use(middleware as Middleware<never>)
      host.observe?.({
        started: () => {
          lifecycle.started()
        },
        stopping: async () => {
          await lifecycle.stopping()
        },
      })

      return controls
    },
  }
}

/**
 * Whether a message's text matches a pattern.
 *
 * The matching half of `hear`, separate from the registration so a caller can
 * use it inside a waiter as readily as in a handler. A string matches the whole
 * text exactly; anything looser is a regular expression or a predicate, because
 * a string that sometimes meant "contains" would be the kind of rule nobody can
 * remember.
 */
export function hears(text: string | undefined, pattern: HearPattern): boolean {
  if (text === undefined) return false
  if (typeof pattern === 'string') return text === pattern
  if (typeof pattern === 'function') return pattern(text)

  // A global regular expression keeps its place between calls, which would make
  // the same pattern match every other message.
  pattern.lastIndex = 0

  return pattern.test(text)
}

/** Build a waiter that resolves on the next message matching a pattern. */
export function hearing<C extends ConversationContext & { readonly text?: string | undefined }>(
  pattern: HearPattern,
  spec: Omit<WaiterSpec<C, C>, 'match'> = {},
): WaiterSpec<C, C> {
  return { ...spec, match: (context) => hears(context.text, pattern) }
}

/**
 * Build a waiter that resolves on the next message with any text at all.
 *
 * What a question wants: the answer is whatever they typed, and the caller
 * decides whether it is acceptable through {@link WaiterSpec.validate}.
 */
export function answering<C extends ConversationContext & { readonly text?: string | undefined }>(
  spec: Omit<WaiterSpec<C, string>, 'match' | 'transform'> = {},
): WaiterSpec<C, string> & { transform(context: C): string } {
  return {
    ...spec,
    match: (context) => typeof context.text === 'string' && context.text.length > 0,
    transform: (context) => context.text as string,
  }
}

/** Refuse a pattern that is not one of the three forms. */
export function checkPattern(pattern: unknown): asserts pattern is HearPattern {
  const kind = typeof pattern
  if (kind === 'string' || kind === 'function' || pattern instanceof RegExp) return

  throw new ValidationError('a pattern is a string, a regular expression or a predicate')
}

export type { SceneDefinition, ScenePosition, SceneStep, WaiterSpec }
