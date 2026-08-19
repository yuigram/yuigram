// GENERATED FILE — do not edit.
// Bot API method parameters: Telegram Passport
// Source: Telegram Bot API 10.2, schemas/bot-api/10.2.json

import type { PassportElementError } from '../types/index.js'

/**
 * Parameters for `setPassportDataErrors`.
 *
 * @see https://corefork.telegram.org/bots/api#setpassportdataerrors
 */
export interface SetPassportDataErrorsParams {
  /**
   * User identifier
   */
  user_id: number

  /**
   * A JSON-serialized Array describing the errors
   */
  errors: PassportElementError[]
}
