---
'@yuigram/core': minor
'@yuigram/mtproto': minor
'yuigram': minor
---

An account's handlers, formatters and utilities, with the dispatcher features a bot already had.

**Dispatch.** Core's dispatcher gains numbered handler groups where the first match wins,
`Propagation.Continue`, `Stop` and `StopChildren`, `before` and `after` hooks, child dispatchers
that run after their parent with their own middleware and hand errors they decline to it, and
dependencies injected per dispatcher tree. A catcher returning `false` passes an error on. A
`once` handler runs once even when two updates evaluate its filter together, and `off` takes
effect for a dispatch already running.

**An account's registrations.** `account.on` and `once` take a kind, a filter, or both, with a
`group`; `off`, `before`, `after`, `inject`, `deps`, `addChild` and `extend` complete the surface,
and `AccountRouter` is a set of handlers that can be added to one. A kind no event has is refused
where it is registered. `@yuigram/mtproto/filters` — `yuigram/account-filters` — has filters for
account events, whose proof reaches the handler's context.

**Conversations on an account.** The conversation and session plugins install on an account.
Their keys name the sort of peer beside a 64-bit identifier, so a user and a basic group of the
same number are two conversations; a Bot API key is unchanged. When an account begins to stop, a
conversation waiting in memory is cancelled before the stop waits for handlers, and new waits are
refused until it starts again; durable flows are kept and carry on after a restart.

**Events.** Albums, polls and votes, stories, a bot being stopped, bot reactions, boosts, paid
media, business connections and messages, guest queries and pending join requests have kinds of
their own. `event.target` names whom an update is about. Replies, sends and edits from an event
take formatted text and send options, business messages are answered through their connection,
and events can be forwarded, copied, pinned, answered as queries and used to fetch the chat and
sender. `callbackButton`, `urlButton` and `inlineKeyboard` build buttons, and `f.callbackData`
reads a button's data through a callback-data schema.

**Formatting.** `fromHtml.with` and `fromMarkdown.with` choose `strict`, `lenient` or `partial`
reading and how whitespace is treated. A formatted value interpolated into a template keeps its
ranges, `null` and booleans are dropped, dates, `<br>`, more tag spellings and mentions carrying
their hash are read and written, and `toHtml` takes a highlighter. A mention is sent with the
access hash the account holds, or refused before sending. `MarkupParseError` is exported from
`@yuigram/core`.

**Utilities.** Documents take their type from their first bytes when none is given. File
identifiers become `InputDocument`, `InputPhoto` and media to send again. `@yuigram/mtproto/utils`
— `yuigram/account-utils` — has voice waveforms, stripped thumbnails as JPEG, path thumbnails,
Instant View rich text and page walking, and inline message identifiers. `normalizePhone` and the
peer conversions are public.

**Streams from an account** open their draft with a placeholder, as a bot's do, and number their
drafts per account.

Behaviour a caller may notice:

- A status, name or phone update, and any other update whose `user_id` is about a user rather
  than said in a chat with them, now has no `chat`; the user is `event.target`.
- A phone number is sent to Telegram as its digits during sign-in.
- `event.reply` resolves the conversation as `account.sendText` does, and is refused with the
  same `PeerError` for a peer the account has not seen.
- `uploadedDocument` no longer requires a `mimeType`.
