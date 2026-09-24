# Formatting, rich messages and streaming

Three entry points, each loaded only by the programs that import it:

| Entry point | What it holds |
| --- | --- |
| `yuigram/markup` | Formatted text: builders, the HTML and MarkdownV2 readers and writers, and the plugin that lets any formatted parameter take it |
| `yuigram/rich` | Rich messages: block and rich-text builders, the `Rich` envelope, and readers for rich Markdown and rich HTML |
| `yuigram/stream` | Streaming a growing text into a chat, as drafts and then messages, over the Bot API or an account |

None of them is reachable from `yuigram`'s main entry point, and the invariants refuse a static
import that would make one so. A bot that formats nothing loads none of this.

## 1. Formatted text

A message with formatting is text and a list of ranges over it. `Formatted` holds exactly that —
the Bot API's `MessageEntity` shape, offsets in UTF-16 code units, which is what a JavaScript
string index is — and everything else in `yuigram/markup` builds one or reads one.

```ts
import { bold, format, html, link, md } from 'yuigram/markup'

const a = format`Hello, ${bold(name)}. ${link('Docs', 'https://example.com')}`
const b = html`Hello, <b>${name}</b>.`
const c = md`Hello, *${name}*\.`
```

**Interpolated values are text.** In every template — `format`, `html`, `md` — a string that is
interpolated is taken as text and never as markup, so a user called `<b>` or `*x*` cannot
format a message. A value built with a builder keeps its formatting. Calling `html` or `md` with a
plain string reads it as markup the developer wrote.

**The readers** follow Telegram's rules for each dialect: MarkdownV2's greedy `__`, its escapes,
its line-based quotations with `**>` and the `||` that collapses one; HTML's tag set and the
character references it accepts. Each reads strictly by default and refuses, with an offset,
what the dialect does not allow. `lenient` keeps it as text instead, and `partial` — for text
that is still arriving — holds back a token that has not finished and closes what is open at the
end without refusing it.

**The writers** produce markup that reads back to the same formatting. Where two ranges cross,
which markup cannot express, one is closed and reopened around the other. MarkdownV2 cannot tell
`_` followed by `__` from `__` followed by `_`, or two quotations on consecutive lines from one,
so an empty pair of markers is written between them, as Telegram's own documentation does.

**The markup plugin.** With `bot.extend(markup())`, any parameter that takes text with entities —
119 of them across 39 methods, listed from the schema rather than by hand — accepts a formatted
value, which is split into the text and its entities field. A formatted value passed together with
`parse_mode` or with explicit entities is refused rather than one of them winning quietly.

**MTProto** has no `parse_mode`: producing the ranges is the client's job. An account's own
`fromHtml`, `fromMarkdown`, `toHtml` and `toMarkdown` do it over TL entities, and the formatted
values above convert to and from them. Tests read the same fixtures through both, and the two
readers agree.

## 2. Rich messages

A rich message is blocks — headings, paragraphs, lists, tables, quotations, media, maps, buttons —
sent in one of three forms: blocks, rich Markdown, or rich HTML.

```ts
import { rich } from 'yuigram/rich'

const report = rich(
  rich.h1('Weekly report'),
  ['Revenue is ', rich.bold('up 12%'), '.'],
  rich.table([['Region', 'Revenue'], ['EU', '1.2M']], { align: ['left', 'right'] }),
)
await bot.api.sendRichMessage({ chat_id, rich_message: report.toInputRichMessage() })
```

Every builder returns the Bot API's own plain data, so a built block can be edited, spread and
mixed with one written by hand. The builders refuse what Telegram refuses: a table wider than 20
columns, a row of more than eight buttons, a map outside its size rules, a button that does
nothing or two things, callback data over 64 bytes.

`rich.markdown` and `rich.html` are template tags: the literal parts are markup, an interpolated
string is escaped, and an interpolated builder or block is written into the dialect. Media named
by a written message — uploads, file ids — are collected and linked by `tg://photo?id=…` as the
dialect requires.

### 2.1 Reading markup into blocks

Telegram reads a rich message's markup itself, and sending the markup as written is the faithful
way to send it. `parseRichMarkdown`, `parseRichHtml` and `Rich#toBlocks` read it here, for
everything else: refusing a mistake before it is sent, converting one form into another — which is
what `toMarkdown()` and `toHtml()` now do for every form — and building on markup somebody wrote.

The readers follow the grammar Telegram documents. The whole of the documentation's HTML example
and of its Markdown example read strictly, into the blocks their text describes. Where the
documentation is silent, what was chosen:

| Question | What the readers do |
| --- | --- |
| Lines written one under another | Read as one line, in both dialects, as the documentation's examples say; `<br>`, or a Markdown line ending in two spaces or a backslash, breaks it |
| `---` under a line of text | A divider. A heading is written with `#` |
| A custom emoji with no alternative text | Kept with an empty one. Markup may leave it out and Telegram fills it in; nothing here knows the emoji |
| Media given as an address | The kind from what the address ends in — a `.gif` is an animation, an `.ogg` a voice note — and from the tag where there is one |
| Footnotes | Numbered in the order defined; a reference links to its footnote showing the number, and the footnotes follow the last block |
| A collage or slideshow in Markdown | Markdown media lines, or — written with `<img>`, `<video>` and `<figcaption>` — HTML |

A strict read also refuses a message over Telegram's limits: 32,768 characters of text, counted
as code points and including custom emoji alternatives and formula source; 500 blocks, counting
nested blocks, list items and table rows; 16 levels of nesting; and 50 media. `measureRich` counts
the same things for blocks built any other way.

What the readers produce is checked three ways: against expectations written with the builders,
which are a separate path; Markdown against HTML over documents that say the same thing; and
blocks written out by the serializers and read back. None of it has been checked against what
Telegram's servers make of the same markup.

## 3. Streaming

`yuigram/stream` shows an answer while it is being written: a draft that grows in the chat —
Telegram's `sendMessageDraft`, or an account's streaming draft — and a message each time a
window fills or the answer ends.

```ts
import { stream } from 'yuigram/stream'

bot.extend(stream({ canStop: true }))

bot.onMessage(async (message) => {
  await message.stream(openai.chat.completions.create({ model, messages, stream: true }), {
    parseMode: 'MarkdownV2',
  })
})
```

[examples/17-streaming](../examples/17-streaming) has a runnable bot and an offline rehearsal.

### 3.1 Sources

A source is whatever the application holds: an async or sync iterable of text or bytes, a web
`ReadableStream`, a Vercel AI SDK result, an event emitter, or the chunks of the OpenAI, Anthropic,
Ollama or LangChain streams. Each is recognised by its shape, so none of those SDKs is a
dependency; a chunk that carries no text — a tool call, a usage report — is skipped. Bytes are
decoded as UTF-8 across chunk boundaries. When a stream stops early its source is let go at once,
even while a read is outstanding: an iterator is returned, a reader cancelled, a listener removed.

### 3.2 What is sent, and when

| Rule | Value |
| --- | --- |
| A window of text | 4,096 UTF-16 code units of the text as it will be shown, Telegram's message limit |
| A window of rich markup | 32,768 code points of the markup, and at most 500 blocks |
| Between two drafts | 250 ms, doubling after each failed draft up to 4 s; a flood wait holds drafts back for as long as Telegram says |
| A draft that lasts | 30 s on the reader's screen; what a draft shows is sent as a message 2 s before it would disappear |
| A final message that fails | Retried only after a flood wait of up to 60 s, at most three times. Anything else is not retried: the message may have been delivered without its answer arriving |

`STREAM_DEFAULTS` and `DEFAULT_LIMITS` export these values. One request is in flight at a time,
which is what keeps the order right: no draft lands after the message that replaces it, and text
that arrived during a request is shown by the next draft rather than queued as one request per
token. The source is read with backpressure: when twice a window is waiting, reading pauses.

A window is cut at a line or word boundary in its second half where there is one, never inside a
character, a grapheme, a custom emoji or a moment, and formatting that is open at the cut is
closed there and reopened in the next window. Rich markup is cut between blocks, closing and
reopening a code fence. A draft of markup that has not finished arriving shows what has; the
final message is read strictly, and if that fails the well-formed formatting is kept and the
problem reported through `onError`, rather than the whole message being sent as plain text.

### 3.3 Ending early

| Ending | Default for what was produced | Result |
| --- | --- | --- |
| The source finishes | Sent | `messages` |
| `signal` aborts | Sent (`onAbort: 'discard'` keeps it back) | `aborted: true`, and `unsent` when discarded |
| The reader presses stop | Discarded (`keepOnStop` sends it) | `stopped: true` |
| The source fails | Sent (`onSourceError: 'discard'` keeps it back), then `StreamSourceError` | the error carries the result |
| A final message fails | — | `StreamSendError`, with the result and the window not sent |

**Who may stop a stream.** A stop arrives as a `stopped_message_generation` update naming a chat
and a draft. It stops a stream only if that stream offered the button, is still running, is in
that chat and thread, and showed that very draft. Draft identities are never reused by one
client, so a stop meant for a stream that has ended reaches nothing, and a stream cannot be
stopped from another chat. A well-formed stop is not authorisation of anything else.

Over MTProto, `streamTo(account, peer, source)` runs the same engine over an account's streaming
drafts. A reader's stop is recognised by the typing update carrying `sendMessageStopDraftAction`
with one of the stream's own draft keys — as the schema describes it; that update has not been
observed from Telegram's servers.

### 3.4 What has been run

The engine against a hand-driven clock and a transport that records every request; the Bot API
plugin through the real HTTP encoding path, against a local server; the MTProto adapter against a
recorded account; and the rehearsal in `examples/17-streaming`. No stream has been sent to
Telegram, and no model provider was called.
