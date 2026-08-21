/**
 * Named registration generation.
 *
 * The list is the contract: whatever it names, the client installs. Two things
 * can go wrong that the compiler cannot catch — a name that collides with a
 * hand-written method and quietly replaces something better, and a kind that
 * silently drops out of the list and takes its registration with it.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { BotApiSchema } from '../src/bot-api/ir.js'
import { collectServiceEvents, collectUpdateEvents } from '../src/emit/events.js'
import {
  collectRegistrations,
  emitRegistrations,
  registrationName,
} from '../src/emit/registrations.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

const schema = JSON.parse(
  readFileSync(join(ROOT, 'schemas', 'bot-api', '10.2.json'), 'utf8'),
) as BotApiSchema

const registrations = collectRegistrations(schema)
const names = new Set(registrations.map((registration) => registration.method))
const kinds = new Set(registrations.map((registration) => registration.kind))

describe('naming', () => {
  it('turns a kind into the method that selects it', () => {
    expect(registrationName('message')).toBe('onMessage')
    expect(registrationName('chat_member_joined')).toBe('onChatMemberJoined')
    expect(registrationName('message_edited')).toBe('onMessageEdited')
  })

  it('never disagrees with the kind it registers', () => {
    // `onEditedMessage` for `message_edited` reads the other way round from the
    // taxonomy, and having both spellings in one API is worse than either.
    for (const registration of registrations) {
      expect(registration.method).toBe(registrationName(registration.kind))
    }
  })

  it('produces a unique name per kind', () => {
    expect(names.size).toBe(registrations.length)
  })
})

describe('coverage', () => {
  it('names every update kind the schema declares', () => {
    const updates = collectUpdateEvents(schema)
      .filter((event) => event.type !== 'unknown')
      .map((event) => event.kind)

    for (const kind of updates) {
      // Except the ones the client implements itself.
      if (kind === 'callback_query') continue
      expect(kinds.has(kind)).toBe(true)
    }
  })

  it('names every promoted service kind', () => {
    for (const event of collectServiceEvents(schema)) {
      expect(kinds.has(event.kind)).toBe(true)
    }
  })

  it('leaves the matching registrations to the client', () => {
    // Each of these does something a delegation cannot: narrow by matching, or
    // accept a pattern. A generated version would be a worse method with a
    // better name.
    expect(names.has('onText')).toBe(false)
    expect(names.has('onCommand')).toBe(false)
    expect(names.has('onCallbackQuery')).toBe(false)
    expect(names.has('onError')).toBe(false)
  })
})

describe('the emitted file', () => {
  const emitted = emitRegistrations(schema).contents

  it('declares rather than implements', () => {
    // The runtime installs from `REGISTRATIONS`, so no method body is
    // generated — which is what keeps eighty registrations affordable.
    expect(emitted).toContain('export interface GeneratedRegistrations<Ext>')
    expect(emitted).not.toContain('return this.on(')
  })

  it('emits the declaration and the table from one list', () => {
    for (const registration of registrations) {
      expect(emitted).toContain(`${registration.method}(handler:`)
      expect(emitted).toContain(`['${registration.method}', '${registration.kind}']`)
    }
  })

  it('is stable across regenerations', () => {
    expect(emitRegistrations(schema).contents).toBe(emitted)
  })
})
