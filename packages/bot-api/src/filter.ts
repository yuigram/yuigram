/**
 * Filters over the bot context.
 *
 * `defineFilter` in core takes a predicate over `unknown`, because a filter's
 * job is to decide what an arbitrary value is — it cannot assume the shape of
 * something it has not yet checked. That is right for the primitive and wrong
 * for almost every call site, which ends up writing `(v) => (v as Context)…`
 * to say something the dispatcher already guarantees.
 *
 * These wrappers close that gap for the Bot API subsystem, where the guarantee
 * is real: `Bot` only ever dispatches a `Context`, so a predicate registered
 * on a bot genuinely receives one. The cast disappears without anything being
 * assumed that is not already true.
 *
 * Use `defineFilter` directly when writing a filter that must decide what kind
 * of context it has been handed at all.
 */

import {
  type AsyncFilter,
  type DefineOptions,
  defineAsyncFilter,
  defineFilter,
  type Filter,
} from '@yuigram/core'
import type { Context } from './context.js'

/**
 * Define a filter over the bot context.
 *
 * ```ts
 * const isPrivate = filter('isPrivate', (ctx) => ctx.chat?.type === 'private')
 *
 * bot.on(isPrivate, (ctx) => ctx.reply('Just between us.'))
 * ```
 *
 * `Mod` describes what matching proves about the context beyond its base shape,
 * and is applied when the handler is registered:
 *
 * ```ts
 * const hasText = filter<{ text: string }>('hasText', (ctx) => ctx.text !== undefined)
 *
 * bot.on(hasText, (ctx) => ctx.reply(ctx.text.toUpperCase()))
 * ```
 *
 * Pass `kinds` when the filter can only ever match certain update kinds. The
 * dispatcher checks it before running the predicate, so an unrelated update
 * costs nothing:
 *
 * ```ts
 * filter('isPhoto', (ctx) => ctx.message?.photo !== undefined, { kinds: ['photo'] })
 * ```
 */
export function filter<Mod = unknown>(
  name: string,
  predicate: (context: Context) => boolean,
  options: DefineOptions = {},
): Filter<Context, Mod> {
  return defineFilter<Context, Mod>(name, (value) => predicate(value as Context), options)
}

/**
 * Define an asynchronous filter over the bot context.
 *
 * For predicates that have to ask something — a database, a cache, an
 * authorization service:
 *
 * ```ts
 * const isAdmin = asyncFilter('isAdmin', async (ctx) => {
 *   const member = await ctx.api.getChatMember({ chat_id: ctx.chat!.id, user_id: ctx.sender!.id })
 *   return member.status === 'administrator' || member.status === 'creator'
 * })
 * ```
 *
 * An async filter cannot narrow at a raw call site, since TypeScript has no
 * async type predicate. Handler registration still applies `Mod`.
 */
export function asyncFilter<Mod = unknown>(
  name: string,
  predicate: (context: Context) => Promise<boolean>,
  options: DefineOptions = {},
): AsyncFilter<Context, Mod> {
  return defineAsyncFilter<Context, Mod>(name, (value) => predicate(value as Context), options)
}
