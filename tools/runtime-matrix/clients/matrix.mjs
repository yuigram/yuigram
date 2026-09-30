// The checks one runtime runs, unchanged under Node, Bun and Deno, from an
// installation of the packed packages. One line per check. Everything goes
// through package resolution except the crypto backend, which is not a public
// export and is imported by path from the installed package.
//
// Run by `src/run.ts`: <runtime> matrix.mjs <tcpPort> <httpPort>
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

const [tcpPort, httpPort] = process.argv.slice(2).map(Number)
const runtime =
  typeof globalThis.Bun !== 'undefined'
    ? `bun ${globalThis.Bun.version}`
    : typeof globalThis.Deno !== 'undefined'
      ? `deno ${globalThis.Deno.version.deno}`
      : `node ${process.versions.node}`

const results = []
async function check(name, run) {
  const started = performance.now()
  try {
    const detail = await run()
    results.push({ name, ok: true, detail, ms: Math.round(performance.now() - started) })
    console.log(`PASS ${name} — ${detail}`)
  } catch (error) {
    const described =
      error instanceof Error ? `${error.name}: ${error.message}` : `a non-Error was thrown: ${typeof error} ${JSON.stringify(error) ?? String(error)}`
    results.push({ name, ok: false, detail: String(error?.stack ?? described) })
    console.log(`FAIL ${name} — ${described}`)
  }
}
const expect = (condition, message) => {
  if (!condition) throw new Error(message)
}
const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
const bytes = (text) => Uint8Array.from(text.match(/../g).map((pair) => Number.parseInt(pair, 16)))
const utf8 = (text) => new TextEncoder().encode(text)

console.log(`runtime ${runtime}`)

// ---- package resolution ------------------------------------------------------
await check('every published entry point imports', async () => {
  const { readFile } = await import('node:fs/promises')
  const packages = ['yuigram', '@yuigram/core', '@yuigram/bot-api', '@yuigram/mtproto', '@yuigram/sqlite', '@yuigram/redis']
  let count = 0
  const entries = []
  for (const name of packages) {
    const manifest = JSON.parse(await readFile(new URL(`./node_modules/${name}/package.json`, import.meta.url), 'utf8'))
    for (const key of Object.keys(manifest.exports)) {
      const specifier = key === '.' ? name : `${name}/${key.slice(2)}`
      const module = await import(specifier)
      count += Object.keys(module).length
      entries.push(specifier)
    }
  }
  return `${entries.length} entry points, ${count} exports`
})

const yuigram = await import('yuigram')

// ---- cryptography ------------------------------------------------------------
await check('crypto matches published vectors', async () => {
  const { backend } = await import(new URL('./node_modules/@yuigram/mtproto/dist/crypto/backend.js', import.meta.url).href)
  const aes = backend.igeEncrypt(bytes('00112233445566778899aabbccddeeff'), bytes('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f'), new Uint8Array(32))
  expect(hex(aes) === '8ea2b7ca516745bfeafc49904b496089', `AES-256 FIPS-197 C.3 gave ${hex(aes)}`)
  expect(hex(backend.sha1(utf8('abc'))) === 'a9993e364706816aba3e25717850c26c9cd0d89d', 'sha1')
  expect(hex(backend.sha256(utf8('abc'))) === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'sha256')
  expect(hex(backend.md5(utf8('abc'))) === '900150983cd24fb0d6963f7d28e17f72', 'md5')
  const ctr = backend
    .ctr(bytes('603deb1015ca71be2b73aef0857d77811f352c073b6108d72d9810a30914dff4'), bytes('f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff'))
    .process(bytes('6bc1bee22e409f96e93d7e117393172a'))
  expect(hex(ctr) === '601ec313775789a5b7a7f504bbf3d228', `AES-256-CTR SP 800-38A F.5.5 gave ${hex(ctr)}`)
  const derived = await backend.pbkdf2(utf8('password'), utf8('salt'), 1, 64)
  expect(hex(derived).startsWith('867f70cf1ade02cff3752599a3a53dc4af34c7a669815ae5'), 'pbkdf2-sha512')
  const key = bytes('603deb1015ca71be2b73aef0857d77811f352c073b6108d72d9810a30914dff4')
  const iv = bytes('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f')
  const data = backend.randomBytes(64)
  expect(hex(backend.igeDecrypt(backend.igeEncrypt(data, key, iv), key, iv)) === hex(data), 'IGE round trip')
  return `backend '${backend.name}': AES-256, AES-CTR, SHA-1, SHA-256, MD5, PBKDF2-SHA512, IGE`
})

// ---- HTTP and streams ----------------------------------------------------------
await check('Bot API call over fetch to a local server', async () => {
  const bot = new yuigram.Bot('0:MATRIX_TOKEN_NOT_A_REAL_CREDENTIAL_0000', { baseUrl: `http://127.0.0.1:${httpPort}` })
  const me = await bot.api.getMe()
  expect(me.username === 'matrix_bot', `got ${JSON.stringify(me)}`)
  return `getMe answered @${me.username}`
})

await check('Fetch-shaped webhook reads a streamed body and dispatches', async () => {
  const { createWebhookHandler, webWebhook } = await import('yuigram/webhook')
  const bot = new yuigram.Bot('0:MATRIX_TOKEN_NOT_A_REAL_CREDENTIAL_0000', { baseUrl: `http://127.0.0.1:${httpPort}` })
  const seen = []
  bot.on('message', (context) => {
    seen.push(context.text)
  })
  const handler = webWebhook(createWebhookHandler({ onUpdate: (update) => bot.handleUpdate(update), secretToken: 's3cret' }))
  const body = JSON.stringify({ update_id: 1, message: { message_id: 1, date: 1, chat: { id: 5, type: 'private' }, from: { id: 5, is_bot: false, first_name: 'A' }, text: 'streamed' } })
  const stream = new ReadableStream({
    start(controller) {
      const encoded = utf8(body)
      controller.enqueue(encoded.subarray(0, 10))
      controller.enqueue(encoded.subarray(10))
      controller.close()
    },
  })
  const response = await handler(
    new Request('http://127.0.0.1/hook', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 's3cret' },
      body: stream,
      duplex: 'half',
    }),
  )
  expect(response.status === 200, `status ${response.status}`)
  // Acknowledged first and dispatched after, so Telegram never retries a slow handler.
  const deadline = Date.now() + 2000
  while (seen.length === 0 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10))
  expect(seen[0] === 'streamed', `handler saw ${JSON.stringify(seen)}`)
  return `200, handler saw '${seen[0]}' from a two-chunk stream`
})

await check('a Bot API call is cancelled by its signal', async () => {
  const bot = new yuigram.Bot('0:MATRIX_TOKEN_NOT_A_REAL_CREDENTIAL_0000', { baseUrl: `http://127.0.0.1:${httpPort}` })
  const controller = new AbortController()
  const pending = bot.api.call('slow', {}, { signal: controller.signal })
  setTimeout(() => controller.abort(), 100)
  const started = performance.now()
  const error = await pending.catch((reason) => reason)
  const took = Math.round(performance.now() - started)
  expect(error?.name === 'AbortError', `ended with ${error?.name}: ${error?.message}`)
  expect(took < 2000, `took ${took} ms`)
  return `rejected with AbortError after ${took} ms`
})

// ---- storage -------------------------------------------------------------------
const directory = await mkdtemp(join(tmpdir(), 'yuigram-matrix-'))
await check('memory, file and encrypted stores', async () => {
  const store = yuigram.memory()
  await store.set('a', { n: 1 })
  await store.set('brief', 1, { ttl: 0.05 })
  await new Promise((resolve) => setTimeout(resolve, 80))
  expect((await store.get('a'))?.n === 1, 'memory get')
  expect((await store.get('brief')) === undefined, 'memory ttl')

  const files = yuigram.file(join(directory, 'files'))
  await files.set('k', { value: 'kept' })
  const again = yuigram.file(join(directory, 'files'))
  expect((await again.get('k'))?.value === 'kept', 'file reopen')

  const sealed = yuigram.encrypted(yuigram.file(join(directory, 'sealed')), 'a secret long enough to derive a key from')
  await sealed.set('k', { secret: true })
  const reopened = yuigram.encrypted(yuigram.file(join(directory, 'sealed')), 'a secret long enough to derive a key from')
  expect((await reopened.get('k'))?.secret === true, 'encrypted reopen')
  return 'memory (with expiry), file across instances, encrypted across instances'
})

await check('SQLite store through the runtime’s own driver', async () => {
  const { openDatabase, sqliteStore } = await import('@yuigram/sqlite')
  let database
  let driver
  try {
    database = await openDatabase(join(directory, 'store.db'))
    driver = 'node:sqlite via openDatabase'
  } catch (error) {
    if (typeof globalThis.Bun === 'undefined') throw error
    const { Database } = await import('bun:sqlite')
    database = new Database(join(directory, 'store.db'))
    driver = `bun:sqlite passed in (openDatabase: ${error.name})`
  }
  const store = sqliteStore(database)
  await store.set('k', { v: 1 }, { ttl: 60 })
  const lease = await store.lease('accounts:a:', { holder: 'matrix', ttlMs: 5000 })
  await lease.storage.set('x', 2)
  expect((await store.get('k'))?.v === 1 && (await store.get('accounts:a:x')) === 2, 'read back')
  expect((await store.lease('accounts:a:', { holder: 'other', ttlMs: 5000 })) === undefined, 'second lease refused')
  await lease.release()
  database.close?.()
  return `${driver}; values, expiry and a fenced lease`
})

// ---- MTProto against the mock datacenter ----------------------------------------
let account
await check('handshake, encrypted call and a pushed update over TCP', async () => {
  const pem = await (await fetch(`http://127.0.0.1:${httpPort}/key`)).text()
  const keys = yuigram.serverKeysFromPem(pem)
  const t0 = Date.now()
  const seen = []
  account = new yuigram.Account({
    apiId: 1,
    apiHash: 'matrix',
    storage: yuigram.memory(),
    keys,
    now: () => 1_700_000_000_000 + (Date.now() - t0),
    bootstrap: {
      thisDc: 2,
      testMode: true,
      options: [{ id: 2, host: '127.0.0.1', port: tcpPort, ipv6: false, mediaOnly: false, tcpoOnly: false, cdn: false, static: true, thisPortOnly: true, secret: undefined }],
    },
  })
  account.on('mtproto:typing', (event) => {
    seen.push(String(event.sender?.id))
  })
  await account.connect()
  const config = await account.api.call({ _: 'help.getConfig' })
  expect(typeof config._ === 'string', 'no answer')
  const pushed = await fetch(`http://127.0.0.1:${httpPort}/deliver`, { method: 'POST' })
  expect(pushed.ok, `push refused: ${await pushed.text()}`)
  const deadline = Date.now() + 10_000
  while (seen.length === 0 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20))
  expect(seen.length === 1, 'the pushed update reached no handler')
  return `key exchanged with ${keys.length} key from PEM; help.getConfig answered '${config._}'; pushed typing from ${seen[0]} dispatched`
})

await check('stopping closes the connection and lets the runtime exit', async () => {
  const before = Number(await (await fetch(`http://127.0.0.1:${httpPort}/closed`)).text())
  await account?.stop({ timeout: 1000 })
  expect(account?.connected === false, 'still connected')
  const deadline = Date.now() + 5000
  let after = before
  while (after === before && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50))
    after = Number(await (await fetch(`http://127.0.0.1:${httpPort}/closed`)).text())
  }
  expect(after > before, 'the datacenter never saw the socket close')
  return `stopped; the datacenter saw ${after - before} connection(s) close`
})

// ---- an application's view: published exports only --------------------------------
/** A datacenter for one account, so accounts in a run never share a peer. */
const portFor = async (name) =>
  Number(await (await fetch(`http://127.0.0.1:${httpPort}/datacenter?name=${name}`)).text())

const bootstrap = (port) => ({
  thisDc: 2,
  testMode: true,
  options: [{ id: 2, host: '127.0.0.1', port, ipv6: false, mediaOnly: false, tcpoOnly: false, cdn: false, static: true, thisPortOnly: true, secret: undefined }],
})

await check('an account keeps its authorization in a persistent store across a restart', async () => {
  const pem = await (await fetch(`http://127.0.0.1:${httpPort}/key`)).text()
  const t0 = Date.now()
  const settings = {
    name: 'kept',
    apiId: 1,
    apiHash: 'matrix',
    keys: yuigram.serverKeysFromPem(pem),
    now: () => 1_700_000_000_000 + (Date.now() - t0),
    bootstrap: bootstrap(await portFor('kept')),
  }
  const place = join(directory, 'account')

  const first = new yuigram.Account({ ...settings, storage: yuigram.file(place) })
  await first.connect()
  await first.api.call({ _: 'help.getConfig' })
  const before = await first.exportSession()
  await first.stop({ timeout: 1000 })

  // Another run over the same directory: the authorization is read back rather
  // than negotiated again, so the session it exports is the same one.
  const second = new yuigram.Account({ ...settings, storage: yuigram.file(place) })
  await second.connect()
  await second.api.call({ _: 'help.getConfig' })
  const after = await second.exportSession()
  await second.stop({ timeout: 1000 })

  expect(before === after, 'the second run negotiated a different authorization')
  return 'file() store: stopped, reopened, same authorization, call answered'
})

await check('an account hosted in a worker thread is driven from the main thread', async () => {
  const { Worker } = await import('node:worker_threads')
  const { attachAccount, workerEndpoint } = await import('yuigram/worker')
  const pem = await (await fetch(`http://127.0.0.1:${httpPort}/key`)).text()
  const worker = new Worker(new URL('./worker-host.mjs', import.meta.url), {
    workerData: { pem, tcpPort: await portFor('hosted'), origin: 1_700_000_000_000 },
  })
  try {
    const remote = await attachAccount(workerEndpoint(worker), { account: 'hosted' })
    await remote.connect()
    const config = await remote.api.call({ _: 'help.getConfig' })
    const state = await remote.read('state')
    await remote.detach()
    expect(typeof config._ === 'string' && state === 'running', `answered ${config._}, state ${state}`)
    return `connected in the worker, help.getConfig answered '${config._}', state ${state}`
  } finally {
    await worker.terminate()
  }
})

await check('server keys come from the published PEM form and fingerprint as Telegram names them', async () => {
  const pem = await (await fetch(`http://127.0.0.1:${httpPort}/key`)).text()
  const keys = yuigram.serverKeysFromPem(pem)
  expect(keys.length === 1 && typeof keys[0].fingerprint === 'bigint', 'no key read')
  let refused = false
  try {
    yuigram.serverKeysFromPem(['-----BEGIN PUBLIC KEY-----', 'not a key', '-----END PUBLIC KEY-----'].join('\n'))
  } catch {
    refused = true
  }
  expect(refused, 'a malformed key was accepted')
  return `1 key, fingerprint ${BigInt.asUintN(64, keys[0].fingerprint).toString(16)}; a malformed one refused`
})

await rm(directory, { recursive: true, force: true })
const failed = results.filter((one) => !one.ok)
console.log(`SUMMARY ${runtime}: ${results.length - failed.length}/${results.length} passed`)
for (const one of failed) console.log(`DETAIL ${one.name}\n${one.detail}`)
console.log('END')
