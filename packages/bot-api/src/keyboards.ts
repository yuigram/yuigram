/**
 * Keyboards.
 *
 * A keyboard is a nested array of button objects, and writing one by hand is
 * both tedious and easy to get subtly wrong — a button with two mutually
 * exclusive fields set is accepted by the type and rejected by Telegram.
 *
 * ```ts
 * const menu = new InlineKeyboard()
 *   .text('Buy', 'buy:1')
 *   .url('Docs', 'https://core.telegram.org/bots/api')
 *   .row()
 *   .text('Cancel', 'cancel')
 *
 * await message.reply('Pick one', { reply_markup: menu })
 * ```
 *
 * ## Why one class and not two
 *
 * A reference implementation splits this into a keyboard class of static button
 * factories plus a separate builder class, so a developer chooses between
 * `InlineKeyboard.keyboard([[InlineKeyboard.text({ … })]])` and
 * `new InlineKeyboardBuilder().textButton({ … })` for the same result. There is
 * no decision worth making there: the fluent form reads better in every case,
 * and the array form is what `from()` is for when a keyboard is already data.
 *
 * ## Why it is the markup, not a builder for it
 *
 * `InlineKeyboard` *implements* `InlineKeyboardMarkup` — `inline_keyboard` is a
 * real property, filled in as buttons are added. So it passes straight to
 * `reply_markup` with no `.build()` or `.toJSON()` step to forget, and a
 * function that accepts markup accepts one of these without knowing it exists.
 */

import { ValidationError } from '@yuigram/core'
import type {
  CopyTextButton,
  ForceReply,
  InlineKeyboardButton,
  InlineKeyboardMarkup,
  KeyboardButton,
  KeyboardButtonPollType,
  KeyboardButtonRequestChat,
  KeyboardButtonRequestUsers,
  LoginUrl,
  ReplyKeyboardMarkup,
  ReplyKeyboardRemove,
  SwitchInlineQueryChosenChat,
  WebAppInfo,
} from './generated/types/index.js'

/** Longest a callback payload may be, in bytes, as Telegram documents it. */
const CALLBACK_DATA_LIMIT = 64

/**
 * Reject a payload Telegram will reject.
 *
 * Telegram answers `BUTTON_DATA_INVALID` some time later, from a call that
 * mentions neither the button nor the string, so the failure is worth catching
 * where the button is written.
 */
function assertCallbackData(data: string): string {
  const size = new TextEncoder().encode(data).length

  if (size > CALLBACK_DATA_LIMIT) {
    throw new ValidationError(
      `callback data is ${size} bytes; Telegram accepts at most ${CALLBACK_DATA_LIMIT}. ` +
        `Store the payload and put a key in the button.`,
    )
  }

  return data
}

/** Shared row bookkeeping. */
abstract class Rows<Button> {
  /** Rows built so far. The last one is open for more buttons. */
  protected readonly rows: Button[][] = [[]]

  /** Append a button to the open row. */
  protected push(button: Button): this {
    ;(this.rows.at(-1) as Button[]).push(button)
    return this
  }

  /**
   * Start a new row.
   *
   * Calling it twice does nothing the second time: an empty row is not a
   * layout, and Telegram rejects one.
   */
  row(): this {
    if ((this.rows.at(-1) as Button[]).length > 0) this.rows.push([])
    return this
  }

  /**
   * Re-flow every button into rows of at most `size`.
   *
   * For keyboards built from data, where the row breaks are a layout decision
   * rather than part of the content.
   */
  columns(size: number): this {
    if (size < 1) throw new ValidationError('a keyboard needs at least one column per row')

    const flat = this.rows.flat()
    this.rows.length = 0

    for (let index = 0; index < flat.length; index += size) {
      this.rows.push(flat.slice(index, index + size))
    }

    if (this.rows.length === 0) this.rows.push([])
    return this
  }

  /** Number of buttons, across every row. */
  get size(): number {
    return this.rows.reduce((total, row) => total + row.length, 0)
  }

  /** The rows, with the trailing empty one dropped. */
  protected built(): Button[][] {
    const last = this.rows.at(-1)
    return last !== undefined && last.length === 0 ? this.rows.slice(0, -1) : [...this.rows]
  }
}

/**
 * An inline keyboard, attached to a message.
 *
 * Buttons go into the open row until `row()` starts another.
 */
export class InlineKeyboard extends Rows<InlineKeyboardButton> implements InlineKeyboardMarkup {
  /** The markup Telegram receives. Kept in step as buttons are added. */
  get inline_keyboard(): InlineKeyboardButton[][] {
    return this.built()
  }

  /** Build from existing markup or rows of buttons. */
  static from(
    source: InlineKeyboardMarkup | InlineKeyboardButton[][] | InlineKeyboardButton[],
  ): InlineKeyboard {
    const rows = Array.isArray(source)
      ? source.every((item) => Array.isArray(item))
        ? (source as InlineKeyboardButton[][])
        : [source as InlineKeyboardButton[]]
      : source.inline_keyboard

    const keyboard = new InlineKeyboard()
    keyboard.rows.length = 0
    keyboard.rows.push(...rows.map((row) => [...row]))
    if (keyboard.rows.length === 0) keyboard.rows.push([])

    return keyboard
  }

  /** A button that sends `data` back as a callback query. */
  text(text: string, data: string): this {
    return this.push({ text, callback_data: assertCallbackData(data) })
  }

  /** A button that opens a URL. */
  url(text: string, url: string): this {
    return this.push({ text, url })
  }

  /** A button that opens a Mini App. */
  webApp(text: string, url: string | WebAppInfo): this {
    return this.push({ text, web_app: typeof url === 'string' ? { url } : url })
  }

  /** A button that logs the user in through Telegram. */
  login(text: string, url: string | LoginUrl): this {
    return this.push({ text, login_url: typeof url === 'string' ? { url } : url })
  }

  /** A button that opens chat selection and inserts an inline query there. */
  switchInline(text: string, query = ''): this {
    return this.push({ text, switch_inline_query: query })
  }

  /** A button that inserts an inline query into the current chat. */
  switchInlineCurrent(text: string, query = ''): this {
    return this.push({ text, switch_inline_query_current_chat: query })
  }

  /** A button that inserts an inline query into a chat of a chosen kind. */
  switchInlineChosen(text: string, options: SwitchInlineQueryChosenChat = {}): this {
    return this.push({ text, switch_inline_query_chosen_chat: options })
  }

  /** A button that copies text to the clipboard. */
  copy(text: string, copyText: string | CopyTextButton): this {
    return this.push({
      text,
      copy_text: typeof copyText === 'string' ? { text: copyText } : copyText,
    })
  }

  /**
   * A button that launches a game.
   *
   * Telegram requires it to be the first button of the first row.
   */
  game(text: string): this {
    return this.push({ text, callback_game: {} })
  }

  /**
   * A button that opens the invoice payment interface.
   *
   * Telegram requires it to be the first button of the first row.
   */
  pay(text: string): this {
    return this.push({ text, pay: true })
  }

  /** Add ready-made buttons to the open row. */
  add(...buttons: InlineKeyboardButton[]): this {
    for (const button of buttons) this.push(button)
    return this
  }

  /**
   * Add a row of buttons built from a list.
   *
   * The common shape for a keyboard whose contents come from data rather than
   * from source: one button per item, laid out afterwards with `columns`.
   */
  addFrom<T>(items: Iterable<T>, build: (item: T, index: number) => InlineKeyboardButton): this {
    let index = 0
    for (const item of items) {
      this.push(build(item, index))
      index += 1
    }
    return this
  }

  /** Serialize as markup. */
  toJSON(): InlineKeyboardMarkup {
    return { inline_keyboard: this.inline_keyboard }
  }
}

/**
 * A reply keyboard, shown in place of the user's keyboard.
 *
 * The options read as statements about the keyboard — `.resized()`,
 * `.oneTime()` — rather than as flags to set, so a keyboard is one expression.
 */
export class Keyboard extends Rows<KeyboardButton> implements ReplyKeyboardMarkup {
  #persistent: boolean | undefined
  #resize: boolean | undefined
  #oneTime: boolean | undefined
  #selective: boolean | undefined
  #placeholder: string | undefined

  /** The markup Telegram receives. */
  get keyboard(): KeyboardButton[][] {
    return this.built()
  }

  get is_persistent(): boolean | undefined {
    return this.#persistent
  }

  get resize_keyboard(): boolean | undefined {
    return this.#resize
  }

  get one_time_keyboard(): boolean | undefined {
    return this.#oneTime
  }

  get selective(): boolean | undefined {
    return this.#selective
  }

  get input_field_placeholder(): string | undefined {
    return this.#placeholder
  }

  /** Build from existing markup or rows of buttons. */
  static from(
    source: ReplyKeyboardMarkup | KeyboardButton[][] | Array<string | KeyboardButton>,
  ): Keyboard {
    const rows = Array.isArray(source)
      ? source.every((item) => Array.isArray(item))
        ? (source as KeyboardButton[][])
        : [(source as Array<string | KeyboardButton>).map(toKeyboardButton)]
      : source.keyboard

    const keyboard = new Keyboard()
    keyboard.rows.length = 0
    keyboard.rows.push(...rows.map((row) => [...row]))
    if (keyboard.rows.length === 0) keyboard.rows.push([])

    return keyboard
  }

  /** Remove whatever keyboard is showing. */
  static remove(selective?: boolean): ReplyKeyboardRemove {
    return { remove_keyboard: true, ...(selective === undefined ? {} : { selective }) }
  }

  /** Show the reply interface, as if the user tapped reply. */
  static forceReply(options: Omit<ForceReply, 'force_reply'> = {}): ForceReply {
    return { force_reply: true, ...options }
  }

  /** A button that sends its own text. */
  text(text: string): this {
    return this.push({ text })
  }

  /** A button that shares the user's phone number. Private chats only. */
  requestContact(text: string): this {
    return this.push({ text, request_contact: true })
  }

  /** A button that shares the user's location. Private chats only. */
  requestLocation(text: string): this {
    return this.push({ text, request_location: true })
  }

  /** A button that creates a poll. Private chats only. */
  requestPoll(text: string, type?: KeyboardButtonPollType['type']): this {
    return this.push({ text, request_poll: type === undefined ? {} : { type } })
  }

  /** A button that opens a Mini App. Private chats only. */
  webApp(text: string, url: string | WebAppInfo): this {
    return this.push({ text, web_app: typeof url === 'string' ? { url } : url })
  }

  /** A button that asks the user to choose users to share. */
  requestUsers(text: string, request: KeyboardButtonRequestUsers): this {
    return this.push({ text, request_users: request })
  }

  /** A button that asks the user to choose a chat to share. */
  requestChat(text: string, request: KeyboardButtonRequestChat): this {
    return this.push({ text, request_chat: request })
  }

  /** Add ready-made buttons, or plain labels, to the open row. */
  add(...buttons: Array<string | KeyboardButton>): this {
    for (const button of buttons) this.push(toKeyboardButton(button))
    return this
  }

  /** Fit the keyboard to its buttons rather than filling the screen. */
  resized(value = true): this {
    this.#resize = value
    return this
  }

  /** Hide the keyboard after one use. */
  oneTime(value = true): this {
    this.#oneTime = value
    return this
  }

  /** Keep the keyboard open until it is explicitly removed. */
  persistent(value = true): this {
    this.#persistent = value
    return this
  }

  /** Show the keyboard only to the users the message concerns. */
  selectively(value = true): this {
    this.#selective = value
    return this
  }

  /** Placeholder text for the input field while the keyboard is showing. */
  placeholder(text: string): this {
    this.#placeholder = text
    return this
  }

  /** Serialize as markup, omitting options that were never set. */
  toJSON(): ReplyKeyboardMarkup {
    return {
      keyboard: this.keyboard,
      ...(this.#persistent === undefined ? {} : { is_persistent: this.#persistent }),
      ...(this.#resize === undefined ? {} : { resize_keyboard: this.#resize }),
      ...(this.#oneTime === undefined ? {} : { one_time_keyboard: this.#oneTime }),
      ...(this.#selective === undefined ? {} : { selective: this.#selective }),
      ...(this.#placeholder === undefined ? {} : { input_field_placeholder: this.#placeholder }),
    }
  }
}

/** A label becomes a plain button; anything else is already one. */
function toKeyboardButton(button: string | KeyboardButton): KeyboardButton {
  return typeof button === 'string' ? { text: button } : button
}
