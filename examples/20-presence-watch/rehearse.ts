/**
 * The presence watch, without Telegram.
 *
 * ```sh
 * pnpm tsx examples/20-presence-watch/rehearse.ts
 * ```
 *
 * The bot and the account are the in-process harnesses from `yuigram/testing`:
 * the real update pipeline and the real watch from `watch.ts`, with the network
 * replaced. The people are made up, their statuses are scripted, and the clock
 * and the timer are the rehearsal's own, so an hour passes in an instant. No
 * token, no sign-in and no connection are involved.
 *
 * Every step checks what the bot said and what the account was asked, and the
 * run stops with an error at the first that is not what the watch promises.
 */

import { type KV, memory, type TlValue } from 'yuigram'
import { mockAccount, mockBot, privateChat, rpcError, user } from 'yuigram/testing'
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

/** Where the account keeps what is its own, and where the watch keeps its records: two stores. */
const accountStore = memory()
const watchStore: KV<unknown> = memory()

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

let heard = 0
/** What the bot has said since this was last asked. */
function said(): string[] {
  const texts = bot.calls.callsTo('sendMessage').map((call) => String(call.params['text']))
  const fresh = texts.slice(heard)
  heard = texts.length

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

// ---- the rehearsal -----------------------------------------------------------

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
check((await push(ada, online(300))).length === 0, 'the same update again says nothing')
await advance(17 * 60_000 + 29_000 - 1)
ada.status = online(300)
check(said().length === 0, 'reads that find the user still online say nothing')
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
    'наблюдённый интервал: 17 мин 29 с — от замеченного начала (обновление, 15.01 12:00:00) до времени Telegram',
  ) === true,
  'the interval is an observed one, with its basis',
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
  out[0]?.includes('не меньше') === true &&
    out[0].includes('и не больше') &&
    out[0].includes('начало замечено опросом, между'),
  'its length is given as bounds, not as a figure',
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
check(out[0]?.includes('начало неизвестно') === true, '/status says so too')
out = await push(grace, offline(0))
check(
  out[0]?.includes('интервал не завершён: когда пользователь вошёл, неизвестно') === true &&
    !out[0].includes('наблюдённый интервал'),
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
let release: (() => void) | undefined
account.once('users.getUsers', async (query) => {
  // Answered with what was true when the request left, after an update has said otherwise.
  const stale = answerUsers(query)
  await new Promise<void>((resolve) => {
    release = resolve
  })

  return stale
})
const travelling = watch.poll()
while (release === undefined) await new Promise((resolve) => setImmediate(resolve))
await account.send.update({ _: 'updateUserStatus', user_id: eve.id, status: online(300) })
eve.status = online(300)
release()
await travelling
await watch.settled()
out = said()
check(
  out.length === 1 && out[0]?.startsWith('🟢') === true,
  'the update is reported, and the older answer does not undo it',
  out,
)
check(
  (await command('/status @eve_sample'))[0]?.includes('сейчас: в сети') === true,
  'the user is still recorded as online',
)

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
  out[0]?.includes('интервал прерван: Telegram попросил подождать 300 с') === true &&
    !out[0].includes('наблюдённый интервал'),
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
  out[0]?.includes('текущий интервал прерван: соединение прерывалось с') === true,
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
account = scriptAccount()
await account.account.connect()
watch = build()
grace.status = online(900)
await watch.start()
await watch.settled()
out = said()
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
  out[0]?.includes('интервал прерван: наблюдение не велось с') === true &&
    !out[0].includes('наблюдённый интервал'),
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

console.log('shutdown')
await watch.stop()
check(!watch.scheduled && pending().length === 0, 'no timer is left waiting')
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
console.log(`the presence watch behaves as it says: ${checks} checks`)
