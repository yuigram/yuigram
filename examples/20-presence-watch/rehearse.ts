// SPDX-License-Identifier: MIT

/**
 * The presence watch, without Telegram.
 *
 * ```sh
 * pnpm tsx examples/20-presence-watch/rehearse.ts
 * pnpm tsx examples/20-presence-watch/rehearse.ts --show   # with what the bot said
 * ```
 *
 * The bot and the account are the in-process harnesses from `yuigram/testing`:
 * the real update pipeline and the real watch from `watch.ts`, with the network
 * replaced. The people are made up, their statuses are scripted, and the clock
 * and the timer are the rehearsal's own, so an hour passes in an instant. No
 * token, no sign-in and no connection are involved. Its configuration and its
 * state live in a scratch directory made for the run and removed after it; the
 * `.env` of a real run is never read.
 *
 * Every step checks what the bot said and what the account was asked, and the
 * run stops with an error at the first that is not what the watch promises.
 */

import { createHash, generateKeyPairSync } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { file, type KV, type TlValue } from 'yuigram'
import { mockAccount, mockBot, privateChat, rpcError, user } from 'yuigram/testing'
import { claimEnvironment, openRecords, readAccountConfig, readConfig } from './config.js'
import { reportBotErrors } from './errors.js'
import {
  fingerprintsOf,
  type KeySource,
  keyFileFor,
  keysFromSource,
  prepareServerKeys,
} from './server-keys.js'
import { type PresenceWatch, presenceWatch } from './watch.js'

// ---- a clock and a timer that only move when told to ------------------------

let clock = Date.UTC(2026, 0, 15, 12, 0, 0)
const seconds = (): number => Math.floor(clock / 1000)

interface Timer {
  readonly at: number
  readonly run: () => void
  cancelled: boolean
}
const timers: Timer[] = []
const pending = (): Timer[] => timers.filter((timer) => !timer.cancelled)
const schedule = (run: () => void, ms: number): (() => void) => {
  const timer: Timer = { at: clock + ms, run, cancelled: false }
  timers.push(timer)

  return () => {
    timer.cancelled = true
  }
}

let watch: PresenceWatch

/** Let time pass, firing whatever falls due on the way, each at its own moment. */
async function advance(ms: number): Promise<void> {
  const until = clock + ms
  for (;;) {
    const due = pending()
      .filter((timer) => timer.at <= until)
      .sort((a, b) => a.at - b.at)[0]
    if (due === undefined) break
    clock = Math.max(clock, due.at)
    due.cancelled = true
    due.run()
    await watch.settled()
  }
  clock = until
}

// ---- the people, and what Telegram would say of them ------------------------

interface Person {
  readonly id: bigint
  username: string
  readonly name: string
  readonly bot?: boolean
  status: TlValue | undefined
}

const people = new Map<string, Person>()
const person = (
  id: bigint,
  username: string,
  name: string,
  extra: Partial<Person> = {},
): Person => {
  const made: Person = { id, username, name, status: undefined, ...extra }
  people.set(username, made)

  return made
}

const online = (forSeconds = 300): TlValue => ({
  _: 'userStatusOnline',
  expires: seconds() + forSeconds,
})
const offline = (secondsAgo = 0): TlValue => ({
  _: 'userStatusOffline',
  was_online: seconds() - secondsAgo,
})

const ada = person(1_000_001n, 'ada_sample', 'Ada')
const boris = person(1_000_002n, 'boris_sample', 'Boris')
const clara = person(1_000_003n, 'clara_sample', 'Clara')
const grace = person(1_000_004n, 'grace_sample', 'Grace')
const eve = person(1_000_005n, 'eve_sample', '<b>Eve & Co</b>')
person(1_000_006n, 'frank_sample', 'Frank')
person(1_000_007n, 'helper_bot', 'Helper', { bot: true })

const userOf = (one: Person): TlValue => ({
  _: 'user',
  id: one.id,
  access_hash: one.id * 7n,
  first_name: one.name,
  username: one.username,
  ...(one.bot === true ? { bot: true } : {}),
  ...(one.status === undefined ? {} : { status: one.status }),
})

const OPERATOR = 4242
const operator = user({ id: OPERATOR, first_name: 'Operator' })
const stranger = user({ id: 5151, first_name: 'Stranger' })
const operatorChat = privateChat({ id: OPERATOR })

// ---- configuration and state, in a scratch directory -------------------------

/** Every name `.env.example` lists. */
const SETTINGS = [
  'TELEGRAM_ENV',
  'BOT_TOKEN',
  'OPERATOR_ID',
  'API_ID',
  'API_HASH',
  'SERVER_KEYS',
  'DC_ID',
  'DC_HOST',
  'DC_PORT',
  'DATA_DIR',
  'POLL_SECONDS',
  'WATCH_LIMIT',
  'TIME_ZONE',
] as const

const unset = (name: string): void => {
  Reflect.deleteProperty(process.env, name)
}

const scratch = mkdtempSync(join(tmpdir(), 'presence-rehearsal-'))
process.once('exit', () => rmSync(scratch, { recursive: true, force: true }))

// Whatever the shell this runs in has set is put aside, unlooked at, and put
// back at the end: the rehearsal is configured by its own file and nothing real.
const outside = new Map(SETTINGS.map((name) => [name, process.env[name]]))
for (const name of SETTINGS) unset(name)

/** A path as a `.env` beside the example would give it: relative to this directory. */
const fromExample = (path: string): string =>
  relative(import.meta.dirname, path).replaceAll('\\', '/')

// Keys made for the occasion, and a stand-in for the source file Telegram's are
// read from: one key in each branch of `if (is_test)`, as adjacent C string
// literals, in the form the real file keeps them in. Nothing is retrieved;
// nothing here is real.
const madeKey = (): string =>
  generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({
    type: 'pkcs1',
    format: 'pem',
  }) as string
const asLiterals = (pem: string): string =>
  pem
    .trim()
    .split('\n')
    .map((line) => `"${line}\\n"`)
    .join('\n    ')
const madeKeys = { production: madeKey(), test: madeKey() }
const sourceBytes = new TextEncoder().encode(
  [
    '// A stand-in for the file the keys are read from.',
    'if (is_test) {',
    `  add_pem(keys, ${asLiterals(madeKeys.test)});`,
    '} else {',
    `  add_pem(keys, ${asLiterals(madeKeys.production)});`,
    '  return main_public_rsa_key;',
    '}',
    '',
  ].join('\n'),
)
const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')
const standIn: KeySource = {
  repository: 'https://source.invalid/rehearsal',
  revision: 'rehearsal',
  path: 'keys.cpp',
  sha256: sha256(sourceBytes),
  sections: {
    test: { after: 'if (is_test) {', before: '} else {' },
    production: { after: '} else {', before: 'return main_public_rsa_key;' },
  },
  fingerprints: {
    production: fingerprintsOf(madeKeys.production),
    test: fingerprintsOf(madeKeys.test),
  },
}
let retrieved = 0
const retrieve = async (): Promise<Uint8Array> => {
  retrieved += 1

  return sourceBytes
}
const keysFile = join(scratch, 'keys.pem')
const firstPrepared = await prepareServerKeys({
  environment: 'test',
  target: keysFile,
  source: standIn,
  retrieve,
})

const envFile = join(scratch, '.env')
writeFileSync(
  envFile,
  [
    'TELEGRAM_ENV=test',
    'BOT_TOKEN=1:rehearsal-only',
    `OPERATOR_ID=${OPERATOR}`,
    'API_ID=1',
    'API_HASH=rehearsal-only',
    `SERVER_KEYS=${fromExample(join(scratch, 'keys.pem'))}`,
    `DATA_DIR=${fromExample(join(scratch, 'state'))}`,
    'POLL_SECONDS=45',
    'WATCH_LIMIT=7',
    'TIME_ZONE=UTC',
    '',
  ].join('\n'),
)
process.env['POLL_SECONDS'] = '90'
const config = readConfig({ envFile })
claimEnvironment(config)

/**
 * Where the account keeps what is its own, and where the watch keeps its
 * records: two directories, opened the way a real run opens them.
 */
const openAccountStore = (): KV<unknown> =>
  file(join(config.dataDir, 'account'), { now: () => clock })
let accountStore = openAccountStore()
let watchStore: KV<unknown> = openRecords(config)

/** How Telegram refuses a name nobody has. */
const notOccupied = rpcError(400, 'USERNAME_NOT_OCCUPIED')

/** What an account answers with, for the methods the watch reaches. */
function scriptAccount() {
  const harness = mockAccount({ storage: accountStore, now: () => clock })

  harness.on('contacts.resolveUsername', (query) => {
    const name = String(query['username'])
    if (name === 'sample_channel') {
      return {
        _: 'contacts.resolvedPeer',
        peer: { _: 'peerChannel', channel_id: 2_000_001n },
        chats: [
          {
            _: 'channel',
            id: 2_000_001n,
            access_hash: 9n,
            title: 'Sample',
            username: name,
            photo: { _: 'chatPhotoEmpty' },
            date: 0,
          },
        ],
        users: [],
      }
    }
    const found = people.get(name)
    if (found === undefined)
      return typeof notOccupied === 'function' ? notOccupied(query) : notOccupied

    return {
      _: 'contacts.resolvedPeer',
      peer: { _: 'peerUser', user_id: found.id },
      chats: [],
      users: [userOf(found)],
    }
  })
  harness.on('users.getUsers', (query) => answerUsers(query))
  harness.on('messages.getChats', () => ({ _: 'messages.chats', chats: [] }))
  harness.on('channels.getChannels', () => ({
    _: 'messages.chats',
    chats: [
      {
        _: 'channel',
        id: 2_000_001n,
        access_hash: 9n,
        title: 'Sample',
        username: 'sample_channel',
        photo: { _: 'chatPhotoEmpty' },
        date: 0,
      },
    ],
  }))

  return harness
}

function answerUsers(query: TlValue): TlValue[] {
  const asked = query['id'] as { user_id?: bigint }[]

  return asked.map((input) => {
    const found = [...people.values()].find((one) => one.id === input.user_id)

    return found === undefined ? { _: 'userEmpty', id: input.user_id ?? 0n } : userOf(found)
  })
}

let account = scriptAccount()
await account.account.connect()
const bot = mockBot({ chat: operatorChat })

const build = (): PresenceWatch =>
  presenceWatch({
    bot: bot.bot,
    account: account.account,
    store: watchStore,
    operatorId: OPERATOR,
    pollSeconds: 60,
    limit: 5,
    timeZone: 'UTC',
    now: () => clock,
    schedule,
  })

// ---- what the rehearsal looks at --------------------------------------------

/** `--show` prints every message of the bot's beside the checks made of it. */
const SHOW = process.argv.includes('--show')
let heard = 0
/** What the bot has said since this was last asked. */
function said(): string[] {
  const texts = bot.calls.callsTo('sendMessage').map((call) => String(call.params['text']))
  const fresh = texts.slice(heard)
  heard = texts.length
  if (SHOW) for (const text of fresh) console.log(text.replace(/^/gm, '      │ '))

  return fresh
}
const reads = (): number =>
  account.calls.calls.filter((call) => call.method === 'users.getUsers').length

let checks = 0
function check(condition: boolean, what: string, shown?: unknown): void {
  if (!condition) {
    throw new Error(
      `rehearsal: expected ${what}${shown === undefined ? '' : `\n  got: ${JSON.stringify(shown, null, 2)}`}`,
    )
  }
  checks += 1
  console.log(`  ok  ${what}`)
}

const command = async (text: string): Promise<string[]> => {
  await bot.send.command(text, { from: operator, chat: operatorChat })
  await watch.settled()

  return said()
}
const push = async (who: Person, status: TlValue): Promise<string[]> => {
  who.status = status
  await account.send.update({ _: 'updateUserStatus', user_id: who.id, status })
  await watch.settled()

  return said()
}

/**
 * Start a read and hold its answer back.
 *
 * What it will say is settled when the request arrives; `release` delivers it,
 * after whatever the rehearsal has had happen in between.
 */
async function heldRead(): Promise<{ release: () => Promise<void> }> {
  let open: (() => void) | undefined
  account.once('users.getUsers', async (query) => {
    const stale = answerUsers(query)
    await new Promise<void>((resolve) => {
      open = resolve
    })

    return stale
  })
  const travelling = watch.poll()
  while (open === undefined) await new Promise((resolve) => setImmediate(resolve))
  const deliver = open

  return {
    release: async () => {
      deliver()
      await travelling
      await watch.settled()
    },
  }
}

/** Give a command while a read is held: the answer is there once the handler returns. */
const commandNow = async (text: string): Promise<string[]> => {
  await bot.send.command(text, { from: operator, chat: operatorChat })

  return said()
}

/** What preparing the key file refuses with. */
async function keyRefusal(options: Parameters<typeof prepareServerKeys>[0]): Promise<string> {
  try {
    await prepareServerKeys(options)

    return ''
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

/**
 * What reading the configuration refuses with, once the environment is changed
 * so: as the watch reads it when it starts, or as signing in reads it.
 */
function refusal(
  change: Readonly<Record<string, string | undefined>>,
  read: (options: { envFile: false }) => unknown = readConfig,
): string {
  const kept = new Map(Object.keys(change).map((name) => [name, process.env[name]]))
  const put = (name: string, value: string | undefined): void => {
    if (value === undefined) unset(name)
    else process.env[name] = value
  }
  for (const [name, value] of Object.entries(change)) put(name, value)

  try {
    read({ envFile: false })

    return ''
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  } finally {
    for (const [name, value] of kept) put(name, value)
  }
}

// ---- the rehearsal -----------------------------------------------------------

console.log('configuration, from a file that is not the real one')
check(
  config.environment === 'test' && config.operatorId === OPERATOR && config.botToken !== '',
  'the settings are read from the file the reader is pointed at',
)
check(
  config.dataDir === resolve(scratch, 'state'),
  'a relative DATA_DIR is taken from the example’s directory, wherever the command is run',
  config.dataDir,
)
check(
  config.pollSeconds === 90 && config.limit === 7,
  'a variable already in the environment wins over the file',
)
check(
  readFileSync(join(config.dataDir, 'environment'), 'utf8').trim() === 'test',
  'the state directory remembers the environment it was made for',
)
let mismatch = ''
try {
  claimEnvironment({ ...config, environment: 'production' })
} catch (error) {
  mismatch = String(error)
}
check(
  mismatch.includes('was set up for the test environment'),
  'and refuses to be used for the other one',
  mismatch,
)
check(
  refusal({ API_HASH: undefined }).includes('API_HASH is not set'),
  'a setting that is missing is named',
)
const placeholder = refusal({ BOT_TOKEN: '123456:REPLACE_WITH_THE_BOT_TOKEN' })
check(
  placeholder.includes('BOT_TOKEN still holds the placeholder') && !placeholder.includes('123456'),
  'a placeholder left in place is refused, and its value is not echoed',
  placeholder,
)
check(
  refusal({ TELEGRAM_ENV: 'staging' }).includes('TELEGRAM_ENV must be'),
  'an environment Telegram does not have is refused',
)
check(
  refusal({ TIME_ZONE: 'Mars/Olympus' }).includes('TIME_ZONE is not a time zone'),
  'a time zone the system does not know is refused before anything starts',
)
check(
  refusal({ SERVER_KEYS: 'no-such-file.pem' }).includes('does not exist'),
  'a key file that is not there is refused',
)

console.log('the server keys, from a stand-in for their source')
const written = readFileSync(keysFile, 'utf8')
check(
  firstPrepared.status === 'written' &&
    fingerprintsOf(written).join() === standIn.fingerprints.test.join() &&
    fingerprintsOf(written).join() !== standIn.fingerprints.production.join(),
  'the keys of the environment that was named are written, and not the other one’s',
  firstPrepared,
)
check(
  fingerprintsOf(
    keysFromSource(new TextDecoder().decode(sourceBytes), 'production', standIn),
  ).join() === standIn.fingerprints.production.join(),
  'each environment is read from the section that is its own',
)
const misplaced = await keyRefusal({
  environment: 'production',
  target: join(scratch, 'misplaced.pem'),
  source: {
    ...standIn,
    sections: { ...standIn.sections, production: { after: '{', before: '}' } },
  },
  retrieve: async () => sourceBytes,
})
check(
  misplaced.includes('exactly once') && !existsSync(join(scratch, 'misplaced.pem')),
  'a section marker the file does not hold exactly once is refused, not guessed at',
  misplaced,
)
check(
  written.includes('test environment') &&
    written.includes('revision rehearsal') &&
    !written.includes('PRIVATE KEY'),
  'the file says which environment it is for and where it came from',
)
const again = await prepareServerKeys({
  environment: 'test',
  target: keysFile,
  source: standIn,
  retrieve,
})
check(
  again.status === 'present' && retrieved === 1 && readFileSync(keysFile, 'utf8') === written,
  'a file already holding those keys is left as it is, and nothing is retrieved again',
)
const otherKeys = await keyRefusal({
  environment: 'production',
  target: keysFile,
  source: standIn,
  retrieve,
})
check(
  otherKeys.includes('holds other keys') &&
    otherKeys.includes('It was not changed') &&
    readFileSync(keysFile, 'utf8') === written,
  'a file holding other keys is refused and not overwritten',
  otherKeys,
)
const altered = await keyRefusal({
  environment: 'production',
  target: join(scratch, 'altered.pem'),
  source: standIn,
  retrieve: async () => new TextEncoder().encode(`${new TextDecoder().decode(sourceBytes)} `),
})
check(
  altered.includes('is not the file that was checked') &&
    altered.includes('Nothing was written') &&
    !existsSync(join(scratch, 'altered.pem')),
  'a source that is not byte for byte the one that was checked gives no file',
  altered,
)
const unexpected = await keyRefusal({
  environment: 'production',
  target: join(scratch, 'unexpected.pem'),
  source: { ...standIn, fingerprints: { ...standIn.fingerprints, production: ['0'] } },
  retrieve,
})
check(
  unexpected.includes('not the recorded') && !existsSync(join(scratch, 'unexpected.pem')),
  'nor do keys whose fingerprints are not the recorded ones',
  unexpected,
)
check(
  keyFileFor('test').endsWith('telegram-keys.test.pem') &&
    keyFileFor('production').endsWith('telegram-keys.production.pem'),
  'each environment has a key file of its own name',
)
const unnamed = refusal({ SERVER_KEYS: undefined }, readAccountConfig)
check(
  existsSync(keyFileFor('test'))
    ? unnamed === ''
    : unnamed.includes('pnpm tsx examples/20-presence-watch/keys.ts test'),
  'with no SERVER_KEYS the file is the one for TELEGRAM_ENV, and its absence names the command',
  unnamed,
)

console.log('what signing in reads, and what starting the watch reads')
const signIn = (change: Readonly<Record<string, string | undefined>>): string =>
  refusal(change, readAccountConfig)
check(
  signIn({ BOT_TOKEN: undefined, OPERATOR_ID: undefined }) === '',
  'signing in needs neither the token nor the operator',
)
check(
  signIn({ BOT_TOKEN: '123456:REPLACE_WITH_THE_BOT_TOKEN', OPERATOR_ID: '0' }) === '',
  'nor minds the placeholders .env.example leaves in their place',
)
check(
  signIn({ POLL_SECONDS: 'often', WATCH_LIMIT: '-1', TIME_ZONE: 'Mars/Olympus' }) === '',
  'nor reads the settings only the watch uses',
)
const forSignIn = readAccountConfig({ envFile: false })
check(
  !('operatorId' in forSignIn) && !('botToken' in forSignIn),
  'and what it reads holds no stand-in for an operator or a token',
  Object.keys(forSignIn),
)
check(
  signIn({ API_HASH: undefined }).includes('API_HASH is not set') &&
    signIn({ API_HASH: 'REPLACE_WITH_THE_API_HASH' }).includes('API_HASH still holds') &&
    signIn({ API_ID: '0' }).includes('API_ID must be a whole number above zero') &&
    signIn({ SERVER_KEYS: 'no-such-file.pem' }).includes('does not exist'),
  'it still requires everything the account needs',
)
check(
  refusal({ OPERATOR_ID: undefined }).includes('OPERATOR_ID is not set') &&
    refusal({ OPERATOR_ID: '0' }).includes('OPERATOR_ID is not set'),
  'starting the watch requires an operator: unset, or left at the placeholder, is refused',
)
check(
  refusal({ OPERATOR_ID: 'me' }).includes('OPERATOR_ID must be a whole number above zero'),
  'and so is one that is not an identifier',
)
check(
  refusal({ BOT_TOKEN: undefined }).includes('BOT_TOKEN is not set'),
  'and it requires the token',
)
const unowned = [0, -1, 1.5, Number.NaN].map((nobody) => {
  try {
    presenceWatch({
      bot: bot.bot,
      account: account.account,
      store: watchStore,
      operatorId: nobody,
    })

    return 'built'
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
})
check(
  unowned.every((answer) => answer.includes('needs its operator')),
  'the watch itself is not built without an operator, whatever the configuration said',
  unowned,
)

watch = build()
await watch.start()

console.log('somebody who is not the operator')
await bot.send.command('/watch @ada_sample', {
  from: stranger,
  chat: privateChat({ id: stranger.id }),
})
await watch.settled()
let out = said()
check(
  out.length === 1 && out[0]?.includes('только от своего оператора') === true,
  'a stranger is told the bot is closed',
  out,
)
check(account.calls.calls.length === 0, 'and the account was asked nothing')
await bot.send.command('/list', { from: stranger, chat: operatorChat })
await watch.settled()
check(
  said()[0]?.includes('только от своего оператора') === true && account.calls.calls.length === 0,
  'the operator’s chat does not make a stranger the operator',
)

console.log('/start and names that cannot be watched')
out = await command('/start')
check(
  out[0]?.includes('/watch @username') === true && out[0].includes('/unwatch'),
  '/start answers with the commands',
)
check(
  (await command('/watch 12345'))[0]?.includes('Укажите имя пользователя') === true,
  'a number is refused without a lookup',
)
check(reads() === 0, 'no user was read for it')
check(
  (await command('/watch @nobody_here'))[0]?.includes('не найден') === true,
  'a name nobody has is reported as not found',
)
check(
  (await command('/watch @sample_channel'))[0]?.includes('группа или канал') === true,
  'a channel is refused as not a person',
)
check(
  (await command('/watch @helper_bot'))[0]?.includes('бот') === true,
  'a bot is refused: it has no status',
)
check(
  (await watchStore.get('index')) === undefined,
  'nothing was put on the watch list by any of them',
)

console.log('/watch: a user who is offline')
ada.status = offline(600)
out = await command('/watch @ada_sample')
check(
  out[0]?.includes('Наблюдение начато') === true && out[0].includes('id 1000001'),
  'the watch starts and names the user by identifier',
  out,
)
check(
  out[0]?.includes('не в сети, был(а) в сети до 15.01 11:50:00 по времени Telegram') === true,
  'the current status is given with Telegram’s own time',
)
check(
  JSON.stringify(await watchStore.get('index')) === '["1000001"]',
  'the watch list is kept, by identifier',
)
check((await accountStore.get('watch:1000001')) === undefined, 'and not in the account’s own store')
check(
  (await command('/watch @ada_sample'))[0]?.includes('уже идёт') === true,
  'watching the same user twice is refused',
)
check(watch.scheduled, 'a read is scheduled')

console.log('an interval seen from both ends, by updates')
out = await push(ada, online(300))
check(
  out.length === 1 &&
    out[0]?.startsWith('🟢') === true &&
    out[0].includes('замечено: 15.01 12:00:00 (местное время, обновление)'),
  'online is reported once, with when it was observed',
  out,
)
check(
  out[0]?.includes('статус действует до: 15.01 12:05:00 (время Telegram)') === true,
  'and the expiry is named as Telegram’s time, not as a start',
)
check(
  out[0]?.includes('когда пользователь вошёл, Telegram не сообщает') === true,
  'and it says that when the user arrived is not something Telegram tells',
)
check((await push(ada, online(300))).length === 0, 'the same update again says nothing')
await advance(5 * 60_000)
check(
  (await push(ada, online(300))).length === 0,
  'a status renewed with a later expiry is not a new arrival',
)
check((await push(ada, online(30))).length === 0, 'nor is one with an earlier expiry')
await advance(12 * 60_000 + 29_000 - 1)
ada.status = online(300)
check(said().length === 0, 'reads that find the user still online say nothing')
check(
  (await command('/status @ada_sample'))[0]?.includes(
    'первое наблюдение «в сети»: 15.01 12:00:00 (обновление)',
  ) === true,
  'the interval still begins where the user was first seen online',
)
clock += 1
out = await push(ada, offline(0))
check(
  out.length === 1 &&
    out[0]?.startsWith('⚪') === true &&
    out[0].includes('был(а) в сети до: 15.01 12:17:29 (время Telegram)'),
  'offline is reported with Telegram’s last-seen time',
  out,
)
check(
  out[0]?.includes(
    'оценка интервала: 17 мин 29 с — от первого наблюдения «в сети» (обновление, 15.01 12:00:00) до времени Telegram',
  ) === true,
  'the interval is given as an estimate, with both of its ends named',
  out,
)
check(
  out[0]?.includes(
    'это оценка, а не измерение: непрерывность между наблюдениями не подтверждена, часы компьютера и Telegram считаются согласованными',
  ) === true &&
    !out[0].includes('не меньше') &&
    !out[0].includes('не больше'),
  'and as nothing more: continuity is not claimed, and no bound is',
)
check((await push(ada, offline(0))).length === 0, 'the same offline update again says nothing')

console.log('an interval whose start a read found')
boris.status = offline(3600)
await command('/watch @boris_sample')
await advance(60_000)
boris.status = online(600)
await advance(60_000)
out = said()
check(
  out.length === 1 &&
    out[0]?.includes('Boris') === true &&
    out[0].includes('(местное время, опрос)'),
  'a read that finds the user online reports it as found by a read',
  out,
)
await advance(4 * 60_000 + 10_000)
boris.status = offline(0)
await advance(60_000)
out = said()
check(
  out[0]?.includes(
    'оценка интервала: 4 мин 39 с — от первого наблюдения «в сети» (опрос, 15.01 12:19:00) до времени Telegram',
  ) === true,
  'its length is estimated from the read that first found the user online',
  out,
)
check(
  out[0]?.includes(
    'вход мог произойти раньше — после предыдущей проверки в 15.01 12:18:00, когда статус ещё не был «в сети»; тогда оценка — до 5 мин 39 с',
  ) === true &&
    out[0].includes('это оценка, а не измерение') &&
    !out[0].includes('не меньше') &&
    !out[0].includes('не больше'),
  'with the check before it named, since the user may have arrived any time after that — and no bound',
)

console.log('times that contradict each other')
await push(ada, online(300))
await advance(10_000)
out = await push(ada, offline(60))
check(
  out.length === 1 &&
    out[0]?.includes(
      'интервал не оценивается: это время раньше, чем первое наблюдение «в сети»',
    ) === true &&
    !out[0].includes('оценка интервала'),
  'a last-seen earlier than the first sighting gives no figure',
  out,
)
await push(ada, online(300))
await advance(10_000)
out = await push(ada, { _: 'userStatusOffline', was_online: seconds() + 120 })
check(
  out.length === 1 &&
    out[0]?.includes('интервал не оценивается: это время позже момента, когда оно получено') ===
      true &&
    !out[0].includes('оценка интервала'),
  'nor does a last-seen that lies ahead of the clock',
  out,
)
out = await push(ada, offline(0))
check(
  out.length === 1 &&
    out[0]?.startsWith('⚪') === true &&
    !out[0].includes('между двумя наблюдениями'),
  'and nothing is concluded from that time afterwards: no visit is inferred from it',
  out,
)
await advance(30_000)
out = await push(ada, offline(0))
check(
  out.length === 1 &&
    out[0]?.includes('по данным Telegram пользователь был в сети между двумя наблюдениями') ===
      true &&
    out[0].includes('его длительность неизвестна'),
  'a later last-seen with nothing seen in between is a visit of unknown length',
  out,
)

console.log('Telegram’s whole seconds against this clock’s milliseconds')
clock += 1_700 - (clock % 1000)
await push(ada, online(300))
out = await push(ada, offline(0))
check(
  out.length === 1 &&
    out[0]?.includes('интервал не оценивается: время Telegram приходится на ту же секунду') ===
      true &&
    !out[0].includes('оценка интервала') &&
    !out[0].includes('раньше, чем'),
  'a last-seen in the second of the first sighting gives no figure, and is not called earlier',
  out,
)
clock += 1_000
await push(ada, online(300))
clock += 400
out = await push(ada, offline(0))
check(
  out.length === 1 &&
    out[0]?.includes('оценка интервала: 1 с — от первого наблюдения') === true &&
    out[0].includes('с точностью до секунды'),
  'one second later on Telegram’s clock is one second, not the 300 ms between the two clocks',
  out,
)

console.log('evidence that Telegram’s own times show to be older')
const lastSeen = seconds()
const known = (await command('/status @ada_sample'))[0]?.split('\n').slice(0, 3).join('\n')
check(
  (await push(ada, { _: 'userStatusOffline', was_online: lastSeen - 100 })).length === 0,
  'an update with an earlier last-seen changes nothing',
)
check(
  (await push(ada, { _: 'userStatusOnline', expires: lastSeen - 10 })).length === 0,
  'nor does an online status that had run out before the user was last seen',
)
ada.status = { _: 'userStatusOffline', was_online: lastSeen - 500 }
await advance(60_000)
check(
  said().length === 0,
  'nor does a read, asked for later, that answers with an earlier last-seen',
)
check(
  known !== undefined &&
    (await command('/status @ada_sample'))[0]?.split('\n').slice(0, 3).join('\n') === known,
  'what is held of the user is what it was',
)
await push(ada, online(300))
out = await push(ada, { _: 'userStatusOffline', was_online: 0 })
check(
  out.length === 1 &&
    out[0]?.includes('когда пользователь был в сети в последний раз, Telegram не сообщил') ===
      true &&
    out[0].includes('времени конца Telegram не дал') &&
    !out[0].includes('оценка интервала'),
  'an offline status with no time in it is reported as that, with no figure',
  out,
)

console.log('a status with no time in it')
clara.status = offline(100)
await command('/watch @clara_sample')
out = await push(clara, { _: 'userStatusRecently', by_me: true })
check(
  out.length === 1 && out[0]?.includes('точное время скрыто: «был(а) недавно»') === true,
  'a hidden status is reported as hidden',
  out,
)
check(
  out[0]?.includes('аккаунт сам скрывает своё время') === true,
  'and why, where the account hides its own',
)
await advance(10 * 60_000)
check(said().length === 0, 'ten minutes of silence produce no message, and no offline')
check(
  (await push(clara, { _: 'userStatusLastWeek' })).length === 0,
  'one vague status after another is not news',
)

console.log('a user already online when watching begins')
grace.status = online(300)
out = await command('/watch @grace_sample')
check(
  out[0]?.includes('Сейчас: в сети') === true &&
    out[0].includes('Когда пользователь вошёл, неизвестно'),
  'the answer says the start is unknown',
  out,
)
out = await command('/status @grace_sample')
check(out[0]?.includes('когда вошёл(ла), неизвестно') === true, '/status says so too')
out = await push(grace, offline(0))
check(
  out[0]?.includes(
    'интервал не оценивается: пользователь уже был в сети, когда началось наблюдение',
  ) === true && !out[0].includes('оценка интервала'),
  'going offline later does not give that interval a length',
  out,
)

console.log('an online status that runs out with nothing said')
await push(grace, online(120))
said()
const readsBefore = reads()
await advance(125_000)
check(reads() > readsBefore, 'the watch reads again once the status has run out')
check(said().length === 0, 'and reports nothing: an expiry is not an offline')

console.log('a read that comes back after a newer update')
eve.status = offline(50)
out = await command('/watch @eve_sample')
check(
  out[0]?.includes('&lt;b&gt;Eve &amp; Co&lt;/b&gt;') === true && !out[0].includes('<b>Eve'),
  'a name with markup in it is escaped',
  out,
)
// What the read will answer with: Eve as she was when the request left, offline,
// and Ada, of whom nothing else is heard meanwhile, online.
ada.status = online(300)
let read = await heldRead()
await account.send.update({ _: 'updateUserStatus', user_id: eve.id, status: online(300) })
eve.status = online(300)
await read.release()
out = said()
const ofEve = out.filter((text) => text.includes('Eve'))
check(
  ofEve.length === 1 && ofEve[0]?.startsWith('🟢') === true,
  'the update is reported, and the answer to the earlier request does not undo it',
  out,
)
check(
  out.length === 2 &&
    out.some(
      (text) =>
        text.startsWith('🟢') && text.includes('Ada') && text.includes('(местное время, опрос)'),
    ),
  'the same answer is still taken for a user nothing newer was heard of',
  out,
)
check(
  (await command('/status @eve_sample'))[0]?.includes('сейчас: в сети') === true,
  'the user is still recorded as online',
)
await advance(45_000)
await push(ada, offline(0))

console.log('a notification that does not go through')
bot.calls.failOnce('sendMessage')
out = await push(eve, offline(0))
check(
  out.length === 1 &&
    bot.sent.every(
      (message) => !String(message.text).includes('Eve') || !String(message.text).startsWith('⚪'),
    ),
  'the first attempt fails, and nothing is lost',
)
await advance(60_000)
const delivered = bot.sent.filter(
  (message) => String(message.text).startsWith('⚪') && String(message.text).includes('Eve'),
)
check(delivered.length === 1, 'it is delivered on the next pass, once', delivered.length)
said()

console.log('a user unwatched and watched again while a read travels')
// What the read will answer with is Boris as the old watch knew him: offline.
read = await heldRead()
await commandNow('/unwatch @boris_sample')
boris.status = online(300)
out = await commandNow('/watch @boris_sample')
check(
  out.length === 1 && out[0]?.includes('Сейчас: в сети') === true,
  'the new watch begins from what is true now',
  out,
)
await read.release()
out = said()
check(out.length === 0, 'and the answer to a request older than the watch says nothing of it', out)
out = await command('/status @boris_sample')
check(
  out[0]?.includes('сейчас: в сети') === true && out[0].includes('когда вошёл(ла), неизвестно'),
  'the user is still recorded as online, since before the watch began',
  out,
)
await push(boris, offline(0))

console.log('the link to Telegram drops while a read travels')
// The answer is composed before the gap — Eve online — and delivered after it.
eve.status = online(300)
read = await heldRead()
await watch.connection('connecting')
clock += 120_000
await watch.connection('connected')
const readsAtGap = reads()
await read.release()
out = said()
check(out.length === 0, 'an answer that crossed the gap is not taken for how things stand', out)
await advance(30_000)
out = said()
check(
  reads() > readsAtGap &&
    out.length === 1 &&
    out[0]?.startsWith('🟢') === true &&
    out[0].includes('Eve') &&
    out[0].includes('(местное время, опрос)'),
  'a read asked for after the gap is',
  out,
)

console.log('Telegram asks the account to wait')
await push(boris, online(900))
said()
const refuse = rpcError(420, 'FLOOD_WAIT_300')
let refusedAt = 0
account.once('users.getUsers', (query) => {
  refusedAt = clock

  return typeof refuse === 'function' ? refuse(query) : refuse
})
await advance(60_000)
const afterRefusal = reads()
check(refusedAt > 0 && said().length === 0, 'a refused read reports no transition')
await advance(refusedAt + 299_000 - clock)
check(reads() === afterRefusal, 'and nothing is read for the 300 seconds Telegram asked for')
await watch.poll()
check(reads() === afterRefusal, 'not even when a read is asked for out of turn')
await advance(2_000)
check(reads() === afterRefusal + 1, 'reading resumes once they have passed')
out = await push(boris, offline(0))
check(
  out[0]?.includes('наблюдение прервано: Telegram попросил подождать 300 с') === true &&
    out[0].includes('интервал не оценивается') &&
    !out[0].includes('оценка интервала'),
  'the interval open across the wait is reported as interrupted',
  out,
)

console.log('the link to Telegram drops')
await push(boris, online(900))
await watch.connection('connecting')
await advance(120_000)
await watch.connection('connected')
await watch.settled()
out = await command('/status @boris_sample')
check(
  out[0]?.includes('наблюдение текущего интервала прервано: соединение прерывалось с') === true,
  'an interval open across a disconnection is marked',
  out,
)
said()

console.log('a restart')
// A fresh interval, observed from its start, so that the restart is what interrupts it.
await push(grace, offline(0))
await push(grace, online(900))
said()
await watch.stop()
check(!watch.scheduled && pending().length === 0, 'stopping leaves no timer waiting')
await account.dispose()
clock += 3_600_000
// Nothing is carried over in memory: both stores are opened again from their directories.
accountStore = openAccountStore()
watchStore = openRecords(config)
account = scriptAccount()
await account.account.connect()
watch = build()
grace.status = online(900)
await watch.start()
await advance(0)
out = said()
const sinceRestart = account.calls.calls
const firstRead = sinceRestart.find((call) => call.method === 'users.getUsers')
const inputs = (firstRead?.query['id'] ?? []) as { user_id?: bigint; access_hash?: bigint }[]
check(
  inputs.length === 5 &&
    inputs.every((input) => input.access_hash === (input.user_id ?? 0n) * 7n) &&
    sinceRestart.every((call) => call.method !== 'contacts.resolveUsername'),
  'the account reads the watched users from what it kept on disk, looking no name up again',
  sinceRestart.map((call) => call.method),
)
check(
  out.some(
    (text) =>
      text.startsWith('↻') &&
      text.includes('наблюдение не велось с 15.01') &&
      text.includes('Наблюдаемых: 5'),
  ),
  'the operator is told watching resumed, and for how long nobody looked',
  out,
)
out = await command('/list')
check(
  ['Ada', 'Boris', 'Clara', 'Grace', 'Eve'].every((name) => out[0]?.includes(name) === true),
  'the watch list survived the restart',
)
out = await push(grace, offline(0))
check(
  out[0]?.includes('наблюдение прервано: наблюдение не велось с') === true &&
    out[0].includes('интервал не оценивается') &&
    !out[0].includes('оценка интервала'),
  'an interval open across the restart is not joined over the gap',
  out,
)

console.log('the watch list is full')
check(
  (await command('/watch @frank_sample'))[0]?.includes('это предел') === true,
  'a sixth user is refused at a limit of five',
)

console.log('a username changes hands')
ada.username = 'ada_renamed'
await advance(60_000)
said()
out = await command('/status 1000001')
check(
  out[0]?.includes('id 1000001') === true &&
    out[0].includes('имя пользователя сменилось: теперь @ada_renamed'),
  'the watch stays on the same user and says the name changed',
  out,
)

console.log('/unwatch')
check(
  (await command('/unwatch'))[0]?.includes('Кого снять') === true,
  '/unwatch with no target asks for one',
)
check(
  (await command('/unwatch @somebody_else'))[0]?.includes('Такого наблюдения нет') === true,
  'a target that is not watched is refused',
)
out = await command('/unwatch @ada_sample')
check(
  out[0]?.includes('Наблюдение остановлено') === true && out[0].includes('id 1000001'),
  'the name the user was found under still names the watch',
  out,
)
check((await push(ada, online(300))).length === 0, 'and their updates are no longer reported')
out = await command('/unwatch 1000002')
check(out[0]?.includes('Boris') === true, 'an identifier names a watch too')
check((await command('/list'))[0]?.includes('Наблюдаем 3 из 5') === true, 'three are left')

console.log('a bot handler that fails')
// A bot of its own, so the failure touches nothing the watch relies on.
const probe = mockBot({ chat: operatorChat })
const reported: string[] = []
reportBotErrors(probe.bot, (line) => reported.push(line))
probe.bot.on('message', () => {
  throw new Error('quoting the message: private words, and BOT_TOKEN=1:rehearsal-only')
})
await probe.send.command('/private words', { from: operator, chat: operatorChat })
check(
  reported.length === 1 &&
    reported[0]?.startsWith('[bot] a handler failed on message') === true &&
    reported[0].endsWith(': Error'),
  'is reported once, by the kind of update and the name of the error',
  reported,
)
check(
  !reported.some((line) => line.includes('private') || line.includes('rehearsal-only')) &&
    probe.errors.length === 0,
  'without what the message said or anything secret, and not logged a second time by the bot',
  reported,
)
await probe.dispose()

console.log('shutdown, with a read still travelling')
read = await heldRead()
let stopped = false
const stopping = watch.stop().then(() => {
  stopped = true
})
// Real time, for once: long enough for a stop that did not wait to have finished.
await new Promise((resolve) => setTimeout(resolve, 100))
check(!stopped, 'stopping waits for the read in flight')
await read.release()
await stopping
check(!watch.scheduled && pending().length === 0, 'and leaves no timer waiting')
const before = bot.calls.callsTo('sendMessage').length
await bot.send.command('/list', { from: operator, chat: operatorChat })
await account.send.update({
  _: 'updateUserStatus',
  user_id: clara.id,
  status: online(300),
})
check(
  bot.calls.callsTo('sendMessage').length === before,
  'and the handlers are gone: nothing is answered or reported',
)
check(
  bot.errors.length === 0 && account.errors.length === 0,
  'no handler failed along the way',
  [...bot.errors, ...account.errors].map(String),
)

await account.dispose()
await bot.dispose()
for (const [name, value] of outside) {
  if (value === undefined) unset(name)
  else process.env[name] = value
}
rmSync(scratch, { recursive: true, force: true })
console.log(`the presence watch behaves as it says: ${checks} checks`)
