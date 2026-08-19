/**
 * Telegram Bot API subsystem.
 *
 * Owns the HTTP transport, the generated Bot API surface, polling, webhooks,
 * file handling and update normalization.
 *
 * It may import from `@yuigram/core`. It must never import from
 * `@yuigram/mtproto` — the two transports are independent by design.
 */

/** Package name, used by diagnostics and error messages. */
export const PACKAGE_NAME = '@yuigram/bot-api'
