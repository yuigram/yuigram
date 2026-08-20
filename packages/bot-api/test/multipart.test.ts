/**
 * Request encoding.
 *
 * The encoding decision is made from argument values rather than the schema,
 * because Telegram types `InputMedia.media` as `String` and documents
 * `attach://` uploads only in prose. These cases pin that behaviour down for
 * both the direct and the nested form.
 */

import { describe, expect, it } from 'vitest'
import { encodeRequest, hasUpload } from '../src/http/multipart.js'

const bytes = new Uint8Array([1, 2, 3])

/** Read a FormData body into a comparable shape. */
async function readForm(form: FormData): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const [key, value] of form.entries()) {
    out[key] = value instanceof Blob ? `<blob ${value.size}>` : String(value)
  }
  return out
}

describe('hasUpload', () => {
  it('detects a direct upload', () => {
    expect(hasUpload({ photo: bytes })).toBe(true)
  })

  it('detects an upload nested in an object', () => {
    expect(hasUpload({ media: { type: 'photo', media: bytes } })).toBe(true)
  })

  it('detects an upload nested in an array', () => {
    // `sendMediaGroup`: no InputFile is declared anywhere in the schema, yet
    // the call genuinely uploads.
    expect(hasUpload({ media: [{ type: 'photo', media: bytes }] })).toBe(true)
  })

  it('reports false for ordinary parameters', () => {
    expect(hasUpload({ chat_id: 1, text: 'hi', entities: [{ type: 'bold' }] })).toBe(false)
  })

  it('does not recurse without bound', () => {
    const deep: Record<string, unknown> = {}
    let cursor = deep
    for (let i = 0; i < 50; i++) {
      const next: Record<string, unknown> = {}
      cursor['nested'] = next
      cursor = next
    }
    expect(() => hasUpload(deep)).not.toThrow()
  })
})

describe('JSON encoding', () => {
  it('encodes a plain call as JSON', () => {
    const encoded = encodeRequest({ chat_id: 1, text: 'hi' })

    expect(encoded.contentType).toBe('application/json')
    expect(JSON.parse(encoded.body as string)).toEqual({ chat_id: 1, text: 'hi' })
  })

  it('omits undefined parameters', () => {
    // Sending `"parse_mode": null` is not the same as omitting it, and
    // Telegram rejects some nulls it accepts as absent.
    const encoded = encodeRequest({ chat_id: 1, text: 'hi', parse_mode: undefined })

    expect(JSON.parse(encoded.body as string)).toEqual({ chat_id: 1, text: 'hi' })
  })

  it('keeps nested structures as JSON', () => {
    const encoded = encodeRequest({
      chat_id: 1,
      reply_markup: { inline_keyboard: [[{ text: 'a', callback_data: 'b' }]] },
    })

    expect(JSON.parse(encoded.body as string).reply_markup.inline_keyboard).toHaveLength(1)
  })
})

describe('multipart encoding', () => {
  it('switches to multipart when a value is an upload', () => {
    const encoded = encodeRequest({ chat_id: 1, photo: bytes })

    expect(encoded.body).toBeInstanceOf(FormData)
    // Left unset so the runtime generates the boundary.
    expect(encoded.contentType).toBeUndefined()
  })

  it('sends scalars alongside the file', async () => {
    const encoded = encodeRequest({ chat_id: 1, caption: 'hi', photo: bytes })
    const form = await readForm(encoded.body as FormData)

    expect(form['chat_id']).toBe('1')
    expect(form['caption']).toBe('hi')
    expect(form['photo']).toBe('<blob 3>')
  })

  it('serializes nested structures as JSON strings', async () => {
    const encoded = encodeRequest({
      photo: bytes,
      reply_markup: { force_reply: true },
    })
    const form = await readForm(encoded.body as FormData)

    expect(JSON.parse(form['reply_markup'] ?? '')).toEqual({ force_reply: true })
  })

  it('honours an explicit filename', async () => {
    const encoded = encodeRequest({
      document: { data: bytes, filename: 'report.pdf', contentType: 'application/pdf' },
    })

    const form = encoded.body as FormData
    const value = form.get('document')

    expect(value).toBeInstanceOf(Blob)
    expect((value as File).name).toBe('report.pdf')
    expect((value as Blob).type).toBe('application/pdf')
  })

  it('accepts an ArrayBuffer and a Blob', () => {
    expect(encodeRequest({ photo: new ArrayBuffer(4) }).body).toBeInstanceOf(FormData)
    expect(encodeRequest({ photo: new Blob(['x']) }).body).toBeInstanceOf(FormData)
  })

  it('rejects a stream with an actionable message', () => {
    // Sending "[object Object]" would fail at Telegram with an opaque error.
    const stream = (async function* () {
      yield new Uint8Array([1])
    })()

    expect(() => encodeRequest({ document: stream })).toThrow(/buffer the stream/)
  })
})

describe('attach:// rewriting', () => {
  it('replaces a nested upload with a reference and adds a part', async () => {
    const encoded = encodeRequest({
      chat_id: 1,
      media: [{ type: 'photo', media: bytes }],
    })

    const form = await readForm(encoded.body as FormData)
    const media = JSON.parse(form['media'] ?? '')

    expect(media[0].media).toBe('attach://file_0')
    expect(form['file_0']).toBe('<blob 3>')
  })

  it('numbers several attachments distinctly', async () => {
    const encoded = encodeRequest({
      media: [
        { type: 'photo', media: bytes },
        { type: 'photo', media: new Uint8Array([9, 9]) },
      ],
    })

    const form = await readForm(encoded.body as FormData)
    const media = JSON.parse(form['media'] ?? '')

    expect(media[0].media).toBe('attach://file_0')
    expect(media[1].media).toBe('attach://file_1')
    expect(form['file_0']).toBe('<blob 3>')
    expect(form['file_1']).toBe('<blob 2>')
  })

  it('leaves a file_id string untouched', async () => {
    // Reuse by file_id must not be rewritten into an upload.
    const encoded = encodeRequest({
      media: [{ type: 'photo', media: 'AgACAgIAAx' }],
      thumbnail: bytes,
    })

    const form = await readForm(encoded.body as FormData)
    expect(JSON.parse(form['media'] ?? '')[0].media).toBe('AgACAgIAAx')
  })

  it('keeps a top-level upload as its own field rather than an attachment', async () => {
    const encoded = encodeRequest({ photo: bytes })
    const form = await readForm(encoded.body as FormData)

    expect(form['photo']).toBe('<blob 3>')
    expect(form['file_0']).toBeUndefined()
  })
})
