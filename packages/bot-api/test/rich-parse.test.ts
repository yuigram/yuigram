// SPDX-License-Identifier: MPL-2.0

/**
 * Reading rich Markdown and rich HTML into blocks.
 *
 * The expected blocks are written with the builders, a separate path from the
 * readers, and the markup is taken from the grammar Telegram documents — most
 * of it the documentation's own examples. Three kinds of check follow: each
 * dialect against hand-written expectations; the two dialects against each
 * other over documents that say the same thing; and blocks written out by the
 * serializers and read back.
 */

import { describe, expect, it } from 'vitest'
import type { InputRichBlock } from '../src/generated/types/index.js'
import {
  anchorLink,
  blockquote,
  bold,
  br,
  buttons,
  code,
  codeBlock,
  collage,
  customEmoji,
  details,
  divider,
  email,
  expandableBlockquote,
  footnote,
  footnoteRef,
  h1,
  h2,
  heading,
  italic,
  join,
  link,
  list,
  map,
  marked,
  math,
  mathBlock,
  measureRich,
  media,
  orderedList,
  paragraph,
  parseRichHtml,
  parseRichMarkdown,
  phone,
  photo,
  pullQuote,
  RICH_LIMITS,
  Rich,
  RichParseError,
  reference,
  referenceLink,
  rich,
  spoiler,
  strikethrough,
  subscript,
  superscript,
  table,
  taskList,
  textMention,
  time,
  toRichHtml,
  toRichMarkdown,
  underline,
  video,
  voiceNote,
} from '../src/rich/index.js'

describe('rich HTML', () => {
  it('reads headings, paragraphs, code, footers and dividers', () => {
    expect(
      parseRichHtml(
        '<h1>Heading 1</h1><h6>Heading 6</h6><p>Paragraph text</p><pre>plain</pre>' +
          '<pre><code class="language-python">print(1)</code></pre><footer>Footer text</footer><hr/>',
      ),
    ).toEqual([
      heading(1, 'Heading 1'),
      heading(6, 'Heading 6'),
      paragraph('Paragraph text'),
      codeBlock('plain'),
      codeBlock('print(1)', 'python'),
      { type: 'footer', text: 'Footer text' },
      divider(),
    ])
  })

  it('reads every inline style, and links by what their address is', () => {
    const [block] = parseRichHtml(
      '<p><b>b</b><strong>s</strong><i>i</i><u>u</u><s>s</s><code>c</code><mark>m</mark>' +
        '<sub>2</sub><sup>3</sup><tg-spoiler>x</tg-spoiler>' +
        '<a href="https://t.me/">url</a><a href="mailto:user@example.com">mail</a>' +
        '<a href="tel:+123456789">tel</a><a href="tg://user?id=42">Ada</a>' +
        '<a href="#chapter-1">in</a><tg-reference name="note-1">ref</tg-reference><a href="#note-1">to ref</a></p>',
    )

    expect(block).toEqual(
      paragraph([
        bold('b'),
        bold('s'),
        italic('i'),
        underline('u'),
        strikethrough('s'),
        code('c'),
        marked('m'),
        subscript('2'),
        superscript('3'),
        spoiler('x'),
        link('url', 'https://t.me/'),
        email('mail', 'user@example.com'),
        phone('tel', '+123456789'),
        textMention('Ada', 42),
        anchorLink('in', 'chapter-1'),
        reference('ref', 'note-1'),
        referenceLink('to ref', 'note-1'),
      ]),
    )
  })

  it('reads lines written one under another as one line, and <br> as a break', () => {
    expect(
      parseRichHtml('<p>one\n  two</p><blockquote>a<br>b<cite>The Author</cite></blockquote>'),
    ).toEqual([paragraph('one two'), blockquote(['a', br(), 'b'], 'The Author')])
  })

  it('resolves the named references the API has, and numeric ones', () => {
    expect(parseRichHtml('<p>&lt;&gt;&amp;&quot;&apos;&hellip;&mdash;&#x1F600;&#65;</p>')).toEqual([
      paragraph('<>&"\'…—\u{1F600}A'),
    ])
  })

  it('reads lists: numbered from where they start, backwards, with their own numbers, and checked', () => {
    expect(
      parseRichHtml(
        '<ol start="3" type="a" reversed><li>c</li><li>b</li></ol>' +
          '<ol><li value="7" type="i">seven</li><li>eight</li></ol>' +
          '<ul><li><input type="checkbox" checked>done</li><li><input type="checkbox">open</li></ul>',
      ),
    ).toEqual([
      {
        type: 'list',
        items: [
          { blocks: [paragraph('c')], value: 3, type: 'a' },
          { blocks: [paragraph('b')], value: 2, type: 'a' },
        ],
      },
      {
        type: 'list',
        items: [
          { blocks: [paragraph('seven')], value: 7, type: 'i' },
          { blocks: [paragraph('eight')], value: 8, type: '1' },
        ],
      },
      taskList([{ text: 'done', done: true }, { text: 'open' }]),
    ])
  })

  it('reads quotations, media with captions and credits, maps and galleries', () => {
    expect(
      parseRichHtml(
        '<blockquote expandable>hidden<cite>Credit</cite></blockquote>' +
          '<aside>Pull quote<cite>The Author</cite></aside>' +
          '<figure><img src="https://telegram.org/example/photo.jpg" tg-spoiler/><figcaption>Photo caption<cite>Photo credit</cite></figcaption></figure>' +
          '<audio src="https://telegram.org/example/audio.ogg"></audio>' +
          '<figure><tg-map lat="41.9" long="12.5" zoom="14"/><figcaption>Map caption</figcaption></figure>' +
          '<tg-collage><img src="https://telegram.org/example/photo.jpg"/><video src="https://telegram.org/example/video.mp4"/><figcaption>Collage caption</figcaption></tg-collage>',
      ),
    ).toEqual([
      expandableBlockquote('hidden', 'Credit'),
      pullQuote('Pull quote', 'The Author'),
      photo('https://telegram.org/example/photo.jpg', {
        caption: 'Photo caption',
        credit: 'Photo credit',
        spoiler: true,
      }),
      voiceNote('https://telegram.org/example/audio.ogg'),
      map(41.9, 12.5, { zoom: 14, caption: 'Map caption' }),
      collage(
        [
          photo('https://telegram.org/example/photo.jpg'),
          video('https://telegram.org/example/video.mp4'),
        ],
        { caption: 'Collage caption' },
      ),
    ])
  })

  it('reads a table with its flags, caption, spans and alignment', () => {
    expect(
      parseRichHtml(
        '<table bordered striped compact><caption>Table caption</caption>' +
          '<tr><th>H</th><td colspan="2" rowspan="2" align="center" valign="top">V</td></tr></table>',
      ),
    ).toEqual([
      table(
        [
          [
            { text: 'H', header: true },
            { text: 'V', header: false, colspan: 2, rowspan: 2, align: 'center', valign: 'top' },
          ],
        ],
        { header: false, bordered: true, striped: true, compact: true, caption: 'Table caption' },
      ),
    ])
  })

  it('reads details, formulas, moments, custom emoji and buttons', () => {
    expect(
      parseRichHtml(
        '<details open><summary>Title</summary>Content</details>' +
          '<tg-math-block>E = mc^2</tg-math-block>' +
          '<p><tg-time unix="1647531900" format="wDT">22:45 tomorrow</tg-time> <tg-math>x^2</tg-math> ' +
          '<tg-emoji emoji-id="5368324170671202286">👍</tg-emoji></p>' +
          '<tg-button-row align="right"><tg-button type="url" style="success" url="https://t.me">url</tg-button>' +
          '<tg-button type="callback_data" data="cb">cb</tg-button></tg-button-row>',
      ),
    ).toEqual([
      details('Title', 'Content', { open: true }),
      mathBlock('E = mc^2'),
      paragraph([
        time('22:45 tomorrow', 1647531900, 'wDT'),
        ' ',
        math('x^2'),
        ' ',
        customEmoji('5368324170671202286', '👍'),
      ]),
      buttons(
        [
          { label: 'url', action: { url: 'https://t.me', style: 'success' } },
          { label: 'cb', action: { callbackData: 'cb' } },
        ],
        { align: 'right' },
      ),
    ])
  })

  it('finds a message’s own media by the id its link names', () => {
    const own = { type: 'photo', media: 'attach://upload' } as const

    expect(
      parseRichHtml('<img src="tg://photo?id=m1"/>', { media: [{ id: 'm1', media: own }] }),
    ).toEqual([photo(own)])
    expect(() => parseRichHtml('<img src="tg://photo?id=missing"/>')).toThrow(/no media has the id/)
  })
})

describe('rich Markdown', () => {
  const read = (source: string): InputRichBlock[] => parseRichMarkdown(source)

  it('reads emphasis the way CommonMark does, and leaves an underscore inside a word alone', () => {
    expect(read('**b** __b__ *i* _i_ snake_case_name 2 * 3 * 4')).toEqual([
      paragraph([
        bold('b'),
        ' ',
        bold('b'),
        ' ',
        italic('i'),
        ' ',
        italic('i'),
        ' snake_case_name 2 * 3 * 4',
      ]),
    ])
  })

  it('reads the markers Telegram adds, code, and escapes', () => {
    expect(read('~~s~~ ==m== ||x|| `c` \\#hashtag \\*not\\*')).toEqual([
      paragraph([
        strikethrough('s'),
        ' ',
        marked('m'),
        ' ',
        spoiler('x'),
        ' ',
        code('c'),
        ' #hashtag *not*',
      ]),
    ])
  })

  it('reads links, mentions, custom emoji, moments and formulas, and leaves a price alone', () => {
    expect(
      read(
        '[url](https://t.me/) [me](tg://user?id=123456789) ![👍](tg://emoji?id=5368324170671202286) ' +
          '![22:45 tomorrow](tg://time?unix=1647531900&format=wDT) $x^2 + y^2$ costs $5 and $USD',
      ),
    ).toEqual([
      paragraph([
        link('url', 'https://t.me/'),
        ' ',
        textMention('me', 123456789),
        ' ',
        customEmoji('5368324170671202286', '👍'),
        ' ',
        time('22:45 tomorrow', 1647531900, 'wDT'),
        ' ',
        math('x^2 + y^2'),
        ' costs $5 and $USD',
      ]),
    ])
  })

  it('runs the lines of a paragraph on, and breaks one that ends in two spaces', () => {
    expect(read('one\ntwo  \nthree\n\nnext')).toEqual([
      paragraph(['one two\nthree']),
      paragraph('next'),
    ])
  })

  it('reads the documentation’s quotation as three paragraphs', () => {
    expect(
      read(
        '>Block quotation started\n>\n>Block quotation continued on the next line\n' +
          '>Block quotation continued on the same line\n>\n>The last line of the block quotation',
      ),
    ).toEqual([
      blockquote([
        paragraph('Block quotation started'),
        paragraph(
          'Block quotation continued on the next line Block quotation continued on the same line',
        ),
        paragraph('The last line of the block quotation'),
      ]),
    ])
  })

  it('reads lists, nested, numbered from where they start, and task lists', () => {
    expect(read('- a\n  - a1\n- b\n\n3. c\n4. d\n\n- [ ] open\n- [x] done')).toEqual([
      list([[paragraph('a'), list(['a1'])], 'b']),
      orderedList(['c', 'd'], { start: 3 }),
      taskList([{ text: 'open' }, { text: 'done', done: true }]),
    ])
  })

  it('reads headings, fences, formulas and a divider', () => {
    expect(
      read('# One\n## Two\n```js\nlet a = 1\n```\n$$E = mc^2$$\n```math\nx^2\n```\n---'),
    ).toEqual([
      h1('One'),
      h2('Two'),
      codeBlock('let a = 1', 'js'),
      mathBlock('E = mc^2'),
      mathBlock('x^2'),
      divider(),
    ])
  })

  it('reads media lines by what their address ends in, with the title as caption', () => {
    expect(
      read(
        '![](https://telegram.org/example/photo.jpg "Photo caption")\n' +
          '![](https://telegram.org/example/audio.ogg)\n![](https://telegram.org/example/document.zip)',
      ),
    ).toEqual([
      photo('https://telegram.org/example/photo.jpg', { caption: 'Photo caption' }),
      voiceNote('https://telegram.org/example/audio.ogg'),
      media('https://telegram.org/example/document.zip'),
    ])
  })

  it('reads a table with each column’s alignment', () => {
    expect(read('| Metric | Value |\n|:-------|------:|\n| Speed  | **42** |')).toEqual([
      table(
        [
          [
            { text: 'Metric', header: true, align: 'left' },
            { text: 'Value', header: true, align: 'right' },
          ],
          [
            { text: 'Speed', header: false, align: 'left' },
            { text: bold('42'), header: false, align: 'right' },
          ],
        ],
        { header: false },
      ),
    ])
  })

  it('numbers footnotes as they are defined, and puts them after the last block', () => {
    expect(
      read('Text with a reference[^a] and another one[^b].\n\n[^a]: First.\n[^b]: Second _one_.'),
    ).toEqual([
      paragraph([
        'Text with a reference',
        footnoteRef('a', '1'),
        ' and another one',
        footnoteRef('b', '2'),
        '.',
      ]),
      footnote('a', 'First.', '1'),
      footnote('b', ['Second ', italic('one'), '.'], '2'),
    ])
  })

  it('reads Markdown inside details and galleries, and HTML inside other block tags', () => {
    expect(
      read(
        '<details open><summary>Summary with **bold text**</summary>\n### Details heading\n- item\n</details>\n' +
          '<tg-collage>\n![](https://telegram.org/example/photo.jpg)\n![](https://telegram.org/example/video.mp4)\n</tg-collage>\n' +
          '<aside>Pull **not markdown**<cite>The Author</cite></aside>',
      ),
    ).toEqual([
      details(
        ['Summary with ', bold('bold text')],
        [heading(3, 'Details heading'), list(['item'])],
        {
          open: true,
        },
      ),
      collage([
        photo('https://telegram.org/example/photo.jpg'),
        video('https://telegram.org/example/video.mp4'),
      ]),
      pullQuote('Pull **not markdown**', 'The Author'),
    ])
  })

  it('reads Markdown inside inline tags, as the documentation shows', () => {
    expect(read('**Bold _italic <u>underlined italic bold</u> italic_ bold**')).toEqual([
      paragraph(
        bold([
          'Bold ',
          italic(['italic ', underline('underlined italic bold'), ' italic']),
          ' bold',
        ]),
      ),
    ])
  })
})

describe('the two dialects, against each other', () => {
  const pairs: readonly (readonly [string, string])[] = [
    [
      '# Title\n\nSome **bold** and _italic_ text with a [link](https://t.me/).',
      '<h1>Title</h1><p>Some <b>bold</b> and <i>italic</i> text with a <a href="https://t.me/">link</a>.</p>',
    ],
    [
      '- one\n- two\n\n1. first\n2. second\n\n- [x] done',
      '<ul><li>one</li><li>two</li></ul><ol><li>first</li><li>second</li></ol><ul><li><input type="checkbox" checked>done</li></ul>',
    ],
    [
      '> quoted **text**\n\n```js\nlet a = 1\n```\n\n---\n\n$$E = mc^2$$',
      '<blockquote>quoted <b>text</b></blockquote><pre><code class="language-js">let a = 1</code></pre><hr/><tg-math-block>E = mc^2</tg-math-block>',
    ],
    [
      '![](https://telegram.org/example/photo.jpg "Photo caption")\n\n![](https://telegram.org/example/animation.gif)',
      '<figure><img src="https://telegram.org/example/photo.jpg"/><figcaption>Photo caption</figcaption></figure><video src="https://telegram.org/example/animation.gif"></video>',
    ],
    [
      '| A | B |\n|:--|--:|\n| 1 | 2 |',
      '<table><tr><th align="left">A</th><th align="right">B</th></tr><tr><td align="left">1</td><td align="right">2</td></tr></table>',
    ],
    [
      'x <u>u</u> <sub>2</sub> ~~s~~ ==m== ||p|| `c` $y$ ![22:45](tg://time?unix=1&format=t)',
      '<p>x <u>u</u> <sub>2</sub> <s>s</s> <mark>m</mark> <tg-spoiler>p</tg-spoiler> <code>c</code> <tg-math>y</tg-math> <tg-time unix="1" format="t">22:45</tg-time></p>',
    ],
  ]

  it.each(pairs)('reads the same blocks from %j and its HTML', (markdown, html) => {
    expect(parseRichMarkdown(markdown)).toEqual(parseRichHtml(html))
  })
})

describe('blocks written out and read back', () => {
  const message = [
    h1('Weekly report'),
    paragraph([
      'Revenue is ',
      bold('up 12%'),
      ' — see ',
      link('the sheet', 'https://example.com/'),
      '.',
    ]),
    list(['north', 'south']),
    orderedList(['first', 'second'], { start: 3 }),
    taskList([{ text: 'ship', done: true }, { text: 'celebrate' }]),
    blockquote('said', 'someone'),
    codeBlock('let a = 1', 'ts'),
    divider(),
    mathBlock('E = mc^2'),
    table([
      ['Region', 'Revenue'],
      ['EU', '1.2M'],
    ]),
    details('More', 'Hidden text'),
    photo('https://example.com/a.jpg', { caption: 'A picture' }),
  ]

  it('comes back the same from HTML', () => {
    expect(parseRichHtml(toRichHtml(message).source)).toEqual(message)
  })

  it('comes back the same from Markdown', () => {
    expect(parseRichMarkdown(toRichMarkdown(message).source)).toEqual(message)
  })
})

describe('reading strictly, and leniently', () => {
  it('refuses what the grammar does not have, saying where', () => {
    const refusal = (() => {
      try {
        parseRichHtml('<p>fine <blink>no</blink></p>')
      } catch (error) {
        return error
      }

      return undefined
    })() as RichParseError

    expect(refusal).toBeInstanceOf(RichParseError)
    expect(refusal.offset).toBe(8)
    expect(() => parseRichHtml('<p>open')).toThrow(/never closed/)
    expect(() => parseRichHtml('<p>a & b</p>')).toThrow(/character reference/)
    expect(() => parseRichHtml('<p>2 < 3</p>')).toThrow(/&lt;/)
    expect(() => parseRichHtml('<img src="ftp://example.com/a.jpg"/>')).toThrow(/http or https/)
  })

  it('keeps what it cannot read as text when told to', () => {
    expect(parseRichHtml('<p>fine <blink>no</blink> 2 < 3 & 4</p>', { lenient: true })).toEqual([
      paragraph('fine <blink>no</blink> 2 < 3 & 4'),
    ])
  })

  it('refuses nesting deeper than Telegram accepts', () => {
    const deep = `${'<b>'.repeat(RICH_LIMITS.depth + 1)}x${'</b>'.repeat(RICH_LIMITS.depth + 1)}`

    expect(() => parseRichHtml(`<p>${deep}</p>`)).toThrow(/levels deep/)
  })

  it('refuses a message over a limit, and reads it anyway when lenient', () => {
    const many = Array.from({ length: RICH_LIMITS.blocks + 1 }, (_, index) => `p${index}`).join(
      '\n\n',
    )

    expect(() => parseRichMarkdown(many)).toThrow(/at most 500 blocks/)
    expect(parseRichMarkdown(many, { lenient: true })).toHaveLength(RICH_LIMITS.blocks + 1)
  })
})

describe('what a message holds', () => {
  it('counts blocks the way the limits do: list items and table rows too', () => {
    const measured = measureRich([
      list(['a', 'b']),
      table([
        ['h', 'h'],
        ['c', 'c'],
      ]),
      paragraph([customEmoji('1', '👍🏽'), math('x^2')]),
    ])

    // The list, its two items and the paragraph in each; the table and its two
    // rows; and the paragraph.
    expect(measured.blocks).toBe(1 + 2 + 2 + 1 + 2 + 1)
    // The items, the cells, two code points of emoji and three of formula.
    expect(measured.characters).toBe(2 + 4 + 2 + 3)
  })
})

describe('a Rich message read into blocks', () => {
  it('keeps its options and finds its media', () => {
    const own = { type: 'photo', media: 'attach://file' } as const
    const read = new Rich('markdown', '# Hi\n\n![](tg://photo?id=m1)', [{ id: 'm1', media: own }], {
      rtl: true,
    }).toBlocks()

    expect(read.form).toBe('blocks')
    expect(read.blocks).toEqual([h1('Hi'), photo(own)])
    expect(read.toInputRichMessage()).toMatchObject({ is_rtl: true })
  })

  it('reads through the namespace too', () => {
    expect(rich.parseMarkdown('**x**')).toEqual([paragraph(bold('x'))])
    expect(rich.parseHtml('<b>x</b>')).toEqual([paragraph(bold('x'))])
  })
})

describe('the smaller builders', () => {
  it('joins, breaks, and infers a medium from its address', () => {
    expect(join(['a', bold('b'), 'c'])).toEqual(['a, ', bold('b'), ', c'])
    expect(br()).toBe('\n')
    expect(media('https://example.com/v.mp4')).toEqual(video('https://example.com/v.mp4'))
    expect(media('https://example.com/x', { kind: 'photo' })).toEqual(
      photo('https://example.com/x'),
    )
  })

  it('refuses a row of more than eight buttons, and a map Telegram would refuse', () => {
    const nine = Array.from({ length: 9 }, () => ({ label: 'b', action: { url: 'https://t.me' } }))

    expect(() => buttons(nine)).toThrow(/1 to 8 buttons/)
    expect(() => map(0, 0, { zoom: 25 })).toThrow(/0 to 24/)
    expect(() => map(0, 0, { width: 6000, height: 6000 })).toThrow(/together/)
    expect(() => map(0, 0, { width: 2100, height: 100 })).toThrow(/20 times/)
  })
})
