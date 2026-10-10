// SPDX-License-Identifier: MIT

/**
 * Rich HTML, read into blocks.
 *
 * Telegram reads a rich message's `html` itself, and sending the markup is the
 * most faithful way to send it. Reading it here is for everything else:
 * refusing a mistake before it is sent, turning one dialect into the other,
 * putting written markup together with built blocks, and counting what a
 * message holds against Telegram's limits. What is read is the grammar the
 * rich formatting documentation states; where it is silent, the choice made
 * here is written down beside the code that makes it.
 *
 * ```
 *   <h1>Report</h1><p>Up <b>12%</b></p>   ──>   heading(1, "Report")
 *                                               paragraph(["Up ", bold("12%")])
 * ```
 *
 * Strict by default: a tag, an attribute value or a character reference the
 * grammar does not have is refused with where it was. Lenient reading keeps
 * what it cannot read as the text it was written as.
 */

import type {
  InputMediaAnimation,
  InputMediaAudio,
  InputMediaDocument,
  InputMediaPhoto,
  InputMediaVideo,
  InputMediaVoiceNote,
  InputRichBlock,
  InputRichBlockListItem,
  InputRichMessageMedia,
  RichMessageButton,
  RichText,
} from '../generated/types/index.js'
import {
  anchorBlock,
  animation,
  audio,
  blockquote,
  buttons,
  codeBlock,
  collage,
  details,
  divider,
  document,
  expandableBlockquote,
  footer,
  heading,
  type MediaOptions,
  map,
  mathBlock,
  mediaKindOf,
  paragraph,
  photo,
  pullQuote,
  slideshow,
  type TableCell,
  table,
  thinking,
  video,
  voiceNote,
} from './blocks.js'
import { RichParseError } from './errors.js'
import { measureRich, overLimit, RICH_LIMITS } from './limits.js'
import {
  anchor,
  anchorLink,
  type ButtonAction,
  type ButtonStyle,
  bold,
  buttonOf,
  code,
  customEmoji,
  email,
  isEmptyRichText,
  italic,
  link,
  marked,
  math,
  phone,
  type RichContent,
  reference,
  referenceLink,
  richText,
  spoiler,
  strikethrough,
  subscript,
  superscript,
  textMention,
  time,
  underline,
} from './text.js'

/** How rich markup is read. */
export interface RichParseOptions {
  /** Keep what cannot be read as the text it was written as, rather than refusing it. */
  readonly lenient?: boolean
  /** The media a message's `tg://photo?id=…` links name, as its `media` field carries them. */
  readonly media?: readonly InputRichMessageMedia[]
}

/* -------------------------------------------------------------------------- */
/* Reading the markup into a tree                                              */
/* -------------------------------------------------------------------------- */

/** An element of rich HTML, read. For the readers in this package. */
export interface Element {
  readonly kind: 'element'
  readonly name: string
  readonly attributes: ReadonlyMap<string, string>
  readonly children: Node[]
  readonly at: number
}

/** Text of rich HTML, with its references resolved. */
export interface Text {
  readonly kind: 'text'
  readonly text: string
  readonly at: number
}

export type Node = Element | Text

/** Tags that mark a run of text. */
export const INLINE: ReadonlySet<string> = new Set([
  'b',
  'strong',
  'i',
  'em',
  'u',
  'ins',
  's',
  'strike',
  'del',
  'code',
  'mark',
  'sub',
  'sup',
  'tg-spoiler',
  'a',
  'tg-reference',
  'tg-emoji',
  'tg-time',
  'tg-math',
  'tg-button',
  'br',
])

/** Tags that make a block, or are part of one. */
export const BLOCK: ReadonlySet<string> = new Set([
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'pre',
  'footer',
  'hr',
  'ul',
  'ol',
  'li',
  'input',
  'blockquote',
  'aside',
  'cite',
  'img',
  'video',
  'audio',
  'tg-document',
  'figure',
  'figcaption',
  'tg-map',
  'tg-collage',
  'tg-slideshow',
  'table',
  'caption',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'details',
  'summary',
  'tg-math-block',
  'tg-button-row',
  'tg-thinking',
])

/** Tags whose text is kept exactly as written. */
const VERBATIM = new Set(['pre', 'tg-math', 'tg-math-block'])

/** Tags that never have content, closed by the tag itself. */
const VOID = new Set(['br', 'hr', 'img', 'input', 'tg-map'])

/** The named references the API accepts, and nothing else. */
const NAMED: Readonly<Record<string, string>> = {
  lt: '<',
  gt: '>',
  amp: '&',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
}

/** A tag as read: its name, whether it closes or closes itself, and its attributes. */
export interface Tag {
  readonly name: string
  readonly closing: boolean
  readonly selfClosing: boolean
  readonly attributes: Map<string, string>
  readonly end: number
}

/** One pass over the source, building the tree. */
class TreeReader {
  readonly #root: Element
  readonly #stack: Element[]

  constructor(
    readonly source: string,
    readonly lenient: boolean,
  ) {
    this.#root = { kind: 'element', name: '#root', attributes: new Map(), children: [], at: 0 }
    this.#stack = [this.#root]
  }

  fail(message: string, at: number): never {
    throw new RichParseError(message, at, this.source)
  }

  /**
   * Decode character references, refusing what the API does not accept.
   *
   * Outside an attribute a bare `>` is refused too, as the API asks of every
   * `<`, `>` and `&` that is not markup.
   */
  decode(raw: string, at: number, inAttribute = false): string {
    let out = ''
    let index = 0

    if (!this.lenient && !inAttribute && raw.includes('>')) {
      this.fail("a '>' in text must be written &gt;", at + raw.indexOf('>'))
    }

    while (index < raw.length) {
      const amp = raw.indexOf('&', index)
      if (amp === -1) {
        out += raw.slice(index)
        break
      }
      out += raw.slice(index, amp)

      const match = /^&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z]+);/i.exec(raw.slice(amp))
      const decoded = match === null ? undefined : this.#reference(match[1] as string)
      if (decoded === undefined) {
        if (!this.lenient)
          this.fail("an '&' must start a character reference the API knows", at + amp)
        out += '&'
        index = amp + 1
        continue
      }
      out += decoded
      index = amp + (match?.[0].length ?? 1)
    }

    return out
  }

  #reference(body: string): string | undefined {
    if (body.startsWith('#')) {
      const hex = body[1] === 'x' || body[1] === 'X'
      const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10)

      return Number.isNaN(code) || code > 0x10ffff ? undefined : String.fromCodePoint(code)
    }

    return NAMED[body.toLowerCase()]
  }

  /**
   * Text between tags. Runs of whitespace read as one space, as the
   * documentation's examples show — lines written one under another read as
   * one line — except in a code block or a formula, which keep what they say.
   */
  #text(raw: string, at: number): void {
    if (raw.length === 0) return

    const decoded = this.decode(raw, at)
    const verbatim = this.#stack.some((element) => VERBATIM.has(element.name))
    ;(this.#stack.at(-1) as Element).children.push({
      kind: 'text',
      text: verbatim ? decoded : decoded.replace(/[ \t\r\n]+/g, ' '),
      at,
    })
  }

  /** Read the tag starting at `at`, or `undefined` for a `<` that starts none. */
  tagAt(at: number): Tag | undefined {
    const match =
      /^<(\/?)([a-z][a-z0-9-]*)((?:\s+[a-z][a-z0-9-]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'<>=/]+))?)*)\s*(\/?)>/i.exec(
        this.source.slice(at),
      )
    if (match === null) return undefined

    const attributes = new Map<string, string>()
    for (const one of (match[3] as string).matchAll(
      /([a-z][a-z0-9-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>=/]+)))?/gi,
    )) {
      attributes.set(
        (one[1] as string).toLowerCase(),
        this.decode(one[2] ?? one[3] ?? one[4] ?? '', at, true),
      )
    }

    return {
      name: (match[2] as string).toLowerCase(),
      closing: match[1] === '/',
      selfClosing: match[4] === '/',
      attributes,
      end: at + (match[0] as string).length,
    }
  }

  #open(tag: Tag, at: number): void {
    const element: Element = {
      kind: 'element',
      name: tag.name,
      attributes: tag.attributes,
      children: [],
      at,
    }
    ;(this.#stack.at(-1) as Element).children.push(element)
    if (tag.selfClosing || VOID.has(tag.name)) return

    this.#stack.push(element)
    if (!this.lenient && this.#stack.length - 1 > RICH_LIMITS.depth) {
      this.fail(`markup nests at most ${RICH_LIMITS.depth} levels deep`, at)
    }
  }

  /** Close a tag. False when nothing open matches it. */
  #close(tag: Tag, at: number): boolean {
    if (VOID.has(tag.name)) return true

    const depth = this.#stack.findLastIndex((element) => element.name === tag.name)
    if (depth < 1) return false
    if (depth !== this.#stack.length - 1 && !this.lenient) {
      this.fail(`</${tag.name}> closes <${(this.#stack.at(-1) as Element).name}> out of order`, at)
    }
    this.#stack.length = depth

    return true
  }

  /** Take a tag this grammar has. False for one it does not, or a close that matches nothing. */
  #take(tag: Tag, at: number): boolean {
    if (!INLINE.has(tag.name) && !BLOCK.has(tag.name)) return false
    if (tag.closing) return this.#close(tag, at)

    this.#open(tag, at)

    return true
  }

  read(): Node[] {
    const source = this.source
    let at = 0

    while (at < source.length) {
      const lt = source.indexOf('<', at)
      if (lt === -1) {
        this.#text(source.slice(at), at)
        break
      }
      this.#text(source.slice(at, lt), at)

      const tag = this.tagAt(lt)
      if (tag !== undefined && this.#take(tag, lt)) {
        at = tag.end
        continue
      }

      if (!this.lenient) {
        this.fail(
          tag === undefined
            ? "a '<' in text must be written &lt;"
            : tag.closing
              ? `</${tag.name}> closes nothing that is open`
              : `<${tag.name}> is not a tag rich messages have`,
          lt,
        )
      }
      // Kept as written: the tag, or the lone '<'.
      const end = tag === undefined ? lt + 1 : tag.end
      ;(this.#stack.at(-1) as Element).children.push({
        kind: 'text',
        text: source.slice(lt, end),
        at: lt,
      })
      at = end
    }

    if (!this.lenient && this.#stack.length > 1) {
      const open = this.#stack.at(-1) as Element
      this.fail(`<${open.name}> is never closed`, open.at)
    }

    return this.#root.children
  }
}

/* -------------------------------------------------------------------------- */
/* Reading the tree into blocks                                                */
/* -------------------------------------------------------------------------- */

const isElement = (node: Node, ...names: string[]): node is Element =>
  node.kind === 'element' && (names.length === 0 || names.includes(node.name))

const isBlank = (node: Node): boolean => node.kind === 'text' && node.text.trim() === ''

/** The tag each kind of media is written in. */
const TAG_OF_KIND: Readonly<Record<string, string>> = {
  photo: 'img',
  video: 'video',
  animation: 'video',
  audio: 'audio',
  voice_note: 'audio',
  document: 'tg-document',
}

/**
 * A custom emoji as markup writes it.
 *
 * Markup may leave the alternative text out — the documentation's own examples
 * do — and Telegram fills it in when it reads the markup. Read here, nothing
 * knows which emoji it is, so the alternative is kept as written, empty or not,
 * rather than refused or made up.
 */
function emoji(id: string, alternative: string): RichText {
  return alternative === ''
    ? ({ type: 'custom_emoji', custom_emoji_id: id, alternative_text: '' } as RichText)
    : customEmoji(id, alternative)
}

/** Media blocks, and what each one's tag is. */
const MEDIA = new Set(['img', 'video', 'audio', 'tg-document'])

/** Whether an element makes a block of its own where it stands. */
function isBlockElement(node: Node): boolean {
  if (node.kind !== 'element') return false
  if (node.name === 'img') return !isEmojiImage(node)

  return BLOCK.has(node.name)
}

/** `<img src="tg://emoji?id=…">` is a custom emoji in the text, not a picture. */
function isEmojiImage(element: Element): boolean {
  return (element.attributes.get('src') ?? '').startsWith('tg://emoji?')
}

/** An `<a name="…"></a>` standing alone, which is an anchor block. */
function isLoneAnchor(run: readonly Node[]): string | undefined {
  const content = run.filter((node) => !isBlank(node))
  const [only] = content
  if (content.length !== 1 || only === undefined || !isElement(only, 'a')) return undefined
  if (only.attributes.has('href') || only.children.some((node) => !isBlank(node))) return undefined

  return only.attributes.get('name')
}

/** The text of a run with nothing else of it: for code, formulas and alt text. */
function plainOf(nodes: readonly Node[]): string {
  return nodes.map((node) => (node.kind === 'text' ? node.text : plainOf(node.children))).join('')
}

/** A run of text with the whitespace around it taken off. */
function trimmed(nodes: readonly Node[]): Node[] {
  const out = [...nodes]
  while (out.length > 0 && isBlank(out[0] as Node)) out.shift()
  while (out.length > 0 && isBlank(out.at(-1) as Node)) out.pop()

  const first = out[0]
  if (first?.kind === 'text') out[0] = { ...first, text: first.text.trimStart() }
  const last = out.at(-1)
  if (last?.kind === 'text') out[out.length - 1] = { ...last, text: last.text.trimEnd() }

  return out
}

type Styled = (content: RichContent) => RichText

const STYLES: Readonly<Record<string, Styled>> = {
  b: bold,
  strong: bold,
  i: italic,
  em: italic,
  u: underline,
  ins: underline,
  s: strikethrough,
  strike: strikethrough,
  del: strikethrough,
  code,
  mark: marked,
  sub: subscript,
  sup: superscript,
  'tg-spoiler': spoiler,
}

/**
 * Reads a tree into blocks, knowing the whole document's references and media.
 *
 * Exported for the Markdown reader, which reads the tags Markdown may contain
 * through this and the text between them as Markdown.
 */
export class RichHtmlReader {
  readonly #references = new Set<string>()
  readonly #files: ReadonlyMap<string, InputRichMessageMedia>

  constructor(
    readonly source: string,
    readonly options: RichParseOptions,
    nodes: readonly Node[],
    references: Iterable<string> = [],
  ) {
    this.#files = new Map((options.media ?? []).map((entry) => [entry.id, entry]))
    for (const name of references) this.#references.add(name)
    this.#collect(nodes)
  }

  get lenient(): boolean {
    return this.options.lenient === true
  }

  fail(message: string, at: number): never {
    throw new RichParseError(message, at, this.source)
  }

  /** Find every reference first, so a link before it knows it is one. */
  #collect(nodes: readonly Node[]): void {
    for (const node of nodes) {
      if (node.kind !== 'element') continue
      const name = node.attributes.get('name')
      if (node.name === 'tg-reference' && name !== undefined) this.#references.add(name)
      this.#collect(node.children)
    }
  }

  /** Nodes as blocks: block elements as themselves, each run of text between as a paragraph. */
  blocks(nodes: readonly Node[]): InputRichBlock[] {
    const out: InputRichBlock[] = []
    let run: Node[] = []

    const flush = (): void => {
      const lone = isLoneAnchor(run)
      if (lone !== undefined) {
        out.push(anchorBlock(lone))
      } else {
        const text = this.inline(trimmed(run))
        if (!isEmptyRichText(text)) out.push(paragraph(text))
      }
      run = []
    }

    for (const node of nodes) {
      if (node.kind === 'text' || !isBlockElement(node)) {
        run.push(node)
        continue
      }
      flush()
      out.push(...this.block(node))
    }
    flush()

    return out
  }

  /** Nodes as rich text. A block inside running text is refused, or read as its text. */
  inline(nodes: readonly Node[]): RichText {
    return richText(nodes.map((node) => this.#inlineNode(node)))
  }

  #inlineNode(node: Node): RichContent {
    return node.kind === 'text' ? this.text(node) : this.inlineElement(node)
  }

  /** A run of text, as it stands. The Markdown reader reads it as Markdown instead. */
  text(node: Text): RichContent {
    return node.text
  }

  /** An element inside running text. */
  inlineElement(node: Element): RichContent {
    if (isBlockElement(node)) {
      if (!this.lenient) this.fail(`<${node.name}> is a block and cannot be inside text`, node.at)

      return plainOf(node.children)
    }

    const style = STYLES[node.name]
    if (style !== undefined) return style(this.inline(node.children))

    return this.#special(node)
  }

  #special(element: Element): RichContent {
    const inner = (): RichText => this.inline(element.children)
    const attribute = (name: string): string => this.#required(element, name)

    switch (element.name) {
      case 'br':
        return '\n'
      case 'a':
        return this.#anchorOrLink(element)
      case 'tg-reference':
        return reference(inner(), attribute('name'))
      case 'tg-emoji':
        return emoji(
          this.#number(element, 'emoji-id', attribute('emoji-id')),
          plainOf(element.children),
        )
      case 'img':
        return this.#emojiImage(element)
      case 'tg-time':
        return time(
          inner(),
          Number(this.#number(element, 'unix', attribute('unix'))),
          element.attributes.get('format') ?? '',
        )
      case 'tg-math':
        return math(plainOf(element.children))
      case 'tg-button':
        return { type: 'button', button: this.#button(element) } as RichText
      default:
        return inner()
    }
  }

  #anchorOrLink(element: Element): RichContent {
    const content = this.inline(element.children)
    const href = element.attributes.get('href')
    if (href === undefined) {
      const name = this.#required(element, 'name')

      return isEmptyRichText(content) ? anchor(name) : [anchor(name), content]
    }

    return this.link(content, href)
  }

  /**
   * Content linked to an address, as the address says: a place in the message,
   * a reference, an e-mail, a phone number, a person, or a page.
   */
  link(content: RichContent, href: string): RichContent {
    if (href.startsWith('#')) {
      const name = href.slice(1)

      return this.#references.has(name) ? referenceLink(content, name) : anchorLink(content, name)
    }
    if (href.startsWith('mailto:')) return email(content, href.slice('mailto:'.length))
    if (href.startsWith('tel:')) return phone(content, href.slice('tel:'.length))

    const mention = /^tg:\/\/user\?id=(\d+)$/.exec(href)
    if (mention !== null) return textMention(content, Number(mention[1]))

    return link(content, href)
  }

  #emojiImage(element: Element): RichContent {
    const id = /^tg:\/\/emoji\?id=(\d+)$/.exec(element.attributes.get('src') ?? '')
    if (id === null) {
      if (!this.lenient) this.fail('a custom emoji image names its emoji by number', element.at)

      return element.attributes.get('alt') ?? ''
    }

    return emoji(id[1] as string, element.attributes.get('alt') ?? '')
  }

  #required(element: Element, name: string): string {
    const value = element.attributes.get(name)
    if (value === undefined) this.fail(`<${element.name}> needs a ${name}`, element.at)

    return value
  }

  #number(element: Element, name: string, value: string): string {
    if (!/^-?\d+(\.\d+)?$/.test(value)) {
      this.fail(`<${element.name}>'s ${name} is a number, not '${value}'`, element.at)
    }

    return value
  }

  #button(element: Element): RichMessageButton {
    const attributes = element.attributes
    const get = (name: string): string => this.#required(element, name)
    const has = (name: string): boolean => attributes.has(name)
    const type = get('type')

    const actions: Readonly<Record<string, () => ButtonAction>> = {
      url: () => ({ url: get('url') }),
      callback_data: () => ({ callbackData: get('data') }),
      web_app: () => ({ webApp: get('url') }),
      login_url: () => ({
        loginUrl: {
          url: get('url'),
          ...(has('forward-text') ? { forward_text: get('forward-text') } : {}),
          ...(has('request-write-access') ? { request_write_access: true } : {}),
        },
      }),
      switch_inline_query: () => ({ switchInlineQuery: attributes.get('query') ?? '' }),
      switch_inline_query_current_chat: () => ({
        switchInlineQueryCurrentChat: attributes.get('query') ?? '',
      }),
      switch_inline_query_chosen_chat: () => ({
        switchInlineQueryChosenChat: {
          query: attributes.get('query') ?? '',
          ...(has('allow-user-chats') ? { allow_user_chats: true } : {}),
          ...(has('allow-bot-chats') ? { allow_bot_chats: true } : {}),
          ...(has('allow-group-chats') ? { allow_group_chats: true } : {}),
          ...(has('allow-channel-chats') ? { allow_channel_chats: true } : {}),
        },
      }),
      copy_text: () => ({ copyText: get('text') }),
      disabled: () => ({ disabled: true }),
    }

    const action = actions[type]
    if (action === undefined) this.fail(`a button's type cannot be '${type}'`, element.at)
    const style = attributes.get('style') as ButtonStyle | undefined

    return buttonOf(this.inline(element.children), {
      ...action(),
      ...(style === undefined ? {} : { style }),
    } as ButtonAction & { readonly style?: ButtonStyle })
  }

  /* ---------------------------------------------------------------------- */

  /** One block element as the blocks it makes. */
  block(element: Element): InputRichBlock[] {
    const level = /^h([1-6])$/.exec(element.name)
    if (level !== null) {
      return [heading(Number(level[1]) as 1, this.inline(trimmed(element.children)))]
    }

    const read = this.#blockReaders[element.name]
    if (read === undefined) {
      if (!this.lenient) this.fail(`<${element.name}> cannot stand where it is`, element.at)

      return this.blocks(element.children)
    }

    return read(element)
  }

  readonly #blockReaders: Readonly<Record<string, (element: Element) => InputRichBlock[]>> = {
    p: (element) => this.#paragraph(element),
    pre: (element) => [this.#pre(element)],
    footer: (element) => [footer(this.inline(trimmed(element.children)))],
    hr: () => [divider()],
    ul: (element) => [this.#list(element)],
    ol: (element) => [this.#list(element)],
    blockquote: (element) => [this.#quote(element)],
    aside: (element) => {
      const { body, credit } = this.#credited(element.children, 'cite')

      return [pullQuote(this.inline(trimmed(body)), credit)]
    },
    img: (element) => [this.#media(element, {})],
    video: (element) => [this.#media(element, {})],
    audio: (element) => [this.#media(element, {})],
    'tg-document': (element) => [this.#media(element, {})],
    'tg-map': (element) => [this.#map(element, {})],
    figure: (element) => [this.#figure(element)],
    'tg-collage': (element) => [this.#gallery(element)],
    'tg-slideshow': (element) => [this.#gallery(element)],
    table: (element) => [this.#table(element)],
    details: (element) => [this.#details(element)],
    'tg-math-block': (element) => [mathBlock(plainOf(element.children).trim())],
    'tg-button-row': (element) => [this.#buttonRow(element)],
    'tg-thinking': (element) => [thinking(this.inline(trimmed(element.children)))],
  }

  #paragraph(element: Element): InputRichBlock[] {
    // A paragraph holding blocks is not one the grammar has; read leniently, it
    // becomes those blocks.
    if (element.children.some(isBlockElement)) {
      if (!this.lenient) this.fail('<p> holds text, not blocks', element.at)

      return this.blocks(element.children)
    }

    const text = this.inline(trimmed(element.children))

    return isEmptyRichText(text) ? [] : [paragraph(text)]
  }

  #pre(element: Element): InputRichBlock {
    const content = element.children.filter((node) => !isBlank(node))
    const [only] = content
    if (content.length === 1 && only !== undefined && isElement(only, 'code')) {
      const language = /^language-(.+)$/.exec(only.attributes.get('class') ?? '')?.[1]

      return codeBlock(plainOf(only.children), language)
    }

    return codeBlock(plainOf(element.children))
  }

  /** A quotation's content, and the credit in its `<cite>`. */
  #credited(
    nodes: readonly Node[],
    tag: string,
  ): { readonly body: Node[]; readonly credit: RichText | undefined } {
    const cite = nodes.find((node): node is Element => isElement(node, tag))

    return {
      body: nodes.filter((node) => node !== cite),
      credit: cite === undefined ? undefined : this.inline(trimmed(cite.children)),
    }
  }

  #quote(element: Element): InputRichBlock {
    const { body, credit } = this.#credited(element.children, 'cite')
    if (element.attributes.has('expandable')) {
      return expandableBlockquote(this.inline(trimmed(body)), credit)
    }

    return blockquote(this.blocks(body), credit)
  }

  #list(element: Element): InputRichBlock {
    const ordered = element.name === 'ol'
    const items = element.children.filter((node): node is Element => isElement(node, 'li'))
    const stray = element.children.find((node) => !isBlank(node) && !isElement(node, 'li'))
    if (stray !== undefined && !this.lenient) {
      this.fail(`a list holds <li> items only`, stray.at)
    }

    const label = element.attributes.get('type')
    const reversed = element.attributes.has('reversed')
    let value = Number(element.attributes.get('start') ?? (reversed ? items.length : 1))

    return {
      type: 'list',
      items: items.map((item): InputRichBlockListItem => {
        const box = item.children.find((node): node is Element => isElement(node, 'input'))
        const own = item.attributes.get('value')
        if (own !== undefined) value = Number(this.#number(item, 'value', own))
        const entry = {
          blocks: this.blocks(item.children.filter((node) => node !== box)),
          ...(box === undefined ? {} : { has_checkbox: true as const }),
          ...(box?.attributes.has('checked') === true ? { is_checked: true as const } : {}),
          ...(ordered ? { value, type: item.attributes.get('type') ?? label ?? '1' } : {}),
        }
        value += reversed ? -1 : 1

        return entry
      }),
    } as InputRichBlock
  }

  /** The file a media tag names: an address, or one of the message's own media by id. */
  #media(element: Element, options: MediaOptions): InputRichBlock {
    const spoiler = element.attributes.has('tg-spoiler') ? { spoiler: true } : {}

    return this.mediaBlock(
      this.#required(element, 'src'),
      element.name,
      { ...options, ...spoiler },
      element.at,
    )
  }

  /**
   * A media block for a source: one of the message's own media, named by id,
   * or an http or https address — a kind by its tag where there is one, and by
   * what the address ends in where there is not.
   */
  mediaBlock(
    src: string,
    tag: string | undefined,
    options: MediaOptions,
    at: number,
  ): InputRichBlock {
    const given = /^tg:\/\/(photo|video|audio|document)\?id=([A-Za-z0-9_-]{1,64})$/.exec(src)

    if (given !== null) {
      const entry = this.#files.get(given[2] as string)
      if (entry === undefined) this.fail(`no media has the id '${given[2]}'`, at)

      return this.#byKind(entry.media as { readonly type: string }, options)
    }

    if (!/^https?:\/\//i.test(src)) {
      this.fail('a media block is an http or https address, or one of the message’s media', at)
    }

    return this.#byTag(tag ?? (TAG_OF_KIND[mediaKindOf(src)] as string), src, options)
  }

  #byKind(media: { readonly type: string }, options: MediaOptions): InputRichBlock {
    switch (media.type) {
      case 'photo':
        return photo(media as InputMediaPhoto, options)
      case 'video':
        return video(media as InputMediaVideo, options)
      case 'animation':
        return animation(media as InputMediaAnimation, options)
      case 'audio':
        return audio(media as InputMediaAudio, options)
      case 'voice_note':
        return voiceNote(media as InputMediaVoiceNote, options)
      default:
        return document(media as InputMediaDocument, options)
    }
  }

  /**
   * A block for an address, by its tag and — where one tag covers two kinds —
   * by what the address ends in. The documentation's examples are the rule: a
   * `.gif` in `<video>` is an animation and an `.ogg` in `<audio>` a voice note.
   */
  #byTag(tag: string, src: string, options: MediaOptions): InputRichBlock {
    const extension = /\.([a-z0-9]+)(?:[?#]|$)/i.exec(src)?.[1]?.toLowerCase()
    // Audio and documents have no spoiler.
    const plain: MediaOptions = {
      ...(options.caption === undefined ? {} : { caption: options.caption }),
      ...(options.credit === undefined ? {} : { credit: options.credit }),
    }

    switch (tag) {
      case 'img':
        return photo(src, options)
      case 'video':
        return extension === 'gif' ? animation(src, options) : video(src, options)
      case 'audio':
        return extension === 'ogg' || extension === 'oga' || extension === 'opus'
          ? voiceNote(src, plain)
          : audio(src, plain)
      default:
        return document(src, plain)
    }
  }

  #map(element: Element, options: MediaOptions): InputRichBlock {
    const number = (name: string): number =>
      Number(this.#number(element, name, this.#required(element, name)))
    const optional = (name: string): { [key: string]: number } =>
      element.attributes.has(name) ? { [name]: number(name) } : {}

    return map(number('lat'), number('long'), {
      ...optional('zoom'),
      ...optional('width'),
      ...optional('height'),
      ...(options.caption === undefined ? {} : { caption: options.caption }),
      ...(options.credit === undefined ? {} : { credit: options.credit }),
    })
  }

  /** A caption from `<figcaption>`, with its `<cite>` as the credit. */
  #caption(nodes: readonly Node[]): MediaOptions {
    const caption = nodes.find((node): node is Element => isElement(node, 'figcaption'))
    if (caption === undefined) return {}

    const { body, credit } = this.#credited(caption.children, 'cite')

    return {
      caption: this.inline(trimmed(body)),
      ...(credit === undefined ? {} : { credit }),
    }
  }

  #figure(element: Element): InputRichBlock {
    const content = element.children.filter(
      (node) => !isBlank(node) && !isElement(node, 'figcaption'),
    )
    const [only] = content
    if (content.length !== 1 || only === undefined || only.kind !== 'element') {
      this.fail('a <figure> holds one media element and its caption', element.at)
    }
    const caption = this.#caption(element.children)
    if (only.name === 'tg-map') return this.#map(only, caption)
    if (!MEDIA.has(only.name)) this.fail(`<${only.name}> cannot be in a <figure>`, only.at)

    return this.#media(only, caption)
  }

  #gallery(element: Element): InputRichBlock {
    const items = element.children
      .filter((node): node is Element => isElement(node) && MEDIA.has(node.name))
      .map((node) => this.#media(node, {}))
    const caption = this.#caption(element.children)

    return element.name === 'tg-collage' ? collage(items, caption) : slideshow(items, caption)
  }

  #table(element: Element): InputRichBlock {
    const rows = element.children.flatMap((node) =>
      isElement(node, 'thead', 'tbody')
        ? node.children.filter((child): child is Element => isElement(child, 'tr'))
        : isElement(node, 'tr')
          ? [node]
          : [],
    )
    const caption = element.children.find((node): node is Element => isElement(node, 'caption'))
    const attributes = element.attributes

    return table(
      rows.map((row) =>
        row.children
          .filter((node): node is Element => isElement(node, 'th', 'td'))
          .map((cell): TableCell => this.#cell(cell)),
      ),
      {
        header: false,
        ...(attributes.has('bordered') ? { bordered: true } : {}),
        ...(attributes.has('striped') ? { striped: true } : {}),
        ...(attributes.has('compact') ? { compact: true } : {}),
        ...(caption === undefined ? {} : { caption: this.inline(trimmed(caption.children)) }),
      },
    )
  }

  #cell(cell: Element): TableCell {
    const attributes = cell.attributes
    const span = (name: string): { [key: string]: number } =>
      attributes.has(name)
        ? { [name]: Number(this.#number(cell, name, attributes.get(name) as string)) }
        : {}
    const align = attributes.get('align')
    const valign = attributes.get('valign')

    return {
      text: this.inline(trimmed(cell.children)),
      header: cell.name === 'th',
      ...span('colspan'),
      ...span('rowspan'),
      ...(align === undefined ? {} : { align: align as TableCell['align'] }),
      ...(valign === undefined ? {} : { valign: valign as TableCell['valign'] }),
    } as TableCell
  }

  #details(element: Element): InputRichBlock {
    const summary = element.children.find((node): node is Element => isElement(node, 'summary'))
    const body = element.children.filter((node) => node !== summary)

    return details(
      summary === undefined ? '' : this.inline(trimmed(summary.children)),
      this.blocks(body),
      { open: element.attributes.has('open') },
    )
  }

  #buttonRow(element: Element): InputRichBlock {
    const row = element.children.filter((node): node is Element => isElement(node, 'tg-button'))
    const align = element.attributes.get('align')

    return buttons(
      row.map((button) => this.#button(button)),
      align === undefined ? {} : { align: align as 'left' | 'center' | 'right' },
    )
  }
}

/**
 * Read rich HTML into the blocks it describes.
 *
 * ```ts
 * const blocks = parseRichHtml('<h1>Report</h1><p>Up <b>12%</b></p>')
 * ```
 *
 * Media named by `tg://photo?id=…` and its kin are found in `options.media`,
 * as a message's `media` field lists them.
 */
export function parseRichHtml(source: string, options: RichParseOptions = {}): InputRichBlock[] {
  const nodes = new TreeReader(source, options.lenient === true).read()
  const blocks = new RichHtmlReader(source, options, nodes).blocks(nodes)

  if (options.lenient !== true) {
    const over = overLimit(measureRich(blocks))
    if (over !== undefined) throw new RichParseError(over, 0, source)
  }

  return blocks
}

/** Inline rich HTML, read into rich text: the content of one paragraph. */
export function parseRichHtmlText(source: string, options: RichParseOptions = {}): RichText {
  const nodes = new TreeReader(source, options.lenient === true).read()

  return new RichHtmlReader(source, options, nodes).inline(nodes)
}

/** The tag starting at `at`, with its attributes decoded, or `undefined` for none. */
export function tagAt(source: string, at: number): Tag | undefined {
  return new TreeReader(source, true).tagAt(at)
}

/** Read rich HTML into a tree, for the readers in this package. */
export function readRichHtmlTree(source: string, lenient: boolean): Node[] {
  return new TreeReader(source, lenient).read()
}
