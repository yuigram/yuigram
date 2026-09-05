// GENERATED FILE — do not edit.
// Bot API types: Games
// Source: Telegram Bot API 10.3, schemas/bot-api/10.3.json

import type { Animation, MessageEntity, PhotoSize, User } from './available-types.js'

/**
 * This object represents a game. Use BotFather to create and edit games, their
 * short names will act as unique identifiers.
 *
 * @see https://corefork.telegram.org/bots/api#game
 */
export interface Game {
  /**
   * Title of the game
   */
  readonly title: string

  /**
   * Description of the game
   */
  readonly description: string

  /**
   * Photo that will be displayed in the game message in chats
   */
  readonly photo: PhotoSize[]

  /**
   * Brief description of the game or high scores included in the game message.
   * Can be automatically edited to include current high scores for the game when
   * the bot calls setGameScore, or manually edited using editMessageText. 0-4096
   * characters.
   */
  readonly text?: string | undefined

  /**
   * Special entities that appear in text, such as usernames, URLs, bot commands,
   * etc.
   */
  readonly text_entities?: MessageEntity[] | undefined

  /**
   * Animation that will be displayed in the game message in chats. Upload via
   * BotFather.
   */
  readonly animation?: Animation | undefined
}

/**
 * A placeholder, currently holds no information. Use BotFather to set up your
 * game.
 *
 * @see https://corefork.telegram.org/bots/api#callbackgame
 */
// biome-ignore lint/suspicious/noEmptyInterface: Telegram documents this type as carrying no fields
export interface CallbackGame {}

/**
 * This object represents one row of the high scores table for a game.
 *
 * @see https://corefork.telegram.org/bots/api#gamehighscore
 */
export interface GameHighScore {
  /**
   * Position in high score table for the game
   */
  readonly position: number

  /**
   * User
   */
  readonly user: User

  /**
   * Score
   */
  readonly score: number
}
