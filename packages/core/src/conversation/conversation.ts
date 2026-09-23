/**
 * Conversations: scenes, prompts and flows under one plugin.
 *
 * Four capabilities that are usually four packages, built on one idea — that a
 * conversation has an identity, and state belongs to it:
 *
 * ```
 *   conversation()
 *     ├── ctx.scene    ──> enter, leave, where am I
 *     ├── ctx.wait     ──> stop here until the next matching update
 *     ├── ctx.ask      ──> say something, then wait for the answer
 *     └── ctx.hear     ──> (registered once) match text against patterns
 * ```
 *
 * They share the key, the lock and the storage rather than each inventing its
 * own, which is what keeps them consistent with one another: a prompt opened
 * inside a scene belongs to the same conversation the scene does, and leaving
 * the scene cancels the prompt instead of leaving it waiting for an answer
 * nobody will read.
 *
 * **What is durable and what is not.** A scene's position is stored, so a
 * restart resumes it. A `wait` is a suspended function in memory, so a restart
 * does not: the promise is gone with the process. That difference is real and
 * this package does not paper over it — a form built from scene steps survives
 * a deployment, and one built from `await ctx.wait(...)` does not. Both are
 * offered because both are useful, and {@link ConversationFlavour.wait} says
 * which it is at the point where a caller chooses.
 *
 * **Order matters.** The plugin installs one middleware which, for each update,
 * offers it to the open waiter first and then to the scene. A waiter is more
 * specific than a scene — it was opened by a step that is still running — so
 * it is asked first.
 */

import type { BaseContext } from '../context/types.js'
import { ValidationError } from '../errors/errors.js'
import type { Middleware, MiddlewareHost, Next } from '../middleware/compose.js'
import type { Plugin } from '../plugin/plugin.js'
import type { KV } from '../storage/types.js'
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
   * built from scene steps, whose position is stored.
   */
  wait<T = unknown>(spec: WaiterSpec<ConversationContext, T>): Promise<T | undefined>
  /** Whether something in this conversation is waiting for an update. */
  readonly waiting: boolean
  /** Cancel whatever this conversation is waiting for. */
  cancelWait(reason?: string): boolean
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
  /** Schedules waiter timeouts. Supplied so tests need not wait in real time. */
  readonly schedule?: (run: () => void, delayMs: number) => () => void
}

/**
 * What the plugin hands back, for an application that drives it directly.
 *
 * Mostly for defining scenes after the plugin is installed, and for shutting
 * down: `cancelAll` rejects every open waiter, so a client stopping does not
 * leave suspended handlers holding a promise nobody will settle.
 */
export interface ConversationControls<C extends ConversationContext, S> {
  /** Define another scene. */
  addScene(definition: SceneDefinition<C, S>): void
  /** Cancel every open waiter in every conversation. */
  cancelAll(reason?: string): void
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

    const conversation = bind<C, S>({ key, context, scenes, waiters })
    Object.defineProperty(context, property, {
      value: conversation,
      configurable: true,
      enumerable: false,
    })

    // Serialised per conversation: two updates for the same person cannot both
    // read the position before either writes it. Different conversations are
    // untouched by this and run in parallel.
    await locks.run(key, async () => {
      // A waiter is more specific than a scene — a step that is waiting opened
      // it — so it is offered the update first.
      const { consumed } = await waiters.offer(context)
      if (consumed) return

      const outcome = await scenes.offer(key, context)
      if (outcome.handled) return

      await next()
    })
  }

  return {
    middleware,
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
    },
  }
}

/** Build the per-update handle a context carries. */
function bind<C extends ConversationContext, S>(options: {
  readonly key: string
  readonly context: C
  readonly scenes: SceneRegistry<C, S>
  readonly waiters: WaiterRegister<C>
}): Conversation<S> {
  const { key, context, scenes, waiters } = options

  return {
    key,
    position: async () => await scenes.positionOf(key),
    enter: async (scene, state) => {
      // Entering a scene ends whatever the conversation was waiting for: the
      // code that opened it belongs to the conversation it is leaving.
      waiters.cancel(key, 'the conversation entered a scene')
      await scenes.enter(key, context, scene, state)
    },
    leave: async (leaving) => {
      waiters.cancel(key, 'the conversation left the scene')

      return await scenes.leave(key, context, leaving ?? {})
    },
    reset: async () => {
      waiters.cancel(key, 'the conversation was reset')
      await scenes.reset(key)
    },
    wait: async (spec) => await waiters.wait(key, spec),
    get waiting() {
      return waiters.waiting(key)
    },
    cancelWait: (reason) => waiters.cancel(key, reason),
  }
}

/**
 * The conversation plugin.
 *
 * Installable on anything that takes middleware, which includes a client and a
 * router — a plugin should not have to name the client class it ends up on.
 */
export function conversation<C extends ConversationContext, S = unknown>(
  options: ConversationOptions<C, S>,
): Plugin<string, ConversationControls<C, S>, MiddlewareHost> {
  const { middleware, controls } = createConversation(options)

  return {
    // Two conversations under different properties are two plugins, so the
    // name carries the property: installing both must not read as a conflict.
    name: options.property === undefined ? 'conversation' : `conversation:${options.property}`,
    install(host: MiddlewareHost) {
      host.use(middleware as Middleware<never>)

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
): WaiterSpec<C, string> {
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
