// SPDX-License-Identifier: MPL-2.0

/**
 * The presence watch: a bot its operator talks to, and an account that looks.
 *
 * The operator names a user to the bot; the account beside it resolves the name
 * to a user and observes what Telegram reports of that user's status; the bot
 * tells the operator what was observed. Everything that reaches Telegram goes
 * through the `Bot` and the `Account` this is given — there is no other client
 * here.
 *
 * What it can know is narrow, and the code keeps to it:
 *
 * - Telegram pushes a status update for some users and not for others, and
 *   offers no way to ask for them. So the account also reads every watched user
 *   in one request on a slow timer, and treats a pushed update as a refinement.
 * - A status that says "online" carries when it expires, not when it began. The
 *   start of an interval is therefore the moment it was first observed here;
 *   the user arrived at some point after the check before that, and an interval
 *   whose start was not observed at all has no length.
 * - A status that says "offline" carries when the user was last online, by
 *   Telegram's clock. That is taken as the end of an interval.
 * - Nothing between two observations proves the user stayed online, so the
 *   figure given for an interval is an estimate, said to be one, with both of
 *   its ends named. It is read off two clocks, and refused where they
 *   contradict each other.
 * - Silence says nothing. An expired "online" is a reason to read again, never
 *   an offline transition, and a read that failed changes no state.
 */

import {
  type Account,
  type Bot,
  escapeHtml,
  FloodError,
  type KV,
  type MessageContext,
  type MtprotoContext,
  PeerError,
  parseCommand,
  RpcError,
  type UserPresence,
  UserView,
} from 'yuigram'

/** What the watch is built from. */
export interface PresenceWatchOptions {
  /** The operator's interface. */
  readonly bot: Bot
  /** The account that resolves names, reads statuses and hears updates. */
  readonly account: Account
  /** Where the watch list and the observations are kept. Not the account's own store. */
  readonly store: KV<unknown>
  /** The one user whose private chat with the bot may give commands. */
  readonly operatorId: number
  /** Seconds between reads of the watched users. 60 unless given; never under 30. */
  readonly pollSeconds?: number
  /** How many users may be watched at once. 10 unless given; never over 20. */
  readonly limit?: number
  /** The time zone times are written in. The process's own unless given. */
  readonly timeZone?: string
  /** The clock, in milliseconds. Injectable so a rehearsal need not wait. */
  readonly now?: () => number
  /** Run something later, and return how to call it off. Injectable for the same reason. */
  readonly schedule?: (run: () => void, ms: number) => () => void
  /** Where a line about what the watch is doing goes. Nowhere unless given. */
  readonly log?: (line: string) => void
}

/** The handle a program holds on a running watch. */
export interface PresenceWatch {
  /** Load what was kept, mark the time nobody was looking, and begin. */
  start(): Promise<void>
  /** Call off the timer, wait for a read in flight, and take the handlers back. */
  stop(): Promise<void>
  /** Read every watched user now, unless a read is already under way. */
  poll(): Promise<void>
  /** Say the account's link to Telegram changed. Wired to `account.onConnectionStatus`. */
  connection(status: string): Promise<void>
  /** Resolves once no read is travelling and nothing is waiting to be written down. */
  settled(): Promise<void>
  /** Whether a timer is waiting. False after `stop`. */
  readonly scheduled: boolean
}

type State = UserPresence['state'] | 'unavailable'

/** One thing learned about a user, and how. */
interface Seen {
  readonly state: State
  /** Telegram's own time for it, in Unix seconds: last seen, or online until. */
  readonly serverTime: number | undefined
  /** When this program learned it, in local milliseconds. */
  readonly at: number
  readonly source: 'watch' | 'update' | 'poll'
  readonly hiddenByMe: boolean
}

/** An online interval that has begun and not ended. */
interface OpenInterval {
  /** When the user was first observed online, in local milliseconds. */
  readonly at: number
  /** False where the user was already online when watching began. */
  readonly startKnown: boolean
  /**
   * The last check before it, when the status was not yet "online": the user
   * arrived after this moment and no later than `at`.
   */
  readonly after: number | undefined
  readonly source: Seen['source']
  /** Why the interval can no longer be measured, once something interrupted it. */
  readonly broken: string | undefined
}

/** What taking in one observation gives: the record as it now stands, and what to say. */
interface Observed {
  readonly record: WatchRecord
  readonly say: readonly string[]
}

/** A notification waiting to be delivered, and how often delivery was tried. */
interface Pending {
  readonly text: string
  readonly tries: number
}

/** Everything kept about one watched user. One record, written whole. */
interface WatchRecord {
  /** The user's identifier, in decimal. What the watch is of; a name is not. */
  readonly id: string
  /** The username the user was found under. Kept for display and for `/unwatch`. */
  readonly username: string | undefined
  /** The username last seen on the user, where it has since changed. */
  readonly renamed: string | undefined
  readonly name: string
  readonly since: number
  /** The last time anything was learned of the user, whether or not it was news. */
  readonly checked: number | undefined
  readonly last: Seen | undefined
  readonly open: OpenInterval | undefined
  readonly outbox: readonly Pending[]
}

interface Meta {
  /** The last moment the watch was known to be running. */
  readonly alive: number | undefined
  readonly outbox: readonly Pending[]
}

const MIN_POLL_SECONDS = 30
const MAX_LIMIT = 20
/** A read asked for out of turn waits at least this long after the last one began. */
const EXTRA_POLL_GAP = 30_000
/** How long after an online status says it ends the next read waits, for the two clocks' sake. */
const EXPIRY_MARGIN = 5_000
/** The longest the timer backs off to after Telegram asks it to wait. */
const MAX_BACKOFF = 16
/**
 * How far ahead of this machine's clock a time from Telegram may be before the
 * two are taken to disagree, and a figure built from both is refused.
 */
const CLOCK_TOLERANCE = 5_000
/** How often a notification is tried before it is given up on. */
const MAX_TRIES = 5
const USERNAME = /^@?([A-Za-z][A-Za-z0-9_]{3,31})$/

const HELP = [
  '<b>Наблюдение за статусом «в сети»</b>',
  '',
  '/watch @username — начать наблюдение',
  '/unwatch @username или /unwatch id — прекратить',
  '/list — кого наблюдаем',
  '/status — последние наблюдения; /status @username — по одному',
  '',
  'Бот сообщает только то, что Telegram показывает аккаунту. Если время скрыто, он так и скажет. Тишина не означает «не в сети».',
].join('\n')

const VAGUE: Readonly<Record<string, string>> = {
  recently: '«был(а) недавно»',
  'last-week': '«был(а) на этой неделе»',
  'last-month': '«был(а) в этом месяце»',
  'long-ago': '«был(а) давно»',
}

const isPrecise = (state: State): boolean => state === 'online' || state === 'offline'

/** Build the watch over a bot and an account. Nothing happens until `start`. */
export function presenceWatch(options: PresenceWatchOptions): PresenceWatch {
  const { bot, account, store, operatorId } = options
  // No watch without an operator: an identifier that is nobody's would leave a
  // bot that answers to no one, or — were the check ever loosened — to anyone.
  if (!Number.isSafeInteger(operatorId) || operatorId <= 0) {
    throw new Error('the presence watch needs its operator: a Telegram user id above zero')
  }
  const now = options.now ?? Date.now
  const schedule =
    options.schedule ??
    ((run, ms) => {
      const timer = setTimeout(run, ms)

      return () => clearTimeout(timer)
    })
  const pollEvery = Math.max(MIN_POLL_SECONDS, options.pollSeconds ?? 60) * 1000
  const limit = Math.min(MAX_LIMIT, Math.max(1, options.limit ?? 10))
  const log = options.log ?? (() => {})

  const clock = new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    ...(options.timeZone === undefined ? {} : { timeZone: options.timeZone }),
  })

  /** A local moment, written out. */
  const local = (ms: number): string => clock.format(new Date(ms)).replace(',', '')
  /** A moment Telegram named, in Unix seconds, written out. */
  const server = (seconds: number): string => local(seconds * 1000)

  let running = false
  let cancelTimer: (() => void) | undefined
  /** When the waiting timer fires. */
  let timerAt = Number.POSITIVE_INFINITY
  let polling: Promise<void> | undefined
  let lastPollStarted = Number.NEGATIVE_INFINITY
  /** Until when the account was asked not to read, and the bot not to write. */
  let readAfter = 0
  let writeAfter = 0
  let backoff = 1
  let offlineSince: number | undefined
  /**
   * The order things were taken in by this process, counted rather than timed.
   *
   * It says which of an update and a read's request came first *here* — two
   * things in one millisecond still have an order — and nothing about the order
   * Telegram produced them in. That is enough for the one judgement it is used
   * for: an answer to a request that left before something newer was taken in
   * is not allowed to replace it. Telegram's own times, where a status carries
   * one, are compared separately in `superseded`.
   */
  let arrivals = 0
  const learned = new Map<string, number>()
  /**
   * How many times the link to Telegram has dropped.
   *
   * An answer to a request that was travelling when it dropped cannot be dated:
   * it may have been composed before the gap and delivered after it. A read
   * that finds this changed on its return discards its answer.
   */
  let drops = 0
  /** One change to the records at a time: an update and a read must not interleave. */
  let queue: Promise<unknown> = Promise.resolve()

  const serialized = <T>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work, work)
    queue = next.catch(() => undefined)

    return next
  }

  // ---- the records --------------------------------------------------------

  const keyOf = (id: string): string => `watch:${id}`

  async function index(): Promise<string[]> {
    const stored = await store.get('index')

    return Array.isArray(stored) ? stored.filter((id) => typeof id === 'string') : []
  }

  async function load(id: string): Promise<WatchRecord | undefined> {
    return (await store.get(keyOf(id))) as WatchRecord | undefined
  }

  async function all(): Promise<WatchRecord[]> {
    const records: WatchRecord[] = []
    for (const id of await index()) {
      const record = await load(id)
      if (record !== undefined) records.push(record)
    }

    return records
  }

  async function meta(): Promise<Meta> {
    const stored = (await store.get('meta')) as Partial<Meta> | undefined

    return { alive: stored?.alive, outbox: stored?.outbox ?? [] }
  }

  // ---- what the bot says --------------------------------------------------

  const who = (record: Pick<WatchRecord, 'name'>): string => `<b>${escapeHtml(record.name)}</b>`

  function identity(record: WatchRecord): string {
    const handle = record.username === undefined ? '' : `@${escapeHtml(record.username)}, `

    return `${who(record)} (${handle}id ${record.id})`
  }

  function duration(ms: number): string {
    const total = Math.max(0, Math.round(ms / 1000))
    const hours = Math.floor(total / 3600)
    const minutes = Math.floor((total % 3600) / 60)
    const seconds = total % 60

    return [
      hours > 0 ? `${hours} ч` : '',
      hours > 0 || minutes > 0 ? `${minutes} мин` : '',
      `${seconds} с`,
    ]
      .filter((part) => part !== '')
      .join(' ')
  }

  const sourceName = (source: Seen['source']): string =>
    source === 'update' ? 'обновление' : source === 'poll' ? 'опрос' : 'чтение при старте'

  /** What is known now, in one line, for `/list`, `/status` and the start message. */
  function describe(seen: Seen | undefined): string {
    if (seen === undefined) return 'наблюдений ещё нет'
    if (seen.state === 'online') {
      const until =
        seen.serverTime === undefined
          ? ''
          : `, статус действует до ${server(seen.serverTime)} по времени Telegram`

      return `в сети${until}`
    }
    if (seen.state === 'offline') {
      return seen.serverTime === undefined
        ? 'не в сети'
        : `не в сети, был(а) в сети до ${server(seen.serverTime)} по времени Telegram`
    }
    if (seen.state === 'unavailable') return 'Telegram не отдаёт данные об этом пользователе'
    if (seen.state === 'bot') return 'это бот, статуса у него нет'

    const mine = seen.hiddenByMe
      ? ' — аккаунт сам скрывает своё время, и Telegram отвечает тем же'
      : ''

    return `точное время скрыто: ${VAGUE[seen.state] ?? seen.state}${mine}`
  }

  /**
   * What can be said of an online interval when it ends.
   *
   * A figure is given only as an estimate, and never as a bound on how long the
   * user was online. It runs from the first moment this program saw the user
   * online to the last-seen time Telegram reports, and what it rests on is said
   * with it: the user may have arrived earlier, after the check before; nothing
   * shows they stayed online in between; and its two ends are read off two
   * clocks taken to agree. Where the ends contradict each other — a last-seen
   * before the first sighting, or after the moment it was learned — no figure
   * is given at all.
   */
  function closing(
    open: OpenInterval,
    end: number | undefined,
    why: string | undefined,
    noticedAt: number,
  ): string {
    if (open.broken !== undefined) {
      return `наблюдение прервано: ${open.broken}; интервал не оценивается`
    }
    if (!open.startKnown) {
      return 'интервал не оценивается: пользователь уже был в сети, когда началось наблюдение, и когда он вошёл — неизвестно'
    }
    const first = `первое наблюдение «в сети» — ${local(open.at)} (${sourceName(open.source)})`
    if (why !== undefined) return `интервал не завершён: ${first}; ${why}`
    if (end === undefined) return `интервал не оценивается: ${first}; времени конца Telegram не дал`
    // Telegram's times are whole seconds and this clock's are not, so the two
    // are compared in whole seconds. A last-seen in the very second of the
    // first sighting says nothing of how long the visit lasted.
    const firstSecond = Math.floor(open.at / 1000)
    if (end < firstSecond) {
      return `интервал не оценивается: это время раньше, чем ${first}; наблюдение устарело или часы компьютера и Telegram расходятся`
    }
    if (end * 1000 > noticedAt + CLOCK_TOLERANCE) {
      return `интервал не оценивается: это время позже момента, когда оно получено (${local(noticedAt)}); часы компьютера и Telegram расходятся`
    }
    if (end === firstSecond) {
      return `интервал не оценивается: время Telegram приходится на ту же секунду, что и ${first}; время Telegram записано с точностью до секунды, и длительность по нему не оценить`
    }

    const lines = [
      `оценка интервала: ${duration((end - firstSecond) * 1000)} — от первого наблюдения «в сети» (${sourceName(open.source)}, ${local(open.at)}) до времени Telegram, с точностью до секунды`,
    ]
    if (open.after !== undefined && open.after < open.at) {
      lines.push(
        `вход мог произойти раньше — после предыдущей проверки в ${local(open.after)}, когда статус ещё не был «в сети»; тогда оценка — до ${duration((end - Math.floor(open.after / 1000)) * 1000)}`,
      )
    }
    lines.push(
      'это оценка, а не измерение: непрерывность между наблюдениями не подтверждена, часы компьютера и Telegram считаются согласованными',
    )

    return lines.join('\n')
  }

  // ---- the observation model ----------------------------------------------

  /**
   * Take one observation into a record: what it becomes, and what to say.
   *
   * The whole of the judgement is here, and it is pure: the same record and the
   * same observation give the same answer, whichever of the two sources it
   * came from.
   */
  function observe(
    record: WatchRecord,
    presence: UserPresence | undefined,
    at: number,
    source: Seen['source'],
  ): Observed {
    const stamp = presence?.state === 'online' ? presence.onlineUntil : presence?.lastSeen
    const seen: Seen = {
      state: presence?.state ?? 'unavailable',
      // A time that is not a positive number of seconds is no time at all.
      serverTime: stamp !== undefined && Number.isFinite(stamp) && stamp > 0 ? stamp : undefined,
      at,
      source,
      hiddenByMe: presence?.hiddenByMe ?? false,
    }
    const before = record.last

    // Older than what is held, by Telegram's own times: it says nothing of how
    // things stand now, so it is not a check either.
    if (superseded(before, seen)) return { record, say: [] }
    // The same thing said again is not news. A read that says it is still a
    // check of how things stand; an update that repeats itself is a repetition.
    if (before?.state === seen.state && before.serverTime === seen.serverTime) {
      return { record: source === 'update' ? record : { ...record, checked: at }, say: [] }
    }

    const next = { ...record, checked: at, last: seen }
    if (seen.state === 'online') return cameOnline(next, before, seen, record.checked)
    if (seen.state === 'offline') return wentOffline(next, before, seen)

    return wentVague(next, before, seen)
  }

  /**
   * The last-seen time of an observation, where it can be reasoned from.
   *
   * One that lies ahead of the moment it was learned, by more than the two
   * clocks may differ, is not: either it is wrong or this machine's clock is,
   * and nothing is concluded from it.
   */
  function lastSeenOf(seen: Seen | undefined): number | undefined {
    if (seen?.state !== 'offline' || seen.serverTime === undefined) return undefined

    return seen.serverTime * 1000 > seen.at + CLOCK_TOLERANCE ? undefined : seen.serverTime
  }

  /**
   * Whether Telegram's own times show an observation to be older than the one held.
   *
   * The only ordering here that speaks of Telegram's chronology rather than of
   * when something reached this process, and it rests on two things alone: a
   * last-seen time never moves back, and an online status runs out after it was
   * issued. So against a known last-seen, an earlier last-seen is older, and so
   * is an online status that had run out by then. Such an observation arrived
   * late — a delayed update, a slow answer — and is not allowed to undo what is
   * newer. Where the times cannot settle it, nothing is assumed: an online
   * status that outlives the known last-seen may still be the older of the two,
   * and is taken in the order it was processed.
   */
  function superseded(before: Seen | undefined, seen: Seen): boolean {
    const known = lastSeenOf(before)
    if (known === undefined || seen.serverTime === undefined) return false
    if (seen.state === 'offline') return seen.serverTime < known

    return seen.state === 'online' && seen.serverTime <= known
  }

  /**
   * Online now. An interval opens, unless the user was already held to be online.
   *
   * Online after online is the same interval whatever its expiry says: a status
   * that is renewed, or repeated with another expiry, is not somebody arriving.
   */
  function cameOnline(
    next: WatchRecord,
    before: Seen | undefined,
    seen: Seen,
    lastChecked: number | undefined,
  ): Observed {
    // Still online, with another expiry: the status was renewed, nobody arrived.
    if (before?.state === 'online') return { record: next, say: [] }

    const open: OpenInterval = {
      at: seen.at,
      // Already online when watching began: when the user arrived was not seen.
      startKnown: before !== undefined,
      // The user was last known not to be online at the latest check, which may
      // be later than when that state was first seen.
      after: lastChecked ?? before?.at,
      source: seen.source,
      broken: undefined,
    }
    // The first observation of a watch is reported by the answer to `/watch`.
    if (before === undefined) return { record: { ...next, open }, say: [] }

    const until =
      seen.serverTime === undefined
        ? ''
        : `\nстатус действует до: ${server(seen.serverTime)} (время Telegram)`

    return {
      record: { ...next, open },
      say: [
        `🟢 ${who(next)} в сети\nзамечено: ${local(seen.at)} (местное время, ${sourceName(seen.source)}); когда пользователь вошёл, Telegram не сообщает${until}`,
      ],
    }
  }

  /** Offline now, with Telegram's own time for when the user was last online. */
  function wentOffline(next: WatchRecord, before: Seen | undefined, seen: Seen): Observed {
    const closed = { ...next, open: undefined }
    if (before === undefined) return { record: closed, say: [] }

    const until =
      seen.serverTime === undefined
        ? '\nкогда пользователь был в сети в последний раз, Telegram не сообщил'
        : `\nбыл(а) в сети до: ${server(seen.serverTime)} (время Telegram)`
    const head = `⚪ ${who(next)} не в сети${until}\nзамечено: ${local(seen.at)} (местное время, ${sourceName(seen.source)})`

    if (next.open !== undefined) {
      return {
        record: closed,
        say: [`${head}\n${closing(next.open, seen.serverTime, undefined, seen.at)}`],
      }
    }

    return { record: closed, say: [`${head}${unseenVisit(before, seen)}`] }
  }

  /**
   * Offline before and offline now, with a later last-seen: by Telegram's own
   * account the user was online in between. Nothing of that visit was observed,
   * so it is reported as a fact with no length — and only where both times can
   * be reasoned from.
   */
  function unseenVisit(before: Seen, seen: Seen): string {
    if (before.state !== 'offline' || seen.serverTime === undefined) return ''
    if (lastSeenOf(seen) === undefined) {
      return '\nэто время позже момента, когда оно получено: часы компьютера и Telegram расходятся, выводов из него не делается'
    }
    if (lastSeenOf(before) === undefined) return ''

    return '\nэто позже, чем сообщалось раньше: по данным Telegram пользователь был в сети между двумя наблюдениями; сам интервал не наблюдался, его длительность неизвестна'
  }

  /** Hidden, coarse or unavailable: no time to report, and none is made up. */
  function wentVague(next: WatchRecord, before: Seen | undefined, seen: Seen): Observed {
    const say: string[] = []
    if (next.open !== undefined) {
      say.push(
        `◻ ${who(next)}: ${closing(next.open, undefined, 'затем точное время перестало быть доступно', seen.at)}`,
      )
    }
    // Said once, on the way in: from a status with a time, or between "hidden"
    // and "unavailable". One vague state giving way to another is not news.
    const wasVague = before !== undefined && !isPrecise(before.state)
    const kindChanged = (before?.state === 'unavailable') !== (seen.state === 'unavailable')
    if (before !== undefined && (!wasVague || kindChanged)) {
      say.push(
        `◽ ${who(next)}: ${describe(seen)}\nнаблюдение продолжается, переходы не определяются`,
      )
    }

    return { record: { ...next, open: undefined }, say }
  }

  /** Mark every open interval as interrupted: something happened that was not seen. */
  async function interrupt(reason: string): Promise<void> {
    for (const record of await all()) {
      if (record.open === undefined || record.open.broken !== undefined) continue
      await store.set(keyOf(record.id), { ...record, open: { ...record.open, broken: reason } })
    }
  }

  // ---- notifications ------------------------------------------------------

  /** Keep a record and what is to be said about it in one write, then try to say it. */
  async function keep(record: WatchRecord, say: readonly string[]): Promise<void> {
    const outbox = [...record.outbox, ...say.map((text) => ({ text, tries: 0 }))]
    await store.set(keyOf(record.id), { ...record, outbox })
  }

  async function deliver(text: string): Promise<'sent' | 'later' | 'failed'> {
    if (now() < writeAfter) return 'later'
    try {
      await bot.api.sendMessage({ chat_id: operatorId, text, parse_mode: 'HTML' })

      return 'sent'
    } catch (error) {
      if (error instanceof FloodError) {
        writeAfter = now() + error.retryAfter * 1000
        log(`the bot was asked to wait ${error.retryAfter} s before writing again`)

        return 'later'
      }
      log(
        `a notification was not delivered: ${error instanceof Error ? error.message : String(error)}`,
      )

      return 'failed'
    }
  }

  /**
   * Deliver what is waiting, oldest first, stopping at the first that does not go.
   *
   * A notification leaves the outbox only after Telegram accepted it, so one
   * that was sent just before a crash is sent again on the next start: at least
   * once, not exactly once. One that fails `MAX_TRIES` times is dropped, so a
   * message Telegram will never take cannot hold the rest back for ever.
   */
  const flush = (): Promise<void> => serialized(flushNow)

  async function flushNow(): Promise<void> {
    const drain = async (
      outbox: readonly Pending[],
      write: (left: readonly Pending[]) => Promise<void>,
    ): Promise<boolean> => {
      let left = [...outbox]
      while (left.length > 0) {
        const [first, ...rest] = left as [Pending, ...Pending[]]
        const outcome = await deliver(first.text)
        if (outcome === 'later') return false
        if (outcome === 'failed' && first.tries + 1 < MAX_TRIES) {
          await write([{ ...first, tries: first.tries + 1 }, ...rest])

          return false
        }
        if (outcome === 'failed') log('a notification was given up on after repeated failures')
        left = rest
        await write(left)
      }

      return true
    }

    const kept = await meta()
    if (!(await drain(kept.outbox, (outbox) => store.set('meta', { ...kept, outbox })))) return

    for (const id of await index()) {
      const record = await load(id)
      if (record === undefined || record.outbox.length === 0) continue
      const done = await drain(record.outbox, (outbox) =>
        store.set(keyOf(id), { ...record, outbox }),
      )
      if (!done) return
    }
  }

  // ---- reading ------------------------------------------------------------

  /**
   * Have the one timer fire after `delay`, unless it already fires sooner.
   *
   * One timer, so reads cannot pile up: asking for a later read while an
   * earlier one is waiting changes nothing.
   */
  function arrange(delay: number): void {
    if (!running) return
    const at = now() + Math.max(0, delay)
    if (cancelTimer !== undefined && timerAt <= at) return

    cancelTimer?.()
    timerAt = at
    cancelTimer = schedule(
      () => {
        cancelTimer = undefined
        timerAt = Number.POSITIVE_INFINITY
        void poll()
      },
      Math.max(0, delay),
    )
  }

  /** Ask for a read sooner than the timer would, within the limit on extra reads. */
  function sooner(at: number = now()): void {
    arrange(Math.max(at, lastPollStarted + EXTRA_POLL_GAP, readAfter) - now())
  }

  /** An online status ends by itself when nothing renews it: a reason to look again, no more. */
  function lookAfter(seen: Seen | undefined): void {
    if (seen?.state !== 'online' || seen.serverTime === undefined) return
    const runsOut = seen.serverTime * 1000 + EXPIRY_MARGIN
    // Only a status that has yet to run out: one already past is left to the
    // ordinary timer, so a stale status cannot quicken the reads.
    if (runsOut > now()) sooner(runsOut)
  }

  /** Read everybody watched once. Answers whether there is anybody to go on reading. */
  async function read(): Promise<boolean> {
    const startedAt = now()
    if (startedAt < readAfter) return true
    const watched = await all()
    if (watched.length === 0) return false

    lastPollStarted = startedAt
    const asked = arrivals
    const link = drops
    let views: Awaited<ReturnType<Account['peersOf']>>
    try {
      // One request for everybody watched; the account pages it if it must.
      views = await account.peersOf(
        watched.map((record) => ({ kind: 'user' as const, id: BigInt(record.id) })),
      )
    } catch (error) {
      // A read that did not happen says nothing about anybody. It only means an
      // interval being measured can no longer be vouched for.
      if (error instanceof FloodError) {
        readAfter = now() + error.retryAfter * 1000
        backoff = Math.min(backoff * 2, MAX_BACKOFF)
        log(
          `reading was refused for ${error.retryAfter} s; the next reads are spaced ${backoff}× wider`,
        )
        await serialized(() =>
          interrupt(
            `Telegram попросил подождать ${error.retryAfter} с, и статус в это время не читался`,
          ),
        )
      } else {
        log(`a read failed: ${error instanceof Error ? error.message : String(error)}`)
        await serialized(() => interrupt(`чтение статуса не удалось в ${local(now())}`))
      }

      return true
    }
    backoff = 1

    // The link dropped while the request travelled: when this answer was true
    // cannot be told, so it is not taken for how things stand now.
    if (link !== drops) {
      sooner()

      return true
    }

    await serialized(async () => {
      const at = now()
      for (const [position, was] of watched.entries()) {
        const record = await load(was.id)
        // Unwatched while the read was in flight.
        if (record === undefined) continue
        // Something was learned of this user after this request left — an
        // update that arrived while it travelled, or the user unwatched and
        // watched again. Which of the two Telegram produced later cannot be
        // told, so the answer to the earlier request is not allowed to undo
        // what was taken in since; the next read, asked for after both,
        // settles it. Everybody else in the same answer is judged separately.
        if ((learned.get(record.id) ?? 0) > asked) {
          sooner()
          continue
        }

        const view = views[position]
        const user = view instanceof UserView ? view : undefined
        const renamed =
          user !== undefined && user.username !== record.username ? user.username : record.renamed
        const result = observe({ ...record, renamed }, user?.presence, at, 'poll')
        await keep(result.record, result.say)
        lookAfter(result.record.last)
      }
      // A sign of life, so a crash is measured from the last read and not from the start.
      await store.set('meta', { ...(await meta()), alive: at })
    })
    await flush()

    return true
  }

  function poll(): Promise<void> {
    // One read at a time. A second request while one is travelling joins it.
    polling ??= read()
      .catch((error: unknown) => {
        log(`a read failed: ${error instanceof Error ? error.message : String(error)}`)

        return true
      })
      .then((anybody) => {
        polling = undefined
        // With nobody to watch the timer rests; `/watch` starts it again.
        if (running && anybody) arrange(Math.max(pollEvery * backoff, readAfter - now()))
      })

    return polling
  }

  const onStatus = async (event: MtprotoContext): Promise<void> => {
    const id = event.target?.id
    const presence = event.presence
    if (id === undefined || presence === undefined) return

    await serialized(async () => {
      const record = await load(String(id))
      if (record === undefined) return
      const result = observe(record, presence, now(), 'update')
      learned.set(record.id, ++arrivals)
      await keep(result.record, result.say)
      lookAfter(result.record.last)
    })
    await flush()
  }

  // ---- the operator's commands --------------------------------------------

  async function findWatch(target: string): Promise<WatchRecord | undefined> {
    const wanted = target.replace(/^@/, '').toLowerCase()
    const watched = await all()

    return (
      watched.find((record) => record.id === target) ??
      watched.find((record) => record.username?.toLowerCase() === wanted)
    )
  }

  /** Why a name could not be looked up, in the operator's words. */
  function lookupFailure(error: unknown, handle: string): string {
    if (error instanceof FloodError) {
      return `Telegram просит подождать ${error.retryAfter} с. Повторите команду позже.`
    }
    const unknownName = error instanceof RpcError && error.text.startsWith('USERNAME_')
    if (error instanceof PeerError || unknownName) return `Пользователь ${handle} не найден.`

    log(`resolving a name failed: ${error instanceof Error ? error.message : String(error)}`)

    return 'Не удалось обратиться к Telegram. Повторите позже.'
  }

  /** Find the user a name stands for, or say in the operator's words why there is none to watch. */
  async function resolveUser(name: string): Promise<UserView | string> {
    const handle = `@${escapeHtml(name)}`
    let found: Awaited<ReturnType<Account['peer']>>
    try {
      found = await account.peer(`@${name}`)
    } catch (error) {
      return lookupFailure(error, handle)
    }

    if (!(found instanceof UserView)) {
      return `${handle} — группа или канал, а не пользователь. Наблюдать можно только за пользователем.`
    }
    if (found.isBot) return `${handle} — бот. У ботов нет статуса «в сети».`
    if (found.isSelf) return 'Это сам наблюдающий аккаунт.'
    if (found.isDeleted) return 'Этот аккаунт удалён.'

    return found
  }

  async function watch(argument: string): Promise<string> {
    const named = USERNAME.exec(argument)
    if (named?.[1] === undefined) {
      return 'Укажите имя пользователя: <code>/watch @username</code>. По номеру или ссылке пользователя найти нельзя.'
    }
    if ((await index()).length >= limit) {
      return `Наблюдаемых уже ${limit} — это предел. Снимите кого-нибудь через /unwatch.`
    }

    const user = await resolveUser(named[1])
    if (typeof user === 'string') return user

    const id = String(user.id)

    return await serialized(async () => {
      if ((await load(id)) !== undefined)
        return `За ${escapeHtml(user.displayName)} наблюдение уже идёт.`

      const at = now()
      const fresh: WatchRecord = {
        id,
        username: user.username,
        renamed: undefined,
        name: user.displayName,
        since: at,
        checked: undefined,
        last: undefined,
        open: undefined,
        outbox: [],
      }
      const { record } = observe(fresh, user.presence, at, 'watch')
      learned.set(id, ++arrivals)
      await store.set(keyOf(id), record)
      await store.set('index', [...(await index()), id])
      arrange(pollEvery)
      lookAfter(record.last)

      const unknownStart =
        record.open === undefined
          ? ''
          : '\nКогда пользователь вошёл, неизвестно: наблюдение началось позже.'

      return (
        `👁 Наблюдение начато: ${identity(record)}\n` +
        `Сейчас: ${describe(record.last)}.${unknownStart}\n` +
        'Видно только то, что Telegram показывает этому аккаунту; наблюдение привязано к пользователю, а не к имени.'
      )
    })
  }

  async function unwatch(argument: string): Promise<string> {
    if (argument === '')
      return 'Кого снять с наблюдения? <code>/unwatch @username</code> или <code>/unwatch id</code> — см. /list.'

    return await serialized(async () => {
      const record = await findWatch(argument)
      if (record === undefined) return 'Такого наблюдения нет. Список с идентификаторами — /list.'

      await store.delete(keyOf(record.id))
      await store.set(
        'index',
        (await index()).filter((id) => id !== record.id),
      )
      const open =
        record.open === undefined
          ? ''
          : `\n${closing({ ...record.open, broken: record.open.broken ?? 'остановлено командой' }, undefined, undefined, now())}`

      return `Наблюдение остановлено: ${identity(record)}${open}`
    })
  }

  async function list(): Promise<string> {
    const watched = await all()
    if (watched.length === 0) return 'Никого не наблюдаем. Начать: <code>/watch @username</code>.'

    return [
      `Наблюдаем ${watched.length} из ${limit}:`,
      ...watched.map(
        (record) => `• ${identity(record)} — с ${local(record.since)}; ${describe(record.last)}`,
      ),
    ].join('\n')
  }

  /** Everything known of one watched user, line by line. */
  function statusOf(record: WatchRecord): string {
    const seen = record.last
    const lines = [identity(record), `сейчас: ${describe(seen)}`]
    if (seen !== undefined) {
      lines.push(`получено: ${local(seen.at)} (местное время, ${sourceName(seen.source)})`)
    }
    if (record.checked !== undefined) {
      lines.push(
        `последняя проверка: ${local(record.checked)}, ${duration(now() - record.checked)} назад`,
      )
    }
    if (record.open?.broken !== undefined) {
      lines.push(`наблюдение текущего интервала прервано: ${record.open.broken}`)
    } else if (record.open !== undefined) {
      lines.push(
        record.open.startKnown
          ? `первое наблюдение «в сети»: ${local(record.open.at)} (${sourceName(record.open.source)})`
          : 'был(а) в сети уже при начале наблюдения — когда вошёл(ла), неизвестно',
      )
    }
    if (record.renamed !== undefined) {
      lines.push(`имя пользователя сменилось: теперь @${escapeHtml(record.renamed)}`)
    }

    return lines.join('\n')
  }

  async function status(argument: string): Promise<string> {
    if (argument !== '') {
      const record = await findWatch(argument)

      return record === undefined ? 'Такого наблюдения нет. Список — /list.' : statusOf(record)
    }

    const watched = await all()

    return watched.length === 0 ? 'Никого не наблюдаем.' : watched.map(statusOf).join('\n\n')
  }

  /** What each command answers with. Reached only by the operator. */
  const commands: Readonly<Record<string, (argument: string) => Promise<string> | string>> = {
    start: () => HELP,
    help: () => HELP,
    watch,
    unwatch,
    list,
    status,
  }

  const onMessage = async (message: MessageContext): Promise<void> => {
    const command = parseCommand(message.text)
    if (command === undefined) return

    // Before anything else, and before the account is touched: only the
    // operator, and only in the operator's own chat with the bot.
    if (message.chat.type !== 'private') return
    if (message.sender?.id !== operatorId || message.chat.id !== operatorId) {
      // The sender's own identifier is theirs to know, and is what an operator
      // setting the bot up needs to put in its configuration.
      const theirs =
        message.sender?.id === undefined ? '' : ` Ваш идентификатор: ${message.sender.id}.`
      await message.reply(`Этот бот принимает команды только от своего оператора.${theirs}`)

      return
    }

    const run = commands[command.name]
    const answer =
      run === undefined
        ? 'Неизвестная команда. /help — список команд.'
        : await run(command.args[0] ?? '')

    await message.reply(answer, { parse_mode: 'HTML' })
  }

  // ---- lifecycle ----------------------------------------------------------

  let unsubscribe: (() => void) | undefined

  async function connection(status: string): Promise<void> {
    if (status !== 'connected') {
      if (offlineSince === undefined) drops += 1
      offlineSince ??= now()

      return
    }
    if (offlineSince === undefined) return

    const from = offlineSince
    offlineSince = undefined
    await serialized(() => interrupt(`соединение прерывалось с ${local(from)} по ${local(now())}`))
    sooner()
  }

  return {
    get scheduled(): boolean {
      return cancelTimer !== undefined
    },

    async start(): Promise<void> {
      if (running) return
      running = true

      await serialized(async () => {
        const kept = await meta()
        const watched = await all()
        const at = now()

        // Nobody was looking between the last sign of life and now. An interval
        // open across that time cannot be measured, and the operator is told.
        if (kept.alive !== undefined && watched.length > 0) {
          // `alive` is the last read that was written down or a clean stop, so
          // the gap is stated from there: it may begin a little early, never late.
          const gap = `наблюдение не велось с ${local(kept.alive)} по ${local(at)}`
          await interrupt(gap)
          await store.set('meta', {
            alive: at,
            outbox: [
              ...kept.outbox,
              {
                text: `↻ Наблюдение возобновлено: ${gap}. Что было в это время, неизвестно. Наблюдаемых: ${watched.length}.`,
                tries: 0,
              },
            ],
          })
        } else {
          await store.set('meta', { ...kept, alive: at })
        }
      })

      bot.on('message', onMessage)
      account.on('mtproto:user_status', onStatus)
      unsubscribe = account.onConnectionStatus((status) => void connection(status))

      await flush()
      if ((await index()).length > 0) arrange(0)
    },

    async stop(): Promise<void> {
      if (!running) return
      running = false
      cancelTimer?.()
      cancelTimer = undefined
      timerAt = Number.POSITIVE_INFINITY
      unsubscribe?.()
      unsubscribe = undefined
      bot.off(onMessage as never)
      account.off(onStatus as never)

      await polling
      await queue
      await serialized(async () => store.set('meta', { ...(await meta()), alive: now() }))
    },

    poll,
    connection,

    async settled(): Promise<void> {
      // A read may queue a change, and a change may ask for a read.
      for (let quiet = false; !quiet; ) {
        const [read, change] = [polling, queue]
        await read
        await change
        quiet = polling === read && queue === change
      }
    },
  }
}
