/**
 * Event contexts.
 *
 * Generated field shapes, hand-written behaviour, and the mapping from an event
 * kind to the context it produces.
 *
 * Everything a handler touches is reachable from here. The split between the
 * halves is the point: `EventFieldsByKind` is generated, so the optionality a
 * handler sees is Telegram's own, and the bound method families are generated
 * too, so the surface stays complete without being maintained — while `reply`,
 * `edit` and `react` are written by hand, because which fields an action
 * inherits from the message it answers is a judgement rather than a lookup.
 */

export { callbackQueryActions, type MessageActionDeps, messageActions } from './actions.js'
export {
  BindingConflictError,
  type BindingTable,
  type BoundApi,
  type BoundMethod,
  type CallbackQueryBoundApi,
  createBoundPrototype,
  type InlineQueryBoundApi,
  type MessageBoundApi,
  type PreCheckoutQueryBoundApi,
  type ShippingQueryBoundApi,
  UnresolvedBindingError,
} from './bound.js'
export {
  type CreateEventContextOptions,
  createEventContext,
  messageBearingKinds,
} from './create.js'
export type {
  AnswerOptions,
  AnyEventContext,
  CallbackQueryActions,
  CallbackQueryContext,
  CommandContext,
  ContextFor,
  EditOptions,
  EventContext,
  ForwardOptions,
  InlineQueryContext,
  MessageActions,
  MessageContext,
  MessageEventKind,
  OptionsFor,
  ParsedCommand,
  PinOptions,
  PreCheckoutQueryContext,
  ReactOptions,
  ReplyOptions,
  SendContent,
  SendOptions,
  ShippingQueryContext,
  TextMessageContext,
} from './types.js'
