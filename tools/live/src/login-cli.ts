// SPDX-License-Identifier: MIT

/**
 * `pnpm --filter @yuigram/live login` and `pnpm --filter @yuigram/live logout`
 *
 * Signing in creates an authorization and signing out ends one, so each needs
 * its own variable set to 1 and runs nothing else. See docs/live-verification.md.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { Account, createLogger, memory, silentSink } from 'yuigram'
import { accountFromSession, bootstrapFor } from './account.js'
import { EnvironmentError, readEnvironment } from './environment.js'
import {
  checkLogoutAllowed,
  type LoginAccount,
  type LoginIo,
  readLoginEnvironment,
  signIn,
  signOut,
} from './login.js'
import { scrubber } from './redact.js'

const command = process.argv[2]
const log = createLogger({ sink: silentSink() })

/** Ask at the terminal; a hidden answer is read without echoing it. */
const io: LoginIo = {
  async ask(question, options = {}) {
    if (options.hidden === true && process.stdin.isTTY) {
      process.stdout.write(question)
      process.stdin.setRawMode(true)
      process.stdin.resume()
      let answer = ''
      for await (const chunk of process.stdin) {
        const text = String(chunk)
        if (text === '\r' || text === '\n' || text === '\r\n') break
        if (text === '\u0003') process.exit(130)
        answer += text
      }
      process.stdin.setRawMode(false)
      process.stdin.pause()
      process.stdout.write('\n')
      return answer
    }
    const terminal = createInterface({ input: process.stdin, output: process.stdout })
    try {
      return await terminal.question(question)
    } finally {
      terminal.close()
    }
  },
  say: (line) => void process.stdout.write(`${line}\n`),
}

try {
  if (command === 'login') {
    const settings = readLoginEnvironment(process.env, (path) => readFileSync(path, 'utf8'))
    const scrub = scrubber(settings.secrets)
    const account = new Account({
      apiId: settings.apiId,
      apiHash: settings.apiHash,
      keys: settings.keys,
      storage: memory(),
      log,
      bootstrap: bootstrapFor(settings.dc, settings.testMode),
    })
    try {
      const session = await signIn(
        account as unknown as LoginAccount,
        settings.phone,
        settings.format,
        io,
      )
      writeFileSync(settings.out, session, { flag: 'wx', mode: 0o600 })
      io.say(
        `signed in; the session (${session.length} characters) was written to ${settings.out}. ` +
          'It is an authorization of the account: keep it out of history, and end it with `logout`.',
      )
    } catch (error) {
      io.say(scrub(`signing in failed: ${(error as Error).message}`))
      process.exitCode = 1
    }
  } else if (command === 'logout') {
    checkLogoutAllowed(process.env)
    const environment = readEnvironment(process.env)
    const settings = environment.account
    if (settings === undefined) {
      throw new EnvironmentError(
        'signing out needs the account variables, including YUIGRAM_LIVE_SESSION',
      )
    }
    const scrub = scrubber(environment.secrets)
    const account = accountFromSession(settings, log)
    try {
      await signOut(account as unknown as LoginAccount)
      io.say(
        'signed out; the authorization the session held is ended, and the string is now useless',
      )
    } catch (error) {
      io.say(scrub(`signing out failed: ${(error as Error).message}`))
      process.exitCode = 1
    }
  } else {
    process.stderr.write('usage: login | logout (see docs/live-verification.md)\n')
    process.exitCode = 2
  }
} catch (error) {
  process.stderr.write(
    `${error instanceof EnvironmentError ? error.message : 'the environment could not be read'}\n`,
  )
  process.exitCode = 2
}
