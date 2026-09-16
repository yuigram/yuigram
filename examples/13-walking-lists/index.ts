/**
 * 13 — Walking the lists Telegram pages.
 *
 * Almost nothing Telegram holds is returned whole. A conversation's history, a
 * channel's members, its administration log, who reacted to a post, who saw a
 * story — each arrives one page at a time, and each is continued differently.
 * A walk is the loop over that: one request per page, made when you ask for the
 * next item rather than up front.
 *
 * ```sh
 * API_ID=12345 API_HASH=abc… SESSION=… pnpm tsx examples/13-walking-lists/index.ts @somechannel
 * ```
 *
 * `SESSION` is a string an account was exported from — see
 * [03-basic-userbot](../03-basic-userbot). **It is a logged-in account.** Keep
 * it out of repositories and out of messages to people helping you.
 *
 * Three things are worth knowing before running any of this against a real
 * account.
 *
 * **Every item is a request eventually.** A walk with no `limit` runs to the
 * end of the list, and Telegram limits accounts that ask for a great deal very
 * quickly. Every walk below sets one.
 *
 * **Stopping the loop stops the fetching.** That is the reason these are
 * generators rather than methods returning arrays: `break` costs nothing, and
 * the request for the page you did not read is never made.
 *
 * **Some of these need permission.** An administration log, an invite link and
 * a story's viewers are refused for an account that may not see them, and the
 * refusal comes from Telegram rather than from here.
 */

import { Account, type MessageView, memory } from 'yuigram'

const apiId = Number(process.env['API_ID'])
const apiHash = process.env['API_HASH']
const session = process.env['SESSION']
const target = process.argv[2]

if (!Number.isInteger(apiId) || apiHash === undefined || session === undefined) {
  throw new Error('Set API_ID, API_HASH and SESSION. See the comment at the top of this file.')
}

if (target === undefined) {
  throw new Error('Pass a channel or chat: pnpm tsx examples/13-walking-lists/index.ts @name')
}

const me = Account.fromString(session, {
  apiId,
  apiHash,
  // Telegram's server keys go here; they are published rather than secret.
  keys: [],
  bootstrap: {
    thisDc: 2,
    testMode: false,
    options: [
      {
        id: 2,
        host: '149.154.167.50',
        port: 443,
        ipv6: false,
        mediaOnly: false,
        cdn: false,
        secret: undefined,
        tcpoOnly: false,
        thisPortOnly: false,
        static: false,
      },
    ],
  },
  // What an account needs while it runs. The session is what is re-supplied on
  // every start here, so nothing has to survive the process — and the name is
  // what would keep this account's keys apart from another's if the store were
  // shared.
  storage: memory(),
  name: 'me',
})

await me.start()

/**
 * The plainest walk: messages, newest first.
 *
 * Paged by message number — each request asks for what sits before the oldest
 * of the last page — which is also the order the walk guarantees.
 */
console.log('--- the last 20 messages')

for await (const message of me.history(target, { limit: 20 })) {
  if (!message.isService) console.log(`  ${message.id}: ${message.text ?? '(no text)'}`)
}

/**
 * A list counted into rather than keyed.
 *
 * Members are paged by how many have already been seen, so somebody joining or
 * leaving mid-walk shifts every later position: an entry can be seen twice or
 * missed. That is what counting into a live list means, and no snapshot is
 * claimed by anything here.
 */
console.log('--- the first 20 members')

for await (const member of me.members(target, { limit: 20 })) {
  console.log(`  ${member.standing}: ${String(member.peer?.id)}`)
}

/**
 * Topics, when the conversation is a forum.
 *
 * Paged by three fields that have to agree, one of which depends on how the
 * forum is ordered — by when topics were created, or by activity. Which applies
 * is in the answer rather than in the request, so the walk reads it there.
 *
 * A conversation that is not a forum answers with nothing rather than failing.
 */
console.log('--- topics')

for await (const topic of me.forumTopics(target, { limit: 10 })) {
  console.log(`  ${topic.id}: ${topic.title ?? '(deleted)'} (${topic.unreadCount ?? 0} unread)`)
}

/**
 * Who reacted to the newest message.
 *
 * One entry per account per reaction, so somebody who reacted twice appears
 * twice — that is what the list is rather than a duplicate.
 */
let newest: MessageView | undefined

// One page of one, which is one request. The walk ends itself at the limit, so
// nothing has to break out of this.
for await (const message of me.history(target, { limit: 1 })) newest = message

if (newest !== undefined) {
  console.log(`--- who reacted to ${newest.id}`)

  for await (const who of me.reactions(target, newest.id, { limit: 20 })) {
    console.log(`  ${String(who.peer?.id)} ${who.identity.emoji ?? who.identity.kind}`)
  }
}

/**
 * The administration log, for a channel this account can administer.
 *
 * Paged by a 64-bit identifier rather than a number: a busy channel's log
 * outgrows what a number holds exactly, and a cursor that lost precision would
 * page in circles.
 *
 * `kind` is the action's constructor without its long common prefix, which is
 * what you switch on; `action` is the whole of it when you need a field.
 */
console.log('--- the last 10 administrative acts')

try {
  for await (const event of me.chatEvents(target, { limit: 10 })) {
    console.log(`  ${event.kind} by ${String(event.userId)}`)
  }
} catch (error) {
  // Telegram refuses this for an account that may not see it, which is where
  // that rule belongs. Reported rather than swallowed: a walk that returned
  // nothing on a refusal would look like an empty log.
  console.log(`  refused: ${error instanceof Error ? error.message : String(error)}`)
}

/**
 * Stopping early, which is the point of a generator.
 *
 * This reads at most one page however long the conversation is: the request for
 * the second page is never made, because nothing asked for the item that would
 * have needed it.
 */
console.log('--- the first message mentioning "release"')

for await (const found of me.search(target, 'release')) {
  console.log(`  ${found.id}: ${found.text ?? ''}`)
  break
}

/**
 * A list spread across conversations.
 *
 * A message number means nothing across conversations, so Telegram returns a
 * rate with each page and expects it back with the last message's conversation
 * and number. The walk keeps those three in step; a loop written by hand is
 * where they come apart.
 */
console.log('--- the last 10 public posts tagged #telegram')

for await (const post of me.searchHashtag('telegram', { limit: 10 })) {
  console.log(`  ${String(post.chat?.id)}/${post.id}: ${(post.text ?? '').slice(0, 60)}`)
}

/**
 * Stories, for the accounts this one follows.
 *
 * The only walk here with no page size to ask for: the server decides how much
 * a page holds, and `limit` counts the accounts rather than their stories.
 */
console.log('--- stories from the first 5 accounts that have any')

for await (const entry of me.allStories({ limit: 5 })) {
  console.log(`  ${String(entry.peer?.id)}: ${entry.stories.length} stories`)
}

await me.stop()
