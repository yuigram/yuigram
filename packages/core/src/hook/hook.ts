/**
 * Wrapping an outgoing call.
 *
 * A hook sits between a caller and the transport that carries its call: it may
 * inspect what is being sent, decide when to send it, retry it, or answer
 * without sending it at all. Whether a call is an HTTP request or a serialized
 * TL function is not something the mechanism needs to know — only that it can
 * be described, deferred, and eventually performed.
 *
 * The shape is deliberately the same as a middleware's: receive the subject and
 * a continuation, and choose whether to call it. What differs is the direction.
 * Middleware wraps work arriving from outside; a hook wraps work leaving for it.
 */

/**
 * A wrapper around one outgoing call.
 *
 * Calling `next` performs the call and resolves with its result. Not calling it
 * answers the call without performing it, which is how a cache or a circuit
 * breaker short-circuits. Throwing propagates to the caller.
 */
export type Hook<TCall> = (call: TCall, next: () => Promise<unknown>) => Promise<unknown>
