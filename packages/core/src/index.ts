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

export {
  type AnyFilter,
  type AsyncFilter,
  and,
  type DefineOptions,
  defineAsyncFilter,
  defineFilter,
  type ExtractBase,
  type ExtractMod,
  every,
  type Filter,
  type FilterMatch,
  type FilterMeta,
  isAsyncFilter,
  isFilter,
  type Modify,
  not,
  or,
  some,
} from './filter/index.js'
