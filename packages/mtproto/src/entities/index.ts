/**
 * Reading what Telegram sent, without narrowing it by hand.
 *
 * The schema's types are the truth and stay reachable, but reading one means
 * knowing which constructor arrived and which fields that constructor carries.
 * A view answers the questions instead: it holds the value, computes on access,
 * caches nothing and reaches nothing.
 *
 * Behaviour is deliberately not here. Answering a message, editing it or
 * fetching what it carried needs an account and the conversation the update
 * arrived in, and that is what the event already owns — `docs/api-design.md` §6.
 * A view that could act would be a second owner of the network.
 */

export { type MessageForm, MessageView, readMessage, sameMessage } from './message.js'
export {
  type ChatForm,
  ChatView,
  type PeerBearing,
  PeerIndex,
  readChat,
  readPeers,
  readUser,
  UserView,
} from './peer.js'
