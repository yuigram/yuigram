/**
 * Game scores.
 *
 * A game is a message carrying a board, and a score is set against whoever
 * played it. The four operations are two pairs: setting a score and reading the
 * table, each for a game in a conversation and for one sent through inline mode.
 *
 * ```
 *   in a conversation ──> (peer, message id)   ──> the edited message comes back
 *   inline            ──> inline message id    ──> only whether it worked
 * ```
 *
 * The difference in what comes back is Telegram's, not a simplification: an
 * inline message is not in any conversation this account can read, so there is
 * no message to hand back. An inline call is also made on the datacenter the
 * identifier names, the same as an inline edit, because the message lives there.
 */

import { ValidationError } from '@yuigram/core'
import type { MtprotoApi } from '../api.js'
import { MessageView } from '../entities/message.js'
import type {
  TypeHighScore,
  TypeInputBotInlineMessageID,
  TypeInputPeer,
  TypeInputUser,
} from '../generated/api/types/index.js'
import { readInlineMessageId } from '../messaging/interact.js'
import { userFor } from '../network/peers.js'
import type { PeerRef } from '../normalize/normalize.js'
import type { TlValue } from '../tl/index.js'

/** What acting on a game needs from a client. */
export interface Gaming {
  readonly api: MtprotoApi
  resolve(peer: string | PeerRef): Promise<TypeInputPeer>
  feed(value: TlValue): Promise<void>
  /** Make a call on a particular datacenter, for an inline message that lives there. */
  at?(dcId: number, query: TlValue): Promise<TlValue>
}

/** One row of a game's score table. */
export interface GameScore {
  /** Where this player stands, counted from one as Telegram sends it. */
  readonly position: number
  readonly user: PeerRef
  readonly score: number
}

/** How a score is set. */
export interface ScoreOptions {
  /**
   * Let the score go down.
   *
   * Telegram keeps a player's best score and ignores a lower one unless this
   * says otherwise, which is how a mistake or a cheat is corrected.
   */
  readonly force?: boolean
  /** Leave the game message as it is rather than showing the new score on it. */
  readonly noEdit?: boolean
}

/** Resolve a player, who is always one person. */
async function playerOf(client: Gaming, user: string | PeerRef): Promise<TypeInputUser> {
  const resolved = await client.resolve(user)
  const player = userFor(resolved)

  if (player === undefined) {
    throw new ValidationError('a game is played by a person, not by a conversation')
  }

  return player
}

/** Telegram refuses a score that is not a positive whole number. */
function checkScore(score: number): void {
  if (!Number.isInteger(score) || score < 0) {
    throw new ValidationError(`a score is a whole number of points, not ${score}`)
  }
}

/**
 * Set a player's score in a game sent to a conversation.
 *
 * The edited message comes back, because setting a score normally rewrites the
 * board to show it.
 */
export async function setGameScore(
  client: Gaming,
  chat: string | PeerRef,
  messageId: number,
  user: string | PeerRef,
  score: number,
  options: ScoreOptions = {},
): Promise<MessageView | undefined> {
  checkScore(score)

  const answer = await client.api.messages.setGameScore({
    peer: await client.resolve(chat),
    id: messageId,
    user_id: await playerOf(client, user),
    score,
    ...(options.noEdit === true ? {} : { edit_message: true }),
    ...(options.force === true ? { force: true } : {}),
  })

  await client.feed(answer as unknown as TlValue)

  return editedMessage(answer as unknown as TlValue)
}

/** The message an edit answered with, where it edited one. */
function editedMessage(answer: TlValue): MessageView | undefined {
  const updates = answer._ === 'updateShort' ? [answer['update'] as TlValue] : answer['updates']
  if (!Array.isArray(updates)) return undefined

  for (const update of updates as TlValue[]) {
    if (update._ === 'updateEditMessage' || update._ === 'updateEditChannelMessage') {
      return new MessageView(update['message'] as never)
    }
  }

  return undefined
}

/**
 * Set a player's score in a game sent through inline mode.
 *
 * Nothing comes back but whether it worked: the message is in a conversation
 * this account cannot read, and the identifier is all there is to name it by.
 */
export async function setInlineGameScore(
  client: Gaming,
  message: string | TypeInputBotInlineMessageID,
  user: string | PeerRef,
  score: number,
  options: ScoreOptions = {},
): Promise<void> {
  checkScore(score)

  const id = typeof message === 'string' ? readInlineMessageId(message) : message

  await onItsDatacenter(client, id, {
    _: 'messages.setInlineGameScore',
    id,
    user_id: await playerOf(client, user),
    score,
    ...(options.noEdit === true ? {} : { edit_message: true }),
    ...(options.force === true ? { force: true } : {}),
  })
}

/**
 * The score table of a game in a conversation.
 *
 * A player is always named. Telegram builds the table around somebody — their
 * own row, and the rows near it — rather than returning a global leaderboard,
 * so there is nothing to ask for without saying who.
 */
export async function getGameHighScores(
  client: Gaming,
  chat: string | PeerRef,
  messageId: number,
  user: string | PeerRef,
): Promise<readonly GameScore[]> {
  const answer = await client.api.messages.getGameHighScores({
    peer: await client.resolve(chat),
    id: messageId,
    user_id: await playerOf(client, user),
  })

  return scoresOf(answer)
}

/** The score table of a game sent through inline mode. */
export async function getInlineGameHighScores(
  client: Gaming,
  message: string | TypeInputBotInlineMessageID,
  user: string | PeerRef,
): Promise<readonly GameScore[]> {
  const id = typeof message === 'string' ? readInlineMessageId(message) : message

  const answer = await onItsDatacenter(client, id, {
    _: 'messages.getInlineGameHighScores',
    id,
    user_id: await playerOf(client, user),
  })

  return scoresOf(answer as unknown as { readonly scores: readonly TypeHighScore[] })
}

/**
 * Make the call where the inline message lives.
 *
 * An inline message identifier names the datacenter that holds it, and the
 * account has to be known there before a call about it will be answered. The
 * same route an inline edit takes.
 */
async function onItsDatacenter(
  client: Gaming,
  id: TypeInputBotInlineMessageID,
  query: TlValue,
): Promise<TlValue> {
  if (client.at === undefined) return (await client.api.call(query)) as unknown as TlValue

  return await client.at(id.dc_id, query)
}

/** Read a score table, which names its players in a list beside it. */
function scoresOf(answer: { readonly scores: readonly TypeHighScore[] }): readonly GameScore[] {
  return answer.scores.map((score) => ({
    position: score.pos,
    user: { kind: 'user' as const, id: score.user_id },
    score: score.score,
  }))
}
