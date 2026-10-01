/**
 * Run the published packages on Node, Bun, Deno and an edge worker.
 *
 * Builds and packs the packages, installs the archives into a temporary
 * directory the way an application would, and runs the same checks under each
 * runtime against a fresh mock datacenter: every entry point resolves, the
 * cryptography matches published vectors, a Bot API call and a Fetch-shaped
 * webhook work over the runtime's own `fetch` and streams, a call is cancelled
 * by its signal, the stores the runtime supports keep what they are given, an
 * account exchanges a key and makes an encrypted call over the runtime's own
 * connection and receives an update pushed down it, and stopping closes it.
 *
 * ```sh
 * pnpm --filter @yuigram/runtime-matrix run matrix              # every runtime found
 * pnpm --filter @yuigram/runtime-matrix run matrix node deno    # these only
 * pnpm --filter @yuigram/runtime-matrix run matrix --strict     # a runtime not found fails
 * ```
 *
 * Bun and Deno are taken from `YUIGRAM_BUN` and `YUIGRAM_DENO`, or from `PATH`.
 * The edge worker runs in workerd through Miniflare, taken from the directory
 * `YUIGRAM_MINIFLARE` names (one containing `node_modules/miniflare`): it is a
 * large download, so it is not a dependency of this repository. A runtime that
 * cannot be found is reported as not run, never as passed; with `--strict`, as
 * CI runs it, that fails the run too.
 *
 * Whatever this starts — a datacenter per runtime, the runtime's own process,
 * the worker, the installed workspace — is stopped and removed on the way out,
 * whether the run passed, failed or was interrupted.
 */

import { execFileSync, spawn } from 'node:child_process'
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Datacenter, startDatacenter } from './datacenter.js'
import {
  createRunning,
  type Outcome,
  onInterrupt,
  runFailed,
  stopChild,
  stopEverything,
} from './lifecycle.js'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const clients = fileURLToPath(new URL('../clients/', import.meta.url))
const PACKAGES = ['core', 'bot-api', 'mtproto', 'yuigram', 'sqlite', 'redis']

function sh(command: string, args: readonly string[], cwd: string): string {
  return execFileSync(command, args, { cwd, encoding: 'utf8', stdio: 'pipe', shell: true })
}

/** Build, pack and install the packages as an application would, into `workspace`. */
function install(workspace: string): void {
  sh('pnpm', ['build'], root)
  const dependencies: Record<string, string> = {}
  for (const name of PACKAGES) {
    const before = new Set(readdirSync(workspace))
    sh(
      'pnpm',
      ['pack', '--pack-destination', JSON.stringify(workspace)],
      join(root, 'packages', name),
    )
    const archive = readdirSync(workspace).find(
      (file) => file.endsWith('.tgz') && !before.has(file),
    )
    if (archive === undefined) throw new Error(`no archive was produced for ${name}`)
    const manifest = JSON.parse(readFileSync(join(root, 'packages', name, 'package.json'), 'utf8'))
    dependencies[manifest.name] = `./${archive}`
  }
  writeFileSync(
    join(workspace, 'package.json'),
    `${JSON.stringify({ name: 'yuigram-runtimes', private: true, type: 'module', dependencies }, null, 2)}\n`,
  )
  sh('npm', ['install', '--no-audit', '--no-fund', '--silent'], workspace)
  copyFileSync(join(clients, 'matrix.mjs'), join(workspace, 'matrix.mjs'))
  copyFileSync(join(clients, 'worker.mjs'), join(workspace, 'worker-src.mjs'))
  copyFileSync(join(clients, 'worker-host.mjs'), join(workspace, 'worker-host.mjs'))
}

/** A runtime's command, or why it cannot be run. */
function locate(runtime: string): { command: string; args: string[] } | string {
  const from = (variable: string, fallback: string): string => process.env[variable] ?? fallback
  const probe = (command: string): boolean => {
    try {
      sh(command, ['--version'], root)
      return true
    } catch {
      return false
    }
  }
  if (runtime === 'node') return { command: process.execPath, args: ['matrix.mjs'] }
  if (runtime === 'bun') {
    const bun = from('YUIGRAM_BUN', 'bun')
    return probe(bun)
      ? { command: bun, args: ['matrix.mjs'] }
      : `no Bun at '${bun}'; set YUIGRAM_BUN`
  }
  if (runtime === 'deno') {
    const deno = from('YUIGRAM_DENO', 'deno')
    return probe(deno)
      ? { command: deno, args: ['run', '--allow-all', 'matrix.mjs'] }
      : `no Deno at '${deno}'; set YUIGRAM_DENO`
  }
  return `unknown runtime '${runtime}'`
}

const running = createRunning()

/** Run the client under one runtime, against a datacenter of its own. */
async function runClient(runtime: string, workspace: string): Promise<Outcome> {
  const found = locate(runtime)
  if (typeof found === 'string') return { runtime, status: 'not run', lines: [found] }

  const datacenter = await startDatacenter()
  const closeDatacenter = () => datacenter.close()
  running.closers.add(closeDatacenter)
  try {
    const output = await new Promise<string>((resolve) => {
      let text = ''
      const child = spawn(
        found.command,
        [...found.args, String(datacenter.tcpPort), String(datacenter.httpPort)],
        {
          cwd: workspace,
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: process.platform === 'win32' && runtime !== 'node',
        },
      )
      running.child = child
      const timer = setTimeout(() => stopChild(child), 120_000)
      child.stdout.on('data', (chunk: Buffer) => {
        text += chunk.toString()
      })
      child.stderr.on('data', (chunk: Buffer) => {
        text += chunk.toString()
      })
      child.on('close', (code) => {
        clearTimeout(timer)
        running.child = undefined
        resolve(`${text}\nexit ${code}`)
      })
    })
    const lines = output
      .split('\n')
      .filter((line) => /^(runtime|PASS|FAIL|SUMMARY|exit)/.test(line))
    const passed =
      lines.some((line) => line.startsWith('SUMMARY')) &&
      !lines.some((line) => line.startsWith('FAIL'))
    return {
      runtime,
      status: passed ? 'passed' : 'failed',
      lines: passed ? lines : output.split('\n'),
    }
  } finally {
    running.closers.delete(closeDatacenter)
    await datacenter.close()
  }
}

/** Bundle the worker with the browser substitutions and run it in workerd. */
async function runEdge(workspace: string): Promise<Outcome> {
  const directory = process.env['YUIGRAM_MINIFLARE']
  if (directory === undefined) {
    return {
      runtime: 'workerd',
      status: 'not run',
      lines: ['set YUIGRAM_MINIFLARE to a directory with miniflare installed'],
    }
  }
  const { Miniflare } = createRequire(join(directory, 'package.json'))('miniflare')
  const esbuild = createRequire(import.meta.url)('esbuild')

  const built = await esbuild.build({
    entryPoints: [join(workspace, 'worker-src.mjs')],
    absWorkingDir: workspace,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    conditions: ['worker', 'browser'],
    target: 'es2022',
    outfile: join(workspace, 'worker.js'),
    metafile: true,
    logLevel: 'silent',
  })
  const inputs = Object.keys(built.metafile.inputs)
  const reached = inputs.filter((input) => input.startsWith('node:'))
  const lines = [
    `bundle from ${inputs.length} modules; Node built-ins reached: ${reached.length === 0 ? 'none' : reached.join(', ')}`,
  ]

  const datacenter: Datacenter = await startDatacenter()
  const worker = new Miniflare({
    modules: true,
    scriptPath: join(workspace, 'worker.js'),
    modulesRoot: workspace,
    compatibilityDate: '2026-07-01',
  })
  const closeEdge = async () => {
    await worker.dispose()
    await datacenter.close()
  }
  running.closers.add(closeEdge)
  try {
    const response = await worker.dispatchFetch(`http://localhost/run?http=${datacenter.httpPort}`)
    const results = (await response.json()) as { name: string; ok: boolean; detail: string }[]
    for (const one of results)
      lines.push(`${one.ok ? 'PASS' : 'FAIL'} ${one.name} — ${one.detail.split('\n')[0]}`)
    const failed = reached.length > 0 || results.some((one) => !one.ok)
    return { runtime: 'workerd', status: failed ? 'failed' : 'passed', lines }
  } finally {
    running.closers.delete(closeEdge)
    await closeEdge()
  }
}

const strict = process.argv.includes('--strict')
const asked = process.argv.slice(2).filter((argument) => argument !== '--strict')
const runtimes = asked.length > 0 ? asked : ['node', 'bun', 'deno', 'workerd']
const workspace = mkdtempSync(join(tmpdir(), 'yuigram-runtimes-'))
const outcomes: Outcome[] = []

// An interrupted run — a cancelled CI job, a terminal's Ctrl-C — stops what it
// started before it goes, rather than leaving a runtime or a listener behind.
onInterrupt(running, workspace)

try {
  install(workspace)
  for (const runtime of runtimes) {
    outcomes.push(
      runtime === 'workerd' ? await runEdge(workspace) : await runClient(runtime, workspace),
    )
  }
} finally {
  await stopEverything(running, workspace)
}

for (const outcome of outcomes) {
  process.stdout.write(`\n== ${outcome.runtime}: ${outcome.status}\n`)
  for (const line of outcome.lines) process.stdout.write(`   ${line}\n`)
}
process.exit(runFailed(outcomes, strict) ? 1 : 0)
