/**
 * The seam between the protocol and the framework.
 *
 * Below this nothing is shared with the Bot API; above it everything is. What
 * crosses is an event: a kind, the few fields every reader wants, and the
 * update it came from.
 */

export { type ContextOptions, contextFor, type MtprotoContext, mtprotoContext } from './context.js'
export {
  ACCOUNT_KINDS,
  MESSAGE_UPDATES,
  type MtprotoEventKind,
  RAW_KIND,
  SHARED_KINDS,
  SHORT_MESSAGE_UPDATES,
  UPDATE_EVENTS,
} from './events.js'
export { type NormalizedUpdate, normalizeUpdate, type PeerRef } from './normalize.js'
export { type SentMessage, sentMessage } from './sent.js'
