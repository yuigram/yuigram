/**
 * Telegram Bot API subsystem.
 *
 * Owns the HTTP transport, the generated Bot API surface, polling, webhooks,
 * file handling and update normalization.
 *
 * It may import from `@yuigram/core`. It must never import from
 * `@yuigram/mtproto` — the two transports are independent by design.
 */

export type { ApiMethods } from './generated/api.js'
export type * from './generated/methods/index.js'
export type * from './generated/types/index.js'
export type { BotApiTypeName } from './generated/types/names.js'
export type {
  ApiRequest,
  ApiResponse,
  ApiResult,
  HttpClient,
  ResponseParameters,
} from './http/index.js'
export { type InputFile, isInputFile, type NamedFile } from './input-file.js'
