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
import { CHECKS, type LiveAccount, type LiveBot, type LiveCheck } from '../src/checks.js'
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
  bot: { token: TOKEN, chat: '-100200' },
  account: undefined,
  secrets: [TOKEN],
  ...overrides,
})

/** A bot that answers from memory and records what it was asked. */
function standInBot(calls: string[], failWith?: Error): LiveBot {
  return {
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
        return true
      },
    },
  }
}

describe('reading the environment', () => {
  it('configures nothing and runs nothing when nothing is set', () => {
    expect(readEnvironment({})).toEqual({
      checks: [],
      allowWrites: false,
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
      'account.connect': 'it needs account, which is not configured',
      'no.such': 'no such check',
    })
  })

  it('refuses a write check whose chat was not named, even with writes allowed', () => {
    const chosen = select(
      environment({
        checks: ['bot.message'],
        allowWrites: true,
        bot: { token: TOKEN, chat: undefined },
      }),
    )

    expect(chosen.refused.get('bot.message')).toMatch(/needs bot chat/)
  })

  it('keeps every write check out of the read tier', () => {
    const writes = CHECKS.filter((check) => /message|saved|draft|update/.test(check.id))
    expect(writes.every((check) => check.tier === 'write')).toBe(true)
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
    expect(listed.out).toContain('YUIGRAM_LIVE_ALLOW_WRITES')

    const idle = run([], { YUIGRAM_LIVE_BOT_TOKEN: TOKEN })
    expect(idle.code).toBe(2)
    expect(idle.out).toMatch(/names no checks; nothing was run/)
    expect(idle.out).not.toContain(TOKEN)
  }, 30_000)
})
