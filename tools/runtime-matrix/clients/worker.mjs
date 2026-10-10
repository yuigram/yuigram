// SPDX-License-Identifier: MIT

// The checks an edge worker runs.
//
// A Cloudflare Worker module, bundled from the installed packages with the
// substitutions the packages declare for browsers, and run in workerd through
// Miniflare by `src/run.ts`. The crypto backend and the WebSocket connector are
// not public exports and are imported by path from the installed package.
import * as accountFilters from 'yuigram/account-filters'
import * as markup from 'yuigram/markup'
import * as testing from 'yuigram/testing'
import * as webhook from 'yuigram/webhook'
import * as yuigram from 'yuigram'
import * as core from '@yuigram/core'
import * as mtproto from '@yuigram/mtproto'
import { backend } from './node_modules/@yuigram/mtproto/dist/crypto/backend.browser.js'
import { connectWebSocket } from './node_modules/@yuigram/mtproto/dist/network/websocket.js'

const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
const bytes = (text) => Uint8Array.from(text.match(/../g).map((pair) => Number.parseInt(pair, 16)))
const utf8 = (text) => new TextEncoder().encode(text)
const expect = (condition, message) => {
  if (!condition) throw new Error(message)
}

async function run(tcpPort, httpPort) {
  const results = []
  const check = async (name, body) => {
    try {
      results.push({ name, ok: true, detail: await body() })
    } catch (error) {
      results.push({ name, ok: false, detail: `${error?.name}: ${error?.message}\n${error?.stack ?? ''}` })
    }
  }
  const base = `http://127.0.0.1:${httpPort}`

  await check('the bundle loads and every bundled entry point is there', async () => {
    const entries = { yuigram, core, mtproto, accountFilters, markup, testing, webhook }
    const counts = Object.entries(entries).map(([name, module]) => `${name} ${Object.keys(module).length}`)
    expect(typeof yuigram.Account === 'function' && typeof yuigram.Bot === 'function', 'Account or Bot missing')
    return counts.join(', ')
  })

  await check('crypto matches published vectors on the portable backend', async () => {
    expect(backend.name === 'portable', `backend is '${backend.name}'`)
    const aes = backend.igeEncrypt(bytes('00112233445566778899aabbccddeeff'), bytes('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f'), new Uint8Array(32))
    expect(hex(aes) === '8ea2b7ca516745bfeafc49904b496089', `AES-256 gave ${hex(aes)}`)
    expect(hex(backend.sha1(utf8('abc'))) === 'a9993e364706816aba3e25717850c26c9cd0d89d', 'sha1')
    expect(hex(backend.sha256(utf8('abc'))) === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'sha256')
    expect(hex(backend.md5(utf8('abc'))) === '900150983cd24fb0d6963f7d28e17f72', 'md5')
    const ctr = backend
      .ctr(bytes('603deb1015ca71be2b73aef0857d77811f352c073b6108d72d9810a30914dff4'), bytes('f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff'))
      .process(bytes('6bc1bee22e409f96e93d7e117393172a'))
    expect(hex(ctr) === '601ec313775789a5b7a7f504bbf3d228', `AES-CTR gave ${hex(ctr)}`)
    const derived = await backend.pbkdf2(utf8('password'), utf8('salt'), 1, 64)
    expect(hex(derived).startsWith('867f70cf1ade02cff3752599a3a53dc4af34c7a669815ae5'), 'pbkdf2-sha512')
    return "backend 'portable': AES-256, AES-CTR, SHA-1, SHA-256, MD5, PBKDF2-SHA512 (crypto.subtle)"
  })

  await check('Bot API call over fetch', async () => {
    const bot = new yuigram.Bot('0:MATRIX_TOKEN_NOT_A_REAL_CREDENTIAL_0000', { baseUrl: base })
    const me = await bot.api.getMe()
    expect(me.username === 'matrix_bot', JSON.stringify(me))
    return `getMe answered @${me.username}`
  })

  await check('Fetch-shaped webhook reads a streamed body and dispatches', async () => {
    const bot = new yuigram.Bot('0:MATRIX_TOKEN_NOT_A_REAL_CREDENTIAL_0000', { baseUrl: base })
    const seen = []
    bot.on('message', (context) => {
      seen.push(context.text)
    })
    const handler = webhook.webWebhook(webhook.createWebhookHandler({ onUpdate: (update) => bot.handleUpdate(update), secretToken: 's3cret' }))
    const encoded = utf8(JSON.stringify({ update_id: 1, message: { message_id: 1, date: 1, chat: { id: 5, type: 'private' }, from: { id: 5, is_bot: false, first_name: 'A' }, text: 'streamed' } }))
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(encoded.subarray(0, 10))
        controller.enqueue(encoded.subarray(10))
        controller.close()
      },
    })
    const response = await handler(new Request('http://127.0.0.1/hook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 's3cret' }, body, duplex: 'half' }))
    expect(response.status === 200, `status ${response.status}`)
    const deadline = Date.now() + 2000
    while (seen.length === 0 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10))
    expect(seen[0] === 'streamed', JSON.stringify(seen))
    return `200, handler saw '${seen[0]}' from a two-chunk stream`
  })

  await check('a Bot API call is cancelled by its signal', async () => {
    const bot = new yuigram.Bot('0:MATRIX_TOKEN_NOT_A_REAL_CREDENTIAL_0000', { baseUrl: base })
    const controller = new AbortController()
    const pending = bot.api.call('slow', {}, { signal: controller.signal })
    setTimeout(() => controller.abort(), 100)
    const error = await pending.catch((reason) => reason)
    expect(error?.name === 'AbortError', `ended with ${error?.name}: ${error?.message}`)
    return 'rejected with AbortError'
  })

  await check('the memory store, with expiry', async () => {
    const store = core.memory()
    await store.set('a', { n: 1 })
    await store.set('brief', 1, { ttl: 0.05 })
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect((await store.get('a'))?.n === 1, 'get')
    expect((await store.get('brief')) === undefined, 'expiry')
    return 'values and expiry'
  })

  let account
  const sockets = []
  await check('handshake, encrypted call and a pushed update over a WebSocket', async () => {
    const pem = await (await fetch(`${base}/key`)).text()
    const keys = yuigram.serverKeysFromPem(pem)
    const t0 = Date.now()
    const seen = []
    account = new yuigram.Account({
      apiId: 1,
      apiHash: 'matrix',
      storage: core.memory(),
      keys,
      now: () => 1_700_000_000_000 + (Date.now() - t0),
      bootstrap: {
        thisDc: 2,
        testMode: true,
        options: [{ id: 2, host: '127.0.0.1', port: httpPort, ipv6: false, mediaOnly: false, tcpoOnly: false, cdn: false, static: true, thisPortOnly: true, secret: undefined }],
      },
      open: (request) =>
        connectWebSocket({
          ...request,
          url: () => `ws://127.0.0.1:${httpPort}/mtproto`,
          // Kept, so the stop check can ask the socket itself whether it was closed.
          open: (address) => {
            const socket = new WebSocket(address)
            sockets.push(socket)
            return socket
          },
        }),
    })
    account.on('mtproto:typing', (event) => {
      seen.push(String(event.sender?.id))
    })
    await account.connect()
    const config = await account.api.call({ _: 'help.getConfig' })
    const pushed = await fetch(`${base}/deliver`, { method: 'POST' })
    expect(pushed.ok, `push refused: ${await pushed.text()}`)
    const deadline = Date.now() + 10_000
    while (seen.length === 0 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20))
    expect(seen.length === 1, 'the pushed update reached no handler')
    return `key exchanged; help.getConfig answered '${config._}'; pushed typing from ${seen[0]} dispatched`
  })

  await check('stopping closes the connection', async () => {
    const beforeStates = sockets.map((socket) => socket.readyState)
    expect(beforeStates.includes(1), `no open socket before stopping (states ${beforeStates.join(',')}, ${sockets.length} made)`)
    await account?.stop({ timeout: 1000 })
    expect(account?.connected === false, 'still connected')
    const deadline = Date.now() + 5000
    while (sockets.some((socket) => socket.readyState < 2) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    const states = sockets.map((socket) => socket.readyState)
    expect(states.every((state) => state >= 2), `socket states ${states.join(',')}`)
    // Under Miniflare the local proxy does not forward a close frame upstream —
    // a raw WebSocket closed from a worker shows the same — so the datacenter's
    // side of the close is not observable here and is not asserted.
    return `stopped; before ${beforeStates.join(',')}, after ${states.join(',')} (${sockets.length} socket(s))`
  })

  return results
}

export default {
  async fetch(request) {
    const url = new URL(request.url)
    const results = await run(Number(url.searchParams.get('tcp')), Number(url.searchParams.get('http')))
    return new Response(JSON.stringify(results), { headers: { 'content-type': 'application/json' } })
  },
}
