// SPDX-License-Identifier: MPL-2.0

/**
 * 15 — An account in a worker.
 *
 * The account runs on another thread and this one holds nothing but a port to
 * it. Cryptography, the socket and the session all stay in the worker, so a
 * busy handler here never delays a key exchange there, and a thread that only
 * handles messages never holds the credentials that sign them.
 *
 * ```sh
 * API_ID=12345 API_HASH=abc… SESSION=… pnpm tsx examples/15-worker/index.ts
 * ```
 *
 * `SESSION` **is a logged-in account**; see 03-basic-userbot for what that
 * means. Run without it and the worker refuses to make the account — which is
 * worth doing once, to watch the refusal arrive here as the class it was
 * thrown as.
 *
 * Send yourself `ping` from another device, and press Ctrl+C to leave.
 */

import { Worker } from 'node:worker_threads'
import { ConfigError } from 'yuigram'
import { attachAccount, HostUnavailableError, workerEndpoint } from 'yuigram/worker'

const worker = new Worker(new URL('./host.ts', import.meta.url))

async function main(): Promise<void> {
  // Attaching says hello, agrees a protocol version and names an account. The
  // worker makes it on the first attach and hands every later one the same.
  const me = await attachAccount(workerEndpoint(worker), { account: 'me' })

  // What the host says about itself, as opposed to what the account received.
  me.onEvent((event) => {
    if (event.kind === 'host-lost') console.error('the worker is gone')
    if (event.kind === 'stopped') console.log('the account was stopped')
  })

  // Handlers run here, on this thread. The update was decrypted in the worker;
  // `reply` goes back across as a call.
  me.on('message', async (event) => {
    if (event.text !== 'ping') return
    const sent = await event.reply('pong')
    console.log(`replied as message ${sent.id}`)
  })

  await me.start()
  const self = await me.me()
  console.log(`signed in as ${self.displayName}; the connection is on the worker's thread`)

  process.once('SIGINT', () => {
    // Detaching is this caller leaving. The host's policy, set in host.ts,
    // stops the account because nobody else is attached.
    void me.detach().then(() => worker.terminate())
  })
}

main().catch(async (error: unknown) => {
  if (error instanceof ConfigError) {
    console.error(`the worker refused: ${error.message}`)
  } else if (error instanceof HostUnavailableError) {
    console.error(`the worker stopped answering: ${error.message}`)
  } else {
    console.error(error)
  }
  process.exitCode = 1
  await worker.terminate()
})
