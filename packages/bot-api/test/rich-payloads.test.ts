// SPDX-License-Identifier: MIT

/**
 * Rich messages and the media they name.
 *
 * A rich message written as HTML or Markdown refers to its files by link, and
 * the files travel beside the text. The mistakes worth catching before a
 * request goes out are the ones that leave a link pointing at nothing or at the
 * wrong kind of file. The last case sends one through the real encoder, since
 * an upload two objects deep inside a JSON field is only right if it arrives
 * as an attachment the field names.
 */

import { ValidationError } from '@yuigram/core'
import { describe, expect, it, vi } from 'vitest'
import { createApi } from '../src/api.js'
import { fetchClient } from '../src/http/fetch-client.js'
import { attach, media, richMedia, richMessage } from '../src/index.js'

const TOKEN = '0:TEST_TOKEN_NOT_A_REAL_CREDENTIAL_000000'

describe('rich media entries', () => {
  it('wraps each kind of file under its id, with the type Telegram names it by', () => {
    expect(richMedia.photo('p', 'file_id', { has_spoiler: true })).toEqual({
      id: 'p',
      media: { type: 'photo', media: 'file_id', has_spoiler: true },
    })
    expect(
      [
        richMedia.video('a', 'x'),
        richMedia.animation('b', 'x'),
        richMedia.audio('c', 'x'),
        richMedia.voiceNote('d', 'x'),
        richMedia.document('e', 'x'),
      ].map((entry) => entry.media.type),
    ).toEqual(['video', 'animation', 'audio', 'voice_note', 'document'])
  })

  it('writes the link from the entry, naming animations as video and voice notes as audio', () => {
    expect(richMedia.link(richMedia.photo('chart', 'x'))).toBe('tg://photo?id=chart')
    expect(richMedia.link(richMedia.animation('loop', 'x'))).toBe('tg://video?id=loop')
    expect(richMedia.link(richMedia.voiceNote('memo', 'x'))).toBe('tg://audio?id=memo')
    expect(richMedia.link(richMedia.document('notes-1_a', 'x'))).toBe('tg://document?id=notes-1_a')
  })

  it('refuses an id Telegram would not accept', () => {
    for (const bad of ['', 'a'.repeat(65), 'has space', 'dot.ted', 'ünï']) {
      expect(() => richMedia.photo(bad, 'x')).toThrow(ValidationError)
    }
    expect(richMedia.photo('a'.repeat(64), 'x').id).toHaveLength(64)
  })

  it('builds the voice note on its own as well, for a block that carries one', () => {
    expect(attach.voiceNote('x', { duration: 3 })).toEqual({
      type: 'voice_note',
      media: 'x',
      duration: 3,
    })
  })
})

describe('rich messages', () => {
  const chart = richMedia.photo('chart', 'file_id')
  const clip = richMedia.animation('clip', 'file_id')

  it('builds each of the three forms as the one field Telegram reads', () => {
    expect(richMessage.html('<h1>Hi</h1>')).toEqual({ html: '<h1>Hi</h1>' })
    expect(richMessage.markdown('# Hi', { is_rtl: true })).toEqual({
      markdown: '# Hi',
      is_rtl: true,
    })
    expect(richMessage.blocks([{ type: 'divider' }], { skip_entity_detection: true })).toEqual({
      blocks: [{ type: 'divider' }],
      skip_entity_detection: true,
    })
  })

  it('carries the media its links name', () => {
    const message = richMessage.html(
      `<img src="${richMedia.link(chart)}"/><video src="${richMedia.link(clip)}"></video>`,
      { media: [chart, clip] },
    )

    expect(message).toEqual({
      html: '<img src="tg://photo?id=chart"/><video src="tg://video?id=clip"></video>',
      media: [chart, clip],
    })
  })

  it('lets through an entry no link names, which Telegram judges', () => {
    expect(richMessage.markdown('no links', { media: [chart] }).media).toEqual([chart])
  })

  it('refuses a link to a file that is not attached', () => {
    expect(() => richMessage.markdown('![](tg://photo?id=missing)', { media: [chart] })).toThrow(
      /missing, which is not attached/,
    )
  })

  it('refuses a link of the wrong kind, and says which it should be', () => {
    expect(() => richMessage.html('<img src="tg://photo?id=clip"/>', { media: [clip] })).toThrow(
      /tg:\/\/video\?id=clip/,
    )
  })

  it('refuses two files under one id, too many files, and an empty block list', () => {
    expect(() =>
      richMessage.html('x', { media: [chart, richMedia.document('chart', 'y')] }),
    ).toThrow(/share the id chart/)

    const many = Array.from({ length: 51 }, (_, index) => richMedia.photo(`p${index}`, 'x'))
    expect(() => richMessage.html('x', { media: many })).toThrow(/at most 50/)
    expect(richMessage.html('x', { media: many.slice(0, 50) }).media).toHaveLength(50)

    expect(() => richMessage.blocks([])).toThrow(/at least one block/)
  })

  it('checks an entry written by hand the same way', () => {
    expect(() =>
      richMessage.html('x', {
        media: [{ id: 'bad id', media: { type: 'photo', media: 'x' } }],
      }),
    ).toThrow(ValidationError)
  })
})

describe('a rich message with an upload, over HTTP', () => {
  it('sends the file as an attachment the nested field names', async () => {
    const impl = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify({ ok: true, result: { message_id: 1 } })),
    )
    const api = createApi({ client: fetchClient({ token: TOKEN, fetch: impl }) })
    const chart = richMedia.photo('chart', media.buffer(Uint8Array.of(1, 2, 3), 'chart.png'))

    await api.sendRichMessage({
      chat_id: 7,
      rich_message: richMessage.html(`<img src="${richMedia.link(chart)}"/>`, { media: [chart] }),
    })

    const body = impl.mock.calls[0]?.[1]?.body
    expect(body).toBeInstanceOf(FormData)
    const form = body as FormData

    // The file went out as its own part, and the JSON names it where the
    // bytes were: two objects deep, inside the entry's media.
    const sent = JSON.parse(String(form.get('rich_message')))
    expect(sent).toEqual({
      html: '<img src="tg://photo?id=chart"/>',
      media: [{ id: 'chart', media: { type: 'photo', media: 'attach://file_0' } }],
    })
    const part = form.get('file_0')
    expect(part).toBeInstanceOf(Blob)
    expect(new Uint8Array(await (part as Blob).arrayBuffer())).toEqual(Uint8Array.of(1, 2, 3))
    expect(form.get('chat_id')).toBe('7')
  })
})
