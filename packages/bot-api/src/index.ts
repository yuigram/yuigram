/**
 * Telegram Bot API subsystem.
 *
 * Owns the HTTP transport, the generated Bot API surface, polling, webhooks,
 * file handling and update normalization.
 *
 * It may import from `@yuigram/core`. It must never import from
 * `@yuigram/mtproto` — the two transports are independent by design.
 */

export { type CreateApiOptions, createApi, type RawApi, type RawApiExtras } from './api.js'
export type { CallOptions } from './api-options.js'
export {
  type DownloadDeps,
  type DownloadTarget,
  download,
  downloadStream,
  downloadToFile,
  getFile,
  getFileUrl,
  resolveTarget,
} from './download.js'
export { BotApiError, isRetryable, toError, toNetworkError } from './errors.js'
export type { ApiMethods } from './generated/api.js'
export type {
  BotEventKind,
  ServiceEventKind,
  UpdateEventKind,
  UpdatePayloads,
} from './generated/events.js'
export { SERVICE_EVENTS, UPDATE_EVENTS } from './generated/events.js'
export type * from './generated/methods/index.js'
export type * from './generated/types/index.js'
export type { BotApiTypeName } from './generated/types/names.js'
export { type FetchClientOptions, fetchClient } from './http/fetch-client.js'
export type {
  ApiRequest,
  ApiResponse,
  ApiResult,
  HttpClient,
  ResponseParameters,
} from './http/index.js'
export { type EncodedRequest, encodeRequest, hasUpload } from './http/multipart.js'
export { type InputFile, isInputFile, type NamedFile } from './input-file.js'
export { type NormalizedUpdate, normalizeUpdate, UNKNOWN_KIND } from './normalize.js'
