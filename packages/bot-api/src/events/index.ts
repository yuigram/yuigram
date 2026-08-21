/**
 * Event contexts.
 *
 * Generated field shapes, hand-written behaviour, and the mapping from an event
 * kind to the context it produces.
 *
 * Everything a handler touches is reachable from here. The split between the
 * two halves is the point: `EventFieldsByKind` is generated, so the optionality
 * a handler sees is Telegram's own, while `reply`, `edit` and `react` are
 * written by hand, because which fields an action inherits from the message it
 * answers is a judgement rather than a lookup.
 */

export { callbackQueryActions, type MessageActionDeps, messageActions } from './actions.js'
export {
  type CreateEventContextOptions,
  createEventContext,
  messageBearingKinds,
} from './create.js'
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
