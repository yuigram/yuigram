/**
 * Onion middleware composition.
 *
 * Middleware receives the context and a continuation. Work before `next()`
 * runs on the way in, work after it runs on the way out:
 *
 * ```
 * logging   ──┐                                    ┌── logging
 *   session ──┐                                ┌── session
 *     auth  ──┐                            ┌── auth
 *              handler
 * ```
 *
 * This model is chosen over an event emitter or a return-value pipeline
 * because it is the only one that lets userland express timing, error
 * boundaries, transactions and cleanup without the framework adding a hook for
 * each. Every cross-cutting concern in the framework is built on it.
 */

import { YuigramError } from '../errors/errors.js'

/** The continuation passed to middleware. */
export type Next = () => Promise<void>

/**
 * A middleware function.
 *
 * The return value is ignored, so an expression body works:
 * `(ctx, next) => next()`. Requiring `void` would reject the most natural way
 * to write the most common middleware.
 */
export type Middleware<C> = (context: C, next: Next) => unknown

/** Raised when middleware calls `next()` more than once. */
export class MiddlewareError extends YuigramError {
  override readonly name = 'MiddlewareError'
}

/**
 * Compose middleware into a single function.
 *
 * The composed function accepts an optional downstream continuation, so chains
 * nest: a router's chain runs as one link inside the application's chain.
 *
 * Calling `next()` twice within one middleware is an error rather than a
 * silent re-entry. It is almost always a mistake — usually an `await` missing
 * on a branch — and left undetected it re-runs every downstream middleware,
 * which duplicates side effects such as sending a reply.
 */
export function compose<C>(middlewares: ReadonlyArray<Middleware<C>>): Middleware<C> {
  // Copy so later mutation of the caller's array cannot change this chain.
  const chain = [...middlewares]

  return async (context: C, next?: Next): Promise<void> => {
    let lastCalled = -1

    const dispatch = async (index: number): Promise<void> => {
      if (index <= lastCalled) {
        throw new MiddlewareError(
          `next() called multiple times by middleware at index ${index - 1}`,
        )
      }
      lastCalled = index

      const middleware = chain[index]

      if (middleware === undefined) {
        // End of this chain: hand control to the downstream continuation when
        // one was supplied, so composed chains nest cleanly.
        if (next !== undefined) await next()
        return
      }

      await middleware(context, () => dispatch(index + 1))
    }

    await dispatch(0)
  }
}

/**
 * Run a chain to completion.
 *
 * Convenience for the common case where there is no downstream continuation.
 */
export async function run<C>(middlewares: ReadonlyArray<Middleware<C>>, context: C): Promise<void> {
  if (middlewares.length === 0) return
  await compose(middlewares)(context, async () => {})
}

/**
 * Gate middleware on a predicate: run it on a match, skip to `next()` otherwise.
 *
 * Skipping rather than blocking is what makes a gated middleware safe to place
 * anywhere in a chain — a non-match must not stop the updates behind it.
 */
export function when<C>(
  predicate: (context: C) => boolean | Promise<boolean>,
  middleware: Middleware<C>,
): Middleware<C> {
  return async (context, next) => {
    if (await predicate(context)) {
      await middleware(context, next)
      return
    }
    await next()
  }
}
