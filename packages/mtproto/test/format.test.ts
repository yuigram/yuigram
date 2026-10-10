// SPDX-License-Identifier: MIT

/**
 * Markup into entities, and back.
 *
 * MTProto has no `parse_mode`: text and ranges are what a message is, and
 * producing the ranges is the client's job. The cases that matter are the ones
 * where markup and text disagree — an offset counted before the tags, a marker
 * that never closes, an interpolated value that looks like markup — and the
 * round trip, which is the only check that the two directions describe the same
 * thing.
 */

import { type Entity, parseHtml, parseMarkdown } from '@yuigram/core/format'
import { describe, expect, it } from 'vitest'
import { fromHtml, toHtml } from '../src/format/html.js'
import { fromMarkdown, toMarkdown } from '../src/format/markdown.js'
import { fromTlEntities } from '../src/format/neutral.js'
import type { FormattedText } from '../src/format/text.js'
import type { TypeMessageEntity } from '../src/generated/api/types/index.js'

/** An entity as a tuple, so a case reads as what it claims rather than as JSON. */
const shape = (entities: readonly TypeMessageEntity[]): readonly string[] =>
  entities.map((one) => `${one._.replace('messageEntity', '')}@${one.offset}+${one.length}`)

describe('reading HTML', () => {
  it('counts offsets in the text, not in the markup', () => {
    // The whole point: an offset is where the range starts once the tags are
    // gone, and the tags are longer than what they mark.
    const read = fromHtml('<b>Hello</b> there')

    expect(read.text).toBe('Hello there')
    expect(shape(read.entities)).toEqual(['Bold@0+5'])
  })

  it('reads every tag it claims to', () => {
    const read = fromHtml(
      '<b>b</b><strong>s</strong><i>i</i><em>e</em><u>u</u><ins>n</ins>' +
        '<s>s</s><strike>t</strike><del>d</del><code>c</code><tg-spoiler>p</tg-spoiler>',
    )

    expect(read.text).toBe('bsieunstdcp')
    expect(shape(read.entities)).toEqual([
      'Bold@0+1',
      'Bold@1+1',
      'Italic@2+1',
      'Italic@3+1',
      'Underline@4+1',
      'Underline@5+1',
      'Strike@6+1',
      'Strike@7+1',
      'Strike@8+1',
      'Code@9+1',
      'Spoiler@10+1',
    ])
  })

  it('nests, with the outer range first', () => {
    const read = fromHtml('<b>Hello <i>there</i></b>')

    expect(read.text).toBe('Hello there')
    expect(shape(read.entities)).toEqual(['Bold@0+11', 'Italic@6+5'])
  })

  it('reads a link, and a mention as the person rather than the link', () => {
    const link = fromHtml('<a href="https://example.com">here</a>')
    const mention = fromHtml('<a href="tg://user?id=42">Ada</a>')

    expect(link.entities[0]).toEqual({
      _: 'messageEntityTextUrl',
      offset: 0,
      length: 4,
      url: 'https://example.com',
    })
    expect(mention.entities[0]).toEqual({
      _: 'messageEntityMentionName',
      offset: 0,
      length: 3,
      user_id: 42n,
    })
  })

  it('reads a code block, with and without a language', () => {
    const named = fromHtml('<pre><code class="language-ts">const x = 1</code></pre>')
    const bare = fromHtml('<pre>plain</pre>')

    // The pair is one entity: the range is the outer tag's and the language is
    // on the inner one.
    expect(named.text).toBe('const x = 1')
    expect(named.entities).toEqual([
      { _: 'messageEntityPre', offset: 0, length: 11, language: 'ts' },
    ])
    expect(bare.entities).toEqual([{ _: 'messageEntityPre', offset: 0, length: 5, language: '' }])
  })

  it('reads a quote, and an expandable one', () => {
    expect(fromHtml('<blockquote>said</blockquote>').entities).toEqual([
      { _: 'messageEntityBlockquote', offset: 0, length: 4 },
    ])
    expect(fromHtml('<blockquote expandable>said</blockquote>').entities).toEqual([
      { _: 'messageEntityBlockquote', offset: 0, length: 4, collapsed: true },
    ])
  })

  it('reads a spoiler written as a span, and a custom emoji', () => {
    expect(shape(fromHtml('<span class="tg-spoiler">shh</span>').entities)).toEqual(['Spoiler@0+3'])
    expect(fromHtml('<tg-emoji emoji-id="5">x</tg-emoji>').entities).toEqual([
      { _: 'messageEntityCustomEmoji', offset: 0, length: 1, document_id: 5n },
    ])
  })

  it('resolves character references', () => {
    const read = fromHtml('<b>&lt;3</b> &amp; &#65;&#x42;')

    expect(read.text).toBe('<3 & AB')
    expect(shape(read.entities)).toEqual(['Bold@0+2'])
  })
})

describe('HTML that is not quite markup', () => {
  it('leaves arithmetic alone', () => {
    // `2 < 3` is a message, not a broken tag, and refusing it would be worse
    // than reading it as written.
    const read = fromHtml('2 < 3 and 4 > 3')

    expect(read.text).toBe('2 < 3 and 4 > 3')
    expect(read.entities).toEqual([])
  })

  it('leaves a tag it does not know in the text', () => {
    const read = fromHtml('a <marquee>b</marquee> c')

    expect(read.text).toBe('a <marquee>b</marquee> c')
    expect(read.entities).toEqual([])
  })

  it('runs an unclosed tag to the end', () => {
    const read = fromHtml('<b>to the end')

    expect(read.text).toBe('to the end')
    expect(shape(read.entities)).toEqual(['Bold@0+10'])
  })

  it('closes what is open inside a tag being closed', () => {
    const read = fromHtml('<b>bold <i>both</b> after')

    expect(read.text).toBe('bold both after')
    expect(shape(read.entities)).toEqual(['Bold@0+9', 'Italic@5+4'])
  })

  it('keeps a closing tag nothing opened', () => {
    const read = fromHtml('a </b> b')

    expect(read.text).toBe('a </b> b')
    expect(read.entities).toEqual([])
  })

  it('drops a range that marks nothing', () => {
    // An empty range formats nothing and is refused for the whole message, so
    // it is easier to write than to notice.
    expect(fromHtml('<b></b>text').entities).toEqual([])
  })

  it('ignores a link with no target and an emoji with no id', () => {
    expect(fromHtml('<a>text</a>').entities).toEqual([])
    expect(fromHtml('<tg-emoji>x</tg-emoji>').entities).toEqual([])
  })
})

describe('escaping what was interpolated', () => {
  it('escapes the values and not the markup, in HTML', () => {
    // The markup is written by the developer; the value came from a stranger,
    // and a user called `<b>` should not be able to format the message.
    const name = '<b>Robert</b>'
    const read = fromHtml`Hello, <b>${name}</b>!`

    expect(read.text).toBe('Hello, <b>Robert</b>!')
    expect(shape(read.entities)).toEqual(['Bold@7+13'])
  })

  it('escapes the values and not the markup, in Markdown', () => {
    const name = '*Robert*'
    const read = fromMarkdown`Hello, *${name}*!`

    expect(read.text).toBe('Hello, *Robert*!')
    expect(shape(read.entities)).toEqual(['Bold@7+8'])
  })

  it('escapes nothing when called with a plain string', () => {
    expect(shape(fromHtml('<b>x</b>').entities)).toEqual(['Bold@0+1'])
    expect(shape(fromMarkdown('*x*').entities)).toEqual(['Bold@0+1'])
  })
})

describe('reading Markdown', () => {
  it('reads each paired marker', () => {
    const read = fromMarkdown('*b* _i_ __u__ ~s~ ||p||')

    expect(read.text).toBe('b i u s p')
    expect(shape(read.entities)).toEqual([
      'Bold@0+1',
      'Italic@2+1',
      'Underline@4+1',
      'Strike@6+1',
      'Spoiler@8+1',
    ])
  })

  it('tells an underline from two italics', () => {
    // `__` has to be tried before `_`, or this reads as an empty italic either
    // side of the word.
    const read = fromMarkdown('__under__')

    expect(read.text).toBe('under')
    expect(shape(read.entities)).toEqual(['Underline@0+5'])
  })

  it('does not let an inner underscore close an underline early', () => {
    const read = fromMarkdown('__a_b__')

    expect(read.text).toBe('a_b')
    expect(shape(read.entities)).toEqual(['Underline@0+3'])
  })

  it('reads code, and takes no markup inside it', () => {
    const read = fromMarkdown('say `*not bold*` here')

    expect(read.text).toBe('say *not bold* here')
    expect(shape(read.entities)).toEqual(['Code@4+10'])
  })

  it('reads a fenced block, with and without a language', () => {
    expect(fromMarkdown('```ts\nconst x = 1\n```').entities).toEqual([
      { _: 'messageEntityPre', offset: 0, length: 12, language: 'ts' },
    ])
    expect(fromMarkdown('```\nplain\n```').entities).toEqual([
      { _: 'messageEntityPre', offset: 0, length: 6, language: '' },
    ])
  })

  it('reads a link, a mention and a custom emoji', () => {
    expect(fromMarkdown('[here](https://example.com)').entities).toEqual([
      { _: 'messageEntityTextUrl', offset: 0, length: 4, url: 'https://example.com' },
    ])
    expect(fromMarkdown('[Ada](tg://user?id=42)').entities).toEqual([
      { _: 'messageEntityMentionName', offset: 0, length: 3, user_id: 42n },
    ])
    expect(fromMarkdown('![x](tg://emoji?id=5)').entities).toEqual([
      { _: 'messageEntityCustomEmoji', offset: 0, length: 1, document_id: 5n },
    ])
  })

  it('formats inside a link label', () => {
    const read = fromMarkdown('[*bold* link](https://example.com)')

    expect(read.text).toBe('bold link')
    expect(shape(read.entities)).toEqual(['TextUrl@0+9', 'Bold@0+4'])
  })

  it('makes one quote out of a run of lines', () => {
    // Telegram shows a run of quoted lines as one quote, so reading each line
    // as its own would produce something that does not look like the markup.
    const read = fromMarkdown('>first\n>second\nafter')

    expect(read.text).toBe('first\nsecond\nafter')
    expect(shape(read.entities)).toEqual(['Blockquote@0+12'])
  })

  it('does not read a greater-than sign mid-sentence as a quote', () => {
    const read = fromMarkdown('4 > 3')

    expect(read.text).toBe('4 > 3')
    expect(read.entities).toEqual([])
  })

  it('takes a backslash as escaping whatever follows', () => {
    const read = fromMarkdown('\\*not bold\\* and \\\\')

    expect(read.text).toBe('*not bold* and \\')
    expect(read.entities).toEqual([])
  })

  it('leaves a marker that never closes in the text', () => {
    const read = fromMarkdown('2 * 3 = 6')

    expect(read.text).toBe('2 * 3 = 6')
    expect(read.entities).toEqual([])
  })
})

describe('writing markup back', () => {
  const cases: readonly (readonly [string, string])[] = [
    ['plain text', 'plain text'],
    ['<b>bold</b>', '*bold*'],
    ['<i>it</i> and <u>un</u>', '_it_ and __un__'],
    ['<s>gone</s> <tg-spoiler>shh</tg-spoiler>', '~gone~ ||shh||'],
    ['<b>outer <i>inner</i></b>', '*outer _inner_*'],
    ['<code>x = 1</code>', '`x = 1`'],
    ['<pre><code class="language-ts">const x = 1</code></pre>', '```ts\nconst x = 1```'],
    ['<a href="https://example.com">here</a>', '[here](https://example.com)'],
    ['<a href="tg://user?id=42">Ada</a>', '[Ada](tg://user?id=42)'],
    ['<tg-emoji emoji-id="5">x</tg-emoji>', '![x](tg://emoji?id=5)'],
    ['<blockquote>said</blockquote>', '>said'],
  ]

  it.each(cases)('writes %s as HTML and as Markdown', (html, markdown) => {
    const read = fromHtml(html)

    expect(toHtml(read)).toBe(html)
    expect(toMarkdown(read)).toBe(markdown)
  })

  it('escapes text on the way out, so the result reads back the same', () => {
    const read = { text: '2 < 3 & 4 > 3', entities: [] }

    expect(toHtml(read)).toBe('2 &lt; 3 &amp; 4 &gt; 3')
    expect(fromHtml(toHtml(read)).text).toBe(read.text)
  })

  it('escapes only a backtick and a backslash inside a code span, as the dialect says', () => {
    const read: FormattedText = {
      text: 'a\\b*c`d',
      entities: [{ _: 'messageEntityCode', offset: 0, length: 7 }],
    }

    expect(toMarkdown(read)).toBe('`a\\\\b*c\\`d`')
    expect(fromMarkdown(toMarkdown(read))).toEqual(read)
  })

  it('puts a marker on every line of a quote', () => {
    const read = fromMarkdown('>first\n>second')

    expect(toMarkdown(read)).toBe('>first\n>second')
  })

  it('leaves what the server finds on its own as plain text', () => {
    // Marking these up would change nothing about the message, and would show
    // tags to anything that read the result back.
    const found = {
      text: '@ada #tag 4165550000',
      entities: [
        { _: 'messageEntityMention' as const, offset: 0, length: 4 },
        { _: 'messageEntityHashtag' as const, offset: 5, length: 4 },
        { _: 'messageEntityPhone' as const, offset: 10, length: 10 },
      ],
    }

    expect(toHtml(found)).toBe('@ada #tag 4165550000')
    expect(toMarkdown(found)).toBe('@ada \\#tag 4165550000')
  })

  it('ignores a range that does not describe the text', () => {
    const wrong = {
      text: 'short',
      entities: [
        { _: 'messageEntityBold' as const, offset: 0, length: 99 },
        { _: 'messageEntityItalic' as const, offset: -1, length: 2 },
        { _: 'messageEntityCode' as const, offset: 0, length: 0 },
      ],
    }

    expect(toHtml(wrong)).toBe('short')
    expect(toMarkdown(wrong)).toBe('short')
  })

  it('writes a collapsed quote with its expandability mark in both dialects', () => {
    const read = fromHtml('<blockquote expandable>said</blockquote>')

    expect(toHtml(read)).toBe('<blockquote expandable>said</blockquote>')
    expect(toMarkdown(read)).toBe('>said||')
  })
})

describe('a round trip', () => {
  const markup = [
    '<b>bold</b> and <i>italic</i> and <u>under</u>',
    '<b>outer <i>inner</i> outer</b>',
    'text with <code>code</code> in it',
    '<blockquote>quoted <b>and bold</b></blockquote>',
    '<a href="https://example.com/a?b=c&amp;d=e">link</a>',
    'plain, with 2 &lt; 3',
  ]

  it.each(markup)('reads back to the same text and ranges: %s', (source) => {
    const once = fromHtml(source)
    const twice = fromHtml(toHtml(once))

    expect(twice.text).toBe(once.text)
    expect(twice.entities).toEqual(once.entities)
  })

  it.each(markup)('survives a trip through Markdown too: %s', (source) => {
    const once = fromHtml(source)
    const twice = fromMarkdown(toMarkdown(once))

    expect(twice.text).toBe(once.text)
    expect(twice.entities).toEqual(once.entities)
  })

  it('writes the same markup twice, rather than alternating between two forms', () => {
    const once = fromHtml('<b><i>both</i></b>')

    expect(toHtml(fromHtml(toHtml(once)))).toBe(toHtml(once))
    expect(toMarkdown(fromMarkdown(toMarkdown(once)))).toBe(toMarkdown(once))
  })
})

describe('text that is not plain ASCII', () => {
  it('counts offsets in UTF-16 code units, as Telegram does', () => {
    // An emoji outside the basic plane is two code units, and a JavaScript
    // string index is a code unit — so the two agree with no conversion, which
    // is the only reason this arithmetic is as simple as it looks.
    const read = fromHtml('🎉<b>after</b>')

    expect(read.text).toBe('🎉after')
    expect(shape(read.entities)).toEqual(['Bold@2+5'])
    expect(read.text.slice(2, 7)).toBe('after')
  })

  it('does not split a surrogate pair when writing markup back', () => {
    const read = fromHtml('<b>🎉</b> tail')

    expect(read.text).toBe('🎉 tail')
    expect(shape(read.entities)).toEqual(['Bold@0+2'])
    expect(toHtml(read)).toBe('<b>🎉</b> tail')
  })

  it('marks a range that starts inside an emoji sequence without corrupting it', () => {
    const read = {
      text: '🎉🎈',
      entities: [{ _: 'messageEntityBold' as const, offset: 2, length: 2 }],
    }

    expect(toHtml(read)).toBe('🎉<b>🎈</b>')
  })
})

describe('the cases where a near-miss reading is still plausible', () => {
  it('closes the innermost tag of a repeated name, not the first', () => {
    // `<b>a<b>b</b>c</b>` has two bolds open at once. Closing the outer one
    // first would end both ranges at the inner tag.
    const read = fromHtml('<b>a<b>b</b>c</b>')

    expect(read.text).toBe('abc')
    expect(shape(read.entities)).toEqual(['Bold@0+3', 'Bold@1+1'])
  })

  it('does not take a link that merely contains digits for a mention', () => {
    const read = fromHtml('<a href="https://example.com/page/42">here</a>')

    expect(read.entities).toEqual([
      {
        _: 'messageEntityTextUrl',
        offset: 0,
        length: 4,
        url: 'https://example.com/page/42',
      },
    ])
  })

  it('treats a span without the spoiler class as no formatting at all', () => {
    expect(fromHtml('<span>plain</span>').entities).toEqual([])
    expect(fromHtml('<span class="other">plain</span>').entities).toEqual([])
    expect(shape(fromHtml('<span class="tg-spoiler">shh</span>').entities)).toEqual(['Spoiler@0+3'])
  })

  it('does not let a double underscore close an italic halfway', () => {
    // The dialect reads `__` greedily, left to right, as the beginning or end
    // of an underline — never as two italic markers. So the italic runs to the
    // final underscore, and the `__` inside it opens an underline that never
    // closes and stays in the text.
    const read = fromMarkdown('_a__b_')

    expect(read.text).toBe('a__b')
    expect(shape(read.entities)).toEqual(['Italic@0+4'])
  })

  it('does not let a marker inside a code span close a range around it', () => {
    // The `*` inside the backticks is code, not markup. Closing the bold on it
    // would end the range early and slice the code span in half.
    const read = fromMarkdown('*bold `a*b` more*')

    expect(read.text).toBe('bold a*b more')
    expect(shape(read.entities)).toEqual(['Bold@0+13', 'Code@5+3'])
  })

  it('does not take a first line with spaces in it as a language', () => {
    // A language is one word. A first line of prose is the first line of the
    // code, and swallowing it would lose it from the message.
    const read = fromMarkdown('```const x = 1\nmore\n```')

    expect(read.text).toBe('const x = 1\nmore\n')
    expect(read.entities).toEqual([{ _: 'messageEntityPre', offset: 0, length: 17, language: '' }])
  })
})

describe('markers with nothing between them', () => {
  it('consumes an empty bold pair, which is the separator the dialect names', () => {
    // `**` is a genuine pair of bold markers with nothing between them, and the
    // dialect uses one to keep two adjacent blockquotes from reading as a
    // single quote. A reader that kept the two characters would put them in the
    // message.
    expect(fromMarkdown('a**b').text).toBe('ab')
    expect(fromMarkdown('a**b').entities).toEqual([])
  })

  it('does not extend that to a double underscore, which is one token', () => {
    // `__` is not two `_` markers. It is read greedily as an underline, and one
    // that never closes stays in the text rather than collapsing away.
    expect(fromMarkdown('a__b').text).toBe('a__b')
    expect(fromMarkdown('a__b').entities).toEqual([])
  })

  it('leaves a marker with no closing partner alone', () => {
    // `||` here opens a spoiler that never closes, which is not a pair at all.
    expect(fromMarkdown('a||b').text).toBe('a||b')
  })

  it('keeps such text intact when it is written rather than parsed', () => {
    // The dialect requires these characters to be escaped in prose, and
    // `toMarkdown` escapes them — so text saying `a__b` survives the trip even
    // though markup saying `a__b` means something else.
    for (const text of ['a__b', 'a**b', '2 * 3 = 6', 'pipes || here']) {
      expect(fromMarkdown(toMarkdown({ text, entities: [] })).text).toBe(text)
    }
  })

  it('still reads a real pair that follows one', () => {
    const read = fromMarkdown('a**b and *bold*')

    expect(read.text).toBe('ab and bold')
    expect(shape(read.entities)).toEqual(['Bold@7+4'])
  })
})

describe('block quotations, ordinary and expandable', () => {
  it('reads a run of quoted lines as one quote', () => {
    const read = fromMarkdown('>first\n>second\n>third')

    expect(read.text).toBe('first\nsecond\nthird')
    expect(read.entities).toEqual([{ _: 'messageEntityBlockquote', offset: 0, length: 18 }])
  })

  it('reads a trailing mark as the expandable form', () => {
    // The mark is not part of what the quote says, so it comes off the text.
    const read = fromMarkdown('>hidden below||')

    expect(read.text).toBe('hidden below')
    expect(read.entities).toEqual([
      { _: 'messageEntityBlockquote', offset: 0, length: 12, collapsed: true },
    ])
  })

  it('marks the whole run expandable from a mark on its last line only', () => {
    const read = fromMarkdown('>one\n>two\n>three||')

    expect(read.text).toBe('one\ntwo\nthree')
    expect(read.entities).toEqual([
      { _: 'messageEntityBlockquote', offset: 0, length: 13, collapsed: true },
    ])
  })

  it('separates two adjacent quotes with an empty bold entity', () => {
    // Without the `**` the two runs are one quote. The empty entity contributes
    // nothing to the message and exists only to break them apart.
    const read = fromMarkdown('>first\n**>second')

    expect(read.text).toBe('first\nsecond')
    expect(read.entities).toEqual([
      { _: 'messageEntityBlockquote', offset: 0, length: 5 },
      { _: 'messageEntityBlockquote', offset: 6, length: 6 },
    ])
  })

  it('runs a plain quote into an expandable one', () => {
    const read = fromMarkdown('>plain\n**>expandable||')

    expect(read.text).toBe('plain\nexpandable')
    expect(read.entities).toEqual([
      { _: 'messageEntityBlockquote', offset: 0, length: 5 },
      { _: 'messageEntityBlockquote', offset: 6, length: 10, collapsed: true },
    ])
  })

  it('separates three in a row', () => {
    const read = fromMarkdown('>one\n**>two\n**>three||')

    expect(shape(read.entities)).toEqual(['Blockquote@0+3', 'Blockquote@4+3', 'Blockquote@8+5'])
    expect(read.entities[2]).toMatchObject({ collapsed: true })
  })

  it('does not merge two quotes separated by ordinary text', () => {
    const read = fromMarkdown('>one\nbetween\n>two')

    expect(read.text).toBe('one\nbetween\ntwo')
    expect(shape(read.entities)).toEqual(['Blockquote@0+3', 'Blockquote@12+3'])
  })

  it('formats inside a quote', () => {
    const read = fromMarkdown('>said *loudly* and `in code`')

    expect(read.text).toBe('said loudly and in code')
    expect(shape(read.entities)).toEqual(['Blockquote@0+23', 'Bold@5+6', 'Code@16+7'])
  })

  it('tells the expandability mark from a spoiler that ends the line', () => {
    // `||` closes a spoiler too. A spoiler ending the last quoted line leaves
    // two pipes; a quote also marked expandable leaves four.
    const spoiler = fromMarkdown('>ends with ||shh||')
    const both = fromMarkdown('>ends with ||shh||||')

    expect(spoiler.text).toBe('ends with shh')
    expect(spoiler.entities).toEqual([
      { _: 'messageEntityBlockquote', offset: 0, length: 13 },
      { _: 'messageEntitySpoiler', offset: 10, length: 3 },
    ])

    expect(both.text).toBe('ends with shh')
    expect(both.entities).toEqual([
      { _: 'messageEntityBlockquote', offset: 0, length: 13, collapsed: true },
      { _: 'messageEntitySpoiler', offset: 10, length: 3 },
    ])
  })

  it('does not read an escaped mark as expandability', () => {
    const read = fromMarkdown('>ends with a pipe \\|\\|')

    expect(read.text).toBe('ends with a pipe ||')
    expect(read.entities).toEqual([{ _: 'messageEntityBlockquote', offset: 0, length: 19 }])
  })

  it('counts offsets in UTF-16 code units inside a quote', () => {
    const read = fromMarkdown('>🎉 *after*||')

    expect(read.text).toBe('🎉 after')
    // The emoji is two code units, so the bold range starts at 3 and not at 2.
    expect(shape(read.entities)).toEqual(['Blockquote@0+8', 'Bold@3+5'])
    expect(read.text.slice(3, 8)).toBe('after')
  })

  it('writes both forms back, and reads them again unchanged', () => {
    const sources = [
      '>plain',
      '>expandable||',
      '>first\n**>second',
      '>plain\n**>expandable||',
      '>one\n**>two\n**>three||',
      '>one\nbetween\n>two',
      '>said *loudly*||',
      '>ends with ||shh||||',
    ]

    for (const source of sources) {
      const once = fromMarkdown(source)
      const twice = fromMarkdown(toMarkdown(once))

      expect(twice.text).toBe(once.text)
      expect(twice.entities).toEqual(once.entities)
    }
  })

  it('crosses between the two dialects without losing the flag', () => {
    const fromMd = fromMarkdown('>plain\n**>hidden||')

    expect(toHtml(fromMd)).toBe(
      '<blockquote>plain</blockquote>\n<blockquote expandable>hidden</blockquote>',
    )

    const back = fromHtml(toHtml(fromMd))

    expect(back.text).toBe(fromMd.text)
    expect(back.entities).toEqual(fromMd.entities)
    expect(toMarkdown(back)).toBe('>plain\n**>hidden||')
  })

  it('takes markup that opens a quote and never finishes it', () => {
    // A lone `>` at the end, a mark with no quote, and a mark on a line that is
    // not quoted at all. None of these should throw or eat the text.
    expect(fromMarkdown('>').text).toBe('')
    expect(fromMarkdown('text||').text).toBe('text||')
    expect(fromMarkdown('>\n>').text).toBe('\n')
    expect(fromMarkdown('||').text).toBe('||')
  })
})

describe('quote shapes the dialect cannot express', () => {
  it('puts the expandability mark on the quote that ended, before the next one opens', () => {
    // Two quotes with nothing between them is not something the dialect can
    // write — `**>` opens a quote only at the start of a line, and there is no
    // line here to start. What it can still get right is whose mark is whose:
    // the `||` belongs to the quote that just ended and has to precede the
    // separator, or it reads as part of the one beginning.
    const value: FormattedText = {
      text: 'ab',
      entities: [
        { _: 'messageEntityBlockquote', offset: 0, length: 1, collapsed: true },
        { _: 'messageEntityBlockquote', offset: 1, length: 1 },
      ],
    }

    expect(toMarkdown(value)).toBe('>a||**>b')
  })

  it('writes the same pair in HTML, where it round-trips', () => {
    // HTML has a closing tag, so the shape the other dialect cannot express is
    // ordinary here.
    const value: FormattedText = {
      text: 'ab',
      entities: [
        { _: 'messageEntityBlockquote', offset: 0, length: 1, collapsed: true },
        { _: 'messageEntityBlockquote', offset: 1, length: 1 },
      ],
    }

    const written = toHtml(value)

    expect(written).toBe('<blockquote expandable>a</blockquote><blockquote>b</blockquote>')
    expect(fromHtml(written).entities).toEqual(value.entities)
  })
})

describe('the cases the dialect specifies by name', () => {
  // Expectations written from the specification rather than from what this
  // parser produces, and stated as text plus ranges rather than as a round
  // trip — a parser and a serializer can agree with each other and both be
  // wrong.

  it('reads the ambiguous form the specification gives an answer for', () => {
    // `___italic underline___` is the ambiguous spelling; the dialect says to
    // write it with an empty bold entity separating the two closers. Both
    // ranges cover the whole text.
    const read = fromMarkdown('___italic underline_**__')

    expect(read.text).toBe('italic underline')
    expect(read.entities).toEqual([
      { _: 'messageEntityItalic', offset: 0, length: 16 },
      { _: 'messageEntityUnderline', offset: 0, length: 16 },
    ])
  })

  it('reads a double underscore greedily, left to right', () => {
    // Not two italics either side of `a_b`: one underline containing it.
    const read = fromMarkdown('__a_b__')

    expect(read.text).toBe('a_b')
    expect(read.entities).toEqual([{ _: 'messageEntityUnderline', offset: 0, length: 3 }])
  })

  it('leaves an underline that never closes in the text', () => {
    for (const source of ['a__b', '__unclosed', 'trailing__']) {
      expect(fromMarkdown(source).text).toBe(source)
      expect(fromMarkdown(source).entities).toEqual([])
    }
  })

  it('treats an escaped delimiter as an ordinary character', () => {
    // Any character between 1 and 126 may be escaped anywhere, and is then not
    // part of the markup.
    const read = fromMarkdown(String.raw`\_\_not underline\_\_ and \*not bold\*`)

    expect(read.text).toBe('__not underline__ and *not bold*')
    expect(read.entities).toEqual([])
  })

  it('reads each simple form the specification lists', () => {
    const read = fromMarkdown('*b* _i_ __u__ ~s~ ||p|| `c`')

    expect(read.text).toBe('b i u s p c')
    expect(read.entities).toEqual([
      { _: 'messageEntityBold', offset: 0, length: 1 },
      { _: 'messageEntityItalic', offset: 2, length: 1 },
      { _: 'messageEntityUnderline', offset: 4, length: 1 },
      { _: 'messageEntityStrike', offset: 6, length: 1 },
      { _: 'messageEntitySpoiler', offset: 8, length: 1 },
      { _: 'messageEntityCode', offset: 10, length: 1 },
    ])
  })
})

/** Which kinds cover each character, so two readings can be compared position by position. */
function formattingByCharacter(value: FormattedText): string[] {
  return Array.from({ length: value.text.length }, (_, at) =>
    value.entities
      .filter((entity) => at >= entity.offset && at < entity.offset + entity.length)
      .map((entity) => entity._)
      .sort()
      .join(','),
  )
}

/** What two independent parsers can be compared on: kind, range and the one value that matters. */
function comparable(entity: Entity): string {
  const detail = entity.url ?? entity.user?.id ?? entity.custom_emoji_id ?? entity.language ?? ''

  return `${entity.type}@${entity.offset}+${entity.length}${detail === '' ? '' : `:${detail}`}`
}

const values = (entities: readonly Entity[]): string[] => entities.map(comparable).sort()

describe('what reaches an attribute through interpolation', () => {
  it('cannot end the attribute and add one of its own', () => {
    const path = 'x" href="https://attacker.example/'
    const read = fromHtml`<a href="https://example.com/${path}">here</a>`

    expect(read.entities).toEqual([
      {
        _: 'messageEntityTextUrl',
        offset: 0,
        length: 4,
        url: 'https://example.com/x" href="https://attacker.example/',
      },
    ])
  })

  it('keeps a quote in text as the quote it was', () => {
    expect(fromHtml`<b>${`it's "quoted"`}</b>`.text).toBe(`it's "quoted"`)
  })

  it('writes an address with a quote in it so it reads back whole', () => {
    const value: FormattedText = {
      text: 'here',
      entities: [{ _: 'messageEntityTextUrl', offset: 0, length: 4, url: 'https://a.example/"x' }],
    }

    expect(fromHtml(toHtml(value))).toEqual(value)
  })

  it('leaves text as written where an emoji id or a reference names nothing', () => {
    const read = fromHtml('<tg-emoji emoji-id="not-a-number">x</tg-emoji> &#x110000;')

    expect(read).toEqual({ text: 'x &#x110000;', entities: [] })
  })
})

describe("a link's address in Markdown", () => {
  it('arrives as it was interpolated, with nothing of the escaping left in it', () => {
    const url = 'https://example.com/a_b-c.d?x=1&y=(2)'
    const read = fromMarkdown`[site](${url})`

    expect(read.entities).toEqual([{ _: 'messageEntityTextUrl', offset: 0, length: 4, url }])
  })

  it('is written with its closing parenthesis and backslashes escaped', () => {
    const value: FormattedText = {
      text: 'wiki',
      entities: [
        {
          _: 'messageEntityTextUrl',
          offset: 0,
          length: 4,
          url: 'https://en.wikipedia.org/wiki/Set_(mathematics)\\x',
        },
      ],
    }

    expect(toMarkdown(value)).toBe('[wiki](https://en.wikipedia.org/wiki/Set_(mathematics\\)\\\\x)')
    expect(fromMarkdown(toMarkdown(value))).toEqual(value)
  })

  it('reads an escaped backtick inside code as a backtick', () => {
    expect(fromMarkdown('`a\\`b`')).toEqual({
      text: 'a`b',
      entities: [{ _: 'messageEntityCode', offset: 0, length: 3 }],
    })
  })
})

describe('ranges that cross', () => {
  const crossing: FormattedText = {
    text: 'abcdefgh',
    entities: [
      { _: 'messageEntityBold', offset: 0, length: 5 },
      { _: 'messageEntityItalic', offset: 3, length: 5 },
      { _: 'messageEntityTextUrl', offset: 2, length: 4, url: 'https://example.com/' },
    ],
  }

  it('come back from HTML with every character formatted as it was', () => {
    const written = toHtml(crossing)

    expect(formattingByCharacter(fromHtml(written))).toEqual(formattingByCharacter(crossing))
  })

  it('come back from Markdown with every character formatted as it was', () => {
    const written = toMarkdown(crossing)

    expect(formattingByCharacter(fromMarkdown(written))).toEqual(formattingByCharacter(crossing))
  })
})

describe('against the independent parsers in @yuigram/core/format', () => {
  const markdown = [
    '*bold* _italic_ __underline__ ~strike~ ||spoiler||',
    '*bold _italic bold_ bold*',
    '`co\\`de` and ```js\nlet a = 1\n```',
    '[link](https://example.com/a\\)b) [me](tg://user?id=42) ![👍](tg://emoji?id=5368324170671202286)',
    '>quoted line\n>second line\nafter',
    '>shown\n>hidden||',
    'escaped \\*not bold\\* and a\\_b',
  ]

  it.each(markdown)('reads MarkdownV2 the same: %s', (source) => {
    const here = fromMarkdown(source)
    const there = parseMarkdown(source)

    expect(here.text).toBe(there.text)
    expect(values(fromTlEntities(here.entities))).toEqual(values(there.entities))
  })

  const html = [
    '<b>bold</b> <i>it</i> <u>u</u> <s>s</s> <tg-spoiler>sp</tg-spoiler> <code>c</code>',
    '<pre><code class="language-js">let a = 1</code></pre>',
    '<a href="https://example.com/?a=1&amp;b=2">link</a> <a href="tg://user?id=42">me</a> <tg-emoji emoji-id="5368324170671202286">👍</tg-emoji>',
    '<blockquote>q</blockquote>\n<blockquote expandable>hidden</blockquote>',
    '<b>bold <i>both</i></b> &lt;tag&gt; &amp; &quot;q&quot;',
  ]

  it.each(html)('reads HTML the same: %s', (source) => {
    const here = fromHtml(source)
    const there = parseHtml(source)

    expect(here.text).toBe(there.text)
    expect(values(fromTlEntities(here.entities))).toEqual(values(there.entities))
  })

  const hostile = [
    '</b><a href="https://attacker.example/">x</a>',
    'x" href="https://attacker.example/',
    '*_[]()~`>#+-=|{}.!\\',
    '&amp; &lt; 👍🏽',
  ]

  it.each(hostile)('keeps an interpolated value as text in both dialects: %s', (value) => {
    for (const read of [fromHtml`<b>${value}</b>`, fromMarkdown`*${value}*`]) {
      expect(read).toEqual({
        text: value,
        entities: [{ _: 'messageEntityBold', offset: 0, length: value.length }],
      })
    }
  })
})
