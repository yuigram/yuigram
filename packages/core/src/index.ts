/**
 * Transport-agnostic framework core.
 *
 * This package holds the parts of Yuigram that know nothing about Telegram:
 * dispatch, middleware, filters, the context contract, sessions, storage,
 * errors, logging and the plugin system.
 *
 * It must never import from `@yuigram/bot-api` or `@yuigram/mtproto`.
 * The boundary is enforced by the layer-boundary invariant.
 */

/** Package name, used by diagnostics and error messages. */
export const PACKAGE_NAME = '@yuigram/core'
