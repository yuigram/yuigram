/**
 * Rich messages: builders, the two dialects written from blocks, templates
 * and media.
 *
 * Where it can, a case compares against the examples in Telegram's own rich
 * message documentation: a block built here must write out as the markup the
 * documentation shows for it. That is a comparison with an independent source,
 * not with this module's own reading of its output.
 */

import { bold as boldText, Formatted, link as linkText } from '@yuigram/core/format'
import { describe, expect, it } from 'vitest'
import {
  blockquote,
  bold,
  button,
  buttons,
  code,
  codeBlock,
  customEmoji,
  details,
  divider,
  expandableBlockquote,
  fromFormatted,
  h1,
  heading,
  italic,
  link,
  list,
  map,
  marked,
  math,
  mathBlock,
  orderedList,
  paragraph,
  photo,
  pullQuote,
  Rich,
  RichError,
  rich,
  richText,
  spoiler,
  subscript,
  table,
  taskList,
  textMention,
  thinking,
  time,
  toRichHtml,
  toRichMarkdown,
  underline,
  video,
} from '../src/rich/index.js'

describe('blocks, as the documentation writes them in rich HTML', () => {
  it('a table with a header row', () => {
    const block = table([
      ['Header 1', 'Header 2'],
      ['Value 1', 'Value 2'],
    ])

    expect(toRichHtml([block]).source).toBe(
      '<table><tr><th>Header 1</th><th>Header 2</th></tr><tr><td>Value 1</td><td>Value 2</td></tr></table>',
    )
  })

  it('a photo with a caption, a credit and a spoiler', () => {
    const block = photo('https://telegram.org/example/photo.jpg', {
      caption: 'Photo caption',
      credit: 'Photo credit',
      spoiler: true,
    })

    expect(toRichHtml([block]).source).toBe(
      '<figure><img src="https://telegram.org/example/photo.jpg" tg-spoiler/><figcaption>Photo caption<cite>Photo credit</cite></figcaption></figure>',
    )
  })

  it('a map, a formula block and a pull quote', () => {
    expect(toRichHtml([map(41.9, 12.5, { zoom: 14 })]).source).toBe(
      '<tg-map lat="41.9" long="12.5" zoom="14"/>',
    )
    expect(toRichHtml([mathBlock('E = mc^2')]).source).toBe(
      '<tg-math-block>E = mc^2</tg-math-block>',
    )
    expect(toRichHtml([pullQuote('Pull quote', 'The Author')]).source).toBe(
      '<aside>Pull quote<cite>The Author</cite></aside>',
    )
  })

  it('a row of buttons', () => {
    const block = buttons(
      [
        { label: 'url', action: { url: 'https://t.me' } },
        { label: 'user', action: { url: 'tg://user?id=777000', style: 'success' } },
        { label: 'callback', action: { callbackData: 'callback', style: 'link' } },
      ],
      { align: 'left' },
    )

    expect(toRichHtml([block]).source).toBe(
      '<tg-button-row align="left"><tg-button type="url" url="https://t.me">url</tg-button><tg-button type="url" style="success" url="tg://user?id=777000">user</tg-button><tg-button type="callback_data" style="link" data="callback">callback</tg-button></tg-button-row>',
    )
  })

  it('inline text of every kind the documentation lists', () => {
    const source = toRichHtml([
      paragraph([
        bold('bold text'),
        italic('italic text'),
        underline('underlined text'),
        code('inline fixed-width code'),
        marked('marked text'),
        subscript('subscript text'),
        spoiler('spoiler'),
        link('inline URL', 'https://t.me/'),
        textMention('inline mention of a user', 123456789),
        customEmoji('5368324170671202286', '👍'),
        time('22:45 tomorrow', 1647531900, 'wDT'),
        math('x^2 + y^2'),
      ]),
    ]).source

    for (const expected of [
      '<b>bold text</b>',
      '<i>italic text</i>',
      '<u>underlined text</u>',
      '<code>inline fixed-width code</code>',
      '<mark>marked text</mark>',
      '<sub>subscript text</sub>',
      '<tg-spoiler>spoiler</tg-spoiler>',
      '<a href="https://t.me/">inline URL</a>',
      '<a href="tg://user?id=123456789">inline mention of a user</a>',
      '<tg-emoji emoji-id="5368324170671202286">👍</tg-emoji>',
      '<tg-time unix="1647531900" format="wDT">22:45 tomorrow</tg-time>',
      '<tg-math>x^2 + y^2</tg-math>',
    ]) {
      expect(source).toContain(expected)
    }
  })

  it('lists, ordered, labelled and checked', () => {
    expect(toRichHtml([orderedList(['ordered list item'], { start: 3, label: 'a' })]).source).toBe(
      '<ol start="3" type="a"><li><p>ordered list item</p></li></ol>',
    )
    expect(
      toRichHtml([
        taskList([{ text: 'Checked checkbox', done: true }, { text: 'Unchecked checkbox' }]),
      ]).source,
    ).toBe(
      '<ul><li><input type="checkbox" checked><p>Checked checkbox</p></li><li><input type="checkbox"><p>Unchecked checkbox</p></li></ul>',
    )
  })
})

describe('blocks, as rich Markdown', () => {
  it('writes the syntax the documentation shows, falling back to HTML where there is none', () => {
    const source = toRichMarkdown([
      h1('Heading 1'),
      paragraph([
        'Some ',
        bold('bold'),
        ' and ',
        italic('italic'),
        ' and ',
        marked('marked'),
        ' text.',
      ]),
      codeBlock("print('x')", 'python'),
      divider(),
      list(['unordered list item']),
      taskList([{ text: 'completed task list item', done: true }]),
      table(
        [
          ['Header 1', 'Header 2'],
          ['left', 'center'],
        ],
        { align: ['left', 'center'] },
      ),
      mathBlock('E = mc^2'),
      paragraph([underline('underlined text'), customEmoji('5368324170671202286', '👍')]),
    ]).source

    expect(source).toBe(
      [
        '# Heading 1',
        'Some **bold** and *italic* and ==marked== text\\.',
        "```python\nprint('x')\n```",
        '---',
        '- unordered list item',
        '- [x] completed task list item',
        '| Header 1 | Header 2 |\n|:---|:---:|\n| left | center |',
        '$$E = mc^2$$',
        '<u>underlined text</u>![👍](tg://emoji?id=5368324170671202286)',
      ].join('\n\n'),
    )
  })

  it('quotes every line, and nests blocks inside list items', () => {
    expect(toRichMarkdown([blockquote(['one', paragraph('two')])]).source).toBe('>one\n>\n>two')
    expect(toRichMarkdown([list([['first', codeBlock('x')]])]).source).toBe(
      '- first\n\n  ```\n  x\n  ```',
    )
  })

  it('never lets emphasis markers meet whitespace they would not close against', () => {
    expect(toRichMarkdown([paragraph(bold(' padded '))]).source).toBe('<b> padded </b>')
  })

  it('fences code with more backticks than it holds', () => {
    expect(toRichMarkdown([codeBlock('```\ninner\n```')]).source).toBe(
      '````\n```\ninner\n```\n````',
    )
    expect(toRichMarkdown([paragraph(code('a`b'))]).source).toBe('``a`b``')
  })
})

describe('text people supplied', () => {
  it('stays text inside a template, whatever it contains', () => {
    const name = '**admin** <b>x</b> # [link](http://evil.example)'

    const markdown = rich.markdown`# Hello ${name}`.content as string
    expect(markdown).toBe(
      '# Hello \\*\\*admin\\*\\* \\<b\\>x\\</b\\> \\# \\[link\\]\\(http://evil\\.example\\)',
    )

    const html = rich.html`<p>Hello ${name}</p>`.content as string
    expect(html).toBe(
      '<p>Hello **admin** &#60;b&#62;x&#60;/b&#62; # [link](http://evil.example)</p>',
    )
  })

  it('is plain text inside every builder, never markup', () => {
    expect(bold('**x**')).toEqual({ type: 'bold', text: '**x**' })
    expect(toRichMarkdown([paragraph('1. not a list')]).source).toBe('1\\. not a list')
  })

  it('goes into a template as builders written into the dialect', () => {
    const composed = rich.markdown`Status: ${bold('green')}\n\n${table([['a'], ['b']])}`

    expect(composed.content).toBe('Status: **green**\n\n| a |\n|:---|\n| b |')
  })
})

describe('media', () => {
  it('lists a file that is not a URL, and names it by a tg:// link', () => {
    const upload = { data: new Uint8Array([1, 2, 3]), filename: 'chart.png' }
    const blob = new Blob([new Uint8Array([4])], { type: 'image/png' })
    const message = rich.markdown`${photo(upload, { caption: 'Chart' })}\n\n${video('BAACAgIAAxkBAAI')}\n\n${photo(blob)}`

    expect(message.content).toBe(
      '![](tg://photo?id=m1 "Chart")\n\n![](tg://video?id=m2)\n\n![](tg://photo?id=m3)',
    )
    expect(message.media.map((entry) => [entry.id, entry.media.type])).toEqual([
      ['m1', 'photo'],
      ['m2', 'video'],
      ['m3', 'photo'],
    ])
    // A Blob has a type of its own; it is still an upload, not a finished InputMedia.
    const third = message.media[2] as { media: { media: unknown } }
    expect(third.media.media).toBe(blob)
    expect(message.toInputRichMessage().media).toHaveLength(3)
  })

  it('writes a public URL as it is', () => {
    expect(toRichMarkdown([photo('https://telegram.org/example/photo.jpg')])).toEqual({
      source: '![](https://telegram.org/example/photo.jpg)',
      media: [],
    })
  })
})

describe('the message', () => {
  it('composes blocks, turning runs of text into paragraphs', () => {
    const message = rich('Intro', h1('Title'), ['line with ', bold('bold')], divider())

    expect(message.blocks?.map((block) => block.type)).toEqual([
      'paragraph',
      'heading',
      'paragraph',
      'divider',
    ])
    expect(message.toInputRichMessage()).toEqual({ blocks: message.blocks })
  })

  it('carries the shared options, without changing the original', () => {
    const message = rich('x')
    const shown = message.rtl().noEntityDetection()

    expect(message.toInputRichMessage()).not.toHaveProperty('is_rtl')
    expect(JSON.parse(JSON.stringify(shown))).toMatchObject({
      is_rtl: true,
      skip_entity_detection: true,
    })
  })

  it('converts between forms only where it can', () => {
    expect(rich(h1('T')).toMarkdown()).toBe('# T')
    expect(rich(h1('T')).toHtml()).toBe('<h1>T</h1>')
    expect(() => rich.html('<p>x</p>').toMarkdown()).toThrow(RichError)
    expect(() => new Rich('blocks', [])).toThrow(/at least one block/)
  })
})

describe('what Telegram refuses', () => {
  it('is refused before it is sent', () => {
    expect(() => table([Array.from({ length: 21 }, () => 'x')])).toThrow(/at most 20 columns/)
    expect(() => heading(7 as never, 'x')).toThrow(/level 1 to 6/)
    expect(() => button('x', {} as never)).toThrow(/exactly one thing/)
    expect(() => button('x', { url: 'a', callbackData: 'b' } as never)).toThrow(/exactly one thing/)
    expect(() => button('x', { callbackData: 'é'.repeat(33) })).toThrow(/64 bytes/)
    expect(() => customEmoji('abc', 'x')).toThrow(/digits/)
    expect(() => time('x', 1, 'rw')).toThrow(/date-time format/)
    expect(() => photo('https://a.b/c.jpg', { credit: 'x' })).toThrow(/needs a caption/)
  })
})

describe('formatted text in a rich message', () => {
  it('carries its styles, links and nesting over as rich text', () => {
    const value = Formatted.concat(boldText('hi '), linkText('https://a.b')('there'))

    expect(fromFormatted(value)).toEqual([
      { type: 'bold', text: 'hi ' },
      { type: 'url', text: 'there', url: 'https://a.b' },
    ])
    // Nested lists flatten into one run, and empty parts drop out.
    expect(richText(['a', value, null, 3])).toEqual([
      'a',
      { type: 'bold', text: 'hi ' },
      { type: 'url', text: 'there', url: 'https://a.b' },
      '3',
    ])
  })

  it('keeps a quotation and a details block as blocks', () => {
    expect(details('Title', 'Content', { open: true })).toEqual({
      type: 'details',
      summary: 'Title',
      blocks: [{ type: 'paragraph', text: 'Content' }],
      is_open: true,
    })
    expect(expandableBlockquote('x', 'y')).toEqual({
      type: 'expandable_blockquote',
      text: 'x',
      credit: 'y',
    })
    expect(thinking('…')).toEqual({ type: 'thinking', text: '…' })
  })
})
