/**
 * Buttons under a message, as an account sends them.
 *
 * The protocol spells a button as its label and what pressing it does, and a
 * row of them as a row; these build the two kinds that need no more than a
 * label and a value. Anything else is written as the schema has it and passed
 * as `markup` the same way.
 *
 * ```ts
 * await account.sendText(peer, 'Choose one', {
 *   markup: inlineKeyboard([[callbackButton('Yes', 'answer:yes'), callbackButton('No', 'answer:no')]]),
 * })
 * ```
 */

import { ValidationError } from '@yuigram/core'
import type { TypeKeyboardInlineButton, TypeReplyMarkup } from '../generated/api/types/index.js'

/** The most a button's data may carry, in bytes: Telegram's limit. */
export const CALLBACK_DATA_LIMIT = 64

/**
 * A button that sends its data back when pressed.
 *
 * Text is sent as UTF-8, which is how a callback-data schema writes it and how
 * `event.data` reads it back; bytes are sent as they are. Refused over 64
 * bytes, where Telegram would refuse the whole message.
 */
export function callbackButton(
  text: string,
  data: string | Uint8Array,
  options: { readonly requiresPassword?: boolean } = {},
): TypeKeyboardInlineButton {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
  if (bytes.length === 0 || bytes.length > CALLBACK_DATA_LIMIT) {
    throw new ValidationError(
      `a button's data is 1 to ${CALLBACK_DATA_LIMIT} bytes, and this is ${bytes.length}`,
    )
  }

  return {
    _: 'keyboardInlineButton',
    text,
    type: {
      _: 'inlineButtonTypeCallback',
      data: bytes,
      ...(options.requiresPassword === true ? { requires_password: true as const } : {}),
    },
  }
}

/** A button that opens an address. */
export function urlButton(text: string, url: string): TypeKeyboardInlineButton {
  return { _: 'keyboardInlineButton', text, type: { _: 'inlineButtonTypeUrl', url } }
}

/** Rows of buttons, as the markup a message carries under it. */
export function inlineKeyboard(
  rows: readonly (readonly TypeKeyboardInlineButton[])[],
): TypeReplyMarkup {
  return {
    _: 'replyInlineMarkup',
    rows: rows.map((buttons) => ({ _: 'keyboardInlineButtonRow', buttons: [...buttons] })),
  }
}
