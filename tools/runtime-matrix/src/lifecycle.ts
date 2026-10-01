/**
 * What a matrix run owns, how it is stopped, and how its outcome is judged.
 *
 * Kept apart from the runner so the stopping can be exercised on its own: an
 * interrupted run is the case that matters, and it is the one a full run
 * cannot be made to show on demand.
 */

import { type ChildProcess, execFileSync } from 'node:child_process'
import { rmSync } from 'node:fs'

/** How one runtime went. */
export interface Outcome {
  readonly runtime: string
  readonly status: 'passed' | 'failed' | 'not run'
  readonly lines: readonly string[]
}

/**
 * What is running now and has to be stopped if the run is interrupted.
 *
 * Only what this process started: the runtime it spawned, and the datacenter
 * and worker it holds. Nothing is found and stopped by name.
 */
export interface Running {
  child: ChildProcess | undefined
  readonly closers: Set<() => Promise<void>>
}

export function createRunning(): Running {
  return { child: undefined, closers: new Set() }
}

/**
 * Stop a runtime this run spawned, with whatever it started in turn.
 *
 * On Windows a runtime other than Node is started through a shell, so the
 * process this run holds is the shell, and ending it alone leaves the runtime
 * running. The tree under that one process is ended instead — by its process
 * id, which this run was handed when it spawned it.
 */
export function stopChild(child: ChildProcess): void {
  if (child.exitCode !== null || child.signalCode !== null) return
  if (process.platform === 'win32' && child.pid !== undefined) {
    try {
      execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
      return
    } catch {
      // Already gone between the check and the call; fall through to the handle.
    }
  }
  child.kill()
}

/** Stop everything running and remove the workspace, whatever each step does. */
export async function stopEverything(running: Running, workspace: string): Promise<void> {
  if (running.child !== undefined) stopChild(running.child)
  await Promise.allSettled([...running.closers].map((close) => close()))
  rmSync(workspace, { recursive: true, force: true })
}

/**
 * Stop what the run started when it is interrupted, then leave.
 *
 * A cancelled CI job and a terminal's Ctrl-C both arrive as one of these, and
 * the exit status says which: 130 for an interrupt, 143 for a termination.
 */
export function onInterrupt(
  running: Running,
  workspace: string,
  exit: (code: number) => void = (code) => process.exit(code),
): void {
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void stopEverything(running, workspace).finally(() => exit(signal === 'SIGINT' ? 130 : 143))
    })
  }
}

/**
 * Whether the run failed.
 *
 * A runtime that failed fails it. One that could not be found is reported as
 * not run — never as passed — and fails it only when the run is strict, as CI
 * runs it, where a missing runtime means the job did not check what it claims.
 */
export function runFailed(outcomes: readonly Outcome[], strict: boolean): boolean {
  return outcomes.some(
    (outcome) => outcome.status === 'failed' || (strict && outcome.status === 'not run'),
  )
}
