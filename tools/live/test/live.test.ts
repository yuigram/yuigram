/**
 * The live harness, without Telegram.
 *
 * What is asserted is what makes it safe to hand to somebody with real
 * credentials: it runs nothing it was not told to, writes nothing unless
 * writes were allowed, undoes what a write check did even when the check
 * fails, and prints nothing it was given.
 */

import { execFileSync } from 'node:child_process'
import { generateKeyPairSync } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { Account, Bot } from 'yuigram'
import {
  CHECKS,
  FILE_NAME,
  fileBytes,
  firstDifference,
  type LiveAccount,
  type LiveBot,
  type LiveCheck,
} from '../src/checks.js'
import { EnvironmentError, type LiveEnvironment, readEnvironment } from '../src/environment.js'
import { scrubber, shortId } from '../src/redact.js'
import { runChecks, select } from '../src/runner.js'

const TOKEN = '123456789:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const PEM = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({
  type: 'pkcs1',
  format: 'pem',
}) as string
const SESSION = `${'A'.repeat(346)}==`

const accountEnv = {
  YUIGRAM_LIVE_API_ID: '12345',
  YUIGRAM_LIVE_API_HASH: 'a-secret-api-hash',
  YUIGRAM_LIVE_SESSION: SESSION,
  YUIGRAM_LIVE_SERVER_KEYS: '/keys.pem',
}

const environment = (overrides: Partial<LiveEnvironment> = {}): LiveEnvironment => ({
  checks: [],
  allowWrites: false,
  allowSession: false,
  bot: { token: TOKEN, chat: '-100200', testMode: false },
  account: undefined,
  secrets: [TOKEN],
  ...overrides,
})

/** How a stand-in bot's file calls behave. */
interface FileBehaviour {
  /** What a download answers. The bytes that went up, unless given. */
  readonly downloaded?: (sent: Uint8Array) => Uint8Array
  /** Make deleting a message fail. */
  readonly deleteFails?: Error
}

/** A bot that answers from memory and records what it was asked. */
function standInBot(calls: string[], failWith?: Error, files: FileBehaviour = {}): LiveBot {
  let uploaded: Uint8Array = new Uint8Array(0)
  return {
    download: async (target) => {
      calls.push(`download ${target.file_id}`)
      return files.downloaded?.(uploaded) ?? uploaded
    },
    api: {
      getMe: async () => ({ id: 987654321, is_bot: true, username: 'live_bot' }),
      getWebhookInfo: async () => ({ url: '', pending_update_count: 0 }),
      getMyCommands: async () => [],
      sendMessage: async (params) => {
        calls.push(`send ${params.text}`)
        return { message_id: 11 }
      },
      editMessageText: async () => {
        calls.push('edit')
        if (failWith !== undefined) throw failWith
        return true
      },
      deleteMessage: async (params) => {
        calls.push(`delete ${params.message_id}`)
        if (files.deleteFails !== undefined) throw files.deleteFails
        return true
      },
      sendDocument: async (params) => {
        const document = params.document as { readonly data: Uint8Array; readonly filename: string }
        uploaded = document.data
        calls.push(`document ${document.filename} ${document.data.length}`)
        return { message_id: 12, document: { file_id: 'file-1' } }
      },
    },
  }
}

describe('reading the environment', () => {
  it('configures nothing and runs nothing when nothing is set', () => {
    expect(readEnvironment({})).toEqual({
      checks: [],
      allowWrites: false,
      allowSession: false,
      bot: undefined,
      account: undefined,
      secrets: [],
    })
  })

  it('refuses half an account, naming what is missing and never a value', () => {
    const failure = (() => {
      try {
        readEnvironment({ YUIGRAM_LIVE_API_HASH: 'a-secret-api-hash' })
      } catch (error) {
        return error as Error
      }
      return undefined
    })()

    expect(failure).toBeInstanceOf(EnvironmentError)
    expect(failure?.message).toMatch(/missing: apiId, session, keys/)
    expect(failure?.message).not.toContain('a-secret-api-hash')
  })

  it('reads a whole account, its keys and its datacenter, and lists every secret', () => {
    const read = readEnvironment(
      {
        ...accountEnv,
        YUIGRAM_LIVE_BOT_TOKEN: TOKEN,
        YUIGRAM_LIVE_DC: '2@149.154.167.50:443',
        YUIGRAM_LIVE_SESSION_FORMAT: 'tl-v3',
        YUIGRAM_LIVE_CHECKS: 'bot.identity, account.connect',
        YUIGRAM_LIVE_ALLOW_WRITES: '1',
      },
      () => PEM,
    )

    expect(read.checks).toEqual(['bot.identity', 'account.connect'])
    expect(read.allowWrites).toBe(true)
    expect(read.account).toMatchObject({
      apiId: 12345,
      format: 'tl-v3',
      dc: { id: 2, host: '149.154.167.50', port: 443 },
    })
    expect(read.account?.keys).toHaveLength(1)
    expect([...read.secrets].sort()).toEqual([TOKEN, 'a-secret-api-hash', SESSION].sort())
  })

  it('puts the bot on the test environment with the account, never one without the other', () => {
    const test = readEnvironment(
      { ...accountEnv, YUIGRAM_LIVE_BOT_TOKEN: TOKEN, YUIGRAM_LIVE_TEST_NETWORK: '1' },
      () => PEM,
    )
    const production = readEnvironment({ ...accountEnv, YUIGRAM_LIVE_BOT_TOKEN: TOKEN }, () => PEM)

    expect([test.bot?.testMode, test.account?.testMode]).toEqual([true, true])
    expect([production.bot?.testMode, production.account?.testMode]).toEqual([false, false])
  })

  it('refuses a layout it does not know and keys that are not keys', () => {
    expect(() =>
      readEnvironment({ ...accountEnv, YUIGRAM_LIVE_SESSION_FORMAT: 'other' }, () => PEM),
    ).toThrow(EnvironmentError)
    expect(() => readEnvironment(accountEnv, () => 'not a key')).toThrow(
      /could not be read as PEM keys/,
    )
  })
})

describe('choosing what runs', () => {
  it('runs only what was named, refusing unknown checks, writes without permission, and missing clients', () => {
    const chosen = select(
      environment({ checks: ['bot.identity', 'bot.message', 'account.connect', 'no.such'] }),
    )

    expect(chosen.run.map((check) => check.id)).toEqual(['bot.identity'])
    expect(Object.fromEntries(chosen.refused)).toEqual({
      'bot.message': 'it writes, and YUIGRAM_LIVE_ALLOW_WRITES is not 1',
      'account.connect':
        "it connects as the account, which binds a temporary key and records this client among the account's sessions, and YUIGRAM_LIVE_ALLOW_SESSION is not 1",
      'no.such': 'no such check',
    })
  })

  it('refuses a write check whose chat was not named, even with writes allowed', () => {
    const chosen = select(
      environment({
        checks: ['bot.message'],
        allowWrites: true,
        bot: { token: TOKEN, chat: undefined, testMode: false },
      }),
    )

    expect(chosen.refused.get('bot.message')).toMatch(/needs bot chat/)
  })

  it('keeps every write check out of the read tier', () => {
    const writes = CHECKS.filter((check) => /message|saved|draft|update/.test(check.id))
    expect(writes.every((check) => check.tier === 'write')).toBe(true)
  })

  it('never calls connecting as the account read-only', () => {
    const usingAccount = CHECKS.filter((check) => check.needs.includes('account'))
    expect(usingAccount.length).toBeGreaterThan(0)
    expect(usingAccount.every((check) => check.tier !== 'read')).toBe(true)
    expect(CHECKS.filter((check) => check.tier === 'read').map((check) => check.id)).toEqual([
      'bot.identity',
      'bot.webhook',
      'bot.commands',
    ])
  })

  it('refuses an account check without the session opt-in, writes allowed or not', () => {
    const account = {} as never
    for (const allowWrites of [false, true]) {
      const chosen = select(
        environment({ checks: ['account.connect', 'account.saved'], allowWrites, account }),
      )
      expect(chosen.run).toEqual([])
      expect(chosen.refused.get('account.connect')).toMatch(/YUIGRAM_LIVE_ALLOW_SESSION/)
    }
    const allowed = select(
      environment({ checks: ['account.connect'], allowSession: true, account }),
    )
    expect(allowed.run.map((check) => check.id)).toEqual(['account.connect'])
  })
})

describe('running', () => {
  it('passes the read checks against a bot, and prints its id shortened', async () => {
    const calls: string[] = []
    const reports = await runChecks(
      environment({ checks: ['bot.identity', 'bot.webhook', 'bot.commands'] }),
      { bot: () => standInBot(calls), account: async () => expect.unreachable() },
      scrubber([TOKEN]),
    )

    expect(reports.map((report) => [report.id, report.status])).toEqual([
      ['bot.identity', 'passed'],
      ['bot.webhook', 'passed'],
      ['bot.commands', 'passed'],
    ])
    expect(reports[0]?.observations[0]).toContain('id …321')
    expect(calls).toEqual([])
  })

  it('undoes what a write check did when it fails half-way, and reports the failure scrubbed', async () => {
    const calls: string[] = []
    const reports = await runChecks(
      environment({ checks: ['bot.message'], allowWrites: true }),
      {
        bot: () => standInBot(calls, new Error(`request failed for bot${TOKEN}`)),
        account: async () => expect.unreachable(),
      },
      scrubber([TOKEN]),
    )

    expect(calls).toEqual(['send yuigram live check: send', 'edit', 'delete 11'])
    expect(reports[0]?.status).toBe('failed')
    expect(reports[0]?.observations.join('\n')).not.toContain(TOKEN)
    expect(reports[0]?.observations.at(-1)).toMatch(/\[redacted/)
  })

  it('connects the account once for every check that uses it, and stops it at the end', async () => {
    const trail: string[] = []
    const account = {
      connect: async () => void trail.push('connect'),
      stop: async () => void trail.push('stop'),
      api: { call: async () => ({ this_dc: 2 }) },
      me: async () => ({ id: 5_555_555n, isBot: false }),
      dialogs: async function* () {
        yield {}
      },
    } as unknown as LiveAccount

    const reports = await runChecks(
      environment({
        checks: ['account.connect', 'account.identity', 'account.dialogs'],
        allowSession: true,
        account: {} as never,
      }),
      { bot: () => expect.unreachable(), account: async () => account },
      scrubber([]),
    )

    expect(reports.every((report) => report.status === 'passed')).toBe(true)
    expect(trail).toEqual(['connect', 'stop'])
  })

  it('stops a stream by abort and deletes whatever it sent', async () => {
    const deleted: number[][] = []
    const account = {
      connect: async () => undefined,
      stop: async () => undefined,
      me: async () => ({ id: 42n }),
      deleteMessages: async (_peer: unknown, ids: readonly number[]) => void deleted.push([...ids]),
    } as unknown as LiveAccount
    const pieces: string[] = []

    const reports = await runChecks(
      environment({
        checks: ['account.stream', 'account.mention'],
        allowWrites: true,
        allowSession: true,
        account: {} as never,
      }),
      {
        bot: () => expect.unreachable(),
        account: async () => account,
        stream: async () => async (_account, _peer, source, options) => {
          for await (const piece of source) {
            if (options.signal?.aborted === true) break
            pieces.push(piece)
          }
          return { messages: [{ id: 77 }], drafts: 2, aborted: options.signal?.aborted === true }
        },
      },
      scrubber([]),
    )

    expect(reports.map((report) => [report.id, report.status])).toEqual([
      ['account.mention', 'refused'],
      ['account.stream', 'passed'],
    ])
    expect(pieces).toEqual(['yuigram live check: stream ', 'still going '])
    expect(deleted).toEqual([[77]])
  }, 10_000)

  it('marks a check failed when an expectation does not hold', async () => {
    const failing: LiveCheck = {
      id: 'x.expect',
      tier: 'read',
      needs: [],
      does: 'nothing',
      expects: 'nothing',
      run: async (context) => context.expect(false, 'the impossible'),
    }
    const reports = await runChecks(
      environment({ checks: ['x.expect'] }),
      { bot: () => expect.unreachable(), account: async () => expect.unreachable() },
      scrubber([]),
      [failing],
    )

    expect(reports[0]).toMatchObject({
      status: 'failed',
      observations: ['expected: the impossible'],
    })
  })
})

/**
 * The file checks, offline.
 *
 * Prepared checks, not live verification: these hold the orchestration — what
 * is refused, what is compared, what is deleted and what is reported — against
 * stand-ins. Whether Telegram returns the same bytes is what the live run is for.
 */
describe('moving a file both ways', () => {
  /** A stand-in account that keeps what it was sent and answers a download from it. */
  function fileAccount(
    trail: string[],
    options: { readonly sentId?: number | undefined; readonly downloaded?: Uint8Array } = {},
  ) {
    let stored: Uint8Array = new Uint8Array(0)
    return {
      connect: async () => void trail.push('connect'),
      stop: async () => void trail.push('stop'),
      me: async () => ({ id: 42n }),
      upload: async (request: {
        readonly source: { readonly size?: number; read(o: number, l: number): Promise<Uint8Array> }
        readonly name?: string
      }) => {
        stored = await request.source.read(0, request.source.size ?? 0)
        trail.push(`upload ${request.name} ${request.source.size}`)
        return {
          file: { _: 'inputFile', id: 1n, parts: 1, name: request.name ?? '', md5_checksum: '' },
          fileId: 1n,
        }
      },
      sendMedia: async (_peer: unknown, media: { readonly _: string }) => {
        trail.push(`send ${media._}`)
        return {
          id: 'sentId' in options ? options.sentId : 501,
          message: {
            _: 'message',
            id: 501,
            media: {
              _: 'messageMediaDocument',
              document: {
                _: 'document',
                id: 9n,
                access_hash: 3n,
                file_reference: Uint8Array.of(7),
                date: 0,
                mime_type: 'application/octet-stream',
                size: BigInt(stored.length),
                dc_id: 2,
                attributes: [],
              },
            },
          },
        }
      },
      download: async (request: { readonly location: Record<string, unknown> }) => {
        trail.push(`download ${request.location['_']} ${String(request.location['id'])}`)
        return options.downloaded ?? stored
      },
      deleteMessages: async (_peer: unknown, ids: readonly number[]) =>
        void trail.push(`delete ${ids.join(',')}`),
    } as unknown as LiveAccount
  }

  /**
   * The command hands the real clients over through a cast, so this is where a
   * call the checks make and the clients do not offer would be caught: the
   * test tree is type-checked, and these assignments fail to compile if either
   * shape drifts.
   */
  it('makes only calls the real clients offer, in their shapes', () => {
    const shapes = (account: Account, bot: Bot) => {
      const accountCalls: Pick<
        LiveAccount,
        'upload' | 'sendMedia' | 'download' | 'deleteMessages'
      > = account
      const botCalls: Pick<LiveBot['api'], 'sendDocument' | 'deleteMessage'> = bot.api
      const botDownload: Pick<LiveBot, 'download'> = bot
      return [accountCalls, botCalls, botDownload]
    }

    expect(typeof shapes).toBe('function')
  })

  it('sends a fixed, harmless file whose every byte is known', () => {
    const bytes = fileBytes()

    expect(bytes).toHaveLength(4_000)
    expect(fileBytes()).toEqual(bytes)
    expect([...bytes.subarray(0, 4)]).toEqual([7, 38, 69, 100])
    expect(FILE_NAME).toBe('yuigram-live-check.bin')
    expect(firstDifference(bytes, bytes.slice())).toBeUndefined()
    expect(firstDifference(bytes, bytes.subarray(0, 10))).toBe(10)
  })

  it('refuses both without the write opt-in, and the account one without the session opt-in', async () => {
    const calls: string[] = []
    const reports = await runChecks(
      environment({ checks: ['bot.file', 'account.file'], account: {} as never }),
      { bot: () => standInBot(calls), account: async () => expect.unreachable() },
      scrubber([TOKEN]),
    )

    expect(reports.map((report) => [report.id, report.status])).toEqual([
      ['bot.file', 'refused'],
      ['account.file', 'refused'],
    ])
    expect(reports[0]?.observations[0]).toMatch(/YUIGRAM_LIVE_ALLOW_WRITES is not 1/)
    expect(calls).toEqual([])

    const withWrites = select(
      environment({ checks: ['account.file'], allowWrites: true, account: {} as never }),
    )
    expect(withWrites.refused.get('account.file')).toMatch(/YUIGRAM_LIVE_ALLOW_SESSION is not 1/)
  })

  it('sends a document through the bot, downloads it by its file_id and deletes it', async () => {
    const calls: string[] = []
    const reports = await runChecks(
      environment({ checks: ['bot.file'], allowWrites: true }),
      { bot: () => standInBot(calls), account: async () => expect.unreachable() },
      scrubber([TOKEN]),
    )

    expect(reports[0]?.status).toBe('passed')
    expect(calls).toEqual(['document yuigram-live-check.bin 4000', 'download file-1', 'delete 12'])
    expect(reports[0]?.observations).toContain('uploaded 4000 bytes, downloaded 4000, identical')
  })

  it('fails on bytes that came back different, and still deletes the message', async () => {
    const calls: string[] = []
    const reports = await runChecks(
      environment({ checks: ['bot.file'], allowWrites: true }),
      {
        bot: () =>
          standInBot(calls, undefined, {
            downloaded: (sent) => {
              const changed = sent.slice()
              changed[100] = (changed[100] ?? 0) ^ 0xff
              return changed
            },
          }),
        account: async () => expect.unreachable(),
      },
      scrubber([TOKEN]),
    )

    expect(reports[0]?.status).toBe('failed')
    expect(reports[0]?.observations).toContain(
      'uploaded 4000 bytes, downloaded 4000, first difference at byte 100',
    )
    expect(reports[0]?.observations).toContain(
      'expected: the downloaded bytes are the uploaded bytes',
    )
    expect(calls.at(-1)).toBe('delete 12')
  })

  it('keeps the first failure first when the cleanup fails too, and says so scrubbed', async () => {
    const calls: string[] = []
    const reports = await runChecks(
      environment({ checks: ['bot.file'], allowWrites: true }),
      {
        bot: () =>
          standInBot(calls, undefined, {
            downloaded: (sent) => sent.subarray(0, 10),
            deleteFails: new Error(`message to delete not found for bot${TOKEN}`),
          }),
        account: async () => expect.unreachable(),
      },
      scrubber([TOKEN]),
    )

    const observations = reports[0]?.observations ?? []
    const primary = observations.indexOf('expected: the downloaded bytes are the uploaded bytes')
    const cleanup = observations.findIndex((line) => line.startsWith('cleanup failed:'))
    expect(reports[0]?.status).toBe('failed')
    expect(primary).toBeGreaterThanOrEqual(0)
    expect(cleanup).toBeGreaterThan(primary)
    expect(observations.join('\n')).not.toContain(TOKEN)
  })

  it('uploads through the account, downloads from the message it sent, and deletes it', async () => {
    const trail: string[] = []
    const reports = await runChecks(
      environment({
        checks: ['account.file'],
        allowWrites: true,
        allowSession: true,
        account: {} as never,
      }),
      { bot: () => expect.unreachable(), account: async () => fileAccount(trail) },
      scrubber([]),
    )

    expect(reports[0]?.status).toBe('passed')
    expect(trail).toEqual([
      'connect',
      'upload yuigram-live-check.bin 4000',
      'send inputMediaUploadedDocument',
      'download inputDocumentFileLocation 9',
      'delete 501',
      'stop',
    ])
    expect(reports[0]?.observations).toContain('uploaded 4000 bytes, downloaded 4000, identical')
  })

  it('fails when the account cannot say which message it sent, since nothing could be deleted', async () => {
    const trail: string[] = []
    const reports = await runChecks(
      environment({
        checks: ['account.file'],
        allowWrites: true,
        allowSession: true,
        account: {} as never,
      }),
      {
        bot: () => expect.unreachable(),
        account: async () => fileAccount(trail, { sentId: undefined }),
      },
      scrubber([]),
    )

    expect(reports[0]?.status).toBe('failed')
    expect(reports[0]?.observations).toContain(
      'expected: the send names the message it made, so it can be deleted',
    )
    expect(trail.some((step) => step.startsWith('delete'))).toBe(false)
    expect(trail.at(-1)).toBe('stop')
  })

  it('fails the account round trip on different bytes and still deletes the message', async () => {
    const trail: string[] = []
    const reports = await runChecks(
      environment({
        checks: ['account.file'],
        allowWrites: true,
        allowSession: true,
        account: {} as never,
      }),
      {
        bot: () => expect.unreachable(),
        account: async () => fileAccount(trail, { downloaded: new Uint8Array(4_000) }),
      },
      scrubber([]),
    )

    expect(reports[0]?.status).toBe('failed')
    expect(reports[0]?.observations).toContain(
      'uploaded 4000 bytes, downloaded 4000, first difference at byte 0',
    )
    expect(trail).toContain('delete 501')
  })
})

describe('a stream the reader stops', () => {
  const deleting = (deleted: number[][]) =>
    ({
      connect: async () => undefined,
      stop: async () => undefined,
      deleteMessages: async (_peer: unknown, ids: readonly number[]) => void deleted.push([...ids]),
    }) as unknown as LiveAccount
  const environmentWith = (reader: string | undefined) =>
    environment({
      checks: ['account.stream-stop'],
      allowWrites: true,
      allowSession: true,
      account: { reader } as never,
    })

  it('is refused without a reader to stop it', () => {
    expect(select(environmentWith(undefined)).refused.get('account.stream-stop')).toMatch(
      /needs reader/,
    )
  })

  it('passes when the reader stopped it, letting them stop it, and deletes what it sent', async () => {
    const deleted: number[][] = []
    let allowed: boolean | undefined
    const reports = await runChecks(
      environmentWith('@reader'),
      {
        bot: () => expect.unreachable(),
        account: async () => deleting(deleted),
        // The source is not drained: a person's minute is not spent in a test.
        stream: async () => async (_account, peer, _source, options) => {
          allowed = options.canStop
          expect(peer).toBe('@reader')
          return { messages: [{ id: 5 }], drafts: 3, aborted: false, stopped: true }
        },
      },
      scrubber([]),
    )

    expect(reports[0]?.status).toBe('passed')
    expect(allowed).toBe(true)
    expect(reports[0]?.observations).toContain('drafts 3, stopped true, messages 1')
    expect(deleted).toEqual([[5]])
  })

  it('fails when nobody stopped it, and still deletes what it sent', async () => {
    const deleted: number[][] = []
    const reports = await runChecks(
      environmentWith('@reader'),
      {
        bot: () => expect.unreachable(),
        account: async () => deleting(deleted),
        stream: async () => async () => ({ messages: [{ id: 6 }], drafts: 30, aborted: false }),
      },
      scrubber([]),
    )

    expect(reports[0]?.status).toBe('failed')
    expect(reports[0]?.observations).toContain('expected: the reader stopped the stream')
    expect(deleted).toEqual([[6]])
  })
})

describe('what is printed', () => {
  it('scrubs the secrets it was given and anything shaped like a token or a key', () => {
    const scrub = scrubber(['a-secret-api-hash'])

    expect(scrub('hash a-secret-api-hash here')).toBe('hash [redacted] here')
    expect(scrub(`token ${TOKEN}`)).toBe('token [redacted token]')
    expect(scrub(`session ${'Qm'.repeat(40)}`)).toBe('session [redacted data]')
    expect(shortId(123456789n)).toBe('…789')
    expect(shortId(12)).toBe('12')
  })
})

describe('the command', () => {
  const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url))
  const run = (args: string[], env: Record<string, string> = {}) => {
    try {
      return {
        code: 0,
        out: execFileSync(process.execPath, ['--import', 'tsx', cli, ...args], {
          env: { PATH: process.env['PATH'] ?? '', ...env },
          encoding: 'utf8',
          stdio: 'pipe',
        }),
      }
    } catch (error) {
      const failure = error as { status: number; stdout: string; stderr: string }
      return { code: failure.status, out: failure.stdout + failure.stderr }
    }
  }

  it('lists the checks and the variables, and runs nothing without checks named', () => {
    const listed = run(['--list'])
    expect(listed.code).toBe(0)
    expect(listed.out).toContain('bot.identity')
    expect(listed.out).toContain('bot.file')
    expect(listed.out).toContain('account.file')
    expect(listed.out).toContain('YUIGRAM_LIVE_ALLOW_WRITES')

    const idle = run([], { YUIGRAM_LIVE_BOT_TOKEN: TOKEN })
    expect(idle.code).toBe(2)
    expect(idle.out).toMatch(/names no checks; nothing was run/)
    expect(idle.out).not.toContain(TOKEN)
  }, 30_000)
})
