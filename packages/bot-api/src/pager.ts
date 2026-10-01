/**
 * Showing a list a screen at a time, with buttons to move between screens.
 *
 * Unlike reading a list, this is about a person: one message shows one page,
 * and pressing ‹ or › edits it to show another. The page travels in the
 * button's callback data, with the person the list was shown to, so the page a
 * press asks for is known without keeping anything, and a press by somebody
 * else in a group can be told apart and refused.
 *
 * ```ts
 * const catalogue = pager('catalogue', { pageSize: 5 })
 *
 * bot.command('catalogue', (message) => {
 *   const shown = catalogue.page(products, 0)
 *   return message.reply(render(shown.items), {
 *     reply_markup: catalogue.keyboard(shown, message.sender!.id),
 *   })
 * })
 *
 * bot.onCallbackQuery(catalogue.filter, async (query) => {
 *   const press = catalogue.read(query)
 *   if (press.kind === 'refused') return query.answer({ text: 'This list is someone else’s.' })
 *   const shown = catalogue.page(products, press.page)
 *   await query.editText(render(shown.items), { reply_markup: catalogue.keyboard(shown, press.owner) })
 * })
 * ```
 *
 * A list read from Telegram page by page can be shown the same way: fetch the
 * page the press names — `offset = page × pageSize` — and pass `pages` from the
 * total, rather than slicing an array.
 */

import { type CallbackData, defineCallbackData } from './callback-data.js'
import { ValidationError } from './core.js'
import { InlineKeyboard } from './keyboards.js'

/** One screen of a list, and where it sits. */
export interface Shown<T> {
  readonly items: readonly T[]
  /** Which page this is, from 0. */
  readonly page: number
  /** How many pages there are. At least 1, even for an empty list. */
  readonly pages: number
}

/** What a press on a pager's button asked for. */
export type Press =
  /** A page, asked for by the person the list was shown to. */
  | { readonly kind: 'page'; readonly page: number; readonly owner: number }
  /** A page, asked for by somebody else. */
  | { readonly kind: 'refused'; readonly page: number; readonly owner: number }

/** Options for {@link pager}. */
export interface PagerOptions {
  /** Items per page. */
  readonly pageSize: number
  /** Button labels. `‹` and `›` unless given. */
  readonly previous?: string
  readonly next?: string
  /** The label between them. `2 / 5` unless given; `undefined` leaves it out. */
  readonly position?: ((page: number, pages: number) => string) | undefined
}

/** A pager: the buttons, the reading of a press, and the slicing of a list. */
export interface Pager {
  /** The callback data its buttons carry. */
  readonly data: CallbackData<{ readonly page: number; readonly owner: number }>
  /** Matches presses on this pager's buttons, the position label included, and no others. */
  readonly filter: (context: { readonly data?: string | undefined }) => boolean
  /** One page of an array, clamped to the pages there are. */
  page<T>(items: readonly T[], page: number): Shown<T>
  /**
   * The row of buttons for a page: ‹ only where there is a page before, ›
   * only where there is one after, and the position between.
   */
  keyboard(shown: { readonly page: number; readonly pages: number }, owner: number): InlineKeyboard
  /**
   * Read a press. `undefined` for data that is not this pager's, and for a
   * press on the position label, which asks for nothing and is answered as it
   * is.
   */
  read(query: {
    readonly data?: string | undefined
    readonly sender?: { readonly id: number } | undefined
  }): Press | undefined
}

/**
 * A pager named `name`.
 *
 * The name separates one pager's buttons from another's, so two lists in one
 * bot need two names.
 */
export function pager(name: string, options: PagerOptions): Pager {
  if (!Number.isInteger(options.pageSize) || options.pageSize < 1) {
    throw new ValidationError(`a page holds at least one item, not ${options.pageSize}`)
  }

  const data = defineCallbackData(name).number('page').number('owner')
  const noop = `${name}:-`
  const previous = options.previous ?? '‹'
  const next = options.next ?? '›'
  const position =
    'position' in options
      ? options.position
      : (page: number, pages: number) => `${page + 1} / ${pages}`

  // The widest page and owner either will carry, packed once, so a name that
  // leaves no room for them is refused here rather than on some later page.
  data.pack({ page: 2 ** 31, owner: 2 ** 53 - 1 })

  const pagesIn = (count: number): number => Math.max(1, Math.ceil(count / options.pageSize))

  return {
    data,
    // The position label too, so its press reaches a handler that answers it
    // rather than leaving the button spinning.
    filter: (context) =>
      context.data !== undefined && (context.data === noop || data.matches(context.data)),

    page(items, page) {
      const pages = pagesIn(items.length)
      const clamped = Math.min(Math.max(0, Math.trunc(page)), pages - 1)
      const from = clamped * options.pageSize

      return { items: items.slice(from, from + options.pageSize), page: clamped, pages }
    },

    keyboard(shown, owner) {
      const keyboard = new InlineKeyboard()
      if (shown.page > 0) keyboard.add(data.button(previous, { page: shown.page - 1, owner }))
      if (position !== undefined) {
        keyboard.text(position(shown.page, shown.pages), noop)
      }
      if (shown.page < shown.pages - 1) {
        keyboard.add(data.button(next, { page: shown.page + 1, owner }))
      }
      return keyboard
    },

    read(query) {
      if (query.data === undefined || query.data === noop) return undefined
      const state = data.unpack(query.data)
      if (state === undefined) return undefined

      const kind = query.sender?.id === state.owner ? 'page' : 'refused'
      return { kind, page: Math.max(0, state.page), owner: state.owner }
    },
  }
}
