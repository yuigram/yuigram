/**
 * Formatted text: builders, both dialects, and writing markup back.
 *
 * The fixtures that matter most are Telegram's own: the HTML and MarkdownV2
 * samples from the Bot API documentation describe the same formatting in two
 * dialects, and two parsers written separately must agree on them. Agreement
 * between independent readers of independent sources is evidence a parser
 * reads the dialect; a parser agreeing with its own serializer is not.
 */

import { describe, expect, it } from 'vitest'
import {
  blockquote,
  bold,
  code,
  composeTimeFormat,
  customEmoji,
  type Entity,
  expandableBlockquote,
  Formatted,
  format,
  formatDedent,
  html,
  htmlb,
  italic,
  join,
  link,
  MarkupParseError,
  md,
  mentionUser,
  pre,
  scanHtml,
  scanMarkdown,
  spoiler,
  strikethrough,
  textMention,
  time,
  underline,
} from '../src/format/index.js'

/** A compact view of ranges, for comparing. */
const view = (value: Formatted): string[] =>
  value.entities.map((entity) => {
    const extra =
      entity.url ??
      entity.language ??
      entity.custom_emoji_id ??
      (entity.user === undefined ? undefined : `user:${entity.user.id}`) ??
      (entity.unix_time === undefined
        ? undefined
        : `${entity.unix_time}/${entity.date_time_format ?? ''}`)

    return `${entity.type}@${entity.offset}+${entity.length}${extra === undefined ? '' : `:${extra}`}`
  })

/** The HTML sample from the Bot API documentation's formatting options. */
const DOCUMENTED_HTML = [
  '<b>bold</b>, <strong>bold</strong>',
  '<i>italic</i>, <em>italic</em>',
  '<u>underline</u>, <ins>underline</ins>',
  '<s>strikethrough</s>, <strike>strikethrough</strike>, <del>strikethrough</del>',
  '<span class="tg-spoiler">spoiler</span>, <tg-spoiler>spoiler</tg-spoiler>',
  '<b>bold <i>italic bold <s>italic bold strikethrough <span class="tg-spoiler">italic bold strikethrough spoiler</span></s> <u>underline italic bold</u></i> bold</b>',
  '<a href="http://www.example.com/">inline URL</a>',
  '<a href="tg://user?id=123456789">inline mention of a user</a>',
  '<tg-emoji emoji-id="5368324170671202286">👍</tg-emoji>',
  '<tg-time unix="1647531900" format="wDT">22:45 tomorrow</tg-time>',
  '<code>inline fixed-width code</code>',
  '<pre>pre-formatted fixed-width code block</pre>',
  '<pre><code class="language-python">pre-formatted fixed-width code block written in the Python programming language</code></pre>',
].join('\n')

/** The same, in the MarkdownV2 sample's spelling. */
const DOCUMENTED_MARKDOWN = [
  '*bold*, *bold*',
  '_italic_, _italic_',
  '__underline__, __underline__',
  '~strikethrough~, ~strikethrough~, ~strikethrough~',
  '||spoiler||, ||spoiler||',
  '*bold _italic bold ~italic bold strikethrough ||italic bold strikethrough spoiler||~ __underline italic bold___ bold*',
  '[inline URL](http://www.example.com/)',
  '[inline mention of a user](tg://user?id=123456789)',
  '![👍](tg://emoji?id=5368324170671202286)',
  '![22:45 tomorrow](tg://time?unix=1647531900&format=wDT)',
  '`inline fixed-width code`',
  '```\npre-formatted fixed-width code block```',
  '```python\npre-formatted fixed-width code block written in the Python programming language```',
].join('\n')

describe('the documented samples', () => {
  it('read the same in both dialects', () => {
    const fromHtml = html(DOCUMENTED_HTML)
    const fromMarkdown = md(DOCUMENTED_MARKDOWN)

    expect(fromMarkdown.text).toBe(fromHtml.text)
    expect(view(fromMarkdown)).toEqual(view(fromHtml))
  })

  it('read the nested line the way the documentation describes it', () => {
    const line = md(
      '*bold _italic bold ~italic bold strikethrough ||italic bold strikethrough spoiler||~ __underline italic bold___ bold*',
    )

    expect(line.text).toBe(
      'bold italic bold italic bold strikethrough italic bold strikethrough spoiler underline italic bold bold',
    )
    expect(view(line)).toEqual([
      'bold@0+103',
      'italic@5+93',
      'strikethrough@17+59',
      'spoiler@43+33',
      'underline@77+21',
    ])
  })

  it('read the quotation sample, collapsed one included', () => {
    const quoted = md(
      [
        '>Block quotation started',
        '>Block quotation continued',
        '>The last line of the block quotation',
        '**>The expandable block quotation started right after the previous block quotation',
        '>It is separated from the previous block quotation by an empty bold entity',
        '>The last line of the expandable block quotation with the expandability mark||',
      ].join('\n'),
    )

    const [first, second] = quoted.entities
    expect(first?.type).toBe('blockquote')
    expect(quoted.text.slice(first?.offset, (first?.offset ?? 0) + (first?.length ?? 0))).toBe(
      'Block quotation started\nBlock quotation continued\nThe last line of the block quotation',
    )
    expect(second?.type).toBe('expandable_blockquote')
    expect(quoted.text.endsWith('with the expandability mark')).toBe(true)
  })

  it('agree with the escaping rules the documentation states', () => {
    expect(md('*bold \\*text*').text).toBe('bold *text')
    expect(md('_italic \\*text_').text).toBe('italic *text')
    expect(md('`code with \\` and \\\\`').text).toBe('code with ` and \\')
    expect(md('[link](http://x.y/a\\)b)').entities[0]?.url).toBe('http://x.y/a)b')
  })
})

describe('writing markup back', () => {
  it('writes both dialects so they read back into the same value', () => {
    const value = html(DOCUMENTED_HTML)

    expect(view(html(value.toHtml()))).toEqual(view(value))
    expect(html(value.toHtml()).text).toBe(value.text)
    expect(view(md(value.toMarkdown()))).toEqual(view(value))
    expect(md(value.toMarkdown()).text).toBe(value.text)
  })

  it('nests ranges that cross, keeping quotations whole', () => {
    const crossing = new Formatted('abcdefgh', [
      { type: 'bold', offset: 0, length: 5 },
      { type: 'italic', offset: 3, length: 5 },
    ])

    expect(crossing.toHtml()).toBe('<b>abc<i>de</i></b><i>fgh</i>')
    expect(view(html(crossing.toHtml()))).toEqual(['bold@0+5', 'italic@3+5'])
    expect(view(md(crossing.toMarkdown()))).toEqual(['bold@0+5', 'italic@3+5'])

    const quote = new Formatted('ab\ncd', [
      { type: 'bold', offset: 1, length: 3 },
      { type: 'blockquote', offset: 0, length: 5 },
    ])
    expect(quote.toHtml()).toBe('<blockquote>a<b>b\nc</b>d</blockquote>')
  })

  it('separates an italic from an underline that would read the wrong way round', () => {
    const value = new Formatted('ab', [
      { type: 'italic', offset: 0, length: 2 },
      { type: 'underline', offset: 1, length: 1 },
    ])
    const written = value.toMarkdown()

    expect(view(md(written))).toEqual(view(value))

    const inBold = new Formatted('ab', [
      { type: 'bold', offset: 0, length: 2 },
      { type: 'italic', offset: 0, length: 2 },
      { type: 'underline', offset: 1, length: 1 },
    ])
    expect(view(md(inBold.toMarkdown()))).toEqual(view(inBold))
  })

  it('keeps two quotations on consecutive lines apart', () => {
    const value = new Formatted('one\ntwo', [
      { type: 'blockquote', offset: 0, length: 3 },
      { type: 'expandable_blockquote', offset: 4, length: 3 },
    ])

    expect(view(md(value.toMarkdown()))).toEqual(view(value))
  })

  it('escapes every reserved character in prose, and only two in code', () => {
    const value = new Formatted('_*[]()~`>#+-=|{}.!\\ and `x\\`', [
      { type: 'code', offset: 24, length: 4 },
    ])
    const written = value.toMarkdown()

    expect(md(written).text).toBe(value.text)
    // Code holding `` `x\` ``: its backticks and backslash escaped, nothing else.
    expect(written.endsWith(' and `\\`x\\\\\\``')).toBe(true)
  })
})

describe('offsets', () => {
  it('count UTF-16 code units, so a character outside the basic plane is two', () => {
    const value = html('😀<b>x</b>')

    expect(value.text.length).toBe(3)
    expect(view(value)).toEqual(['bold@2+1'])
    expect(view(md('😀*x*'))).toEqual(['bold@2+1'])
  })

  it('refuse to cut a character in two', () => {
    expect(() => new Formatted('😀').slice(0, 1)).toThrow(/character in two/)
  })

  it('reads numeric references as the characters they name', () => {
    expect(html('&#128512;&#x1F600;&lt;&gt;&amp;&quot;').text).toBe('😀😀<>&"')
  })
})

describe('strict, lenient and partial', () => {
  it('refuses what Telegram would refuse, naming where', () => {
    expect(() => html('<b>open')).toThrow(MarkupParseError)
    expect(() => html('a < b')).toThrow(/offset 2/)
    expect(() => html('<marquee>x</marquee>')).toThrow(/not a tag/)
    expect(() => html('&nbsp;')).toThrow(/not a reference/)
    expect(() => html('<blockquote><blockquote>x</blockquote></blockquote>')).toThrow(/nested/)
    expect(() => html('<code><b>x</b></code>')).toThrow(/inside code/)
    expect(() => md('1. item')).toThrow(/reserved/)
    expect(() => md('*open')).toThrow(/never closed/)
  })

  it('keeps what is well formed and shows the rest as written', () => {
    expect(md.lenient('Price: 5.00! *great* (really)').toHtml()).toBe(
      'Price: 5.00! <b>great</b> (really)',
    )
    expect(html.lenient('a < b and <b>bold</b> and <marquee>x</marquee>').toHtml()).toBe(
      'a &lt; b and <b>bold</b> and &lt;marquee&gt;x&lt;/marquee&gt;',
    )
    expect(html.lenient('<b>never closed').toHtml()).toBe('<b>never closed</b>')
    expect(md.lenient('[text without address]').text).toBe('text without address]')
  })

  it('holds back a token that has not finished arriving', () => {
    const tag = scanHtml('<b>bold</b> <i', { mode: 'partial' })
    expect(tag.heldBack).toBe(true)
    expect(tag.consumed).toBe(12)
    expect(tag.formatted.text).toBe('bold ')

    const reference = scanHtml('fish &am', { mode: 'partial' })
    expect(reference.formatted.text).toBe('fish ')

    const underscore = scanMarkdown('text _', { mode: 'partial' })
    expect(underscore.heldBack).toBe(true)
    expect(underscore.formatted.text).toBe('text ')

    const address = scanMarkdown('see [the docs](https://exa', { mode: 'partial' })
    expect(address.formatted.text).toBe('see the docs')
    expect(address.formatted.entities).toEqual([])
  })

  it('closes what is open where the text currently ends', () => {
    const open = scanMarkdown('*bold _both', { mode: 'partial' })

    expect(view(open.formatted)).toEqual(['bold@0+9', 'italic@5+4'])
    expect(open.state.open.map((range) => range.type)).toEqual(['bold', 'italic'])
  })
})

describe('stopping and resuming', () => {
  it('stops before a length, never inside a token, and says where', () => {
    const source = 'ab<b>cd&amp;ef</b>gh'
    const stopped = scanHtml(source, { mode: 'partial', stopAt: 5 })

    expect(stopped.formatted.text).toBe('abcd&')
    expect(stopped.stopped).toBe(true)
    expect(source.slice(stopped.consumed)).toBe('ef</b>gh')
    expect(view(stopped.formatted)).toEqual(['bold@2+3'])
  })

  it('continues what was open, from offset zero', () => {
    const source = '*one two three* four'
    const first = scanMarkdown(source, { mode: 'partial', stopAt: 4 })
    const rest = scanMarkdown(source.slice(first.consumed), {
      mode: 'partial',
      resume: first.state,
    })

    expect(first.formatted.text + rest.formatted.text).toBe('one two three four')
    expect(view(first.formatted)).toEqual(['bold@0+4'])
    expect(view(rest.formatted)).toEqual(['bold@0+9'])
  })

  it('never stops between the two halves of a character', () => {
    const stopped = scanMarkdown('a😀b', { mode: 'partial', stopAt: 2 })

    expect(stopped.formatted.text).toBe('a')
    expect(stopped.consumed).toBe(1)
  })
})

describe('interpolation', () => {
  it('reads interpolated values as text, never as markup', () => {
    const name = '<b>*admin*</b> & co'

    expect(html`<i>${name}</i>`.text).toBe(name)
    expect(view(html`<i>${name}</i>`)).toEqual([`italic@0+${name.length}`])
    expect(md`_${name}_`.text).toBe(name)
    expect(format`${name}`.entities).toEqual([])
  })

  it('keeps an interpolated formatted value formatted', () => {
    const inner = bold('x')

    expect(view(html`<i>a ${inner}</i>`)).toEqual(['italic@0+3', 'bold@2+1'])
    expect(view(md`_a ${inner}_`)).toEqual(['italic@0+3', 'bold@2+1'])
  })

  it('puts a value into an attribute as text', () => {
    const url = 'https://example.com/?a=1&b="2"'

    expect(html`<a href="${url}">here</a>`.entities[0]?.url).toBe(url)
  })

  it('refuses a template whose literal parts carry the private markers', () => {
    expect(() => html`${1}`).toThrow(/private characters/)
  })
})

describe('builders', () => {
  it('compose without parsing anything', () => {
    const value = format`Hi ${bold('<b>')}, ${italic`you have ${3} new`}`

    expect(value.text).toBe('Hi <b>, you have 3 new')
    expect(view(value)).toEqual(['bold@3+3', 'italic@8+14'])
  })

  it('chain styles', () => {
    expect(view(bold.italic.underline('x'))).toEqual(['bold@0+1', 'italic@0+1', 'underline@0+1'])
    expect(view(spoiler.strikethrough`y`)).toEqual(['spoiler@0+1', 'strikethrough@0+1'])
  })

  it('drop what Telegram refuses inside code and quotations', () => {
    expect(view(code(bold('x')))).toEqual(['code@0+1'])
    expect(view(pre(bold('x'), 'ts'))).toEqual(['pre@0+1:ts'])
    expect(view(blockquote(expandableBlockquote('x')))).toEqual(['blockquote@0+1'])
  })

  it('build every range that carries details', () => {
    expect(view(link('https://a.b')('go'))).toEqual(['text_link@0+2:https://a.b'])
    expect(view(link('go', 'https://a.b'))).toEqual(['text_link@0+2:https://a.b'])
    expect(view(mentionUser('Ada', 42))).toEqual(['text_mention@0+3:user:42'])
    expect(mentionUser(42)('Ada').entities[0]?.user).toEqual({
      id: 42,
      is_bot: false,
      first_name: 'Ada',
    })
    expect(view(textMention({ id: 7, is_bot: true, first_name: 'B' })('b'))).toEqual([
      'text_mention@0+1:user:7',
    ])
    expect(view(customEmoji('👍', '5368324170671202286'))).toEqual([
      'custom_emoji@0+2:5368324170671202286',
    ])
    expect(
      view(time('soon', 1647531900, { weekday: true, dateStyle: 'long', timeStyle: 'long' })),
    ).toEqual(['date_time@0+4:1647531900/wDT'])
    expect(view(time(new Date(1647531900_000), { relative: true })('x'))).toEqual([
      'date_time@0+1:1647531900/r',
    ])
    expect(view(pre()('x'))).toEqual(['pre@0+1'])
    expect(view(underline('u'))).toEqual(['underline@0+1'])
    expect(view(strikethrough('s'))).toEqual(['strikethrough@0+1'])
  })

  it('refuses details Telegram would refuse', () => {
    expect(() => composeTimeFormat({ relative: true, weekday: true })).toThrow(/relative/)
    expect(() => customEmoji('x', 'abc')).toThrow(/digits/)
    expect(() => mentionUser('x', -1)).toThrow(/positive/)
    expect(() => link('x', '')).toThrow(/non-empty/)
  })

  it('joins, leaving out empty parts', () => {
    expect(join(['a', bold('b'), null, false, 'c'], ', ').text).toBe('a, b, c')
    expect(view(join(['a', bold('b')], ' '))).toEqual(['bold@2+1'])
  })

  it('merges touching ranges of the same style', () => {
    expect(view(Formatted.concat(bold('a'), bold('b')))).toEqual(['bold@0+2'])
    expect(view(Formatted.concat(code('a'), code('b')))).toEqual(['code@0+1', 'code@1+1'])
  })

  it('dedents a template written as an indented block', () => {
    const value = formatDedent`
      Line one
        indented ${bold('two')}
    `

    expect(value.text).toBe('Line one\n  indented two')
  })
})

describe('the formatted value', () => {
  it('reads a message and hands back what a send takes', () => {
    const message = { text: 'hi there', entities: [{ type: 'bold', offset: 0, length: 2 }] }
    const value = Formatted.fromMessage(message)

    expect(value.toPayload()).toEqual({
      text: 'hi there',
      entities: [{ type: 'bold', offset: 0, length: 2 }],
    })
    expect(Formatted.fromMessage({ caption: 'c', caption_entities: [] }).text).toBe('c')
    expect(JSON.stringify(value)).toBe(JSON.stringify(value.toPayload()))
    expect(String(value)).toBe('hi there')
  })

  it('slices, cutting ranges to fit and keeping their kind', () => {
    const value = link('https://a.b')('abcdef').slice(2, 4)

    expect(value.text).toBe('cd')
    expect(view(value)).toEqual(['text_link@0+2:https://a.b'])
  })

  it('keeps ranges Telegram found by itself, and writes them as plain text', () => {
    const value = new Formatted('#tag', [{ type: 'hashtag', offset: 0, length: 4 } as Entity])

    expect(value.entities).toHaveLength(1)
    expect(value.toHtml()).toBe('#tag')
    expect(value.toMarkdown()).toBe('\\#tag')
  })
})

describe('whitespace as a browser reads it', () => {
  it('collapses runs and breaks lines only where asked', () => {
    const value = htmlb`
      <b>Hello</b>,
      world<br>again
    `

    expect(value.text).toBe('Hello, world\nagain')
    expect(view(value)).toEqual(['bold@0+5'])
  })
})

describe('custom tags', () => {
  it('turn their content into whatever the handler returns, told where they stand', () => {
    const seen: unknown[] = []
    const tagged = html.with({
      shout: (content, info) => {
        seen.push({
          parent: info.parent,
          index: info.index,
          count: info.siblingCount,
          attributes: info.attributes,
        })

        return bold(content.text.toUpperCase())
      },
    })

    const value = tagged('<i><shout level="2">hi</shout> and <shout>you</shout></i>')

    expect(value.text).toBe('HI and YOU')
    expect(view(value)).toEqual(['italic@0+10', 'bold@0+2', 'bold@7+3'])
    expect(seen).toEqual([
      { parent: 'i', index: 0, count: 2, attributes: { level: '2' } },
      { parent: 'i', index: 1, count: 2, attributes: {} },
    ])
  })

  it('refuse to shadow a built-in tag, and leave the shared tag untouched', () => {
    expect(() => html.with({ b: (content) => content })).toThrow(/Telegram's own/)
    expect(() => html('<shout>x</shout>')).toThrow(/not a tag/)
  })
})
