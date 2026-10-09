// SPDX-License-Identifier: MIT

/**
 * Telegram Bot API subsystem.
 *
 * Owns the HTTP transport, the generated Bot API surface, polling, webhooks,
 * file handling and update normalization.
 *
 * It may import from `@yuigram/core`. It must never import from
 * `@yuigram/mtproto` — the two transports are independent by design.
 */

export {
  type ApiCall,
  type ApiHook,
  type CreateApiOptions,
  createApi,
  type RawApi,
  type RawApiExtras,
} from './api.js'
export type { CallOptions } from './api-options.js'
export {
  Bot,
  type BotOptions,
  type EventHandler,
  type PollOptions,
} from './bot.js'
export {
  CALLBACK_DATA_LIMIT,
  type CallbackData,
  CallbackDataInvalid,
  CallbackDataTooLong,
  type CallbackValue,
  defineCallbackData,
  type FieldSpec,
} from './callback-data.js'
export {
  type ChatActionOptions,
  type ChatActionTarget,
  chatAction,
  type RunningChatAction,
  withChatAction,
} from './chat-action.js'
export { parseCommand } from './command.js'
export type { CommonDefaults, MethodDefaults, ParamsOf } from './defaults.js'
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
export {
  type AnswerOptions,
  type AnyEventContext,
  BindingConflictError,
  type BindingTable,
  type BoundApi,
  type BoundMethod,
  type CallbackQueryActions,
  type CallbackQueryBoundApi,
  type CallbackQueryContext,
  type CommandContext,
  type ContextFor,
  type CreateEventContextOptions,
  createBoundPrototype,
  createEventContext,
  type EditOptions,
  type EventContext,
  type ForwardOptions,
  type InlineQueryBoundApi,
  type InlineQueryContext,
  type MessageActions,
  type MessageBoundApi,
  type MessageContext,
  type MessageEventKind,
  type OptionsFor,
  type ParsedCommand,
  type PinOptions,
  type PreCheckoutQueryBoundApi,
  type PreCheckoutQueryContext,
  type ReactOptions,
  type ReplyOptions,
  type SendContent,
  type SendOptions,
  type ShippingQueryBoundApi,
  type ShippingQueryContext,
  type TextMessageContext,
  UnresolvedBindingError,
} from './events/index.js'
export { asyncFilter, filter } from './filter.js'
export {
  f,
  has,
  hasQuery,
  MESSAGE_BEARING_KINDS,
  type MemberChange,
  type PresenceFilters,
  type TextMatch,
} from './filters/index.js'
export {
  escapeHtml,
  escapeMarkdown,
  escapeMarkdownV2,
  format,
  html,
  md,
  type RawText,
  raw,
} from './format.js'
export type { ApiMethods } from './generated/api.js'
export {
  CALLBACK_QUERY_BOUND,
  CHAT_BOUND,
  INLINE_QUERY_BOUND,
  MESSAGE_BOUND,
  PRE_CHECKOUT_QUERY_BOUND,
  SHIPPING_QUERY_BOUND,
  SOURCE_BOUND,
} from './generated/bindings.js'
export type * from './generated/contexts.js'
export type {
  BotEventKind,
  ServiceEventKind,
  UpdateEventKind,
  UpdatePayloads,
} from './generated/events.js'
export { SERVICE_EVENTS, UPDATE_EVENTS } from './generated/events.js'
export type * from './generated/methods/index.js'
export { type GeneratedRegistrations, REGISTRATIONS } from './generated/registrations.js'
export { BOT_API_VERSION } from './generated/schema-info.js'
export type * from './generated/types/index.js'
export type { BotApiTypeName } from './generated/types/names.js'
export { type FloodWaitOptions, retryOnFloodWait, withDefaults } from './hooks.js'
export { type FetchClientOptions, fetchClient } from './http/fetch-client.js'
export type {
  ApiRequest,
  ApiResponse,
  ApiResult,
  HttpClient,
  ResponseParameters,
} from './http/index.js'
export { type EncodedRequest, encodeRequest, hasUpload } from './http/multipart.js'
export {
  createBoundary,
  hasStreamingUpload,
  isStreamingSource,
  type Part,
  streamMultipart,
  writeMultipart,
} from './http/stream-multipart.js'
export { inline, resultId } from './inline.js'
export {
  claimUpload,
  type InputFile,
  isInputFile,
  markSingleUse,
  type NamedFile,
  NonReplayableUploadError,
  singleUseMark,
} from './input-file.js'
export { InlineKeyboard, Keyboard } from './keyboards.js'
export { type MediaOptions, media } from './media.js'
export {
  CACHEABLE_METHODS,
  type MediaCache,
  type MediaCacheOptions,
  type MediaKind,
  mediaCache,
} from './media-cache.js'
export { type NormalizedUpdate, normalizeUpdate, UNKNOWN_KIND } from './normalize.js'
export { type Pager, type PagerOptions, type Press, pager, type Shown } from './pager.js'
export {
  businessGifts,
  type Collected,
  type CursorFetch,
  chatGifts,
  cursorPages,
  type GiftFilters,
  type OffsetFetch,
  offsetPages,
  type Page,
  type PageOptions,
  type Pages,
  profileAudios,
  profilePhotos,
  starTransactions,
  userGifts,
} from './paginate.js'
export {
  type AlbumCaption,
  adminRights,
  attach,
  botCommands,
  content,
  type FiatInvoice,
  invoice,
  menuButton,
  newSticker,
  type PayloadFile,
  permissions,
  pollOption,
  preview,
  price,
  type RichMediaLink,
  type RichMessageOptions,
  type RichTextOptions,
  reaction,
  replyTo,
  richMedia,
  richMessage,
  type StarsInvoice,
  shipping,
} from './payloads.js'
export {
  type RateLimitInfo,
  type RateLimitKey,
  type RateLimitOptions,
  rateLimit,
} from './rate-limit.js'
export {
  type RegistrationTarget,
  registerCallbackQuery,
  registerCommand,
  registerText,
} from './registration.js'
export {
  isRouter,
  Router,
  type RouterHost,
  RouterInstalledError,
  type RouterOptions,
  type RouterThisClientCanHost,
} from './router.js'
export {
  chatKeyOf,
  createScheduler,
  type Scheduler,
  type UpdateSchedulerOptions,
} from './scheduler.js'
export {
  createWindow,
  DEFAULT_CHAT_PER_SECOND,
  DEFAULT_EXCLUDED_METHODS,
  DEFAULT_GLOBAL_PER_SECOND,
  DEFAULT_GROUP_PER_MINUTE,
  type MethodLimits,
  type SlidingWindow,
  type Throttle,
  ThrottledError,
  type ThrottleHandle,
  type ThrottleOptions,
  throttle,
} from './throttle.js'
export {
  createWebhookHandler,
  SECRET_HEADER,
  type WebhookHandler,
  type WebhookOptions,
  type WebhookRequest,
  type WebhookResponse,
} from './webhook/handler.js'
