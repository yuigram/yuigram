/**
 * Running the checks an operator named, and reporting what was seen.
 *
 * The rules that keep this safe to run, all enforced before anything connects:
 *
 * - Nothing runs that was not named. There is no "all".
 * - A write check runs only with writes allowed, and only when it was named.
 * - A check that needs a client or a chat that was not configured is refused.
 * - Every undo registered by a check runs, newest first, whatever the check did.
 * - Every line printed goes through the scrubber first.
 */

import {
  CHECKS,
  type CheckContext,
  type LiveAccount,
  type LiveBot,
  type LiveCheck,
  type StreamFunction,
} from './checks.js'
import type { LiveEnvironment } from './environment.js'
import type { Scrubber } from './redact.js'

/** How one check went. */
export interface CheckReport {
  readonly id: string
  readonly status: 'passed' | 'failed' | 'refused'
  readonly observations: readonly string[]
  readonly milliseconds: number
}

/** How the clients are made, so a test can supply stand-ins. */
export interface ClientFactories {
  bot(): LiveBot
  account(): Promise<LiveAccount>
  stream?(): Promise<StreamFunction>
}

/** Decide which checks may run, or why the request is refused. */
export function select(
  environment: LiveEnvironment,
  catalogue: readonly LiveCheck[] = CHECKS,
): { readonly run: readonly LiveCheck[]; readonly refused: ReadonlyMap<string, string> } {
  const refused = new Map<string, string>()
  const run: LiveCheck[] = []

  for (const id of environment.checks) {
    const check = catalogue.find((one) => one.id === id)
    if (check === undefined) {
      refused.set(id, 'no such check')
      continue
    }
    if (check.tier === 'write' && !environment.allowWrites) {
      refused.set(id, 'it writes, and YUIGRAM_LIVE_ALLOW_WRITES is not 1')
      continue
    }
    const missing = check.needs.filter(
      (need) =>
        (need === 'bot' && environment.bot === undefined) ||
        (need === 'account' && environment.account === undefined) ||
        (need === 'bot chat' && environment.bot?.chat === undefined) ||
        (need === 'account chat' && environment.account?.chat === undefined),
    )
    if (missing.length > 0) {
      refused.set(id, `it needs ${missing.join(' and ')}, which is not configured`)
      continue
    }
    run.push(check)
  }

  return { run, refused }
}

/** Run the selected checks one after another, and report each. */
export async function runChecks(
  environment: LiveEnvironment,
  factories: ClientFactories,
  scrub: Scrubber,
  catalogue: readonly LiveCheck[] = CHECKS,
): Promise<CheckReport[]> {
  const { run, refused } = select(environment, catalogue)
  const reports: CheckReport[] = [...refused].map(([id, why]) => ({
    id,
    status: 'refused',
    observations: [scrub(why)],
    milliseconds: 0,
  }))

  let bot: LiveBot | undefined
  let account: Promise<LiveAccount> | undefined

  try {
    for (const check of run) {
      const observations: string[] = []
      const undo: Array<() => Promise<unknown>> = []
      const started = Date.now()
      let status: CheckReport['status'] = 'passed'

      const context: CheckContext = {
        bot: () => {
          bot ??= factories.bot()
          return bot
        },
        account: () => {
          account ??= factories.account().then(async (made) => {
            await made.connect()
            return made
          })
          return account
        },
        botChat: environment.bot?.chat,
        accountChat: environment.account?.chat,
        observe: (line) => void observations.push(scrub(line)),
        cleanup: (step) => void undo.push(step),
        expect: (condition, what) => {
          if (!condition) throw new ExpectationFailed(what)
        },
        stream: async () => {
          if (factories.stream === undefined) throw new Error('no way to stream was given')
          return await factories.stream()
        },
      }

      try {
        await check.run(context)
      } catch (error) {
        status = 'failed'
        observations.push(
          scrub(
            error instanceof ExpectationFailed
              ? `expected: ${error.message}`
              : `error: ${String(error)}`,
          ),
        )
      } finally {
        for (const step of undo.reverse()) {
          try {
            await step()
          } catch (error) {
            observations.push(scrub(`cleanup failed: ${String(error)}`))
            status = 'failed'
          }
        }
      }

      reports.push({ id: check.id, status, observations, milliseconds: Date.now() - started })
    }
  } finally {
    if (account !== undefined) {
      await (await account.catch(() => undefined))?.stop({ timeout: 5_000 })
    }
  }

  return reports
}

/** An expectation a check states that did not hold. */
export class ExpectationFailed extends Error {
  override readonly name = 'ExpectationFailed'
}
