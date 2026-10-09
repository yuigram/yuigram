// SPDX-License-Identifier: MPL-2.0

/**
 * A stand-in Redis server for the adapter's contract tests.
 *
 * It answers the commands the adapter sends, the way the Redis command
 * reference describes them, on a clock the test controls. `EVAL` runs only the
 * adapter's own script, by recognising it, and runs it as one step — which is
 * what the server does with any script, and so what the adapter's atomicity
 * rests on. What this cannot show is that the script's Lua is what a real
 * server accepts; that needs a real server.
 */

import { HIT_SCRIPT } from '../../src/counter.js'

interface Entry {
  value: string
  expiresAt: number | undefined
}

export class FakeRedis {
  readonly #entries = new Map<string, Entry>()
  #now: number
  readonly commands: string[][] = []
  /** Fail the next command with this, as a lost connection would. */
  failNext: Error | undefined
  /**
   * Answer SCAN the way a server may while keys change under it: each page
   * repeats the last key of the one before, which SCAN's contract allows.
   */
  repeatsKeys = false
  /** Ignore a SCAN pattern altogether, as a proxy that does not pass MATCH on might. */
  matchesLoosely = false

  constructor(now = 1_000_000) {
    this.#now = now
  }

  advance(ms: number): void {
    this.#now += ms
  }

  /** node-redis's shape. */
  readonly nodeRedis = {
    sendCommand: (args: string[]) => this.send(args),
  }

  /** ioredis's shape. */
  readonly ioredis = {
    call: (command: string, ...args: string[]) => this.send([command, ...args]),
  }

  /** Everything stored, for a case that reads the server directly. */
  get keys(): string[] {
    return [...this.#entries.keys()].filter((key) => this.#live(key) !== undefined).sort()
  }

  #live(key: string): Entry | undefined {
    const entry = this.#entries.get(key)
    if (entry === undefined) return undefined
    if (entry.expiresAt !== undefined && entry.expiresAt <= this.#now) {
      this.#entries.delete(key)
      return undefined
    }
    return entry
  }

  async send(args: readonly string[]): Promise<unknown> {
    this.commands.push([...args])
    const failure = this.failNext
    if (failure !== undefined) {
      this.failNext = undefined
      throw failure
    }

    const [command, ...rest] = args
    switch (command) {
      case 'GET':
        return this.#live(rest[0] as string)?.value ?? null
      case 'SET': {
        const [key, value, option, amount] = rest
        this.#entries.set(key as string, {
          value: value as string,
          expiresAt: option === 'PX' ? this.#now + Number(amount) : undefined,
        })
        return 'OK'
      }
      case 'DEL':
      case 'UNLINK': {
        let removed = 0
        for (const key of rest)
          if (this.#live(key) !== undefined && this.#entries.delete(key)) removed += 1
        return removed
      }
      case 'EXISTS':
        return rest.filter((key) => this.#live(key) !== undefined).length
      case 'SCAN':
        return this.#scan(rest)
      case 'EVAL':
        return this.#eval(rest)
      default:
        throw new Error(`ERR unknown command '${command}'`)
    }
  }

  /** Where each open SCAN walk resumes: after the last key it returned. */
  readonly #walks = new Map<string, string>()
  #nextWalk = 1

  /**
   * SCAN, keeping Redis's promise: a key present for a whole walk is returned
   * by it, whatever is deleted meanwhile. The cursor resumes after the last key
   * returned rather than at a position, which a deletion would shift.
   */
  #scan([cursor, , pattern, , count]: readonly string[]): [string, string[]] {
    const matcher = this.matchesLoosely ? /^/ : globToRegExp(pattern as string)
    const all = [...this.#entries.keys()].filter((key) => this.#live(key) !== undefined).sort()
    const after = cursor === '0' ? undefined : this.#walks.get(cursor as string)
    this.#walks.delete(cursor as string)

    const remaining = after === undefined ? all : all.filter((key) => key > after)
    const page = remaining.slice(0, Number(count))
    // Repeating the previous page's last key is allowed by SCAN's contract.
    const repeated = this.repeatsKeys && after !== undefined && all.includes(after) ? [after] : []

    let next = '0'
    const last = page.at(-1)
    if (remaining.length > page.length && last !== undefined) {
      next = String(this.#nextWalk++)
      this.#walks.set(next, last)
    }

    return [next, [...repeated, ...page].filter((key) => matcher.test(key))]
  }

  #eval([script, keyCount, key, windowMs]: readonly string[]): [number, number] {
    if (script !== HIT_SCRIPT || keyCount !== '1') throw new Error('ERR unexpected script')

    // One step, as the server runs a script: nothing else happens in between.
    const entry = this.#live(key as string)
    const count = entry === undefined ? 1 : Number(entry.value) + 1
    let expiresAt = entry?.expiresAt
    if (expiresAt === undefined) expiresAt = this.#now + Number(windowMs)
    this.#entries.set(key as string, { value: String(count), expiresAt })

    return [count, expiresAt - this.#now]
  }

  /** Put a key there with no expiry, as another program might. */
  plant(key: string, value: string): void {
    this.#entries.set(key, { value, expiresAt: undefined })
  }
}

/** A SCAN pattern as a regular expression: `*`, `?`, `[...]` and `\` escapes. */
function globToRegExp(pattern: string): RegExp {
  let source = '^'
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index] as string
    if (character === '\\') {
      index += 1
      source += (pattern[index] ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    } else if (character === '*') {
      source += '.*'
    } else if (character === '?') {
      source += '.'
    } else if (character === '[') {
      const end = pattern.indexOf(']', index)
      source += pattern.slice(index, end + 1)
      index = end
    } else {
      source += character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }
  }
  return new RegExp(`${source}$`, 's')
}
