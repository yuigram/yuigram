/**
 * `pnpm --filter @yuigram/live live [--list]`
 *
 * With `--list`, prints every check, its tier, what it needs and what a pass
 * looks like, and touches nothing. Otherwise runs the checks named in
 * `YUIGRAM_LIVE_CHECKS` and prints one scrubbed line per check. The exit code
 * is non-zero if any check failed or was refused.
 *
 * See docs/live-verification.md for the variables and the checklist.
 */

import { Account, Bot, createLogger, memory, silentSink } from 'yuigram'
import { CHECKS, type LiveAccount, type LiveBot, type StreamFunction } from './checks.js'
import { EnvironmentError, readEnvironment, VARIABLES } from './environment.js'
import { scrubber } from './redact.js'
import { runChecks } from './runner.js'

if (process.argv.includes('--list')) {
  for (const check of CHECKS) {
    process.stdout.write(
      `${check.id.padEnd(20)} ${check.tier.padEnd(6)} needs ${check.needs.join(', ')}\n`,
    )
    process.stdout.write(`${''.padEnd(28)}${check.does}; expects ${check.expects}\n`)
  }
  process.stdout.write('\nvariables:\n')
  for (const [name, meaning] of Object.entries(VARIABLES))
    process.stdout.write(`  ${name}\n    ${meaning}\n`)
  process.exit(0)
}

let environment: ReturnType<typeof readEnvironment>
try {
  environment = readEnvironment(process.env)
} catch (error) {
  process.stderr.write(
    `${error instanceof EnvironmentError ? error.message : 'the environment could not be read'}\n`,
  )
  process.exit(2)
}

if (environment.checks.length === 0) {
  process.stderr.write(
    'YUIGRAM_LIVE_CHECKS names no checks; nothing was run. Use --list to see them.\n',
  )
  process.exit(2)
}

const scrub = scrubber(environment.secrets)
const log = createLogger({ sink: silentSink() })

const reports = await runChecks(
  environment,
  {
    bot: () => {
      const settings = environment.bot
      if (settings === undefined) throw new Error('no bot is configured')
      return Bot.fromToken(settings.token, { log }) as unknown as LiveBot
    },
    account: async () => {
      const settings = environment.account
      if (settings === undefined) throw new Error('no account is configured')
      const options = [
        ...(settings.dc === undefined
          ? []
          : [
              {
                id: settings.dc.id,
                host: settings.dc.host,
                port: settings.dc.port,
                ipv6: settings.dc.host.includes(':'),
                mediaOnly: false,
                cdn: false,
                secret: undefined,
                tcpoOnly: false,
                thisPortOnly: false,
                static: false,
              },
            ]),
      ]
      return Account.fromString(settings.session, {
        apiId: settings.apiId,
        apiHash: settings.apiHash,
        keys: settings.keys,
        bootstrap: { thisDc: settings.dc?.id ?? 2, testMode: settings.testMode, options },
        // Nothing is kept: the session string is re-supplied on every run.
        storage: memory(),
        name: 'live',
        format: settings.format,
        log,
      }) as unknown as LiveAccount
    },
    // Loaded only when a check streams, as an application would load it.
    stream: async () => (await import('yuigram/stream')).streamTo as unknown as StreamFunction,
  },
  scrub,
)

let failed = false
for (const report of reports) {
  if (report.status !== 'passed') failed = true
  process.stdout.write(
    `${report.status.toUpperCase().padEnd(8)} ${report.id} (${report.milliseconds} ms)\n${report.observations
      .map((line) => `         ${line}\n`)
      .join('')}`,
  )
}
process.exit(failed ? 1 : 0)
