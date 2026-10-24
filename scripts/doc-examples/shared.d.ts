// SPDX-License-Identifier: MIT

/**
 * Names the documentation's code fragments use without making them.
 *
 * A guide shows `message.reply(…)` inside prose about a handler rather than repeating the
 * handler around every line, so a fragment needs something to stand for `message`. Each name
 * here is typed with what the package actually exports — never `any`, never a cast, never a
 * member the package does not have — so a fragment that misuses one fails to compile exactly as
 * it would in an application.
 *
 * Credentials are strings and numbers with no value: nothing here is a real token or key.
 */

declare const token: string
declare const apiId: number
declare const apiHash: string
declare const keys: import('yuigram').ServerRsaKey[]
declare const bootstrap: import('yuigram').DcConfiguration
declare const ADMIN_ID: number

declare const account: import('yuigram').Account
declare const user: import('yuigram').Account
declare const app: import('yuigram').App<
  import('yuigram').AnyEventContext | import('yuigram').MtprotoContext
>
declare const message: import('yuigram').MessageContext

declare const bytes: Uint8Array
declare const fileId: string
/** A document an account read off a message. */
declare const document: Parameters<typeof import('yuigram').documentFile>[0]

/** Whatever the application uses to ask a person for a sign-in answer. */
declare function ask(question: string): Promise<string>
/** Somewhere the application keeps text. */
declare function archive(text: string): Promise<void>
/** A stream source, as a model's answer arrives. */
declare function answer(question: string): AsyncGenerator<string>

declare const expect: typeof import('vitest').expect
