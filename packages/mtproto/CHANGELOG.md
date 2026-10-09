# @yuigram/mtproto

## 1.0.0

### Major Changes

- `1.0.0` is the release after `0.1.0`. It was prepared first as `0.2.0`, which was never published;
  the changes listed below were made for it and are part of this release. From `1.0.0` on, a change that breaks
  the public API needs a major version. Upgrading from `0.1.0` is described, rename by rename, in
  `docs/migration.md`.

### Minor Changes

- 97ec9eb: An account's handlers, formatters and utilities, with the dispatcher features a bot already had.
  
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
- dfdf096: An account refuses, at compile time, a filter written for the Bot API's events. `account.on`,
  `account.once` and the same methods on `AccountRouter` accepted the `f` exported from `yuigram`,
  whose filters read Bot API fields such as `chat.type`; an account's events do not carry them, so
  such a handler compiled and never ran. A filter written for an account's events, for a narrower
  view of them, or for what both subsystems share is accepted as before.
  
  Migration: filter an account with the account filters, `import { f } from 'yuigram/account-filters'`
  (`@yuigram/mtproto/filters`) — for example `f.chat('user')` where the Bot API filter was
  `f.chat.private`.
- eab2c4b: `AccountRouter` can be copied and taken into another. `router.clone(children?)` returns an
  independent router with the same registrations, hooks, catchers and dependencies as they stand;
  `router.extend(other)` takes in another router as a snapshot, so what is registered on it
  afterwards is not taken in.
- 1b7430b: `bootstrapAt({ dc, host, port, testMode? })` builds the address list an account starts from out of
  the one datacenter an application names, in place of a configuration literal with every flag
  spelled out. The address is checked where it is written: a hostname, a port out of range or a
  datacenter identifier that is not a positive integer is a `ValidationError` rather than a
  connection that later fails. `DcConfiguration`, `DcAddress` and `BootstrapAddress` are exported, so
  a configuration built some other way can be typed.
- fd1fc06: `defineEvent<Payload>(kind)` defines an event the application raises itself, and `bot.emit` /
  `account.emit` dispatch it through the client's plugins, middleware, sessions and error handlers,
  tracked so that `stop()` waits for it. `bot.on(definition, handler)` and `account.on(definition,
  handler)` receive a typed `event.payload`. An emitted event has `transport: 'custom'`, no update
  identity, and no effect on polling offsets, update sequences or `allowed_updates`; it may carry the
  `chat` and `sender` it concerns so that their session loads. A kind Telegram also sends is refused.
- 6fc0fcc: `thumbnails`, `thumbnail` and `thumbnailFile` take a document as well as a photo. A document's
  `thumbs` and `video_thumbs` and a photo's `video_sizes` are listed beside its sizes, and each
  `Thumbnail` states its `availability`: `download` (`photoSize`, `photoSizeProgressive`,
  `videoSize`), `embedded` (stripped, cached and path sizes), `unsupported` (emoji and sticker
  compositions) or `unavailable` (`photoSizeEmpty`), plus whether it is a `video`. `thumbnailFile`
  addresses a document's thumbnail by the document's identifier, hash, reference and datacenter
  with the size named, and refuses an embedded, unsupported or empty size by what it is.
  
  `event.download({ thumbnail })` fetches one rendering of an event's document or photo, and puts a
  refused reference right from the message as the whole-file download does. `fileIdOfThumbnail`
  writes the identifier other clients use for a thumbnail, and `embeddedThumbnail` on
  `@yuigram/mtproto/utils` (and `yuigram/account-utils`) reads a carried one as a complete image.
  
  `Thumbnail.raw` is now `TypePhotoSize | TypeVideoSize`; `PhotoThumbnail` remains as its former
  name.
- 9dbecdf: The error names Telegram documents are typed. `RpcError.is`, `RpcError.argument` and `isRpcError`
  offer the names in Telegram's error database as completions (`'FLOOD_WAIT_%d'`,
  `'FILE_PART_%d_MISSING'`, `'CHANNEL_PRIVATE'`, …) and still accept any other string, and
  `error.is(pattern)` narrows `text` to the name matched. `RpcError.text` is `RpcErrorText`: the
  documented names with a number where they carry one, or any other string.
  
  The names are types only — `DocumentedErrorPattern` and `DocumentedErrorText`, generated from
  `schemas/tl/errors.json`, which records the database's codes, names and methods without its
  descriptions. Nothing is added to what an import loads, and how a refusal is classified — a wait
  as `FloodError`, a redirection as `MigrationError` — is unchanged.
- bfcebe5: `MediaView` reads the media whose content is a structure: `pollDetails` joins a poll's tally to its
  answers (voters, this account's choice, the right answer, and whether the results are partial),
  `todoDetails` joins a checklist's completions to its tasks, and `webpageDetails`, `gameDetails`,
  `stickerDetails` (type, format, set, custom emoji id, mask position, premium effect) and `location`
  read link previews, games, stickers and points. `videoCodec`, `videoStartTimestamp`,
  `isSilentVideo` and `preloadPrefixSize` read the rest of a video's attribute. The functions behind
  them — `readPoll`, `readTodo`, `readWebPage`, `readGame`, `readSticker`, `readLocation` — are
  exported for values held without a view.
- 72c33e0: MTProto, and a client surface that says what a handler was given.
  
  `npm install yuigram` now builds bots and user accounts in one project, on an implementation
  this repository owns end to end. The published packages still have zero runtime dependencies:
  the cryptography Node does not provide — AES-IGE, Telegram's RSA padding, PQ factorization,
  Miller-Rabin, SRP — is implemented here.
  
  **Accounts.** An `Account` client with its own lifecycle, signing in by phone and code, by
  password, as a bot, or from a token another device approves. Sessions are portable strings or
  an encrypted directory, and an account resumed from one never reaches a sign-in callback.
  Signing out revokes the authorization and forgets what only made sense while it held: the keys,
  the place in the update stream, and the peers whose access hashes were issued to it.
  
  **The protocol.** The full MTProto 2.0 stack: the authorization handshake with perfect forward
  secrecy, the session layer, transport framing and obfuscation, connection pools per datacenter
  and purpose, migration between datacenters, and the updates manager with gap recovery over the
  common box and per-channel sequences. 813 typed methods generated from a committed TL schema,
  with `call()` reaching anything newer.
  
  **Files.** Chunked parallel upload and download with the alignment rules the server enforces,
  photos fetched at the largest size worth fetching, expired file references put right invisibly
  from the message they arrived in, and delivery nodes behind an explicit opt-in — a node is
  recognised by the address list rather than by whatever redirected to it, holds an authorization
  good for nothing but ranges, and is asked for nothing else.
  
  **Reading a message.** A message arrives as three constructors behind one union — ordinary,
  service, and an empty hole where one the account cannot see used to be — with most fields
  optional behind that. `readMessage` returns a view that answers the questions directly, over the
  value it was handed rather than a copy of it, so nothing is transformed on the way in and the
  message stays reachable as `raw`. The view reaches no account and no network: everything it
  answers is a function of the message alone, which is what makes it safe to build one from
  anything that arrived, on any account.
  
  **Formatting.** MTProto has no `parse_mode`: a message is plain text plus a list of ranges, and
  producing the ranges is the client's job. `fromHtml` and `fromMarkdown` read markup into text and
  entities, `toHtml` and `toMarkdown` write it back, and both parsers are in the package rather than
  in a dependency. Used as template tags they escape what is interpolated and leave the markup
  alone, so a user called `<b>` cannot format the message they appear in. Block quotations are
  supported in both forms, expandable included, in both dialects and both directions.
  
  **Runtimes.** The Bot API subsystem reaches no Node built-in at all: polling, webhooks, sending
  and files-by-`Blob` need nothing but `fetch`. One import of `node:crypto`, for the single function
  comparing a webhook secret, had been keeping every bundle containing a bot from loading on Bun,
  Deno, Cloudflare Workers or Vercel Edge — the platforms the Fetch webhook adapter exists to serve.
  
  **And MTProto runs in a browser.** Every module that reached for `node:crypto` now names one
  contract instead, and the `browser` field in each package chooses between two implementations of
  it: the platform's, which Node, Bun and Deno all provide, and one over nothing at all. The second
  needed AES-256, SHA-1, SHA-256, MD5, HMAC and DEFLATE written here, each checked against the
  values published with the standards that define them before being compared with the platform. A
  WebSocket connector stands in for the socket a browser does not have, `web()` is a store over
  `localStorage`, and stretching a password goes to `crypto.subtle` — the one primitive worth
  waiting for, and the reason the rest do not wait.
  
  A bundle that builds is not a program that runs, so `tools/browser` serves the framework to a real
  browser and answers the WebSocket it opens with the datacenter the test suite uses. Seventeen
  checks pass in Chrome: the key exchange completes, a temporary key is bound, an encrypted call is
  answered, an update is dispatched, and the session survives in the page's own storage. Running it
  found what the build could not — `process.version` read at module scope, `Buffer` on four live
  paths, and a five-second prime validation that wants a worker.
  
  `docs/runtimes.md` has the matrix broken down step by step, says which cells were executed and
  which were only reasoned about, and states plainly that Bun, Deno, the edge platforms and Telegram
  itself are still inference.
  
  **Saying something.** An account can now start a conversation rather than only answer one.
  `sendText`, `sendMedia`, `editMessage`, `deleteMessages`, `forwardMessages`, `react`,
  `pinMessage`, `readHistory`, `setTyping` and `getMessages` sit on `Account`, take a name or a
  reference, and accept formatted text as readily as plain — so a bold message is one call rather
  than a string and a list of ranges kept in step by hand. The deduplication key every send needs
  is drawn rather than left to the caller, and where Telegram splits a method in two for channels
  the right one is chosen from the conversation.
  
  **Reading media.** `message.media` is a view rather than nineteen constructors. The one that
  matters most is the least informative — a video, a voice note, a sticker, an animation, a music
  track and a plain file all arrive as `messageMediaDocument`, and which one it is lives in the
  document's attributes — so `kind` answers that in a word, and duration, size, dimensions and the
  rest come off whichever attribute actually holds them.
  
  **The second factor.** Signing in with a password worked; managing one did not exist.
  `passwordStatus`, `setPassword`, `removePassword`, the recovery-address calls and the recovery
  flow are on `Account` now. The password never leaves the process: what goes to Telegram is a proof
  of the old one and a verifier for the new, and neither can be turned back into what was typed.
  
  **Searching, and who is in a conversation.** `account.search` walks the messages in one
  conversation that match a query; `account.searchGlobal` walks matches across every conversation;
  `account.members` walks a channel's members. Three lists, three different ways of continuing —
  by message number, by a rate the server returns with each page, and by how many have been seen —
  and each is the one Telegram actually specifies rather than one policy forced onto all three. A
  `MemberView` reads somebody's standing, where two of the six constructors name a conversation
  rather than a person.
  
  **Membership changes arrive as events.** Somebody joining, leaving, being promoted or being
  restricted now reaches a handler as `mtproto:membership` rather than as a raw update — all seven
  constructors Telegram kept for the one question, naming the conversation it happened in and the
  account that made the change rather than the one it was about. The seven disagree about which
  field means what: the actor is `actor_id` on the two modern forms, `inviter_id` on the oldest of
  the additions, and named nowhere on removal, promotion and renaming, where the event now says so
  instead of blaming the person it happened to. The whole-list form keeps its chat inside the list
  it wraps, and is read from there rather than reported as concerning no conversation.
  
  **A bot signed in over this transport gets its queries here.** A tapped button, an inline query,
  a chosen result, the two payment steps and a request to join now reach a handler as
  `mtproto:callback_query`, `mtproto:inline_query`, `mtproto:inline_chosen`,
  `mtproto:shipping_query`, `mtproto:precheckout_query` and `mtproto:join_request`. They have to
  be: a Bot API client is a different client on a different connection and cannot answer a query
  that arrived on this one. So `answerCallback`, `answerInlineQuery`, `answerShipping`,
  `answerPrecheckout` and `decideJoinRequest` sit on `Account`, each answering with the identifier
  the query arrived with — every one of these stalls something visible until it is answered, and a
  pre-checkout answer is the last point at which a charge can still be refused. A query is not a
  conversation, either: an inline query names no chat, and the event no longer invents a private
  one from whoever asked.
  
  **Walking a list.** Eighteen lists that arrive one page at a time now read as one sequence:
  conversations, a conversation's messages, a search inside one and across all of them, members,
  forum topics, a channel's administration log, invite links and the people who came through them,
  who reacted to a message, profile photos, stories on a profile and across everyone an account
  follows, who saw a story, boosts, star transactions and saved gifts. Each is an async generator,
  so nothing is requested until the loop asks for the next item: breaking out stops the fetching and
  `limit` means what it says.
  
  Continuing them is the part a caller writing the loop gets wrong, and it is not one rule. Eight
  different ones are involved — a cursor only the server can produce, a count into a list that is
  changing while it is read, several fields that have to agree, an identifier that has to keep
  moving backwards, a state string sent back with a flag saying it is a continuation — and two of
  them end in ways that are invisible in what a walk yields: a server that names a cursor and
  returns nothing, and a last page that still carries a state. `docs/entities.md` §6 has the table.
  
  A walk yields a view where reading the value needs interpretation, and the value the schema
  describes where it does not.
  
  **Every walk now has a page read beside it.** `account.historyPage`, `account.membersPage`,
  `account.savedGiftsPage` and the rest answer with the items, the total Telegram reported and a
  cursor to continue from — which is what a program needs when a list has to be shown with a
  count, stopped now and carried on later. A total says whether it is exact, approximate or merely
  reported, and is never the length of the page; a cursor is opaque but not secret, refused before
  any request when handed to a different list or the same list with different filters, and carries
  peer references rather than access hashes. An empty page with a moving cursor is a list that
  paused, not a list that ended. Twenty lists ship, under nine continuation policies, because that
  is how many Telegram actually specifies.
  
  **Sends that are several messages, or several steps.** `sendAlbum` hands each uploaded item to
  Telegram first, because an album cannot carry bytes, then sends one request with a key per item
  and answers in the order given. `copyMessage` and `copyAlbum` read a message and send what it
  carries as a new one, which is what lets a caption change where a forward cannot — and what lets
  a file reference that expired in between be put right, by reading the message again. A quote is
  cut out of the message it quotes so the two cannot disagree; a comment finds the post's thread
  and goes to the discussion group. Scheduled messages can be read, removed, and sent now, with
  the pairing between each scheduled message and what it became read from the answer.
  
  **Acting on a message that exists.** Voting by option or position and closing a poll; paid
  reactions under the time-based identifier Telegram requires, drawn again only when it aged;
  checklists appended to and ticked; translation of messages or bare text; reading reactions and
  unpinning everything, each applied to the sequence its position belongs to. An inline message is
  edited on the datacenter its identifier names, given as an update's object or as the Bot API's
  string. Rich messages go out as blocks or markup, and a streaming draft is a handle rather than a
  background task: each write is one request, and stopping it is one more. The reads beside them —
  an album from any of its messages, the message replied to, one named by a link, reactions in
  bulk, a fact check, a link preview and the available effects — answer in the order asked.
  
  **The bot surface, and sticker sets.** Commands per scope and language, a bot's description read
  and written by the bot or by the account that owns it, the menu button, and the rights a bot
  asks for in a group or a channel. A person's side of a bot as well: pressing a button (with a
  password proof where the button asks for one), a mini app opened in a conversation and prolonged
  every minute until it is closed, Telegram forgets the query, or the account stops. Sticker sets
  are created, extended, reordered and given thumbnails, each sticker's file handed to Telegram
  first and checked for what Telegram would refuse before anything is uploaded; custom emoji are
  read by identifier or gathered from the messages that use them.
  
  **Communities, which are not conversations.** A community holds chats and channels, keeps its
  own participants, and decides which of the chats it holds each participant can see. Nothing is
  said in one. It is addressed the way a channel is, which is all the two have in common, so
  `ChatView.isCommunity` narrows and `isAddressedAsChannel` answers the addressing question that
  `isChannel` used to answer by accident. Creating, listing, linking and unlinking chats,
  approving the requests to be listed, banning participants and reading which chats one of them
  has — eleven operations, with a page of link requests continued by Telegram's own opaque offset.
  
  **Ephemeral and welcome messages.** A message shown to one person in a chat and never added to
  its history, so the address is the chat, the receiver and the number together — the number alone
  means nothing outside that person's view. A guest chat has no conversation to name and carries a
  query identifier instead. They arrive as four update kinds of their own, because the payload is
  an `EphemeralMessage` rather than a `Message` and a handler registered for `message` would read
  fields it does not have. Welcome templates are the only ones that can be read back.
  
  **Games, and the operations that concern the account itself.** A score set in a conversation
  comes back as the edited board and one set inline comes back as nothing, which is Telegram's
  distinction rather than a simplification. A takeout wraps each call rather than opening a second
  connection, and ending one closes the export without signing the account out. `withParams` binds
  only the call options the path actually honours. `isSelfPeer` answers from what the account
  already knows. `resendCode` continues the attempt in hand instead of starting a fresh one, and
  `startTest` signs in on a test datacenter with a reserved number whose code is known in advance.
  
  **QR sign-in is the whole flow**, not the token behind it: display, wait, ask again when the
  token expires, and finish with the password where the account has one. Every exit cancels the
  wait, and stopping the account aborts it.
  
  **A download wears either stream shape.** `downloadAsStream` hands back a `ReadableStream` and
  `downloadAsNodeStream` a Node `Readable`, both adapting the existing iterable — so the ranges,
  the retries and the reference refresh are the one transfer, and cancelling either waits for it to
  unwind rather than walking away from it. The Node shape sits behind a module the `browser` field
  substitutes, so no browser bundle reaches `node:stream`. `downloadChunk` asks for one precise
  range at an arbitrary offset, which the grid-aligned transfers cannot do.
  
  **Conversations: scenes, prompts and typed buttons.** `conversation()` covers what is usually
  four packages, on one idea — a conversation has an identity, and state belongs to it. The key
  names the client first, so an application holding a bot and three accounts has four independent
  sets of conversations; the scope is chat and user by default, with chat, user and topic scopes
  for the cases where that is wrong. Updates for one conversation are serialised, so two answers
  arriving together cannot both advance the same step, while different conversations still run in
  parallel.
  
  A scene keeps a name, a step and the application's state, all of it plain data, so a restart
  resumes a half-finished form. `conversation.wait(...)` is a suspended function in memory and does
  not — that difference is stated rather than papered over, because it is the thing to know before
  choosing between them. A waiter belongs to one conversation, so a pending prompt never consumes
  another person's message; it can validate and re-ask, time out, be cancelled by a signal, and it
  is cancelled when the conversation enters or leaves a scene, or when the application calls
  `cancelAll` on stopping. A handler awaiting one hands the conversation's turn back while it waits
  and takes it again before carrying on, so the answer can reach it and its continuation never
  overlaps a later update.
  
  **Durable flows.** A conversation written as one function — ask, wait, act, ask again — that
  resumes after a restart. What is kept is not the function but a journal of plain data: what each
  step produced, and the wait the run is suspended at, with its deadline. On the next update, in
  whatever process is running, the function runs again from the top; every recorded step returns
  its recorded result without doing anything, and the pending wait is offered the update. Anything
  that reaches outside is an effect whose result is recorded, and an effect interrupted between
  starting and finishing is reported to the flow as uncertain rather than silently run twice —
  unless it says repeating is safe, in which case it runs again under the same idempotency key.
  Deadlines that pass while nothing runs are acted on at the next update or at startup; a
  redelivered update is recognised and not used twice; a run whose definition is missing, of a
  version the definition does not accept, or replayed down a different path than it recorded, is
  reported and left untouched rather than reset. Stopping a process is not cancelling a run.
  Updates for one conversation are serialised within a process; two processes over one store are
  not coordinated, and the documentation says so. The machinery loads only when flows are
  configured. `examples/16-durable-flows` finishes an order in a second process that the first
  started.
  
  `defineCallbackData` gives a button's 64 bytes a shape and measures them in UTF-8 rather than
  characters, so a schema does not build buttons Telegram rejects for applications whose users
  write in anything but ASCII. Data from an older release reads as nothing rather than as a wrong
  answer. Parsing is not authorisation, and the module says so.
  
  **An account in a worker.** `yuigram/worker` runs accounts on another thread — a Node
  `worker_threads` worker, a browser `Worker`, or a `SharedWorker` that every tab of an origin
  attaches to — and hands the thread that attached a proxy with the account's own methods.
  The worker owns the account and makes each one once, however many callers ask at the same moment,
  so two tabs share one connection rather than opening two. Handlers run where they were
  registered; the update was decrypted in the worker and forwarded in the order the account
  delivered it, each caller with its own acknowledged window, and a caller that falls too far
  behind is told so and let go instead of silently missing updates. Leaving is not stopping: one
  tab closing releases its calls, iterators and handles and leaves the others as they were.
  
  What crosses is a fixed table of methods checked by name on the host — never a walk over the
  account's properties. Entity views cross as the value they read and are built again on arrival;
  the framework's error classes arrive as themselves, `FloodError` with its wait; a function crosses
  only where a method takes one, such as a sign-in prompt; a cancelled call is cancelled on the
  host too; and a worker that goes away fails every call still waiting on it. Importing `yuigram`
  loads none of this. `docs/runtimes.md` §6 has the contract and what has been run where.
  
  An account says where its link to Telegram stands — `offline`, `connecting`, `updating` while
  it catches up, `connected` — through `connectionStatus` and `onConnectionStatus`, once per change
  and in order, decided by the connection that carries its updates alone. A worker passes every
  change to every caller as it happens. A tab that is closed without a word is let go at once: the
  caller holds a Web Lock for as long as its page lives, and the host is granted the same lock when
  the page is destroyed, which is also why a hidden, throttled page is never mistaken for a closed
  one. A caller counts its host gone only when a ping it actually sent goes unanswered, and a
  handle that has been ended is no longer held on the host.
  
  **Formatted text.** `yuigram/markup` builds a message's text and entities rather than markup
  for Telegram to parse: builders for every entity, `format` for composing them, and `html` and
  `md` template tags whose interpolated values are always text. Both readers follow Telegram's
  rules for their dialect, refuse what it does not allow with an offset, and can read text that is
  still arriving; both writers produce markup that reads back to the same formatting. With the
  `markup()` plugin, any of the 119 formatted parameters takes a formatted value directly.
  
  **Rich messages.** `yuigram/rich` builds rich messages from blocks and rich text — the Bot API's
  own data, so built and hand-written blocks mix — and refuses what Telegram would. `Rich` wraps a
  message in any of its three forms. `parseRichMarkdown` and `parseRichHtml` read either dialect
  into blocks, strictly by default and within Telegram's limits, and `toMarkdown` and `toHtml`
  convert between every form.
  
  **Streaming.** `yuigram/stream` shows an answer while it is written: a draft that grows in a
  private chat and a message each time a window fills or the answer ends, from any model SDK's
  stream without depending on one. Drafts are paced and back off, flood waits are honoured, a final
  message is retried only when Telegram said to wait, and every way of ending early has a stated
  outcome. A reader's stop is honoured only for the stream that showed that draft. An account
  streams through its own drafts with `streamTo`.
  
  **Layer 229.** The committed schema is TDLib's, at a pinned revision, because the
  documentation page lags behind it; the constructors the TL language owns are the
  documentation's. TDLib's notice ships with `@yuigram/mtproto`, whose code is generated from it. A conversation-list row may be a community, which has no peer
  and no message, so `DialogView.peer` and `topMessageId` can be absent and `isCommunity` says why;
  `ChatForm` gains `'community'`. The rights records express every right the layer defines,
  checked against the generated tables so the next layer's additions fail a test rather than go
  missing.
  
  **One application, several identities.** An `App` holds a bot and any number of accounts, each
  with its own credentials, store and connections, under shared middleware and cross-client
  handlers. Operations that mean the same thing on both transports are the same call; the ones
  that do not stay on the client that has them.
  
  **Who an account is, and who it knows.** `me`, `users`, `profile`, `findByPhone`,
  `commonChats`, `editProfile`, `setUsername`, `setOnline`, `setEmojiStatus`, `setBirthday`,
  `setProfilePhoto`, `deleteProfilePhotos`, `messageTtl`/`setMessageTtl`, `contacts`,
  `addContact`, `importContacts`, `deleteContacts`, `block`/`unblock`, `readBlocked`,
  `peerSettings`, `setCloseFriends`, `savedMusic` and `saveMusic`. Each resolves the people it
  names through the account's own peer store, so the answers are harvested on the way back and
  everybody mentioned can be addressed afterwards without a second lookup.
  
  Naming a person is not naming a peer — several of these take a user rather than a conversation,
  and passing a channel is refused here by name rather than by the server answering with something
  about the request. The ones that edit a profile send only the fields they were given, because
  the method reads an absent field as "leave it" and an empty string as "clear it".
  
  **Conversations can be operated on, not only read from.** Sixty operations: adding, banning,
  restricting, kicking, promoting and ranking members; creating, editing, revoking and reading
  invite links, and deciding who gets in through one; renaming, describing, photographing, naming
  and colouring a conversation, and setting its slow mode, its message lifetime, its default
  permissions and its join rules; making and deleting groups, supergroups and channels; reading
  one or several, with everything Telegram will say; and folders, the archive, the unread mark and
  drafts.
  
  Telegram keeps basic groups and channels apart, so most of these are two calls and choosing
  between them is the operation's job — an operation that exists for only one kind says which it
  needed. Rights are taken as booleans and written as the protocol's true-or-absent flags; banning,
  restricting and unbanning are one call distinguished by what is in the set; a kick is two,
  because the protocol has no single one. Creating something reads it back out of its own answer,
  since the identifier and access hash arrive in the updates and there is no separate result.
  
  Answers carrying updates now reach the account, so a program that renames a channel sees the
  rename through its own handlers.
  
  **Peers are read in bulk, and conversations can be found rather than only named.**
  `account.peersOf([…])` reads who several peers are through the three bulk reads the protocol has
  — people, basic groups, channels — which is one request per family rather than one per peer, and
  the answer is positional, with a gap where a peer could not be named or Telegram would not
  describe it. `account.peer` and `account.user` are the single forms. `account.findDialogs` asks
  directly about whatever can already be addressed and walks the conversation list only for what is
  left, stopping the moment the last one turns up; names are matched against what the walk itself
  wrote down, so finding by name costs no extra request.
  
  **A channel can be watched.** Telegram does not push a channel's updates to an account that is
  not looking at it. `account.watchChat(chat)` starts a subscription that asks for the channel's
  difference at the interval each answer names, hands the updates to the ordinary handlers, and
  returns the way to stop. It is counted, so two parts of a program may watch one channel, and it
  ends by itself if the account turns out to no longer be in the channel.
  
  **Forums have topics.** Opening, renaming, closing, pinning, reordering, deleting a thread's
  history, reading topics by number, and turning a supergroup into a forum. The General topic is
  hidden through the same request that edits any other, so it has a name of its own rather than a
  special case a caller has to know about; deleting a thread's history keeps the account's place in
  the update stream, which a deletion it performed itself would otherwise gap.
  
  **Stories can be posted.** Posting, editing, deleting, pinning to a profile, archiving somebody
  else's, reacting, reading, counting views, and hiding this account's own views for a while. Who
  may see a story is sent explicitly even when it is everyone, because the field is required and a
  story whose audience was never decided should not be posted; an edit that does not mention the
  audience leaves it alone, which posting does not.
  
  **Gifts, boosts and a business profile.** Sending a gift, deciding what happens to one that
  arrives, upgrading it into a collectible, transferring it, buying one on resale, pricing one,
  prepaying an upgrade, pinning them, and the reads behind each. Everything that costs Stars
  fetches a payment form and pays that form — two requests Telegram requires, kept together — and
  takes the free-of-charge call where the server answers that nothing is owed. Prices keep their
  nanostar part, and a fractional price given as a plain number is refused rather than truncated.
  Boost slots say whether boosting would cost somebody else's boost, which is worth knowing before
  doing it. A Premium account can publish an intro, opening hours and pre-filled links, and the
  intro's sticker may be a file to hand over rather than only one Telegram already holds. Resale
  listings can be narrowed to a model, a pattern or a backdrop, and the answer carries the
  attribute index a marketplace filters by, with the hash that keeps it from being sent twice.
  
  **Files travel between clients as one string.** `readFileId` and `writeFileId` read and write the
  opaque identifier Bot API clients hand files around as — TDLib's encoding of exactly the fields a
  download needs — so a file a bot sends can be fetched here, and one fetched here can be handed to
  a bot. `uniqueFileId` is the other identifier, which carries no access hash and no file reference,
  never goes stale, and answers "is this the same file" the same way in every Telegram client.
  
  An identifier carrying a file reference does not make that reference valid: it is a record of one,
  and a download built from a stale identifier is refused exactly as one built from a stale
  reference held any other way. Version 4 is written and version 2 is read; a newer version is
  refused by name rather than guessed at.
  
  **The Bot API's payloads are built, and its other updates can be filtered.** `attach`,
  `newSticker`, `content`, `preview`, `replyTo`, `reaction`, `pollOption`, `price`, `invoice`,
  `shipping`, `menuButton`, `botCommands`, `permissions` and `adminRights` build the payloads
  methods take, each returning the object the schema declares and nothing more. They exist because
  the rules are not in the types: an album is captioned once, on the item a client shows the
  caption from; a permission set has to name all sixteen, because Telegram reads an absent
  permission as a withheld one; an invoice in Stars is priced in exactly one line.
  
  `richMessage` builds a rich message in exactly one of its three forms, and `richMedia` the files
  a written one names, with the `tg://` link each is named by written from the entry itself; a link
  to nothing, a link of the wrong kind and a duplicated id are refused before the request is made.
  `inline` now builds all twenty result shapes, the cached ones under `inline.cached`, and the
  button above the results.
  
  Filters now cover the updates that are not messages — reactions on both sides of a change,
  the three moments of a payment matched by the bot's own invoice payload, a standing change
  derived from the statuses before and after, routing by kind including a plugin's own, a reply to
  one particular message, boosts, business connections, game buttons and chosen inline results.
  `when()` takes a filter as well as a predicate, so gated middleware is written against what
  matching proved.
  
  **A peer can be named across the seam, and a link read or written.** `peerIdentity` reads a Bot
  API chat id into a kind and a bare identifier, `botApiId` writes one back, and `markedKind` says
  what a marked identifier is — including a secret chat, whose range sits below the channels and is
  refused as a peer rather than read as one of them. The ranges are Telegram's, edges included; a
  number that has lost precision is refused rather than rounded. An identity is the shape an
  account resolves, and carries no access hash: `account.resolve` still supplies that.
  
  `readLink` and `writeLink` do the same for links: usernames, phone numbers, invitations, chat
  folders, messages with their thread, comment and media timestamp, shares, video chats, sticker and
  emoji sets, stories, boosts, bot starts, adding a bot as an administrator, mini apps, attachment
  menus and games, in `t.me`, `<username>.t.me` and `tg:` form. Where Telegram's published syntax is
  silent, a link is read the way its apps read one. Both live in `@yuigram/core`, so a bot uses them
  without loading MTProto.
  
  **A file can be pulled as well as pushed.** `account.downloadIterable(request)` yields chunks in
  file order, and `break` stops the transfer behind it. `downloadTo` could not express that: a sink
  is called and cannot decline the next call, so a caller that had seen enough could only throw.
  The loop is also the backpressure — nothing further is asked for until the chunk in hand has been
  taken. The ranges, retries, reference refresh and migration are the same implementation.
  
  **And several accounts can share one store.** Everything an account keeps now lives under
  `accounts:<name>:`, using the name it already takes — so two accounts pointed at one store no
  longer write over each other's authorization keys, which is what they used to do silently and
  what two default `web()` calls in a page did by construction. Areas separate two names. For the same name opened twice
  — two tabs, one program started twice — the name is taken through whatever exclusive primitive
  the runtime has: `navigator.locks` in a browser, which covers every page of the origin and so
  covers everyone who can reach that origin's storage, and a registry over the process everywhere
  else. The reach is reported rather than assumed, and the area stops accepting writes the moment
  another run takes it, so a write begun before a takeover cannot land after one. Signing out holds
  the area while it clears, and cannot reach another account's keys.
  
  This changes the on-store layout. A store written before areas existed carries nothing saying
  which account it was, so it is refused rather than adopted under whichever name asks first, with
  the prefix it found and where to move it. `docs/storage.md` §4 has the layout and the migration.
  
  **Only one connection may move an account through the update stream.** A client holds several and
  they are indistinguishable on the wire; exactly one — the first main connection to the datacenter
  the account belongs to — is the stream, and a transfer connection, a cache node, a second main
  connection or one to another datacenter is not. Deduplication does not make them into update
  sources: it makes a second copy of a legitimate update harmless, which is a different problem.
  The same rule decides which `new_session_created` is worth chasing a gap for, so a download that
  opened eight connections no longer risks eight catch-ups. `docs/mtproto.md` §9.8 has the
  reasoning.
  
  **The client surface changed.** Registration now selects the context type, so a handler receives
  what its registration proved rather than the weakest case across every update kind. The renames
  are mechanical and nothing was removed without a replacement — `docs/migration.md` lists every
  one.
  
  A bot that uses none of this pays nothing for it in a bundle: a Bot API bundle contains none of
  the MTProto subsystem. Without a bundler, importing `yuigram` loads the account's surface, and its
  connections and schema tables load when an account first connects.
- 596f9de: `mtproxy({ host, port, secret, greetingTimeout? })`, in `yuigram/mtproxy` (`@yuigram/mtproto/mtproxy`),
  is an MTProxy an account is given as its `proxy` option. The secret selects the kind: 16 bytes for
  an obfuscated connection, `dd` for padded frames, `ee` with a domain for fake TLS, whose greeting is
  checked against the secret before anything else is sent. Every connection goes through the proxy,
  the test environment's and media-only ones included, and none falls back to a direct connection;
  `initConnection` names the proxy. A `tg://proxy` link read by `readLink` is accepted too. The secret
  is never written to a description, an error or a log. In a browser `mtproxy()` refuses with
  `ConfigError`, since a proxy is reached over TCP.
- 4e4049c: `UserView.presence` reads a user's status into a state, `onlineUntil` or `lastSeen`, and whether it
  is hidden because this account hides its own; `UserView.mention()` builds text that mentions the
  account, with its access hash where known. Users gain `botManagesBots`, `botHasGuestChat`,
  `botIsGuard`, `linkedCommunityId` and `photoDcId`; chats gain `linkedCommunityId` and `photoDcId`.
- 1ba61f9: A status update says what it brings. `event.presence` on a `mtproto:user_status` event is the
  update's status read as `UserView.presence` reads a user's — `state`, `onlineUntil` and
  `lastSeen` in Unix seconds, `hiddenByMe` — with the user in `event.target`; it is `undefined` on
  every other kind. `readPresence(status)` is the reader both use, exported for a status held on
  its own: it reads the six constructors of the schema, derives no time for a status that states
  none, and answers `undefined` for anything that is not a status.
- d5eda2c: A request Telegram refuses is raised as `RpcError`, a `TelegramError` carrying `code`, `text` —
  Telegram's name for the failure, as sent — and `parameter`, the number a name like
  `PASSWORD_TOO_FRESH_3600` ends in, with the `rpc_error` as its cause. `error.is(pattern)` and
  `isRpcError(error, pattern)` match names exactly or with `%d` for the number; the latter also
  reads the names of waits, which are still raised as `FloodError`. `MigrationError` is now an
  `RpcError` and exported, and both cross a worker as the class they were.
- 942c68e: `serverKeysFromPem(text)` reads the RSA keys Telegram publishes for its datacenters — in either
  PEM form, several to a text — into the `keys` an account needs, each with the fingerprint a
  datacenter names it by. `serverRsaKey({ n, e })` builds one from a modulus and exponent. Neither was
  public before, which left no supported way to give an account the keys it verifies a datacenter
  with.
- db145fe: A service message says what happened in Yuigram's own terms. `readAction()` — also
  `MessageView.serviceAction` and `event.action` on an account's message events — reads each of the
  sixty-eight `messageAction*` constructors into a variant of `ServiceAction`: a `kind` to switch on
  (`'members-added'`, `'joined-by-link'`, `'payment-received'`, `'gift-received'` and the rest),
  camelCase fields, peers as `PeerRef`, notes as formatted text, and the constructor kept as `raw`.
  An action this build has no reading for is `'unsupported'`. `f.action(...kinds)` matches service
  messages by kind and narrows `event.action` to those variants.
- f5130e2: Session strings in the version-3 TL layout other MTProto libraries write can be imported and
  exported: `Account.fromString(text, { ...options, format: 'tl-v3' })`, `account.exportSession({
  format: 'tl-v3' })`, and `readSession` / `writeSession` for converting between layouts. The layout
  is always named; one given the wrong layout is refused with a message saying which it looks like.
  A datacenter address the string carries is added where the bootstrap has none, and the user it
  names is written down as the account's own, with whether it is a bot.
  
  Importing no longer replaces a different authorization the store already holds for the session's
  datacenter: that is refused unless `replace: true` is passed. The same key already stored is used
  as before.
- bb0098f: Sticker sets are read through `StickerSetView`, which reads a set in every form Telegram sends it:
  brief in a list, with or without covers, and full when asked for by itself. It answers the set's
  kind, flags, installation date, link and input reference, pairs each sticker with every emoji the
  set files it under and its keywords, finds stickers by emoji, and builds the download request for
  the set's own picture. It crosses the worker boundary like the other views.
  
  `getStickerSet` and the calls that change a set return the view, which still carries `set`,
  `documents`, `packs` and `keywords`. `getInstalledStickers` and `getMyStickerSets` now return
  views rather than raw `stickerSet` values; the raw value is on `raw`, and `stickerSet`'s snake_case
  fields read as `id`, `accessHash`, `shortName` and the rest.
- 101e74f: One run per MTProto account across processes, over SQLite and Redis. `sqliteStore` and
  `redisStore` lease an area of themselves to one holder at a time — `store.lease(prefix, { holder,
  ttlMs })` — and check the lease in the same atomic step as every write through it: a
  `BEGIN IMMEDIATE` transaction on SQLite, a script on Redis. Every grant is numbered above the
  last, so a run that was paused past its lease, and superseded, has its writes refused by the store
  with `StorageOwnershipError` rather than landing over its successor's.
  
  An account given one of these stores takes its area through the lease as well as the process
  guard, and `AreaLease.scope` reports `'store'`. A second process is refused while the first runs;
  a run that stops frees the area at once; one that dies frees it when its lease lapses, with no
  flag; `takeOverStorage` supersedes a live run, which learns so at its next renewal or write and
  stops. `storageLeaseMs` (30 seconds unless given) sets how long a dead run keeps the next waiting.
  
  `StorageOwnershipError` now lives in `@yuigram/core`, re-exported from `@yuigram/mtproto` as
  before, and comes back as itself across a worker. `canLease()` and the `LeasableKV`,
  `StoreLease` and `LeaseOptions` types describe the capability for other adapters; `namespaced`
  passes it through, `tiered` and `encrypted` do not. `redisStore` takes a `leaseNamespace`,
  `yuigram:lease:` unless given, which must not overlap its `namespace`.
- ea4b45f: `yuigram/testing` tests accounts as well as bots. `mockAccount()` (also `@yuigram/mtproto/testing`) runs
  the real account over a channel answered from a script: `send.message`, `send.service` and
  `send.press` deliver updates, common calls are answered as Telegram would, `rpcError()` refuses one
  as a real refusal is raised, and `calls`, `sent` and `errors` record what happened.
  
  `mockBot()` answers sending, editing and confirming methods without scripting, keeps the messages
  the bot sent in `sent`, presses a real button on one with `send.press`, and collects handler errors
  nothing caught in `errors`. New builders cover chosen inline results, reactions, pre-checkout
  queries, poll answers and join requests.

### Patch Changes

- A version-3 session string whose datacenter host is not valid UTF-8 is refused with
  `SessionError`, as every other malformed string is; it raised the decoder's `TypeError`.
- A temporary key's expiry is kept on this machine's clock, and converted to the server's only
  for the binding. It was written on the server's clock and compared with this one, so with the
  server more than a minute ahead a key was still presented after the server had dropped it,
  which the server answers with a transport `404`. A temporary key stored before this change
  carries no record of its clock and is not reused: a new one is obtained and bound, and the
  permanent key is left in place.
- A connection opened under a stored key hears the server whichever way its clock is off. The
  acceptance window was judged against this machine's clock before the server's had been
  measured, so with the server more than 30 s ahead, or 300 s behind, every answer — and the
  notification that would correct the clock — was refused and no call was answered. The window
  now applies once the session knows the server's clock, which the first message under it
  supplies.
- A container's own identifier is checked like any message's, so a replayed or out-of-window
  container is refused whole before anything in it acts, and one carrying an element not older
  than itself is refused as malformed. The record of identifiers already seen orders them
  unsigned, so from January 2038 a new message is not refused as older than everything retained.
- `serverKeysFromPem` refuses what is not an encoding of an RSA public key — bytes after the key,
  a third number in it, a negative, empty or padded number, an algorithm that is not a sequence
  or that names parameters RSA does not take — instead of reading something close to a key.
- f8a7556: Importing the Bot API and MTProto packages resolves `@yuigram/core` once per package instead of
  once per module, which takes about 16 ms off a cold `import 'yuigram'` in a paired comparison of
  isolated builds. Exports, signatures and the core's runtime identity are unchanged.
- c8fdd1a: Each package ships a small `package.json` in `dist/` saying its files are ES modules, with its
  `browser` substitutions and `sideEffects` rewritten relative to `dist/`, so Node stops looking for
  a module's package one directory up. A cold `import 'yuigram'` is about 13 ms faster in a paired
  comparison of isolated builds. Resolution by package name, export maps, browser substitutions in
  esbuild, webpack and Rollup, and tree shaking are unchanged.
- 3ff86ec: Removing history finishes. `deleteHistory`, `deleteMemberHistory` and `deleteTopicHistory` repeat
  the request while Telegram says more is left, applying each stage's position, where they used to
  stop after the first batch and report success. `deleteHistory` on a channel or supergroup uses the
  channel call, and `previewChat` returns the conversation the name belongs to rather than the first
  one the answer carried.
- 19e3ba7: A plugin whose install throws now fails as `PluginInstallError`, naming the plugin and keeping its
  error as the cause. The plugins installed before it in the same round are disposed, newest first,
  through their new optional `dispose(value, target)`, and anything a disposal throws is kept in
  `cleanup`. The client then stays failed — later updates and `start()` reject with the same error
  — rather than installing again and registering middleware twice.
- 0447cd5: `RpcError.parameter` reads the number a name carries wherever it is — `FILE_REFERENCE_5_EXPIRED`,
  `INTERDC_2_CALL_ERROR` — not only at the end, and `error.argument(pattern)` reads one written
  into a word, such as `…_WAIT_5MIN`. `2FA_CONFIRM_WAIT_N` is now raised as a `FloodError` like the
  other waits, `STATS_MIGRATE_N` as a `MigrationError` of kind `'stats'`, and `RpcError.BAD_REQUEST`,
  `FLOOD` and the rest name Telegram's codes.
- 0a3ad43: An account built without the server keys a datacenter offers is told so on its first call, with a
  `ConfigError` naming the offered fingerprints and `serverKeysFromPem`, instead of retrying the key
  exchange forever while the call waits. The connection fails everyone waiting and arms no retry; the
  next call makes one fresh attempt.
- 4358326: `account.startTest()` builds a test number's code to the length Telegram states when it sends
  the code, and uses the documented five digits only where the answer states no length. A stated
  length that no code could have, or an answer that does not say how the code was sent, is refused
  before a sign-in attempt is spent. The ordinary sign-in steps are unchanged and never build a code.
- b720494: `mockAccount` takes a list as a scripted answer, for methods such as `users.getUsers` that answer
  with one. The `Answer` type now says so, and `Answered` names what a method answers with.

- Updated dependencies
  - @yuigram/core@1.0.0
