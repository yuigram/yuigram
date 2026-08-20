/**
 * Emitter entry point.
 *
 * Writes generated sources for a parsed schema, and reports the size of each
 * file so the declaration budget stays observable. A generated `.d.ts` is a
 * cost paid by every consumer's TypeScript server on every keystroke, so it is
 * measured rather than assumed.
 */

import type { Dirent } from 'node:fs'
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { BotApiSchema } from '../bot-api/ir.js'
import { describeServiceDetection, emitEvents } from './events.js'
import { emitMethods } from './methods.js'
import type { EmittedFile } from './types.js'
import { emitTypeNames, emitTypes } from './types.js'

/** Produce every generated file for a schema. */
export function emitAll(schema: BotApiSchema): EmittedFile[] {
  return [...emitTypes(schema), emitTypeNames(schema), ...emitMethods(schema), emitEvents(schema)]
}

export { describeServiceDetection }

/** A written file and its size. */
export interface WrittenFile {
  readonly path: string
  readonly bytes: number
}

/**
 * Write generated files under `outputDir`, replacing whatever was there.
 *
 * The directory is cleared first so a type removed upstream does not linger as
 * a stale file that still compiles.
 */
export async function writeGenerated(
  outputDir: string,
  files: readonly EmittedFile[],
): Promise<WrittenFile[]> {
  await rm(outputDir, { recursive: true, force: true })

  const written: WrittenFile[] = []

  for (const file of files) {
    const target = join(outputDir, file.path)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, file.contents, 'utf8')
    written.push({ path: file.path, bytes: Buffer.byteLength(file.contents, 'utf8') })
  }

  return written
}

/** Confirm the output directory contains only generated files. */
export async function listGenerated(outputDir: string): Promise<string[]> {
  const out: string[] = []

  const walk = async (dir: string, prefix: string): Promise<void> => {
    let entries: Dirent[]
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`
      if (entry.isDirectory()) {
        await walk(join(dir, entry.name), path)
      } else {
        out.push(path)
      }
    }
  }

  await walk(outputDir, '')
  return out.sort()
}

export type { EmittedFile }
