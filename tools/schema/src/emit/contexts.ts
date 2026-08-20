/**
 * Per-event context shapes.
 *
 * One context type for every update kind is what lets a handler registered for
 * `message` receive a `chat` that is a `Chat` rather than a `Chat | undefined`.
 * The single shared context of 0.1.0 had to degrade every field to its weakest
 * case, because one type served twenty-six kinds.
 *
 * What is generated here is the **data shape** only: the payload's own fields,
 * carried through with the optionality the schema declares, plus two normalized
 * accessors. Behaviour — `reply`, `edit`, `react` — is written by hand on top,
 * because it is small, transport-aware, and not derivable from a schema.
 *
 * Two normalizations are applied, and only two:
 *
 * - `sender`, because Telegram spells the same idea `from` on most payloads and
 *   `user` on others. One name for one concept.
 * - `payload`, an alias under a domain name (`message`, `query`) so a handler
 *   can reach the whole object without knowing which field carried it.
 *
 * Everything else keeps Telegram's own name. A framework that renames the
 * protocol makes its own documentation the only reference, and Telegram's
 * becomes useless.
 */

import type { BotApiSchema, Field, ObjectType } from '../bot-api/ir.js'
import { collectUpdateEvents } from './events.js'
import { header, pascalCase, renderDoc, renderField, renderType } from './render.js'
import type { EmittedFile } from './types.js'

/**
 * Domain names for the payload alias, by payload type.
 *
 * Only where a better noun than `payload` exists. Anything absent keeps
 * `payload`, which is honest for updates that are not about one obvious thing.
 */
const PAYLOAD_ALIASES = new Map<string, string>([
  ['Message', 'message'],
  ['CallbackQuery', 'query'],
  ['InlineQuery', 'inlineQuery'],
  ['ChosenInlineResult', 'chosenResult'],
  ['ShippingQuery', 'shippingQuery'],
  ['PreCheckoutQuery', 'preCheckoutQuery'],
  ['Poll', 'poll'],
  ['PollAnswer', 'answer'],
  ['ChatMemberUpdated', 'update'],
  ['ChatJoinRequest', 'request'],
  ['MessageReactionUpdated', 'reaction'],
  ['MessageReactionCountUpdated', 'reactionCount'],
  ['ChatBoostUpdated', 'boostUpdate'],
  ['ChatBoostRemoved', 'removal'],
  ['BusinessConnection', 'connection'],
  ['BusinessMessagesDeleted', 'deletion'],
  ['PaidMediaPurchased', 'purchase'],
  ['ManagedBotUpdated', 'update'],
  ['BotSubscriptionUpdated', 'subscription'],
])

/** Fields whose name Telegram varies for the same concept. */
const SENDER_FIELDS = ['from', 'user']

/** One generated context shape. */
export interface ContextShape {
  /** Interface name, e.g. `MessageEventFields`. */
  readonly name: string
  /** The payload type it projects. */
  readonly payload: string
  /** Event kinds that share it. */
  readonly kinds: readonly string[]
  /** The domain alias for the whole payload. */
  readonly alias: string
}

/** Find the field carrying the sender, if the payload has one. */
function senderField(object: ObjectType): Field | undefined {
  for (const name of SENDER_FIELDS) {
    const field = object.fields.find((f) => f.name === name)
    if (field !== undefined && field.type.kind === 'reference' && field.type.name === 'User') {
      return field
    }
  }
  return undefined
}

/**
 * Group update kinds by the payload they carry.
 *
 * Seven kinds carry a `Message` and two carry a `ChatMemberUpdated`, so grouping
 * turns twenty-six kinds into nineteen shapes — and a handler written against
 * the message shape works for edits and channel posts without being rewritten.
 */
export function collectContextShapes(schema: BotApiSchema): ContextShape[] {
  const byPayload = new Map<string, string[]>()

  for (const event of collectUpdateEvents(schema)) {
    if (event.type === 'unknown') continue
    const kinds = byPayload.get(event.type) ?? []
    kinds.push(event.kind)
    byPayload.set(event.type, kinds)
  }

  return [...byPayload.entries()]
    .map(([payload, kinds]) => ({
      name: `${pascalCase(payload)}EventFields`,
      payload,
      kinds: [...kinds].sort(),
      alias: PAYLOAD_ALIASES.get(payload) ?? 'payload',
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Raised when a payload alias would shadow one of the payload's own fields.
 *
 * `ChatBoostUpdated` already has a field called `boost`, so aliasing the whole
 * payload to `boost` produced a duplicate member that only surfaced when the
 * generated file was compiled. Telegram adds fields regularly, so the next
 * collision is a matter of time and should fail the generator loudly rather
 * than emit something that does not build.
 */
function assertAliasIsFree(shape: ContextShape, object: ObjectType): void {
  const collision = object.fields.find((field) => field.name === shape.alias)

  if (collision !== undefined) {
    throw new Error(
      `context alias '${shape.alias}' for ${shape.payload} collides with its own field ` +
        `'${collision.name}'. Choose a different alias in PAYLOAD_ALIASES.`,
    )
  }

  if (shape.alias === 'sender' && senderField(object) !== undefined) {
    throw new Error(
      `context alias 'sender' for ${shape.payload} collides with the sender accessor.`,
    )
  }
}

/** Render one context interface. */
function renderShape(shape: ContextShape, object: ObjectType): string {
  assertAliasIsFree(shape, object)

  const sender = senderField(object)
  const lines: string[] = []

  const doc = renderDoc(
    `Fields carried by \`${shape.payload}\`, projected onto the context for ${
      shape.kinds.length === 1
        ? `the \`${shape.kinds[0]}\` event`
        : `${shape.kinds.length} event kinds`
    }: ${shape.kinds.map((k) => `\`${k}\``).join(', ')}.`,
  )

  lines.push(`${doc}export interface ${shape.name} {`)

  lines.push(`  /** The whole payload, under a domain name. */`)
  lines.push(`  readonly ${shape.alias}: ${shape.payload}`)
  lines.push('')

  if (sender !== undefined) {
    lines.push(`  /** Who caused this. Telegram spells it \`${sender.name}\` on this payload. */`)
    lines.push(`  readonly sender: User${sender.required ? '' : ' | undefined'}`)
    lines.push('')
  }

  // The payload's own fields, with the schema's optionality preserved. The
  // sender field is skipped: `sender` above is the same value under one name.
  // `renderField` is reused rather than reimplemented, so these read exactly
  // like the generated object types and stay in step if that renderer changes.
  const fields = object.fields
    .filter((field) => sender === undefined || field.name !== sender.name)
    .map((field) => renderField(field))
    .join('')

  return `${lines.join('\n')}\n${fields}}`
}

/** Emit the context shapes and the kind-to-shape mapping. */
export function emitContexts(schema: BotApiSchema): EmittedFile {
  const objects = new Map(schema.objects.map((o) => [o.name, o]))
  const shapes = collectContextShapes(schema).filter((s) => objects.has(s.payload))

  const referenced = new Set<string>(['User'])
  for (const shape of shapes) {
    referenced.add(shape.payload)
    const object = objects.get(shape.payload)
    if (object === undefined) continue
    for (const field of object.fields) {
      for (const name of typeNames(renderType(field.type))) {
        if (objects.has(name)) referenced.add(name)
      }
    }
  }

  const imports = [
    `import type { UpdateEventKind } from './events.js'`,
    `import type { ${[...referenced].sort().join(', ')} } from './types/index.js'`,
  ].join('\n')

  const bodies = shapes
    .map((shape) => renderShape(shape, objects.get(shape.payload) as ObjectType))
    .join('\n\n')

  const mapping = shapes
    .flatMap((shape) => shape.kinds.map((kind) => `  '${kind}': ${shape.name}`))
    .sort()
    .join('\n')

  // The runtime needs the same aliases the types declare. Emitting them removes
  // the hand-kept copy that would otherwise drift: the type would say
  // `boostUpdate` while the runtime wrote `boost`, and nothing would catch it.
  const aliasEntries = shapes
    .flatMap((shape) => shape.kinds.map((kind) => `  '${kind}': '${shape.alias}',`))
    .sort()
    .join('\n')

  const aliasDoc = renderDoc(
    'The domain name each event kind stores its payload under. Generated so the runtime and the types cannot disagree.',
  )

  const mappingDoc = renderDoc(
    'Maps an event kind to the fields its context carries. Registration selects the shape, so a handler for one kind never sees another kind’s optionality.',
  )

  const body = `${imports}

${bodies}

${mappingDoc}export interface EventFieldsByKind {
${mapping}
}

${aliasDoc}export const PAYLOAD_ALIASES = {
${aliasEntries}
} as const satisfies Readonly<Record<UpdateEventKind, string>>
`

  return {
    path: 'contexts.ts',
    contents: `${header(schema.version, 'Per-event context field shapes')}${body}`,
  }
}

/** Type names appearing in a rendered type expression. */
function typeNames(rendered: string): string[] {
  return rendered.match(/[A-Z][A-Za-z0-9]*/g) ?? []
}
