/**
 * Emits the event taxonomy.
 *
 * Two things the runtime needs and neither can be hand-maintained:
 *
 * - the map from an `Update` field to an event kind, and
 * - the **service-message promotion table**.
 *
 * The Bot API delivers a member join as a `message` whose `new_chat_members`
 * field is set. Left raw, every application writes the same defensive
 * branching inside its message handler, and some of them get it wrong — a
 * service message has no text and no author intent, so it falling through into
 * text handling is a bug waiting to happen.
 *
 * Promotion is detected from the documentation rather than curated: Telegram
 * opens these descriptions with "Service message:". The handful that predate
 * that convention are listed in `patches.ts` with the reason.
 */

import type { BotApiSchema, ObjectType } from '../bot-api/ir.js'
import {
  EVENT_NAME_OVERRIDES,
  LEGACY_SERVICE_FIELDS,
  UPDATE_NAME_OVERRIDES,
} from '../bot-api/patches.js'
import { header, renderDoc } from './render.js'
import type { EmittedFile } from './types.js'

/** Matches a description Telegram marks as a service message. */
const SERVICE_DESCRIPTION = /^(service message|message is a service message)/i

/** One promoted service message. */
export interface ServiceEvent {
  /** The `Message` field that carries it. */
  readonly field: string
  /** The Yuigram event kind. */
  readonly kind: string
  /** Documentation text, for the generated comment. */
  readonly description: string
}

/** Find every service-message field on `Message`. */
export function collectServiceEvents(schema: BotApiSchema): ServiceEvent[] {
  const message = schema.objects.find((object) => object.name === 'Message')
  if (message === undefined) return []

  const events: ServiceEvent[] = []

  for (const field of message.fields) {
    const documented = SERVICE_DESCRIPTION.test(field.description)
    const legacy = LEGACY_SERVICE_FIELDS.has(field.name)
    if (!documented && !legacy) continue

    events.push({
      field: field.name,
      kind: EVENT_NAME_OVERRIDES.get(field.name) ?? field.name,
      description: field.description,
    })
  }

  return events.sort((a, b) => a.kind.localeCompare(b.kind))
}

/** One top-level update kind. */
export interface UpdateEvent {
  /** The `Update` field that carries it. */
  readonly field: string
  /** The Yuigram event kind. */
  readonly kind: string
  /** The payload type. */
  readonly type: string
  readonly description: string
}

/**
 * Update fields whose payload is a `Message`.
 *
 * Only these can carry a service marker, so only these are scanned for
 * promotion. Derived from the schema rather than listed by hand: a hardcoded
 * set was already missing `guest_message` on the day it was written.
 */
export function collectMessageFields(schema: BotApiSchema): string[] {
  const update = schema.objects.find((object) => object.name === 'Update')
  if (update === undefined) return []

  return update.fields
    .filter((field) => field.type.kind === 'reference' && field.type.name === 'Message')
    .map((field) => field.name)
    .sort()
}

/**
 * Every event kind whose payload is a `Message`.
 *
 * The kinds, not the raw field names: routing matches on kinds, and the two
 * differ wherever a name override applies. A hand-maintained list of these
 * drifts the moment Telegram adds a message-bearing update, and the failure is
 * silent - commands simply stop firing for that kind.
 */
export function collectMessageKinds(schema: BotApiSchema): string[] {
  return collectMessageFields(schema)
    .map((field) => UPDATE_NAME_OVERRIDES.get(field) ?? field)
    .sort()
}

/**
 * For every event kind, the `Update` fields a subscription must name.
 *
 * `allowed_updates` takes Telegram's own update type names, which are the
 * `Update` field names — not Yuigram's kinds, and not the service kinds at
 * all. A service kind is a message carrying a marker, so subscribing to one
 * means subscribing to every field that can deliver a message.
 *
 * Generated because getting it wrong is silent: Telegram simply never sends
 * the update, and the handler never runs.
 */
export function collectSubscriptions(schema: BotApiSchema): Array<[string, string[]]> {
  const messageFields = collectMessageFields(schema)

  const entries: Array<[string, string[]]> = collectUpdateEvents(schema).map((event) => [
    event.kind,
    [event.field],
  ])

  for (const service of collectServiceEvents(schema)) {
    entries.push([service.kind, [...messageFields]])
  }

  return entries.sort((a, b) => a[0].localeCompare(b[0]))
}

/** Find every top-level update kind. */
export function collectUpdateEvents(schema: BotApiSchema): UpdateEvent[] {
  const update = schema.objects.find((object) => object.name === 'Update')
  if (update === undefined) return []

  return update.fields
    .filter((field) => field.name !== 'update_id')
    .map((field) => ({
      field: field.name,
      kind: UPDATE_NAME_OVERRIDES.get(field.name) ?? field.name,
      type: field.type.kind === 'reference' ? field.type.name : 'unknown',
      description: field.description,
    }))
    .sort((a, b) => a.kind.localeCompare(b.kind))
}

/** Render a string-keyed literal map. */
function renderMap(entries: ReadonlyArray<readonly [string, string]>): string {
  return entries.map(([key, value]) => `  ${JSON.stringify(key)}: '${value}',`).join('\n')
}

/** Emit the event taxonomy and the promotion table. */
export function emitEvents(schema: BotApiSchema): EmittedFile {
  const updates = collectUpdateEvents(schema)
  const services = collectServiceEvents(schema)

  const updateKinds = updates.map((event) => `  | '${event.kind}'`).join('\n')
  const serviceKinds = services.map((event) => `  | '${event.kind}'`).join('\n')

  const updateMap = renderMap(updates.map((event) => [event.field, event.kind] as const))
  const serviceMap = renderMap(services.map((event) => [event.field, event.kind] as const))

  const payloadEntries = updates
    .map((event) => `  ${JSON.stringify(event.kind)}: ${event.type}`)
    .join('\n')

  const referenced = [...new Set(updates.map((event) => event.type))]
    .filter((name) => name !== 'unknown')
    .sort()

  const body = `import type { ${referenced.join(', ')} } from './types/index.js'

${renderDoc('Event kinds produced by a top-level `Update` field.')}export type UpdateEventKind =
${updateKinds}

${renderDoc(
  'Event kinds promoted from a service message. The Bot API delivers each of these as a `message` with the corresponding field set; Yuigram raises them to their own kind so applications do not have to branch inside a message handler.',
)}export type ServiceEventKind =
${serviceKinds}

/** Every Bot API event kind. */
export type BotEventKind = UpdateEventKind | ServiceEventKind

${renderDoc('Maps an `Update` field to its event kind.')}export const UPDATE_EVENTS = {
${updateMap}
} as const satisfies Record<string, UpdateEventKind>

${renderDoc(
  'Maps a service-message field on `Message` to its event kind. Order matters: the first field present wins, and a message carrying none of them is an ordinary message.',
)}export const SERVICE_EVENTS = {
${serviceMap}
} as const satisfies Record<string, ServiceEventKind>

${renderDoc('The payload type carried by each top-level update kind.')}export interface UpdatePayloads {
${payloadEntries}
}

${renderDoc(
  'Update fields whose payload is a `Message`, and so may carry a service marker. Only these are scanned for promotion.',
)}export const MESSAGE_FIELDS: ReadonlySet<string> = new Set([
${collectMessageFields(schema)
  .map((field) => `  '${field}',`)
  .join('\n')}
])

${renderDoc(
  'Every event kind whose payload is a `Message`. Anything matching text - commands, text filters - must consider all of them, or it silently ignores the kinds it forgot.',
)}export const MESSAGE_KINDS = [
${collectMessageKinds(schema)
  .map((kind) => `  '${kind}',`)
  .join('\n')}
] as const satisfies readonly UpdateEventKind[]

${renderDoc(
  'For every event kind, the `Update` fields a subscription must name. `allowed_updates` takes Telegram’s update type names, which are the `Update` field names rather than Yuigram kinds; a service kind is a message carrying a marker, so it maps to every field that can deliver one.',
)}export const KIND_SUBSCRIPTIONS: Readonly<Record<string, readonly string[]>> = {
${collectSubscriptions(schema)
  .map(([kind, fields]) => `  '${kind}': [${fields.map((f) => `'${f}'`).join(', ')}],`)
  .join('\n')}
}

${renderDoc(
  'Every Telegram update type, for a subscription that must not narrow. Omitting `allowed_updates` is not equivalent: Telegram reuses whatever a previous run configured, and its default excludes chat member and reaction updates entirely.',
)}export const ALL_UPDATE_TYPES: readonly string[] = [
${collectUpdateEvents(schema)
  .map((event) => `  '${event.field}',`)
  .join('\n')}
]
`

  return {
    path: 'events.ts',
    contents: `${header(schema.version, 'Bot API event taxonomy')}${body}`,
  }
}

/** Report what the promotion detection found, for review during regeneration. */
export function describeServiceDetection(schema: BotApiSchema): string {
  const message = schema.objects.find((object) => object.name === 'Message') as
    | ObjectType
    | undefined

  if (message === undefined) return 'Message type not found'

  const documented = message.fields.filter((field) =>
    SERVICE_DESCRIPTION.test(field.description),
  ).length
  const legacy = message.fields.filter(
    (field) =>
      !SERVICE_DESCRIPTION.test(field.description) && LEGACY_SERVICE_FIELDS.has(field.name),
  ).length

  return `service messages: ${documented} detected from descriptions, ${legacy} from patches`
}
