/**
 * Sign the observing account in, once.
 *
 * ```sh
 * pnpm tsx examples/20-presence-watch/login.ts
 * ```
 *
 * Asks at the terminal for the phone number, the code Telegram sends, and the
 * two-step password where the account has one, and leaves the authorization in
 * the state directory. Nothing typed here is printed or logged, and the
 * password is not echoed. Run again, it finds the account signed in and asks
 * for nothing.
 *
 * It reads the account's settings only. The bot's token and `OPERATOR_ID` are
 * not needed yet and are not looked at: this is the command that prints the
 * account's identifier, which is what `OPERATOR_ID` is then set to.
 *
 * The directory this writes **is** a signed-in account. It is ignored by Git;
 * keep it out of backups that others can read.
 */

import { createInterface } from 'node:readline/promises'
import { Writable } from 'node:stream'
import { configureAccount, openAccount } from './config.js'

/** Somewhere for readline to echo to when what is typed must not be shown. */
const nowhere = new Writable({
  write(_chunk, _encoding, done) {
    done()
  },
})

async function ask(question: string, hidden = false): Promise<string> {
  // In a terminal readline redraws the line it reads on, so a question written
  // there beforehand is wiped before anyone sees it: readline writes it itself.
  // A hidden answer is read with readline writing nowhere, so its question goes
  // out directly and stays.
  if (hidden) process.stdout.write(question)
  const input = createInterface({
    input: process.stdin,
    output: hidden ? nowhere : process.stdout,
    terminal: true,
  })

  try {
    return (await input.question(hidden ? '' : question)).trim()
  } finally {
    input.close()
    if (hidden) process.stdout.write('\n')
  }
}

/** Ask for the phone number until what is typed could be one: digits, with + ( ) - and spaces. */
async function askPhone(): Promise<string> {
  for (;;) {
    const phone = await ask(
      'Номер телефона аккаунта в международном формате, например +79991234567: ',
    )
    if (/^\+?[\d\s()-]+$/.test(phone) && /\d{5}/.test(phone.replace(/\D/g, ''))) return phone
    console.log('Это не номер телефона: нужны цифры, можно с +, пробелами, скобками и дефисами.')
  }
}

const config = configureAccount()
const account = openAccount(config)

try {
  await account.connect()
  await account.signIn({
    phone: askPhone,
    code: () => ask('Код, который прислал Telegram: '),
    password: () => ask('Пароль двухэтапной аутентификации: ', true),
  })

  const me = await account.me()
  console.log(`Вход выполнен: ${me.displayName}, id ${String(me.id)} (${config.environment}).`)
  console.log('Если оператором будете вы сами, впишите этот id в OPERATOR_ID.')
} finally {
  await account.stop()
}
