/**
 * Method bindings: which API methods a context can pre-address.
 *
 * An update arrives already addressing something — a chat, a message, a query
 * waiting for an answer. Every Bot API method that takes those identifiers as
 * parameters can therefore be offered on the context with them already filled
 * in, which is the difference between
 *
 * ```ts
 * await api.banChatMember({ chat_id: message.chat.id, user_id: 42 })
 * await message.banChatMember({ user_id: 42 })
 * ```
 *
 * What is emitted here is a **table**, not code: method name to the parameters
 * the context supplies. The types are derived from `ApiMethods` generically and
 * the runtime is one binder that reads the table, so a method Telegram adds
 * next month becomes a context method as soon as the schema is regenerated,
 * with no per-method code written or maintained anywhere.
 *
 * ## The classification
 *
 * A parameter name is not enough on its own. `forwardMessage` takes `chat_id`
 * as the *destination* and `from_chat_id` as the source, so binding `chat_id`
 * to the incoming chat would forward every message to itself. The rule set
 * below is therefore explicit about roles, and
 * {@link assertNoUnclassifiedRelocation} fails the build if Telegram adds
 * another method of that shape, rather than letting it be misclassified in
 * silence.
 *
 * ## Why this is not everything
 *
 * A method is bound only when the context genuinely holds the identifier it
 * needs. Nothing here guesses `user_id` from the sender: a moderation call
 * aimed at whoever happened to send the message is a footgun, and the caller
 * naming the target is one word longer and never ambiguous.
 */

import type { BotApiSchema, Method } from '../bot-api/ir.js'
import { header, renderDoc } from './render.js'
import type { EmittedFile } from './types.js'

/** Where a bound method's pre-filled values come from. */
export type BindingGroup =
  /** The message the update carried: its chat and its id. */
  | 'message'
  /** The chat the update arrived in. Sends also inherit thread and connection. */
  | 'chat'
  /** The message as the *source* of a relocation — forwarding, copying. */
  | 'source'
  /** A query awaiting an answer, by its id. */
  | 'callbackQuery'
  | 'inlineQuery'
  | 'shippingQuery'
  | 'preCheckoutQuery'

/** One method, and the parameters a context fills in for it. */
export interface Binding {
  readonly method: string
  readonly group: BindingGroup
  /** Parameter names supplied from the context, in schema order. */
  readonly injects: readonly string[]
}

/**
 * Parameters a message context can supply, by name.
 *
 * `message_thread_id` and `business_connection_id` are inherited rather than
 * required: a reply in a forum topic that loses the thread lands in the general
 * chat, and one that loses the business connection is sent by the bot instead
 * of by the account. Both are bugs users see, and both are avoided by carrying
 * the value the update arrived with.
 */
const MESSAGE_INJECTABLE = ['chat_id', 'message_id', 'message_thread_id', 'business_connection_id']

/** Parameters a chat-addressed method can have supplied. */
const CHAT_INJECTABLE = ['chat_id', 'message_thread_id', 'business_connection_id']

/** Query-answering methods, by the id they require. */
const QUERY_IDS: ReadonlyArray<{ readonly param: string; readonly group: BindingGroup }> = [
  { param: 'callback_query_id', group: 'callbackQuery' },
  { param: 'inline_query_id', group: 'inlineQuery' },
  { param: 'shipping_query_id', group: 'shippingQuery' },
  { param: 'pre_checkout_query_id', group: 'preCheckoutQuery' },
]

/**
 * Methods that move a message somewhere else.
 *
 * `chat_id` is the destination and stays the caller's, while `from_chat_id`
 * and the message identifier are what the context supplies. Listed explicitly
 * because the distinction is semantic and no parameter name carries it.
 */
const RELOCATIONS: ReadonlyMap<string, readonly string[]> = new Map([
  ['forwardMessage', ['from_chat_id', 'message_id']],
  ['copyMessage', ['from_chat_id', 'message_id']],
  // The plural forms take a list the caller chooses, so only the source chat
  // comes from the context.
  ['forwardMessages', ['from_chat_id']],
  ['copyMessages', ['from_chat_id']],
])

/**
 * Methods excluded from binding despite matching a rule.
 *
 * Each entry states why. An exclusion is a judgement, so it is written down
 * rather than expressed as a pattern that would quietly capture something else
 * later.
 */
const EXCLUDED: ReadonlyMap<string, string> = new Map([
  // Takes `from_chat_id` with no `chat_id` at all: the story is posted to the
  // business account, not to the chat the update came from.
  ['repostStory', 'posts to the business account rather than to this chat'],
])

/** Parameter names a method declares. */
function parameterNames(method: Method): Set<string> {
  return new Set(method.parameters.map((parameter) => parameter.name))
}

/**
 * Parameter names a method *requires*.
 *
 * The distinction decides whether a method answers a query or merely mentions
 * one. Every `sendX` method takes an optional `callback_query_id`, because Bot
 * API 10 lets a bot answer a callback query with a message; only
 * `answerCallbackQuery` requires it. Matching on declaration alone classified
 * `sendMessage` as a query answer, which is the kind of mistake a schema-driven
 * rule makes confidently.
 */
function requiredNames(method: Method): Set<string> {
  return new Set(
    method.parameters.filter((parameter) => parameter.required).map((parameter) => parameter.name),
  )
}

/** Parameters the method declares, restricted to what a context can supply. */
function injectable(method: Method, candidates: readonly string[]): string[] {
  const declared = parameterNames(method)
  return candidates.filter((name) => declared.has(name))
}

/**
 * Fail the build when a relocation-shaped method is not classified.
 *
 * `from_chat_id` means the method distinguishes source from destination. A new
 * one appearing without an entry in {@link RELOCATIONS} would otherwise be
 * classified by `chat_id` alone and bind the destination to the incoming chat,
 * which is silent, plausible-looking and wrong.
 */
function assertNoUnclassifiedRelocation(schema: BotApiSchema): void {
  const unhandled = schema.methods
    .filter((method) => parameterNames(method).has('from_chat_id'))
    .filter((method) => !RELOCATIONS.has(method.name) && !EXCLUDED.has(method.name))
    .map((method) => method.name)

  if (unhandled.length > 0) {
    throw new Error(
      `${unhandled.join(', ')} take 'from_chat_id', so source and destination differ. ` +
        `Add each to RELOCATIONS with the parameters the context supplies, or to EXCLUDED with a reason.`,
    )
  }
}

/** Classify every method the schema declares. */
export function collectBindings(schema: BotApiSchema): Binding[] {
  assertNoUnclassifiedRelocation(schema)

  const bindings: Binding[] = []

  for (const method of schema.methods) {
    if (EXCLUDED.has(method.name)) continue

    const declared = parameterNames(method)
    const required = requiredNames(method)

    const query = QUERY_IDS.find((entry) => required.has(entry.param))
    if (query !== undefined) {
      bindings.push({ method: method.name, group: query.group, injects: [query.param] })
      continue
    }

    const relocation = RELOCATIONS.get(method.name)
    if (relocation !== undefined) {
      bindings.push({ method: method.name, group: 'source', injects: relocation })
      continue
    }

    if (!declared.has('chat_id')) continue

    // A method naming a specific message is bound to the message that arrived;
    // everything else addresses the chat it arrived in.
    const group: BindingGroup = declared.has('message_id') ? 'message' : 'chat'
    const injects = injectable(method, group === 'message' ? MESSAGE_INJECTABLE : CHAT_INJECTABLE)

    bindings.push({ method: method.name, group, injects })
  }

  return bindings.sort((a, b) => a.method.localeCompare(b.method))
}

/** Render one group's table. */
function renderTable(name: string, doc: string, bindings: readonly Binding[]): string {
  const entries = bindings
    .map((binding) => `  ${binding.method}: [${binding.injects.map((p) => `'${p}'`).join(', ')}],`)
    .join('\n')

  return `${renderDoc(doc)}export const ${name} = {
${entries}
} as const satisfies Readonly<Record<string, readonly string[]>>`
}

/** Groups that a message-bearing context receives, in the order they compose. */
const MESSAGE_CONTEXT_GROUPS: readonly BindingGroup[] = ['message', 'chat', 'source']

/** Emit the binding tables. */
export function emitBindings(schema: BotApiSchema): EmittedFile {
  const bindings = collectBindings(schema)
  const of = (group: BindingGroup): Binding[] => bindings.filter((b) => b.group === group)

  const tables = [
    renderTable(
      'MESSAGE_BOUND',
      'Methods addressed to the message that arrived. `chat_id` and `message_id` are its own.',
      of('message'),
    ),
    renderTable(
      'CHAT_BOUND',
      'Methods addressed to the chat the update arrived in. Sends also inherit the forum topic and the business connection, so a reply stays where the conversation is.',
      of('chat'),
    ),
    renderTable(
      'SOURCE_BOUND',
      'Methods that move this message elsewhere. The destination stays the caller’s; the source is this message.',
      of('source'),
    ),
    renderTable(
      'CALLBACK_QUERY_BOUND',
      'Methods answering the callback query that arrived.',
      of('callbackQuery'),
    ),
    renderTable(
      'INLINE_QUERY_BOUND',
      'Methods answering the inline query that arrived.',
      of('inlineQuery'),
    ),
    renderTable(
      'SHIPPING_QUERY_BOUND',
      'Methods answering the shipping query that arrived.',
      of('shippingQuery'),
    ),
    renderTable(
      'PRE_CHECKOUT_QUERY_BOUND',
      'Methods answering the pre-checkout query that arrived.',
      of('preCheckoutQuery'),
    ),
  ].join('\n\n')

  const groupsDoc = renderDoc(
    'Binding tables a message-bearing context installs, in composition order. Later tables never overwrite earlier ones — the check that guarantees it lives with the binder.',
  )

  const summary = MESSAGE_CONTEXT_GROUPS.map((group) => `${of(group).length} ${group}`).join(', ')

  const body = `${tables}

${groupsDoc}export const MESSAGE_CONTEXT_TABLES = [
  MESSAGE_BOUND,
  CHAT_BOUND,
  SOURCE_BOUND,
] as const
`

  return {
    path: 'bindings.ts',
    contents: `${header(schema.version, `Context method bindings (${summary})`)}${body}`,
  }
}
