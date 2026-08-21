/**
 * Named registrations, one per event kind.
 *
 * `bot.on('chat_member_joined', handler)` and `bot.onChatMemberJoined(handler)`
 * do the same thing. The second is worth generating anyway: it is what
 * autocomplete offers after typing `bot.on`, which is how most people discover
 * that a service message has its own kind at all, and it is what lets an
 * assistant that has seen `onMessage` guess the other seventy-nine correctly.
 *
 * Eighty methods is far too many to hand-write and keep in step with Telegram —
 * and exactly the right number to generate, because each one is the same two
 * lines. What is emitted is a **declaration**: the runtime installs them by
 * walking the same kind list, so no method body is generated either.
 *
 * Kinds whose registration takes more than a handler — `onText` and `onCommand`
 * match as well as select, and `onCallbackQuery` accepts a pattern — are
 * written by hand and excluded here. A generated delegation would be a worse
 * version of a method that already exists.
 */

import type { BotApiSchema } from '../bot-api/ir.js'
import { collectServiceEvents, collectUpdateEvents } from './events.js'
import { header, pascalCase, renderDoc } from './render.js'
import type { EmittedFile } from './types.js'

/**
 * Registrations the client implements itself, and the generator must not claim.
 *
 * Each of these does something a delegation cannot: `onText` and `onCommand`
 * narrow what the handler receives by matching on it, `onCallbackQuery` accepts
 * a data pattern, and `onError` is not an event registration at all.
 */
const HAND_WRITTEN = new Set(['onText', 'onCommand', 'onCallbackQuery', 'onError'])

/** The method name for an event kind. */
export function registrationName(kind: string): string {
  return `on${pascalCase(kind)}`
}

/** One generated registration. */
export interface Registration {
  readonly kind: string
  readonly method: string
  readonly description: string
}

/** Every registration to generate, hand-written names excluded. */
export function collectRegistrations(schema: BotApiSchema): Registration[] {
  const events = [
    ...collectUpdateEvents(schema).filter((event) => event.type !== 'unknown'),
    ...collectServiceEvents(schema),
  ]

  const seen = new Set<string>()
  const registrations: Registration[] = []

  for (const event of events) {
    const method = registrationName(event.kind)
    if (HAND_WRITTEN.has(method) || seen.has(method)) continue

    seen.add(method)
    registrations.push({ kind: event.kind, method, description: event.description })
  }

  return registrations.sort((a, b) => a.method.localeCompare(b.method))
}

/**
 * First sentence of a description, trimmed for a one-line summary.
 *
 * Telegram's field descriptions run long and often restate the update
 * mechanism. The first sentence is the part that says what the event is.
 */
function summarize(description: string, kind: string): string {
  const first = description.split(/(?<=\.)\s/)[0]?.trim() ?? ''
  const text = first === '' ? `The \`${kind}\` event.` : first

  return text.endsWith('.') ? text : `${text}.`
}

/** Emit the registration interface and the kind list the runtime installs from. */
export function emitRegistrations(schema: BotApiSchema): EmittedFile {
  const registrations = collectRegistrations(schema)

  const members = registrations
    .map((registration) => {
      const doc = renderDoc(
        `${summarize(registration.description, registration.kind)} Equivalent to \`on('${registration.kind}', handler)\`.`,
        undefined,
        '  ',
      )

      return `${doc}  ${registration.method}(handler: EventHandler<ContextFor<'${registration.kind}'> & Ext>): this\n`
    })
    .join('\n')

  const entries = registrations
    .map((registration) => `  ['${registration.method}', '${registration.kind}'],`)
    .join('\n')

  const interfaceDoc = renderDoc(
    'A named registration for every event kind. Merged into `Bot`, and installed on its prototype from `REGISTRATIONS` — so the declaration and the runtime are generated from one list and cannot disagree.',
  )

  const tableDoc = renderDoc(
    'Method name to event kind, for installing the registrations above. Ordered by method name, so the emitted file is stable across regenerations.',
  )

  const body = `import type { ContextFor } from '../events/types.js'
import type { EventHandler } from '../bot.js'

${interfaceDoc}export interface GeneratedRegistrations<Ext> {
${members}}

${tableDoc}export const REGISTRATIONS: ReadonlyArray<readonly [method: string, kind: string]> = [
${entries}
]
`

  return {
    path: 'registrations.ts',
    contents: `${header(schema.version, `Named event registrations (${registrations.length})`)}${body}`,
  }
}
