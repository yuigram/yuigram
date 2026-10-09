// SPDX-License-Identifier: MPL-2.0

/**
 * Stopping a matrix run, and judging one.
 *
 * The interrupted run is a real process with real things to stop — a runtime it
 * spawned, a listener, a workspace — because what is being checked is that
 * none of them outlives it. Everything the fixture starts is its own, and the
 * one process it starts beyond itself is ended here by its recorded id should
 * the run under test fail to end it.
 */

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { connect } from 'node:net'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { type Outcome, runFailed } from '../src/lifecycle.js'

const FIXTURE = fileURLToPath(new URL('./fixtures/interrupted.ts', import.meta.url))

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

const accepts = (port: number) =>
  new Promise<boolean>((resolve) => {
    const socket = connect(port, '127.0.0.1')
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
  })

/** Run the fixture to its end, interrupted by `signal`; its exit code and what it reported. */
function interrupted(signal: 'SIGINT' | 'SIGTERM') {
  let code = 0
  let out = ''
  try {
    out = execFileSync(process.execPath, ['--import', 'tsx', FIXTURE, signal], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
    })
  } catch (error) {
    const failure = error as { status: number | null; stdout: string }
    code = failure.status ?? -1
    out = failure.stdout
  }
  const report = JSON.parse(out.trim().split('\n').at(-1) ?? '{}') as {
    runtimePid: number
    holderPid: number
    workerPid: number
    port: number
    workspace: string
  }
  started.push(report.runtimePid, report.workerPid)
  return { code, report }
}

/** Processes the fixture started, ended here if a run under test left one behind. */
const started: number[] = []

afterEach(() => {
  for (const pid of started.splice(0)) if (alive(pid)) process.kill(pid)
})

describe('an interrupted run', () => {
  it('stops the runtime it spawned, its listener and its workspace, and leaves with 130', async () => {
    const { code, report } = interrupted('SIGINT')

    expect(code).toBe(130)
    expect(alive(report.runtimePid)).toBe(false)
    expect(alive(report.holderPid)).toBe(false)
    expect(alive(report.workerPid)).toBe(false)
    expect(await accepts(report.port)).toBe(false)
    expect(existsSync(report.workspace)).toBe(false)
  }, 40_000)

  it('does the same when terminated, and leaves with 143', async () => {
    const { code, report } = interrupted('SIGTERM')

    expect(code).toBe(143)
    expect(alive(report.runtimePid)).toBe(false)
    expect(alive(report.workerPid)).toBe(false)
    expect(await accepts(report.port)).toBe(false)
    expect(existsSync(report.workspace)).toBe(false)
  }, 40_000)
})

describe('judging a run', () => {
  const outcome = (status: Outcome['status']): Outcome => ({ runtime: 'x', status, lines: [] })

  it('fails on a runtime that failed, strict or not', () => {
    expect(runFailed([outcome('passed'), outcome('failed')], false)).toBe(true)
    expect(runFailed([outcome('failed')], true)).toBe(true)
  })

  it('reports a runtime it could not find, and fails on one only when strict', () => {
    expect(runFailed([outcome('passed'), outcome('not run')], false)).toBe(false)
    expect(runFailed([outcome('passed'), outcome('not run')], true)).toBe(true)
  })

  it('passes when everything ran and passed', () => {
    expect(runFailed([outcome('passed'), outcome('passed')], true)).toBe(false)
  })
})
