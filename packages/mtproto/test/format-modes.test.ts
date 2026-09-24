/**
 * The account formatters beyond the basic dialects: tag spellings, dates,
 * interpolated formatted values, link forms, whitespace, parse modes and
 * writing back — and a formatted message all the way to the request a
 * datacenter decodes.
 *
 * Fixtures are written out by hand. Where a case reads markup back after
 * writing it, it also states the expected entities, so a writer and a reader
 * that agreed on something wrong would still fail.
 */

import { MarkupParseError, PeerError } from '@yuigram/core'
import { bold as sharedBold, italic as sharedItalic } from '@yuigram/core/format'
import { describe, expect, it } from 'vitest'
import { fromHtml, toHtml } from '../src/format/html.js'
import { fromMarkdown, toMarkdown } from '../src/format/markdown.js'
import { type FormattedText, joinText } from '../src/format/text.js'
import type { TlValue } from '../src/tl/index.js'
import { type MockAccount, mockAccount } from './support/mock-account.js'

const strictHtml = fromHtml.with({ mode: 'strict' })
const partialHtml = fromHtml.with({ mode: 'partial' })
const strictMd = fromMarkdown.with({ mode: 'strict' })
const partialMd = fromMarkdown.with({ mode: 'partial' })

/** The error a call raised, for a case that reads its fields. */
function failure(run: () => unknown): MarkupParseError {
  try {
    run()
  } catch (error) {
    if (error instanceof MarkupParseError) return error
    throw error
  }
  throw new Error('nothing was raised')
}

describe('tag spellings', () => {
  it('reads every spelling of a spoiler, an emoji and a collapsed quote', () => {
    expect(fromHtml('<spoiler>x</spoiler>').entities).toEqual([
      { _: 'messageEntitySpoiler', offset: 0, length: 1 },
    ])
    expect(fromHtml('<emoji id="-42">😀</emoji>').entities).toEqual([
      { _: 'messageEntityCustomEmoji', offset: 0, length: 2, document_id: -42n },
    ])
    expect(fromHtml('<blockquote collapsible>q</blockquote>').entities).toEqual([
      { _: 'messageEntityBlockquote', offset: 0, length: 1, collapsed: true },
    ])
  })

  it('closes a tag with any spelling of the same tag', () => {
    expect(fromHtml('<b>bold</strong> <em>it</i> <s>x</del>')).toEqual({
      text: 'bold it x',
      entities: [
        { _: 'messageEntityBold', offset: 0, length: 4 },
        { _: 'messageEntityItalic', offset: 5, length: 2 },
        { _: 'messageEntityStrike', offset: 8, length: 1 },
      ],
    })
  })

  it('reads <br> as a line break, however it is written', () => {
    expect(fromHtml('a<br>b<br/>c<BR />d').text).toBe('a\nb\nc\nd')
  })

  it('leaves an emoji whose identifier is not a number as its text, without throwing', () => {
    expect(fromHtml('<tg-emoji emoji-id="abc">x</tg-emoji>')).toEqual({ text: 'x', entities: [] })
    expect(failure(() => strictHtml('<tg-emoji emoji-id="abc">x</tg-emoji>')).message).toMatch(
      /needs a numeric emoji-id at offset 0/,
    )
  })
})

describe('dates', () => {
  it('reads a moment and its format from either tag', () => {
    expect(fromHtml('<tg-time unix="1700000000" format="wDt">then</tg-time>').entities).toEqual([
      {
        _: 'messageEntityFormattedDate',
        offset: 0,
        length: 4,
        date: 1_700_000_000,
        day_of_week: true,
        long_date: true,
        short_time: true,
      },
    ])
    expect(fromHtml('<time datetime="2023-11-14T22:13:20Z" format="r">x</time>').entities).toEqual([
      {
        _: 'messageEntityFormattedDate',
        offset: 0,
        length: 1,
        date: 1_700_000_000,
        relative: true,
      },
    ])
  })

  it('refuses a moment or a format it cannot read, in a strict parse, and ignores it otherwise', () => {
    expect(fromHtml('<tg-time unix="soon">x</tg-time>')).toEqual({ text: 'x', entities: [] })
    expect(fromHtml('<tg-time unix="1" format="q">x</tg-time>')).toEqual({
      text: 'x',
      entities: [],
    })
    expect(failure(() => strictHtml('ok <tg-time unix="1" format="q">x</tg-time>')).offset).toBe(3)
  })

  it('reads and writes a date in Markdown', () => {
    const read = fromMarkdown('[in a week](tg://time?unix=1700000000&format=d)')
    expect(read.entities).toEqual([
      {
        _: 'messageEntityFormattedDate',
        offset: 0,
        length: 9,
        date: 1_700_000_000,
        short_date: true,
      },
    ])
    expect(toMarkdown(read)).toBe('[in a week](tg://time?unix=1700000000&format=d)')
    expect(toHtml(read)).toBe('<tg-time unix="1700000000" format="d">in a week</tg-time>')
    expect(fromHtml(toHtml(read))).toEqual(read)
  })
})

describe('interpolated values', () => {
  it('keeps the ranges of a formatted value, counted in UTF-16 units, inside the markup around it', () => {
    const name = fromHtml('<i>😀 Ada</i>')
    const message = fromHtml`<b>Hi ${name}!</b> ${'<b>not bold</b>'}`

    expect(message.text).toBe('Hi 😀 Ada! <b>not bold</b>')
    expect(message.entities).toEqual([
      { _: 'messageEntityBold', offset: 0, length: 10 },
      { _: 'messageEntityItalic', offset: 3, length: 6 },
    ])
  })

  it('takes a formatted value built by the shared formatter, converting its ranges', () => {
    const message = fromMarkdown`say ${sharedBold('loud')} and ${sharedItalic('soft')}`

    expect(message).toEqual({
      text: 'say loud and soft',
      entities: [
        { _: 'messageEntityBold', offset: 4, length: 4 },
        { _: 'messageEntityItalic', offset: 13, length: 4 },
      ],
    })
  })

  it('writes only the text of a value that lands in an address, escaped', () => {
    const link = fromHtml`<a href="https://example.com/${fromHtml('<b>a"b</b>')}">x</a>`
    expect(link.entities).toEqual([
      { _: 'messageEntityTextUrl', offset: 0, length: 1, url: 'https://example.com/a"b' },
    ])

    const md = fromMarkdown`[x](https://example.com/${'a)b'})`
    expect(md.entities).toEqual([
      { _: 'messageEntityTextUrl', offset: 0, length: 1, url: 'https://example.com/a)b' },
    ])
  })

  it('drops null, undefined and booleans, and keeps zero', () => {
    const missing: string | undefined = undefined

    expect(fromHtml`a${null}b${missing}c${false}d${true}e${0}`.text).toBe('abcde0')
  })

  it('keeps a value intact inside code and inside a link’s label', () => {
    expect(fromMarkdown`\`${'a*b_c'}\` [${'x*y'}](https://e.com)`).toEqual({
      text: 'a*b_c x*y',
      entities: [
        { _: 'messageEntityCode', offset: 0, length: 5 },
        { _: 'messageEntityTextUrl', offset: 6, length: 3, url: 'https://e.com' },
      ],
    })
  })

  it('joins formatted pieces, each keeping its ranges', () => {
    const joined = joinText(
      [fromHtml('<b>one</b>'), 'two', fromMarkdown('_three_')],
      fromHtml('<i>, </i>'),
    )

    expect(joined).toEqual({
      text: 'one, two, three',
      entities: [
        { _: 'messageEntityBold', offset: 0, length: 3 },
        { _: 'messageEntityItalic', offset: 3, length: 2 },
        { _: 'messageEntityItalic', offset: 8, length: 2 },
        { _: 'messageEntityItalic', offset: 10, length: 5 },
      ],
    })
  })
})

describe('link forms', () => {
  it('reads an address with no scheme as http, and a mention with its hash in the input form', () => {
    expect(fromHtml('<a href="//example.com/x">x</a>').entities).toEqual([
      { _: 'messageEntityTextUrl', offset: 0, length: 1, url: 'http://example.com/x' },
    ])

    const mention = {
      _: 'inputMessageEntityMentionName',
      offset: 0,
      length: 3,
      user_id: { _: 'inputUser', user_id: 5n, access_hash: -0x1fn },
    }
    expect(fromHtml('<a href="tg://user?id=5&amp;hash=-1f">Ada</a>').entities).toEqual([mention])
    expect(fromMarkdown('[Ada](tg://user?id=5&hash=-1f)').entities).toEqual([mention])
  })

  it('writes a mention with a hash back with it, and reads it back the same', () => {
    const value: FormattedText = {
      text: 'Ada',
      entities: [
        {
          _: 'inputMessageEntityMentionName',
          offset: 0,
          length: 3,
          user_id: { _: 'inputUser', user_id: 5n, access_hash: 0x7fffffffffffffffn },
        },
      ],
    }

    expect(toHtml(value)).toBe('<a href="tg://user?id=5&amp;hash=7fffffffffffffff">Ada</a>')
    expect(fromHtml(toHtml(value))).toEqual(value)
    expect(fromMarkdown(toMarkdown(value))).toEqual(value)
  })

  it('reads a negative custom emoji identifier in Markdown', () => {
    expect(fromMarkdown('![😀](tg://emoji?id=-5)').entities).toEqual([
      { _: 'messageEntityCustomEmoji', offset: 0, length: 2, document_id: -5n },
    ])
  })
})

describe('whitespace', () => {
  const collapsing = fromHtml.with({ whitespace: 'collapse' })

  it('collapses as a browser does, with <br> and &nbsp; for what stays', () => {
    const read = collapsing(`
      <b>Hello,</b>
         world!<br>
      Two&nbsp;&nbsp;spaces   <br>  end
    `)

    expect(read).toEqual({
      text: 'Hello, world!\nTwo  spaces\nend',
      entities: [{ _: 'messageEntityBold', offset: 0, length: 6 }],
    })
  })

  it('puts a collapsed space outside the tag that follows it', () => {
    expect(collapsing('a   <b>b</b>')).toEqual({
      text: 'a b',
      entities: [{ _: 'messageEntityBold', offset: 2, length: 1 }],
    })
  })

  it('keeps whitespace in code and in an interpolated value', () => {
    expect(collapsing`<code>a   b</code>  ${'x   y'}`.text).toBe('a   b x   y')
  })

  it('writes what the collapsing reader gives back', () => {
    const value: FormattedText = {
      text: ' two  spaces\nand a line \n',
      entities: [{ _: 'messageEntityItalic', offset: 1, length: 3 }],
    }
    const written = toHtml(value, { whitespace: 'collapse' })

    expect(written).toBe('&nbsp;<i>two</i>&nbsp;&nbsp;spaces<br>and a line&nbsp;<br>')
    expect(collapsing(written)).toEqual(value)
  })

  it('removes the indentation a template shares, in both dialects', () => {
    const html = fromHtml.with({ whitespace: 'dedent' })`
      <b>Title</b>
        indented ${'kept   as is'}
      last
    `
    expect(html.text).toBe('Title\n  indented kept   as is\nlast')

    const md = fromMarkdown.with({ whitespace: 'dedent' })`
      *Title*
      body
    `
    expect(md).toEqual({
      text: 'Title\nbody',
      entities: [{ _: 'messageEntityBold', offset: 0, length: 5 }],
    })
  })

  it('trims a Markdown message, moving its ranges with the text', () => {
    expect(fromMarkdown.with({ whitespace: 'trim' })('  \n *a* b  \n')).toEqual({
      text: 'a b',
      entities: [{ _: 'messageEntityBold', offset: 0, length: 1 }],
    })
  })
})

describe('parse modes', () => {
  it('refuses what is not well formed in a strict HTML parse, naming where', () => {
    const cases: readonly [string, RegExp, number][] = [
      ['a <x>b</x>', /<x> is not a tag this reads/, 2],
      ['a </b>', /<\/b> closes nothing/, 2],
      ['<b>open', /<b> is never closed/, 0],
      ['<b><i>x</b>', /<i> is still open/, 3],
      ['2 < 3', /a '<' that starts no tag/, 2],
      ['Tom & Jerry', /'& ' is not a character reference|'&' is not a character reference/, 4],
      ['&bogus;', /'&bogus;' is not a character reference/, 0],
    ]

    for (const [markup, message, offset] of cases) {
      const raised = failure(() => strictHtml(markup))
      expect(raised.message).toMatch(message)
      expect(raised.offset).toBe(offset)
      expect(raised.source).toBe(markup)
    }
  })

  it('reads the same markup leniently as before', () => {
    expect(fromHtml('a <x>b</x> </b> 2 < 3 & <b>open')).toEqual({
      text: 'a <x>b</x> </b> 2 < 3 & open',
      entities: [{ _: 'messageEntityBold', offset: 24, length: 4 }],
    })
    // A `<` that starts no tag is text, and does not take the next tag with it.
    expect(fromHtml('<pre>a < b</pre>')).toEqual({
      text: 'a < b',
      entities: [{ _: 'messageEntityPre', offset: 0, length: 5, language: '' }],
    })
  })

  it('holds back markup still arriving in a partial parse, and runs open ranges to the end', () => {
    expect(partialHtml('<b>hel')).toEqual({
      text: 'hel',
      entities: [{ _: 'messageEntityBold', offset: 0, length: 3 }],
    })
    expect(partialHtml('done <i').text).toBe('done ')
    expect(partialHtml('fish &am').text).toBe('fish ')
    expect(partialMd('*bol')).toEqual({
      text: 'bol',
      entities: [{ _: 'messageEntityBold', offset: 0, length: 3 }],
    })
    expect(partialMd('see [the do')).toEqual({ text: 'see the do', entities: [] })
    expect(partialMd('see [the docs](https://exa')).toEqual({ text: 'see the docs', entities: [] })
    expect(partialMd('`code in prog')).toEqual({
      text: 'code in prog',
      entities: [{ _: 'messageEntityCode', offset: 0, length: 12 }],
    })
  })

  it('refuses an unescaped reserved character in a strict Markdown parse, as the Bot API does', () => {
    expect(strictMd('Hello\\. *bold*')).toEqual({
      text: 'Hello. bold',
      entities: [{ _: 'messageEntityBold', offset: 7, length: 4 }],
    })

    const raised = failure(() => strictMd('Hello. *bold*'))
    expect(raised.message).toMatch(/'\.' is reserved/)
    expect(raised.offset).toBe(5)
    expect(failure(() => strictMd('*never closed')).offset).toBe(0)
    // The bold closes inside the link's label, which leaves the `[` it
    // opened with nothing to close it.
    const crossed = failure(() => strictMd('fine *but [x*](y)'))
    expect(crossed.message).toMatch(/'\[' is reserved/)
    expect(crossed.offset).toBe(10)
  })

  it('refuses a mode it does not know', () => {
    expect(() => fromHtml.with({ mode: 'loose' as never })).toThrow(/not a markup mode/)
  })
})

describe('writing HTML back', () => {
  it('passes a code block that names its language to the highlighter, and escapes everything else', () => {
    const value = fromHtml('<pre><code class="language-ts">a < b</code></pre> & <b>x</b>')
    const written = toHtml(value, {
      highlight: (code, language) =>
        `<span class="${language}">${code.replace('<', '&lt;')}</span>`,
    })

    expect(written).toBe(
      '<pre><code class="language-ts"><span class="ts">a &lt; b</span></code></pre> &amp; <b>x</b>',
    )
  })
})

/* ------------------------------------------------------------------------ */
/* To the wire                                                               */
/* ------------------------------------------------------------------------ */

async function connected(asked: TlValue[]): Promise<MockAccount> {
  const instance = mockAccount({
    api: (query) => {
      asked.push(query)
      if (query._ !== 'messages.sendMessage') return undefined

      return {
        _: 'updates',
        updates: [{ _: 'updateMessageID', id: 1, random_id: query['random_id'] }],
        users: [],
        chats: [],
        date: 1_700_000_000,
        seq: 0,
      }
    },
  })
  await instance.account.connect()
  await instance.account.peers.save({
    kind: 'user',
    id: 5n,
    accessHash: 55n,
    min: false,
    usernames: [],
  })

  return instance
}

describe('a formatted message, sent', () => {
  it('arrives at the datacenter as text, ranges and an addressed mention', async () => {
    const asked: TlValue[] = []
    const instance = await connected(asked)

    try {
      const name = fromMarkdown('*Ada*')
      await instance.account.sendText(
        { kind: 'user', id: 5n },
        fromHtml`Hi <a href="tg://user?id=5">${name}</a> 😀 <tg-time unix="1700000000">now</tg-time>`,
      )

      const sent = asked.find((query) => query._ === 'messages.sendMessage')
      // Decoded by the datacenter from the bytes the account serialized.
      expect(sent?.['message']).toBe('Hi Ada 😀 now')
      expect(sent?.['entities']).toEqual([
        { _: 'messageEntityBold', offset: 3, length: 3 },
        {
          _: 'inputMessageEntityMentionName',
          offset: 3,
          length: 3,
          user_id: { _: 'inputUser', user_id: 5n, access_hash: 55n },
        },
        { _: 'messageEntityFormattedDate', offset: 10, length: 3, date: 1_700_000_000 },
      ])
    } finally {
      await instance.dispose()
    }
  }, 30_000)

  it('refuses a mention of somebody the account has never seen, before anything is sent', async () => {
    const asked: TlValue[] = []
    const instance = await connected(asked)

    try {
      await expect(
        instance.account.sendText(
          { kind: 'user', id: 5n },
          fromHtml('<a href="tg://user?id=99">who</a>'),
        ),
      ).rejects.toThrow(PeerError)
      expect(asked.some((query) => query._ === 'messages.sendMessage')).toBe(false)
    } finally {
      await instance.dispose()
    }
  }, 30_000)
})
