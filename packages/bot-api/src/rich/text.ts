/**
 * Rich text: the formatted runs inside a rich message's blocks.
 *
 * Every builder returns the Bot API's own `RichText` value — plain data, the
 * shape `sendRichMessage` takes — so a builder's result can be put anywhere the
 * schema asks for rich text, and anything the schema allows can be written by
 * hand beside it.
 *
 * ```ts
 * [bold('Status:'), ' ', link('all green', 'https://status.example'), ' ', math('p < 0.05')]
 * ```
 *
 * A string is plain text, never markup: `bold('**x**')` is bold asterisks.
 */

import { ValidationError } from '@yuigram/core'
import { type Formatted, layout } from '@yuigram/core/format'
import type {
  LoginUrl,
  RichMessageButton,
  RichText,
  SwitchInlineQueryChosenChat,
  User,
} from '../generated/types/index.js'

/** What a rich text builder accepts: text, rich text, or several of them. */
export type RichContent =
  | string
  | number
  | RichText
  | Formatted
  | readonly RichContent[]
  | null
  | undefined
  | false

/** Whether a value is a formatted value from `@yuigram/core/format`. */
function isFormatted(value: unknown): value is Formatted {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { toPayload?: unknown }).toPayload === 'function' &&
    typeof (value as { text?: unknown }).text === 'string'
  )
}

/**
 * Content as one rich text value.
 *
 * Arrays are flattened, empty parts dropped, strings next to each other joined,
 * and a single part is returned as itself rather than wrapped — so the same
 * content always has the same shape, however it was put together.
 */
export function richText(content: RichContent): RichText {
  const parts: RichText[] = []

  const add = (value: RichContent): void => {
    if (value === null || value === undefined || value === false) return
    if (typeof value === 'number') {
      add(String(value))
      return
    }
    if (typeof value === 'string') {
      if (value.length === 0) return
      const last = parts.length - 1
      if (typeof parts[last] === 'string') parts[last] = `${parts[last] as string}${value}`
      else parts.push(value)
      return
    }
    if (Array.isArray(value)) {
      for (const item of value as readonly RichContent[]) add(item)
      return
    }
    if (isFormatted(value)) {
      add(fromFormatted(value))
      return
    }
    parts.push(value as RichText)
  }

  add(content)

  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0] as RichText

  return parts
}

/** Whether a value is rich text with nothing in it. */
export function isEmptyRichText(value: RichText): boolean {
  return value === '' || (Array.isArray(value) && value.every(isEmptyRichText))
}

/* -------------------------------------------------------------------------- */
/* Styles                                                                      */
/* -------------------------------------------------------------------------- */

type Style =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikethrough'
  | 'spoiler'
  | 'code'
  | 'marked'
  | 'subscript'
  | 'superscript'

function styled(type: Style): (content: RichContent) => RichText {
  return (content) => ({ type, text: richText(content) }) as RichText
}

export const bold = styled('bold')
export const italic = styled('italic')
export const underline = styled('underline')
export const strikethrough = styled('strikethrough')
export const spoiler = styled('spoiler')
/** Inline fixed-width text. */
export const code = styled('code')
/** Highlighted text. */
export const marked = styled('marked')
export const subscript = styled('subscript')
export const superscript = styled('superscript')

/* -------------------------------------------------------------------------- */
/* Links and things that carry details                                         */
/* -------------------------------------------------------------------------- */

function required(value: unknown, what: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ValidationError(`${what} must be a non-empty string`)
  }

  return value
}

/** A link. */
export function link(content: RichContent, url: string): RichText {
  return { type: 'url', text: richText(content), url: required(url, 'a link') } as RichText
}

/** An e-mail address, shown as `content`. */
export function email(content: RichContent, address: string): RichText {
  return {
    type: 'email_address',
    text: richText(content),
    email_address: required(address, 'an address'),
  } as RichText
}

/** A phone number, shown as `content`. */
export function phone(content: RichContent, number: string): RichText {
  return {
    type: 'phone_number',
    text: richText(content),
    phone_number: required(number, 'a number'),
  } as RichText
}

/** A mention by username, shown as `content`. */
export function mention(content: RichContent, username: string): RichText {
  return {
    type: 'mention',
    text: richText(content),
    username: required(username, 'a username').replace(/^@/, ''),
  } as RichText
}

/** A mention of a person by who they are, which works without a username. */
export function textMention(content: RichContent, user: User | number): RichText {
  const person: User = typeof user === 'number' ? { id: user, is_bot: false, first_name: '' } : user

  return { type: 'text_mention', text: richText(content), user: person } as RichText
}

/** A line break inside running text. */
export function br(): RichText {
  return '\n'
}

/** Items one after another, with `separator` between each two. */
export function join(items: readonly RichContent[], separator: RichContent = ', '): RichText {
  return richText(items.flatMap((item, index) => (index === 0 ? [item] : [separator, item])))
}

/** A custom emoji; `alternative` is what shows where it cannot. */
export function customEmoji(id: string, alternative: string): RichText {
  if (!/^\d+$/.test(id)) throw new ValidationError('a custom emoji id is a string of digits')

  return {
    type: 'custom_emoji',
    custom_emoji_id: id,
    alternative_text: required(alternative, 'the alternative text'),
  } as RichText
}

/** A moment each reader sees in their own time zone; `format` as Telegram's date-time format. */
export function time(content: RichContent, unix: number | Date, format = ''): RichText {
  const seconds = unix instanceof Date ? Math.floor(unix.getTime() / 1000) : unix
  if (!Number.isSafeInteger(seconds))
    throw new ValidationError('a moment is a Date or whole seconds')
  if (!/^(?:r|w?[dD]?[tT]?)$/.test(format))
    throw new ValidationError(`'${format}' is not a date-time format`)

  return {
    type: 'date_time',
    text: richText(content),
    unix_time: seconds,
    date_time_format: format,
  } as RichText
}

/** An inline formula, as LaTeX. */
export function math(latex: string): RichText {
  return { type: 'mathematical_expression', expression: required(latex, 'a formula') } as RichText
}

/** A place in the message a link can point to. */
export function anchor(name: string): RichText {
  return { type: 'anchor', name: required(name, 'an anchor name') } as RichText
}

/** A link to an {@link anchor} in the same message. */
export function anchorLink(content: RichContent, name: string): RichText {
  return {
    type: 'anchor_link',
    text: richText(content),
    anchor_name: required(name, 'an anchor name'),
  } as RichText
}

/** Text a {@link referenceLink} points to — a footnote's body, say. */
export function reference(content: RichContent, name: string): RichText {
  return {
    type: 'reference',
    text: richText(content),
    name: required(name, 'a reference name'),
  } as RichText
}

/** A link to a {@link reference}. */
export function referenceLink(content: RichContent, name: string): RichText {
  return {
    type: 'reference_link',
    text: richText(content),
    reference_name: required(name, 'a reference name'),
  } as RichText
}

/** Text Telegram would recognise by itself, marked explicitly. */
export const detected = Object.freeze({
  hashtag: (content: RichContent, hashtag: string): RichText =>
    ({
      type: 'hashtag',
      text: richText(content),
      hashtag: required(hashtag, 'a hashtag'),
    }) as RichText,
  cashtag: (content: RichContent, cashtag: string): RichText =>
    ({
      type: 'cashtag',
      text: richText(content),
      cashtag: required(cashtag, 'a cashtag'),
    }) as RichText,
  botCommand: (content: RichContent, command: string): RichText =>
    ({
      type: 'bot_command',
      text: richText(content),
      bot_command: required(command, 'a command'),
    }) as RichText,
  bankCard: (content: RichContent, number: string): RichText =>
    ({
      type: 'bank_card_number',
      text: richText(content),
      bank_card_number: required(number, 'a card number'),
    }) as RichText,
})

/* -------------------------------------------------------------------------- */
/* Buttons                                                                     */
/* -------------------------------------------------------------------------- */

/** How a button looks. */
export type ButtonStyle = 'danger' | 'success' | 'primary' | 'link'

/** What a button does: exactly one of these. */
export type ButtonAction =
  | { readonly url: string }
  | { readonly callbackData: string }
  | { readonly webApp: string }
  | { readonly loginUrl: string | LoginUrl }
  | { readonly switchInlineQuery: string }
  | { readonly switchInlineQueryCurrentChat: string }
  | { readonly switchInlineQueryChosenChat: SwitchInlineQueryChosenChat }
  | { readonly copyText: string }
  | { readonly disabled: true }

const ACTIONS = [
  'url',
  'callbackData',
  'webApp',
  'loginUrl',
  'switchInlineQuery',
  'switchInlineQueryCurrentChat',
  'switchInlineQueryChosenChat',
  'copyText',
  'disabled',
] as const

/** A button as the schema writes it, from a label, an action and a style. */
export function buttonOf(
  label: RichContent,
  action: ButtonAction & { readonly style?: ButtonStyle },
): RichMessageButton {
  const given = ACTIONS.filter((name) => (action as Record<string, unknown>)[name] !== undefined)
  if (given.length !== 1) {
    throw new ValidationError(
      `a button does exactly one thing; it was given ${given.length === 0 ? 'none' : given.join(', ')}`,
    )
  }

  const values = action as Record<string, unknown>
  const common = {
    text: richText(label),
    ...(action.style === undefined ? {} : { style: action.style }),
  }

  switch (given[0]) {
    case 'url':
      return { ...common, url: required(values['url'], 'a URL') }
    case 'callbackData': {
      const data = required(values['callbackData'], 'callback data')
      if (new TextEncoder().encode(data).length > 64) {
        throw new ValidationError('callback data is at most 64 bytes')
      }

      return { ...common, callback_data: data }
    }
    case 'webApp':
      return { ...common, web_app: { url: required(values['webApp'], 'a Mini App URL') } }
    case 'loginUrl': {
      const login = values['loginUrl']

      return {
        ...common,
        login_url: typeof login === 'string' ? { url: login } : (login as LoginUrl),
      }
    }
    case 'switchInlineQuery':
      return { ...common, switch_inline_query: values['switchInlineQuery'] as string }
    case 'switchInlineQueryCurrentChat':
      return {
        ...common,
        switch_inline_query_current_chat: values['switchInlineQueryCurrentChat'] as string,
      }
    case 'switchInlineQueryChosenChat':
      return {
        ...common,
        switch_inline_query_chosen_chat: values[
          'switchInlineQueryChosenChat'
        ] as SwitchInlineQueryChosenChat,
      }
    case 'copyText':
      return { ...common, copy_text: { text: required(values['copyText'], 'text to copy') } }
    default:
      return { ...common, disabled: {} }
  }
}

/** A button inside running text. */
export function button(
  label: RichContent,
  action: ButtonAction & { readonly style?: ButtonStyle },
): RichText {
  return { type: 'button', button: buttonOf(label, action) } as RichText
}

/* -------------------------------------------------------------------------- */
/* From formatted text                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Formatted text as rich text.
 *
 * So text built with `yuigram/markup` — or read out of a message — can go into
 * a rich message as it is. A code block or a quotation is a block in a rich
 * message rather than a run of text, so inside rich text it is kept as code
 * and as plain text respectively.
 */
export function fromFormatted(value: Formatted): RichText {
  type Frame = { entity: { type: string } | undefined; parts: RichText[] }
  const stack: Frame[] = [{ entity: undefined, parts: [] }]

  const wrap = (entity: Record<string, unknown>, inner: RichText): RichText | undefined => {
    switch (entity['type']) {
      case 'bold':
      case 'italic':
      case 'underline':
      case 'strikethrough':
      case 'spoiler':
      case 'code':
        return { type: entity['type'], text: inner } as RichText
      case 'pre':
        return { type: 'code', text: inner } as RichText
      case 'text_link':
        return { type: 'url', text: inner, url: entity['url'] } as RichText
      case 'text_mention':
        return { type: 'text_mention', text: inner, user: entity['user'] } as RichText
      case 'custom_emoji':
        return {
          type: 'custom_emoji',
          custom_emoji_id: entity['custom_emoji_id'],
          alternative_text: typeof inner === 'string' ? inner : '',
        } as RichText
      case 'date_time':
        return {
          type: 'date_time',
          text: inner,
          unix_time: entity['unix_time'],
          date_time_format: entity['date_time_format'] ?? '',
        } as RichText
      default:
        return undefined
    }
  }

  for (const token of layout(value)) {
    if (token.kind === 'text') {
      ;(stack[stack.length - 1] as Frame).parts.push(token.text)
    } else if (token.kind === 'open') {
      stack.push({ entity: token.entity, parts: [] })
    } else {
      const frame = stack.pop() as Frame
      const inner = frame.parts.length === 1 ? (frame.parts[0] as RichText) : frame.parts
      const wrapped = wrap(token.entity as unknown as Record<string, unknown>, inner)
      const parent = stack[stack.length - 1] as Frame
      if (wrapped === undefined) parent.parts.push(...frame.parts)
      else parent.parts.push(wrapped)
    }
  }

  const root = (stack[0] as Frame).parts

  return root.length === 1 ? (root[0] as RichText) : root
}
