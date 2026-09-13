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

import { describe, expect, it } from 'vitest'
import type { FormattedText } from '../src/format/index.js'
import { fromHtml, fromMarkdown, toHtml, toMarkdown } from '../src/format/index.js'
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

  it('does not escape inside a code span, where a backslash is a backslash', () => {
    const read: FormattedText = {
      text: 'a\\b*c',
      entities: [{ _: 'messageEntityCode', offset: 0, length: 5 }],
    }

    expect(toMarkdown(read)).toBe('`a\\b*c`')
    expect(fromMarkdown(toMarkdown(read)).text).toBe('a\\b*c')
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

  it('writes a collapsed quote as an ordinary one in Markdown, and keeps it in HTML', () => {
    // The dialect's marker for a collapsed quote could not be confirmed against
    // Telegram's own documentation, and guessing would produce messages that
    // look right here and wrong on a phone. HTML keeps the flag.
    const read = fromHtml('<blockquote expandable>said</blockquote>')

    expect(toHtml(read)).toBe('<blockquote expandable>said</blockquote>')
    expect(toMarkdown(read)).toBe('>said')
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
    // Reaching a `__` while looking for the `_` that closes an italic is the
    // one place the two markers are genuinely ambiguous.
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
  it('leaves them in the text rather than deleting them', () => {
    // Consuming an empty pair would delete both markers from a message that
    // meant to say them.
    for (const source of ['a__b', 'a**b', 'a||b']) {
      expect(fromMarkdown(source).text).toBe(source)
    }
  })

  it('still reads a real pair that follows one', () => {
    const read = fromMarkdown('a__b and *bold*')

    expect(read.text).toBe('a__b and bold')
    expect(shape(read.entities)).toEqual(['Bold@9+4'])
  })
})
