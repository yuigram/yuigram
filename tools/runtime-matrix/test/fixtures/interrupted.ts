// SPDX-License-Identifier: MPL-2.0

/**
 * A matrix run interrupted part-way, as a process of its own.
 *
 * It owns what a real run owns at that moment — a runtime it spawned, a
 * listener standing in for the datacenter, a workspace on disk — reports where
 * each is, and is then interrupted by the signal named on its command line. The
 * test that runs it checks that none of the three is left.
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRunning, onInterrupt } from '../../src/lifecycle.js'

const signal = process.argv[2] === 'SIGTERM' ? 'SIGTERM' : 'SIGINT'
const running = createRunning()
const workspace = mkdtempSync(join(tmpdir(), 'yuigram-runtimes-fixture-'))
writeFileSync(join(workspace, 'matrix.mjs'), '')

const server = createServer((socket) => socket.end())
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
running.closers.add(() => new Promise<void>((resolve) => server.close(() => resolve())))

// What the worker's closer stands for: Miniflare starts workerd as a process of
// its own and stops it on dispose. Detached, so that neither this process
// exiting nor the platform ending its children with it can stop it: only the
// closer does, which is what shows that the closers ran.
const worker = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
  stdio: 'ignore',
  detached: true,
})
running.closers.add(async () => {
  worker.kill()
  await new Promise((resolve) => worker.once('exit', resolve))
})

// Spawned the way the runner spawns a runtime other than Node: through a shell
// on Windows, so the process held here is the shell and the runtime is under it.
const script = 'process.stdout.write(String(process.pid)); setInterval(() => {}, 1000)'
const child =
  process.platform === 'win32'
    ? spawn(`"${process.execPath}" -e "${script}"`, {
        shell: true,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
    : spawn(process.execPath, ['-e', script], { stdio: ['ignore', 'pipe', 'ignore'] })
running.child = child
const runtimePid = await new Promise<number>((resolve) => {
  child.stdout?.once('data', (chunk: Buffer) => resolve(Number(chunk.toString())))
})

onInterrupt(running, workspace)

const address = server.address()
process.stdout.write(
  `${JSON.stringify({
    runtimePid,
    holderPid: child.pid,
    workerPid: worker.pid,
    port: typeof address === 'object' && address !== null ? address.port : 0,
    workspace,
  })}\n`,
)
process.emit(signal, signal)
