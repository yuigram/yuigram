/**
 * Transport-agnostic framework core.
 *
 * This package holds the parts of Yuigram that belong to neither transport:
 * dispatch, middleware, filters, the context contract, sessions, storage,
 * errors, logging and the plugin system — and the two notations a Telegram
 * peer or link is written in outside a session, marked identifiers and links,
 * which both transports read and neither owns.
 *
 * It must never import from `@yuigram/bot-api` or `@yuigram/mtproto`.
 * The boundary is enforced by the layer-boundary invariant.
 */

export {
  type AttachTarget,
  botApiId,
  isMarkedPeerId,
  type LinkAdminRight,
  type LinkChat,
  LinkError,
  type MarkedKind,
  type MiniAppMode,
  markedKind,
  PeerIdError,
  type PeerIdentity,
  type PeerIdentityKind,
  peerIdentity,
  readLink,
  type TelegramLink,
  writeLink,
} from './addressing/addressing.js'
export { App, AppError, type AppOptions, type ClientFailure } from './app/app.js'
export type { AppClient } from './app/client.js'
export {
  type ContextContribution,
  ContextExtender,
  ContextKeyConflictError,
  defineLazy,
  type LazyOptions,
} from './context/extend.js'
export type {
  BaseContext,
  Context,
  ContextActions,
  Flavor,
  UnifiedContext,
} from './context/types.js'
export {
  answering,
  type Conversation,
  type ConversationContext,
  type ConversationControls,
  type ConversationFlavour,
  type ConversationOptions,
  checkPattern,
  conversation,
  createConversation,
  defineFlow,
  type FlowControls,
  type HearPattern,
  hearing,
  hears,
} from './conversation/conversation.js'
export type {
  EffectOnce,
  EffectOptions,
  Flow,
  FlowAddress,
  FlowDefinition,
  FlowDrive,
  FlowEntry,
  FlowFailure,
  FlowOptions,
  FlowProblem,
  FlowRecord,
  FlowResumeReport,
  FlowState,
  FlowStatus,
  FlowWaiting,
  FlowWaitSpec,
} from './conversation/flows.js'
export {
  type Addressed,
  type AddressedPeer,
  addressPart,
  type ConversationKeyFn,
  ConversationLocks,
  type ConversationScope,
  checkScope,
  conversationKey,
  DEFAULT_SCOPE,
} from './conversation/identity.js'
export {
  type SceneControls,
  type SceneDefinition,
  type SceneOutcome,
  type ScenePosition,
  SceneRegistry,
  type SceneStep,
} from './conversation/scenes.js'
export {
  EffectUncertainError,
  FlowStepError,
  type RegisterOptions,
  WaitCancelledError,
  WaiterRegister,
  type WaiterSpec,
  WaitTimeoutError,
} from './conversation/waiters.js'
export {
  type AfterHook,
  type BeforeHook,
  type Dependencies,
  type Dispatchable,
  Dispatcher,
  type DispatcherOptions,
  type ErrorHandler,
  type Handler,
  type KindCoverage,
  type OnOptions,
  type Priority,
  Propagation,
  type PropagationAction,
  type UseOptions,
} from './dispatch/dispatcher.js'
export {
  AuthError,
  CancelledError,
  ConfigError,
  causeChain,
  type ErrorOptions,
  FloodError,
  findCause,
  MarkupParseError,
  NetworkError,
  PeerError,
  PluginConflictError,
  PluginCycleError,
  PluginDependencyError,
  PluginError,
  SessionError,
  StorageError,
  TelegramError,
  ValidationError,
  YuigramError,
} from './errors/errors.js'
export {
  and,
  type DefineOptions,
  defineAsyncFilter,
  defineFilter,
  every,
  isAsyncFilter,
  isFilter,
  not,
  or,
  some,
} from './filter/define.js'
export type {
  AnyFilter,
  AsyncFilter,
  ExtractBase,
  ExtractMod,
  Filter,
  FilterMatch,
  FilterMeta,
  Modify,
} from './filter/types.js'
export type { Hook } from './hook/hook.js'
export {
  Lifecycle,
  LifecycleError,
  type LifecycleHooks,
  type LifecycleState,
  type StopContext,
  type StopOptions,
} from './lifecycle/lifecycle.js'
export {
  consoleSink,
  createLogger,
  LOG_LEVELS,
  type LogFields,
  type Logger,
  type LoggerOptions,
  type LogLevel,
  type LogRecord,
  type LogSink,
  silentSink,
} from './log/logger.js'
export { isSensitiveKey, REDACTED, redact, redactString } from './log/redact.js'
export {
  compose,
  type HostObserver,
  type Middleware,
  MiddlewareError,
  type MiddlewareHost,
  type Next,
  run,
  when,
} from './middleware/compose.js'
export {
  definePlugin,
  type InstalledPlugin,
  type Plugin,
  PluginRegistry,
  resolveInstallOrder,
} from './plugin/plugin.js'
export {
  createScheduler,
  type DrainOptions,
  type Scheduler,
  type SchedulerOptions,
} from './scheduler/scheduler.js'
export {
  createSession,
  type SessionFlavor,
  type SessionHandle,
  type SessionHost,
  type SessionKeyFn,
  type SessionOptions,
  session,
  userChatKey,
} from './session/session.js'
export { namespaced, tiered } from './storage/compose.js'
export { encrypted } from './storage/encrypted.js'
export { type FileOptions, file } from './storage/file.js'
export {
  type AcquireOptions,
  defaultGuard,
  type Guard,
  type GuardHold,
  type GuardScope,
  processGuard,
  webLocksGuard,
} from './storage/guard.js'
export { type MemoryOptions, memory } from './storage/memory.js'
export type { DescribedKV, KV, KVInfo, SetOptions } from './storage/types.js'
export { type WebOptions, type WebStorageLike, web } from './storage/web.js'
