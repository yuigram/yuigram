/**
 * Markup, into and out of message entities.
 *
 * The Bot API takes markup and a `parse_mode` and parses on the server. MTProto
 * has no such field: a message is plain text plus a list of ranges, and
 * producing those ranges is the client's job. This is where that happens, in
 * both dialects and both directions.
 *
 * ```ts
 * const body = fromHtml`Hello, <b>${name}</b>`
 *
 * await account.call(sendMessage({ peer, ...body, random_id }))
 * ```
 *
 * Called as template tags, `fromHtml` and `fromMarkdown` escape what is
 * interpolated and leave the literal parts alone — the markup is written by the
 * developer and the values come from strangers, which is the way round that
 * keeps a user called `<b>` from breaking a message.
 */

export { fromHtml, toHtml } from './html.js'
export { fromMarkdown, toMarkdown } from './markdown.js'
export type { FormattedText, Markup } from './text.js'
