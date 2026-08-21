/**
 * Media sources and text formatting.
 *
 * Both exist to prevent a specific production failure. An unescaped name breaks
 * a reply with `can't parse entities`, from a call that has nothing to do with
 * formatting; and a media source that reads eagerly opens a file handle for
 * every attachment a handler considered and did not send.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ValidationError } from '@yuigram/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { escapeHtml, escapeMarkdown, escapeMarkdownV2, html, md, raw } from '../src/format.js'
import { encodeRequest, hasUpload } from '../src/http/multipart.js'
import { hasStreamingUpload } from '../src/http/stream-multipart.js'
import { isInputFile, NonReplayableUploadError } from '../src/input-file.js'
import { media } from '../src/media.js'

describe('escaping', () => {
  it('escapes what HTML parse mode reads as markup', () => {
    expect(escapeHtml('<b>&</b>')).toBe('&lt;b&gt;&amp;&lt;/b&gt;')
  })

  it('leaves what HTML mode does not treat specially', () => {
    // Escaping quotes would show entities to the reader, since Telegram's HTML
    // subset does not need them outside attributes.
    expect(escapeHtml(`it's "fine"`)).toBe(`it's "fine"`)
  })

  it('escapes every character MarkdownV2 reserves', () => {
    expect(escapeMarkdownV2('a_b*c[d]e(f)~g`h>i#j+k-l=m|n{o}p.q!r')).toBe(
      'a\\_b\\*c\\[d\\]e\\(f\\)\\~g\\`h\\>i\\#j\\+k\\-l\\=m\\|n\\{o\\}p\\.q\\!r',
    )
  })

  it('escapes the legacy mode conservatively', () => {
    expect(escapeMarkdown('a_b*c`d[e')).toBe('a\\_b\\*c\\`d\\[e')
  })
})

describe('templates', () => {
  it('escapes what is interpolated and leaves the markup alone', () => {
    // The right way round: the markup is written by the developer, the value
    // comes from a stranger.
    const name = '<script>'

    expect(html`Hello, <b>${name}</b>!`).toBe('Hello, <b>&lt;script&gt;</b>!')
  })

  it('escapes MarkdownV2 interpolations', () => {
    expect(md`*${'a_b'}*`).toBe('*a\\_b*')
  })

  it('stringifies whatever it is given', () => {
    expect(html`${42} ${true}`).toBe('42 true')
  })

  it('splices already-formatted text without escaping it twice', () => {
    const link = html`<a href="https://example.com">${'A & B'}</a>`

    expect(html`Read ${raw(link)}`).toBe('Read <a href="https://example.com">A &amp; B</a>')
  })

  it('handles a template with no interpolation at all', () => {
    expect(html`plain`).toBe('plain')
  })
})

describe('media sources', () => {
  let directory = ''
  let file = ''

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'yuigram-media-'))
    file = join(directory, 'note.txt')
    await writeFile(file, 'hello from disk')
  })

  afterAll(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('describes a file without opening it', () => {
    // Building a source is free; the handle is taken when the request is
    // encoded, so a handler that returns early never touches the disk.
    const source = media.path(join(directory, 'does-not-exist.txt'))

    expect(source.filename).toBe('does-not-exist.txt')
    expect(isInputFile(source)).toBe(true)
  })

  it('streams the bytes when the request is encoded', async () => {
    const encoded = await encodeRequest({ chat_id: 1, document: media.path(file) })

    // A file on disk takes the streaming envelope, so the bytes never all sit
    // in memory at once. See streaming-upload.test.ts for that property.
    expect(encoded.body).toBeInstanceOf(ReadableStream)

    const written = await new Response(encoded.body as ReadableStream<Uint8Array>).text()
    expect(written).toContain('hello from disk')
    expect(written).toContain('filename="note.txt"')
  })

  it('takes the filename from the path, or from the caller', () => {
    expect(media.path('/tmp/a/b/cat.jpg').filename).toBe('cat.jpg')
    expect(media.path('cat.jpg', { filename: 'renamed.jpg' }).filename).toBe('renamed.jpg')
  })

  it('refuses an empty path', () => {
    expect(() => media.path('')).toThrow(ValidationError)
  })

  it('returns a URL as the string Telegram expects', () => {
    expect(media.url('https://example.com/cat.jpg')).toBe('https://example.com/cat.jpg')
    expect(media.url(new URL('https://example.com/cat.jpg'))).toBe('https://example.com/cat.jpg')
  })

  it('refuses something that is not a URL', () => {
    // The common mistake is a local path, which Telegram would try to fetch.
    expect(() => media.url('./cat.jpg')).toThrow(ValidationError)
    expect(() => media.url('ftp://example.com/cat.jpg')).toThrow(ValidationError)
  })

  it('returns a file_id as itself', () => {
    expect(media.id('AgACAgIAAx')).toBe('AgACAgIAAx')
    expect(() => media.id('')).toThrow(ValidationError)
  })

  it('wraps bytes, text and JSON', async () => {
    expect(media.buffer(new Uint8Array([1, 2]), 'a.bin').filename).toBe('a.bin')

    const note = media.text('hi', 'note.txt')
    expect(note.contentType).toBe('text/plain; charset=utf-8')
    expect(new TextDecoder().decode(note.data as Uint8Array)).toBe('hi')

    const config = media.json({ a: 1 })
    expect(config.filename).toBe('file.json')
    expect(JSON.parse(new TextDecoder().decode(config.data as Uint8Array))).toEqual({ a: 1 })
  })

  it('wraps a stream', () => {
    async function* bytes(): AsyncGenerator<Uint8Array> {
      yield new Uint8Array([1])
    }

    expect(
      media.stream(bytes(), 'a.bin', { contentType: 'application/octet-stream' }),
    ).toMatchObject({ filename: 'a.bin', contentType: 'application/octet-stream' })
  })

  it('is recognised as an upload, so the request becomes multipart', async () => {
    const encoded = await encodeRequest({
      chat_id: 1,
      photo: media.buffer(new Uint8Array([1, 2, 3]), 'cat.jpg'),
    })

    expect(encoded.body).toBeInstanceOf(FormData)
  })

  it('keeps a URL source out of multipart, since it is only a string', async () => {
    const encoded = await encodeRequest({
      chat_id: 1,
      photo: media.url('https://example.com/cat.jpg'),
    })

    expect(encoded.body).not.toBeInstanceOf(FormData)
  })
})

describe('replay safety', () => {
  let directory = ''
  let file = ''

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'yuigram-replay-'))
    file = join(directory, 'note.txt')
    await writeFile(file, 'hello from disk')
  })

  afterAll(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('re-encodes a file from disk, so a retry sends the bytes again', async () => {
    // `retryOnFloodWait` calls the request again, and each attempt encodes
    // afresh. A source that cannot produce its bytes twice would silently
    // upload nothing the second time.
    const source = media.path(file)

    const first = await new Response(
      (await encodeRequest({ document: source })).body as ReadableStream<Uint8Array>,
    ).text()
    const second = await new Response(
      (await encodeRequest({ document: source })).body as ReadableStream<Uint8Array>,
    ).text()

    expect(first).toContain('hello from disk')
    expect(second).toContain('hello from disk')
  })

  it('refuses to re-encode a stream rather than sending an empty file', async () => {
    async function* once(): AsyncGenerator<Uint8Array> {
      yield new TextEncoder().encode('payload')
    }

    const source = media.stream(once(), 'note.txt')

    const first = await new Response(
      (await encodeRequest({ document: source })).body as ReadableStream<Uint8Array>,
    ).text()
    expect(first).toContain('payload')

    // Fails where the caller is awaiting the call, not later inside a body the
    // transport is already writing.
    await expect(encodeRequest({ document: source })).rejects.toBeInstanceOf(
      NonReplayableUploadError,
    )
  })

  it('names the file and says how to make the upload retryable', async () => {
    async function* once(): AsyncGenerator<Uint8Array> {
      yield new Uint8Array([1])
    }

    const source = media.stream(once(), 'video.mp4')
    await encodeRequest({ document: source })

    await expect(encodeRequest({ document: source })).rejects.toThrow(
      /video\.mp4[\s\S]*consumed by the first attempt[\s\S]*factory/,
    )
  })

  it('replays a stream built by a factory', async () => {
    async function* once(): AsyncGenerator<Uint8Array> {
      yield new TextEncoder().encode('payload')
    }

    const source = media.stream(() => once(), 'note.txt')

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const written = await new Response(
        (await encodeRequest({ document: source })).body as ReadableStream<Uint8Array>,
      ).text()

      expect(written).toContain('payload')
    }
  })

  it('leaves buffered uploads replayable, as they always were', async () => {
    const source = media.buffer(new TextEncoder().encode('bytes'), 'a.bin')

    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect((await encodeRequest({ document: source })).body).toBeInstanceOf(FormData)
    }
  })

  it('does not count inspecting a source as consuming it', async () => {
    // Choosing between the buffered and streaming paths reads `data`. A guard
    // that fired on inspection would reject the *first* attempt.
    async function* once(): AsyncGenerator<Uint8Array> {
      yield new TextEncoder().encode('payload')
    }

    const source = media.stream(once(), 'note.txt')

    expect(hasUpload({ document: source })).toBe(true)
    expect(hasStreamingUpload({ document: source })).toBe(true)

    const written = await new Response(
      (await encodeRequest({ document: source })).body as ReadableStream<Uint8Array>,
    ).text()

    expect(written).toContain('payload')
  })
})
