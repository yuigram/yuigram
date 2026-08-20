/**
 * Event contexts.
 *
 * Generated field shapes, hand-written behaviour, and the mapping from an event
 * kind to the context it produces.
 *
 * **Not exported from the package yet.** This layer replaces the single shared
 * context rather than sitting beside it, and publishing both would mean two
 * `CommandContext` types on one surface for the length of the transition. It
 * becomes public in the same change that switches `Bot` over to it.
 */

export { callbackQueryActions, type MessageActionDeps, messageActions } from './actions.js'
export { type CreateContextOptions, createEventContext, messageBearingKinds } from './create.js'
export type {
  AnyEventContext,
  CallbackQueryActions,
  CallbackQueryContext,
  CommandContext,
  ContextFor,
  EventContext,
  MessageActions,
  MessageContext,
  MessageEventKind,
  ParsedCommand,
  SendOptions,
  TextMessageContext,
} from './types.js'
